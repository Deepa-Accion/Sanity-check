import { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target URL — overridable via env (e.g. for prod runs); defaults to BreezeAI dev
const TARGET_URL = process.env.TARGET_URL || "https://ai.accionbreeze.com/";

// Credentials — overridable via env so CI can inject secrets without code changes
const USERNAME = process.env.BREEZE_USERNAME || "swetha.test@accionlabs.com";
const PASSWORD = process.env.BREEZE_PASSWORD || "D#K8AWj3A";

const AUTH_FILE = path.join(__dirname, "auth.json");

export default async function globalSetup() {
  console.log("[global-setup] Starting browser-based login to", TARGET_URL);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the app root — redirects to /login when not authenticated
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

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
      await page.waitForTimeout(3000);

      console.log("[global-setup] Login successful — landed at:", page.url());
    } else {
      console.log("[global-setup] Already authenticated at", page.url());
    }

    // Persist the full browser state (cookies + localStorage + sessionStorage)
    // so every test starts already logged in via storageState
    await context.storageState({ path: AUTH_FILE });
    console.log("[global-setup] auth.json saved, setup complete.");
  } catch (err) {
    console.error("[global-setup] Login failed:", err.message);
    throw err;
  } finally {
    await browser.close();
  }
}
