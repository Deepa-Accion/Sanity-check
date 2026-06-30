import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import fs from "fs";

const app = express();
const port = process.env.PORT || 3001;
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

app.use(cors());
app.use(express.json());

let testRunInProgress = false;
let currentChild = null;
let lastCustomReportPath = null;
let lastCustomReportDebug = null;

app.post("/api/run-test", async (req, res) => {
  if (testRunInProgress) {
    return res.status(409).json({ error: "A test run is already in progress." });
  }

  const { testType, testScenario, browser, headless, oidcKey, oidcValue } = req.body;

  // Map test scenarios to explicit spec files when possible
  const scenarioMap = {
    'breezeai sanity dev': 'tests/sanity.spec.mjs',
    'breezeai sanity prod': 'tests/sanity_prod.spec.mjs',
    'accionconnect sanity dev': 'tests/sanity_acciondev.spec.mjs',
    'accionconnect sanity prod': 'tests/sanity_accionprod.spec.mjs',
    'breezeai complete regression dev': 'tests/completeregression.spec.mjs'
  };

  const normalizedScenario = (testScenario || '').toLowerCase();
  const specFile = scenarioMap[normalizedScenario] || null;

  if (!specFile && !browser) {
    return res.status(400).json({ error: "Missing testScenario or browser in request body." });
  }

  testRunInProgress = true;
  const logs = [];
  logs.push(`Running scenario: ${testScenario || testType}`);
  if (specFile) logs.push(`Executing spec: ${specFile}`);

  // Build Playwright args: prefer running a specific spec file when mapped, otherwise fall back to using a @tag grep
  let args;
  if (specFile) {
    args = [
      'playwright',
      'test',
      specFile,
      '--project',
      browser,
      '--reporter=json,html'
    ];
  } else {
    const tag = testType || (normalizedScenario.includes('regression') ? 'regression' : 'sanity');
    logs.push(`No specific spec file mapped. Falling back to @${tag} grep.`);
    args = [
      'playwright',
      'test',
      '--grep',
      `@${tag}`,
      '--project',
      browser,
      '--reporter=json,html'
    ];
  }

  // Prepare environment for child process and inject OIDC values if provided
  const childEnv = { ...process.env };
  if (oidcKey) {
    childEnv.OIDC_KEY = oidcKey;
    logs.push('OIDC key provided and forwarded to test runner.');
  }
  if (oidcValue) {
    try {
      // Ensure we forward a JSON string
      childEnv.OIDC_VALUE = typeof oidcValue === 'string' ? oidcValue : JSON.stringify(oidcValue);
      logs.push('OIDC value provided and forwarded to test runner.');
    } catch (e) {
      logs.push('Failed to stringify OIDC value — it will not be forwarded.');
    }
  }

  if (!headless) {
    args.push("--headed");
  }

  const child = spawn(npxCmd, args, {
    shell: true,
    cwd: process.cwd(),
    env: childEnv,
    // detach on POSIX so we can kill the process group (browser children)
    detached: process.platform !== 'win32'
  });
  currentChild = child;
  let stdoutBuffer = '';

  const pushLogs = (chunk, prefix = "") => {
    const text = chunk.toString();
    stdoutBuffer += text;
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => logs.push(prefix ? `${prefix}: ${line}` : line));
  };

  child.stdout.on("data", (data) => pushLogs(data));
  child.stderr.on("data", (data) => pushLogs(data, "stderr"));

  const timeout = setTimeout(() => {
    logs.push("Run timed out after 5 minutes. Killing process.");
    killProcessTree(child);
  }, 5 * 60 * 1000);

  child.on("close", (code) => {
    clearTimeout(timeout);
    testRunInProgress = false;
    const success = code === 0;

    // Check whether Playwright HTML report exists
    const reportPath = path.join(process.cwd(), "playwright-report", "index.html");
    const reportExists = fs.existsSync(reportPath);

    if (!success) {
      logs.push(`Test run exited with code ${code ?? "unknown"}.`);
    } else if (reportExists) {
      logs.push(`HTML report generated at ${reportPath}`);
    }

    // Attempt to produce a custom HTML report by parsing the JSON reporter output (best-effort)
    let customReportAvailable = false;
    try {
      const tryParseJsonFromStdout = (buf) => {
        // Search for candidate JSON substrings and return the first successfully parsed object that looks like Playwright report
        const candidates = [];
        for (let i = 0; i < buf.length; i++) {
          if (buf[i] !== '{') continue;
          for (let j = buf.length - 1; j >= i; j--) {
            if (buf[j] !== '}') continue;
            const snippet = buf.slice(i, j + 1);
            candidates.push(snippet);
          }
        }
        // try longer candidates first
        for (const s of candidates.sort((a,b) => b.length - a.length)) {
          try {
            const parsed = JSON.parse(s);
            // Heuristic: Playwright JSON report usually contains 'suites' or 'suites'/'stats'
            if (parsed && (parsed.suites || parsed.tests || parsed.stats)) return parsed;
          } catch (e) {
            // ignore
          }
        }
        return null;
      };

      // First try to parse JSON directly from stdout
      let parsed = tryParseJsonFromStdout(stdoutBuffer);

      // If that failed, try to read any JSON files under test-results folder (Playwright writes test artifacts there)
      if (!parsed) {
        const testResultsDir = path.join(process.cwd(), 'test-results');
        if (fs.existsSync(testResultsDir)) {
          const walk = (dir) => {
            const items = fs.readdirSync(dir);
            for (const it of items) {
              const full = path.join(dir, it);
              const stat = fs.statSync(full);
              if (stat.isDirectory()) walk(full);
              else if (it.endsWith('.json')) {
                try {
                  const obj = JSON.parse(fs.readFileSync(full, 'utf8'));
                  if (obj && (obj.suites || obj.tests || obj.stats)) return obj;
                } catch (e) {}
              }
            }
            return null;
          };
          parsed = walk(testResultsDir);
        }
      }

      if (parsed) {
        // build a minimal custom report here (summary + per test rows)
        const tests = [];
        const collectTests = (suite) => {
          if (!suite) return;
          // Direct tests on a suite (attach suite-level title/file/line when available)
          if (Array.isArray(suite.tests)) suite.tests.forEach(t => tests.push(Object.assign({}, t, {
            title: t.title || suite.title || '',
            file: t.file || suite.file || null,
            line: t.line || suite.line || null
          })));
          // Specs (Playwright structure may nest tests under specs)
          if (Array.isArray(suite.specs)) {
            suite.specs.forEach(spec => {
              if (Array.isArray(spec.tests)) spec.tests.forEach(t => tests.push(Object.assign({}, t, {
                title: t.title || spec.title || spec.file || '',
                file: t.file || spec.file || suite.file || null,
                line: t.line || spec.line || null
              })));
              // some specs may nest suites as well
              if (Array.isArray(spec.suites)) spec.suites.forEach(s => collectTests(s));
            });
          }
          // Nested suites
          if (Array.isArray(suite.suites)) suite.suites.forEach(s => collectTests(s));
        };

        // Top-level suites
        if (Array.isArray(parsed.suites)) parsed.suites.forEach(s => collectTests(s));
        // support alternate formats
        if (Array.isArray(parsed.tests)) parsed.tests.forEach(t => tests.push(t));
        if (Array.isArray(parsed.entries)) parsed.entries.forEach(e => { if (Array.isArray(e.tests)) e.tests.forEach(t => tests.push(t)); });

        // If tests are empty but parsed has collected raw results in other properties, try to extract
        if (tests.length === 0 && parsed.results && Array.isArray(parsed.results)) {
          parsed.results.forEach(r => {
            if (r && r.result && r.result?.status) {
              tests.push({ title: r.title || r.name || 'Unnamed', results: [r.result] });
            }
          });
        }

        // Helper to normalize status from various possible shapes
        const extractStatus = (t) => {
          if (!t) return 'unknown';
          // Prefer concrete result status if available (e.g., passed/failed)
          if (t.results && t.results.length) {
            const r = t.results[0];
            if (r.status) return r.status;
            if (typeof r.ok === 'boolean') return r.ok ? 'passed' : 'failed';
          }
          // Fallbacks
          if (typeof t.ok === 'boolean') return t.ok ? 'passed' : 'failed';
          if (t.outcome) {
            if (t.outcome === 'expected') return 'passed';
            if (t.outcome === 'unexpected') return 'failed';
            return t.outcome;
          }
          if (t.status) {
            if (t.status === 'expected') return 'passed';
            if (t.status === 'unexpected') return 'failed';
            return t.status;
          }
          return 'unknown';
        };

        const outDir = path.join(process.cwd(), 'custom-reports');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        const reportFilePath = path.join(outDir, `report-${Date.now()}.html`);
        const stats = parsed.stats || {};

        // Compute totals directly from extracted tests (more reliable across Playwright versions)
        const total = tests.length;
        const passed = tests.filter(t => extractStatus(t) === 'passed').length;
        const failed = tests.filter(t => extractStatus(t) === 'failed').length;
        const skipped = tests.filter(t => extractStatus(t) === 'skipped').length;
        const duration = stats.duration ?? null;

        logs.push(`Custom report parsing: suites=${(parsed.suites||[]).length} tests=${tests.length} stats=${JSON.stringify(stats)}`);

        // If no tests were extracted, dump debug artifacts to help diagnose parsing issues
        if (tests.length === 0 && parsed) {
          try {
            const debugDir = path.join(process.cwd(), 'custom-reports', 'debug');
            if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
            const debugPath = path.join(debugDir, `stdout-${Date.now()}.log`);
            fs.writeFileSync(debugPath, stdoutBuffer, 'utf8');
            const parsedPath = path.join(debugDir, `parsed-${Date.now()}.json`);
            fs.writeFileSync(parsedPath, JSON.stringify(parsed, null, 2), 'utf8');
            lastCustomReportDebug = { stdout: debugPath, parsed: parsedPath };
          } catch (e) { logs.push(`Error creating debug artifacts: ${e.message}`); }
        }

        // Strip leading tags like "@sanity" from titles (handles multiple tags e.g. "@a @b Test name")
        const cleanTitle = (s) => String(s || '').replace(/^(?:@[-\w]+\s*)+/, '').trim();

        const rows = tests.map(t => {
          const rawTitle = Array.isArray(t.title) ? t.title.join(' ') : t.title || t._title || t.name || '';
          const title = cleanTitle(rawTitle);
          const file = t.location?.file || (t.entries && t.entries[0] && t.entries[0].file) || (t.result && t.result.file) || null;
          const line = t.location?.line || (t.entries && t.entries[0] && t.entries[0].line) || (t.result && t.result.line) || null;
          const result = (t.results && t.results[0]) || t.result || {};
          const status = extractStatus(t);
          const dur = result.duration ?? t.duration ?? (result.end && result.start ? (result.end - result.start) : null);
          const steps = file ? extractStepsFromFile(path.join(process.cwd(), file), line) : null;

          // Extract an error message/stack snippet when present
          const err = result.error || (t.errors && t.errors[0]) || null;
          let error = null;
          if (err) {
            if (typeof err === 'string') error = err;
            else if (err.message) error = err.message;
            else if (err.stack) error = err.stack.split('\n').slice(0,6).join('\n');
            else error = String(err);
          }

          // Also check attachments for error details if no error found above
          if (!error && result.attachments && Array.isArray(result.attachments)) {
            const errorAttachment = result.attachments.find(a => a.name === 'error');
            if (errorAttachment && errorAttachment.path) {
              try {
                const attachPath = path.join(testResultsDir, errorAttachment.path);
                if (fs.existsSync(attachPath)) {
                  error = fs.readFileSync(attachPath, 'utf8').substring(0, 500);
                }
              } catch (e) {
                console.error('Failed to read error attachment:', e.message);
              }
            }
          }

          // Normalize status for presentation: PASSED, FAILED, SKIPPED
          const displayStatus = (status === 'passed') ? 'PASSED' : (status === 'skipped') ? 'SKIPPED' : 'FAILED';

          return { title, file, line, status, displayStatus, duration: dur, steps, error };
        });

        const escapeHtml = (str) => String(str).replace(/[&<>\"']/g, (s) => (s === '&' ? '&amp;' : s === '<' ? '&lt;' : s === '>' ? '&gt;' : s === '"' ? '&quot;' : '&#39;'));
        const html = [];
        html.push('<!doctype html><html><head><meta charset="utf-8"><title>Custom Test Report</title>');
        html.push('<style>body{font-family:Inter,Arial,sans-serif;margin:24px;color:#222}h1{font-size:20px}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #eee;text-align:left;vertical-align:top}thead th{background:#f6f8fa} .passed{color:#16a34a;font-weight:600}.failed{color:#ef4444;font-weight:600}.skipped{color:#6b7280}.summary{margin-bottom:16px;padding:12px;border-radius:6px;background:#fff} .steps{white-space:pre-wrap;color:#333;background:#f8f9fb;padding:10px;border-radius:6px;border:1px solid #e9eef6;font-size:12px;font-family:monospace;max-height:200px;overflow-y:auto} .error{white-space:pre-wrap;color:#991b1b;background:#fee2e2;padding:10px;border-radius:6px;border:1px solid #fecaca;font-size:12px;font-family:monospace;max-height:200px;overflow-y:auto}</style>');
        html.push('</head><body>');
        html.push(`<h1>Custom Test Report</h1>`);
        html.push('<div class="summary">');
        html.push(`<div><strong>Total:</strong> ${total} &nbsp; <strong>Passed:</strong> ${passed} &nbsp; <strong>Failed:</strong> ${failed} &nbsp; <strong>Skipped:</strong> ${skipped} ${duration ? `<span style="margin-left:12px"><strong>Duration:</strong> ${Math.round(duration/1000)}s</span>` : ''}</div>`);
        html.push(`<div style="margin-top:8px"><strong>Scenario:</strong> ${testScenario || testType} &nbsp; <strong>Browser:</strong> ${browser}</div>`);
        html.push('</div>');

        // If there are failed tests, add a concise failed-tests summary
        if (failed > 0) {
          html.push('<div class="summary" style="border-left:4px solid #ef4444;margin-bottom:12px">');
          html.push('<div style="font-weight:600;color:#ef4444;margin-bottom:8px">Failed tests</div>');
          html.push('<ul>');
          rows.filter(r => r.status === 'failed').forEach(r => {
            html.push(`<li style="margin-bottom:6px"><strong>${escapeHtml(r.title)}</strong><div style="font-size:12px;color:#666">${r.file ? `${escapeHtml(r.file)}:${r.line || ''}` : ''}</div><div style="margin-top:4px;color:#c52929;font-family:monospace;white-space:pre-wrap">${escapeHtml(r.error || 'No error message')}</div></li>`);
          });
          html.push('</ul>');
          html.push('</div>');
        }

        html.push('<table>');
        // Add Error column
        html.push('<thead><tr><th>Test</th><th>Result</th><th>Duration (ms)</th><th>Browser</th><th>Steps</th><th>Details</th></tr></thead>');
        html.push('<tbody>');
        rows.forEach(r => {
          html.push('<tr>');
          html.push(`<td>${escapeHtml(r.title)}${r.file ? `<div style="font-size:12px;color:#666">${escapeHtml(r.file)}:${r.line || ''}</div>` : ''}</td>`);
          // Result: normalized PASSED / FAILED / SKIPPED
          const statusClass = (r.displayStatus === 'PASSED') ? 'passed' : (r.displayStatus === 'FAILED') ? 'failed' : 'skipped';
          html.push(`<td class="${statusClass}">${escapeHtml(r.displayStatus)}</td>`);
          html.push(`<td>${r.duration ?? ''}</td>`);
          html.push(`<td>${browser}</td>`);
          html.push(`<td>${r.steps ? `<div class="steps">${escapeHtml(r.steps)}</div>` : ''}</td>`);

          // Details column: show error and raw status information
          let detailsHtml = '';
          if (r.error) {
            detailsHtml += `<div class="error">${escapeHtml(r.error)}</div>`;
          }
          if (r.status && String(r.status).toLowerCase() !== String(r.displayStatus).toLowerCase()) {
            detailsHtml += `<div style="font-size:12px;color:#666;margin-top:6px">Raw: ${escapeHtml(r.status)}</div>`;
          }
          html.push(`<td>${detailsHtml}</td>`);

          html.push('</tr>');
        });
        html.push('</tbody></table>');
        html.push('</body></html>');
        fs.writeFileSync(reportFilePath, html.join('\n'), 'utf8');
        lastCustomReportPath = reportFilePath;
        customReportAvailable = true;
        logs.push(`Custom report generated at ${reportFilePath}`);
      }
    } catch (e) {
      logs.push(`Failed to parse JSON reporter output: ${e.message}`);
    }
    const reportAvailable = Boolean(success && reportExists);

    res.status(success ? 200 : 500).json({ success, logs, reportAvailable, customReportAvailable, customReportPath: lastCustomReportPath });
  });

  child.on("error", (err) => {
    clearTimeout(timeout);
    testRunInProgress = false;
    currentChild = null;
    logs.push(`Failed to start Playwright: ${err.message}`);
    res.status(500).json({ success: false, logs, error: err.message, reportAvailable: false });
  });
});

// Endpoint: persist provided OIDC key/value into global-setup.js (with backup)
app.post('/api/save-oidc', async (req, res) => {
  try {
    const { oidcKey, oidcValue } = req.body;
    if (!oidcKey || !oidcValue) return res.status(400).json({ error: 'Missing oidcKey or oidcValue in request body.' });

    // Ensure the value is valid JSON/object
    let valueObj = oidcValue;
    if (typeof oidcValue === 'string') {
      try {
        valueObj = JSON.parse(oidcValue);
      } catch (e) {
        return res.status(400).json({ error: 'OIDC value must be valid JSON.' });
      }
    }

    const filePath = path.join(process.cwd(), 'global-setup.js');
    if (!fs.existsSync(filePath)) return res.status(500).json({ error: 'global-setup.js not found on server.' });

    // Make a timestamped backup before modifying
    const backupPath = `${filePath}.bak.${Date.now()}`;
    fs.copyFileSync(filePath, backupPath);

    let content = fs.readFileSync(filePath, 'utf8');

    // Replace defaultOidcKey line
    content = content.replace(/(const\s+defaultOidcKey\s*=\s*)(["'`])[\s\S]*?\2;/, `$1"${oidcKey}";`);

    // Replace defaultOidcValue object — produce pretty-printed JSON
    const valueString = JSON.stringify(valueObj, null, 2);
    // Replace the entire object literal following `const defaultOidcValue =`
    content = content.replace(/(const\s+defaultOidcValue\s*=\s*)\{[\s\S]*?\n\s*\}/, `$1${valueString}`);

    fs.writeFileSync(filePath, content, 'utf8');

    return res.json({ success: true, backup: backupPath });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post('/api/stop-test', (req, res) => {
  // If there's no active process, return success so UI can recover
  if (!currentChild) {
    testRunInProgress = false;
    currentChild = null;
    return res.json({ success: true, message: 'No running process found.' });
  }
  try {
    console.log('Stop requested: attempting to terminate test process tree.');
    killProcessTree(currentChild);
    // Do not flip testRunInProgress immediately; the child 'close' handler will set final state
    currentChild = null;
    return res.json({ success: true, message: 'Stop signal sent to running test (attempting to kill process tree).' });
  } catch (e) {
    console.error('Error while stopping test process:', e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Status endpoint so the UI can poll run state and recover when a run hangs
app.get('/api/run-status', (req, res) => {
  const childPid = currentChild && currentChild.pid ? currentChild.pid : null;
  const customAvailable = Boolean(lastCustomReportPath && fs.existsSync(lastCustomReportPath));
  res.json({
    testRunInProgress: Boolean(testRunInProgress),
    currentChildPid: childPid,
    customReportAvailable: customAvailable,
    customReportPath: lastCustomReportPath,
    lastCustomReportDebug: lastCustomReportDebug
  });
});

// Force-reset run state on the server (best-effort kill + clear flags)
app.post('/api/reset-run', (req, res) => {
  try {
    if (currentChild && currentChild.pid) {
      killProcessTree(currentChild);
    }
    testRunInProgress = false;
    currentChild = null;
    return res.json({ success: true, message: 'Run state reset on server.' });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
});

app.get("/api/tests/report", (req, res) => {
  const reportPath = path.join(
    process.cwd(),
    "playwright-report",
    "index.html"
  );

  if (!fs.existsSync(reportPath)) {
    return res.status(404).send("No report found. Run tests first.");
  }

  res.sendFile(reportPath);
});

// Debug endpoint to get last custom report debug file paths (if any)
app.get('/api/custom-report-debug', (req, res) => {
  if (!lastCustomReportDebug) return res.status(404).json({ error: 'No debug artifacts available.' });
  try {
    const stdout = fs.readFileSync(lastCustomReportDebug.stdout, 'utf8');
    const parsed = JSON.parse(fs.readFileSync(lastCustomReportDebug.parsed, 'utf8'));
    return res.json({ stdoutSnippet: stdout, parsed });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get('/api/tests/custom-report', (req, res) => {
  if (!lastCustomReportPath || !fs.existsSync(lastCustomReportPath)) {
    return res.status(404).send('No custom report found. Run tests first.');
  }
  res.sendFile(lastCustomReportPath);
});

// Helper: kill an entire process tree (cross-platform)
function killProcessTree(child) {
  if (!child || !child.pid) return;
  const pid = child.pid;
  try {
    if (process.platform === 'win32') {
      // Use taskkill to ensure child + descendants are terminated on Windows
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F']);
      killer.on('error', () => {});
    } else {
      // Kill the process group on POSIX systems
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (e) {
        // ignore
      }
      // If still alive after 3s, SIGKILL
      setTimeout(() => {
        try { process.kill(-pid, 'SIGKILL'); } catch (e) { }
      }, 3000);
    }
  } catch (e) {
    try { child.kill('SIGTERM'); } catch (er) {}
  }
}

// Helper to extract JSDoc-style comments from a file near a given line.
const extractStepsFromFile = (file, line) => {
  try {
    if (!file || !fs.existsSync(file)) return null;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split(/\r?\n/);

    // Heuristic: search for a /* ... */ block on the lines immediately preceding the test definition.
    const searchStart = Math.max(0, line - 5); // Look up to 5 lines.
    for (let i = line - 2; i >= searchStart && i >= 0; --i) {
      const trimmedLine = lines[i].trim();
      if (trimmedLine.startsWith('/*') && trimmedLine.endsWith('*/')) {
        return trimmedLine.replace(/\/\*|\*\//g, '').trim();
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
};

// small helper for safe HTML escaping
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (s) => {
    switch (s) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
    }
  });
}

// -------------------- Start server --------------------
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
