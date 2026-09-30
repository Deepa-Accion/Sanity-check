import { expect } from "@playwright/test";
import { createProject, DEFAULT_BASE_URL, projectCard } from "../../Pages/dashboardPage.js";
import { ProjectPage } from "../../Pages/projectPage.js";
import { uploadFirstpdfDocument, generateFunctionalOntology } from "../../Pages/knowlegeBase.js";
import { CreateProjectPage } from "../../Pages/createProjectFile.js";

// Counter to ensure uniqueness even when Date.now() returns the same value
let uniqueCounter = 0;
export const getUniqueSuffix = () => `${Date.now()}-${++uniqueCounter}`;

export const uniqueProjectName = (suffix) =>
  `Playwright-CreateProject-${suffix}-${getUniqueSuffix()}`;

/**
 * Build a unique tag value. Tag length stays within the app's 50-character
 * limit so tags generated here never collide with the over-length scenario.
 */
export const uniqueTag = (suffix) => `Tag-${suffix}-${getUniqueSuffix()}`;

/**
 * Build a project name of an exact total length (used for max-length cases).
 * The tail is padded deterministically so the result is always `length` chars.
 */
export const fixedLengthProjectName = (suffix, length) => {
  const base = `${suffix}${getUniqueSuffix()}`;
  return base.length >= length ? base.slice(0, length) : base + "A".repeat(length - base.length);
};

export async function openCreateProject(page) {
  await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  const createProjectPage = new CreateProjectPage(page);
  await createProjectPage.open();
  return createProjectPage;
}

// ============================================================
// Generic listing / search / tab helpers
// ============================================================

/**
 * Read the project name rendered on a project card.
 *
 * A card can be in the DOM and "visible" before React has populated its text,
 * so an immediate innerText() can return "". Poll until a non-empty name is
 * rendered rather than reading a blank snapshot.
 */
export async function getProjectCardName(card, timeout = 20000) {
  if (!card) return "";

  let name = "";
  await expect
    .poll(
      async () => {
        const lines = (await card.innerText())
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        name = lines[0] || "";
        return name;
      },
      { timeout, message: "Expected the project card to render a project name" }
    )
    .not.toBe("");

  return name;
}

/**
 * Return the first visible project card, or null when the list stays empty.
 * Waits for the async listing to render before deciding the list is empty â€”
 * an immediate `count()` check reports 0 while the cards are still loading.
 */
export async function getFirstProjectCard(page, timeout = 30000) {
  const card = page.locator("article").first();
  try {
    await expect(card).toBeVisible({ timeout });
    return card;
  } catch {
    return null;
  }
}

export async function getProjectListSearchInput(page) {
  const input = page.getByRole("textbox", { name: /search projects/i }).first();
  await expect(input).toBeVisible({ timeout: 20000 });
  return input;
}

export async function typeProjectSearch(page, value) {
  const input = await getProjectListSearchInput(page);
  await input.fill(value);
  return input;
}

/**
 * Capture any script dialogs raised while running an action, so
 * stored-XSS style scenarios can assert that nothing executed.
 */
export async function captureScriptDialogs(page) {
  const dialogs = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  return dialogs;
}

export async function isProjectTabSelected(page, tabName) {
  const tab = page.getByRole("button", { name: tabName, exact: true }).first();
  if (!(await tab.isVisible().catch(() => false))) return false;
  return /active|selected|bg-primary/i.test((await tab.getAttribute("class")) || "");
}

export async function selectProjectTab(page, tabName) {
  const tab = page.getByRole("button", { name: tabName, exact: true }).first();
  await expect(tab).toBeVisible({ timeout: 20000 });
  await tab.dispatchEvent("click");
  await expect.poll(() => isProjectTabSelected(page, tabName), { timeout: 10000 }).toBe(true);
}

export async function isProfileMenuVisible(page) {
  return page.getByRole("menu").last().isVisible().catch(() => false);
}

export async function openProfileMenu(page) {
  await page.getByRole("button", { name: /user profile menu/i }).click();
  await expect(page.getByRole("menu").last()).toBeVisible();
}

/** The profile-menu trigger button, without opening the menu. */
export function profileMenuTrigger(page) {
  return page.getByRole("button", { name: /user profile menu/i });
}

export async function isProfileMenuTriggerVisible(page) {
  try {
    await expect(profileMenuTrigger(page)).toBeVisible({ timeout: 20000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * The filter dropdown (Author / Tags) currently open on the listing.
 */
export function filterDropdown(page) {
  return page.getByRole("menu").last();
}

export async function isFilterDropdownVisible(page) {
  return filterDropdown(page).isVisible().catch(() => false);
}

export async function waitForFilterDropdownOpen(page) {
  await expect(filterDropdown(page)).toBeVisible();
}

export async function waitForFilterDropdownClosed(page) {
  await expect(filterDropdown(page)).toBeHidden();
}

/**
 * Assert that none of the given patterns are exposed as nav links/buttons.
 * Used to prove admin-only controls are absent for an End User session.
 */
export async function expectNoControlsMatching(page, patterns) {
  for (const pattern of patterns) {
    const name = new RegExp(pattern, "i");
    await expect(page.getByRole("link", { name })).toHaveCount(0);
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
}

/**
 * Search the active listing for `name` and report whether the card is present.
 *
 * Uses the project's full name as the search term, so the result is
 * pagination-independent. Polling (rather than a single `isVisible()`) is
 * required: the listing renders asynchronously, and a one-shot snapshot taken
 * right after `goto` reports "absent" for a project that is still loading,
 * which would silently skip cleanup.
 *
 * The return value is deliberately THREE-STATE so that an unusable page is
 * never mistaken for "project absent":
 *   true  - the card was confirmed present
 *   false - the listing rendered and the card was confirmed absent
 *   null  - the listing never rendered, so presence is UNKNOWN
 *
 * A `null` result MUST be treated as a cleanup failure by callers; collapsing
 * it to `false` would silently report a project as cleaned when it was never
 * actually located.
 */
async function inspectActiveListing(page, name, timeout = 20000) {
  const searchInput = page.getByPlaceholder(/search projects/i).first();
  try {
    await expect(searchInput).toBeVisible({ timeout });
  } catch {
    // The search box never appeared — the listing is unusable.
    return null;
  }
  await searchInput.fill(name);

  try {
    await expect
      .poll(async () => projectCard(page, name).isVisible().catch(() => false), {
        timeout,
        intervals: [500, 1000, 2000, 5000],
        message: `Could not inspect the active listing while resolving project "${name}"`,
      })
      .toBe(true);
    return true;
  } catch {
    // The card never became visible. Distinguish "rendered but absent" from
    // "listing never rendered at all" by requiring the listing to have settled
    // (cards present, or an explicit empty state).
    const listingRendered = await listingHasSettled(page, timeout);
    return listingRendered ? false : null;
  }
}

/**
 * Whether the project listing has rendered far enough to make an absence
 * conclusion meaningful: either cards are present, or the app has explicitly
 * shown its "no projects" empty state.
 */
async function listingHasSettled(page, timeout = 20000) {
  try {
    await expect
      .poll(
        async () =>
          (await page.locator("article").count()) > 0 ||
          (await page.getByText(/no projects found/i).count()) > 0,
        { timeout, intervals: [500, 1000, 2000] }
      )
      .toBe(true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Verify that a project is no longer visible in the *active* project listing.
 *
 * IMPORTANT SCOPE: this is active-list UI verification, NOT authoritative
 * backend verification. The framework has no backend/API helper available, so
 * the strongest evidence obtainable here is that the project stays absent
 * across a fresh page load and a fresh search. Absence here does NOT prove the
 * project was permanently deleted — the application is known to use
 * archive/soft-delete with a retention period.
 */
async function verifyAbsentFromActiveListing(page, name) {
  await page.reload({ waitUntil: "domcontentloaded" });
  const state = await inspectActiveListing(page, name);
  if (state === null) {
    throw new Error(
      `Could not inspect the active listing to verify cleanup of "${name}" ` +
        "(the project search box never became available)"
    );
  }
  return state === false;
}

/**
 * Remove projects created during a test from the account's active listing.
 *
 * Each tracked project is processed independently so one failure cannot strand
 * the rest. A name is only removed from `createdProjectNames` once its own
 * cleanup has been verified; unresolved names stay tracked (and are therefore
 * retried by a later `afterEach`) and are reported as failures at the end.
 *
 * Outcomes recorded per project:
 *  - "already-absent"  : not in the active listing before cleanup was attempted
 *                        (cannot distinguish archived vs never-created)
 *  - "cleaned"         : archive/delete action ran and the project is verified
 *                        absent from the active listing afterwards
 *  - "failed"          : the action or verification did not complete
 *
 * Cleanup failures THROW. They are never swallowed, so `afterEach` surfaces
 * them and CI reports them instead of passing with a stranded project.
 */
export async function cleanupCreatedProjects(page, createdProjectNames) {
  if (createdProjectNames.size === 0) return;

  const failures = [];
  const alreadyAbsent = [];

  for (const name of Array.from(createdProjectNames)) {
    try {
      await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });

      const listingState = await inspectActiveListing(page, name);

      if (listingState === null) {
        // UNKNOWN — the listing never rendered. Do NOT untrack the name and do
        // NOT report it as absent; keep it tracked so a later run retries it.
        failures.push({
          name,
          reason: "the active listing could not be inspected (unknown state, not confirmed absent)",
        });
        continue;
      }

      if (listingState === false) {
        // Confirmed absent from the active listing. This is still not proof of a
        // permanent delete (the app uses archive/soft-delete), so it is reported
        // rather than treated as a silent success.
        alreadyAbsent.push(name);
        createdProjectNames.delete(name);
        continue;
      }

      await new ProjectPage(page).deleteOrArchiveProject(name, { confirm: true });

      const stillAbsent = await verifyAbsentFromActiveListing(page, name);
      if (!stillAbsent) {
        failures.push({ name, reason: "project is still visible in the active listing after cleanup" });
        continue;
      }

      createdProjectNames.delete(name);
    } catch (error) {
      failures.push({ name, reason: error?.message || String(error) });
    }
  }

  if (alreadyAbsent.length > 0) {
    console.warn(
      `[cleanupCreatedProjects] ${alreadyAbsent.length} tracked project(s) were already absent from the ` +
        `active listing before cleanup (archive state could not be determined): ${alreadyAbsent.join(", ")}`
    );
  }

  if (failures.length > 0) {
    const detail = failures.map(({ name, reason }) => `  - ${name}: ${reason}`).join("\n");
    throw new Error(
      `Cleanup could not verify the following created project(s):\n${detail}\n` +
        "These names remain tracked and will be retried by a later cleanup run."
    );
  }
}

export async function ensureProjectCreated(page, projectState) {
  if (projectState.projectName && projectState.projectId) return projectState;

  const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
  projectState.projectName = `SanityCheck-${currentDateTime}-Automation`;

  const projectResponsePromise = page.waitForResponse(
    (response) => response.request().method() === "POST" && /projects/i.test(response.url()),
    { timeout: 30000 }
  ).catch(() => null);

  const returnedProjectId = await createProject(page, projectState.projectName);
  const projectResponse = await projectResponsePromise;
  const responseBody = await projectResponse?.json().catch(() => null);
  const responseProjectId =
    responseBody?.uuid || responseBody?.id ||
    responseBody?.data?.uuid || responseBody?.data?.id;

  const url = new URL(page.url());
  const urlProjectId =
    url.pathname.match(/\/dashboard\/([^/?#]+)/i)?.[1] ||
    url.searchParams.get("projectId") ||
    url.searchParams.get("project_id") ||
    url.searchParams.get("uuid");

  projectState.projectId = responseProjectId || urlProjectId || returnedProjectId;

  if (!projectState.projectId || projectState.projectId === projectState.projectName) {
    throw new Error(`Project creation did not return an ID for ${projectState.projectName}`);
  }

  console.log("Project ID:", projectState.projectId);
  console.log("Project Name:", projectState.projectName);
  return projectState;
}

export async function ensureProjectOpen(page, projectState) {
  await ensureProjectCreated(page, projectState);
  if (page.url().includes(`/dashboard/${projectState.projectId}`)) {
    return projectState.projectId;
  }
  // Navigate directly â€” avoids card-click timing issues in React SPA
  const base = (process.env.TARGET_URL || "https://ai.accionbreeze.com/").replace(/\/$/, "");
  await page.goto(`${base}/dashboard/${projectState.projectId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  return projectState.projectId;
}

export async function prepareFunctionalMetrics(page, projectState) {
  //await ensureProjectOpen(page, projectState);
  console.log(`Selected project: ${projectState.projectName}`);
  console.log("Step 1: Uploading document...");
  await uploadFirstpdfDocument(page);
  console.log("Step 2: Generating functional metrics (this may take 2-3 minutes)...");
  await generateFunctionalOntology(page, projectState.projectId);
  return projectState;
}
