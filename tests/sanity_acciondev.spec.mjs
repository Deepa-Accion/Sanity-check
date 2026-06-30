import { test, expect } from "./auth.fixture.mjs";
import { createProject, selectProject } from "../Pages/dashboardPage.js";
import { openAllCards} from "../Pages/projectPage.js";
import { uploadDocumentInKnowledgeBase, uploadDocumentInAIChat } from "../Pages/knowlegeBase.js";

let projectName = '';
let projectId = '';
test.describe("Sanity Suite", () => {

  test.beforeEach("Url Calling", async ({ page}) => {
    await page.goto("https://connect-new.accionbreeze.com/content");
  });
  test("@sanity AccionConnect dev dashboard Launched", async ({ page }) => {
    await page.goto("https://connect-new.accionbreeze.com/content");
    const title = await page.title();
    console.log("Page title after execution:", title);
    expect(title).toMatch(/AccionConnect/i);
  });

});
