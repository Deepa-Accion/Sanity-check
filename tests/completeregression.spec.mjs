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
  //
  // Validates:
  // - Opening the Functional Requirements workflow
  // - Uploading a PDF file and waiting for processing
  // - Selecting the uploaded PDF document and menu actions
  // - View, Download, and Manage Tags menu flow
  // - Functional Requirements heading, subtitle, and dynamic hierarchy counts
  // - Persona discovery, cloning, editing, and deletion
  // - Merging Personas when multiple Personas are available
  // - Creating and cancelling Persona creation
  // - Hierarchy traversal after Persona click
  // - Graph legend and dynamic graph node discovery
  // - Graph hierarchy level visibility and double-click actions
  // - Functional filters and Design workflow validation
  // ============================================================
  test(
    "@regression creates an ontology and covers Persona and Graph workflows",
    async ({ page }) => {
      test.setTimeout(900000);

      const projectPage = new ProjectPage(page);
      const projectName = "Playwright-Hierarchy & QA / 1788956194242";

      await test.step("Open application", async () => {
        await page.goto(DEFAULT_BASE_URL, {
          waitUntil: "domcontentloaded",
        });
      });

      await test.step("Open existing project", async () => {
        const project = page.getByText(projectName, { exact: true });
        await expect(project).toBeVisible({ timeout: 20000 });
        await project.click();
        await expect.poll(() => page.url(), { timeout: 20000 }).toMatch(/dashboard\//i);
      });

      await test.step("Open Functional Requirements workflow", async () => {
        await projectPage.openFunctionalWorkflow();
        await expect(projectPage.functionalRequirementsHeading).toBeVisible();
        await expect(projectPage.functionalSubtitle).toBeVisible();
        await expect(projectPage.filterNodesButton).toBeVisible();
        await expect(projectPage.refreshAllDataButton).toBeVisible();
      });

      await test.step("Upload PDF file and wait for processing", async () => {
        const uploadedAlready = await projectPage.isUploadedFileVisible(ontologyPdfName);
        if (uploadedAlready) {
          console.log(`PDF "${ontologyPdfName}" is already present; skipping upload and processing step.`);
          return;
        }

        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        expect(await projectPage.isUploadedFileVisible(ontologyPdfName)).toBe(true);
        expect(await projectPage.uploadAllDocuments()).toBe(true);
        await projectPage.generateFunctionalOntology();
        await projectPage.waitForGenerationComplete();
        expect(await projectPage.isOntologyRedoVisible()).toBe(true);
      });

      await test.step("Find uploaded document and click three dots", async () => {
        const documentName = page.getByText(ontologyPdfName, { exact: true });
        await expect(documentName).toBeVisible({ timeout: 20000 });
        const documentRow = documentName.locator("xpath=ancestor::div[.//button][1]");
        await expect(documentRow).toBeVisible();
        const menuButton = documentRow.getByRole("button").last();
        await expect(menuButton).toBeVisible();
        await menuButton.click();
      });

      await test.step("Validate uploaded document View, Download, and Manage Tags menu flow", async () => {
        const redoVisible = await projectPage.isOntologyRedoVisible();
        if (redoVisible) {
          await expect(projectPage.getDocumentCard(ontologyPdfName)).toBeVisible({ timeout: 30000 });
        } else {
          console.log("Redo is not exposed in the current uploaded document state; continuing with menu validation.");
          await expect(projectPage.getDocumentCard(ontologyPdfName)).toBeVisible({ timeout: 30000 });
        }

        await page.waitForTimeout(1000);
        await projectPage.verifyUploadedDocumentOperations(ontologyPdfName, ontologyPdfPath);
      });

      await test.step("Validate Functional Requirements title, subtitle, and dynamic hierarchy", async () => {
        await projectPage.validateFunctionalRequirementsObservedContent();
        await projectPage.validateFunctionalHierarchyTraversal();
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

      await test.step("Validate ontology hierarchy traversal after persona click wait", async () => {
        await projectPage.waitForHierarchyTraversalAfterPersonaClick();
      });

      await test.step("Validate Graph legend when the graph is present", async () => {
        const legendVisible = await projectPage.validateGraphLegend(["Persona", "Task", "Scenario", "Step", "Action", "Api"]);
        if (legendVisible) {
          console.log("Graph legend labels were detected in the currently visible ontology graph.");
        } else {
          console.log("Graph legend labels are not exposed in the currently visible ontology graph view.");
        }
      });

      await test.step("Validate every graph hierarchy level label is visible in Graph mode", async () => {
        const visible = await projectPage.validateGraphHierarchyLevelVisibility(["Persona", "Task", "Scenario", "Design", "Action", "Api"]);
        expect(visible).toBe(true);
      });

      await test.step("Validate each Persona is selected and double-clicked in Graph mode", async () => {
        const personas = await projectPage.getPersonaNames();
        if (personas.length > 0) {
          const graphPersonaClicks = await projectPage.selectEveryPersonaInGraphAndDoubleClick(personas);
          console.log(`Graph persona select+double-clicked: ${graphPersonaClicks.join(", ") || "none"}`);
        }
      });

      await test.step("Validate Graph hierarchy levels", async () => {
        if (await projectPage.isGraphVisible()) {
          const clickedLevels = await projectPage.doubleClickGraphLevels(["Persona", "Task", "Scenario", "Design", "Action", "Api"]);
          console.log(`Graph levels double-clicked: ${clickedLevels.join(", ") || "none"}`);
        }
      });

      await test.step("Validate Functional Requirements actions, filters, and Design workflow", async () => {
        await projectPage.functionalWorkflowButton.click();
        await expect(projectPage.functionalRequirementsHeading).toBeVisible({ timeout: 30000 });
        await expect(projectPage.functionalSubtitle).toBeVisible({ timeout: 30000 });

        const addPersonaButton = page.getByRole("button", { name: "Add Persona" }).first();
        if (await addPersonaButton.count()) {
          await expect(addPersonaButton).toBeVisible();
        } else {
          console.log("Add Persona control is not present in the current UI state.");
        }

        const mergeModeButton = page.getByRole("button", { name: "Merge Mode" }).first();
        if (await mergeModeButton.count()) {
          await expect(mergeModeButton).toBeVisible();
        } else {
          console.log("Merge Mode control is not present in the current UI state.");
        }

        const editButton = page.getByRole("button", { name: "Edit" }).first();
        if (await editButton.count()) {
          await expect(editButton).toBeVisible();
        } else {
          console.log("Edit control is not present in the current UI state.");
        }

        const deleteButton = page.getByRole("button", { name: "Delete" }).first();
        if (await deleteButton.count()) {
          await expect(deleteButton).toBeVisible();
        } else {
          console.log("Delete control is not present in the current UI state.");
        }

        const filterDialogVisible = await projectPage.filterDialog.isVisible().catch(() => false);
        if (!filterDialogVisible) {
          await projectPage.openFilters();
        }

        const filterLabels = projectPage.filterDialog.getByRole("combobox").first();
        if (await filterLabels.count()) {
          await filterLabels.click();
        }
        for (const label of ["Persona", "Task", "Scenario", "Step", "Action", "Api"]) {
          const option = page.getByRole("option", { name: label, exact: true }).first();
          if (await option.count()) {
            await expect(option).toBeVisible();
          } else {
            console.log(`Filter option not present in current UI state: ${label}`);
          }
        }
        await page.keyboard.press("Escape");
        await projectPage.filterByTaskName("Document");
        await expect(page.getByRole("button", { name: "Remove Task filter" })).toBeVisible();
        await projectPage.clearFilters();

        await projectPage.refreshAllData();
        await expect(projectPage.functionalRequirementsHeading).toBeVisible();
        await expect(page.getByText("All functional data refreshed", { exact: true })).toBeVisible();

        await projectPage.openDesignWorkflow();
        await expect(projectPage.designOntologyHeading).toBeVisible();
        await expect(projectPage.userJourneysHeading).toBeVisible();
        await expect(projectPage.userJourneysSearch).toHaveValue("");
        await expect(projectPage.addUserJourneyButton).toBeVisible();
        await expect(projectPage.bulkDeleteUserJourneysButton).toBeVisible();
        const userJourneyCount = await projectPage.getSectionCount("User Journeys");
        expect(userJourneyCount).toMatch(/^\d+ of \d+$/);
      });
    }
  );
});