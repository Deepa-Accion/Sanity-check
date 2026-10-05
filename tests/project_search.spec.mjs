import { test, expect } from "./auth.fixture.mjs";
import { createProject, searchProject } from "../Pages/dashboardPage.js";
import { withErrorCapture } from "./test-utils.mjs";

// AG-8 — Regression: search for a project on the BreezeAI dashboard.
//
// Self-contained end-to-end scenario:
//   1. Access the BreezeAI dashboard.
//   2. Create a project as a precondition (so the search has a known target).
//   3. Submit a project search query for that project's name.
//   4. Verify the matching project appears in the results.
//
// Chromium-only, in line with the rest of the suite.

const BASE_URL = "https://ai.accionbreeze.com/";

test.describe("AG-8 Project search - Dashboard", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Project search regression is maintained for Chromium only."
  );

  test.beforeEach("Access the BreezeAI dashboard", async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  });

  test(
    "@regression Search for a project on the dashboard and verify it is listed",
    withErrorCapture(async ({ page }) => {
      // Precondition: create a uniquely named project so the search target is
      // deterministic and independent of any pre-existing data.
      const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
      const projectName = `AG8-Search-${currentDateTime}`;

      const projectId = await createProject(page, projectName);
      console.log(`[AG-8] created project "${projectName}" (ID: ${projectId})`);

      // Return to the dashboard/project listing to run the search.
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

      // Submit the search query for the just-created project.
      await searchProject(page, projectName);

      // Verify the matching project appears in the results.
      const result = page.locator(`text="${projectName}"`).first();
      await expect(result).toBeVisible({ timeout: 20000 });
      console.log(`[AG-8] project "${projectName}" is listed in search results`);
    })
  );
});
