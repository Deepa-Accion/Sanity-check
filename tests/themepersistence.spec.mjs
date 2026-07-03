import { test, expect } from "./auth.fixture.mjs";
import {
  menuItemClick,
  logout,
  openThemesSubmenu,
  getSelectedThemeName,
  selectThemeByName,
  changeToDifferentTheme,
  readActiveTheme,
  relogin
} from "../Pages/dashboardPage.js";
import { withErrorCapture } from "./test-utils.mjs";

const BASE_URL = "https://ai.accionbreeze.com/";

/**
 * AG-4 - Regression coverage for theme change persistence.
 *
 * User story:
 *   As a user, when I change the theme from my profile, I want the theme to
 *   persist after logout so that my preference is retained.
 *   As a user, when I change the theme and then switch back to the original,
 *   I want the original theme to persist after logout.
 */
test.describe("AG-4 Theme Change Persistence", () => {
  // Tests mutate shared app-level theme state, so run them in order.
  test.describe.configure({ mode: "serial" });

  test.skip(({ browserName }) => browserName !== "chromium", "Theme persistence flow is maintained for Chromium only.");

  test.beforeEach("Launch dashboard", async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  });

  test(
    "@regression Case1 - Changed theme persists after logout",
    withErrorCapture(async ({ page }) => {
      // 1. Change the theme from profile.
      await menuItemClick(page);
      await openThemesSubmenu(page);
      const { original, selected } = await changeToDifferentTheme(page);
      expect(selected, "A different theme should have been selected").not.toBe(original);

      // UI behaviour: the newly selected theme is immediately reflected as active.
      const activeAfterChange = await readActiveTheme(page);
      expect(activeAfterChange).toBe(selected);

      // 2. Logout.
      await menuItemClick(page);
      await logout(page);

      // 3. Log back in (session re-injected on navigation).
      await relogin(page);

      // 4. Verify the same theme persists.
      const persistedTheme = await readActiveTheme(page);
      expect(persistedTheme, "Selected theme should persist after logout").toBe(selected);
      // Error-handling / negative guard: it must not silently revert to the original.
      expect(persistedTheme, "Theme must not revert to the pre-change value").not.toBe(original);
    })
  );

  test(
    "@regression Case2 - Switching back to the original theme persists after logout",
    withErrorCapture(async ({ page }) => {
      // 1. Capture the starting theme, then change to a different one.
      await menuItemClick(page);
      await openThemesSubmenu(page);
      const { original, selected } = await changeToDifferentTheme(page);
      expect(selected).not.toBe(original);

      // 2. Switch back to the original theme.
      await menuItemClick(page);
      await openThemesSubmenu(page);
      await selectThemeByName(page, original);
      const activeAfterSwitchBack = await readActiveTheme(page);
      expect(activeAfterSwitchBack, "Theme should be back to the original").toBe(original);

      // 3. Logout.
      await menuItemClick(page);
      await logout(page);

      // 4. Log back in.
      await relogin(page);

      // 5. Verify the original theme persists.
      const persistedTheme = await readActiveTheme(page);
      expect(persistedTheme, "Original theme should persist after logout").toBe(original);
      expect(persistedTheme, "Theme must not remain on the intermediate selection").not.toBe(selected);
    })
  );

  test(
    "@regression Selected theme is highlighted as the active option in the menu",
    withErrorCapture(async ({ page }) => {
      // UI behaviour validation: exactly one theme is marked active via span.text-primary.
      await menuItemClick(page);
      await openThemesSubmenu(page);

      const activeMarker = page.locator('div[role="menuitem"] span.text-primary');
      await expect(activeMarker).toHaveCount(1);

      const activeName = await getSelectedThemeName(page);
      expect(activeName, "Active theme name should be resolvable").toBeTruthy();
      console.log(`Active theme reported by menu: ${activeName}`);
    })
  );
});
