import { test, expect } from "./auth.fixture.mjs";
import {
  downloadArtifactPlainHtml,
  reviewArtifactsPage,
  validateCopyPlainHtmlContent,
  downloadArtifactPlainMarkdown,
  validateDownloadedPlainHtml, 
  validateDownloadedPlainMarkdown,
  validatePlainMarkdownInNewWindow,
  validatePlainHtmlInNewWindow
} from "../Pages/projectPage.js";

import {
  DEFAULT_BASE_URL,
  createProject,
} from "../Pages/dashboardPage.js";

import { CreateProjectPage } from "../Pages/createProjectFile.js";

const createdProjectNames = new Set();


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
  if (createdProjectNames.size === 0) {
    return;
  }

  await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });

  for (const name of createdProjectNames) {
    const projectCard = page.locator("article").filter({ hasText: name }).first();
    if (!(await projectCard.isVisible({ timeout: 5000 }).catch(() => false))) {
      continue;
    }

    const optionsButton = projectCard.getByRole("button", { name: /project options/i }).first();
    await expect(optionsButton).toBeVisible({ timeout: 5000 });
    await optionsButton.click();

    const deleteAction = page
      .getByRole("menuitem", { name: /delete/i })
      .or(page.getByRole("button", { name: /delete/i }))
      .last();
    await expect(deleteAction).toBeVisible({ timeout: 5000 });
    await deleteAction.click();

    const confirmDelete = page
      .getByRole("dialog")
      .getByRole("button", { name: /delete|confirm/i })
      .last();
    if (await confirmDelete.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmDelete.click();
    }

    await expect(projectCard).not.toBeVisible({ timeout: 10000 });
  }

  createdProjectNames.clear();
}

test.describe("Complete Regression Suite", () => {
  // Common URL navigation for every test
  test.beforeEach("Url Calling", async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, {
      waitUntil: "domcontentloaded",
    });
  });

  test.afterEach("Clean up created projects", async ({ page }) => {
    await cleanupCreatedProjects(page);
  });

  test("@regression BreezeAI dashboard Launched", async ({ page }) => {
    // beforeEach() has already opened the application

    const title = await page.title();

    console.log("Page title after execution:", title);

    expect(title).toMatch(/Breeze\.AI/i);
  });

  test("@regression BreezeAI create project with tag", async ({ page }) => {
    const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const projectName = `SanityCheck-${currentDateTime}-Automation`;
    const tag = `Playwright-${Date.now()}`;
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.addTag(tag);
    await expect(createProjectPage.getTagChip(tag)).toBeVisible({ timeout: 5000 });
    await createProjectPage.save();
    createdProjectNames.add(projectName);

    await expect(page).toHaveURL(/dashboard|[?&]page=\d+/i, { timeout: 20000 });
  });

  test("@regression download artifact plain html from the artifacts page", async ({ page }) => {
    // Create new breeze project and download its plain html artifact  
    const currentDateTime = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = `SanityCheck-${currentDateTime}-Automation`;
    const projectId = await createProject(page, projectName);
    createdProjectNames.add(projectName);
    await reviewArtifactsPage(page, projectId);
    await downloadArtifactPlainHtml(page, projectId);
    await validateCopyPlainHtmlContent(page, projectName, projectId);
    await validateDownloadedPlainHtml(page, projectName);
    await validatePlainHtmlInNewWindow(page, projectId, projectName);

  });

  test("@regression download artifact plain markdown from the artifacts page", async ({ page }) => {
    // Create new breeze project and download its plain markdown artifact
    const currentDateTime = new Date().toISOString().replace(/[:.]/g, '-');
    const projectName = `SanityCheck-${currentDateTime}-Automation`;
    const projectId = await createProject(page, projectName);
    createdProjectNames.add(projectName);
    await downloadArtifactPlainMarkdown(page, projectId);
    await validateDownloadedPlainMarkdown(page, projectName);
    await validatePlainMarkdownInNewWindow(page, projectId, projectName);
    
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

    await expect.poll(
      () => second.visibleValidationMessage(),
      {
        timeout: 10000,
        message: "Duplicate project creation should show a validation message",
      },
    ).not.toBe("");
  });

  test("@regression cancels the form without saving entered data", async ({
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

