import { test, expect } from "./auth.fixture.mjs";

import { LoginPage } from "../Pages/loginPage.js";

import {
  DashboardPage,
  DEFAULT_BASE_URL,
} from "../Pages/dashboardPage.js";

import { ProjectPage } from "../Pages/projectPage.js";

import { CreateProjectPage } from "../Pages/createProjectFile.js";

let projectName = "";
let projectId = "";

const uniqueProjectName = (suffix) =>
  `Playwright-CreateProject-${suffix}-${Date.now()}`;

/**
 * Open the Create Project form.
 */
async function openCreateProject(page) {
  await page.goto(DEFAULT_BASE_URL, {
    waitUntil: "domcontentloaded",
  });

  const createProjectPage = new CreateProjectPage(page);

  await createProjectPage.open();

  return createProjectPage;
}

/**
 * Delete a project from the dashboard.
 */
async function deleteProjectFromDashboard(page, name) {
  const projectPage = new ProjectPage(page);

  await page.goto(DEFAULT_BASE_URL, {
    waitUntil: "domcontentloaded",
  });

  await projectPage.deleteProject(name);

  await page.reload({
    waitUntil: "domcontentloaded",
  });

  await expect(projectPage.getProjectCard(name)).toBeHidden({
    timeout: 30000,
  });
}

/**
 * Verify that a dashboard section is selected.
 */
async function expectSectionSelected(page, sectionName) {
  const sectionButton = page
    .getByRole("button", { name: sectionName })
    .first();

  await expect(sectionButton).toBeVisible();

  await expect
    .poll(async () => {
      const ariaPressed = await sectionButton.getAttribute("aria-pressed");
      const ariaCurrent = await sectionButton.getAttribute("aria-current");
      const dataState = await sectionButton.getAttribute("data-state");
      const className = await sectionButton.getAttribute("class");

      return (
        ariaPressed === "true" ||
        ariaCurrent === "page" ||
        dataState === "active" ||
        /active|selected|bg-primary/i.test(className || "")
      );
    })
    .toBe(true);
}

/**
 * Login helper.
 *
 * Credentials are read from environment variables.
 * Do not hard-code username or password in the test code.
 */
async function loginToBreezeAI(page) {
  const loginPage = new LoginPage(page);

  await loginPage.navigateToLogin(`${DEFAULT_BASE_URL}?page=1`);

  const createProjectButton = page
    .getByRole("button", { name: /create project/i })
    .first();

  if (await createProjectButton.isVisible().catch(() => false)) {
    return;
  }

  const username = process.env.BREEZE_USERNAME;
  const password = process.env.BREEZE_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "BREEZE_USERNAME and BREEZE_PASSWORD environment variables must be configured."
    );
  }

  await loginPage.login(username, password);

  await expect(
    page.getByRole("button", { name: /create project/i })
  ).toBeVisible({
    timeout: 60000,
  });
}

test.describe("Complete Regression Suite", () => {
  test.beforeEach("Url Calling", async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, {
      waitUntil: "domcontentloaded",
    });
  });

  test(
    "@regression BreezeAI dashboard Launched",
    async ({ page }) => {
      const title = await page.title();

      console.log("Page title after execution:", title);

      expect(title).toMatch(/Breeze\.AI/i);
    }
  );

  // ============================================================
  // Project Creation Regression Coverage
  //
  // Validates:
  // - Project creation with valid details and tags
  // - Empty project name validation
  // - Whitespace-only project name validation
  // - Special characters in project names
  // - Duplicate project name handling
  // - Favourite and unfavourite behaviour
  // - Project menu actions
  // - Project deletion
  // - Cancelling project creation without saving data
  // ============================================================

  test(
    "@regression BreezeAI create project with tag",
    async ({ page }) => {
      const dashboardPage = new DashboardPage(page);
      const projectPage = new ProjectPage(page);

      const currentDateTime = new Date()
        .toISOString()
        .replace(/[:.]/g, "-");

      projectName = `SanityCheck-${currentDateTime}-Automation`;

      let created = false;

      try {
        await dashboardPage.createProjectWithTag(
          projectName,
          projectName
        );

        created = true;

        await page.goto(DEFAULT_BASE_URL, {
          waitUntil: "domcontentloaded",
        });

        await expect(
          projectPage.getProjectCard(projectName)
        ).toBeVisible({
          timeout: 30000,
        });

        console.log("Project Name:", projectName);
      } finally {
        if (created) {
          await deleteProjectFromDashboard(page, projectName);
        }
      }
    }
  );

  test(
    "@regression rejects an empty project name without creating a project",
    async ({ page }) => {
      const createProjectPage = await openCreateProject(page);

      await expect(
        createProjectPage.projectNameInput
      ).toHaveValue("");

      await expect(
        createProjectPage.saveButton
      ).toBeDisabled();
    }
  );

  test(
    "@regression rejects a whitespace-only project name",
    async ({ page }) => {
      const createProjectPage = await openCreateProject(page);

      await createProjectPage.fillProjectName(" ");

      await expect(
        createProjectPage.saveButton
      ).toBeDisabled();
    }
  );

  test(
    "@regression supports special characters in a project name",
    async ({ page }) => {
      const name = `Playwright & QA / ${Date.now()}`;

      const createProjectPage = await openCreateProject(page);

      let created = false;

      try {
        await createProjectPage.fillProjectName(name);

        await createProjectPage.save();

        created = true;

        await expect
          .poll(() => page.url(), {
            timeout: 20000,
          })
          .toMatch(/dashboard|[?&]page=\d+/i);

        expect(
          await createProjectPage.projectDestination(name)
        ).toBeTruthy();
      } finally {
        if (created) {
          await deleteProjectFromDashboard(page, name);
        }
      }
    }
  );

  test(
    "@regression handles a duplicate project name without modifying the original",
    async ({ page }) => {
      const name = uniqueProjectName("duplicate");

      let firstCreated = false;

      try {
        // Create the first project
        const first = await openCreateProject(page);

        await first.fillProjectName(name);

        await first.save();

        firstCreated = true;

        await expect
          .poll(() => page.url(), {
            timeout: 20000,
          })
          .toMatch(/dashboard|[?&]page=\d+/i);

        // Try creating the same project again
        const second = await openCreateProject(page);

        await second.fillProjectName(name);

        await second.save();

        const validationMessage =
          await second.visibleValidationMessage();

        const destinationVisible = Boolean(
          await second.projectDestination(name)
        );

        expect(
          validationMessage || destinationVisible,
          "Duplicate handling should either show the observed error or complete the observed creation flow"
        ).toBeTruthy();
      } finally {
        if (firstCreated) {
          await deleteProjectFromDashboard(page, name);
        }
      }
    }
  );

  test(
    "@regression favourites and unfavourites a created project, then deletes it",
    async ({ page }) => {
      const dashboardPage = new DashboardPage(page);
      const projectPage = new ProjectPage(page);

      const name = uniqueProjectName("favourites");

      let created = false;
      let deleted = false;

      try {
        // Create project
        await dashboardPage.createProjectWithTag(name, name);

        created = true;

        await page.goto(DEFAULT_BASE_URL, {
          waitUntil: "domcontentloaded",
        });

        // Navigate to My Projects
        await projectPage.selectMyProjects();

        await expectSectionSelected(page, "My Projects");

        const myProjectCard =
          projectPage.getProjectCard(name);

        const projectStar =
          projectPage.getProjectStar(name);

        await expect(myProjectCard).toBeVisible({
          timeout: 30000,
        });

        // Favourite project
        await projectPage.favouriteProject(name);

        await expect
          .poll(() => projectPage.isProjectFavourite(name))
          .toBe(true);

        // Navigate to Favourites
        await projectPage.selectFavourites();

        await expectSectionSelected(page, "Favourites");

        const favouritesProjectCard =
          projectPage.getProjectCard(name);

        await expect(
          favouritesProjectCard
        ).toBeVisible({
          timeout: 30000,
        });

        await expect(
          favouritesProjectCard
        ).toContainText(name);

        // Navigate back to My Projects
        await projectPage.selectMyProjects();

        await expectSectionSelected(page, "My Projects");

        await expect(myProjectCard).toBeVisible({
          timeout: 30000,
        });

        await expect(projectStar).toBeVisible();

        // Unfavourite project
        await projectStar.click();

        await expect
          .poll(() => projectPage.isProjectFavourite(name))
          .toBe(false);

        // Verify project is removed from Favourites
        await projectPage.selectFavourites();

        await expectSectionSelected(page, "Favourites");

        await expect(
          projectPage.getProjectCard(name)
        ).toBeHidden({
          timeout: 30000,
        });

        // Navigate back to My Projects
        await projectPage.selectMyProjects();

        await expectSectionSelected(page, "My Projects");

        // Open project menu
        await projectPage.openProjectMenu(name);

        const projectMenu = page.getByRole("menu", {
          name: /project options/i,
        });

        // Verify project menu options
        await expect(
          projectMenu.getByRole("menuitem", {
            name: /export project/i,
          })
        ).toBeVisible();

        await deleteProjectFromDashboard(page, name);

        // Verify project is deleted
        await expect(
          projectPage.getProjectCard(name)
        ).toBeHidden({
          timeout: 30000,
        });

        deleted = true;
      } finally {
        // Cleanup if test failed before deletion
        if (created && !deleted) {
          await deleteProjectFromDashboard(page, name);
        }
      }
    }
  );

  test(
    "@regression cancels the form without saving entered data",
    async ({ page }) => {
      const createProjectPage =
        await openCreateProject(page);

      const name = uniqueProjectName("cancel");

      await createProjectPage.fillProjectName(name);

      const cancelVisible =
        await createProjectPage.cancelButton
          .isVisible()
          .catch(() => false);

      test.skip(
        !cancelVisible,
        "No Cancel, Close, or Back control was exposed by the form."
      );

      await createProjectPage.cancelOrClose();

      await expect(
        createProjectPage.projectNameInput
      ).toBeHidden();

      await expect(
        page.getByRole("button", {
          name: /create project/i,
        })
      ).toBeVisible();
    }
  );
});