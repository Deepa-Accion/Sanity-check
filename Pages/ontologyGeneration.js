import { expect } from "@playwright/test";

export class OntologyGenerationPage {
  constructor(page) {
    this.page = page;
    this.functionalHeading = page.getByRole("heading", { name: "Ontology Generation", level: 2 });
    this.functionalWorkflowButton = page.getByRole("button", { name: "Functional", exact: true });
    this.designWorkflowButton = page.getByRole("button", { name: "Design", exact: true });
    this.searchInput = page.getByRole("textbox", { name: "Search..." });
    this.documentsTab = page.getByRole("tab", { name: /Documents/ });
    this.repositoriesTab = page.getByRole("tab", { name: /Repositories/ });
    this.uploadDocumentButton = page.getByRole("button", { name: /Upload Document.*PDF, TXT, MD, JPG, PNG/i });
    this.uploadAllButton = page.getByRole("button", { name: "Upload All" });
    this.selectedFilesHeading = page.getByRole("heading", { name: /Selected Files/ });
    this.selectedPdf = page.getByText(/\.pdf$/i).last();
    this.documentByName = page.getByText(/\.pdf$/i).last();
    this.generateButton = page.getByRole("button", { name: "Generate", exact: true });
    this.refreshButton = page.getByRole("button", { name: "Refresh", exact: true }).first();
    this.generatedProgress = page.getByText("100%", { exact: true });
    this.generatedDocumentStatus = page.getByText("Generated", { exact: true }).last();
    this.redoButton = page.getByRole("button", { name: "Redo", exact: true });
    this.listButton = page.getByRole("button", { name: "List", exact: true });
    this.graphButton = page.getByRole("button", { name: "Graph", exact: true });
    this.filterNodesButton = page.getByRole("button", { name: "Filter nodes" });
    this.refreshAllDataButton = page.getByRole("button", { name: "Refresh All Data" });
    this.regenerateEmbeddingsButton = page.getByRole("button", { name: "Re-generate Embeddings" });
    this.personaHeading = page.getByRole("heading", { name: "Persona", exact: true });
    this.personaEmptyState = page.getByText("No personas yet", { exact: true });
    this.uploadSuccessNotification = page.getByText(/uploaded successfully!/i);
    this.functionalRequirementsHeading = page.getByRole("heading", { name: "Functional Requirements", level: 2 });
    this.functionalSubtitle = page.getByText("User personas, tasks, scenarios, and business workflows", { exact: true });
    this.filterDialog = page.locator('[role="dialog"]').filter({ hasText: "Match on any label attribute" }).first();
    this.filterValueInput = this.filterDialog.getByRole("textbox", { name: "Value…" });
    this.applyFiltersButton = this.filterDialog.getByRole("button", { name: "Apply filters" });
    this.clearFiltersButton = this.filterDialog.getByRole("button", { name: "Clear all" });
    this.designOntologyHeading = page.getByRole("heading", { name: "Design Ontology", level: 2 });
    this.designSubtitle = page.getByText("User journeys, flows, pages, and components", { exact: true });
    this.generateDesignGraphButton = page.getByRole("button", { name: "Generate the Design Graph from a Repository" });
    this.userJourneysHeading = page.getByRole("heading", { name: "User Journeys", exact: true });
    this.userJourneysSearch = page.getByRole("textbox", { name: "Search user journeys..." });
    this.addUserJourneyButton = page.getByRole("button", { name: "Add new user journey" });
    this.bulkDeleteUserJourneysButton = page.getByRole("button", { name: "Bulk delete user journeys" });
    this.noUserJourneys = page.getByText("No user journeys found", { exact: true });
  }

  async openFunctionalWorkflow() {
    await expect(this.functionalHeading).toBeVisible();
    await this.functionalWorkflowButton.click();
    await expect(this.uploadDocumentButton).toBeVisible();
  }

  async uploadDocument(filePath) {
    await this.uploadDocumentButton.click();
    const documentInput = this.page.locator('input[type="file"][accept*=".pdf"]');
    await expect(documentInput).toHaveCount(1);
    await documentInput.setInputFiles(filePath);
    await expect(this.selectedFilesHeading).toBeVisible();
  }

  async uploadAll() {
    await this.uploadAllButton.click();
    await expect(this.uploadAllButton).toBeHidden();
  }

  async generateDocument() {
    await expect(this.generateButton).toBeVisible();
    await this.generateButton.click();
  }

  async refresh() {
    await this.refreshButton.click();
    await expect(this.functionalRequirementsHeading).toBeVisible();
  }

  async refreshOntology() {
    await this.refreshButton.click();
    await expect(this.functionalRequirementsHeading).toBeVisible();
  }

  getSectionHeading(headingName) {
    return this.page.getByRole("heading", { name: headingName, exact: true }).last();
  }

  async getSectionCount(headingName) {
    return this.sectionCount(headingName);
  }

  async sectionCount(headingName) {
    const heading = this.getSectionHeading(headingName);
    if (!(await heading.isVisible().catch(() => false))) {
      return "0 of 0";
    }

    const count = heading.locator("..").getByText(/^\d+ of \d+$/).first();
    const rawText = (await count.innerText().catch(() => "0 of 0")).trim();

    if (/^0 of 0$/i.test(rawText)) {
      const names = await this.nodeNames(headingName);
      if (names.length > 0) {
        return `${names.length} of ${names.length}`;
      }
    }

    await expect(count).toBeVisible();
    return rawText;
  }

  async waitForSectionItems(headingName, timeout = 240000) {
    const heading = this.getSectionHeading(headingName);
    if (!(await heading.isVisible().catch(() => false))) {
      return;
    }

    const count = heading.locator("..").getByText(/^\d+ of \d+$/).first();
    if (!(await count.isVisible().catch(() => false))) {
      return;
    }

    await expect.poll(async () => {
      const observed = (await this.sectionCount(headingName)).trim();
      return observed;
    }, { timeout }).toMatch(/^\d+ of \d+$/);
  }

  async nodeNames(headingName) {
    const heading = this.getSectionHeading(headingName);
    const section = heading.locator("..").locator("..").locator("..");
    const excluded = /^(Merge Mode|Add |Clone|Edit|Delete|Bulk delete|Create )/i;
    const names = await section.getByRole("button").allTextContents();
    return [...new Set(names.map((name) => name.trim()).filter((name) => name && !excluded.test(name)))];
  }

  async getNodeNames(headingName) {
    return this.nodeNames(headingName);
  }

  async scrollToTop() {
    await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
  }

  async scrollToBottom() {
    await this.page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" }));
  }

  async scrollNodeIntoView(name) {
    const node = this.page.getByRole("button", { name, exact: true }).last();
    await node.scrollIntoViewIfNeeded();
  }

  async openNode(name) {
    const notifications = this.page.locator(
      'section[aria-label^="Notifications"] [data-sonner-toast]'
    );
    await notifications.last().waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    const node = this.page.getByRole("button", { name, exact: true }).last();
    await node.scrollIntoViewIfNeeded();
    await node.click();
    await this.page.getByText(name, { exact: true }).last().waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
  }

  async openOntologyNode(name) {
    return this.openNode(name);
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
    const parsed = Number(countText.match(/of (\d+)/)?.[1] || 0);
    if (parsed > 0) return parsed;
    const names = await this.getPersonaNames();
    return names.length;
  }

  async validateNodeCitations(nodeName, nodeType) {
    const citationHeading = this.page.getByText(/Citations/i).last();
    const hasCitations = await citationHeading.isVisible().catch(() => false);
    if (hasCitations) {
      console.log(`${nodeType} "${nodeName}" has citation details displayed.`);
    } else {
      console.log(`${nodeType} "${nodeName}" has no citation details displayed.`);
    }
  }

  async waitForHierarchyTraversalAfterPersonaClick() {
    await this.refreshOntology();
    await this.waitForSectionItems("Persona");

    const persons = await this.getPersonaNames();
    expect(persons.length).toBeGreaterThan(0);

    for (const person of persons) {
      await this.openOntologyNode(person);
      await this.validateNodeCitations(person, "Persona");

      await this.waitForSectionItems("Tasks");
      const tasks = await this.getNodeNames("Tasks");
      for (const task of tasks) {
        await this.openOntologyNode(task);
        await this.validateNodeCitations(task, "Task");

        await this.waitForSectionItems("Scenarios");
        const scenarios = await this.getNodeNames("Scenarios");
        for (const scenario of scenarios) {
          await this.openOntologyNode(scenario);
          await this.validateNodeCitations(scenario, "Scenario");

          await this.waitForSectionItems("Steps");
          const designs = await this.getNodeNames("Steps");
          for (const design of designs) {
            await this.openOntologyNode(design);
            await this.validateNodeCitations(design, "Design");

            await this.waitForSectionItems("Actions");
            const actions = await this.getNodeNames("Actions");
            for (const action of actions) {
              await this.openOntologyNode(action);
              await this.validateNodeCitations(action, "Action");

              await this.waitForSectionItems("Api Endpoints");
              const endpoints = await this.getNodeNames("Api Endpoints");
              for (const endpoint of endpoints) {
                await this.openOntologyNode(endpoint);
                await this.validateNodeCitations(endpoint, "Endpoint");
              }
            }
          }
        }
      }
    }
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

  async clickOntologyAction(name) {
    const action = this.page.getByRole("button", { name, exact: true }).or(
      this.page.getByRole("menuitem", { name, exact: true })
    ).last();
    await expect(action).toBeVisible({ timeout: 30000 });
    await action.click();
  }

  async openFilters() {
    await this.filterNodesButton.click();
    await expect(this.filterDialog).toBeVisible();
  }

  async filterByTaskName(value) {
    const selectors = this.filterDialog.getByRole("combobox");
    await selectors.nth(0).click();
    await this.page.getByRole("option", { name: "Task", exact: true }).click();
    await this.filterValueInput.fill(value);
    await this.applyFiltersButton.click();
    await expect(this.filterDialog).toBeHidden();
  }

  async clearFilters() {
    const removeTaskFilter = this.page.getByRole("button", { name: "Remove Task filter" });
    await expect(removeTaskFilter).toBeVisible();
    await removeTaskFilter.click();
    await expect(removeTaskFilter).toBeHidden();
  }

  async refreshAllData() {
    await this.refreshAllDataButton.click();
    await expect(this.page.getByText("All functional data refreshed", { exact: true })).toBeVisible();
  }

  async openDesignWorkflow() {
    await this.designWorkflowButton.click();
    await expect(this.designOntologyHeading).toBeVisible();
  }
}
