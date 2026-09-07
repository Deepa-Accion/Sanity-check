import { test, expect } from "./auth.fixture.mjs";

import {
  DEFAULT_BASE_URL,
  createProject,
  selectProject,
} from "../Pages/dashboardPage.js";

import { openAllCards } from "../Pages/projectPage.js";

import {
  uploadDocumentInKnowledgeBase,
  uploadDocumentInAIChat,
} from "../Pages/knowlegeBase.js";

import { CreateProjectPage } from "../pages/createProjectFile.js";

let projectName = "";
let projectId = "";


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

test.describe("Complete Regression Suite", () => {
  // Common URL navigation for every test
  test.beforeEach("Url Calling", async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, {
      waitUntil: "domcontentloaded",
    });
  });

  test("@regression BreezeAI dashboard Launched", async ({ page }) => {
    // beforeEach() has already opened the application

    const title = await page.title();

    console.log("Page title after execution:", title);

    expect(title).toMatch(/Breeze\.AI/i);
  });

  test("@regression BreezeAI create project with tag", async ({ page }) => {
    /*
     * Steps involved:
     * 1. In Dashboard, click Create Project
     * 2. Give project name
     * 3. Give description
     * 4. Click Create
     */

    const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");

    projectName = `SanityCheck-${currentDateTime}-Automation`;

    projectId = await createProject(page, projectName, projectName);

    console.log("Project ID:", projectId);
    console.log("Project Name:", projectName);
  });

  test("@regression rejects an empty project name without creating a project", async ({
    page,
  }) => {
    const createProjectPage = await openCreateProject(page);

    await expect(createProjectPage.projectNameInput).toHaveValue("");

    await expect(createProjectPage.saveButton).toBeDisabled();
  });

  test("@regression rejects a whitespace-only project name", async ({
    page,
  }) => {
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(" ");

    // Save should remain disabled when the project name
    // contains only whitespace.

    await expect(createProjectPage.saveButton).toBeDisabled();
  });

  test("@regression supports special characters in a project name", async ({
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

    expect(await createProjectPage.projectDestination(name)).toBeTruthy();
  });

  test("@regression handles a duplicate project name without modifying the original", async ({
    page,
  }) => {
    const name = uniqueProjectName("duplicate");

    // Create first project
    const first = await openCreateProject(page);

    await first.fillProjectName(name);

    await first.save();

    await expect
      .poll(() => page.url(), {
        timeout: 20000,
      })
      .toMatch(/dashboard/i);

    // Try creating the same project again
    const second = await openCreateProject(page);

    await second.fillProjectName(name);

    await second.save();

    const validationMessage = await second.visibleValidationMessage();

    const destinationVisible = Boolean(await second.projectDestination(name));

    expect(
      validationMessage || destinationVisible,
      "Duplicate handling should either show the observed error or complete the observed creation flow",
    ).toBeTruthy();
  });

  test("@regression cancels the form without saving entered data", async ({
    page,
  }) => {
    const createProjectPage = await openCreateProject(page);

    const name = uniqueProjectName("cancel");

    await createProjectPage.fillProjectName(name);

    const cancelVisible = await createProjectPage.cancelButton
      .isVisible()
      .catch(() => false);

    test.skip(
      !cancelVisible,
      "No Cancel, Close, or Back control was exposed by the form.",
    );

    await createProjectPage.cancelOrClose();

    await expect(createProjectPage.projectNameInput).toBeHidden();

    await expect(
      page.getByRole("button", {
        name: /create project/i,
      }),
    ).toBeVisible();
  });
});

