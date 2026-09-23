import { test, expect } from "./auth.fixture.mjs";
import {
  downloadArtifactPlainHtml,
  reviewArtifactsPage,
  validateCopyPlainHtmlContent,
  downloadArtifactPlainMarkdown,
  validateDownloadedPlainHtml,
  validateDownloadedPlainMarkdown,
  validatePlainMarkdownInNewWindow,
  validatePlainHtmlInNewWindow,
} from "../Pages/projectPage.js";
import {
  DEFAULT_BASE_URL,
  createProject,
  searchProject,
  trySearchProject,
  clearProjectSearch,
  waitForProjectVisible,
  waitForProjectHidden,
  openAuthorFilter,
  selectAuthorFilter,
  clearAuthorFilter,
  getProjectAuthor,
  getProjectListSummaryDetails,
  getVisibleAuthorProjectCount,
  openTagsFilter,
  projectCard,
} from "../Pages/dashboardPage.js";

import { ProjectPage } from "../Pages/projectPage.js";
import { DashboardPage } from "../Pages/dashboardPage.js";

import { CreateProjectPage } from "../Pages/createProjectFile.js";

const createdProjectNames = new Set();
const createdProjectIds = new Map();
let currentTestProjectNames = new Set();

function trackCreatedProject(projectName, projectId = null) {
  createdProjectNames.add(projectName);
  currentTestProjectNames.add(projectName);
  if (projectId) createdProjectIds.set(projectName, projectId);
}


const uniqueProjectName = (suffix) =>
  `Playwright-CreateProject-${suffix}-${Date.now()}`;

// ============================================================
// Create Project - Employee Level Test Cases
// The following test cases validate Create Project functionality
// at the Employee level.
// ============================================================


async function openCreateProject(page) {
  // Open application using configured base URL
  await page.goto(DEFAULT_BASE_URL, {
    waitUntil: "domcontentloaded",
  });

  const createProjectPage = new CreateProjectPage(page);

  await createProjectPage.open();

  return createProjectPage;
}

async function cleanupCreatedProjects(page) {
  const projectsToDelete = new Set(currentTestProjectNames);
  currentTestProjectNames.clear();

  if (projectsToDelete.size === 0) {
    return;
  }

  if (page.isClosed()) {
    throw new Error("Cannot clean up tracked projects because the page is closed");
  }

  try {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  } catch (error) {
    throw new Error("Could not navigate to the dashboard for project cleanup", { cause: error });
  }

  const cleanupFailures = [];
  for (const name of projectsToDelete) {
    try {
      await searchProject(page, name);
    } catch (error) {
      try {
        const dashboard = new DashboardPage(page);
        await dashboard.openProjectTab('Archived');
        const archivedProjectVisible = await trySearchProject(page, name);
        if (archivedProjectVisible) {
          await dashboard.restoreProject(name, { confirm: true });
          await dashboard.openProjectTab('My Projects');
          await searchProject(page, name);
        } else {
          console.warn(`[cleanup] Project "${name}" was not found in My Projects or Archived; it may already be deleted.`);
          await dashboard.openProjectTab('My Projects');
        }
      } catch (cleanupError) {
        cleanupFailures.push(`Project "${name}" could not be restored or located: ${cleanupError?.message ?? cleanupError}`);
        continue;
      }
    }

    if (await trySearchProject(page, name)) {
      try {
        const projectId = createdProjectIds.get(name) || page.url().match(/\/dashboard\/([^/?#]+)/i)?.[1] || null;
        console.log(`[cleanup] Deleting project "${name}"${projectId ? ` (ID: ${projectId})` : ''}`);
        await new ProjectPage(page).deleteOrArchiveProject(name, { confirm: true });
        await expect(projectCard(page, name)).toHaveCount(0, { timeout: 20000 });
        createdProjectIds.delete(name);
        createdProjectNames.delete(name);
      } catch (error) {
        cleanupFailures.push(`Project "${name}"${createdProjectIds.has(name) ? ` (ID: ${createdProjectIds.get(name)})` : ''}: ${error?.message ?? error}`);
      }
    } else {
      cleanupFailures.push(`Project "${name}" could not be found for deletion`);
    }
  }

  for (const failure of cleanupFailures) {
    console.error(`[cleanup] ${failure}`);
  }
}

test.describe("Complete Regression Suite", () => {

  // Common URL navigation for every test
  test.beforeEach("Url Calling", async ({ page }) => {
    currentTestProjectNames = new Set();
    await page.goto(DEFAULT_BASE_URL, {
      waitUntil: "domcontentloaded",
    });
  });

  test.afterEach("Clean up passed test projects", async ({ page }, testInfo) => {
    await cleanupCreatedProjects(page);
  });

  test("@regression Verify BreezeAI dashboard loads successfully", async ({ page }) => {
    // beforeEach() has already opened the application

    const title = await page.title();

    console.log("Page title after execution:", title);

    expect(title).toMatch(/Breeze\.AI/i);
  });

  test("@regression Verify a project can be created with a tag", async ({ page }) => {
    const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const projectName = `SanityCheck-${currentDateTime}-Automation`;
    const tag = `Playwright-${Date.now()}`;
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.addTag(tag);
    await expect(createProjectPage.getTagChip(tag)).toBeVisible({ timeout: 5000 });
    await createProjectPage.save();
    trackCreatedProject(projectName);

    await expect(page).toHaveURL(/dashboard|[?&]page=\d+/i, { timeout: 20000 });
  });

  test("@regression Verify a plain HTML artifact can be downloaded and validated", async ({ page }) => {
    // Create new breeze project and download its plain html artifact
    const currentDateTime = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = `SanityCheck-${currentDateTime}-Automation`;
    const projectId = await createProject(page, projectName);
    trackCreatedProject(projectName, projectId);
    await reviewArtifactsPage(page, projectId);
    await downloadArtifactPlainHtml(page, projectId);
    await validateCopyPlainHtmlContent(page, projectName, projectId);
    await validateDownloadedPlainHtml(page, projectName);
    await validatePlainHtmlInNewWindow(page, projectId, projectName);

  });

  test("@regression Verify a plain Markdown artifact can be downloaded and validated", async ({ page }) => {
    // Create new breeze project and download its plain markdown artifact
    const currentDateTime = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = `SanityCheck-${currentDateTime}-Automation`;
    const projectId = await createProject(page, projectName);
    trackCreatedProject(projectName, projectId);
    await downloadArtifactPlainMarkdown(page, projectId);
    await validateDownloadedPlainMarkdown(page, projectName);
    await validatePlainMarkdownInNewWindow(page, projectId, projectName);

  });


  test("@regression Verify a project cannot be created without a name", async ({
    page,
  }) => {
    const createProjectPage = await openCreateProject(page);

    await expect(createProjectPage.projectNameInput).toHaveValue("");

    await expect(createProjectPage.saveButton).toBeDisabled();
  });

  test("@regression Verify a project cannot be created with a whitespace-only name", async ({
    page,
  }) => {
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(" ");

    // Save should remain disabled when the project name
    // contains only whitespace.

    await expect(createProjectPage.saveButton).toBeDisabled();
  });

  test("@regression Verify project names support special characters", async ({
    page,
  }) => {
    const name = `Playwright & QA / ${Date.now()}`;

    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(name);

    await createProjectPage.save();

    await expect
      .poll(() => page.url(), {
        timeout: 20000,
      })
      .toMatch(/dashboard/i);

    await expect.poll(
      async () => {
        const destination = await createProjectPage.projectDestination(name);
        if (destination) {
          return true;
        }

        await page.reload({ waitUntil: "domcontentloaded" });
        return Boolean(await createProjectPage.projectDestination(name));
      },
      {
        timeout: 30000,
        intervals: [1000, 2000, 5000],
        message: `Project "${name}" should appear on the dashboard after creation`,
      },
    ).toBe(true);
    trackCreatedProject(name);
  });

  test("@regression Verify project search filters results by name", async ({ page }) => {
    const projectOne = `SanityCheck-Search-${Date.now()}-A`;
    const projectTwo = `SanityCheck-Search-${Date.now()}-B`;

    await createProject(page, projectOne);
    trackCreatedProject(projectOne);
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await createProject(page, projectTwo);
    trackCreatedProject(projectTwo);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectOne);

    await waitForProjectVisible(page, projectOne, 30000);
    await expect(page.getByText(projectTwo, { exact: true })).toHaveCount(0);

    await clearProjectSearch(page);
    await searchProject(page, projectOne);
    await clearProjectSearch(page);
    await searchProject(page, projectTwo);
  });

  test("@regression Verify the Author filter narrows project results", async ({ page }) => {
    const projectName = `SanityCheck-Author-${Date.now()}`;
    await createProject(page, projectName);
    trackCreatedProject(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const authorName = await getProjectAuthor(page, projectName);
    await clearProjectSearch(page);
    const unfilteredSummary = await getProjectListSummaryDetails(page);
    await openAuthorFilter(page);
    await selectAuthorFilter(page, authorName);

    const authorSummary = await getProjectListSummaryDetails(page);
    const visibleAuthorProjectCount = await getVisibleAuthorProjectCount(page, authorName);
    const displayedRangeCount = authorSummary.last - authorSummary.first + 1;
    expect(authorSummary.total).toBeGreaterThan(0);
    expect(visibleAuthorProjectCount).toBe(displayedRangeCount);
    expect(authorSummary.total).toBeGreaterThanOrEqual(visibleAuthorProjectCount);

    const searchInput = page.getByRole("textbox", { name: /search projects/i }).first();
    await searchInput.fill(projectName);
    await waitForProjectVisible(page, projectName, 30000);
    await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible({ timeout: 20000 });

    await clearProjectSearch(page);
    await clearAuthorFilter(page);
    const restoredSummary = await getProjectListSummaryDetails(page);
    expect(restoredSummary.total).toBeGreaterThanOrEqual(unfilteredSummary.total);
    await expect(page.getByRole('button', { name: /^author$/i })).toBeVisible();
  });

  test("@regression Verify the Tags filter shows the tagged project", async ({ page }) => {
    const projectName = `SanityCheck-Tags-${Date.now()}`;
    const tagName = `Playwright-Filter-${Date.now()}`;

    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.addTag(tagName);
    await expect(createProjectPage.getTagChip(tagName)).toBeVisible({ timeout: 5000 });
    await createProjectPage.save();
    trackCreatedProject(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await openTagsFilter(page, tagName);

    await waitForProjectVisible(page, projectName, 30000);
    await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible({ timeout: 20000 });
  });

  test("@regression Verify a project can be favorited, unfavorited, archived, restored, and deleted", async ({ page }) => {
    const projectName = `SanityCheck-Favourite-Restore-${Date.now()}`;
    const dashboard = new DashboardPage(page);
    await createProject(page, projectName);
    trackCreatedProject(projectName);
    await expect(page).toHaveURL(/dashboard|[?&]page=\d+/i);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await dashboard.openProjectTab('My Projects');
    await searchProject(page, projectName);
    await dashboard.clickProjectFavourite(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await dashboard.openProjectTab('My Projects');
    await searchProject(page, projectName);
    await dashboard.openProjectTab('Favourites');
    // Verify each project independently after clearing the search to avoid pagination assumptions.
    await dashboard.showProjectInCurrentList(projectName);
    await expect(dashboard.projectCard(projectName)).toBeVisible();
    await dashboard.clickProjectFavourite(projectName);

    await clearProjectSearch(page);
    const favouriteStillVisible = await trySearchProject(page, projectName);
    if (favouriteStillVisible) {
      await waitForProjectHidden(page, projectName);
    }

    await dashboard.openProjectTab('My Projects');
    await dashboard.showProjectInCurrentList(projectName);
    await expect(dashboard.projectCard(projectName)).toBeVisible();
    await new ProjectPage(page).deleteOrArchiveProject(projectName, { confirm: true });

    await dashboard.openProjectTab('Archived');
    await dashboard.showProjectInCurrentList(projectName);
    await dashboard.restoreProject(projectName, { confirm: true });
    await dashboard.openProjectTab('My Projects');
    await dashboard.showProjectInCurrentList(projectName);
    await expect(dashboard.projectCard(projectName)).toBeVisible();
    await new ProjectPage(page).deleteOrArchiveProject(projectName, { confirm: true });
  });

  test("@regression Verify canceling restore keeps a project archived", async ({ page }) => {
    const projectName = `SanityCheck-Favourite-Restore-Cancel-${Date.now()}`;
    const dashboard = new DashboardPage(page);
    await createProject(page, projectName);
    trackCreatedProject(projectName);
    await expect(page).toHaveURL(/dashboard|[?&]page=\d+/i);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await dashboard.openProjectTab('My Projects');
    await searchProject(page, projectName);
    await dashboard.clickProjectFavourite(projectName);
    await dashboard.openProjectTab('Favourites');
    // Verify each project independently after clearing the search to avoid pagination assumptions.
    await dashboard.showProjectInCurrentList(projectName);
    await expect(dashboard.projectCard(projectName)).toBeVisible();
    await dashboard.clickProjectFavourite(projectName);
    await clearProjectSearch(page);
    const favouriteStillVisible = await trySearchProject(page, projectName);
    if (favouriteStillVisible) {
      await waitForProjectHidden(page, projectName);
    }

    await dashboard.openProjectTab('My Projects');
    await dashboard.showProjectInCurrentList(projectName);
    await new ProjectPage(page).deleteOrArchiveProject(projectName, { confirm: true });
    await dashboard.openProjectTab('Archived');
    await dashboard.showProjectInCurrentList(projectName);
    await dashboard.restoreProject(projectName, { confirm: false });
    await expect(dashboard.projectCard(projectName)).toBeVisible();

    await dashboard.openProjectTab('My Projects');
    await expect(dashboard.projectCard(projectName)).not.toBeVisible({ timeout: 10000 });
  });

  test("@regression Verify the project card displays the project name", async ({ page }) => {
    const projectName = `SanityCheck-Metadata-${Date.now()}`;
    await createProject(page, projectName);
    trackCreatedProject(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await waitForProjectVisible(page, projectName, 30000);
    const card = projectCard(page, projectName);
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card).toContainText(projectName);
  });

  test("@regression Verify clicking a project card opens the project dashboard", async ({ page }) => {
    const projectName = `SanityCheck-Open-${Date.now()}`;
    await createProject(page, projectName);
    trackCreatedProject(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await waitForProjectVisible(page, projectName, 30000);
    await page.getByText(projectName, { exact: true }).first().click();

    await expect(page).toHaveURL(/dashboard\//i, { timeout: 20000 });
  });

  test("@regression Verify the Project Options menu opens from a project card", async ({ page }) => {
    const projectName = `SanityCheck-Menu-${Date.now()}`;
    await createProject(page, projectName);
    trackCreatedProject(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const projectPage = new ProjectPage(page);
    const menu = await projectPage.openProjectOptionsMenu(projectName);
    await expect(menu).toBeVisible({ timeout: 15000 });
  });

  test("@regression Verify canceling Delete or Archive keeps the project", async ({ page }) => {
    const projectName = `SanityCheck-Cancel-${Date.now()}`;
    await createProject(page, projectName);
    trackCreatedProject(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const projectPage = new ProjectPage(page);
    const action = await projectPage.deleteOrArchiveProject(projectName, { confirm: false });
    expect(action).toBe(false);
    await expect(projectCard(page, projectName)).toBeVisible({ timeout: 20000 });
  });

  test("@regression Verify confirming Delete or Archive removes the project", async ({ page }) => {
    const projectName = `SanityCheck-Delete-${Date.now()}`;
    await createProject(page, projectName);
    trackCreatedProject(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const projectPage = new ProjectPage(page);
    await projectPage.deleteOrArchiveProject(projectName, { confirm: true });
    await expect(projectCard(page, projectName)).toHaveCount(0);
  });

  test("@regression Verify a no-match project search shows the empty state", async ({ page }) => {
    const needle = `zzz-no-project-${Date.now()}`;
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    const searchInput = page.getByRole("textbox", { name: /search projects/i }).first();
    await expect(searchInput).toBeVisible({ timeout: 20000 });
    await searchInput.fill(needle);

    await expect(page.getByText("No projects found.", { exact: true })).toBeVisible({ timeout: 20000 });
  });

  test("@regression Verify a deleted project remains absent after reload", async ({ page }) => {
    const projectName = `SanityCheck-Refresh-${Date.now()}`;
    await createProject(page, projectName);
    trackCreatedProject(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    const projectPage = new ProjectPage(page);
    await projectPage.deleteOrArchiveProject(projectName, { confirm: true });
    await expect(projectCard(page, projectName)).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(projectCard(page, projectName)).toHaveCount(0);
  });

  test("@regression Verify a duplicate project name is rejected without changing the original", async ({
    page,
  }) => {
    const name = uniqueProjectName("duplicate");

    // Create first project
    const first = await openCreateProject(page);

    await first.fillProjectName(name);

    await first.save();
    trackCreatedProject(name);

    await expect
      .poll(() => page.url(), {
        timeout: 20000,
      })
      .toMatch(/dashboard/i);

    // Try creating the same project again
    const second = await openCreateProject(page);

    await second.fillProjectName(name);

    await second.save();

    await expect.poll(
      () => second.visibleValidationMessage(),
      {
        timeout: 10000,
        message: "Duplicate project creation should show a validation message",
      },
    ).not.toBe("");

    await second.cancelOrClose();
    await searchProject(page, name);
    await expect(projectCard(page, name)).toBeVisible({ timeout: 20000 });
  });

  test("@regression Verify canceling project creation does not save the project", async ({
    page,
  }) => {
    const createProjectPage = await openCreateProject(page);

    const name = uniqueProjectName("cancel");

    await createProjectPage.fillProjectName(name);

    await expect(createProjectPage.cancelButton.first()).toBeVisible({ timeout: 5000 });

    await createProjectPage.cancelOrClose();

    await expect(createProjectPage.projectNameInput).toBeHidden();

    await expect(
      page.getByRole("button", {
        name: /create project/i,
      }),
    ).toBeVisible();
  });
});


