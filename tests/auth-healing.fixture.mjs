import { test as base, expect } from "@playwright/test";
import fs from "fs";
import { collectPage } from "../healing/PageCollector.js";

let sessionAuth = null;
try {
  const jsonPath = new URL("../session-auth.json", import.meta.url);
  const raw = fs.readFileSync(jsonPath, "utf-8");
  sessionAuth = JSON.parse(raw);
} catch {
  console.warn("[auth-healing.fixture] session-auth.json not found — running without session injection.");
}

const test = base.extend({
  page: async ({ page }, use) => {
    if (process.env.LOCALHOST_RUN !== "true" && sessionAuth?.key && sessionAuth?.value) {
      await page.addInitScript(({ key, value }) => {
        try {
          const v = typeof value === "string" ? value : JSON.stringify(value);
          window.sessionStorage.setItem(key, v);
        } catch (e) {
          console.error("[auth-healing.fixture] Failed to set sessionStorage auth", e);
        }
      }, { key: sessionAuth.key, value: sessionAuth.value });
    }

    await page.addInitScript(() => {
      try { document.documentElement.style.zoom = '100%'; } catch (e) {}
    });

    await use(page);
  },
});

export { test, expect };

/**
 * Snapshot the current page DOM for auto-healing reference.
 * Call this after each navigation in beforeEach.
 * @param {import('@playwright/test').Page} page
 * @param {string} [name] - label stored under PageData/{name}.json (defaults to test title)
 */
export async function collectPageData(page, name) {
  try {
    const label = name || 'page';
    await collectPage(page, label);
  } catch (err) {
    console.warn('[collectPageData] Snapshot failed (non-fatal):', err?.message);
  }
}
