import { test, expect } from "./auth.fixture.mjs";
import { createProject, selectProject } from "../Pages/dashboardPage.js";
import { openAllCards} from "../Pages/projectPage.js";
import { uploadDocumentInKnowledgeBase, uploadDocumentInAIChat } from "../Pages/knowlegeBase.js";

let projectName = '';
let projectId = '';
test.describe("Sanity Suite", () => {

  test.beforeEach("Url Calling", async ({ page}) => {
    await page.goto("https://accionbreeze.ai/");
  });
  test("@sanity BreezeAI Prod dashboard Launched", async ({ page }) => {
    // Use the main URL that the project is configured for
    await page.goto("https://ai.accionbreeze.com/", { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const title = await page.title();
    console.log("Page title after execution:", title);
    expect(title).toMatch(/Breeze\.AI/i);

  });
});
