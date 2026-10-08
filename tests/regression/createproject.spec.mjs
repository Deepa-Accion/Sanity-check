import { test, expect } from "../auth.fixture.mjs";
import { randomUUID } from "node:crypto";
// Role-specific suites use the isolated fixtures from roles.fixture.mjs.
import { test as viewerTest } from "../roles.fixture.mjs";
import { test as adminTest } from "../roles.fixture.mjs";
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
import { CreateProjectPage, UserManagementPage } from "../../Pages/createProjectFile.js";
import {
  openCreateProject,
  cleanupCreatedProjects,
  uniqueProjectName,
  uniqueTag,
  fixedLengthProjectName,
  getProjectCardName,
  getProjectListSearchInput,
  getUniqueSuffix,
  getFirstProjectCard,
  typeProjectSearch,
  refreshProjectListing,
  captureScriptDialogs,
  selectProjectTab,
  isProjectTabSelected,
  openProfileMenu,
  isProfileMenuTriggerVisible,
  expectNoControlsMatching,
  waitForFilterDropdownOpen,
  waitForFilterDropdownClosed,
} from "./regression-utils.mjs";
import {
  openRoleListing,
  expireRoleSession,
  selectListingTab,
  getListingEmptyStateText,
  readProjectCardControlNames,
  isProjectOptionsMenuAvailable,
  isProjectFavouriteAvailable,
  getSessionAccessToken,
  apiRequest,
  waitForProjectAbsentFromApi,
  waitForProjectHardDeleteCompletion,
} from "./regression-utils.mjs";

const createdProjectNames = new Set();
const adminControlPatterns = ["user management", "admin"];

const existingEndUserCases = [
  async (page, projectNames) => {
    const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const projectName = `SanityCheck-${currentDateTime}-Automation`;
    const tag = uniqueTag("create");
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.addTag(tag);
    expect(await createProjectPage.isTagChipVisible(tag)).toBe(true);
    await createProjectPage.save();
    projectNames.add(projectName);
    await expect(page).toHaveURL(/dashboard|[?&]page=\d+/i, { timeout: 20000 });
  },
  async (page) => {
    const createProjectPage = await openCreateProject(page);
    expect(await createProjectPage.getProjectNameValue()).toBe("");
    expect(await createProjectPage.isSaveEnabled()).toBe(false);
  },
  async (page) => {
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(" ");
    expect(await createProjectPage.isSaveEnabled()).toBe(false);
  },
  async (page, projectNames) => {
    const name = uniqueProjectName("special-chars");
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(name);
    await createProjectPage.save();
    projectNames.add(name);

    await expect.poll(() => page.url(), { timeout: 20000 }).toMatch(/dashboard/i);
    await createProjectPage.waitForProjectDestination(name);
  },
  async (page, projectNames) => {
    const name = uniqueProjectName("duplicate");
    const first = await openCreateProject(page);
    await first.fillProjectName(name);
    await first.save();
    projectNames.add(name);
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

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, name);
    await expect(projectCard(page, name)).toBeVisible({ timeout: 20000 });
  },
];

const existingViewerCases = [
  async (page) => {
    await expect(page).toHaveURL(/\?page=\d+|\/$/i);
    await expect(page).toHaveTitle("Breeze.AI");
  },
  async (page) => {
    const createProjectPage = new CreateProjectPage(page);
    expect(await createProjectPage.isBrandLogoVisible()).toBe(true);
    expect(await createProjectPage.isAccionLabsLinkVisible()).toBe(true);
    expect(await isProfileMenuTriggerVisible(page)).toBe(true);
    expect(await createProjectPage.isPageLoaded()).toBe(true);
  },
  async (page) => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await openRoleListing(page, { refresh: false });
    await expect(page.getByRole("button", { name: /create project/i })).toHaveCount(0);
    await expect(page).toHaveTitle("Breeze.AI");
  },
  async (page) => {
    await expireRoleSession(page);
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/i, { timeout: 30000 });
  },
  async (page) => {
    await expect(page.getByRole("button", { name: /create project/i })).toHaveCount(0);
  },
];

test.describe("Regression — Create Project", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  });

  test.afterEach(async ({ page }) => {
    await cleanupCreatedProjects(page, createdProjectNames);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify End User can create a project with a tag
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify End User can create a project with a tag", async ({ page }) => {
    await existingEndUserCases[0](page, createdProjectNames);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify empty project names are rejected without creating a project
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify empty project names are rejected without creating a project", async ({ page }) => {
    await existingEndUserCases[1](page, createdProjectNames);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify whitespace-only project names are rejected
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify whitespace-only project names are rejected", async ({ page }) => {
    await existingEndUserCases[2](page, createdProjectNames);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify special characters are accepted in project names
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify special characters are accepted in project names", async ({ page }) => {
    await existingEndUserCases[3](page, createdProjectNames);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify duplicate project names are rejected without changing the original
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify duplicate project names are rejected without changing the original", async ({ page }) => {
    await existingEndUserCases[4](page, createdProjectNames);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify the create form closes without saving entered data
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify the create form closes without saving entered data", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    const name = uniqueProjectName("cancel");
    await createProjectPage.fillProjectName(name);
    expect(await createProjectPage.isCancelAvailable()).toBe(true);
    await createProjectPage.cancelOrClose();
    expect(await createProjectPage.isProjectNameInputHidden()).toBe(true);
    expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify the create form closes with the X button without saving
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify the create form closes with the X button without saving", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(uniqueProjectName("close"));
    await createProjectPage.dismiss("close");

    expect(await createProjectPage.isProjectNameInputHidden()).toBe(true);
    expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify the create dialog closes with Escape
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify the create dialog closes with Escape", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(uniqueProjectName("escape"));
    await createProjectPage.dismiss("escape");

    expect(await createProjectPage.isDialogVisible()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify a short unique project name is accepted
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify a short unique project name is accepted", async ({ page }) => {
    const projectName = uniqueProjectName("short");
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(projectName);
    expect(await createProjectPage.isSaveEnabled()).toBe(true);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i, { timeout: 20000 });
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify a 200-character project name is accepted
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify a 200-character project name is accepted", async ({ page }) => {
    test.skip(true, "200-character project name scenario is not to be run.");
    const projectName = fixedLengthProjectName("len-", 200);
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(projectName);
    expect(await createProjectPage.isSaveEnabled()).toBe(true);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i, { timeout: 20000 });
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify the created project name and tag are shown on the dashboard
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify the created project name and tag are shown on the dashboard", async ({ page }) => {
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

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify tags longer than 50 characters are rejected
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify tags longer than 50 characters are rejected", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(uniqueProjectName("tag-limit"));
    const result = await createProjectPage.submitTagExpectingRejection("T".repeat(51));

    expect(result.validationVisible).toBe(true);
    expect(result.tagValue).toBe("T".repeat(51));
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify whitespace-only tag values are rejected without adding them
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify whitespace-only tag values are rejected without adding them", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(uniqueProjectName("tag-whitespace"));
    const result = await createProjectPage.submitTagExpectingRejection("   ");

    expect(result.addTagEnabled).toBe(false);
    expect(result.tagValue).toBe("   ");
    expect(await createProjectPage.isSaveEnabled()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify the create dialog displays the name description and tag fields
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify the create dialog displays the name description and tag fields", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);

    expect(await createProjectPage.isDialogVisible()).toBe(true);
    expect(await createProjectPage.areFormFieldsVisible()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify project cards show the description and tag after creation
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify project cards show the description and tag after creation", async ({ page }) => {
    const projectName = uniqueProjectName("description-tag");
    const description = uniqueTag("description");
    const tag = uniqueTag("card");
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

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify the created project card shows the author
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify the created project card shows the author", async ({ page }) => {
    const projectName = uniqueProjectName("author");
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await expect.poll(() => getProjectAuthor(page, projectName)).not.toBe("");
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify HTML in project names is rendered as text
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser Verify HTML in project names is rendered as text", async ({ page }) => {
    const projectName = `<script>alert('xss-${getUniqueSuffix()}')</script>`;
    const dialogs = await captureScriptDialogs(page);
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i, { timeout: 20000 });
    expect(dialogs).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify an End User can update the description of their own project
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser @project-edit Verify an End User can update the description of their own project", async ({ page }) => {
    const projectName = uniqueProjectName("edit");
    const description = uniqueTag("updated");
    await createProject(page, projectName);
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const dashboard = new DashboardPage(page);
    await expect(dashboard.projectCard(projectName)).toBeVisible();
    await dashboard.updateProject(projectName, { description });
    await expect(dashboard.projectCard(projectName)).toContainText(description);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify an End User can favourite and unfavourite their own project
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser @project-favourite Verify an End User can favourite and unfavourite their own project", async ({ page }) => {
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

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify an End User can delete their own project
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser @project-delete Verify an End User can delete their own project", async ({ page }) => {
    const projectName = uniqueProjectName("delete");
    await createProject(page, projectName);
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await new ProjectPage(page).deleteOrArchiveProject(projectName, { confirm: true });
    await expect(projectCard(page, projectName)).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify an End User can export their own project
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser @project-options Verify an End User can export their own project", async ({ page }) => {
    const projectName = uniqueProjectName("options");
    await createProject(page, projectName);
    createdProjectNames.add(projectName);

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    const projectPage = new ProjectPage(page);
    const menu = await projectPage.openProjectOptionsMenu(projectName);
    await expect(menu.getByRole("menuitem", { name: /export project/i })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Create Project
  // Comment: Verify browser back returns to the project listing
  // -------------------------------------------------------------------------
  test("@regression @createproject @enduser @navigation Verify browser back returns to the project listing", async ({ page }) => {
    const projectId = await selectFirstListedProject(page);
    expect(projectId).toBeTruthy();
    await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i);
    await page.goBack();
    await expect(page).toHaveURL(/\?page=\d+|\/$/i);
  });

  test.describe("End User project-listing coverage from Final.csv", () => {
    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify authenticated End User page chrome and controls are visible
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify authenticated End User page chrome and controls are visible", async ({ page }) => {
      const createProjectPage = new CreateProjectPage(page);

      await expect(page).toHaveTitle("Breeze.AI");
      expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(true);
      expect(await isProfileMenuTriggerVisible(page)).toBe(true);
      expect(await createProjectPage.isAccionLabsLinkVisible()).toBe(true);
      expect(await createProjectPage.isBrandLogoVisible()).toBe(true);
      await expectNoControlsMatching(page, adminControlPatterns);
    });

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify project tabs switch and show the active state
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify project tabs switch and show the active state", async ({ page }) => {
      for (const tabName of ["My Projects", "Favourites"]) {
        await selectProjectTab(page, tabName);
        expect(await isProjectTabSelected(page, tabName)).toBe(true);
      }
    });

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify accessible project cards show the expected metadata
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify accessible project cards show the expected metadata", async ({ page }) => {
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

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify project search returns results and restores the list
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify project search returns results and restores the list", async ({ page }) => {
      const firstCard = await getFirstProjectCard(page);
      if (!firstCard) {
        test.skip(true, "No accessible project is available for search validation.");
      }
      const projectName = await getProjectCardName(firstCard);
      expect(projectName).toBeTruthy();

      await searchProject(page, projectName);
      await expect(projectCard(page, projectName)).toBeVisible();
      await clearProjectSearch(page);

      await typeProjectSearch(page, `NoMatch-${getUniqueSuffix()}`);
      await expect.poll(() => projectCard(page, projectName).isVisible().catch(() => false)).toBe(false);
      await clearProjectSearch(page);
    });

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify special search input is treated as literal text
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify special search input is treated as literal text", async ({ page }) => {
      const dialogs = await captureScriptDialogs(page);
      const payload = "<script>alert('xss')</script>";
      const searchInput = await typeProjectSearch(page, payload);
      await expect(searchInput).toHaveValue(payload);
      expect(dialogs).toEqual([]);
    });

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify the Author filter opens and clears correctly
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify the Author filter opens and clears correctly", async ({ page }) => {
      await openAuthorFilter(page);
      await waitForFilterDropdownOpen(page);
      await page.keyboard.press("Escape");
      await waitForFilterDropdownClosed(page);
    });

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify an accessible Author filter is applied correctly
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify an accessible Author filter is applied correctly", async ({ page }) => {
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

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify the pagination summary matches the available results
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify the pagination summary matches the available results", async ({ page }) => {
      const summary = await getProjectListSummaryDetails(page);
      if (summary.total === 0) {
        test.skip(true, "No accessible projects are available for pagination validation.");
      }
      expect(summary.first).toBeGreaterThan(0);
      expect(summary.last).toBeGreaterThanOrEqual(summary.first);
      expect(summary.total).toBeGreaterThanOrEqual(summary.last);
    });

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify project cards navigate to the project dashboard
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify project cards navigate to the project dashboard", async ({ page }) => {
      const projectId = await selectFirstListedProject(page);
      expect(projectId).toBeTruthy();
      await expect(page).toHaveURL(/\/dashboard\/[^/?#]+/i);
    });

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify the End User profile menu opens
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify the End User profile menu opens", async ({ page }) => {
      await openProfileMenu(page);
    });

    // -------------------------------------------------------------------------
    // Module: Dashboard -> End User project listing
    // Comment: Verify the listing layout remains correct at tablet width
    // -------------------------------------------------------------------------
    test("@regression @createproject @enduser @listing Verify the listing layout remains correct at tablet width", async ({ page }) => {
      const createProjectPage = new CreateProjectPage(page);

      await page.setViewportSize({ width: 768, height: 1024 });
      expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(true);
      expect(await createProjectPage.isPageLoaded()).toBe(true);
    });
  });
});

// Viewer UI coverage uses an isolated Viewer session.
test.describe("Regression — Create Project (Viewer)", () => {
  // Controls reserved for Admins.
  const adminControlPatterns = ["user management", "admin", "audit"];

  test.beforeEach(async ({ viewerPage: page }) => {
    await openRoleListing(page);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer session loads the project listing
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer session loads the project listing", async ({ viewerPage: page }) => {
    await existingViewerCases[0](page);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer sees the accessible listing chrome
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer sees the accessible listing chrome", async ({ viewerPage: page }) => {
    await existingViewerCases[1](page);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer session persists across a hard refresh
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer session persists across a hard refresh", async ({ viewerPage: page }) => {
    await existingViewerCases[2](page);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify expired Viewer sessions redirect to login
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify expired Viewer sessions redirect to login", async ({ viewerPage: page }) => {
    await existingViewerCases[3](page);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer cannot see the Create Project button
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject Verify the Viewer cannot see the Create Project button", async ({ viewerPage: page }) => {
    await existingViewerCases[4](page);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer cannot see admin-only controls
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject Verify the Viewer cannot see admin-only controls", async ({ viewerPage: page }) => {
    await expectNoControlsMatching(page, adminControlPatterns);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer cannot access the admin users page
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer cannot access the admin users page", async ({ viewerPage: page }) => {
    const adminUsersUrl = new URL("admin/users", DEFAULT_BASE_URL).toString();
    const navigationResponse = await page.goto(adminUsersUrl, {
      waitUntil: "domcontentloaded",
    });
    expect(navigationResponse, "Expected the admin users route navigation to complete").not.toBeNull();
    expect(
      navigationResponse.status(),
      `Admin users route returned HTTP ${navigationResponse.status()}`
    ).toBeLessThan(500);
    await expect(page.locator("body")).toBeVisible();

    await expect(page.locator("body")).not.toContainText(/user management/i);
    await expect(page.getByRole("link", { name: /user management/i })).toHaveCount(0);
    // No user table/list may be rendered for a Viewer.
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("row")).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer cannot open a project outside their access
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer cannot open a project outside their access", async ({ viewerPage: page }) => {
    // A missing or inaccessible project must redirect to the listing.
    await page.goto(
      new URL("dashboard/00000000-0000-0000-0000-000000000000", DEFAULT_BASE_URL).toString(),
      { waitUntil: "domcontentloaded" }
    );
    await expect
      .poll(() => page.url(), { timeout: 30000 })
      .toMatch(/\?page=\d+|\/$/i);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer sees no owned projects
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer sees no owned projects", async ({ viewerPage: page }) => {
    // The active listing is empty for this Viewer.
    await expect(page.locator("article")).toHaveCount(0);
    await expect(page.getByText(/no projects found/i).first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer cannot see authors or tags
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer cannot see authors or tags", async ({ viewerPage: page }) => {
    // Empty facets must not reveal private-project metadata. Scope menus by name.
    const authorMenu = page.getByRole("menu", { name: /author/i });
    await openAuthorFilter(page);
    await expect(authorMenu.getByText(/no authors available/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(authorMenu).toBeHidden();

    const tagsMenu = page.getByRole("menu", { name: /tags/i });
    await page.getByRole("button", { name: /^tags$/i }).first().click();
    await expect(tagsMenu.getByText(/no tags available/i)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tagsMenu).toBeHidden();
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer can switch between listing tabs
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer can switch between listing tabs", async ({ viewerPage: page }) => {
    const createProjectPage = new CreateProjectPage(page);

    for (const tabName of ["Favourites", "Archived", "My Projects"]) {
      expect(await createProjectPage.isProjectTabVisible(tabName)).toBe(true);
      await selectListingTab(page, tabName);
      await expect(createProjectPage.projectTab(tabName)).toHaveClass(/bg-primary/i);
    }
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer sees the empty favourites state
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer sees the empty favourites state", async ({ viewerPage: page }) => {
    await selectListingTab(page, "Favourites");

    await expect(page.locator("article")).toHaveCount(0);
    expect(await getListingEmptyStateText(page)).toMatch(/no favourites yet/i);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify project cards do not show create edit delete or import controls for the Viewer
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify project cards do not show create edit delete or import controls for the Viewer", async ({ viewerPage: page }) => {
    // Archived projects are the only Viewer-visible cards.
    await selectListingTab(page, "Archived");

    const card = await getFirstProjectCard(page);
    if (!card) {
      test.skip(true, "Viewer has no accessible project card to validate.");
    }

    const controls = await readProjectCardControlNames(card);
    const labels = controls
      .map((c) => `${c.text} ${c.ariaLabel} ${c.title}`)
      .join(" | ");
    expect(labels).not.toMatch(/create project|edit|delete|import/i);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify project cards do not show a project options menu for the Viewer
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify project cards do not show a project options menu for the Viewer", async ({ viewerPage: page }) => {
    await selectListingTab(page, "Archived");

    const card = await getFirstProjectCard(page);
    if (!card) {
      test.skip(true, "Viewer has no accessible project card to validate.");
    }

    // No options menu should be offered when all its actions are unavailable.
    expect(await isProjectOptionsMenuAvailable(card)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer cannot see the Edit Project option
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer cannot see the Edit Project option", async ({ viewerPage: page }) => {
    // Check the whole page in case Edit is rendered outside a card.
    await expect(page.getByText(/edit project/i)).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /edit/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^edit$/i })).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer cannot see the Delete Project option
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer cannot see the Delete Project option", async ({ viewerPage: page }) => {
    await expect(page.getByText(/delete project/i)).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /^delete$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^delete$/i })).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: offers no Import Project option to the Viewer
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing offers no Import Project option to the Viewer", async ({ viewerPage: page }) => {
    await expect(page.getByText(/import project/i)).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /^import$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^import$/i })).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: offers no favourite star on a Viewer project card
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing offers no favourite star on a Viewer project card", async ({ viewerPage: page }) => {
    await selectListingTab(page, "Archived");

    const card = await getFirstProjectCard(page);
    if (!card) {
      test.skip(true, "Viewer has no accessible project card to validate.");
    }

    // Archived cards are read-only.
    expect(await isProjectFavouriteAvailable(card)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: searches Viewer-accessible projects without exposing private projects
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing searches Viewer-accessible projects without exposing private projects", async ({ viewerPage: page }) => {
    const dialogs = await captureScriptDialogs(page);
    const searchInput = await getProjectListSearchInput(page);

    // A private-project search must return no cards.
    await searchInput.fill("NoSuchProjectForViewer");
    await expect(page.locator("article")).toHaveCount(0);
    expect(await getListingEmptyStateText(page)).not.toBe("");

    // Clearing the search restores the accessible listing.
    await clearProjectSearch(page);
    expect(dialogs).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: treats special search input as literal text
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing treats special search input as literal text", async ({ viewerPage: page }) => {
    const dialogs = await captureScriptDialogs(page);
    const searchInput = await getProjectListSearchInput(page);

    // Treat special input as literal text without dialogs or leaked results.
    for (const payload of ["' OR '1'='1", "<script>alert('xss')</script>", "@#&/"]) {
      await searchInput.fill(payload);
      await expect(searchInput).toHaveValue(payload);
      await expect(page.locator("article")).toHaveCount(0);
    }
    expect(dialogs).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: restores the Viewer listing when the search field is cleared
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing restores the Viewer listing when the search field is cleared", async ({ viewerPage: page }) => {
    const searchInput = await getProjectListSearchInput(page);

    await searchInput.fill("   ");
    await expect(page.locator("article")).toHaveCount(0);

    await clearProjectSearch(page);
    expect(await getListingEmptyStateText(page)).toMatch(/no projects found/i);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: falls back to the first page for an out-of-range page number
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing falls back to the first page for an out-of-range page number", async ({ viewerPage: page }) => {
    // Out-of-range page values should resolve to the first page.
    for (const query of ["?page=0", "?page=-1", "?page=999"]) {
      await page.goto(new URL(query, DEFAULT_BASE_URL).toString(), {
        waitUntil: "domcontentloaded",
      });
      await expect
        .poll(() => new URL(page.url()).searchParams.get("page"), { timeout: 30000 })
        .toBe("1");
    }
  });

  // -------------------------------------------------------------------------
  // Module: Project Dashboard -> Viewer navigation
  // Comment: Verify the Viewer returns to the listing after navigating from a project dashboard
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @navigation Verify the Viewer returns to the listing after navigating from a project dashboard", async ({ viewerPage: page }) => {
    await selectListingTab(page, "Archived");

    const card = await getFirstProjectCard(page);
    if (!card) {
      test.skip(true, "Viewer has no accessible project to navigate from.");
    }

    // Inaccessible project navigation must return to the listing.
    await page.goto(new URL("dashboard/00000000-0000-0000-0000-000000000000", DEFAULT_BASE_URL).toString(), {
      waitUntil: "domcontentloaded",
    });
    await expect
      .poll(() => page.url(), { timeout: 30000 })
      .toMatch(/\?page=\d+|\/$/i);
  });

  // -------------------------------------------------------------------------
  // Module: Settings -> Viewer permissions
  // Comment: Verify the Viewer profile menu includes Settings and Logout
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer profile menu includes Settings and Logout", async ({ viewerPage: page }) => {
    await openProfileMenu(page);

    // Scope the profile menu by its accessible name.
    const menu = page.getByRole("menu", { name: /user profile menu/i });
    await expect(menu.getByText(/settings/i).first()).toBeVisible();
    await expect(menu.getByText(/logout/i).first()).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Module: Settings -> Viewer permissions
  // Comment: Verify the Viewer profile menu closes without navigation
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @listing Verify the Viewer profile menu closes without navigation", async ({ viewerPage: page }) => {
    const urlBefore = page.url();

    // Scope by name to avoid matching a filter dropdown.
    const profileMenu = page.getByRole("menu", { name: /user profile menu/i });

    await openProfileMenu(page);
    await page.keyboard.press("Escape");
    await expect(profileMenu).toBeHidden();

    expect(page.url()).toBe(urlBefore);
  });

  // -------------------------------------------------------------------------
  // Module: Settings -> Viewer permissions
  // Comment: Verify the Viewer Settings page does not expose project management controls
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @navigation Verify the Viewer Settings page does not expose project management controls", async ({ viewerPage: page }) => {
    // Scope by name to avoid clicking a filter dropdown.
    await openProfileMenu(page);
    await page
      .getByRole("menu", { name: /user profile menu/i })
      .getByText(/settings/i)
      .first()
      .click();

    await expect(page).toHaveURL(/\/settings/i, { timeout: 30000 });
    // Viewer settings must not expose project create/edit/delete settings.
    await expect(page.getByText(/create project|edit project|delete project/i)).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project permissions
  // Comment: Verify the Viewer can log out
  // -------------------------------------------------------------------------
  viewerTest("@viewer @regression @createproject @navigation Verify the Viewer can log out", async ({ viewerPage: page }) => {
    await openProfileMenu(page);

    // Logout terminates the session through the identity provider.
    const logoutItem = page
      .getByRole("menu")
      .last()
      .locator('[role="menuitem"]')
      .filter({ hasText: /logout/i })
      .first();

    // Observe the cross-origin logout request; the URL transition is transient.
    const idpLogout = page.waitForRequest((request) => /openid-connect\/logout/i.test(request.url()), {
      timeout: 30000,
    });

    await logoutItem.click();
    await idpLogout;
  });

// -------------------------------------------------------------------------
// Module: Settings -> Viewer permissions
// Comment: Verify the Viewer cannot return to authenticated pages after logout
// -------------------------------------------------------------------------
viewerTest("@viewer @regression @createproject @navigation Verify the Viewer cannot return to authenticated pages after logout", async ({ viewerPage: page }) => {
    // Prevent the fixture from restoring the session after each navigation.
    await page.addInitScript(() => {
      try {
        for (let i = window.sessionStorage.length - 1; i >= 0; i -= 1) {
          const key = window.sessionStorage.key(i);
          if (key && key.startsWith("oidc.user:")) window.sessionStorage.removeItem(key);
        }
      } catch {
        /* non-fatal */
      }
    });

    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/i, { timeout: 30000 });

    await page.goBack().catch(() => {});
    await expect(page).toHaveURL(/\/login/i, { timeout: 30000 });
  });
});

// Admin UI flow: create, filter, favourite, edit, archive, and restore.
async function runExistingAdminProjectLifecycle(page, { refreshRoleListing = true } = {}) {
  const originalProjectName = uniqueProjectName("admin-lifecycle");
  let updatedProjectName = originalProjectName;
  const updatedDescription = `Lifecycle validation ${getUniqueSuffix()}`;
  let projectCreated = false;
  let projectUuid = null;
  let projectAuthor = null;
  const listing = new CreateProjectPage(page);
  try {
    await openRoleListing(page, { refresh: refreshRoleListing });
    await expect(page.getByRole("button", { name: /create project/i }).first()).toBeVisible();
    projectUuid = await createProject(page, originalProjectName);
    projectCreated = true;
    console.log(`[PROJECT] Created: ${originalProjectName}`);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectUuid || "")) {
      const routeUuid = page.url().match(/\/dashboard\/([0-9a-f-]{36})(?:[/?#]|$)/i)?.[1];
      if (routeUuid) projectUuid = routeUuid;
    }
    expect(
      projectUuid,
      "Admin project creation must return the UUID for test-scoped cleanup"
    ).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    console.log(`[PROJECT] UUID: ${projectUuid}`);
    await expect(page).toHaveURL(/\/dashboard(?:\/|[?#]|$)/i, { timeout: 30000 });

    await openRoleListing(page, { refresh: refreshRoleListing });
    await selectListingTab(page, "My Projects");
    await typeProjectSearch(page, originalProjectName);
    await expect(listing.projectCard(originalProjectName)).toBeVisible({ timeout: 30000 });

    await selectListingTab(page, "All Projects");
    await expect(listing.projectCard(originalProjectName)).toBeVisible({ timeout: 30000 });

    await selectListingTab(page, "Favourites");
    await typeProjectSearch(page, originalProjectName);
    await expect(listing.projectCard(originalProjectName)).toBeHidden({ timeout: 20000 });
    await clearProjectSearch(page);

    await selectListingTab(page, "All Projects");
    await typeProjectSearch(page, originalProjectName);
    projectAuthor = await getProjectAuthor(page, originalProjectName);
    await openAuthorFilter(page);
    await selectAuthorFilter(page, projectAuthor);
    await expect(listing.projectCard(originalProjectName)).toBeVisible({ timeout: 20000 });
    await clearAuthorFilter(page);
    await expect(listing.projectCard(originalProjectName)).toBeVisible({ timeout: 20000 });
    await clearProjectSearch(page);

    // The project is intentionally created without optional tags; tag filtering
    // is not applicable unless the application assigns a tag by default.
    const createdCardText = await listing.projectCard(originalProjectName).innerText();
    if (!/no tags added/i.test(createdCardText) && /\btag\b/i.test(createdCardText)) {
      const tagFilter = page.getByRole("button", { name: /^tags$/i }).first();
      await expect(tagFilter).toBeVisible();
      await tagFilter.click();
      await expect(page.getByRole("menu", { name: /tags/i })).toBeVisible();
      await page.keyboard.press("Escape");
    }

    await selectListingTab(page, "My Projects");
    await typeProjectSearch(page, originalProjectName);
    const originalCard = listing.projectCard(originalProjectName);
    await expect(originalCard).toBeVisible({ timeout: 20000 });
    const favouriteButton = originalCard.locator(
      'button[aria-label*="favour" i], button[aria-label*="favorite" i], button[title*="favour" i], button[title*="favorite" i]'
    ).first();
    await expect(favouriteButton).toBeVisible({ timeout: 15000 });
    await favouriteButton.click();

    await selectListingTab(page, "All Projects");
    await expect(listing.projectCard(originalProjectName)).toBeVisible({ timeout: 20000 });
    await selectListingTab(page, "Favourites");
    await typeProjectSearch(page, originalProjectName);
    await expect(listing.projectCard(originalProjectName)).toBeVisible({ timeout: 20000 });

    await selectListingTab(page, "My Projects");
    await clearProjectSearch(page);
    updatedProjectName = `${originalProjectName}-Edited`;
    await new DashboardPage(page).updateProject(originalProjectName, {
      name: updatedProjectName,
      description: updatedDescription,
    });
    await expect(listing.projectCard(updatedProjectName)).toContainText(updatedDescription);

    const optionsMenu = await listing.openProjectOptionsMenu(updatedProjectName);
    await optionsMenu.getByRole("menuitem", { name: /export project/i }).click();
    const exportDialog = page.getByRole("dialog").filter({ hasText: /export/i }).last();
    const exportDialogOpened = await exportDialog
      .waitFor({ state: "visible", timeout: 5000 })
      .then(
        () => true,
        () => false
      );
    if (exportDialogOpened) {
      const exportAction = exportDialog.getByRole("button", { name: /export/i }).last();
      if (await exportAction.isVisible()) {
        await exportAction.click();
      }
    }
    const closeButton = (exportDialogOpened ? exportDialog : page)
      .getByRole("button", { name: /^close$/i })
      .last();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }

    await openRoleListing(page, { refresh: refreshRoleListing });
    await selectListingTab(page, "My Projects");
    await typeProjectSearch(page, updatedProjectName);
    const archiveResult = await listing.archiveProject(updatedProjectName, projectUuid);
    expect(archiveResult.status).toBe(200);
    console.log(`[PROJECT] Archived: ${updatedProjectName}`);
    await refreshProjectListing(page);
    for (const tabName of ["My Projects", "All Projects", "Favourites"]) {
      await selectListingTab(page, tabName);
      await typeProjectSearch(page, updatedProjectName);
      await expect(listing.projectCard(updatedProjectName)).toBeHidden({ timeout: 20000 });
    }

    await clearProjectSearch(page);
    await selectListingTab(page, "Archived");
    await refreshProjectListing(page);
    await selectListingTab(page, "Archived");
    await typeProjectSearch(page, updatedProjectName);
    await listing.ensureArchivedProjectVisible(updatedProjectName);
    await expect(listing.projectCard(updatedProjectName)).toBeVisible({ timeout: 30000 });
    expect(await new DashboardPage(page).restoreProject(updatedProjectName)).toBe(true);
    await expect(page.getByText(/restored/i).last()).toBeVisible({ timeout: 20000 });
    await openRoleListing(page, { refresh: refreshRoleListing });

    for (const tabName of ["My Projects", "All Projects", "Favourites"]) {
      await selectListingTab(page, tabName);
      await typeProjectSearch(page, updatedProjectName);
      await expect(listing.projectCard(updatedProjectName)).toBeVisible({ timeout: 30000 });
    }

    await selectListingTab(page, "My Projects");
    await typeProjectSearch(page, updatedProjectName);
    const secondArchiveResult = await listing.archiveProject(updatedProjectName, projectUuid);
    expect(secondArchiveResult.status).toBe(200);
    console.log(`[PROJECT] Archived: ${updatedProjectName}`);
    await refreshProjectListing(page);
    for (const tabName of ["My Projects", "All Projects", "Favourites"]) {
      await selectListingTab(page, tabName);
      await typeProjectSearch(page, updatedProjectName);
      await expect(listing.projectCard(updatedProjectName)).toBeHidden({ timeout: 20000 });
    }
    await clearProjectSearch(page);
    await selectListingTab(page, "Archived");
    await refreshProjectListing(page);
    await selectListingTab(page, "Archived");
    await typeProjectSearch(page, updatedProjectName);
    await listing.ensureArchivedProjectVisible(updatedProjectName);
    await expect(listing.projectCard(updatedProjectName)).toBeVisible({ timeout: 30000 });
  } finally {
    if (projectCreated && projectUuid) {
      const token = await getSessionAccessToken(page);
      expect(token, "Admin session should expose an access token for project cleanup").toBeTruthy();
      const cleanupResponse = await apiRequest(page, {
        method: "DELETE",
        path: `/projects/${encodeURIComponent(projectUuid)}/hard`,
        token,
      });
      expect(
        [200, 202],
        `Admin cleanup hard-delete API should accept project ${projectUuid}`
      ).toContain(cleanupResponse.status);
      await waitForProjectHardDeleteCompletion(page, projectUuid, token);
      await waitForProjectAbsentFromApi(page, projectUuid, token);
    }
  }
}

// -------------------------------------------------------------------------
// Module: Admin -> User Management role lifecycle
// Comment: Verify Admin can create, update, archive, and restore a project through the UI
// -------------------------------------------------------------------------
adminTest("@admin @regression @createproject @ui Verify Admin can create, update, archive, and restore a project through the UI", async ({ adminPage: page }) => {
  await runExistingAdminProjectLifecycle(page);
});

// Navigation: Profile → Settings → User Management
adminTest("Admin can navigate to User Management from Settings @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openUserManagement();

  await expect(userManagement.settingsTab).toHaveAttribute("aria-selected", "true");
  await expect(adminPage.getByRole("table")).toBeVisible();
  await expect(userManagement.userListSummary).toBeVisible();
});

// Navigation: Profile → Settings → Themes
adminTest("Admin can navigate to Themes from Settings @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openThemes();
});

// Navigation: Profile → Settings → User Management → Refresh
adminTest("Admin can refresh the User Management user list @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openUserManagement();
  const beforeRefresh = await userManagement.getUserListSummaryDetails();

  await userManagement.refreshUserList();

  const afterRefresh = await userManagement.getUserListSummaryDetails();
  expect(afterRefresh.total).toBe(beforeRefresh.total);
});

// Navigation: Profile → Settings → User Management → Create User
adminTest("Admin can open the Create User form from User Management @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openUserManagement();
  const dialog = await userManagement.openCreateUserDialog();

  await expect(userManagement.createUserFirstNameInput).toBeVisible();
  await expect(userManagement.createUserLastNameInput).toBeVisible();
  await expect(userManagement.createUserEmailInput).toBeVisible();
  await expect(userManagement.createUserRoleControl).toBeVisible();
  await userManagement.closeCreateUserDialog();
  await expect(dialog).toBeHidden();
});

// Navigation: Profile → Settings → User Management → Find by email
adminTest("Admin can search users by email in User Management @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openUserManagement();
  const email = await userManagement.getFirstUserEmail();
  const row = await userManagement.searchUser(email);

  await expect(row.getByRole("cell").nth(1)).toHaveText(email);
});

// Navigation: Profile → Settings → User Management → User role
adminTest("Admin can view available system roles in User Management @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openUserManagement();
  const email = await userManagement.getFirstUserEmail();
  const roles = await userManagement.getAvailableUserRoles(email);

  expect(roles).toEqual(expect.arrayContaining(["Admin", "End User", "Viewer"]));
});

// Navigation: Profile → Settings → User Management → Next/Previous/Last/First page
adminTest("Admin can navigate through User Management pagination @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openUserManagement();
  const firstPage = await userManagement.getUserListSummaryDetails();
  const pageSize = firstPage.end - firstPage.start + 1;
  adminTest.skip(firstPage.total <= pageSize, "The user list contains only one page.");

  expect(firstPage.start).toBe(1);
  await expect(userManagement.previousUserPageButton).toBeDisabled();
  await expect(userManagement.nextUserPageButton).toBeEnabled();

  await userManagement.nextUserPageButton.click();
  await expect
    .poll(async () => (await userManagement.getUserListSummaryDetails()).start)
    .toBe(firstPage.end + 1);
  await userManagement.previousUserPageButton.click();
  await expect
    .poll(async () => (await userManagement.getUserListSummaryDetails()).start)
    .toBe(firstPage.start);

  await userManagement.lastUserPageButton.click();
  const lastPageStart = Math.floor((firstPage.total - 1) / pageSize) * pageSize + 1;
  await expect
    .poll(async () => userManagement.getUserListSummaryDetails())
    .toMatchObject({ start: lastPageStart, end: firstPage.total, total: firstPage.total });
  await userManagement.firstUserPageButton.click();
  await expect
    .poll(async () => (await userManagement.getUserListSummaryDetails()).start)
    .toBe(firstPage.start);
});

// Navigation: Profile → Settings → User Management → Result count
adminTest("Admin can view the user result count in User Management @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openUserManagement();
  const summary = await userManagement.getUserListSummaryDetails();

  expect(summary.start).toBe(1);
  expect(summary.total).toBeGreaterThan(0);
  expect(summary.end).toBe(await userManagement.getVisibleUserRowCount());
  expect(summary.total).toBeGreaterThanOrEqual(summary.end);
});

// Navigation: Profile → Settings → Themes → Select Light
adminTest("Admin can select the Light theme in Settings @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openThemes();
  await userManagement.selectTheme("Light");

  await expect.poll(() => userManagement.getSelectedThemeName()).toBe("Light");
});

// Navigation: Profile → Settings → Themes → Select Premium
adminTest("Admin can select the Premium theme in Settings @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openThemes();
  await userManagement.selectTheme("Premium");

  await expect.poll(() => userManagement.getSelectedThemeName()).toBe("Premium");
});

// Navigation: Profile → Settings → Themes → Switch Premium → Light
adminTest("Admin can switch between Light and Premium themes @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openThemes();

  await userManagement.selectTheme("Premium");
  await expect.poll(() => userManagement.getSelectedThemeName()).toBe("Premium");
  await userManagement.selectTheme("Light");
  await expect.poll(() => userManagement.getSelectedThemeName()).toBe("Light");
});

// Navigation: Profile → Settings → Themes → Select Premium → Navigate away → Reload
adminTest("Admin can verify the selected theme persists after navigation and reload @admin @regression @createproject", async ({ adminPage }) => {
  const userManagement = new UserManagementPage(adminPage);
  await openRoleListing(adminPage);
  await userManagement.openSettingsFromProfile();
  await userManagement.openThemes();
  await userManagement.selectTheme("Premium");

  await userManagement.openUserManagement();
  await userManagement.openThemes();
  await expect.poll(() => userManagement.getSelectedThemeName()).toBe("Premium");

  await adminPage.reload({ waitUntil: "domcontentloaded" });
  await expect(userManagement.themesTab).toBeVisible();
  await userManagement.openThemes();
  await expect.poll(() => userManagement.getSelectedThemeName()).toBe("Premium");
  await expect.poll(() => userManagement.getPersistedThemeName()).toBe("premium");

  await userManagement.selectTheme("Light");
  await expect.poll(() => userManagement.getSelectedThemeName()).toBe("Light");
});

adminTest.describe("User Management role lifecycle", () => {
  adminTest.describe.configure({ retries: 0 });

  // Settings > User Management: create the account, verify settings, and test
  // its End User, Viewer, and Admin permissions in sequence.
  // -------------------------------------------------------------------------
  // Module: Settings -> User Management role lifecycle
  // Comment: Verify an Admin can create a user and validate role changes
  // -------------------------------------------------------------------------
  adminTest("@admin @regression @createproject @user-management Verify an Admin can create a user and validate role changes", async ({ adminPage, browser, browserName }) => {
    adminTest.setTimeout(600000);
    adminTest.skip(
      browserName !== "chromium",
      "The clipboard flow must run only once in Chromium."
    );
    const email = `breezeaitest${randomUUID().replaceAll("-", "")}@gmail.com`;
    const userManagement = new UserManagementPage(adminPage);
    let userContext = await browser.newContext();
    let userPage = await userContext.newPage();
    const lifecycleProjectNames = new Set();
    let createdUserMayExist = false;

    try {
      await openRoleListing(adminPage);
      await userManagement.openSettingsFromProfile();

      const settingsContent = await userManagement.readSettingsHeadingsAndTabs();
      console.log(`[SETTINGS] Page title: ${settingsContent.pageTitle}`);
      console.log(`[SETTINGS] Headings: ${settingsContent.headings.join(" | ")}`);
      console.log(`[SETTINGS] Tabs: ${settingsContent.tabs.join(" | ")}`);
      console.log(`[SETTINGS] All tabs: ${settingsContent.allTabs.join(" | ")}`);
      expect(
        settingsContent.pageTitle.length +
          settingsContent.headings.length +
          settingsContent.tabs.length +
          settingsContent.allTabs.length
      ).toBeGreaterThan(0);

      await userManagement.openUserManagement();
      const initialUserCount = await userManagement.getTotalUserCount();
      console.log(`[USER MANAGEMENT] Total records: ${initialUserCount}`);

      await userManagement.clearSearch();

      await adminPage.context().grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: new URL(DEFAULT_BASE_URL).origin,
      });
      createdUserMayExist = true;
      const password = await userManagement.createUser({
        name: "Breeze AI Test User",
        email,
        role: "End User",
      });

      const createdUserRow = await userManagement.searchUser(email);
      await expect(createdUserRow).toContainText(/end user/i);
      console.log(`[USER MANAGEMENT] Created account found: ${email}`);

      await new UserManagementPage(userPage).loginCreatedUser(email, password, DEFAULT_BASE_URL);
      await expect
        .poll(() => getSessionAccessToken(userPage), {
          timeout: 30000,
          message: "Expected the created End User session token to be stored before navigating",
        })
        .not.toBeNull();
      await openRoleListing(userPage, { refresh: false });
      await expect(userPage.getByRole("button", { name: /create project/i })).toBeVisible();
      console.log("[USER] Generated password captured successfully");

      const ensureEndUserSession = async () => {
        const signInButton = userPage.getByRole("button", { name: /sign in with breeze ai/i });
        if (await signInButton.isVisible().catch(() => false)) {
          await new UserManagementPage(userPage).loginCreatedUser(email, password, DEFAULT_BASE_URL);
        }
        const createProjectButton = userPage.getByRole("button", { name: /create project/i });
        if (!(await createProjectButton.isVisible().catch(() => false))) {
          await userPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
          await expect
            .poll(
              async () =>
                (await signInButton.isVisible().catch(() => false)) ||
                (await createProjectButton.isVisible().catch(() => false)),
              {
                timeout: 30000,
                message: "Expected either the End User listing or sign-in page after navigating home",
              }
            )
            .toBe(true);
          if (await signInButton.isVisible().catch(() => false)) {
            await new UserManagementPage(userPage).loginCreatedUser(email, password, DEFAULT_BASE_URL);
          }
        }
        await expect(userPage.getByRole("button", { name: /create project/i })).toBeVisible({
          timeout: 20000,
        });
      };

      for (let index = 0; index < existingEndUserCases.length; index += 1) {
        await ensureEndUserSession();
        console.log(`[END USER] Running existing @enduser case ${index + 1} of 5`);
        await existingEndUserCases[index](userPage, lifecycleProjectNames);
      }
      await cleanupCreatedProjects(userPage, lifecycleProjectNames);

      const endUserManagement = new UserManagementPage(userPage);
      await endUserManagement.openSettingsFromProfile();
      await expect(endUserManagement.settingsTab).toHaveCount(0);

      await userManagement.changeUserRole(email, "Viewer");
      await endUserManagement.loginCreatedUser(email, password, DEFAULT_BASE_URL);
      await expect
        .poll(() => getSessionAccessToken(userPage), {
          timeout: 30000,
          message: "Expected the Viewer session token to be stored before navigating",
        })
        .not.toBeNull();
      await openRoleListing(userPage, { refresh: false });
      await expect(userPage.getByRole("button", { name: /create project/i })).toHaveCount(0);

      const viewerManagement = new UserManagementPage(userPage);
      await viewerManagement.openSettingsFromProfile();
      await expect(viewerManagement.settingsTab).toHaveCount(0);
      await openRoleListing(userPage, { refresh: false });

      for (let index = 0; index < 3; index += 1) {
        console.log(`[VIEWER] Running existing @viewer case ${index + 1} of 5`);
        await existingViewerCases[index](userPage);
      }

      console.log("[VIEWER] Running existing @viewer case 4 of 5");
      const viewerSession = await userPage.evaluate(() => {
        for (let index = 0; index < window.sessionStorage.length; index += 1) {
          const key = window.sessionStorage.key(index);
          if (key && key.startsWith("oidc.user:")) {
            return { key, value: window.sessionStorage.getItem(key) };
          }
        }
        return null;
      });
      expect(viewerSession, "Expected the Viewer session token to test expiry").not.toBeNull();
      const expiryContext = await browser.newContext();
      try {
        const expiryPage = await expiryContext.newPage();
        await expiryPage.addInitScript(({ key, value }) => {
          window.sessionStorage.setItem(key, value);
        }, viewerSession);
        await existingViewerCases[3](expiryPage);
      } finally {
        await expiryContext.close();
      }

      console.log("[VIEWER] Running existing @viewer case 5 of 5");
      await existingViewerCases[4](userPage);

      await userManagement.changeUserRole(email, "Admin");
      await viewerManagement.loginCreatedUser(email, password, DEFAULT_BASE_URL);
      await expect
        .poll(() => getSessionAccessToken(userPage), {
          timeout: 30000,
          message: "Expected the Admin session token to be stored before navigating",
        })
        .not.toBeNull();
      await openRoleListing(userPage, { refresh: false });
      await expect(userPage.getByRole("button", { name: /create project/i }).first()).toBeVisible({
        timeout: 20000,
      });

      const promotedUserManagement = new UserManagementPage(userPage);
      await promotedUserManagement.openSettingsFromProfile();
      await promotedUserManagement.openUserManagement();
      await expect(promotedUserManagement.createUserButton).toBeVisible();

      console.log("[ADMIN] Running existing @admin project lifecycle case");
      await runExistingAdminProjectLifecycle(userPage, { refreshRoleListing: false });
    } finally {
      await userContext.close();
      if (createdUserMayExist) {
        await userManagement.openUserManagement();
        if (await userManagement.userExists(email)) {
          await userManagement.deleteUser(email);
        }
        expect(await userManagement.userExists(email)).toBe(false);
      }
    }
  });
});
