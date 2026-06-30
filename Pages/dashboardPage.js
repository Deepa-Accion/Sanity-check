import { expect } from "@playwright/test";

// Page Object for BreezeAI Dashboard
// Encapsulates actions like creating a project

/**
 * Create a new project from the BreezeAI dashboard.
 * Adjust selectors as needed to match the real UI.
 * @param {import('@playwright/test').Page} page
 * @param {string} projectName
 */
async function ensureDashboardReady(page) {
  await page.waitForLoadState("domcontentloaded");

  const signInButton = page.getByRole("button", { name: /sign in with accion labs/i });
  const signInVisible = await signInButton.isVisible().catch(() => false);

  if (signInVisible) {
    await signInButton.click();
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5000);
  }

  const microsoftSignInHeading = page.getByRole("heading", { name: /^sign in$/i });
  const microsoftSignInVisible = await microsoftSignInHeading.isVisible().catch(() => false);

  if (microsoftSignInVisible) {
    throw new Error(
      "Authentication required. Provide a valid authenticated session in session-auth.json/auth.json or complete Microsoft sign-in before running the sanity suite."
    );
  }
}

export async function createProject(page, projectName, tag = null) {
  // Wait for page to be ready after login
  await page.waitForLoadState('networkidle');
  await ensureDashboardReady(page);
  
  // Try multiple selectors for Create Project button
  let createBtn = page.getByRole("button", { name: /create project/i });
  let found = await createBtn.isVisible().catch(() => false);
  
  if (!found) {
    createBtn = page.locator('button:has-text("Create Project")');
    found = await createBtn.isVisible().catch(() => false);
  }
  
  if (!found) {
    createBtn = page.locator('button').filter({ hasText: /Create\s+Project/i });
  }
  
  await expect(createBtn).toBeVisible({ timeout: 10000 });
  await createBtn.click();
  await page.waitForTimeout(1000);

  // Try multiple selectors for project name input
  let nameInput = page.getByPlaceholder(/Enter component name/i);
  let inputFound = await nameInput.isVisible().catch(() => false);
  
  if (!inputFound) {
    nameInput = page.getByPlaceholder(/project name/i);
    inputFound = await nameInput.isVisible().catch(() => false);
  }
  
  if (!inputFound) {
    nameInput = page.locator('input[placeholder*="name" i], input[placeholder*="Name" i]').first();
  }
  
  await expect(nameInput).toBeVisible({ timeout: 10000 });
  await nameInput.fill(projectName);

  // Try multiple selectors for description field
  let descField = page.getByPlaceholder(/Enter project description/i);
  let descCount = await descField.count().catch(() => 0);
  
  if (!descCount) {
    descField = page.locator('textarea[placeholder*="description" i], input[placeholder*="description" i]').first();
    descCount = await descField.count().catch(() => 0);
  }
  
  if (descCount) {
    await expect(descField).toBeVisible({ timeout: 5000 });
    await descField.fill(`Project created by Playwright: ${projectName}`);
  }

  if (tag) {
    let tagInput = page.getByPlaceholder(/Add a tag/);
    let tagFound = await tagInput.isVisible().catch(() => false);
    
    if (!tagFound) {
      tagInput = page.locator('input[placeholder*="tag" i], input[placeholder*="Tag" i]').first();
    }
    
    await expect(tagInput).toBeVisible({ timeout: 5000 });
    await tagInput.fill(tag);

    let addBtn = page.getByRole("button", { name: /Add/i });
    let btnFound = await addBtn.isVisible().catch(() => false);
    
    if (!btnFound) {
      addBtn = page.locator('button').filter({ hasText: /^Add$/i });
    }
    
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
  }

  // Try multiple selectors for Save button
  let saveBtn = page.getByRole("button", { name: /Save/i });
  let saveBtnFound = await saveBtn.isVisible().catch(() => false);
  
  if (!saveBtnFound) {
    saveBtn = page.locator('button').filter({ hasText: /^Save$/i }).first();
  }
  
  await expect(saveBtn).toBeEnabled({ timeout: 10000 });
  await saveBtn.click();

  await page.waitForTimeout(2000);

  let projectId = null;

  const extractProjectIdFromUrl = (url) => {
    try {
      const maybeId = new URL(url).pathname.split('/').filter(Boolean).pop();
      return maybeId && maybeId !== "dashboard" ? maybeId : null;
    } catch (e) {
      return null;
    }
  };

  let currentUrl = page.url();
  projectId = extractProjectIdFromUrl(currentUrl);

  if (!projectId) {
    const projectCard = page.locator("article").filter({ hasText: projectName }).first();
    await expect(projectCard).toBeVisible({ timeout: 15000 });
    await projectCard.click();
    await page.waitForTimeout(2000);
    currentUrl = page.url();
    projectId = extractProjectIdFromUrl(currentUrl);
  }

  if (!projectId) {
    console.warn('Failed to parse project ID from URL:', currentUrl);
  }

  console.log(currentUrl);
  console.log(projectId);
  console.log(`Navigated to project: ${projectName} (ID: ${projectId})`);
  return projectId;

}

export async function updateProject(page, projectName, desc = null, tag = null) {
  await page
    .getByRole('article')
    .filter({ hasText: new RegExp(`^${projectName}`) })
    .getByLabel('Project options')
    .click();
  await page.getByRole('menuitem', { name: 'Edit Project' }).click();

  if (desc) {
    const descInput = page.getByPlaceholder(/Enter project description/i);
    await expect(descInput).toBeVisible({ timeout: 5000 });
    await descInput.fill(desc);
  }
  if (tag) {
    const tagInput = page.getByPlaceholder(/Add a tag/);
    await expect(tagInput).toBeVisible({ timeout: 5000 });
    await tagInput.fill(tag);

    const addBtn = page.getByRole("button", { name: /Add/i });
    await expect(addBtn).toBeVisible({ timeout: 5000 });
    await addBtn.click();
  }
  const updateBtn = page.getByRole("button", { name: /Update/i });
  await expect(updateBtn).toBeEnabled({ timeout: 10000 });
  await updateBtn.click();

  const projectCard = page.locator("article", { hasText: projectName }).first();
  await expect(projectCard).toBeVisible({ timeout: 15000 });
}

export async function deleteProject(page, projectName) {
  await page
    .getByRole('article')
    .filter({ hasText: new RegExp(`^${projectName}`) })
    .getByLabel('Project options')
    .click();
  await page.getByRole('menuitem', { name: 'Delete Project' }).click();

}

export async function menuItemClick(page) {
  await ensureDashboardReady(page);
  await page.locator('[aria-label="User profile menu"]').click();
  await page.waitForTimeout(2000);

}

export async function logout(page) {
  await page.getByRole('menuitem', { name: 'Log out' }).click();
}
export async function theamChange(page) {
   await page.getByRole('menuitem', { name: 'Themes' }).press('Enter')
  const themeItems = page.locator('div[role="menuitem"]');
  const selectedTheme = themeItems.filter({
    has: page.locator('span.text-primary')
  });
  const selectedThemeName = (await selectedTheme.locator('span').first().innerText()).trim();
  console.log(`Currently selected theme: ${selectedThemeName}`);
  const newTheme = themeItems.filter({
    hasNotText: selectedThemeName
  }).first();
  await newTheme.click();
}

export async function searchProject(page, projectName) {
  await ensureDashboardReady(page);

  // Try multiple selectors for search input
  let input = page.getByPlaceholder(/Search projects/i);
  let found = await input.isVisible().catch(() => false);
  
  if (!found) {
    input = page.locator('input[placeholder*="search" i], input[placeholder*="Search" i]').first();
    found = await input.isVisible().catch(() => false);
  }
  
  if (!found) {
    input = page.locator('input[type="text"]').first();
  }
  
  await expect(input).toBeVisible({ timeout: 10000 });
  await input.fill(projectName);
  await page.waitForTimeout(500);
  const result = page.locator(`text="${projectName}"`).first();
  //await expect(result).toBeVisible({ timeout: 10000 });
}

export async function selectFirstListedProject(page) {
  await ensureDashboardReady(page);
  await page.locator('article.h-\\[280px\\].flex').first().click();
  await page.waitForTimeout(2000);
}
export async function selectProject(page, projectName) {
  await searchProject(page, projectName);
  const projectLocator = page.locator(`text="${projectName}"`).first();
  await expect(projectLocator).toBeVisible({ timeout: 20000 });
  await projectLocator.click();

  // Ensure project page loaded by checking Dashboard button exists
  let dashboardBtn = page.locator("li.relative > button[aria-label='Dashboard']");
  let found = await dashboardBtn.isVisible().catch(() => false);
  
  if (!found) {
    dashboardBtn = page.locator('button').filter({ hasText: /Dashboard/i }).first();
    found = await dashboardBtn.isVisible().catch(() => false);
  }
  
  if (found) {
    await expect(dashboardBtn).toBeVisible({ timeout: 15000 });
  } else {
    console.warn('Dashboard button not found, continuing anyway');
    await page.waitForTimeout(1000);
  }

  const projectId = new URL(page.url()).pathname.split('/').pop();
  console.log(`Navigated to project: ${projectName} (ID: ${projectId})`);
  return projectId;
}
