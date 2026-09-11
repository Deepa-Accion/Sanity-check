import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '..', 'custom-reports');

export default class HealingReporter {
  constructor() {
    this._results = [];
    this._startTime = null;
    this._reportFile = null;
  }

  onBegin(_config, _suite) {
    this._startTime = new Date();
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    this._reportFile = path.join(REPORTS_DIR, `report-${Date.now()}.html`);
  }

  onTestEnd(test, result) {
    const location = test.location;
    this._results.push({
      title: test.titlePath().filter(Boolean).join(' › '),
      file: location?.file,
      line: location?.line,
      column: location?.column,
      status: result.status,
      duration: result.duration,
      error: result.error?.message,
    });
  }

  onEnd(_result) {
    const passed  = this._results.filter(r => r.status === 'passed').length;
    const failed  = this._results.filter(r => r.status === 'failed').length;
    const skipped = this._results.filter(r => r.status === 'skipped').length;
    const total   = this._results.length;
    const duration = ((Date.now() - this._startTime) / 1000).toFixed(1);
    const failedTests = this._results.filter(r => r.status === 'failed');

    if (failedTests.length > 0) {
      console.log('[HealingReporter] Failed tests:');
      for (const failedTest of failedTests) {
        const location = failedTest.file
          ? ` (${failedTest.file}:${failedTest.line})`
          : '';
        console.log(`  - ${failedTest.title}${location}`);
      }
    }

    const rows = this._results.map(r => `
      <tr>
        <td>${escHtml(r.title)}</td>
        <td class="status ${r.status}">${r.status.toUpperCase()}</td>
        <td>${(r.duration / 1000).toFixed(2)}s</td>
        <td>${r.error ? `<pre>${escHtml(r.error.slice(0, 400))}</pre>` : '—'}</td>
      </tr>`).join('');

    const failedSummary = failedTests.length > 0 ? `
  <section class="failures">
    <h2>Failed Tests</h2>
    <ul>${failedTests.map(r => {
      const location = r.file ? ` (${r.file}:${r.line})` : '';
      return `<li><strong>${escHtml(r.title)}</strong>${escHtml(location)}</li>`;
    }).join('')}</ul>
  </section>` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sanity Test Report — ${new Date().toLocaleString()}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:24px;background:#f4f6f8;color:#222}
    h1{margin-bottom:4px}p{margin:0 0 16px;color:#555}
    .summary{display:flex;gap:16px;margin-bottom:24px}
    .card{padding:14px 24px;border-radius:8px;color:#fff;font-size:1.15em;font-weight:700;min-width:80px;text-align:center}
    .card.total{background:#1976d2}.card.passed{background:#388e3c}.card.failed{background:#d32f2f}.card.skipped{background:#f57c00}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.12)}
    th{background:#37474f;color:#fff;padding:11px 14px;text-align:left;font-weight:600}
    td{padding:9px 14px;border-bottom:1px solid #eee;vertical-align:top}
    tr:last-child td{border:none}
    .status.passed{color:#388e3c;font-weight:700}.status.failed{color:#d32f2f;font-weight:700}.status.skipped{color:#f57c00;font-weight:700}
    .failures{margin:0 0 24px;padding:14px 18px;background:#ffebee;border-left:4px solid #d32f2f;border-radius:4px}.failures h2{margin:0 0 8px;color:#b71c1c;font-size:1.1em}.failures ul{margin:0;padding-left:22px}.failures li{margin:5px 0}
    pre{margin:0;font-size:.82em;white-space:pre-wrap;word-break:break-all}
  </style>
</head>
<body>
  <h1>Sanity Test Report</h1>
  <p>Generated: ${new Date().toLocaleString()} &nbsp;|&nbsp; Duration: ${duration}s</p>
  <div class="summary">
    <div class="card total">Total<br>${total}</div>
    <div class="card passed">Passed<br>${passed}</div>
    <div class="card failed">Failed<br>${failed}</div>
    <div class="card skipped">Skipped<br>${skipped}</div>
  </div>
  ${failedSummary}
  <table>
    <thead><tr><th>Test</th><th>Status</th><th>Duration</th><th>Error</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

    fs.writeFileSync(this._reportFile, html, 'utf-8');
    fs.writeFileSync(path.join(REPORTS_DIR, 'latest-custom-report.html'), html, 'utf-8');
    console.log(`[HealingReporter] Report → ${this._reportFile}`);
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
