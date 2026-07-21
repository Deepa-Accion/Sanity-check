import { test, expect } from "./auth.fixture.mjs";
import {
  DEFAULT_BASE_URL,
  SCENARIO_PLACEHOLDER,
  openViewJourneyPage,
  openScenarioDropdown,
  getSelectedScenarioLabel,
  getScenarioOptionCount,
  selectScenario,
  isDropdownOpen,
  scenarioDropdown,
  journeyDetailsPanel,
  designItemsPanel,
  emptyStateMessage,
} from "../Pages/viewJourneyPage.js";
import { withErrorCapture } from "./test-utils.mjs";

// ---------------------------------------------------------------------------
// Ticket AG-11 — Scenario dropdown regression suite (View Journey page)
//
// Adds regression coverage for the Scenario dropdown on the View Journey page.
// On selection, the journey details and related design items must update
// dynamically (no full page refresh). Maps 1:1 to the attached
// scenario_dropdown_test_cases.csv (TC_001–TC_015).
//
//   Acceptance criteria covered:
//   - Dropdown visible on the View Journey page.                  (TC_001)
//   - Dropdown lists all available scenarios.                     (TC_002)
//   - By default, no scenario is selected.                        (TC_003)
//   - Journey details update on selection.                        (TC_004)
//   - Related design items update on selection.                   (TC_005)
//   - Updates happen dynamically, without a full page refresh.    (TC_006)
//   - Empty state when no scenarios are available.                (TC_007)
//   - Placeholder reads "Select a scenario".                      (TC_008)
//   - Empty state when a scenario has no linked journey.          (TC_009)
//   - Empty state when a scenario has no linked design items.     (TC_010)
//   - Selected scenario persists until changed.                   (TC_011)
//   - Invalid / corrupted scenario data handled gracefully.       (TC_012)
//   - Dropdown closes after selection.                            (TC_013)
//   - Switching scenarios updates both journey and design items.  (TC_014)
//   - Dropdown selection responds within an acceptable time.      (TC_015)
//
// Selectors live in Pages/viewJourneyPage.js and use the repo's tolerant
// multi-fallback style — adjust there if the live DOM differs.
// ---------------------------------------------------------------------------

test.describe("Scenario Dropdown Regression Suite (View Journey page)", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Scenario dropdown regression flow is maintained for Chromium only."
  );

  test.beforeEach("Open the View Journey page", async ({ page }) => {
    await openViewJourneyPage(page);
  });

  // TC_001 — Scenario dropdown is displayed on the View Journey page.
  test(
    "@regression TC_001 Scenario dropdown is displayed on the View Journey page",
    withErrorCapture(async ({ page }) => {
      await expect(scenarioDropdown(page)).toBeVisible({ timeout: 15000 });
    })
  );

  // TC_002 — The dropdown lists all available scenarios.
  test(
    "@regression TC_002 Dropdown lists the available scenarios",
    withErrorCapture(async ({ page }) => {
      const count = await getScenarioOptionCount(page);
      console.log(`[AG-11] Scenario options listed: ${count}`);
      expect(count).toBeGreaterThan(0);
    })
  );

  // TC_003 — By default, no scenario is selected.
  test(
    "@regression TC_003 No scenario is selected by default",
    withErrorCapture(async ({ page }) => {
      const label = await getSelectedScenarioLabel(page);
      console.log(`[AG-11] Default dropdown label: "${label}"`);
      // The trigger should show the placeholder, not a concrete scenario name.
      expect(label.toLowerCase()).toContain(SCENARIO_PLACEHOLDER.toLowerCase());
    })
  );

  // TC_004 — Journey details update when a scenario is selected.
  test(
    "@regression TC_004 Journey details update on scenario selection",
    withErrorCapture(async ({ page }) => {
      const before = await journeyDetailsPanel(page).innerText().catch(() => "");
      const selected = await selectScenario(page, { index: 0 });
      console.log(`[AG-11] Selected scenario: "${selected}"`);

      await expect
        .poll(async () => (await journeyDetailsPanel(page).innerText().catch(() => "")).trim(), {
          timeout: 20000,
        })
        .not.toBe(before.trim());
    })
  );

  // TC_005 — Related design items update when a scenario is selected.
  test(
    "@regression TC_005 Related design items update on scenario selection",
    withErrorCapture(async ({ page }) => {
      const before = await designItemsPanel(page).innerText().catch(() => "");
      await selectScenario(page, { index: 0 });

      await expect
        .poll(async () => (await designItemsPanel(page).innerText().catch(() => "")).trim(), {
          timeout: 20000,
        })
        .not.toBe(before.trim());
    })
  );

  // TC_006 — Scenario data updates dynamically, without a full page refresh.
  test(
    "@regression TC_006 Selection updates dynamically without a full page refresh",
    withErrorCapture(async ({ page }) => {
      // Tag the current document; a full navigation/reload would wipe this flag.
      await page.evaluate(() => {
        window.__ag11NoReloadSentinel = true;
      });

      await selectScenario(page, { index: 0 });
      await page.waitForTimeout(1500);

      const sentinelSurvived = await page.evaluate(() => window.__ag11NoReloadSentinel === true);
      expect(sentinelSurvived).toBe(true);
    })
  );

  // TC_007 — Empty-state message shown when no scenarios are available.
  test(
    "@regression TC_007 Empty-state shown when no scenarios are available",
    withErrorCapture(async ({ page }) => {
      // Simulate an empty scenario source by stubbing the model/list responses.
      await page.route(/scenario|functional|journey/i, async (route) => {
        const url = route.request().url();
        if (/scenario|functional/i.test(url)) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ personas: [], scenarios: [], data: [] }),
          });
        }
        return route.continue();
      });

      await openViewJourneyPage(page);
      await openScenarioDropdown(page).catch(() => {});

      await expect(emptyStateMessage(page)).toBeVisible({ timeout: 15000 });
    })
  );

  // TC_008 — Placeholder text reads "Select a scenario".
  test(
    "@regression TC_008 Dropdown placeholder reads 'Select a scenario'",
    withErrorCapture(async ({ page }) => {
      const label = await getSelectedScenarioLabel(page);
      expect(label).toMatch(new RegExp(SCENARIO_PLACEHOLDER, "i"));
    })
  );

  // TC_009 — Empty-state when the selected scenario has no linked journey.
  test(
    "@regression TC_009 Empty-state when scenario has no linked journey",
    withErrorCapture(async ({ page }) => {
      await page.route(/journey/i, async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ journey: null, flows: [], data: [] }),
        })
      );

      await openViewJourneyPage(page);
      await selectScenario(page, { index: 0 }).catch(() => {});

      await expect(emptyStateMessage(page)).toBeVisible({ timeout: 15000 });
    })
  );

  // TC_010 — Empty-state when the selected scenario has no linked design items.
  test(
    "@regression TC_010 Empty-state when scenario has no linked design items",
    withErrorCapture(async ({ page }) => {
      await page.route(/design/i, async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ designItems: [], components: [], data: [] }),
        })
      );

      await openViewJourneyPage(page);
      await selectScenario(page, { index: 0 }).catch(() => {});

      await expect(emptyStateMessage(page)).toBeVisible({ timeout: 15000 });
    })
  );

  // TC_011 — Selected scenario persists until it is changed.
  test(
    "@regression TC_011 Selected scenario persists until changed",
    withErrorCapture(async ({ page }) => {
      const selected = await selectScenario(page, { index: 0 });
      console.log(`[AG-11] Selected scenario to persist: "${selected}"`);

      // The trigger keeps showing the selection, and it is no longer placeholder.
      const label = await getSelectedScenarioLabel(page);
      expect(label.toLowerCase()).not.toContain(SCENARIO_PLACEHOLDER.toLowerCase());

      // Still selected after some unrelated interaction on the page.
      await page.mouse.click(5, 5);
      await page.waitForTimeout(500);
      expect((await getSelectedScenarioLabel(page)).toLowerCase()).not.toContain(
        SCENARIO_PLACEHOLDER.toLowerCase()
      );
    })
  );

  // TC_012 — Invalid / corrupted scenario data is handled gracefully (no crash).
  test(
    "@regression TC_012 Invalid/corrupted scenario data is handled gracefully",
    withErrorCapture(async ({ page }) => {
      const pageErrors = [];
      page.on("pageerror", (err) => pageErrors.push(err.message));

      // Return malformed / corrupted payloads for scenario-related requests.
      await page.route(/scenario|functional|journey/i, async (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: '{ "personas": [ { "outcomes": [ { "scenarios": [ { "id": null } ',
        })
      );

      await openViewJourneyPage(page);
      await openScenarioDropdown(page).catch(() => {});
      await page.waitForTimeout(1500);

      // App must not white-screen: the dropdown (or an error notice) is still there.
      const dropdownAlive = await scenarioDropdown(page).isVisible().catch(() => false);
      const errorNotice = await emptyStateMessage(page).isVisible().catch(() => false);
      expect(dropdownAlive || errorNotice).toBe(true);

      // No uncaught runtime exception should have bubbled up.
      console.log(`[AG-11] Uncaught page errors: ${JSON.stringify(pageErrors)}`);
      expect(pageErrors).toHaveLength(0);
    })
  );

  // TC_013 — The dropdown closes after a selection is made.
  test(
    "@regression TC_013 Dropdown closes after selection",
    withErrorCapture(async ({ page }) => {
      await selectScenario(page, { index: 0 });
      await page.waitForTimeout(500);
      expect(await isDropdownOpen(page)).toBe(false);
    })
  );

  // TC_014 — Switching to another scenario updates both journey and design items.
  test(
    "@regression TC_014 Switching scenarios updates journey and design items",
    withErrorCapture(async ({ page }) => {
      const optionCount = await getScenarioOptionCount(page);
      test.skip(optionCount < 2, "Needs at least two scenarios to test switching.");

      await selectScenario(page, { index: 0 });
      await page.waitForTimeout(1000);
      const journeyFirst = (await journeyDetailsPanel(page).innerText().catch(() => "")).trim();
      const designFirst = (await designItemsPanel(page).innerText().catch(() => "")).trim();

      await selectScenario(page, { index: 1 });

      await expect
        .poll(async () => (await journeyDetailsPanel(page).innerText().catch(() => "")).trim(), {
          timeout: 20000,
        })
        .not.toBe(journeyFirst);
      await expect
        .poll(async () => (await designItemsPanel(page).innerText().catch(() => "")).trim(), {
          timeout: 20000,
        })
        .not.toBe(designFirst);
    })
  );

  // TC_015 — Dropdown selection responds within an acceptable time (performance).
  test(
    "@regression TC_015 Scenario selection responds within an acceptable time",
    withErrorCapture(async ({ page }) => {
      const before = (await journeyDetailsPanel(page).innerText().catch(() => "")).trim();

      const start = Date.now();
      await selectScenario(page, { index: 0 });
      await expect
        .poll(async () => (await journeyDetailsPanel(page).innerText().catch(() => "")).trim(), {
          timeout: 15000,
        })
        .not.toBe(before);
      const elapsed = Date.now() - start;

      console.log(`[AG-11] Journey refreshed after selection in ${elapsed}ms`);
      expect(elapsed).toBeLessThan(10000);
    })
  );
});
