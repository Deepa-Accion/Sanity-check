import { chromium } from "@playwright/test";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target URL — overridable via env (e.g. for prod runs); defaults to BreezeAI dev
const TARGET_URL = process.env.TARGET_URL || "https://ai.accionbreeze.com/";

// Credentials — overridable via env so CI can inject secrets without code changes
const USERNAME = process.env.BREEZE_USERNAME || "swetha.test@accionlabs.com";
const PASSWORD = process.env.BREEZE_PASSWORD || "D#K8AWj3A";

const AUTH_FILE         = path.join(__dirname, "auth.json");
const SESSION_AUTH_FILE = path.join(__dirname, "session-auth.json");

export default async function globalSetup() {
  console.log("[global-setup] Starting browser-based login to", TARGET_URL);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  try {
    // Navigate to the app root.
    // IMPORTANT: the SPA uses client-side routing — it lands at "/" on domcontentloaded
    // then React mounts and redirects to /login when there is no valid session.
    // We MUST wait for that redirect to settle before checking the URL.
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3000); // allow React to mount + perform the /login redirect

    if (page.url().includes("/login")) {
      console.log("[global-setup] Redirected to login — performing login flow...");

      // Click "Sign in with Breeze AI" to reach the Keycloak credential form
      await page
        .locator('button:has-text("Sign in with Breeze AI"), a:has-text("Sign in with Breeze AI")')
        .click({ timeout: 15000 });

      // Wait for the Keycloak login page to load
      await page.waitForURL(/login-new\.accionbreeze\.com/, { timeout: 15000 });

      // Fill in credentials
      await page.fill("#username, input[name='username']", USERNAME);
      await page.fill("#password, input[name='password']", PASSWORD);

      // Submit — Keycloak uses id="kc-login" or button[name="login"]
      await page.click("#kc-login, button[name='login'], button[type='submit']");

      // Wait for OIDC callback and redirect back to the app
      await page.waitForURL(/ai\.accionbreeze\.com/, { timeout: 30000 });

      // Allow the OIDC callback + React app initialisation to settle
      await page.waitForTimeout(5000);

      console.log("[global-setup] Login successful — landed at:", page.url());
    } else {
      console.log("[global-setup] Already authenticated at", page.url());
    }

    // ── Capture the live OIDC token from sessionStorage ──────────────────────
    // The fixture (auth-healing.fixture.mjs) injects this token into every page
    // so tests run authenticated.  We refresh it on every setup run so it never
    // goes stale (the old "capture-session" manual step is no longer needed).
    const oidcEntry = await page.evaluate(() => {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith("oidc.user:")) {
          try {
            return { key: k, value: JSON.parse(sessionStorage.getItem(k)) };
          } catch { /* skip malformed entries */ }
        }
      }
      return null;
    });

    if (oidcEntry && oidcEntry.value?.access_token) {
      await fs.writeFile(SESSION_AUTH_FILE, JSON.stringify(oidcEntry), "utf8");
      const exp = oidcEntry.value.expires_at;
      console.log(
        `[global-setup] session-auth.json refreshed` +
        (exp ? ` (token expires ${new Date(exp * 1000).toISOString()})` : "")
      );
    } else {
      console.warn(
        "[global-setup] OIDC token not found in sessionStorage — " +
        "session-auth.json was NOT updated.  Run 'npm run capture-session' manually."
      );
    }

    // Persist cookies + localStorage (sessionStorage is not serialisable by
    // Playwright, which is why we capture it separately above).
    await context.storageState({ path: AUTH_FILE });
    console.log("[global-setup] auth.json saved, setup complete.");
  } catch (err) {
    console.error("[global-setup] Login failed:", err.message);
    throw err;
  } finally {
    await browser.close();
  }
}
