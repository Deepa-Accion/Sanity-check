import { test, expect } from "./auth.fixture.mjs";
import { createProject, selectProject } from "../Pages/dashboardPage.js";
import { openAllCards} from "../Pages/projectPage.js";
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
    console.log("Project Name:", projectName); //Created project with name and description
  });

});
