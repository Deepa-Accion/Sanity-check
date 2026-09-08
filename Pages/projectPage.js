import { expect } from "@playwright/test";
import { CreateProjectPage } from "./createProjectFile.js";

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

    // Ontology / functional requirements / design locators
    this.ontologyGenerationButton = page.getByRole("button", { name: "Ontology Generation" });
    this.functionalWorkflowButton = page.getByRole("button", { name: "Functional", exact: true });
    this.graphButton = page.getByRole("button", { name: "Graph", exact: true });
    this.listButton = page.getByRole("button", { name: "List", exact: true });
    this.uploadDocumentButton = page.getByRole("button", { name: /Upload Document.*PDF, TXT, MD, JPG, PNG/i });
    this.uploadAllButton = page.getByRole("button", { name: "Upload All" });
    this.selectedFilesHeading = page.getByRole("heading", { name: /Selected Files/ });
    this.generateButton = page.getByRole("button", { name: "Generate", exact: true });
    this.redoButton = page.getByRole("button", { name: "Redo", exact: true });
    this.uploadSuccessNotification = page.getByText(/uploaded successfully!/i);
    this.functionalRequirementsHeading = page.getByRole("heading", { name: "Functional Requirements", level: 2 });
    this.functionalSubtitle = page.getByText("User personas, tasks, scenarios, and business workflows", { exact: true });
    this.refreshButton = page.getByRole("button", { name: "Refresh", exact: true }).first();
    this.refreshAllDataButton = page.getByRole("button", { name: "Refresh All Data" });
    this.filterNodesButton = page.getByRole("button", { name: "Filter nodes" });
    this.filterDialog = page.locator('[role="dialog"]').filter({ hasText: "Match on any label attribute" }).first();
    this.designWorkflowButton = page.getByRole("button", { name: "Design", exact: true });
    this.designOntologyHeading = page.getByRole("heading", { name: "Design Ontology", level: 2 });
    this.userJourneysHeading = page.getByRole("heading", { name: "User Journeys", exact: true });
    this.userJourneysSearch = page.getByRole("textbox", { name: "Search user journeys..." });
    this.addUserJourneyButton = page.getByRole("button", { name: "Add new user journey" });
    this.bulkDeleteUserJourneysButton = page.getByRole("button", { name: "Bulk delete user journeys" });
  }

  // ============================================================
  // Create Project
  // ============================================================

  async open() {
    await expect(this.createProjectButton).toBeVisible();

    await this.createProjectButton.click();

    await expect(this.projectNameInput).toBeVisible();
  }

  async openCreateProjectForm(baseUrl = process.env.TARGET_URL || "https://ai.accionbreeze.com/") {
    await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const createProjectPage = new CreateProjectPage(this.page);
    await createProjectPage.open();
    return createProjectPage;
  }

  async isCreateProjectButtonVisible() {
    return this.createProjectButton.isVisible().catch(() => false);
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
        'article, [data-testid*="project-card"], div.bg-surface-card'
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
      await myProjectsTab.dispatchEvent("click");
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
      await myProjectsButton.dispatchEvent("click");
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
      await favouritesTab.dispatchEvent("click");
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
      await favouritesButton.dispatchEvent("click");
    }
  }

  async isSectionSelected(sectionName) {
    const sectionButton = this.page.getByRole("button", { name: sectionName }).first();
    if (!(await sectionButton.isVisible().catch(() => false))) return false;
    return (
      (await sectionButton.getAttribute("aria-pressed")) === "true" ||
      (await sectionButton.getAttribute("aria-current")) === "page" ||
      (await sectionButton.getAttribute("data-state")) === "active" ||
      /active|selected|bg-primary/i.test((await sectionButton.getAttribute("class")) || "")
    );
  }

  async waitForSectionSelected(sectionName) {
    await expect.poll(() => this.isSectionSelected(sectionName)).toBe(true);
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

  async waitForProjectVisible(projectName, timeout = 90000) {
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expect(this.createProjectButton).toBeVisible({ timeout });
    let pollCount = 0;
    await expect.poll(async () => {
      pollCount += 1;
      const visible = await this.isProjectVisible(projectName);
      if (!visible && pollCount % 3 === 0) {
        await this.page.reload({ waitUntil: "domcontentloaded" });
      }
      return visible;
    }, { timeout, intervals: [1000, 2000, 5000] }).toBe(true);
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

  async isExportProjectMenuItemVisible() {
    const projectMenu = this.page.getByRole("menu", { name: /project options/i });
    return projectMenu.getByRole("menuitem", { name: /export project/i }).isVisible().catch(() => false);
  }

  // ============================================================
  // Project Delete
  // ============================================================

  async deleteProject(projectName) {
    const result = await this.page.evaluate(async (name) => {
      const authStorageKey =
        "oidc.user:https://login-new.accionbreeze.com/realms/accionlabswebsite:isometric";
      const authState = sessionStorage.getItem(authStorageKey);
      const accessToken = authState
        ? JSON.parse(authState).access_token
        : "";
      const apiUrl = "https://isometric-backend.accionbreeze.com";
      const listResponse = await fetch(
        `${apiUrl}/projects/accessible?sortOrder=desc&sortName=createdAt&page=1&limit=100`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const listBody = await listResponse.json();
      const project = (listBody.data || []).find(
        (item) => item.name === name
      );

      if (!project) {
        return { status: 404, message: `Project not found: ${name}` };
      }

      const deleteResponse = await fetch(
        `${apiUrl}/projects/${project.uuid}`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      return {
        status: deleteResponse.status,
        message: await deleteResponse.text(),
      };
    }, projectName);

    expect([200, 404], result.message).toContain(result.status);
  }

  async deleteProjectFromDashboard(projectName, baseUrl = process.env.TARGET_URL || "https://ai.accionbreeze.com/") {
    await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await this.deleteProject(projectName);
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await expect(this.getProjectCard(projectName)).toBeHidden({ timeout: 30000 });
  }

  // ============================================================
  // Ontology Generation / Functional Requirements
  // ============================================================

  async openOntologyGeneration() {
    await expect(this.ontologyGenerationButton).toBeVisible({ timeout: 30000 });
    await this.ontologyGenerationButton.dispatchEvent("click");
  }

  async isOntologyGenerationVisible() {
    return this.ontologyGenerationButton.isVisible().catch(() => false);
  }

  async openFunctionalRequirements() {
    await expect(this.functionalRequirementsHeading).toBeVisible({ timeout: 30000 });
    await this.functionalWorkflowButton.click();
    await expect(this.uploadDocumentButton).toBeVisible({ timeout: 30000 });
  }

  async isFunctionalRequirementsVisible() {
    return this.functionalRequirementsHeading.isVisible().catch(() => false);
  }

  async isFunctionalSubtitleVisible() {
    return this.functionalSubtitle.isVisible().catch(() => false);
  }

  async uploadFunctionalDocument(filePath) {
    await this.uploadDocumentButton.click();
    const documentInput = this.page.locator('input[type="file"][accept*=".pdf"]');
    await expect(documentInput).toHaveCount(1);
    await documentInput.setInputFiles(filePath);
    await expect(this.selectedFilesHeading).toBeVisible();
  }

  async uploadAllDocuments() {
    await this.uploadAllButton.click();
    await expect(this.uploadAllButton).toBeHidden();
    await expect(this.uploadSuccessNotification).toBeVisible({ timeout: 30000 });
    return true;
  }

  async isUploadedFileVisible(fileName) {
    return this.page.getByText(fileName, { exact: true }).last().isVisible().catch(() => false);
  }

  async refreshProjectList() {
    await this.page.reload({ waitUntil: "domcontentloaded" });
  }

  async generateFunctionalOntology() {
    await expect(this.generateButton).toBeVisible();
    await this.generateButton.click();
  }

  async isOntologyRedoVisible() {
    return this.redoButton.isVisible().catch(() => false);
  }

  async waitForGenerationComplete(timeout = 600000) {
    const progressButton = this.page.getByRole("button", { name: /processing|progressing|progress/i }).first();
    await expect(progressButton).toBeVisible({ timeout: 30000 });
    await progressButton.click();

    const progressSurface = this.page.getByRole("dialog").filter({ hasText: /Done|Generating|Queued|Failed/i }).first();
    await expect(progressSurface).toBeVisible({ timeout: 30000 });
    let latestStatuses;

    await expect.poll(async () => {
      const statuses = {};
      for (const label of ["Done", "Generating", "Queued", "Failed"]) {
        const status = progressSurface.getByText(label, { exact: true }).first();
        statuses[label] = Number((await status.locator("..").innerText()).match(/\d+/)?.[0] || 0);
      }
      latestStatuses = statuses;
      if (statuses.Failed > 0) return "failed";
      return statuses.Generating === 0 && statuses.Queued === 0 ? "complete" : "processing";
    }, { timeout, intervals: [1000, 2000, 5000] }).toBe("complete");

    expect(latestStatuses.Failed, `Ontology generation failed: ${JSON.stringify(latestStatuses)}`).toBe(0);
    expect(latestStatuses.Done).toBeGreaterThan(0);
    const closeButton = progressSurface.getByRole("button", { name: /close/i }).first();
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click();
    } else {
      await progressSurface.getByRole("button").last().click();
    }
    await expect(progressSurface).toBeHidden({ timeout: 30000 });
    await expect(this.functionalRequirementsHeading).toBeVisible({ timeout });
  }

  getSectionHeading(headingName) {
    const escapedName = headingName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.page.getByRole("heading", { name: new RegExp(`^${escapedName}$`, "i"), exact: true }).last();
  }

  async refreshOntology() {
    await this.refreshButton.click();
    await expect(this.functionalRequirementsHeading).toBeVisible();
  }

  async waitForSectionItems(headingName, timeout = 240000) {
    const count = this.getSectionHeading(headingName).locator("..").getByText(/^\d+ of \d+$/).first();
    await expect(count).toBeVisible();
    await expect.poll(() => count.innerText(), { timeout }).toMatch(/^\d+ of [1-9]\d*$/);
  }

  async getSectionCount(headingName) {
    const heading = this.getSectionHeading(headingName);
    const count = heading.locator("..").getByText(/^\d+ of \d+$/).first();
    if (!(await heading.isVisible().catch(() => false)) || !(await count.isVisible().catch(() => false))) return "0 of 0";
    return count.innerText();
  }

  async getNodeNames(headingName) {
    const heading = this.getSectionHeading(headingName);
    if (!(await heading.isVisible().catch(() => false))) return [];
    const section = heading.locator("..").locator("..").locator("..");
    const excluded = /^(Merge Mode|Add |Clone|Edit|Delete|Bulk delete|Create )/i;
    return [...new Set((await section.getByRole("button").allTextContents())
      .map((name) => name.trim()).filter((name) => name && !excluded.test(name)))];
  }

  async getVisibleNodeName(headingName) {
    const names = await this.getNodeNames(headingName);
    for (const name of names) {
      if (await this.page.getByRole("button", { name, exact: true }).isVisible().catch(() => false)) return name;
    }
    return null;
  }

  async getPersonaNames() {
    return this.getNodeNames("Persona");
  }

  async getPersonaCount() {
    const countText = await this.getSectionCount("Persona");
    return Number(countText.match(/of (\d+)/)?.[1] || 0);
  }

  async openOntologyNode(name) {
    const button = this.page.getByRole("button", { name, exact: true }).last();
    if (await button.isVisible().catch(() => false)) {
      await button.dispatchEvent("click");
      return;
    }
    const text = this.page.getByText(name, { exact: true }).last();
    await expect(text).toBeVisible({ timeout: 30000 });
    await text.dispatchEvent("click");
  }

  async clickOntologyAction(name) {
    const action = this.page.getByRole("button", { name, exact: true }).or(
      this.page.getByRole("menuitem", { name, exact: true })
    ).last();
    await expect(action).toBeVisible({ timeout: 30000 });
    await action.dispatchEvent("click");
  }

  getOntologyDialog() {
    return this.page.getByRole("dialog").filter({ has: this.page.getByRole("button") }).last();
  }

  async cloneAndDeletePersona(sourceName) {
    const beforeNames = await this.getNodeNames("Persona");
    await this.openOntologyNode(sourceName);
    await this.clickOntologyAction("Clone");
    const cloneDialog = this.getOntologyDialog();
    if (await cloneDialog.isVisible().catch(() => false)) {
      const nameInput = cloneDialog.getByRole("textbox", { name: /name/i }).first();
      if (await nameInput.isVisible().catch(() => false)) await nameInput.fill(`Morgan Clone ${Date.now()}`);
      await cloneDialog.getByRole("button", { name: /clone persona|clone/i }).last().click();
      await expect(cloneDialog).toBeHidden({ timeout: 30000 });
    }
    await this.refreshOntology();
    const afterNames = await this.getNodeNames("Persona");
    const clonedName = afterNames.find((name) => !beforeNames.includes(name));
    if (!clonedName) return null;
    await this.openOntologyNode(clonedName);
    await this.clickOntologyAction("Delete");
    const deleteHeading = this.page.getByText("Confirm Deletion", { exact: true }).last();
    await expect(deleteHeading).toBeVisible({ timeout: 30000 });
    await this.page.getByRole("button", { name: "Confirm", exact: true }).last().click();
    await expect(deleteHeading).toBeHidden({ timeout: 30000 });
    await this.refreshOntology();
    return clonedName;
  }

  async updatePersonaDescription(name, description) {
    await this.openOntologyNode(name);
    await this.clickOntologyAction("Edit");
    const dialog = this.getOntologyDialog();
    await dialog.getByRole("textbox", { name: /description/i }).fill(description);
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30000 });
  }

  async mergeFirstTwoPersonas(personaNames) {
    if (personaNames.length < 2) return false;
    await this.getSectionHeading("Persona").scrollIntoViewIfNeeded();
    await this.clickOntologyAction("Merge Mode");
    const checkboxes = this.page.getByRole("checkbox");
    if (await checkboxes.count() >= 2) {
      await checkboxes.nth(0).check({ force: true });
      await checkboxes.nth(1).check({ force: true });
    }
    const merge = this.page.getByRole("button", { name: /^(merge|merge items)$/i }).last();
    if (!(await merge.isVisible().catch(() => false))) return false;
    await merge.click({ force: true });
    return true;
  }

  async createPersona(name, description) {
    await this.clickOntologyAction("Add Persona");
    const dialog = this.getOntologyDialog();
    await dialog.locator("input").first().fill(name);
    await dialog.locator("textarea").first().fill(description);
    await dialog.getByRole("button", { name: /^create$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 30000 });
  }

  async cancelPersonaCreation(name, description) {
    await this.clickOntologyAction("Add Persona");
    const dialog = this.getOntologyDialog();
    await dialog.locator("input").first().fill(name);
    await dialog.locator("textarea").first().fill(description);
    await dialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 30000 });
  }

  async doubleClickGraphLevels(levels) {
    if (!(await this.graphButton.isVisible().catch(() => false))) return [];
    await this.graphButton.click({ force: true });
    const clicked = [];
    for (const level of levels) {
      const node = this.page.getByText(level, { exact: true }).last();
      if (await node.isVisible().catch(() => false)) {
        await node.dblclick({ force: true }).then(() => clicked.push(level)).catch(() => {});
      }
    }
    if (await this.listButton.isVisible().catch(() => false)) await this.listButton.dispatchEvent("click");
    return clicked;
  }

  async isGraphVisible() {
    return this.graphButton.isVisible().catch(() => false);
  }
}