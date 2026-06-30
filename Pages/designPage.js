import { expect } from "@playwright/test";

async function openDesignCard(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    window.scrollBy(0, 1000);
  }).catch(() => {});
  await page.waitForTimeout(1000);

  const locators = [
    page.getByRole("button", { name: /Mockups/i }).first(),
    page.getByRole("button", { name: /Design\s+UX\/UI\s+patterns/i }).first(),
    page.getByRole("button", { name: /Design\s+Generation/i }).first(),
    page.locator("button, [role='button'], h2, h3, h4, div").filter({ hasText: /Mockups|Design\s+UX\/UI\s+patterns|Design\s+Generation/i }).first()
  ];

  for (const locator of locators) {
    const visible = await locator.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      await expect(locator).toBeVisible({ timeout: 10000 });
      await locator.click();
      await page.waitForTimeout(2000);
      return true;
    }
  }

  console.warn("[designPage] Design card not found, skipping");
  return false;
}

export async function designGeneration(page) {
  await openDesignCard(page);
}

export async function newProjetCreation(page, webSiteName = null) {
  const opened = await openDesignCard(page);
  if (!opened) {
    return;
  }

  const addWebsiteButton = page.getByRole("button", { name: /Add Your First Website/i }).first();
  const addWebsiteVisible = await addWebsiteButton.isVisible({ timeout: 5000 }).catch(() => false);
  if (!addWebsiteVisible) {
    console.warn("[designPage] Add Your First Website button not found, skipping website creation");
    return;
  }

  await addWebsiteButton.click();

  const nameInput = page.getByPlaceholder(/Enter website name/i).first();
  await expect(nameInput).toBeVisible({ timeout: 10000 });
  await nameInput.fill(webSiteName || "Demo Website");

  const typeCombobox = page.locator('button[role="combobox"]').first();
  const comboboxVisible = await typeCombobox.isVisible({ timeout: 5000 }).catch(() => false);
  if (comboboxVisible) {
    await typeCombobox.click();
    const webOption = page.getByRole("option", { name: /^Web$/i }).first();
    const optionVisible = await webOption.isVisible({ timeout: 5000 }).catch(() => false);
    if (optionVisible) {
      await webOption.click();
    }
  }

  const createWebsiteButton = page.getByRole("button", { name: /Create Website/i }).first();
  await expect(createWebsiteButton).toBeVisible({ timeout: 10000 });
  await createWebsiteButton.click();
  await page.waitForTimeout(2000);
}
