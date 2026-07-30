import { test, expect } from "./auth.fixture.mjs";
import {
  DEFAULT_BASE_URL,
  openThemePreferences,
  getSelectedThemeName,
  changeToDifferentTheme,
  selectThemeByName,
  logout,
  login,
} from "../Pages/dashboardPage.js";
import { withErrorCapture } from "./test-utils.mjs";

// ---------------------------------------------------------------------------
// Ticket AG-4 — Theme preference persistence regression suite
//
// Verifies that a user's theme preference is durably retained across a full
// logout / re-login cycle, for both:
//   Case 1: a newly selected theme persists after logout.
//   Case 2: reverting to the original theme persists after logout (i.e. the
//           intermediate changed theme is NOT the one that is persisted).
//
// Builds on the existing "@sanity Theme Change" sanity check, which only covers
// switching the theme within a single session.
// ---------------------------------------------------------------------------

test.describe("Theme Persistence Regression Suite", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Theme persistence regression flow is maintained for Chromium only."
  );

  test.beforeEach("Open application", async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  });

  // Test Case 1 — theme change persists after logout/login.
  test(
    "@regression Verify theme change persists after logout (Dev regression check)",
    withErrorCapture(async ({ page }) => {
      // Access user profile settings and change the theme.
      await openThemePreferences(page);
      const { original, changed } = await changeToDifferentTheme(page);
      console.log(`Theme changed from "${original}" to "${changed}"`);
      expect(changed).not.toBe(original);

      // Complete logout, then log back in.
      await logout(page);
      await login(page);

      // Confirm the newly selected theme is still applied post-login.
      await openThemePreferences(page);
      const persisted = await getSelectedThemeName(page);
      console.log(`Theme after re-login: "${persisted}" (expected "${changed}")`);
      expect(persisted).toBe(changed);
    })
  );

  // Test Case 2 — reverting to the original theme persists after logout/login.
  test(
    "@regression Verify theme revert persists after logout (Dev regression check)",
    withErrorCapture(async ({ page }) => {
      // Access user profile settings and change the theme.
      await openThemePreferences(page);
      const { original, changed } = await changeToDifferentTheme(page);
      console.log(`Theme changed from "${original}" to "${changed}"`);
      expect(changed).not.toBe(original);

      // Revert back to the original theme and confirm the revert applied.
      await openThemePreferences(page);
      await selectThemeByName(page, original);
      await openThemePreferences(page);
      const reverted = await getSelectedThemeName(page);
      console.log(`Theme reverted to: "${reverted}" (expected "${original}")`);
      expect(reverted).toBe(original);

      // Complete logout, then log back in.
      await logout(page);
      await login(page);

      // Confirm the original theme — not the intermediate change — persists.
      await openThemePreferences(page);
      const persisted = await getSelectedThemeName(page);
      console.log(`Theme after re-login: "${persisted}" (expected "${original}")`);
      expect(persisted).toBe(original);
      expect(persisted).not.toBe(changed);
    })
  );
});
