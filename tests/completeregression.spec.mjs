import { test, expect } from "./auth.fixture.mjs";
import { createProject, selectFirstListedProject, selectProject } from "../Pages/dashboardPage.js";
import { openAllCards, downloadArtifactPlainHtml, validateDownloadedPlainHtml, downloadArtifactPlainMarkdown } from "../Pages/projectPage.js";
import { uploadDocumentInKnowledgeBase, uploadDocumentInAIChat } from "../Pages/knowlegeBase.js";

let projectName = '';
let projectId = '';
test.describe("Sanity Suite", () => {

  test.beforeEach("Url Calling", async ({ page}) => {
    await page.goto("https://ai.accionbreeze.com/");
  });
  test("@regression BreezeAI dashboard Launched", async ({ page }) => {
    await page.goto("https://ai.accionbreeze.com/");
    const title = await page.title();
    console.log("Page title after execution:", title);
    expect(title).toMatch(/Breeze\.AI/i);
    //Launched breezeai dashboard
  });

  test("@regression BreezeAI create project with tag", async ({ page }) => {
    /* Steps involved. In Dashboard. Click on create project, give name, description and click on create */ 
    const currectDateTime = new Date().toISOString().replace(/[:.]/g, '-');
    projectName = `SanityCheck-${currectDateTime}-Automation`;
    projectId = await createProject(page, projectName, projectName);
    console.log("Project ID:", projectId);
    console.log("Project Name:", projectName);
  });

  test("@regression download artifact plain html from the artifacts page", async ({ page }) => {
    // Create new breeze project and download its plain html artifact  
    const currectDateTime = new Date().toISOString().replace(/[:.]/g, '-');
    projectName = `SanityCheck-${currectDateTime}-Automation`;
    projectId = await createProject(page, projectName, projectName);
    console.log("Project ID:", projectId);
    console.log("Project Name:", projectName);
    await downloadArtifactPlainHtml(page, projectId);
    await validateDownloadedPlainHtml(page, projectName);

  });

  test("@regression download artifact plain markdown from the artifacts page", async ({ page }) => {
    // Create new breeze project and download its plain markdown artifact
    const currectDateTime = new Date().toISOString().replace(/[:.]/g, '-');
    projectName = `SanityCheck-${currectDateTime}-Automation`;
    projectId = await createProject(page, projectName, projectName);
    console.log("Project ID:", projectId);
    console.log("Project Name:", projectName);
    await downloadArtifactPlainMarkdown(page, projectId);

  });

  
  });