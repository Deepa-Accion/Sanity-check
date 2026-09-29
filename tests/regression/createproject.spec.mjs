import { test, expect } from "../auth.fixture.mjs";
import {
  DEFAULT_BASE_URL,
  createProject,
  DashboardPage,
  getProjectAuthor,
  projectCard,
  searchProject,
  clearProjectSearch,
  getProjectListSummaryDetails,
  openAuthorFilter,
  selectAuthorFilter,
  clearAuthorFilter,
  getVisibleAuthorProjectCount,
  selectFirstListedProject,
} from "../../Pages/dashboardPage.js";
import { ProjectPage } from "../../Pages/projectPage.js";
import { CreateProjectPage } from "../../Pages/createProjectFile.js";
import {
  openCreateProject,
  cleanupCreatedProjects,
  uniqueProjectName,
  uniqueTag,
  fixedLengthProjectName,
  getProjectCardName,
  getFirstProjectCard,
  typeProjectSearch,
  captureScriptDialogs,
  selectProjectTab,
  isProjectTabSelected,
  openProfileMenu,
  isProfileMenuTriggerVisible,
  expectNoControlsMatching,
  waitForFilterDropdownOpen,
  waitForFilterDropdownClosed,
} from "./regression-utils.mjs";

const createdProjectNames = new Set();
const projectCreateRequestPattern = /\/projects(?:\?|$)/i;
const adminControlPatterns = ["user management", "admin"];

test.describe("Regression â€” Create Project", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  });

  test.afterEach(async ({ page }) => {
    await cleanupCreatedProjects(page, createdProjectNames);
  });

  test("@regression @createproject @enduser BreezeAI create project with tag", async ({ page }) => {
    const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const projectName = `SanityCheck-${currentDateTime}-Automation`;
    const tag = uniqueTag("create");
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.addTag(tag);
    expect(await createProjectPage.isTagChipVisible(tag)).toBe(true);
    await createProjectPage.save();
    // Register immediately after creation so a later assertion failure still
    // leaves the project tracked for cleanup.
    createdProjectNames.add(projectName);

    await expect(page).toHaveURL(/dashboard|[?&]page=\d+/i, { timeout: 20000 });
  });

  test("@regression @createproject @enduser rejects an empty project name without creating a project", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    expect(await createProjectPage.getProjectNameValue()).toBe("");
    expect(await createProjectPage.isSaveEnabled()).toBe(false);
  });

  test("@regression @createproject @enduser rejects a whitespace-only project name", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(" ");
    expect(await createProjectPage.isSaveEnabled()).toBe(false);
  });

  test("@regression @createproject @enduser supports special characters in a project name", async ({ page }) => {
    const name = `Playwright & QA / ${Date.now()}`;
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(name);
    await createProjectPage.save();
    createdProjectNames.add(name);

    await expect.poll(() => page.url(), { timeout: 20000 }).toMatch(/dashboard/i);
    await createProjectPage.waitForProjectDestination(name);
  });

  test("@regression @createproject @enduser handles a duplicate project name without modifying the original", async ({ page }) => {
    const name = uniqueProjectName("duplicate");
    const first = await openCreateProject(page);
    await first.fillProjectName(name);
    await first.save();
    await expect.poll(() => page.url(), { timeout: 20000 }).toMatch(/dashboard/i);

    const second = await openCreateProject(page);
    await second.fillProjectName(name);
    await second.save();

    await expect.poll(
      () => second.visibleValidationMessage(),
      {
        timeout: 10000,
        message: "Duplicate project creation should show a validation message",
      }
    ).not.toBe("");

    // The original project must survive the rejected duplicate attempt.
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, name);
    await expect(projectCard(page, name)).toBeVisible({ timeout: 20000 });
  });

  test("@regression @createproject @enduser cancels the form without saving entered data", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    const name = uniqueProjectName("cancel");
    await createProjectPage.fillProjectName(name);
    expect(await createProjectPage.isCancelAvailable()).toBe(true);
    await createProjectPage.cancelOrClose();
    expect(await createProjectPage.isProjectNameInputHidden()).toBe(true);
    expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(true);
  });

  test("@regression @createproject @enduser closes the form with the X button without saving", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(uniqueProjectName("close"));
    await createProjectPage.dismiss("close");

    expect(await createProjectPage.isProjectNameInputHidden()).toBe(true);
    expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(true);
  });

  test("@regression @createproject @enduser closes the create dialog with Escape", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(uniqueProjectName("escape"));
    await createProjectPage.dismiss("escape");

    expect(await createProjectPage.isDialogVisible()).toBe(false);
  });

  test("@regression @createproject @enduser creates a project with a short unique name", async ({ page }) => {
    const projectName = uniqueProjectName("short");
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(projectName);
    expect(await createProjectPage.isSaveEnabled()).toBe(true);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i, { timeout: 20000 });
  });

  test("@regression @createproject @enduser accepts a 200-character project name", async ({ page }) => {
    test.skip(true, "200-character project name scenario is not to be run.");
    const projectName = fixedLengthProjectName("len-", 200);
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(projectName);
    expect(await createProjectPage.isSaveEnabled()).toBe(true);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i, { timeout: 20000 });
  });

  test("@regression @createproject @enduser shows the created project name and tag on the dashboard", async ({ page }) => {
    const projectName = uniqueProjectName("dashboard-tag");
    const tag = uniqueTag("card");
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.addTag(tag);
    expect(await createProjectPage.isTagChipVisible(tag)).toBe(true);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const createdCard = projectCard(page, projectName);
    await expect(createdCard).toContainText(projectName);
    await expect(createdCard).toContainText(tag);
  });

  test("@regression @createproject @enduser rejects a tag that exceeds the 50-character limit", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(uniqueProjectName("tag-limit"));
    const result = await createProjectPage.submitTagExpectingRejection("T".repeat(51));

    expect(result.validationVisible).toBe(true);
    expect(result.tagValue).toBe("T".repeat(51));
  });

  test("@regression @createproject @enduser rejects a whitespace-only tag value without adding it", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(uniqueProjectName("tag-whitespace"));
    const result = await createProjectPage.submitTagExpectingRejection("   ");

    expect(result.addTagEnabled).toBe(false);
    expect(result.tagValue).toBe("   ");
    expect(await createProjectPage.isSaveEnabled()).toBe(true);
  });

  test("@regression @createproject @enduser displays the name, description, and tag fields in the create dialog", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);

    expect(await createProjectPage.isDialogVisible()).toBe(true);
    expect(await createProjectPage.areFormFieldsVisible()).toBe(true);
  });

  test("@regression @createproject @enduser creates a project with a description and tag visible on its card", async ({ page }) => {
    const projectName = uniqueProjectName("description-tag");
    const description = `Description-${Date.now()}`;
    const tag = `Tag-${Date.now()}`;
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.fillDescription(description);
    await createProjectPage.addTag(tag);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const createdCard = projectCard(page, projectName);
    await expect(createdCard).toContainText(projectName);
    await expect(createdCard).toContainText(description);
    await expect(createdCard).toContainText(tag);
    expect(await createProjectPage.isCreatedTimestampVisible(projectName)).toBe(true);
    await expect.poll(() => getProjectAuthor(page, projectName)).not.toBe("");
  });

  test("@regression @createproject @enduser displays the author on the created project card", async ({ page }) => {
    const projectName = uniqueProjectName("author");
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await expect.poll(() => getProjectAuthor(page, projectName)).not.toBe("");
  });

  test("@regression @createproject @enduser renders HTML in a project name as text", async ({ page }) => {
    const projectName = `<script>alert(${Date.now()})</script>`;
    const dialogs = await captureScriptDialogs(page);
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i, { timeout: 20000 });
    expect(dialogs).toEqual([]);
  });

  test("@regression @createproject @enduser shows a fetch error and keeps the form open when project creation fails", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(uniqueProjectName("network-failure"));
    await page.route(projectCreateRequestPattern, (route) => route.abort());

    const failedRequestPromise = page.waitForEvent("requestfailed", {
      predicate: (request) => request.method() === "POST" && /\/projects(?:\?|$)/i.test(request.url()),
    });
    await createProjectPage.save();
    await failedRequestPromise;

    expect(await createProjectPage.isDialogVisible()).toBe(true);
    await createProjectPage.waitForFetchErrorMessage();
  });

  test("@regression @createproject @enduser @project-edit updates the description of an own project", async ({ page }) => {
    const projectName = uniqueProjectName("edit");
    const description = `Updated-${Date.now()}`;
    await createProject(page, projectName);
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const dashboard = new DashboardPage(page);
    await expect(dashboard.projectCard(projectName)).toBeVisible();
    await dashboard.updateProject(projectName, { description });
    await expect(dashboard.projectCard(projectName)).toContainText(description);
  });

  test("@regression @createproject @enduser @project-favourite favourites and unfavourites an own project", async ({ page }) => {
    const projectName = uniqueProjectName("favourite");
    await createProject(page, projectName);
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const dashboard = new DashboardPage(page);
    await dashboard.clickProjectFavourite(projectName);
    await dashboard.openProjectTab("Favourites");
    await expect(projectCard(page, projectName)).toBeVisible();

    await dashboard.clickProjectFavourite(projectName);
    await expect.poll(() => projectCard(page, projectName).isVisible().catch(() => false)).toBe(false);
  });

  test("@regression @createproject @enduser @project-delete confirms an own project can be deleted", async ({ page }) => {
    const projectName = uniqueProjectName("delete");
    await createProject(page, projectName);
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await new ProjectPage(page).deleteOrArchiveProject(projectName, { confirm: true });
    await expect(projectCard(page, projectName)).not.toBeVisible();
  });

  test("@regression @createproject @enduser @project-options exposes the export option for an own project", async ({ page }) => {
    const projectName = uniqueProjectName("options");
    await createProject(page, projectName);
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const projectPage = new ProjectPage(page);
    const menu = await projectPage.openProjectOptionsMenu(projectName);
    await expect(menu.getByRole("menuitem", { name: /export project/i })).toBeVisible();
  });

  test("@regression @createproject @enduser @navigation returns to the project listing with browser back", async ({ page }) => {
    const projectId = await selectFirstListedProject(page);
    expect(projectId).toBeTruthy();
    await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i);
    await page.goBack();
    await expect(page).toHaveURL(/\?page=\d+|\/$/i);
  });

  test.describe("End User project-listing coverage from Final.csv", () => {
    test("@regression @createproject @enduser @listing verifies authenticated page chrome and End User controls", async ({ page }) => {
      const createProjectPage = new CreateProjectPage(page);

      await expect(page).toHaveTitle("Breeze.AI");
      expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(true);
      expect(await isProfileMenuTriggerVisible(page)).toBe(true);
      expect(await createProjectPage.isAccionLabsLinkVisible()).toBe(true);
      expect(await createProjectPage.isBrandLogoVisible()).toBe(true);
      await expectNoControlsMatching(page, adminControlPatterns);
    });

    test("@regression @createproject @enduser @listing switches project tabs and exposes active state", async ({ page }) => {
      for (const tabName of ["My Projects", "Favourites"]) {
        await selectProjectTab(page, tabName);
        expect(await isProjectTabSelected(page, tabName)).toBe(true);
      }
    });

    test("@regression @createproject @enduser @listing verifies accessible project cards and relative metadata", async ({ page }) => {
      const firstCard = await getFirstProjectCard(page);
      if (!firstCard) {
        test.skip(true, "No accessible project is available for card metadata validation.");
      }
      await expect(firstCard).toContainText(/author/i);
      await expect(firstCard).toContainText(/created/i);

      const projectName = await getProjectCardName(firstCard);
      expect(projectName).toBeTruthy();

      const createProjectPage = new CreateProjectPage(page);
      expect(await createProjectPage.isEmptyMetadataLabelVisible(projectName)).toBe(true);
    });

    test("@regression @createproject @enduser @listing searches accessible projects and restores the list", async ({ page }) => {
      const firstCard = await getFirstProjectCard(page);
      if (!firstCard) {
        test.skip(true, "No accessible project is available for search validation.");
      }
      const projectName = await getProjectCardName(firstCard);
      expect(projectName).toBeTruthy();

      await searchProject(page, projectName);
      await expect(projectCard(page, projectName)).toBeVisible();
      await clearProjectSearch(page);

      await typeProjectSearch(page, `NoMatch-${Date.now()}`);
      await expect.poll(() => projectCard(page, projectName).isVisible().catch(() => false)).toBe(false);
      await clearProjectSearch(page);
    });

    test("@regression @createproject @enduser @listing treats special search input as literal text", async ({ page }) => {
      const dialogs = await captureScriptDialogs(page);
      const payload = "<script>alert('xss')</script>";
      const searchInput = await typeProjectSearch(page, payload);
      await expect(searchInput).toHaveValue(payload);
      expect(dialogs).toEqual([]);
    });

    test("@regression @createproject @enduser @listing opens and clears the Author filter", async ({ page }) => {
      await openAuthorFilter(page);
      await waitForFilterDropdownOpen(page);
      await page.keyboard.press("Escape");
      await waitForFilterDropdownClosed(page);
    });

    test("@regression @createproject @enduser @listing applies an accessible Author filter", async ({ page }) => {
      const firstCard = await getFirstProjectCard(page);
      if (!firstCard) {
        test.skip(true, "No accessible project is available for Author-filter validation.");
      }
      const projectName = await getProjectCardName(firstCard);
      expect(projectName).toBeTruthy();
      const author = await getProjectAuthor(page, projectName);
      await openAuthorFilter(page);
      await selectAuthorFilter(page, author);
      expect(await getVisibleAuthorProjectCount(page, author)).toBeGreaterThan(0);
      await clearAuthorFilter(page);
    });

    test("@regression @createproject @enduser @listing verifies pagination summary when results are available", async ({ page }) => {
      const summary = await getProjectListSummaryDetails(page);
      if (summary.total === 0) {
        test.skip(true, "No accessible projects are available for pagination validation.");
      }
      expect(summary.first).toBeGreaterThan(0);
      expect(summary.last).toBeGreaterThanOrEqual(summary.first);
      expect(summary.total).toBeGreaterThanOrEqual(summary.last);
    });

    test("@regression @createproject @enduser @listing navigates from a project card to its dashboard", async ({ page }) => {
      const projectId = await selectFirstListedProject(page);
      expect(projectId).toBeTruthy();
      await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i);
    });

    test("@regression @createproject @enduser @listing opens the End User profile menu", async ({ page }) => {
      await openProfileMenu(page);
    });

    test("@regression @createproject @enduser @listing preserves the listing layout at tablet width", async ({ page }) => {
      const createProjectPage = new CreateProjectPage(page);

      await page.setViewportSize({ width: 768, height: 1024 });
      expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(true);
      expect(await createProjectPage.isPageLoaded()).toBe(true);
    });
  });
});
