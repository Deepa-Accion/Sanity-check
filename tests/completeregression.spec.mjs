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
  validateCopyPlainMarkdownContent,
  validateMultipleRecordsVisible,
  searchAndValidateRecord,
} from "../Pages/artifactsPage.js";

import {
  DEFAULT_BASE_URL,
  createProject,
  selectProject,
} from "../Pages/dashboardPage.js";

import {
  generateFunctionalOntology,
  uploadFirstDocumentForProject,
} from "../Pages/knowlegeBase.js";

import { CreateProjectPage } from "../Pages/createProjectFile.js";

const createdProjectNames = new Set();

const uniqueProjectName = (suffix) =>
  `Playwright-CreateProject-${suffix}-${Date.now()}`;


async function openCreateProject(page) {
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

async function ensureProjectCreated(page, projectState) {
  if (projectState.projectName && projectState.projectId) {
    return projectState;
  }

  const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
  projectState.projectName = `SanityCheck-${currentDateTime}-Automation`;

  const projectResponsePromise = page.waitForResponse((response) => {
    return response.request().method() === "POST" && /projects/i.test(response.url());
  }, { timeout: 30000 }).catch(() => null);

  const returnedProjectId = await createProject(page, projectState.projectName);
  const projectResponse = await projectResponsePromise;
  const responseBody = await projectResponse?.json().catch(() => null);
  const responseProjectId = responseBody?.uuid || responseBody?.id || responseBody?.data?.uuid || responseBody?.data?.id;

  const url = new URL(page.url());
  const urlProjectId = url.pathname.match(/\/dashboard\/([^/?#]+)/i)?.[1] ||
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

async function ensureProjectOpen(page, projectState) {
  await ensureProjectCreated(page, projectState);

  if (page.url().includes(`/dashboard/${projectState.projectId}`) ||
      await page.getByRole("heading", { name: projectState.projectName, exact: true }).isVisible().catch(() => false)) {
    return projectState.projectId;
  }

  return selectProject(page, projectState.projectName);
}

async function prepareFunctionalMetrics(page, projectState) {
  await ensureProjectOpen(page, projectState);
  console.log(`Selected project: ${projectState.projectName}`);
  console.log("Step 1: Uploading document...");
  await uploadFirstDocumentForProject(page, "txt");
  console.log("Step 2: Generating functional metrics (this may take 2-3 minutes)...");
  await generateFunctionalOntology(page, projectState.projectId);
  return projectState;
}

test.describe("Complete Regression Suite", () => {
  test.beforeEach("Url Calling", async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, {
      waitUntil: "domcontentloaded",
    });
  });

  test.afterEach("Clean up created projects", async ({ page }) => {
    await cleanupCreatedProjects(page);
  });

  test("@regression BreezeAI dashboard Launched", async ({ page }) => {
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

  test.describe('@artifact Artifact Tests', () => {
    let projectName = "";
    let projectId = "";

    test.beforeEach(async ({ page }) => {
      // Create and prepare the project only once; reuse across all @artifact tests
      if (!projectName || !projectId) {
        const projectState = {};
        await ensureProjectCreated(page, projectState);
        await prepareFunctionalMetrics(page, projectState);
        projectName = projectState.projectName;
        projectId = projectState.projectId;
        createdProjectNames.add(projectName);
      }
      await page.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByRole("heading", { name: "Artifacts", exact: true })).toBeVisible({ timeout: 15000 });
    });

    test("@regression @artifact download artifact plain html from the artifacts page", async ({ page }) => {
      await reviewArtifactsPage(page, projectId);
      await downloadArtifactPlainHtml(page, projectId);
      await validateCopyPlainHtmlContent(page, projectName, projectId);
      await validateDownloadedPlainHtml(page, projectName);
      await validatePlainHtmlInNewWindow(page, projectName);
      console.log(`✅ ${test.info().title} passed`);
    });

    test("@regression @artifact download artifact plain markdown from the artifacts page", async ({ page }) => {
      await downloadArtifactPlainMarkdown(page, projectId);
      await validateDownloadedPlainMarkdown(page, projectName);
      await validateCopyPlainMarkdownContent(page, projectName, projectId);
      await validatePlainMarkdownInNewWindow(page, projectName);
      console.log(`✅ ${test.info().title} passed`);
    });

    test("@regression @artifact download artifact when already one artifact exists", async ({ page }) => {
      await downloadArtifactPlainHtml(page, projectId);
      await validateDownloadedPlainHtml(page, projectName);
      await downloadArtifactPlainMarkdown(page, projectId);
      await validateMultipleRecordsVisible(page);
      await validateDownloadedPlainMarkdown(page, projectName);
      console.log(`✅ ${test.info().title} passed`);
    });

    test("@regression @artifact validate search functionality on artifacts page", async ({ page }) => {
      await downloadArtifactPlainMarkdown(page, projectId);
      await validateDownloadedPlainMarkdown(page, projectName);
      await downloadArtifactPlainHtml(page, projectId);
      await validateMultipleRecordsVisible(page);
      await validateDownloadedPlainHtml(page, projectName);
      await searchAndValidateRecord(page);
      console.log(`✅ ${test.info().title} passed`);
    });
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

    const first = await openCreateProject(page);

    await first.fillProjectName(name);

    await first.save();

    await expect
      .poll(() => page.url(), {
        timeout: 20000,
      })
      .toMatch(/dashboard/i);

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
