import { expect } from "@playwright/test";

export class CreateProjectPage {
  constructor(page) {
    this.page = page;
    this.createProjectButton = page.getByRole("button", { name: /create project/i });
    this.projectNameInput = page.getByPlaceholder(/enter component name/i);
    this.descriptionInput = page.getByPlaceholder(/enter project description/i);
    this.tagInput = page.getByPlaceholder(/add a tag/i);
    this.addTagButton = page.getByRole("button", { name: /^add$/i });
    this.saveButton = page.getByRole("button", { name: /^save$/i });
    this.cancelButton = page.getByRole("button", { name: /^(cancel|close|back)$/i });
    this.tagValidationMessage = page.getByText("Tag name must not exceed 50 characters", { exact: true }).first();
  }

  async open() {
    await expect(this.createProjectButton).toBeVisible();
    await this.createProjectButton.click();
    await expect(this.projectNameInput).toBeVisible();
  }

  async fillProjectName(name) {
    await this.projectNameInput.fill(name);
  }

  async fillDescription(description) {
    await expect(this.descriptionInput).toBeVisible();
    await this.descriptionInput.fill(description);
  }

  async addTag(tag) {
    await expect(this.tagInput).toBeVisible();
    await this.tagInput.fill(tag);
    await expect(this.addTagButton).toBeVisible();
    await this.addTagButton.click();
  }

  getTagChip(tag) {
    return this.page.getByText(tag, { exact: true });
  }

  async save() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.click({ force: true });
  }

  async cancelOrClose() {
    const visibleCancel = this.cancelButton.first();
    await expect(visibleCancel).toBeVisible();
    await visibleCancel.click({ force: true });
  }

  async formIsVisible() {
    return this.projectNameInput.isVisible();
  }

  async visibleValidationMessage() {
    const message = this.page.locator('[role="alert"], [aria-live="assertive"], p, span').filter({
      hasText: /required|invalid|already exists|duplicate|must|error/i,
    }).first();
    return message.isVisible().catch(() => false) ? message.innerText() : "";
  }

  async projectDestination(name) {
    const projectCard = this.page
      .locator('article, [data-testid*="project-card"], div.bg-surface-card')
      .filter({ hasText: name })
      .first();

    const projectName = projectCard.getByText(name, { exact: true }).first();
    return (await projectCard.isVisible().catch(() => false)) &&
      (await projectName.isVisible().catch(() => false))
      ? projectCard
      : null;
  }
}
