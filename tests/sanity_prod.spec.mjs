import { test, expect, collectPageData } from "./auth-healing.fixture.mjs";
import { createProject, selectProject, selectFirstListedProject, theamChange, menuItemClick } from "../Pages/dashboardPage.js";
import { openAllCards, uploadAndGenerateCodeOntology } from "../Pages/projectPage.js";
import { newProjetCreation } from "../Pages/designPage.js";
import {
  generateFunctionalMetric,
  uploadFirstDocumentInKnowledgeBase,
  uploadDocumentwithDesignOntology,
  uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology
} from "../Pages/knowlegeBase.js";
import { withErrorCapture, checkAndRecoverFromAppError } from "./test-utils.mjs";

// Production app URL (https://accionbreeze.ai/ redirects here; navigating to that
// alternate domain mid-session corrupts SSO state, so all tests use this URL directly).
const PROD_APP_URL = "https://ai.accionbreeze.com/";

let projectName = "";
let projectId = "";

test.describe("Sanity Suite - Production", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(({ browserName }) => browserName !== "chromium", "This sanity flow is maintained for Chromium only.");

  async function ensureProjectCreated(page) {
    if (projectName && projectId) {
      return { projectName, projectId };
    }

    const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
    projectName = `SanityCheck-${currentDateTime}-Automation`;
    projectId = await createProject(page, projectName);

    if (!projectId) {
      throw new Error(`Project creation did not return an ID for ${projectName}`);
    }

    console.log("Project ID:", projectId);
    console.log("Project Name:", projectName);
    return { projectName, projectId };
  }

  async function ensureProjectOpen(page) {
    await ensureProjectCreated(page);

    if (page.url().includes(`/dashboard/${projectId}`)) {
      return projectId;
    }

    return selectProject(page, projectName);
  }

  test.beforeEach("Url Calling", async ({ page }) => {
    // Use the app URL so every test starts from an authenticated dashboard state.
    await page.goto(PROD_APP_URL, { waitUntil: "domcontentloaded" });
    await checkAndRecoverFromAppError(page);
    await collectPageData(page, "dashboard");
  });

  test("@sanity BreezeAI Prod dashboard Launched", withErrorCapture(async ({ page }) => {
    // beforeEach already navigated to PROD_APP_URL; just verify the title.
    await page.waitForTimeout(1000);
    const title = await page.title();
    console.log("Page title after execution:", title);
    console.log("Current URL:", page.url());
    expect(title).toMatch(/Breeze\.AI/i);
  }));

  test("@sanity BreezeAI create project", async ({ page }) => {
    await ensureProjectCreated(page);
  });

  test("@sanity Upload document and Generate Functional Metrics", async ({ page }) => {
    console.log("=== CRITICAL TEST: Upload Document & Generate Metrics ===");
    await ensureProjectOpen(page);

    console.log(`Selected project: ${projectName}`);

    console.log("Step 1: Uploading document...");
    await uploadFirstDocumentInKnowledgeBase(page, "pdf");

    await page.goto(`${PROD_APP_URL}dashboard/${projectId}`);
    await page.waitForTimeout(2000);

    console.log("Step 2: Generating functional metrics (this may take 2-3 minutes)...");
    await generateFunctionalMetric(page);
    console.log("=== CRITICAL TEST COMPLETED ===");
  });

  test("@sanity Upload document with Design Ontology", async ({ page }) => {
    await ensureProjectOpen(page);
    await uploadDocumentwithDesignOntology(page, "pdf");
  });

  test("@sanity Upload document with Architecture Ontology", async ({ page }) => {
    await ensureProjectOpen(page);
    await uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology(page, "txt");
  });

  test("@sanity Theme Change", withErrorCapture(async ({ page }) => {
    await menuItemClick(page);
    await theamChange(page);
  }));

  test("@sanity Search and Select project", withErrorCapture(async ({ page }) => {
    await ensureProjectOpen(page);
  }));

  test("@sanity Select first project displayed", withErrorCapture(async ({ page }) => {
    await selectFirstListedProject(page);
  }));

  test("@sanity Open AllCards in dashboard", async ({ page }) => {
    const returnedProjectId = await ensureProjectOpen(page);
    await openAllCards(page, returnedProjectId);
  });

  test("@sanity Generate design metrics", async ({ page }) => {
    await ensureProjectOpen(page);
    await newProjetCreation(page, "Webstie Design");
  });

  test("@sanity Generate Code Ontology", async ({ page }) => {
    // Create a dedicated project — code ontology is independent of the functional project
    const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const codeProjectName = `CodeOntology-${currentDateTime}-Automation`;

    console.log(`Creating project: ${codeProjectName}`);
    const codeProjectId = await createProject(page, codeProjectName);
    if (!codeProjectId) throw new Error(`Failed to create project: ${codeProjectName}`);
    console.log(`Code ontology project ID: ${codeProjectId}`);

    // Upload the pre-generated ndjson.gz of the sanity-check repo and generate the ontology
    await uploadAndGenerateCodeOntology(
      page,
      codeProjectId,
      'Sanity-check Automation Repo'
    );
  });
});
