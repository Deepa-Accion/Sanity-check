/**
 * Opens a headed browser at the target URL and injects a floating form so you
 * can paste your OIDC key + token JSON directly into the browser.
 * Click "Save & Close" — the script writes session-auth.json and exits.
 *
 * Usage:
 *   node scripts/capture-session.mjs [url]
 *   node scripts/capture-session.mjs http://localhost:5173/
 */

import { chromium } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SESSION_FILE = path.join(ROOT, 'session-auth.json');
const AUTH_FILE    = path.join(ROOT, 'auth.json');

const TARGET = process.argv[2] || process.env.TARGET_URL || 'http://localhost:5173/';

// Read existing session-auth.json to pre-fill the key field
let defaultKey = 'oidc.user:https://login-new.accionbreeze.com/realms/accionlabswebsite:isometric';
let defaultValueHint = '';
try {
  const prev = JSON.parse(await fs.readFile(SESSION_FILE, 'utf8').catch(() => '{}'));
  if (prev.key) defaultKey = prev.key;
} catch { /* ok */ }

console.log('\n' + '═'.repeat(62));
console.log(' PLAYWRIGHT SESSION CAPTURE');
console.log('═'.repeat(62));
console.log(` A browser will open at: ${TARGET}`);
console.log(' A form overlay will appear — paste your OIDC key & token,');
console.log(' then click "Save & Close".');
console.log('');
console.log(' How to get the token from your existing browser:');
console.log('   DevTools → Application → Session Storage → your site');
console.log('   Find the key starting with "oidc.user:" → copy Value');
console.log('═'.repeat(62) + '\n');

const browser = await chromium.launch({
  headless: false,
  args: ['--start-maximized', '--disable-web-security'],
});

const context = await browser.newContext({ viewport: null });
const page = await context.newPage();

// Navigate to the app first so cookies/storage are for the right origin
try {
  await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 15000 });
} catch {
  // Might fail if app isn't serving yet; still inject the form
}

// Inject the session-input overlay
await page.evaluate(({ key, hint }) => {
  // Remove existing overlay if any
  document.getElementById('__pw_session_form__')?.remove();

  const overlay = document.createElement('div');
  overlay.id = '__pw_session_form__';
  overlay.style.cssText = `
    position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;
    background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  `;

  overlay.innerHTML = `
    <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:28px 32px;
                width:620px;max-width:96vw;color:#f1f5f9;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      <h2 style="margin:0 0 4px;font-size:18px;font-weight:700">Playwright Session Capture</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#94a3b8">
        Paste your OIDC sessionStorage key and value JSON, then click <b>Save &amp; Close</b>.
      </p>

      <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;
                    text-transform:uppercase;letter-spacing:.05em">
        SessionStorage Key
      </label>
      <input id="__pw_oidc_key__" type="text" value="${key.replace(/"/g, '&quot;')}"
        style="width:100%;box-sizing:border-box;padding:8px 12px;background:#0f172a;border:1px solid #475569;
               border-radius:6px;color:#f1f5f9;font-size:13px;margin-bottom:16px;outline:none" />

      <label style="display:block;margin-bottom:6px;font-size:12px;font-weight:600;color:#94a3b8;
                    text-transform:uppercase;letter-spacing:.05em">
        Token Value (JSON)
      </label>
      <textarea id="__pw_oidc_val__" rows="10" placeholder='{"access_token":"...","id_token":"...","expires_at":0,...}'
        style="width:100%;box-sizing:border-box;padding:8px 12px;background:#0f172a;border:1px solid #475569;
               border-radius:6px;color:#f1f5f9;font-size:12px;font-family:monospace;resize:vertical;
               margin-bottom:20px;outline:none">${hint}</textarea>

      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button id="__pw_auto_btn__"
          style="padding:9px 16px;background:#1e3a5f;border:1px solid #3b82f6;border-radius:6px;
                 color:#93c5fd;font-size:13px;cursor:pointer">
          Auto-detect from page
        </button>
        <button id="__pw_save_btn__"
          style="padding:9px 20px;background:#1d4ed8;border:none;border-radius:6px;
                 color:#fff;font-size:13px;font-weight:600;cursor:pointer">
          Save &amp; Close
        </button>
      </div>
      <p id="__pw_msg__" style="margin:12px 0 0;font-size:12px;color:#f59e0b;min-height:18px"></p>
    </div>
  `;

  document.body.appendChild(overlay);

  // Auto-detect button: scan existing sessionStorage
  document.getElementById('__pw_auto_btn__').addEventListener('click', () => {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('oidc.user:')) {
        const v = sessionStorage.getItem(k);
        document.getElementById('__pw_oidc_key__').value = k;
        document.getElementById('__pw_oidc_val__').value = v || '';
        document.getElementById('__pw_msg__').textContent = '✓ Found token in sessionStorage!';
        return;
      }
    }
    document.getElementById('__pw_msg__').textContent = 'No oidc.user: key found yet — log in first.';
  });

  // Save button: store result on window so Playwright can read it
  document.getElementById('__pw_save_btn__').addEventListener('click', () => {
    const k = document.getElementById('__pw_oidc_key__').value.trim();
    const v = document.getElementById('__pw_oidc_val__').value.trim();
    if (!k) { document.getElementById('__pw_msg__').textContent = 'Key is required.'; return; }
    if (!v) { document.getElementById('__pw_msg__').textContent = 'Value JSON is required.'; return; }
    try {
      JSON.parse(v);
    } catch {
      document.getElementById('__pw_msg__').textContent = 'Value is not valid JSON.';
      return;
    }
    window.__pw_captured__ = { key: k, value: v };
    document.getElementById('__pw_msg__').textContent = '✓ Saving…';
  });

}, { key: defaultKey, hint: defaultValueHint });

// Poll for the user clicking "Save & Close"
console.log('Browser is open. Fill in the form and click "Save & Close".');
const POLL_MS = 500;
const TIMEOUT_MS = 600_000; // 10 min
const deadline = Date.now() + TIMEOUT_MS;

let captured = null;
while (Date.now() < deadline) {
  try {
    captured = await page.evaluate(() => window.__pw_captured__ || null);
  } catch { /* page may be navigating */ }

  if (captured) break;
  await new Promise(r => setTimeout(r, POLL_MS));
}

if (!captured) {
  console.error('Timed out — no token submitted. Closing browser.');
  await browser.close();
  process.exit(1);
}

let parsedValue;
try {
  parsedValue = JSON.parse(captured.value);
} catch {
  console.error('Token value is not valid JSON. Closing.');
  await browser.close();
  process.exit(1);
}

const sessionData = { key: captured.key, value: parsedValue };

// Also save cookies + localStorage from the context
const storageState = await context.storageState().catch(() => ({ cookies: [], origins: [] }));

await fs.writeFile(SESSION_FILE, JSON.stringify(sessionData, null, 2), 'utf8');
await fs.writeFile(AUTH_FILE, JSON.stringify(storageState, null, 2), 'utf8');

console.log('\n' + '═'.repeat(62));
console.log(' ✓  Session saved!');
console.log(`    Key    : ${captured.key}`);
const exp = parsedValue.expires_at;
if (exp) console.log(`    Expires: ${new Date(exp * 1000).toLocaleString()}`);
console.log(`    Saved  : session-auth.json  auth.json`);
console.log('═'.repeat(62) + '\n');
console.log('Run sanity tests now:');
console.log('  $env:TARGET_URL="http://localhost:5173/" ; npx playwright test tests/sanity.spec.mjs --project=chromium --workers=1\n');

await browser.close();
