import { expect } from "@playwright/test";
import { createProject, DEFAULT_BASE_URL, projectCard } from "../../Pages/dashboardPage.js";
import { ProjectPage } from "../../Pages/projectPage.js";
import { uploadFirstpdfDocument, generateFunctionalOntology } from "../../Pages/knowlegeBase.js";
import { CreateProjectPage } from "../../Pages/createProjectFile.js";

export const uniqueProjectName = (suffix) =>
  `Playwright-CreateProject-${suffix}-${Date.now()}`;

/**
 * Build a unique tag value. Tag length stays within the app's 50-character
 * limit so tags generated here never collide with the over-length scenario.
 */
export const uniqueTag = (suffix) => `Tag-${suffix}-${Date.now()}`;

/**
 * Build a project name of an exact total length (used for max-length cases).
 * The tail is padded deterministically so the result is always `length` chars.
 */
export const fixedLengthProjectName = (suffix, length) => {
  const base = `${suffix}${Date.now()}`;
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
 * Returns true/false only when the answer is confirmed. Throws when the listing
 * cannot be inspected at all, so an unusable page is never mistaken for
 * "project absent".
 */
async function isProjectInActiveListing(page, name, timeout = 20000) {
  const searchInput = page.getByPlaceholder(/search projects/i).first();
  await expect(searchInput).toBeVisible({ timeout });
  await searchInput.fill(name);

  let visible = false;
  try {
    await expect
      .poll(async () => {
        visible = await projectCard(page, name).isVisible().catch(() => false);
        return visible;
      }, { timeout, intervals: [500, 1000, 2000, 5000] })
      .toBe(true);
  } catch {
    return false;
  }
  return visible;
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
  return !(await isProjectInActiveListing(page, name));
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
 */
export async function cleanupCreatedProjects(page, createdProjectNames) {
  if (createdProjectNames.size === 0) return;

  const failures = [];
  const alreadyAbsent = [];

  for (const name of Array.from(createdProjectNames)) {
    try {
      await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });

      const foundInActiveListing = await isProjectInActiveListing(page, name);

      if (!foundInActiveListing) {
        // Already out of the active listing. This is a recorded state, not a
        // confirmed deletion, and it is not treated as proof of cleanup.
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
