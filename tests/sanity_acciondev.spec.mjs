import { test, expect } from "./auth.fixture.mjs";
import { createProject, selectProject } from "../Pages/dashboardPage.js";
import { openAllCards} from "../Pages/projectPage.js";
import { uploadDocumentInKnowledgeBase, uploadDocumentInAIChat } from "../Pages/knowlegeBase.js";

let projectName = '';
let projectId = '';
test.describe("Sanity Suite", () => {

  const ACCION_DEV_URL = process.env.TARGET_URL || "https://connect-new.accionbreeze.com/content";

  test.beforeEach("Url Calling", async ({ page}) => {
    await page.goto(ACCION_DEV_URL);
  });
  test("@sanity AccionConnect dev dashboard Launched", async ({ page }) => {
    await page.goto(ACCION_DEV_URL);
    const title = await page.title();
    console.log("Page title after execution:", title);
    expect(title).toMatch(/AccionConnect/i);
  });

});
