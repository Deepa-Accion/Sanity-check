import { expect } from "@playwright/test";
import { createProject, DEFAULT_BASE_URL } from "../../Pages/dashboardPage.js";
import { uploadFirstpdfDocument, generateFunctionalOntology } from "../../Pages/knowlegeBase.js";
import { CreateProjectPage } from "../../Pages/createProjectFile.js";

export const uniqueProjectName = (suffix) =>
  `Playwright-CreateProject-${suffix}-${Date.now()}`;

export async function openCreateProject(page) {
  await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  const createProjectPage = new CreateProjectPage(page);
  await createProjectPage.open();
  return createProjectPage;
}

export async function cleanupCreatedProjects(page, createdProjectNames) {
  if (createdProjectNames.size === 0) return;
  await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  for (const name of createdProjectNames) {
    const projectCard = page.locator("article").filter({ hasText: name }).first();
    if (!(await projectCard.isVisible({ timeout: 5000 }).catch(() => false))) continue;
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
  // Navigate directly — avoids card-click timing issues in React SPA
  const base = (process.env.TARGET_URL || "https://ai.accionbreeze.com/").replace(/\/$/, "");
  await page.goto(`${base}/dashboard/${projectState.projectId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  return projectState.projectId;
}

export async function prepareFunctionalMetrics(page, projectState) {
  console.log(`Selected project: ${projectState.projectName}`);
  console.log("Step 1: Uploading document...");
  await uploadFirstpdfDocument(page);
  console.log("Step 2: Generating functional metrics (this may take 2-3 minutes)...");
  await generateFunctionalOntology(page, projectState.projectId);
  return projectState;
}
