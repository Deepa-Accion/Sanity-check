import { test, expect } from "./auth.fixture.mjs";
import { createProject, searchProject, deleteProject } from "../Pages/dashboardPage.js";
import { withErrorCapture } from "./test-utils.mjs";

// AG-13 — Regression: create a new project on the BreezeAI dashboard.
//
// Self-contained end-to-end scenario:
//   1. Access the BreezeAI dashboard.
//   2. Open the create-project form and submit a valid project name.
//   3. Return to the dashboard and verify the new project appears in the list.
//   4. Clean up by deleting the created project (runs even if a step fails).
//
// Chromium-only, in line with the rest of the suite.

const BASE_URL = "https://ai.accionbreeze.com/";

test.describe("AG-13 Create project - Dashboard", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Create-project regression is maintained for Chromium only."
  );

  test.beforeEach("Access the BreezeAI dashboard", async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  });

  test(
    "@regression Create a new project on the dashboard and verify it is listed",
    withErrorCapture(async ({ page }) => {
      // Uniquely named project so the run is independent of pre-existing data
      // and safe to clean up without touching real user projects.
      const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
      const projectName = `AG13-Create-${currentDateTime}`;

      let created = false;
      try {
        // Open the create-project form, submit a valid name, and create.
        const projectId = await createProject(page, projectName);
        created = true;
        console.log(`[AG-13] created project "${projectName}" (ID: ${projectId})`);

        // Return to the dashboard/project listing to verify the new project.
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

        // Narrow the listing to the just-created project and assert it appears.
        await searchProject(page, projectName);
        const result = page.locator(`text="${projectName}"`).first();
        await expect(result).toBeVisible({ timeout: 20000 });
        console.log(`[AG-13] project "${projectName}" is listed on the dashboard`);
      } finally {
        // Self-contained: remove the project this test created so the suite
        // leaves no residual data behind, regardless of assertion outcome.
        if (created) {
          await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
          await searchProject(page, projectName);
          await deleteProject(page, projectName).catch((err) => {
            console.warn(`[AG-13] cleanup failed for "${projectName}":`, err?.message ?? err);
          });
          console.log(`[AG-13] cleanup complete for "${projectName}"`);
        }
      }
    })
  );
});
