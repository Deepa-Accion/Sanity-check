import { test } from '@playwright/test';

// Wraps a test function to capture errors, attach a short stack/message
// and then rethrow so Playwright records the failure (but the suite continues).
export function withErrorCapture(fn) {
  // For now, support tests that use the common `page` fixture.
  // Playwright requires explicit fixture names in the destructured arg.
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
