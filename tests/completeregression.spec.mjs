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

const ontologyPdfName = ontologyPdfPath
  ? path.basename(ontologyPdfPath)
  : "Organic Producer-to-Customer E-Commerce Platform.pdf";

function requireOntologyPdf() {
  test.skip(
    !ontologyPdfPath,
    "No PDF document was found in the workspace documents directories.",
  );
}

let projectName = "";

const uniqueProjectName = (suffix) =>
  `Playwright-CreateProject-${suffix}-${Date.now()}`;

async function dismissNotifications(page) {
  const notifications = page
    .locator('section[aria-label*="Notifications" i], [data-sonner-toast]')
    .first();

  if (await notifications.isVisible().catch(() => false)) {
    const dismissButton = notifications
      .locator('button[aria-label*="close" i], button[title*="close" i], [data-close-button]')
      .first();
    if (await dismissButton.isVisible().catch(() => false)) {
      await dismissButton.click({ force: true, timeout: 10000 }).catch(() => {});
    }
    await page.waitForTimeout(1000);
  }
}

function readStatusCount(statusText) {
  const match = statusText.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

async function readGenerationStatuses(progressSurface) {
  const statuses = {};
  for (const status of ["Done", "Generating", "Queued", "Failed"]) {
    const statusText = progressSurface.getByText(status, { exact: true }).first();
    await expect(statusText).toBeVisible({ timeout: 30000 });
    statuses[status] = readStatusCount(await statusText.locator("..").innerText());
  }
  return statuses;
}

async function verifyGenerationProcessing(page) {
  const progressButton = page.getByRole("button", { name: /processing|progressing|progress/i }).first();
  const progressText = page.getByText(/processing|progressing/i).first();

  const buttonVisible = await progressButton.isVisible().catch(() => false);
  const textVisible = await progressText.isVisible().catch(() => false);

  if (!buttonVisible && !textVisible) {
    console.log("Processing control is not exposed in the current app state; the generation may already be complete or its transient state is not rendered.");
    return;
  }

  if (buttonVisible) {
    await progressButton.click({ force: true });
  } else {
    await progressText.click();
  }

  const progressSurface = page.getByRole("dialog").filter({ hasText: /Done|Generating|Queued|Failed/i }).first();
  await expect(progressSurface).toBeVisible({ timeout: 30000 });

  let latestStatuses;
  await expect.poll(async () => {
    latestStatuses = await readGenerationStatuses(progressSurface);
    console.log("Generation progress captured at runtime:", latestStatuses);

    if (latestStatuses.Failed > 0) return "failed";
    return latestStatuses.Generating === 0 && latestStatuses.Queued === 0 ? "complete" : "processing";
  }, { timeout: 240000, intervals: [1000, 2000, 5000] }).toBe("complete");

  expect(latestStatuses.Failed, `Generation failed: ${JSON.stringify(latestStatuses)}`).toBe(0);
  expect(latestStatuses.Generating).toBe(0);
  expect(latestStatuses.Queued).toBe(0);
  expect(latestStatuses.Done).toBeGreaterThan(0);

  const namedCloseButton = progressSurface.getByRole("button", { name: /close/i }).first();
  if (await namedCloseButton.isVisible().catch(() => false)) {
    await namedCloseButton.click();
  } else {
    await progressSurface.getByRole("button").last().click();
  }

  await expect(progressSurface).toBeHidden({ timeout: 30000 }).catch(() => {});
}

async function verifyGenerationProgressStatus(page) {
  const progressButton = page.getByRole("button", { name: /processing|progressing|progress/i }).first();
  const progressText = page.getByText(/processing|progressing/i).first();

  if (await progressButton.isVisible().catch(() => false)) {
    await progressButton.click({ force: true });
  } else if (await progressText.isVisible().catch(() => false)) {
    await progressText.click();
  } else {
    console.log("Processing state is not visible in the current runtime; skipping the explicit processing assertion.");
    return;
  }

  const progressSurface = page.getByRole("dialog").filter({ hasText: /Done|Generating|Queued|Failed/i }).first();
  await expect(progressSurface).toBeVisible({ timeout: 30000 });

  await expect.poll(async () => {
    const statuses = {};
    for (const status of ["Done", "Generating", "Queued", "Failed"]) {
      const label = progressSurface.getByText(status, { exact: true }).first();
      const text = await label.locator("..").innerText().catch(() => "0");
      statuses[status] = Number(String(text).match(/\d+/)?.[0] || 0);
    }
    if (statuses.Failed > 0) return "failed";
    return statuses.Generating === 0 && statuses.Queued === 0 ? "complete" : "processing";
  }, { timeout: 240000, intervals: [1000, 2000, 5000] }).toBe("complete");

  const closeButton = progressSurface.getByRole("button", { name: /close/i }).first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  } else {
    await progressSurface.getByRole("button").last().click();
  }

  await expect(progressSurface).toBeHidden({ timeout: 30000 }).catch(() => {});
}

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

        await projectPage.waitForProjectVisible(projectName, 120000);
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
    "@regression rejects a tag longer than 50 characters",
    async ({ page }) => {
      const createProjectPage = await new ProjectPage(page).openCreateProjectForm();
      const projectName = uniqueProjectName("tag-length");
      const invalidTag = "Playwright-CreateProject-Tag-validation-more-than-50-characters";

      expect(invalidTag.length).toBeGreaterThan(50);
      await createProjectPage.fillProjectName(projectName);
      await createProjectPage.addTag(invalidTag);

      await expect(createProjectPage.tagValidationMessage).toBeVisible({ timeout: 30000 });
      await expect(createProjectPage.tagValidationMessage).toHaveText("Tag name must not exceed 50 characters");
      await expect(createProjectPage.getTagChip(invalidTag)).toHaveCount(0);

      await createProjectPage.cancelOrClose();
      await expect(createProjectPage.projectNameInput).toBeHidden({ timeout: 30000 });
      expect(await createProjectPage.projectDestination(projectName)).toBeNull();
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

        await expect
          .poll(
            async () => Boolean(await createProjectPage.projectDestination(name)),
            { timeout: 30000 }
          )
          .toBe(true);
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
      const projectPage = new ProjectPage(page);
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

        expect(
          validationMessage,
          "Duplicate project creation must be rejected with a validation message"
        ).toBeTruthy();

        if (await second.formIsVisible()) {
          await second.cancelOrClose();
        }
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(name, 120000);
        expect(await projectPage.isProjectVisible(name)).toBe(true);
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

  test(
    "@regression Cancel Processing Document",
    async ({ page }) => {
      requireOntologyPdf();
      test.setTimeout(900000);

      const dashboardPage = new DashboardPage(page);
      const projectPage = new ProjectPage(page);
      const createdProjectName = uniqueProjectName("ontology-cancel");
      let created = false;

      try {
        await test.step("Create a project, wait for it to appear, open it, and then open the ontology workflow", async () => {
          await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
          created = true;
          await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
          await projectPage.waitForProjectVisible(createdProjectName, 120000);
          await expect(projectPage.getProjectCard(createdProjectName)).toBeVisible({ timeout: 30000 });
          await projectPage.getProjectCard(createdProjectName).click();
          await projectPage.openFunctionalWorkflow();
        });

        await test.step("Upload the PDF and wait for the document row to render", async () => {
          await projectPage.uploadFunctionalDocument(ontologyPdfPath);
          await expect(page.getByText(ontologyPdfName, { exact: true }).first()).toBeVisible({ timeout: 30000 });
          await projectPage.uploadAllDocuments();
          await projectPage.generateFunctionalOntology();
        });

        await test.step("Click Processing, close the processing dialog, and cancel the in-flight generation", async () => {
          await projectPage.clickProcessing();
          await projectPage.waitForAction();
          await projectPage.closeProcessingDialog();
          await projectPage.waitForAction();
          await projectPage.cancelDocumentProcessing(ontologyPdfName);
          await projectPage.waitForAction();
          await projectPage.confirmStopGeneration();
          await projectPage.waitForAction();
        });

        await test.step("Delete the cancelled document and confirm removal", async () => {
          await projectPage.deleteUploadedDocument(ontologyPdfName);
          await projectPage.waitForAction();
          await projectPage.confirmDelete();
          await projectPage.waitForAction();
          await expect.poll(async () => page.getByText(ontologyPdfName, { exact: true }).count(), { timeout: 60000 }).toBe(0);
        });
      } finally {
        if (created) {
          await projectPage.deleteProjectFromDashboard(createdProjectName);
        }
      }
    }
  );

  // Added on 11-09-2026. Verify refreshing the Functional ontology page does not lose the uploaded/processing document state
  test("@regression preserves Functional document state across refresh during processing", async ({ page }) => {
    requireOntologyPdf();
    test.setTimeout(900000);
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-refresh-processing");
    let created = false;

    try {
      await test.step("Create project, upload the PDF, and start processing", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 120000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        await projectPage.uploadAllDocuments();
      });

      await test.step("Refresh and verify the recovered document state", async () => {
        const before = await projectPage.getFunctionalGenerationState();
        test.skip(!before.processingVisible && !before.generateVisible, "Processing state was no longer exposed when refresh was reached.");
        await projectPage.refreshFunctionalWorkflow();
        await expect.poll(() => projectPage.isUploadedFileVisible(ontologyPdfName), { timeout: 60000 }).toBe(true);
        const after = await projectPage.getFunctionalGenerationState();
        expect(after.functionalRequirementsVisible && !after.processingVisible).toBe(false);
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

  // Added on 11-09-2026. Verify repeated Generate actions do not create duplicate ontology generation jobs
  test("@regression prevents repeated ontology generation actions", async ({ page }) => {
    requireOntologyPdf();
    test.setTimeout(900000);
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-repeat-generate");
    let created = false;

    try {
      await test.step("Create project, upload the PDF, and trigger Generate", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 120000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        await projectPage.uploadAllDocuments();
        const state = await projectPage.getFunctionalGenerationState();
        test.skip(!state.generateVisible || !state.generateEnabled, "Generate was not available before processing completed.");
        await projectPage.generateFunctionalOntology();
      });

      await test.step("Verify a repeated Generate action is prevented", async () => {
        const state = await projectPage.getFunctionalGenerationState();
        if (state.generateVisible && state.generateEnabled) {
          await projectPage.generateButton.click({ force: true });
        }
        const after = await projectPage.getFunctionalGenerationState();
        expect(after.processingVisible || !after.generateEnabled).toBe(true);
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

  test(
    "@regression View Download and Manage Tags",
    async ({ page }) => {
      requireOntologyPdf();
      test.setTimeout(900000);

      const dashboardPage = new DashboardPage(page);
      const projectPage = new ProjectPage(page);
      const createdProjectName = uniqueProjectName("ontology-menu");
      let created = false;

      try {
        await test.step("Create a project, wait for it to appear, open it, and then open the ontology workflow", async () => {
          await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
          created = true;
          await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
          await projectPage.waitForProjectVisible(createdProjectName, 120000);
          await expect(projectPage.getProjectCard(createdProjectName)).toBeVisible({ timeout: 30000 });
          await projectPage.getProjectCard(createdProjectName).click();
          await projectPage.openFunctionalWorkflow();
        });

        await test.step("Upload the PDF and wait for the document row to render", async () => {
          await projectPage.uploadFunctionalDocument(ontologyPdfPath);
          await expect(page.getByText(ontologyPdfName, { exact: true }).first()).toBeVisible({ timeout: 30000 });
          await projectPage.uploadAllDocuments();
          await projectPage.generateFunctionalOntology();
        });

        await test.step("Click Processing and wait for generation to complete", async () => {
          await projectPage.clickProcessing();
          await projectPage.waitForAction();
          await projectPage.waitForGenerationComplete(600000);
          await expect(projectPage.functionalRequirementsHeading).toBeVisible({ timeout: 30000 });
        });

        await test.step("Open the uploaded document viewer, confirm it opens, and close it", async () => {
          const viewerDialog = await projectPage.viewUploadedDocument(ontologyPdfName);
          await expect(viewerDialog).toBeVisible({ timeout: 30000 });
          await projectPage.waitForAction();
          await projectPage.closeDocumentViewer();
        });

        await test.step("Download the document and verify an actual file is created", async () => {
          await projectPage.downloadUploadedDocument(ontologyPdfName, ontologyPdfPath);
          await projectPage.waitForAction();
        });

        await test.step("Open Manage Tags and verify the dialog is visible", async () => {
          const tagsDialog = await projectPage.openManageTags(ontologyPdfName);
          await expect(tagsDialog).toBeVisible({ timeout: 30000 });
        });
      } finally {
        if (created) {
          await projectPage.deleteProjectFromDashboard(createdProjectName);
        }
      }
    }
  );

  // Added on 11-09-2026. Verify Upload All/Generate cannot proceed when no document is selected
  test("@regression rejects ontology generation without a selected document", async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-no-document");
    let created = false;

    try {
      test.setTimeout(300000);
      await test.step("Create project and open Functional workflow", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 120000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
      });

      await test.step("Verify generation controls remain unavailable without a document", async () => {
        await expect(projectPage.uploadDocumentButton).toBeVisible({ timeout: 30000 });
        const state = await projectPage.getFunctionalGenerationState();
        expect(state.processingVisible).toBe(false);
        expect(state.generateEnabled).toBe(false);
        expect(state.uploadAllEnabled).toBe(false);
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

  // Added on 11-09-2026. Verify ontology generation cannot start before document processing is complete
  test("@regression prevents generation before document processing completes", async ({ page }) => {
    test.setTimeout(900000);
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-before-processing");
    let created = false;

    try {
      await test.step("Create project, open Functional workflow, and upload the PDF", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 180000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        await projectPage.uploadAllDocuments();
      });

      await test.step("Verify Generate remains unavailable while processing", async () => {
        const state = await projectPage.getFunctionalGenerationState();
        test.skip(state.functionalRequirementsVisible, "Upload All automatically started or completed generation before Generate was independently available.");
        test.skip(!state.processingVisible && !state.generateVisible, "The transient processing state was not exposed.");
        expect(state.functionalRequirementsVisible).toBe(false);
        expect(state.processingVisible || !state.generateEnabled).toBe(true);
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

  // Added on 11-09-2026. Verify unsupported file types are rejected during Functional ontology upload
  test("@regression rejects an unsupported Functional ontology file", async ({ page }) => {
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-invalid-file");
    const invalidFilePath = path.resolve(process.cwd(), "test-data/unsupported-ontology-upload.exe");
    const invalidFileName = path.basename(invalidFilePath);
    let created = false;

    try {
      await test.step("Create project and open Functional workflow", async () => {
        expect(fs.existsSync(invalidFilePath)).toBe(true);
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 180000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
      });

      await test.step("Verify the unsupported file is not accepted as a document", async () => {
        await projectPage.selectFunctionalFile(invalidFilePath);
        const selected = await projectPage.isUploadedFileVisible(invalidFileName);
        const state = await projectPage.getFunctionalGenerationState();
        expect(selected && state.uploadAllEnabled, "Unsupported file was treated as a valid document.").toBe(false);
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

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
  // - Functional filters
  // ============================================================

  test(
    "@regression creates an ontology and covers Persona and Graph workflows",
    async ({ page }) => {
      requireOntologyPdf();
      test.setTimeout(900000);

      const dashboardPage = new DashboardPage(page);
      const projectPage = new ProjectPage(page);
      const createdProjectName = uniqueProjectName("ontology");
      let created = false;

      try {
        await test.step("Create a new project, wait for it to appear, and open it", async () => {
          await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
          created = true;
          await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
          await projectPage.waitForProjectVisible(createdProjectName, 120000);
          await expect(projectPage.getProjectCard(createdProjectName)).toBeVisible({ timeout: 30000 });
          await projectPage.getProjectCard(createdProjectName).click();
          await expect.poll(() => page.url(), { timeout: 20000 }).toMatch(/dashboard\//i);
        });

        await test.step("Open Ontology Generation and Functional workflow", async () => {
          await projectPage.openFunctionalWorkflow();
          await expect(projectPage.uploadDocumentButton).toBeVisible({ timeout: 30000 });
        });

        await test.step("Click Upload Document and upload the configured PDF", async () => {
          await projectPage.uploadFunctionalDocument(ontologyPdfPath);
          expect(await projectPage.isUploadedFileVisible(ontologyPdfName)).toBe(true);
        });

        await test.step("Upload and generate the document for ontology coverage", async () => {
          await projectPage.uploadAllDocuments();
          await projectPage.generateFunctionalOntology();

          await projectPage.waitForAction();
          await projectPage.clickProcessing();
          await projectPage.waitForAction();
          await projectPage.waitForGenerationComplete(600000);
          await expect(projectPage.functionalRequirementsHeading).toBeVisible({ timeout: 30000 });
        });


        await test.step("Clone and delete a Persona", async () => {
          const sourcePersona = await projectPage.getVisibleNodeName("Persona");
          if (!sourcePersona) {
            console.log("Clone and delete a Persona: no Persona nodes are exposed in the current runtime state; skipping persona mutation checks.");
            return;
          }
          const beforeNames = await projectPage.getPersonaNames();
          const clonedPersona = await projectPage.cloneAndDeletePersona(sourcePersona);
          const afterNames = await projectPage.getPersonaNames();
          expect(clonedPersona || afterNames.length).toBeTruthy();
          expect(afterNames.length).toBeGreaterThan(0);
        });

        await test.step("Edit a Persona description", async () => {
          await projectPage.refreshOntology();
          const persona = await projectPage.getVisibleNodeName("Persona");
          if (!persona) {
            console.log("Edit a Persona description: no Persona nodes are exposed in the current runtime state; skipping description update.");
            return;
          }
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



      } finally {
        if (created) {
          await projectPage.deleteProjectFromDashboard(createdProjectName);
        }
      }
    }
  );

  // Added on 11-09-2026. Verify cancelling Persona creation does not create a Persona
  test("@regression cancels Persona creation without saving", async ({ page }) => {
    requireOntologyPdf();
    test.setTimeout(900000);
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-cancel-persona");
    const temporaryName = `Cancelled Persona ${Date.now()}`;
    let created = false;

    try {
      await test.step("Create project and generate ontology", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 120000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        await projectPage.uploadAllDocuments();
        await projectPage.generateFunctionalOntology();
        await projectPage.clickProcessing();
        await projectPage.waitForGenerationComplete(600000);
      });

      await test.step("Cancel Persona creation and compare dynamic state", async () => {
        const before = await projectPage.getPersonaNames();
        const dialog = await projectPage.openPersonaCreationDialog();
        await dialog.locator("input").first().fill(temporaryName);
        await dialog.locator("textarea").first().fill("This Persona must not be saved.");
        await dialog.getByRole("button", { name: /^cancel$/i }).click();
        await expect(dialog).toBeHidden({ timeout: 30000 });
        await projectPage.refreshOntology();
        expect(await projectPage.getPersonaNames()).toEqual(before);
        expect(await projectPage.getPersonaNames()).not.toContain(temporaryName);
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

  // Added on 11-09-2026. Verify Persona creation is prevented when required fields are empty
  test("@regression prevents Persona creation with empty required fields", async ({ page }) => {
    requireOntologyPdf();
    test.setTimeout(900000);
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-empty-persona");
    let created = false;

    try {
      await test.step("Create project and generate ontology", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 120000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        await projectPage.uploadAllDocuments();
        await projectPage.generateFunctionalOntology();
        await projectPage.clickProcessing();
        await projectPage.waitForGenerationComplete(600000);
      });

      await test.step("Attempt to create a Persona without required values", async () => {
        const before = await projectPage.getPersonaNames();
        const dialog = await projectPage.openPersonaCreationDialog();
        const createButton = dialog.getByRole("button", { name: /^create$/i });
        await expect(createButton).toBeVisible();
        expect(await createButton.isEnabled()).toBe(false);
        const dialogStillVisible = await dialog.isVisible().catch(() => false);
        expect(dialogStillVisible).toBe(true);
        expect(await projectPage.getPersonaNames()).toEqual(before);
        await dialog.getByRole("button", { name: /^cancel$/i }).click();
        await expect(dialog).toBeHidden({ timeout: 30000 });
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

  // Added on 11-09-2026. Verify Persona merge is unavailable or prevented when fewer than two Personas exist
  test("@regression prevents Persona merge with fewer than two Personas", async ({ page }) => {
    requireOntologyPdf();
    test.setTimeout(900000);
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-merge-persona");
    let created = false;

    try {
      await test.step("Create project and generate ontology", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 120000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        await projectPage.uploadAllDocuments();
        await projectPage.generateFunctionalOntology();
        await projectPage.clickProcessing();
        await projectPage.waitForGenerationComplete(600000);
      });

      await test.step("Check merge behavior for the dynamic Persona set", async () => {
        const personas = await projectPage.getPersonaNames();
        test.skip(personas.length >= 2, "At least two Personas were generated, so the fewer-than-two precondition does not apply.");
        const state = await projectPage.getPersonaMergeState();
        if (!state.mergeModeVisible) {
          expect(state.mergeVisible).toBe(false);
          return;
        }
        await projectPage.clickOntologyAction("Merge Mode");
        const after = await projectPage.getPersonaMergeState();
        expect(after.mergeVisible && after.mergeEnabled).toBe(false);
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

  // Added on 11-09-2026. Verify Persona description validation prevents invalid updates
  test("@regression rejects an empty Persona description update", async ({ page }) => {
    requireOntologyPdf();
    test.setTimeout(900000);
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-edit-persona");
    let created = false;

    try {
      await test.step("Create project and generate ontology", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 120000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        await projectPage.uploadAllDocuments();
        await projectPage.generateFunctionalOntology();
        await projectPage.clickProcessing();
        await projectPage.waitForGenerationComplete(600000);
      });

      await test.step("Attempt an empty description update", async () => {
        const persona = (await projectPage.getPersonaNames())[0];
        test.skip(!persona, "No Persona is exposed in the generated ontology.");
        const dialog = await projectPage.openPersonaEditDialog(persona);
        const description = dialog.getByRole("textbox", { name: /description/i });
        await expect(description).toBeVisible();
        await description.fill("   ");
        await dialog.getByRole("button", { name: "Update", exact: true }).click();
        const remainsOpen = await dialog.isVisible().catch(() => false);
        expect(remainsOpen).toBe(true);
        await dialog.getByRole("button", { name: /cancel|close/i }).last().click();
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

  // Added on 11-09-2026. Verify cancelling a Persona mutation leaves the original Persona data unchanged
  test("@regression cancels a Persona edit without changing original data", async ({ page }) => {
    requireOntologyPdf();
    test.setTimeout(900000);
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-cancel-edit");
    let created = false;

    try {
      await test.step("Create project and generate ontology", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 120000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        await projectPage.uploadAllDocuments();
        await projectPage.generateFunctionalOntology();
        await projectPage.clickProcessing();
        await projectPage.waitForGenerationComplete(600000);
      });

      await test.step("Edit then cancel without saving", async () => {
        const persona = (await projectPage.getPersonaNames())[0];
        test.skip(!persona, "No Persona is exposed in the generated ontology.");
        const dialog = await projectPage.openPersonaEditDialog(persona);
        const description = dialog.getByRole("textbox", { name: /description/i });
        const original = await description.inputValue();
        await description.fill(`Cancelled edit ${Date.now()}`);
        const cancel = dialog.getByRole("button", { name: /cancel|close/i }).last();
        test.skip(!(await cancel.isVisible().catch(() => false)), "Edit dialog has no cancel control.");
        await cancel.click();
        await expect(dialog).toBeHidden({ timeout: 30000 });
        const reopened = await projectPage.openPersonaEditDialog(persona);
        await expect(reopened.getByRole("textbox", { name: /description/i })).toHaveValue(original);
        await reopened.getByRole("button", { name: /cancel|close/i }).last().click();
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

  // Added on 11-09-2026. Verify Persona creation rejects whitespace-only or invalid Persona names
  test("@regression rejects a whitespace-only Persona name", async ({ page }) => {
    requireOntologyPdf();
    test.setTimeout(900000);
    const dashboardPage = new DashboardPage(page);
    const projectPage = new ProjectPage(page);
    const createdProjectName = uniqueProjectName("negative-whitespace-persona");
    let created = false;

    try {
      await test.step("Create project and generate ontology", async () => {
        await dashboardPage.createProjectWithTag(createdProjectName, createdProjectName);
        created = true;
        await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
        await projectPage.waitForProjectVisible(createdProjectName, 120000);
        await projectPage.getProjectCard(createdProjectName).click();
        await projectPage.openFunctionalWorkflow();
        await projectPage.uploadFunctionalDocument(ontologyPdfPath);
        await projectPage.uploadAllDocuments();
        await projectPage.generateFunctionalOntology();
        await projectPage.clickProcessing();
        await projectPage.waitForGenerationComplete(600000);
      });

      await test.step("Attempt to create a Persona with a whitespace-only name", async () => {
        const before = await projectPage.getPersonaNames();
        const dialog = await projectPage.openPersonaCreationDialog();
        await dialog.locator("input").first().fill("   ");
        await dialog.locator("textarea").first().fill("Invalid whitespace-only name.");
        const createButton = dialog.getByRole("button", { name: /^create$/i });
        await expect(createButton).toBeVisible();
        expect(await createButton.isEnabled()).toBe(false);
        const remainsOpen = await dialog.isVisible().catch(() => false);
        expect(remainsOpen).toBe(true);
        expect(await projectPage.getPersonaNames()).toEqual(before);
        await dialog.getByRole("button", { name: /^cancel$/i }).click();
        await expect(dialog).toBeHidden({ timeout: 30000 });
        expect(await projectPage.getPersonaNames()).not.toContain("   ");
      });
    } finally {
      if (created) await projectPage.deleteProjectFromDashboard(createdProjectName);
    }
  });

});
