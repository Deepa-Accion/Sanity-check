import { expect } from "@playwright/test";

// Page Object for BreezeAI Dashboard
// Encapsulates actions like creating a project

// Base URL is env-driven so localhost runs (TARGET_URL) hit the local app;
// falls back to the dev URL for the standard dev/prod runs.
export const DEFAULT_BASE_URL = process.env.TARGET_URL || "https://ai.accionbreeze.com/";

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

// ---------------------------------------------------------------------------
// Theme preference helpers
// Used by the theme-persistence regression suite to change / revert / read the
// active theme and to drive the logout -> re-login lifecycle. They reuse the
// same selectors as `theamChange` (the currently-selected theme is marked with
// `span.text-primary`) so behaviour stays consistent with the sanity check.
// ---------------------------------------------------------------------------

/**
 * Open the user profile menu and expand the Themes submenu so the theme
 * options (and the currently-selected marker) are visible.
 * @param {import('@playwright/test').Page} page
 */
export async function openThemePreferences(page) {
  await menuItemClick(page);
  const themesMenuItem = page.getByRole('menuitem', { name: /themes/i });
  await expect(themesMenuItem).toBeVisible({ timeout: 10000 });
  await themesMenuItem.press('Enter');
  await page.waitForTimeout(500);
}

/**
 * Read the name of the currently-applied theme. Assumes the Themes submenu is
 * already open (call {@link openThemePreferences} first). The selected theme is
 * the only menu item containing a `span.text-primary` marker.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<string>}
 */
export async function getSelectedThemeName(page) {
  const selectedTheme = page
    .locator('div[role="menuitem"]')
    .filter({ has: page.locator('span.text-primary') });
  await expect(selectedTheme.first()).toBeVisible({ timeout: 10000 });
  return (await selectedTheme.locator('span').first().innerText()).trim();
}

/**
 * Change the active theme to a different one. Assumes the Themes submenu is
 * open. Returns the previously-selected theme and the newly-selected theme.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{ original: string, changed: string }>}
 */
export async function changeToDifferentTheme(page) {
  const themeItems = page.locator('div[role="menuitem"]');
  const original = await getSelectedThemeName(page);

  const newTheme = themeItems.filter({ hasNotText: original }).first();
  await expect(newTheme).toBeVisible({ timeout: 10000 });
  const changed = (await newTheme.locator('span').first().innerText()).trim();
  await newTheme.click();
  await page.waitForTimeout(1000);

  return { original, changed };
}

/**
 * Select a specific theme by its visible name. Assumes the Themes submenu is
 * open. Used to revert to the original theme.
 * @param {import('@playwright/test').Page} page
 * @param {string} themeName
 */
export async function selectThemeByName(page, themeName) {
  const target = page
    .locator('div[role="menuitem"]')
    .filter({ hasText: themeName })
    .first();
  await expect(target).toBeVisible({ timeout: 10000 });
  await target.click();
  await page.waitForTimeout(1000);
}

/**
 * Log out of the application. Opens the user profile menu (closing any open
 * submenu first) and clicks Log out, then waits for the session to end.
 * @param {import('@playwright/test').Page} page
 */
export async function logout(page) {
  // Dismiss any open theme submenu/overlay before re-opening the profile menu.
  await page.keyboard.press('Escape').catch(() => {});
  await menuItemClick(page);
  const logoutItem = page.getByRole('menuitem', { name: /log\s*out/i });
  await expect(logoutItem).toBeVisible({ timeout: 10000 });
  await logoutItem.click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2000);
}

/**
 * Log back in to the application. The OIDC session is re-injected into
 * sessionStorage on every navigation by the auth fixture, so navigating to the
 * dashboard re-establishes the authenticated session. Handles the "Sign in with
 * Accion Labs" landing button if it is shown.
 * @param {import('@playwright/test').Page} page
 * @param {string} [baseUrl]
 */
export async function login(page, baseUrl = DEFAULT_BASE_URL) {
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await ensureDashboardReady(page);
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
