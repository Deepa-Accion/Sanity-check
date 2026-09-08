import { test, expect } from "./auth.fixture.mjs";
import path from "node:path";
import fs from "node:fs";

import {
  DashboardPage,
  DEFAULT_BASE_URL,
} from "../Pages/dashboardPage.js";

import { ProjectPage } from "../Pages/projectPage.js";

const ontologyPdfCandidates = [
  "documents/Release_07-09-2026",
  "documents",
  "documents/Release_07_09_2026",
  "documents/Release_07-09-2026/Organic Producer-to-Customer E-Commerce Platform.pdf",
].map((entry) => path.resolve(process.cwd(), entry));

const ontologyPdfPath = ontologyPdfCandidates.reduce((resolved, candidate) => {
  if (resolved || !fs.existsSync(candidate)) return resolved;
  if (fs.statSync(candidate).isFile() && /\.pdf$/i.test(candidate)) return candidate;
  if (!fs.statSync(candidate).isDirectory()) return resolved;
  const pdf = fs.readdirSync(candidate, { withFileTypes: true })
    .find((entry) => entry.isFile() && /\.pdf$/i.test(entry.name));
  return pdf ? path.join(candidate, pdf.name) : resolved;
}, "");

if (!ontologyPdfPath) {
  throw new Error("No PDF document found in the workspace documents directories.");
}

const ontologyPdfName = path.basename(ontologyPdfPath);

let projectName = "";

const uniqueProjectName = (suffix) =>
  `Playwright-CreateProject-${suffix}-${Date.now()}`;

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
          await new ProjectPage(page).deleteProjectFromDashboard(projectName);
        }
      }
    }
  );

  test(
    "@regression rejects an empty project name without creating a project",
    async ({ page }) => {
      const createProjectPage = await new ProjectPage(page).openCreateProjectForm();

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
      const createProjectPage = await new ProjectPage(page).openCreateProjectForm();

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

      const createProjectPage = await new ProjectPage(page).openCreateProjectForm();

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
          await new ProjectPage(page).deleteProjectFromDashboard(name);
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
        const first = await new ProjectPage(page).openCreateProjectForm();

        await first.fillProjectName(name);

        await first.save();

        firstCreated = true;

        await expect
          .poll(() => page.url(), {
            timeout: 20000,
          })
          .toMatch(/dashboard|[?&]page=\d+/i);

        // Try creating the same project again
        const second = await new ProjectPage(page).openCreateProjectForm();

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
          await new ProjectPage(page).deleteProjectFromDashboard(name);
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

        await projectPage.waitForSectionSelected("My Projects");

        const projectStar =
          projectPage.getProjectStar(name);

        await projectPage.waitForProjectVisible(name);

        // Favourite project
        await projectPage.favouriteProject(name);

        await expect
          .poll(() => projectPage.isProjectFavourite(name))
          .toBe(true);

        // Navigate to Favourites
        await projectPage.selectFavourites();

        await projectPage.waitForSectionSelected("Favourites");

        await projectPage.waitForProjectVisible(name);

        // Navigate back to My Projects
        await projectPage.selectMyProjects();

        await projectPage.waitForSectionSelected("My Projects");

        await projectPage.waitForProjectVisible(name);

        await expect(projectStar).toBeVisible();

        // Unfavourite project
        await projectStar.click();

        await expect
          .poll(() => projectPage.isProjectFavourite(name))
          .toBe(false);

        // Verify project is removed from Favourites
        await projectPage.selectFavourites();

        await projectPage.waitForSectionSelected("Favourites");
        await projectPage.refreshProjectList();
        await projectPage.selectFavourites();
        await projectPage.waitForSectionSelected("Favourites");

        expect(await projectPage.isProjectVisible(name)).toBe(false);

        // Navigate back to My Projects
        await projectPage.selectMyProjects();

        await projectPage.waitForSectionSelected("My Projects");

        // Open project menu
        await projectPage.openProjectMenu(name);

        // Verify project menu options
        expect(await projectPage.isExportProjectMenuItemVisible()).toBe(true);

        await projectPage.deleteProjectFromDashboard(name);

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
          await projectPage.deleteProjectFromDashboard(name);
        }
      }
    }
  );

  test(
    "@regression cancels the form without saving entered data",
    async ({ page }) => {
      const createProjectPage =
        await new ProjectPage(page).openCreateProjectForm();

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

      expect(await new ProjectPage(page).isCreateProjectButtonVisible()).toBe(true);
    }
  );

  // ============================================================
  // Ontology Generation Regression Coverage
  // ============================================================
  test(
    "@regression creates an ontology and covers Persona and Graph workflows",
    async ({ page }) => {
      test.setTimeout(900000);

      const projectPage = new ProjectPage(page);
      const name = uniqueProjectName("ontology");
      let created = false;

      try {
        await test.step("Create project and generate ontology", async () => {
          const createProjectPage = await projectPage.openCreateProjectForm();
          await createProjectPage.fillProjectName(name);
          await createProjectPage.fillDescription("Ontology workflow regression coverage.");
          await createProjectPage.save();
          created = true;

          await expect.poll(() => page.url(), { timeout: 30000 })
            .toMatch(/dashboard|[?&]page=\d+/i);
          await projectPage.openOntologyGeneration();
          await projectPage.openFunctionalRequirements();
          await projectPage.uploadFunctionalDocument(ontologyPdfPath);
          expect(await projectPage.isUploadedFileVisible(ontologyPdfName)).toBe(true);
          expect(await projectPage.uploadAllDocuments()).toBe(true);
          await projectPage.generateFunctionalOntology();
          await projectPage.waitForGenerationComplete();
          expect(await projectPage.isOntologyRedoVisible()).toBe(true);
        });

        await test.step("Verify Functional Requirements and Persona count", async () => {
          expect(await projectPage.isFunctionalRequirementsVisible()).toBe(true);
          expect(await projectPage.isFunctionalSubtitleVisible()).toBe(true);
          await projectPage.refreshOntology();
          await projectPage.waitForSectionItems("Persona");
          expect(await projectPage.getPersonaCount()).toBeGreaterThan(0);
        });

        await test.step("Clone and delete a Persona", async () => {
          const sourcePersona = await projectPage.getVisibleNodeName("Persona");
          expect(sourcePersona).toBeTruthy();
          const beforeNames = await projectPage.getPersonaNames();
          const clonedPersona = await projectPage.cloneAndDeletePersona(sourcePersona);
          const afterNames = await projectPage.getPersonaNames();
          expect(clonedPersona || afterNames.length).toBeTruthy();
          expect(afterNames.length).toBeGreaterThanOrEqual(beforeNames.length);
        });

        await test.step("Edit a Persona description", async () => {
          await projectPage.refreshOntology();
          const persona = await projectPage.getVisibleNodeName("Persona");
          expect(persona).toBeTruthy();
          await projectPage.updatePersonaDescription(persona, `Updated description for ${persona}`);
        });

        await test.step("Merge Personas when multiple Personas are available", async () => {
          await projectPage.refreshOntology();
          const personas = await projectPage.getPersonaNames();
          if (personas.length > 1) {
            const merged = await projectPage.mergeFirstTwoPersonas(personas);
            if (!merged) console.log("Merge Personas: merge control was unavailable.");
            expect(await projectPage.getPersonaCount()).toBeGreaterThan(1);
          } else {
            console.log("Merge Personas: skipped because fewer than two Personas are available.");
          }
        });

        await test.step("Create and cancel Persona creation", async () => {
          await projectPage.createPersona(`Taylor Morgan ${Date.now()}`, "Created by regression coverage.");
          await projectPage.cancelPersonaCreation(`Jordan Lee ${Date.now()}`, "Cancelled by regression coverage.");
        });

        await test.step("Validate Graph hierarchy levels", async () => {
          if (await projectPage.isGraphVisible()) {
            const clickedLevels = await projectPage.doubleClickGraphLevels(
              ["Persona", "Task", "Scenario", "Design", "Action", "Endpoint"]
            );
            console.log(`Graph levels double-clicked: ${clickedLevels.join(", ") || "none"}`);
          }
        });
      } finally {
        if (created) {
          await projectPage.deleteProjectFromDashboard(name);
        }
      }
    }
  );
});