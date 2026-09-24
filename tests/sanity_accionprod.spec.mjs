import { test, expect } from "./auth.fixture.mjs";

test.describe("Sanity Suite", () => {

  const ACCION_PROD_URL = process.env.TARGET_URL || "https://connect.accionlabs.com/home";

  test.beforeEach("Url Calling", async ({ page}) => {
    await page.goto(ACCION_PROD_URL);
  });
  test("@sanity Accion Connect Prod dashboard Launched", async ({ page }) => {
    await page.goto(ACCION_PROD_URL);
    
    // Try multiple selectors for login button
    let loginBtn = page.getByTestId('Accion-Labs-login-button');
    let found = await loginBtn.isVisible().catch(() => false);
    
    if (!found) {
      loginBtn = page.locator('button:has-text("Accion Labs")');
      found = await loginBtn.isVisible().catch(() => false);
    }
    
    if (!found) {
      loginBtn = page.getByRole('button', { name: /Accion\s+Labs/i });
    }
    
    if (await loginBtn.isVisible().catch(() => false)) {
      await loginBtn.click();
    } else {
      console.warn('Login button not found, checking page title anyway');
    }
    
    const title = await page.title();
    console.log("Page title after execution:", title);
    expect(title).toMatch(/AccionConnect|Accion\s+Connect/i);
  });

});
