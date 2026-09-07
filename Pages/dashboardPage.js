import { expect } from '@playwright/test';

export const DEFAULT_BASE_URL = process.env.TARGET_URL || 'https://ai.accionbreeze.com/';

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
      await tagInput.fill(tag);
      const addTagButton = this.page.getByRole('button', { name: /^add$/i }).first();
      if (await addTagButton.isVisible().catch(() => false)) {
        await addTagButton.click();
      }
    }

    const saveButton = this.page.getByRole('button', { name: /^save$/i }).first();
    await expect(saveButton).toBeEnabled({ timeout: 30000 });
    await saveButton.scrollIntoViewIfNeeded();
    await saveButton.dispatchEvent('click');

    await expect(this.page).toHaveURL(/dashboard/i, { timeout: 30000 });
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
