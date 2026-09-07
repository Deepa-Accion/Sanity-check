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

  async save() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await this.saveButton.dispatchEvent("click");
  }

  async cancelOrClose() {
    const visibleCancel = this.cancelButton.first();
    await expect(visibleCancel).toBeVisible();
    await visibleCancel.click();
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
    const projectCard = this.page.locator("article").filter({ hasText: name }).first();
    if (await projectCard.isVisible().catch(() => false)) {
      return projectCard;
    }

    const destination = this.page.getByText(name, { exact: true }).first();
    return destination.isVisible().catch(() => false) ? destination : null;
  }
}
