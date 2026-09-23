import { chromium } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_URL = process.env.TARGET_URL || "https://ai.accionbreeze.com/";
const PROD_RUN   = process.env.PROD_RUN   === "true";
const SKIP_OIDC  = process.env.SKIP_OIDC  === "true";

// Credentials — set via environment variables; no hardcoded fallbacks.
// Required: BREEZE_USERNAME, BREEZE_PASSWORD
// Optional role overrides: BREEZE_USERNAME_ADMIN, BREEZE_PASSWORD_ADMIN,
//                          BREEZE_USERNAME_VIEWER, BREEZE_PASSWORD_VIEWER
const USERNAME = process.env.BREEZE_USERNAME;
const PASSWORD = process.env.BREEZE_PASSWORD;

// Admin credentials — fall back to default user if role-specific vars are not set
const USERNAME_ADMIN = process.env.BREEZE_USERNAME_ADMIN || process.env.BREEZE_USERNAME;
const PASSWORD_ADMIN = process.env.BREEZE_PASSWORD_ADMIN || process.env.BREEZE_PASSWORD;

// Viewer credentials — fall back to default user if role-specific vars are not set
const USERNAME_VIEWER = process.env.BREEZE_USERNAME_VIEWER || process.env.BREEZE_USERNAME;
const PASSWORD_VIEWER = process.env.BREEZE_PASSWORD_VIEWER || process.env.BREEZE_PASSWORD;

const AUTH_FILE              = path.join(__dirname, "auth.json");
const SESSION_AUTH_FILE      = path.join(__dirname, "session-auth.json");
const SESSION_AUTH_ADMIN_FILE  = path.join(__dirname, "session-auth-admin.json");
const SESSION_AUTH_VIEWER_FILE = path.join(__dirname, "session-auth-viewer.json");

async function loginAndCaptureSession(browser, { username, password, sessionFile, label }) {
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000);

    if (page.url().includes("/login")) {
      console.log(`[global-setup:${label}] Redirected to login — performing login flow...`);

      await page
        .locator('button:has-text("Sign in with Breeze AI"), a:has-text("Sign in with Breeze AI")')
        .click({ timeout: 15000 });

      await page.waitForURL(/login-new\.accionbreeze\.com/, { timeout: 15000 });
      await page.fill("#username, input[name='username']", username);
      await page.fill("#password, input[name='password']", password);
      await page.click("#kc-login, button[name='login'], button[type='submit']");
      await page.waitForURL(/ai\.accionbreeze\.com/, { timeout: 30000 });
      await page.waitForTimeout(5000);
      console.log(`[global-setup:${label}] Login successful — landed at:`, page.url());
    } else {
      console.log(`[global-setup:${label}] Already authenticated at`, page.url());
    }

    const oidcEntry = await page.evaluate(() => {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith("oidc.user:")) {
          try { return { key: k, value: JSON.parse(sessionStorage.getItem(k)) }; } catch {}
        }
      }
      return null;
    });

    if (oidcEntry?.value?.access_token) {
      await fs.writeFile(sessionFile, JSON.stringify(oidcEntry), "utf8");
      const exp = oidcEntry.value.expires_at;
      console.log(
        `[global-setup:${label}] ${path.basename(sessionFile)} saved` +
        (exp ? ` (expires ${new Date(exp * 1000).toISOString()})` : "")
      );
    } else {
      console.warn(`[global-setup:${label}] OIDC token not found — ${path.basename(sessionFile)} not updated.`);
    }

    return context;
  } catch (err) {
    console.error(`[global-setup:${label}] Login failed:`, err.message);
    await context.close();
    throw err;
  }
}

export default async function globalSetup() {
  // Manual-auth mode: session-auth.json was pre-populated by the server with the
  // user-supplied key + token. Skip the browser-based OIDC login entirely.
  if (PROD_RUN || SKIP_OIDC) {
    console.log("[global-setup] Manual-auth mode detected — skipping OIDC browser login.");
    console.log("[global-setup] Using pre-loaded credentials from session-auth.json for", TARGET_URL);
    return;
  }

  console.log("[global-setup] Starting browser-based login to", TARGET_URL);
  const browser = await chromium.launch({ headless: true });

  try {
    // ── Default user ──────────────────────────────────────────────────────────
    const defaultContext = await loginAndCaptureSession(browser, {
      username: USERNAME, password: PASSWORD,
      sessionFile: SESSION_AUTH_FILE, label: "default",
    });
    // Save cookies + localStorage as the shared Playwright storage state
    await defaultContext.storageState({ path: AUTH_FILE });
    console.log("[global-setup] auth.json saved.");
    await defaultContext.close();

    // ── Admin user ────────────────────────────────────────────────────────────
    if (USERNAME_ADMIN !== USERNAME || PASSWORD_ADMIN !== PASSWORD) {
      const adminContext = await loginAndCaptureSession(browser, {
        username: USERNAME_ADMIN, password: PASSWORD_ADMIN,
        sessionFile: SESSION_AUTH_ADMIN_FILE, label: "admin",
      });
      await adminContext.close();
    } else {
      await fs.copyFile(SESSION_AUTH_FILE, SESSION_AUTH_ADMIN_FILE);
      console.log("[global-setup] Admin creds same as default — session-auth-admin.json copied.");
    }

    // ── Viewer user ───────────────────────────────────────────────────────────
    if (USERNAME_VIEWER !== USERNAME || PASSWORD_VIEWER !== PASSWORD) {
      const viewerContext = await loginAndCaptureSession(browser, {
        username: USERNAME_VIEWER, password: PASSWORD_VIEWER,
        sessionFile: SESSION_AUTH_VIEWER_FILE, label: "viewer",
      });
      await viewerContext.close();
    } else {
      await fs.copyFile(SESSION_AUTH_FILE, SESSION_AUTH_VIEWER_FILE);
      console.log("[global-setup] Viewer creds same as default — session-auth-viewer.json copied.");
    }

    console.log("[global-setup] All role sessions saved — setup complete.");
  } catch (err) {
    console.error("[global-setup] Setup failed:", err.message);
    throw err;
  } finally {
    await browser.close();
  }
}
