import { test, expect } from "./auth.fixture.mjs";
import {
  DEFAULT_BASE_URL,
  createProject,
  searchProject,
  deleteProject,
} from "../Pages/dashboardPage.js";
import { withErrorCapture } from "./test-utils.mjs";

// ---------------------------------------------------------------------------
// Ticket AG-14 — Set up a new project from the dashboard (regression)
//
// End-to-end regression coverage for creating a project from the BreezeAI
// dashboard: access the dashboard, start a new project, enter a valid name and
// save, then confirm the project shows up in the project list.
//
// The scenario is self-contained: it creates its own uniquely-named project as
// a precondition and cleans it up afterwards (in a finally block, so cleanup
// runs even if an assertion fails). This complements the existing
// "@sanity BreezeAI create project" check, which only creates a project and
// does not verify it appears in the list or clean itself up.
// ---------------------------------------------------------------------------

test.describe("Create Project Regression Suite", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Create-project regression flow is maintained for Chromium only."
  );

  test.beforeEach("Open application", async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  });

  test(
    "@regression Set up a new project from the dashboard and confirm it is listed",
    withErrorCapture(async ({ page }) => {
      const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
      const projectName = `AG14-CreateProject-${currentDateTime}-Automation`;

      let created = false;
      try {
        // Start a new project, enter a valid name, and save.
        const projectId = await createProject(page, projectName);
        created = true;
        expect(projectId, "createProject should return a project ID").toBeTruthy();
        console.log(`Created project "${projectName}" (ID: ${projectId})`);

        // Return to the dashboard and confirm the project shows up in the list.
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await searchProject(page, projectName);

        const projectCard = page
          .locator("article")
          .filter({ hasText: projectName })
          .first();
        await expect(
          projectCard,
          "newly created project should appear in the dashboard list"
        ).toBeVisible({ timeout: 20000 });
        console.log(`Confirmed project "${projectName}" is listed on the dashboard.`);
      } finally {
        // Self-contained cleanup: remove the project this test created so the
        // suite leaves no residue behind. Best-effort — a cleanup failure must
        // not mask the test result.
        if (created) {
          try {
            await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
            await searchProject(page, projectName);
            await deleteProject(page, projectName);

            // Confirm the deletion if the UI asks for confirmation.
            const confirmBtn = page.getByRole("button", {
              name: /^(delete|confirm|yes)$/i,
            });
            if (await confirmBtn.isVisible().catch(() => false)) {
              await confirmBtn.click();
            }
            console.log(`Cleaned up project "${projectName}".`);
          } catch (cleanupErr) {
            console.warn(
              `Cleanup failed for "${projectName}":`,
              cleanupErr?.message ?? cleanupErr
            );
          }
        }
      }
    })
  );
});
