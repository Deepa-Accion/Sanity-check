import { test, expect } from "../auth.fixture.mjs";
import { DEFAULT_BASE_URL } from "../../Pages/dashboardPage.js";

test.describe("Regression — Dashboard @enduser", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
  });

  test("@regression @dashboard BreezeAI dashboard Launched", async ({ page }) => {
    const title = await page.title();
    console.log("Page title after execution:", title);
    expect(title).toMatch(/Breeze\.AI/i);
  });
});
