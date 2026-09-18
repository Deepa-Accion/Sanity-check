import { expect } from '@playwright/test';
import { CreateProjectPage } from './createProjectFile.js';

export const DEFAULT_BASE_URL = process.env.TARGET_URL || 'https://ai.accionbreeze.com/';

export const projectCard = (page, projectName) => page
  .locator('article, [data-testid*="project-card" i], div.bg-surface-card')
  .filter({ hasText: projectName })
  .first();

export async function waitForProjectVisible(page, projectName, timeout = 60000) {
  await expect.poll(async () => {
    return await projectCard(page, projectName).isVisible().catch(() => false);
  }, { timeout, intervals: [500, 1000, 2000, 5000] }).toBe(true);
}

export async function waitForProjectHidden(page, projectName, timeout = 20000) {
  await expect.poll(async () => {
    return !(await projectCard(page, projectName).isVisible().catch(() => false));
  }, { timeout, intervals: [250, 500, 1000, 2000] }).toBe(true);
}

export async function clearProjectSearch(page) {
  const searchInput = page.getByRole('textbox', { name: /search projects/i }).first();
  await expect(searchInput).toBeVisible({ timeout: 20000 });
  await searchInput.fill('');
  await expect(searchInput).toHaveValue('');
}

export async function getProjectListSummary(page) {
  const summary = page.locator('text=/showing\\s+\\d+\\s+to\\s+\\d+\\s+of\\s+\\d+\\s+results/i').first();
  return (await summary.isVisible().catch(() => false)) ? await summary.innerText() : '';
}

export async function getProjectListSummaryDetails(page) {
  const text = await getProjectListSummary(page);
  const match = text.match(/showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)\s+results/i);
  return match
    ? { first: Number(match[1]), last: Number(match[2]), total: Number(match[3]), text }
    : { first: 0, last: 0, total: 0, text };
}

export async function getProjectAuthor(page, projectName) {
  const card = projectCard(page, projectName);
  await expect(card).toBeVisible({ timeout: 20000 });
  const lines = (await card.innerText())
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const authorIndex = lines.findIndex((line) => /^author$/i.test(line));
  const username = authorIndex >= 0 ? lines[authorIndex + 1] : '';

  if (!username) {
    throw new Error(`Could not read the Author from project card: ${projectName}`);
  }
  return username;
}

export async function openAuthorFilter(page) {
  const trigger = page.getByRole('button', { name: /author/i }).first();
  await expect(trigger).toBeVisible({ timeout: 20000 });
  await trigger.click();
  await expect(page.getByRole('menu').last()).toBeVisible({ timeout: 10000 });
}

export async function selectAuthorFilter(page, authorName) {
  const menu = page.getByRole('menu').last();
  await expect(menu).toBeVisible({ timeout: 10000 });
  const option = menu.getByRole('menuitemcheckbox', { name: authorName, exact: true })
    .or(menu.getByRole('option', { name: authorName, exact: true }))
    .or(menu.locator('label, button, [role="menuitem"], [role="menuitemcheckbox"], [role="option"]')
      .filter({ hasText: new RegExp(`^${authorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }))
    .last();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
}

export async function clearAuthorFilter(page) {
  const clearFilters = page.getByRole('button', { name: /clear filters/i }).first();
  if (await clearFilters.isVisible().catch(() => false)) {
    await clearFilters.click();
  } else {
    const trigger = page.getByRole('button', { name: /author/i }).first();
    await trigger.click();
    const selectedOption = page.getByRole('menuitemcheckbox', { checked: true }).first();
    await expect(selectedOption).toBeVisible({ timeout: 10000 });
    await selectedOption.click();
  }
  await expect(page.getByRole('button', { name: /^author$/i })).toBeVisible({ timeout: 10000 });
}

export async function getVisibleAuthorProjectCount(page, authorName) {
  const escapedAuthor = authorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('article').filter({ hasText: new RegExp(escapedAuthor, 'i') }).count();
}

export async function openTagsFilter(page, tagName) {
  const trigger = page.getByRole('button', { name: /tags/i }).first();
  await expect(trigger).toBeVisible({ timeout: 20000 });
  await trigger.click();

  const escapedTagName = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const option = page.locator('[role="menuitem"], [role="option"], button, [role="listbox"]').filter({ hasText: new RegExp(escapedTagName, 'i') }).first();
  await expect(option).toBeVisible({ timeout: 10000 });
  await option.click();
}

export async function projectCardMetadata(page, projectName) {
  const card = projectCard(page, projectName);
  await expect(card).toBeVisible({ timeout: 20000 });
  return {
    card,
    description: card.getByText(/no description added/i).first(),
    tags: card.getByText(/no tags added\.|no tags added/i).first(),
    author: card.getByText(/author/i).first(),
    created: card.getByText(/created\s+.*ago/i).first(),
  };
}

export async function createProject(page, projectName) {
  const createProjectPage = new CreateProjectPage(page);
  await createProjectPage.open();
  await createProjectPage.fillProjectName(projectName);
  await createProjectPage.save();
  await expect(page).toHaveURL(/dashboard|[?&]page=\d+/i, { timeout: 30000 });
  await waitForProjectVisible(page, projectName, 60000);

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
  await expect(searchInput).toBeVisible({ timeout: 20000 });
  await searchInput.fill(projectName);
  let attempts = 0;
  await expect.poll(async () => {
    const visible = await projectCard(page, projectName).isVisible().catch(() => false);
    attempts += 1;
    if (!visible && attempts % 6 === 0) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const refreshedSearch = page.getByPlaceholder(/search projects/i).first();
      await expect(refreshedSearch).toBeVisible({ timeout: 20000 });
      await refreshedSearch.fill(projectName);
    }
    return visible;
  }, { timeout: 120000, intervals: [1000, 2000, 5000] }).toBe(true);
}

export async function trySearchProject(page, projectName) {
  const searchInput = page.getByPlaceholder(/search projects/i).first();
  if (!(await searchInput.isVisible().catch(() => false))) {
    return false;
  }

  await searchInput.fill(projectName);
  return projectCard(page, projectName).isVisible({ timeout: 20000 }).catch(() => false);
}

export async function deleteProject(page, projectName) {
  const { ProjectPage } = await import('./projectPage.js');
  await new ProjectPage(page).deleteOrArchiveProject(projectName, { confirm: true });
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

    const nameInput = this.page.getByPlaceholder(/^enter component name$/i).first();
    await expect(nameInput).toBeVisible({ timeout: 30000 });
    await nameInput.fill(projectName);

    const descriptionField = this.page.getByPlaceholder(/^enter project description$/i).first();
    if (await descriptionField.isVisible().catch(() => false)) {
      await descriptionField.fill(`Project created by Playwright: ${projectName}`);
    }

    const tagInput = this.page.getByPlaceholder(/^add a tag$/i).first();
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

    const editAction = this.page.getByRole('menu').last()
      .getByRole('menuitem', { name: /edit|update/i }).first();
    await expect(editAction).toBeVisible({ timeout: 30000 });
    await editAction.click();

    const nameInput = this.page.getByPlaceholder(/^enter component name$/i).first();
    if (options.name !== undefined) {
      await expect(nameInput).toBeVisible({ timeout: 30000 });
      await nameInput.fill(options.name);
    }

    const descriptionInput = this.page.getByPlaceholder(/^enter project description$/i).first();
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

  projectCard(projectName) {
    return projectCard(this.page, projectName);
  }

  async openProjectTab(tabName) {
    const tab = this.page.getByRole('button', { name: tabName, exact: true }).first();
    await expect(tab).toBeVisible({ timeout: 20000 });
    await tab.scrollIntoViewIfNeeded();
    await tab.click({ force: true });
    const isActive = async () => /bg-primary|active|selected/i.test(await tab.getAttribute('class') || '');
    if (!(await isActive())) {
      await tab.evaluate((element) => element.click());
    }
    await expect.poll(isActive, { timeout: 10000 }).toBe(true);
  }

  async showProjectInCurrentList(projectName) {
    if (await trySearchProject(this.page, projectName)) {
      return;
    }

    const searchInput = this.page.getByPlaceholder(/search projects/i).first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('');
    }
    await expect(this.projectCard(projectName)).toBeVisible({ timeout: 20000 });
  }

  async clickProjectFavourite(projectName) {
    const card = this.projectCard(projectName);
    await expect(card).toBeVisible({ timeout: 20000 });
    const favouriteButton = card.locator(
      'button[aria-label*="favour" i], button[aria-label*="favorite" i], button[title*="favour" i], button[title*="favorite" i], button:has(svg[class*="star" i])'
    ).first();
    await expect(favouriteButton).toBeVisible({ timeout: 10000 });
    await favouriteButton.click();
  }

  async restoreProject(projectName, { confirm = true } = {}) {
    const card = this.projectCard(projectName);
    await expect(card).toBeVisible({ timeout: 20000 });
    const restoreButton = card.getByRole('button', { name: /restore/i }).first();
    await expect(restoreButton).toBeVisible({ timeout: 10000 });
    await restoreButton.click();

    const confirmation = card.getByText(/restore.*to active projects/i).first();
    await expect(confirmation).toBeVisible({ timeout: 10000 });
    await expect(confirmation).toContainText(projectName);

    if (!confirm) {
      await card.getByRole('button', { name: /cancel/i }).click();
      await expect(confirmation).not.toBeVisible({ timeout: 10000 });
      return false;
    }

    await card.getByRole('button', { name: /confirm/i }).click();
    await expect(card).not.toBeVisible({ timeout: 20000 });
    return true;
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
