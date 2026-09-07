import { expect } from "@playwright/test";

export class ProjectPage {
  constructor(page) {
    this.page = page;

    // ============================================================
    // Project Card / Dashboard Locators
    // ============================================================

    // Project creation
    this.createProjectButton = page.getByRole("button", {
      name: /create project/i,
    });

    // Project creation form
    this.projectNameInput = page.getByPlaceholder(
      /enter component name/i
    );

    this.descriptionInput = page.getByPlaceholder(
      /enter project description/i
    );

    this.tagInput = page.getByPlaceholder(/add a tag/i);

    this.addTagButton = page.getByRole("button", {
      name: /^add$/i,
    });

    this.saveButton = page.getByRole("button", {
      name: /^save$/i,
    });

    this.cancelButton = page.getByRole("button", {
      name: /^(cancel|close|back)$/i,
    });
  }

  // ============================================================
  // Create Project
  // ============================================================

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
    const message = this.page
      .locator(
        '[role="alert"], [aria-live="assertive"], p, span'
      )
      .filter({
        hasText:
          /required|invalid|already exists|duplicate|must|error/i,
      })
      .first();

    return (await message.isVisible().catch(() => false))
      ? message.innerText()
      : "";
  }

  async projectDestination(name) {
    const projectCard = this.page
      .locator("article")
      .filter({ hasText: name })
      .first();

    if (await projectCard.isVisible().catch(() => false)) {
      return projectCard;
    }

    const destination = this.page
      .getByText(name, { exact: true })
      .first();

    return (await destination
      .isVisible()
      .catch(() => false))
      ? destination
      : null;
  }

  // ============================================================
  // Project Card
  // ============================================================

  getProjectCard(projectName) {
    return this.page
      .locator(
        'article, [data-testid*="project-card"], li, div'
      )
      .filter({
        hasText: projectName,
      })
      .first();
  }

  // ============================================================
  // Favourite / Unfavourite
  // ============================================================

  getProjectStar(projectName) {
    const card = this.getProjectCard(projectName);

    return card
      .locator(
        'button[aria-label*="favourite" i], ' +
          'button[aria-label*="favorite" i], ' +
          'button[title*="favourite" i], ' +
          'button[title*="favorite" i], ' +
          '[data-testid*="favorite" i], ' +
          '[data-testid*="favourite" i]'
      )
      .first();
  }

  async selectMyProjects() {
    const myProjectsTab = this.page
      .getByRole("tab", {
        name: /my projects/i,
      })
      .first();

    if (
      await myProjectsTab
        .isVisible()
        .catch(() => false)
    ) {
      await myProjectsTab.click();
      return;
    }

    const myProjectsButton = this.page
      .getByRole("button", {
        name: /my projects/i,
      })
      .first();

    if (
      await myProjectsButton
        .isVisible()
        .catch(() => false)
    ) {
      await myProjectsButton.click();
    }
  }

  async selectFavourites() {
    const favouritesTab = this.page
      .getByRole("tab", {
        name: /favourites/i,
      })
      .first();

    if (
      await favouritesTab
        .isVisible()
        .catch(() => false)
    ) {
      await favouritesTab.click();
      return;
    }

    const favouritesButton = this.page
      .getByRole("button", {
        name: /favourites/i,
      })
      .first();

    if (
      await favouritesButton
        .isVisible()
        .catch(() => false)
    ) {
      await favouritesButton.click();
    }
  }

  async isProjectFavourite(projectName) {
    const star = this.getProjectStar(projectName);

    await expect(star).toBeVisible({
      timeout: 30000,
    });

    const ariaPressed =
      await star.getAttribute("aria-pressed");

    if (ariaPressed !== null) {
      return ariaPressed === "true";
    }

    const dataActive =
      await star.getAttribute("data-active");

    if (dataActive !== null) {
      return dataActive === "true";
    }

    const className =
      await star.getAttribute("class");

    return className
      ? className.includes("active") ||
          className.includes("filled") ||
          className.includes("selected")
      : false;
  }

  async favouriteProject(projectName) {
    const star = this.getProjectStar(projectName);

    if (
      !(await this.isProjectFavourite(projectName))
    ) {
      await star.click();
    }
  }

  async unfavouriteProject(projectName) {
    const star = this.getProjectStar(projectName);

    if (
      await this.isProjectFavourite(projectName)
    ) {
      await star.click();
    }
  }

  // ============================================================
  // Project Visibility
  // ============================================================

  async isProjectVisible(projectName) {
    const card = this.getProjectCard(projectName);

    return await card
      .isVisible()
      .catch(() => false);
  }

  // ============================================================
  // Project Menu
  // ============================================================

  async openProjectMenu(projectName) {
    const card = this.getProjectCard(projectName);

    await expect(card).toBeVisible({
      timeout: 30000,
    });

    const menuButton = card
      .locator(
        'button[aria-label*="project options" i], ' +
          'button[aria-label*="more" i], ' +
          '[data-testid*="menu" i], ' +
          'button[title*="options" i]'
      )
      .first();

    await expect(menuButton).toBeVisible({
      timeout: 30000,
    });

    await menuButton.click();
  }

  // ============================================================
  // Project Delete
  // ============================================================

  async deleteProject(projectName) {
    await this.openProjectMenu(projectName);

    const deleteButton = this.page
      .getByRole("menuitem", {
        name: /delete project/i,
      })
      .first();

    await expect(deleteButton).toBeVisible({
      timeout: 30000,
    });

    await deleteButton.click();

    const confirmButton = this.page
      .getByRole("button", {
        name: /confirm|delete/i,
      })
      .first();

    if (
      await confirmButton
        .isVisible()
        .catch(() => false)
    ) {
      await confirmButton.click();
    }
  }
}