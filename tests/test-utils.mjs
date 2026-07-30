import { test } from '@playwright/test';

// Wraps a test function to capture errors, attach a short stack/message
// and then rethrow so Playwright records the failure (but the suite continues).
export function withErrorCapture(fn) {
  return async ({ page }) => {
    try {
      await fn({ page });
    } catch (err) {
      console.error('Test caught error:', err && err.stack ? err.stack : err);

      try {
        const info = test.info();
        const body = (err && (err.stack || err.message)) ? String(err.stack || err.message) : String(err);
        await info.attach('error', { body, contentType: 'text/plain' });
      } catch (attachErr) {
        console.error('Failed to attach test error:', attachErr);
      }

      throw err;
    }
  };
}

/**
 * Auto-healing: detect Breeze AI's "Oops! Failed to load module" error screen
 * and reload the page so the test can continue.
 *
 * This is page-level healing — it covers SPA chunk-reload errors that happen
 * when the app deploys a new version mid-run. Locator-level healing (element
 * not found) is handled separately in healing/AutoHealer.js.
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [maxAttempts=2]
 * @returns {Promise<boolean>} true if recovery was performed
 */
export async function checkAndRecoverFromAppError(page, maxAttempts = 2) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isErrorPage = await page
      .locator('h1, h2')
      .filter({ hasText: /^Oops/i })
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (!isErrorPage) return false;

    console.log(`[AutoHeal] App error screen detected (attempt ${attempt + 1}) — recovering...`);

    // Prefer the "Reload Page" button on the error screen
    const reloadBtn = page.locator('button').filter({ hasText: /Reload\s+Page/i }).first();
    const hasReloadBtn = await reloadBtn.isVisible({ timeout: 1500 }).catch(() => false);
    if (hasReloadBtn) {
      await reloadBtn.click();
    } else {
      await page.reload({ waitUntil: 'domcontentloaded' });
    }

    await page.waitForTimeout(4000);
    console.log('[AutoHeal] Page reloaded — continuing test');
  }
  return true;
}
