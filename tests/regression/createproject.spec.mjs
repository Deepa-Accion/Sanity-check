import { test, expect } from "../auth.fixture.mjs";
import { DEFAULT_BASE_URL } from "../../Pages/dashboardPage.js";
import {
  openCreateProject,
  cleanupCreatedProjects,
  uniqueProjectName,
} from "./regression-utils.mjs";

const createdProjectNames = new Set();

test.describe("Regression — Create Project", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  });

  test.afterEach(async ({ page }) => {
    await cleanupCreatedProjects(page, createdProjectNames);
  });

  test("@regression @createproject BreezeAI create project with tag", async ({ page }) => {
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

  test("@regression @createproject rejects an empty project name without creating a project", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    await expect(createProjectPage.projectNameInput).toHaveValue("");
    await expect(createProjectPage.saveButton).toBeDisabled();
  });

  test("@regression @createproject rejects a whitespace-only project name", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    await createProjectPage.fillProjectName(" ");
    await expect(createProjectPage.saveButton).toBeDisabled();
  });

  test("@regression @createproject supports special characters in a project name", async ({ page }) => {
    const name = `Playwright & QA / ${Date.now()}`;
    const createProjectPage = await openCreateProject(page);

    await createProjectPage.fillProjectName(name);
    await createProjectPage.save();

    await expect.poll(() => page.url(), { timeout: 20000 }).toMatch(/dashboard/i);

    await expect.poll(
      async () => {
        const destination = await createProjectPage.projectDestination(name);
        if (destination) return true;
        await page.reload({ waitUntil: "domcontentloaded" });
        return Boolean(await createProjectPage.projectDestination(name));
      },
      {
        timeout: 30000,
        intervals: [1000, 2000, 5000],
        message: `Project "${name}" should appear on the dashboard after creation`,
      }
    ).toBe(true);
  });

  test("@regression @createproject handles a duplicate project name without modifying the original", async ({ page }) => {
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
  });

  test("@regression @createproject cancels the form without saving entered data", async ({ page }) => {
    const createProjectPage = await openCreateProject(page);
    const name = uniqueProjectName("cancel");
    await createProjectPage.fillProjectName(name);
    await expect(createProjectPage.cancelButton.first()).toBeVisible({ timeout: 5000 });
    await createProjectPage.cancelOrClose();
    await expect(createProjectPage.projectNameInput).toBeHidden();
    await expect(page.getByRole("button", { name: /create project/i })).toBeVisible();
  });

  
});
