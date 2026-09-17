import { expect } from '@playwright/test';
import { CreateProjectPage } from './createProjectFile.js';

export const DEFAULT_BASE_URL = process.env.TARGET_URL || 'https://ai.accionbreeze.com/';

const projectCard = (page, projectName) => page
  .locator('article, [data-testid*="project-card" i], div.bg-surface-card')
  .filter({ hasText: projectName })
  .first();

export async function createProject(page, projectName) {
  const createProjectPage = new CreateProjectPage(page);
  await createProjectPage.open();
  await createProjectPage.fillProjectName(projectName);
  await createProjectPage.save();
  await expect(page).toHaveURL(/dashboard|[?&]page=\d+/i, { timeout: 30000 });

  const projectId = page.url().match(/\/dashboard\/([^/?#]+)/i)?.[1];
  return projectId || projectName;
}

export async function selectProject(page, projectName) {
  const project = page.getByText(projectName, { exact: true }).first();
  await expect(project).toBeVisible({ timeout: 30000 });
  await project.locator('xpath=ancestor::article[1]').locator('div').first().click();
  await expect.poll(() => page.url(), { timeout: 30000 }).toMatch(/\/dashboard\/[^/?#]+/i);
  return page.url().match(/\/dashboard\/([^/?#]+)/i)?.[1] || null;
}

export async function selectFirstListedProject(page) {
  const project = page.locator('article').first();
  await expect(project).toBeVisible({ timeout: 30000 });
  await project.locator(':scope > div').first().click({ force: true });
  await expect.poll(() => page.url(), { timeout: 30000 }).toMatch(/\/dashboard\/[^/?#]+/i);
  return page.url().match(/\/dashboard\/([^/?#]+)/i)?.[1] || null;
}

export async function searchProject(page, projectName) {
  const searchInput = page.getByPlaceholder(/search projects/i).first();
  if (await searchInput.isVisible().catch(() => false)) await searchInput.fill(projectName);
  let attempts = 0;
  await expect.poll(async () => {
    const visible = await projectCard(page, projectName).isVisible().catch(() => false) ||
      await page.getByText(projectName, { exact: true }).first().isVisible().catch(() => false);
    attempts += 1;
    if (!visible && attempts % 3 === 0) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const refreshedSearch = page.getByPlaceholder(/search projects/i).first();
      if (await refreshedSearch.isVisible().catch(() => false)) await refreshedSearch.fill(projectName);
    }
    return visible;
  }, { timeout: 120000, intervals: [1000, 2000, 5000] }).toBe(true);
}

export async function deleteProject(page, projectName) {
  const { ProjectPage } = await import('./projectPage.js');
  await new ProjectPage(page).deleteProjectFromDashboard(projectName);
}

export async function updateProject(page, projectName, updates = {}) {
  return new DashboardPage(page).updateProject(projectName, updates);
}

export async function login(page, username = process.env.USERNAME, password = process.env.PASSWORD) {
  const { LoginPage } = await import('./loginPage.js');
  const loginPage = new LoginPage(page);
  await loginPage.navigateToLogin();
  if (username && password) await loginPage.login(username, password);
  await loginPage.waitForAppReady();
}

export async function logout(page) {
  const logoutButton = page.getByRole('button', { name: /log ?out|sign ?out/i }).first();
  await expect(logoutButton).toBeVisible({ timeout: 30000 });
  await logoutButton.click();
}

export async function openThemePreferences(page) {
  const namedMenu = page.getByRole('button', { name: /menu/i }).first();
  const menu = (await namedMenu.isVisible().catch(() => false))
    ? namedMenu
    : page.locator('nav button').first();
  if (await menu.isVisible().catch(() => false)) await menu.click();
  const themeButton = page.getByRole('button', { name: /theme|appearance|preferences/i }).first();
  await expect(themeButton).toBeVisible({ timeout: 30000 });
  await themeButton.click();
}

export async function getSelectedThemeName(page) {
  const selected = page.locator('[aria-selected="true"], [data-state="active"], input:checked').first();
  await expect(selected).toBeVisible({ timeout: 30000 });
  return (await selected.getAttribute('aria-label')) || (await selected.getAttribute('value')) || (await selected.innerText());
}

export async function selectThemeByName(page, themeName) {
  const theme = page.getByRole('button', { name: new RegExp(themeName, 'i') }).first();
  await expect(theme).toBeVisible({ timeout: 30000 });
  await theme.click();
}

export async function changeToDifferentTheme(page) {
  const original = await getSelectedThemeName(page);
  const options = page.getByRole('button').filter({ hasText: /.+/ });
  for (let index = 0; index < await options.count(); index += 1) {
    const option = options.nth(index);
    const name = (await option.innerText().catch(() => '')).trim();
    if (name && name !== original && /theme|dark|light/i.test(name)) {
      await option.click();
      return { original, changed: name };
    }
  }
  throw new Error(`No alternate theme option found for ${original}`);
}

export async function menuItemClick(page) {
  const menu = page.getByRole('button', { name: /menu/i }).first();
  if (await menu.isVisible().catch(() => false)) {
    await menu.click();
  }
}

export async function theamChange(page) {
  const themeControl = page.getByRole('button', { name: /theme|dark mode|light mode/i }).first();
  if (await themeControl.isVisible().catch(() => false)) {
    await themeControl.click();
  }
}

export class DashboardPage {
  constructor(page) {
    this.page = page;
  }

  getProjectNameLocator() {
    return this.page.locator('h1, h2, [data-testid*="project"], [aria-label*="project"], [class*="project-title"]').filter({ hasText: /.+/ }).first();
  }

  getFavouriteButton() {
    return this.page.locator('button[aria-label*="favourite" i], button[aria-label*="favorite" i], button[title*="favourite" i], button[title*="favorite" i], [data-testid*="favorite" i], [data-testid*="favourite" i]').first();
  }

  async createProjectWithTag(projectName, tag) {
    const createProjectButton = this.page.getByRole('button', { name: /create project/i }).first();
    await expect(createProjectButton).toBeVisible({ timeout: 30000 });
    await createProjectButton.click();

    const nameInput = this.page.getByPlaceholder(/enter component name|project name/i).first();
    await expect(nameInput).toBeVisible({ timeout: 30000 });
    await nameInput.fill(projectName);

    const descriptionField = this.page.getByPlaceholder(/enter project description/i).first();
    if (await descriptionField.isVisible().catch(() => false)) {
      await descriptionField.fill(`Project created by Playwright: ${projectName}`);
    }

    const tagInput = this.page.getByPlaceholder(/add a tag/i).first();
    if (await tagInput.isVisible().catch(() => false)) {
      await tagInput.fill(String(tag ?? '').slice(0, 50));
      const addTagButton = this.page.getByRole('button', { name: /^add$/i }).first();
      if (await addTagButton.isVisible().catch(() => false)) {
        await addTagButton.click();
      }
    }

    const saveButton = this.page.getByRole('button', { name: /^save$/i }).first();
    await expect(saveButton).toBeEnabled({ timeout: 30000 });
    await saveButton.scrollIntoViewIfNeeded();
    const createResponse = this.page.waitForResponse((response) => {
      return response.request().method() === 'POST' && /projects/i.test(response.url());
    }, { timeout: 30000 }).catch(() => null);
    await saveButton.click({ force: true, timeout: 15000 });

    let projectId = null;
    const response = await createResponse;
    if (response) {
      const body = await response.json().catch(() => null);
      projectId = body?.uuid || body?.id || body?.data?.uuid || body?.data?.id || null;
      console.log(`[createProjectWithTag] created name="${projectName}" id="${projectId || 'unavailable'}" status=${response.status()}`);
    }

    await expect(this.page).toHaveURL(/dashboard|[?&]page=\d+/i, { timeout: 30000 });
    return { projectId, projectName };
  }

  async updateProject(projectName, updates = {}) {
    const options = typeof updates === 'string' ? { name: updates } : updates;
    const card = projectCard(this.page, projectName);
    await expect(card).toBeVisible({ timeout: 30000 });

    const menuButton = card.locator(
      'button[aria-label*="project options" i], button[aria-label*="more" i], [data-testid*="menu" i], button[title*="options" i]'
    ).first();
    await expect(menuButton).toBeVisible({ timeout: 30000 });
    await menuButton.click();

    const editAction = this.page
      .getByRole('menuitem', { name: /edit|update/i })
      .or(this.page.getByRole('button', { name: /edit|update/i }))
      .last();
    await expect(editAction).toBeVisible({ timeout: 30000 });
    await editAction.click();

    const nameInput = this.page.getByPlaceholder(/enter component name|project name/i).first();
    if (options.name !== undefined) {
      await expect(nameInput).toBeVisible({ timeout: 30000 });
      await nameInput.fill(options.name);
    }

    const descriptionInput = this.page.getByPlaceholder(/enter project description/i).first();
    if (options.description !== undefined && await descriptionInput.isVisible().catch(() => false)) {
      await descriptionInput.fill(options.description);
    }

    const saveButton = this.page.getByRole('button', { name: /^(save|update)$/i }).first();
    await expect(saveButton).toBeEnabled({ timeout: 30000 });
    await saveButton.click();

    const updatedName = options.name || projectName;
    await expect(this.page.getByText(updatedName, { exact: true }).first()).toBeVisible({ timeout: 60000 });
    return updatedName;
  }

  async getProjectName() {
    const projectNameLocator = this.getProjectNameLocator();
    await expect(projectNameLocator).toBeVisible({ timeout: 30000 });
    return projectNameLocator.innerText();
  }

  async clickFavouriteStar() {
    const favouriteButton = this.getFavouriteButton();
    await expect(favouriteButton).toBeVisible({ timeout: 30000 });
    await favouriteButton.click();
  }

  async isProjectFavourited() {
    const favouriteButton = this.getFavouriteButton();
    await expect(favouriteButton).toBeVisible({ timeout: 30000 });
    const ariaPressed = await favouriteButton.getAttribute('aria-pressed');
    if (ariaPressed !== null) {
      return ariaPressed === 'true';
    }

    const activeState = await favouriteButton.getAttribute('data-active');
    if (activeState !== null) {
      return activeState === 'true';
    }

    const className = await favouriteButton.getAttribute('class');
    return className ? className.includes('active') || className.includes('filled') || className.includes('selected') : false;
  }

  async favouriteProject() {
    if (!(await this.isProjectFavourited())) {
      await this.clickFavouriteStar();
    }
  }

  async unfavouriteProject() {
    if (await this.isProjectFavourited()) {
      await this.clickFavouriteStar();
    }
  }

  async goToProjects() {
    const projectLink = this.page.getByRole('link', { name: /projects/i }).first();
    if (await projectLink.isVisible().catch(() => false)) {
      await projectLink.click();
      return;
    }

    const projectButton = this.page.getByRole('button', { name: /projects/i }).first();
    await expect(projectButton).toBeVisible({ timeout: 30000 });
    await projectButton.click();
  }
}
