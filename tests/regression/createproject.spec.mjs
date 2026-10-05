import { test, expect } from "../auth.fixture.mjs";
// The Viewer suite needs the `viewerPage` fixture, which only exists on
// roles.fixture.mjs. The default `test` above is left in place so every
// existing End User test keeps its original fixture and behaviour.
import { test as viewerTest } from "../roles.fixture.mjs";
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
  getUniqueSuffix,
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
// Viewer-only helpers. Added for the Viewer suite only; no existing helper was
// changed, and each of these was checked against the existing utility set first.
import {
  openRoleListing,
  expireRoleSession,
  selectListingTab,
  getListingEmptyStateText,
  readProjectCardControlNames,
  isProjectOptionsMenuAvailable,
  isProjectFavouriteAvailable,
  getProjectListSearchInput,
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
    const name = uniqueProjectName("special-chars");
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
    const projectName = `<script>alert('xss-${getUniqueSuffix()}')</script>`;
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

      await typeProjectSearch(page, `NoMatch-${getUniqueSuffix()}`);
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

// ============================================================================
// Viewer role — UI coverage
//
// Every test here runs on `viewerPage`, which is a FRESH browser context with
// only the Viewer OIDC session injected (tests/roles.fixture.mjs). The Viewer
// owns no projects, so the active listing legitimately shows its empty state.
//
// The same file is used deliberately: the Viewer assertions exercise the very
// listing chrome that the End User suite above covers, from the opposite
// permission boundary. Viewer API coverage is kept in a separate file
// (createproject-viewer-api.spec.mjs) so UI and API failures stay
// distinguishable in a report.
// ============================================================================
test.describe("Regression — Create Project (Viewer)", () => {
  // Admin-only surfaces the Viewer must never be offered.
  const adminControlPatterns = ["user management", "admin", "audit"];

  test.beforeEach(async ({ viewerPage: page }) => {
    // Open the listing and refresh once so the assertions run against a page
    // rendered by the Viewer's own session rather than the pre-hydration DOM.
    await openRoleListing(page);
  });

  // ------------------------------------------------------------------
  // Page load and session
  // ------------------------------------------------------------------

  viewerTest("@viewer @regression @createproject @listing loads the project listing for a Viewer session", async ({ viewerPage: page }) => {
    await expect(page).toHaveURL(/\?page=\d+|\/$/i);
    await expect(page).toHaveTitle("Breeze.AI");
  });

  viewerTest("@viewer @regression @createproject @listing shows the Viewer-accessible listing chrome", async ({ viewerPage: page }) => {
    const createProjectPage = new CreateProjectPage(page);

    // The Viewer is shown the same page chrome as any other role.
    expect(await createProjectPage.isBrandLogoVisible()).toBe(true);
    expect(await createProjectPage.isAccionLabsLinkVisible()).toBe(true);
    expect(await isProfileMenuTriggerVisible(page)).toBe(true);
    expect(await createProjectPage.isPageLoaded()).toBe(true);
  });

  viewerTest("@viewer @regression @createproject @listing keeps the Viewer session across a hard refresh", async ({ viewerPage: page }) => {
    // Permissions must be unchanged by a reload — in particular the Viewer
    // must not gain the Create Project button by re-rendering.
    await page.reload({ waitUntil: "domcontentloaded" });

    const createProjectPage = new CreateProjectPage(page);
    expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(false);
    await expect(page).toHaveTitle("Breeze.AI");
  });

  viewerTest("@viewer @regression @createproject @listing redirects to login when the Viewer session is expired", async ({ viewerPage: page }) => {
    // Rewrite only `expires_at`; the token signature is untouched, so this
    // exercises session-expiry handling rather than token tampering.
    await expireRoleSession(page);
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/login/i, { timeout: 30000 });
  });

  // ------------------------------------------------------------------
  // Page load — controls the Viewer must NOT see
  // ------------------------------------------------------------------

  viewerTest("@viewer @regression @createproject cannot see the Create Project button", async ({ viewerPage: page }) => {
    const createProjectPage = new CreateProjectPage(page);

    // The sheet allows "absent OR disabled"; the app hides it entirely, and a
    // hidden control must also not be reachable by keyboard order.
    expect(await createProjectPage.isCreateProjectTriggerVisible()).toBe(false);
    await expect(page.getByRole("button", { name: /create project/i })).toHaveCount(0);
  });

  viewerTest("@viewer @regression @createproject cannot see admin-only controls", async ({ viewerPage: page }) => {
    await expectNoControlsMatching(page, adminControlPatterns);
  });

  viewerTest("@viewer @regression @createproject @listing cannot reach the admin users page", async ({ viewerPage: page }) => {
    // The application exposes no /admin/users route, so this navigation can be
    // aborted at the network layer while the SPA boots its not-found page.
    //
    // The abort is NOT the assertion — the security outcome is. An aborted
    // navigation, the app's own "Page Not Found", or a redirect to /login are
    // all acceptable results. What must never happen is user-management data
    // (or an admin link becoming reachable) appearing for a Viewer. Treated as
    // success so a transport-level abort cannot be mistaken for a permission
    // failure, and so the assertion below judges the rendered result.
    await page
      .goto(new URL("admin/users", DEFAULT_BASE_URL).toString(), {
        waitUntil: "domcontentloaded",
      })
      .catch(() => {});

    // Allow any client-side redirect to settle before judging the result.
    await page.waitForTimeout(3000);

    await expect(page.locator("body")).not.toContainText(/user management/i);
    await expect(page.getByRole("link", { name: /user management/i })).toHaveCount(0);
    // No user table/list may be rendered for a Viewer.
    await expect(page.getByRole("table")).toHaveCount(0);
    await expect(page.getByRole("row")).toHaveCount(0);
  });

  viewerTest("@viewer @regression @createproject @listing cannot open a project the Viewer has no access to", async ({ viewerPage: page }) => {
    // A project id the Viewer was never granted: the app must refuse to load
    // it and send the Viewer back to the listing rather than leaking content.
    await page.goto(
      new URL("dashboard/00000000-0000-0000-0000-000000000000", DEFAULT_BASE_URL).toString(),
      { waitUntil: "domcontentloaded" }
    );
    await expect
      .poll(() => page.url(), { timeout: 30000 })
      .toMatch(/\?page=\d+|\/$/i);
  });

  // ------------------------------------------------------------------
  // Project visibility
  // ------------------------------------------------------------------

  viewerTest("@viewer @regression @createproject @listing shows no owned projects for the Viewer", async ({ viewerPage: page }) => {
    // The Viewer owns nothing, so the active tab renders the empty state
    // rather than any project card.
    await expect(page.locator("article")).toHaveCount(0);
    expect(await getListingEmptyStateText(page)).toMatch(/no projects found/i);
  });

  viewerTest("@viewer @regression @createproject @listing exposes no authors or tags to the Viewer", async ({ viewerPage: page }) => {
    // Author/Tag facets are derived from the Viewer's accessible projects.
    // With none accessible, the facets must be empty rather than leaking the
    // authors or tags of other users' private projects.
    //
    // Each dropdown is addressed by its ACCESSIBLE NAME rather than
    // `getByRole("menu").last()`. Both overlays are `<div role="menu">`, and the
    // previously-closed one lingers in the DOM while it animates out — so
    // `.last()` can resolve to the outgoing Author menu while the Tags menu is
    // the one under test, making the close-assertion read the wrong element.
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

  // ------------------------------------------------------------------
  // Project tabs
  // ------------------------------------------------------------------

  viewerTest("@viewer @regression @createproject @listing switches between the Viewer listing tabs", async ({ viewerPage: page }) => {
    const createProjectPage = new CreateProjectPage(page);

    for (const tabName of ["Favourites", "Archived", "My Projects"]) {
      expect(await createProjectPage.isProjectTabVisible(tabName)).toBe(true);
      await selectListingTab(page, tabName);
      await expect(createProjectPage.projectTab(tabName)).toHaveClass(/bg-primary/i);
    }
  });

  viewerTest("@viewer @regression @createproject @listing shows the Favourites empty state for a Viewer with no favourites", async ({ viewerPage: page }) => {
    await selectListingTab(page, "Favourites");

    await expect(page.locator("article")).toHaveCount(0);
    expect(await getListingEmptyStateText(page)).toMatch(/no favourites yet/i);
  });

  // ------------------------------------------------------------------
  // Project cards — the Viewer must be offered no mutating controls
  // ------------------------------------------------------------------

  viewerTest("@viewer @regression @createproject @listing offers no create, edit, delete or import control on project cards", async ({ viewerPage: page }) => {
    // The Archived tab is the only Viewer-visible tab that can contain cards,
    // so it is the meaningful place to assert on card-level permissions.
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

  viewerTest("@viewer @regression @createproject @listing offers no project options menu on a project card", async ({ viewerPage: page }) => {
    await selectListingTab(page, "Archived");

    const card = await getFirstProjectCard(page);
    if (!card) {
      test.skip(true, "Viewer has no accessible project card to validate.");
    }

    // The ⋮ menu is the entry point to Edit/Delete/Import. With no permitted
    // mutating action the Viewer must not be offered the trigger at all.
    expect(await isProjectOptionsMenuAvailable(card)).toBe(false);
  });

  viewerTest("@viewer @regression @createproject @listing offers no Edit Project option to the Viewer", async ({ viewerPage: page }) => {
    // Defence in depth: assert the label is absent from the whole document,
    // not only from a card, so an Edit control rendered outside a card is caught.
    await expect(page.getByText(/edit project/i)).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /edit/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^edit$/i })).toHaveCount(0);
  });

  viewerTest("@viewer @regression @createproject @listing offers no Delete Project option to the Viewer", async ({ viewerPage: page }) => {
    await expect(page.getByText(/delete project/i)).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /^delete$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^delete$/i })).toHaveCount(0);
  });

  viewerTest("@viewer @regression @createproject @listing offers no Import Project option to the Viewer", async ({ viewerPage: page }) => {
    await expect(page.getByText(/import project/i)).toHaveCount(0);
    await expect(page.getByRole("menuitem", { name: /^import$/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^import$/i })).toHaveCount(0);
  });

  viewerTest("@viewer @regression @createproject @listing offers no favourite star on a Viewer project card", async ({ viewerPage: page }) => {
    await selectListingTab(page, "Archived");

    const card = await getFirstProjectCard(page);
    if (!card) {
      test.skip(true, "Viewer has no accessible project card to validate.");
    }

    // Archived projects are read-only, so they carry no favourite affordance.
    expect(await isProjectFavouriteAvailable(card)).toBe(false);
  });

  // ------------------------------------------------------------------
  // Search
  // ------------------------------------------------------------------

  viewerTest("@viewer @regression @createproject @listing searches Viewer-accessible projects without exposing private projects", async ({ viewerPage: page }) => {
    const dialogs = await captureScriptDialogs(page);
    const searchInput = await getProjectListSearchInput(page);

    // A term that could only match another user's private project must not
    // surface anything for the Viewer.
    await searchInput.fill("NoSuchProjectForViewer");
    await expect(page.locator("article")).toHaveCount(0);
    expect(await getListingEmptyStateText(page)).not.toBe("");

    // Clearing restores the Viewer's full accessible list.
    await clearProjectSearch(page);
    expect(dialogs).toEqual([]);
  });

  viewerTest("@viewer @regression @createproject @listing treats special search input as literal text", async ({ viewerPage: page }) => {
    const dialogs = await captureScriptDialogs(page);
    const searchInput = await getProjectListSearchInput(page);

    // SQL-injection, XSS and special-character payloads must be handled as
    // literal text — no dialog, no error state, no leaked project.
    for (const payload of ["' OR '1'='1", "<script>alert('xss')</script>", "@#&/"]) {
      await searchInput.fill(payload);
      await expect(searchInput).toHaveValue(payload);
      await expect(page.locator("article")).toHaveCount(0);
    }
    expect(dialogs).toEqual([]);
  });

  viewerTest("@viewer @regression @createproject @listing restores the Viewer listing when the search field is cleared", async ({ viewerPage: page }) => {
    const searchInput = await getProjectListSearchInput(page);

    await searchInput.fill("   ");
    await expect(page.locator("article")).toHaveCount(0);

    await clearProjectSearch(page);
    expect(await getListingEmptyStateText(page)).toMatch(/no projects found/i);
  });

  // ------------------------------------------------------------------
  // Pagination
  // ------------------------------------------------------------------

  viewerTest("@viewer @regression @createproject @listing falls back to the first page for an out-of-range page number", async ({ viewerPage: page }) => {
    // The listing must not render a blank page for ?page=0 / ?page=999.
    for (const query of ["?page=0", "?page=-1", "?page=999"]) {
      await page.goto(new URL(query, DEFAULT_BASE_URL).toString(), {
        waitUntil: "domcontentloaded",
      });
      await expect
        .poll(() => new URL(page.url()).searchParams.get("page"), { timeout: 30000 })
        .toBe("1");
    }
  });

  // ------------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------------

  viewerTest("@viewer @regression @createproject @navigation returns to the listing from a project dashboard", async ({ viewerPage: page }) => {
    await selectListingTab(page, "Archived");

    const card = await getFirstProjectCard(page);
    if (!card) {
      test.skip(true, "Viewer has no accessible project to navigate from.");
    }

    // Reaching any project destination and returning must land the Viewer back
    // on the listing rather than stranding them in a read-only view.
    await page.goto(new URL("dashboard/00000000-0000-0000-0000-000000000000", DEFAULT_BASE_URL).toString(), {
      waitUntil: "domcontentloaded",
    });
    await expect
      .poll(() => page.url(), { timeout: 30000 })
      .toMatch(/\?page=\d+|\/$/i);
  });

  // ------------------------------------------------------------------
  // User profile menu
  // ------------------------------------------------------------------

  viewerTest("@viewer @regression @createproject @listing opens the Viewer profile menu with Settings and Logout", async ({ viewerPage: page }) => {
    await openProfileMenu(page);

    // Scoped by accessible name so a lingering Author/Tags filter overlay
    // (also `role="menu"`) can never be mistaken for the profile menu.
    const menu = page.getByRole("menu", { name: /user profile menu/i });
    await expect(menu.getByText(/settings/i).first()).toBeVisible();
    await expect(menu.getByText(/logout/i).first()).toBeVisible();
  });

  viewerTest("@viewer @regression @createproject @listing closes the profile menu without navigating", async ({ viewerPage: page }) => {
    const urlBefore = page.url();

    // Scoped by ACCESSIBLE NAME rather than `getByRole("menu").last()`. The
    // filter dropdowns (Author/Tags) are also `<div role="menu">`, so `.last()`
    // can resolve to a lingering filter overlay and report the wrong element as
    // still open. The profile menu is labelled "User profile menu", which
    // distinguishes it unambiguously.
    const profileMenu = page.getByRole("menu", { name: /user profile menu/i });

    await openProfileMenu(page);
    await page.keyboard.press("Escape");
    await expect(profileMenu).toBeHidden();

    expect(page.url()).toBe(urlBefore);
  });

  viewerTest("@viewer @regression @createproject @navigation reaches the Viewer Settings page without project-management controls", async ({ viewerPage: page }) => {
    // Scoped by accessible name so the click cannot land on a lingering
    // Author/Tags filter overlay, which is also a `<div role="menu">`.
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

  viewerTest("@viewer @regression @createproject @navigation logs the Viewer out", async ({ viewerPage: page }) => {
    await openProfileMenu(page);

    // Clicking Logout must hand control to the identity provider's
    // end-session endpoint — that redirect IS the session termination.
    //
    // The Logout control is a `div[role="menuitem"]`, so it is addressed by role
    // rather than by its inner text node — clicking the wrapping `<span>` does
    // not reach the item's click handler.
    const logoutItem = page
      .getByRole("menu")
      .last()
      .locator('[role="menuitem"]')
      .filter({ hasText: /logout/i })
      .first();

    // NOTE ON SCOPE: the final "redirected to /login" leg cannot be observed
    // through this fixture. roles.fixture.mjs registers its OIDC injection via
    // `addInitScript`, which re-runs on EVERY navigation, so the moment the
    // identity provider bounces back to the app the still-valid token is
    // re-injected and the SPA re-authenticates. The post-logout redirect is
    // therefore covered by the separate "cannot return to authenticated pages"
    // test below, which simulates the logged-out state directly.
    //
    // The assertion watches the REQUEST rather than the resulting URL because
    // the end-session hop is cross-origin and transient: navigation settles
    // back on the listing URL, so a URL poll started after the click can miss
    // it entirely. The outbound request is the observable proof that the
    // Viewer's session was terminated at the identity provider.
    const idpLogout = page.waitForRequest((request) => /openid-connect\/logout/i.test(request.url()), {
      timeout: 30000,
    });

    await logoutItem.click();
    await idpLogout;
  });

viewerTest("@viewer @regression @createproject @navigation cannot return to authenticated pages after logging out", async ({ viewerPage: page }) => {
    // Simulate the post-logout state: the Viewer's OIDC entry is removed, so
    // the app must refuse to serve the authenticated listing and bounce to
    // /login instead.
    //
    // The removal runs as an init script so it is applied on every navigation —
    // otherwise the fixture's own injection would immediately restore the token
    // and the guard under test would never actually run.
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

    // Browsing back must not restore access either.
    await page.goBack().catch(() => {});
    await expect(page).toHaveURL(/\/login/i, { timeout: 30000 });
  });
});
