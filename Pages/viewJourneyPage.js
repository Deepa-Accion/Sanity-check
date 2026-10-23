import { expect } from "@playwright/test";

// ---------------------------------------------------------------------------
// View Journey page — Scenario dropdown helpers (AG-11)
//
// Page Object for the "View Journey" page of the BreezeAI platform. The Scenario
// dropdown lets a user pick a scenario; on selection the journey details and the
// related design items refresh dynamically (no full page reload).
//
// The live DOM for this page is not statically known, so — matching the
// multi-fallback selector convention used elsewhere in this repo (see the AG-7
// chat helpers in projectPage.js) — every locator below is intentionally
// permissive. Adjust the concrete selectors here if the live markup differs;
// the spec that consumes these helpers does not need to change.
// ---------------------------------------------------------------------------

export const DEFAULT_BASE_URL = "https://ai.accionbreeze.com/";

// Placeholder text the dropdown shows when nothing is selected (per AG-11 AC).
export const SCENARIO_PLACEHOLDER = "Select a scenario";

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

/**
 * The Scenario dropdown trigger on the View Journey page. Tries an accessible
 * combobox first, then falls back to text/aria hints around "scenario".
 * @param {import('@playwright/test').Page} page
 */
export function scenarioDropdown(page) {
  return page
    .locator(
      'select[name*="scenario" i], ' +
        '[role="combobox"][aria-label*="scenario" i], ' +
        'button[role="combobox"]:has-text("scenario"), ' +
        'button[aria-haspopup="listbox"]:has-text("scenario"), ' +
        `button:has-text("${SCENARIO_PLACEHOLDER}"), ` +
        '[data-testid*="scenario" i][data-testid*="select" i], ' +
        '[data-testid="scenario-dropdown"]'
    )
    .first();
}

/** The rendered option rows once the dropdown is open. */
export function scenarioOptions(page) {
  return page.locator(
    '[role="option"], [role="listbox"] li, .scenario-option, [data-testid*="scenario-option" i]'
  );
}

/** Container that holds the journey details (refreshes on selection). */
export function journeyDetailsPanel(page) {
  return page
    .locator(
      '[data-testid*="journey-detail" i], [data-testid*="journey-details" i], ' +
        '[class*="journey-detail" i], [class*="journeyDetails" i], ' +
        'section:has-text("Journey"), [aria-label*="journey" i]'
    )
    .first();
}

/** Container that holds the design items related to the selected scenario. */
export function designItemsPanel(page) {
  return page
    .locator(
      '[data-testid*="design-item" i], [data-testid*="design-items" i], ' +
        '[class*="design-item" i], [class*="designItems" i], ' +
        'section:has-text("Design")'
    )
    .first();
}

/** Any empty-state message rendered when there is nothing to show. */
export function emptyStateMessage(page) {
  return page
    .locator(
      '[data-testid*="empty" i], [class*="empty-state" i], [class*="emptyState" i], ' +
        ':text-matches("no (linked )?(journey|design items|scenarios|data)", "i")'
    )
    .first();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Navigate to the View Journey page. If a direct URL is known for the project it
 * is used; otherwise we open the app and walk the Design area to reach the
 * journey view. Returns true when the Scenario dropdown becomes visible.
 * @param {import('@playwright/test').Page} page
 * @param {string} [journeyUrl] optional direct URL to the View Journey page
 */
export async function openViewJourneyPage(page, journeyUrl = null) {
  if (journeyUrl) {
    await page.goto(journeyUrl, { waitUntil: "domcontentloaded" });
  } else {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await navigateToJourneyView(page);
  }

  await page.waitForLoadState("domcontentloaded");
  const dropdown = scenarioDropdown(page);
  const visible = await dropdown.isVisible({ timeout: 15000 }).catch(() => false);
  if (!visible) {
    console.warn(
      "[viewJourneyPage] Scenario dropdown not visible after navigation — " +
        "the View Journey page may not have loaded or selectors need adjusting."
    );
  }
  return visible;
}

/**
 * Best-effort walk from the dashboard into the Design → View Journey view.
 * Uses the same tolerant, click-what-you-find approach as the rest of the repo.
 * @param {import('@playwright/test').Page} page
 */
async function navigateToJourneyView(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);

  const candidates = [
    page.getByRole("link", { name: /View\s+Journey/i }).first(),
    page.getByRole("button", { name: /View\s+Journey/i }).first(),
    page.getByRole("tab", { name: /Journey/i }).first(),
    page.getByRole("button", { name: /User\s+Journey/i }).first(),
    page.locator("a, button, [role='button']").filter({ hasText: /View\s+Journey|User\s+Journey/i }).first(),
  ];

  for (const locator of candidates) {
    const visible = await locator.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      await locator.click().catch(() => {});
      await page.waitForTimeout(1500);
      return true;
    }
  }

  console.warn("[viewJourneyPage] Could not find a 'View Journey' entry point from the dashboard.");
  return false;
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

/** Open the Scenario dropdown so its options render. */
export async function openScenarioDropdown(page) {
  const dropdown = scenarioDropdown(page);
  await expect(dropdown).toBeVisible({ timeout: 15000 });

  // A native <select> does not "open"; only click custom triggers.
  const tag = await dropdown.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
  if (tag !== "select") {
    await dropdown.click();
    await page.waitForTimeout(500);
  }
  return dropdown;
}

/**
 * Read the placeholder / currently-selected label shown on the dropdown trigger.
 * @returns {Promise<string>}
 */
export async function getSelectedScenarioLabel(page) {
  const dropdown = scenarioDropdown(page);
  const tag = await dropdown.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
  if (tag === "select") {
    return (
      await dropdown
        .evaluate((el) => el.options[el.selectedIndex]?.text ?? "")
        .catch(() => "")
    ).trim();
  }
  return (await dropdown.innerText().catch(() => "")).trim();
}

/** Count the scenarios listed in the (opened) dropdown. */
export async function getScenarioOptionCount(page) {
  await openScenarioDropdown(page);
  const count = await scenarioOptions(page).count().catch(() => 0);
  await page.keyboard.press("Escape").catch(() => {});
  return count;
}

/**
 * Select a scenario by visible name (or by index if no name is given).
 * Works for both native <select> and custom listbox dropdowns.
 * @param {import('@playwright/test').Page} page
 * @param {{ name?: string|RegExp, index?: number }} [opts]
 * @returns {Promise<string>} the label of the option that was selected
 */
export async function selectScenario(page, { name = null, index = 0 } = {}) {
  const dropdown = await openScenarioDropdown(page);
  const tag = await dropdown.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");

  if (tag === "select") {
    if (name) {
      await dropdown.selectOption({ label: name instanceof RegExp ? undefined : name });
    } else {
      await dropdown.selectOption({ index: index + 1 }); // +1 to skip placeholder
    }
    return getSelectedScenarioLabel(page);
  }

  const options = scenarioOptions(page);
  const target = name
    ? options.filter({ hasText: name }).first()
    : options.nth(index);
  await expect(target).toBeVisible({ timeout: 10000 });
  const label = (await target.innerText().catch(() => "")).trim();
  await target.click();
  await page.waitForTimeout(1000);
  return label;
}

/** True if the dropdown option list is currently open/expanded. */
export async function isDropdownOpen(page) {
  const listVisible = await scenarioOptions(page)
    .first()
    .isVisible({ timeout: 1000 })
    .catch(() => false);
  if (listVisible) return true;

  const expanded = await scenarioDropdown(page)
    .getAttribute("aria-expanded")
    .catch(() => null);
  return expanded === "true";
}
