import { expect } from "@playwright/test";

export class CreateProjectPage {
  constructor(page) {
    this.page = page;
    this.createProjectButton = page.getByRole("button", { name: /create project/i });
    this.dialog = page.getByRole("dialog", { name: /create new project/i }).last();
    this.projectNameInput = this.dialog.getByPlaceholder(/^enter component name$/i);
    this.descriptionInput = this.dialog.getByPlaceholder(/^enter project description$/i);
    this.tagInput = this.dialog.getByPlaceholder(/^add a tag$/i);
    this.addTagButton = this.dialog.getByRole("button", { name: /^add$/i });
    this.saveButton = this.dialog.getByRole("button", { name: /^save$/i });
    this.cancelButton = this.dialog.getByRole("button", { name: /^(cancel|close|back)$/i });
    this.tagValidationMessage = this.dialog.getByText("Tag name must not exceed 50 characters", { exact: true }).first();
  }

  async open() {
    await expect(this.createProjectButton).toBeVisible();
    await this.createProjectButton.click();
    await expect(this.projectNameInput).toBeVisible();
  }

  async fillProjectName(name) {
    await this.projectNameInput.fill(name);
  }

  async createProject({ name, tag, description } = {}) {
    await this.open();
    if (name !== undefined) {
      await this.fillProjectName(name);
    }
    if (description) {
      await this.fillDescription(description);
    }
    if (tag) {
      await this.addTag(tag);
    }
    await this.save();
  }

  async fillDescription(description) {
    await expect(this.descriptionInput).toBeVisible();
    await this.descriptionInput.fill(description);
  }

  async addTag(tag) {
    await expect(this.tagInput).toBeVisible();
    await this.tagInput.fill(tag);
    await expect(this.addTagButton).toBeVisible();
    await expect(this.addTagButton).toBeEnabled();
    await this.addTagButton.click();

    // Synchronization point: the tag save is an async round-trip
    // (POST /tags). While it is in flight the Add button reads "Saving..." and
    // is disabled. The chip only renders once the save completes, so waiting
    // for it prevents the caller from asserting against a pre-hydration DOM.
    // No fixed sleep is used - this is a retrying assertion.
    await expect(this.getTagChip(tag)).toBeVisible({ timeout: 20000 });
  }

  getTagChip(tag) {
    return this.page.getByText(tag, { exact: true });
  }

  async save() {
    await this.saveButton.scrollIntoViewIfNeeded();
    await expect(this.saveButton).toBeEnabled();
    await this.saveButton.click();
  }

  async dismiss(method = "escape") {
    if (method === "escape") {
      await this.page.keyboard.press("Escape");
      return;
    }

    const closeButton = this.dialog.getByRole("button", { name: /^close$/i });
    if (method === "close") {
      await expect(closeButton).toBeVisible();
      await closeButton.click();
      return;
    }

    if (method === "cancel") {
      await expect(this.cancelButton.first()).toBeVisible();
      await this.cancelButton.first().click();
      return;
    }

    throw new Error(`Unsupported Create Project dismiss method: ${method}`);
  }

  /**
   * Dismiss the Create Project form via its cancel/close control.
   *
   * The naive version of this helper returned `true` as soon as the name input
   * was not visible. That is a transient-state false positive: on the very
   * first poll the dialog may not have rendered yet, so "input not visible"
   * would satisfy the check before any dismissal was attempted at all.
   *
   * Instead this waits for the form to be observed OPEN, performs the dismissal,
   * and then requires the CLOSED state to be observed consistently across
   * consecutive polls before reporting success.
   */
  async cancelOrClose() {
    // Phase 1 — the form must actually be present before we try to dismiss it.
    await expect(this.projectNameInput).toBeVisible({ timeout: 20000 });

    // Phase 2 — attempt dismissal once, then wait on the form's actual state.
    // Do not require the button to remain visible while the dialog transitions
    // closed; the button can disappear before the dialog/input do.
    const cancelButton = this.page.getByRole("button", { name: /^(cancel|close|back)$/i }).first();
    await expect(cancelButton).toBeVisible({ timeout: 10000 });
    await cancelButton.click({ force: true, timeout: 3000 }).catch(() => {});

    await expect
      .poll(
        async () => {
          const dialogOpen = await this.dialog.isVisible().catch(() => false);
          const formOpen = await this.projectNameInput.isVisible().catch(() => false);
          return !dialogOpen && !formOpen;
        },
        { timeout: 20000, intervals: [250, 500, 1000, 2000] }
      )
      .toBe(true);

    // Phase 3 — confirm the closed state is stable, not a mid-animation frame.
    let consecutiveClosed = 0;
    await expect
      .poll(
        async () => {
          const dialogOpen = await this.dialog.isVisible().catch(() => false);
          const formOpen = await this.projectNameInput.isVisible().catch(() => false);
          const closed = !dialogOpen && !formOpen;
          consecutiveClosed = closed ? consecutiveClosed + 1 : 0;
          return consecutiveClosed >= 2;
        },
        { timeout: 10000, intervals: [250, 500, 1000] }
      )
      .toBe(true);
  }

  async formIsVisible() {
    return this.projectNameInput.isVisible();
  }

  async visibleValidationMessage() {
    const message = this.page.locator('[role="alert"], [aria-live="assertive"], p, span').filter({
      hasText: /required|invalid|already exists|duplicate|must|error/i,
    }).first();
    if (!(await message.isVisible().catch(() => false))) {
      return "";
    }
    return (await message.innerText()).trim();
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

  // ============================================================
  // Create Project dialog state
  // ============================================================

  get projectDialog() {
    return this.dialog;
  }

  async isDialogVisible(timeout) {
    return this._isVisibleEventually(this.dialog, timeout);
  }

  async areFormFieldsVisible() {
    return (
      (await this.projectNameInput.isVisible().catch(() => false)) &&
      (await this.descriptionInput.isVisible().catch(() => false)) &&
      (await this.tagInput.isVisible().catch(() => false))
    );
  }

  async getProjectNameValue() {
    return this.projectNameInput.inputValue();
  }

  async isSaveEnabled() {
    return this.saveButton.isEnabled();
  }

  async isCancelAvailable() {
    return this.cancelButton.first().isVisible().catch(() => false);
  }

  // ============================================================
  // Create Project tag handling
  // ============================================================

  async typeTag(tag) {
    await expect(this.tagInput).toBeVisible();
    await this.tagInput.fill(tag);
  }

  async isAddTagEnabled() {
    return this.addTagButton.isEnabled();
  }

  async isTagChipVisible(tag, timeout) {
    return this._isVisibleEventually(this.getTagChip(tag), timeout);
  }

  async isTagValidationMessageVisible() {
    return this.tagValidationMessage.isVisible().catch(() => false);
  }

  /**
   * Submit a tag value and report whether the dialog rejected it.
   * Used for whitespace-only and over-length tag scenarios.
   */
  async submitTagExpectingRejection(tag) {
    await this.typeTag(tag);
    const addEnabled = await this.isAddTagEnabled();
    if (addEnabled) {
      await this.addTagButton.click();
      await expect(this.tagValidationMessage).toBeVisible({ timeout: 5000 });
    }
    return {
      addTagEnabled: addEnabled,
      tagValue: await this.tagInput.inputValue(),
      validationVisible: await this.isTagValidationMessageVisible(),
    };
  }

  // ============================================================
  // Create Project save / destination
  // ============================================================

  async isProjectNameInputHidden(timeout) {
    return this._isHiddenEventually(this.projectNameInput, timeout);
  }

  async isProjectDestinationVisible(name) {
    return Boolean(await this.projectDestination(name));
  }

  async waitForProjectDestination(name, timeout = 30000) {
    await expect
      .poll(async () => {
        if (await this.isProjectDestinationVisible(name)) return true;
        await this.page.reload({ waitUntil: "domcontentloaded" });
        return this.isProjectDestinationVisible(name);
      }, { timeout, intervals: [1000, 2000, 5000] })
      .toBe(true);
  }

  // ============================================================
  // Create Project page chrome
  // ============================================================

  /** Logo / brand link shown on the project listing header. */
  get brandLogo() {
    return this.page.getByRole("img", { name: /breeze\.?ai/i }).first();
  }

  /** "Accion Labs" external link in the listing header. */
  get accionLabsLink() {
    return this.page.getByRole("link", { name: /accion labs/i });
  }

  /**
   * The error toast shown when project creation fails (for example when the
   * network request cannot be made).
   */
  get fetchErrorMessage() {
    return this.page.getByText("Failed to fetch", { exact: true });
  }

  // ============================================================
  // Create Project page-state checks
  // ============================================================

  /**
   * Poll a locator until it is visible (or the timeout elapses) and report the
   * result as a boolean. `isVisible()` alone is an instantaneous snapshot, so
   * callers need this to keep the auto-waiting behaviour the specs relied on
   * when they asserted with `expect(...).toBeVisible()` directly.
   */
  async _isVisibleWithin(locator, timeout = 20000) {
    if (!locator) return false;
    try {
      await expect(locator.first()).toBeVisible({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async isBrandLogoVisible(timeout) {
    return this._isVisibleWithin(this.brandLogo, timeout);
  }

  async isAccionLabsLinkVisible(timeout) {
    return this._isVisibleWithin(this.accionLabsLink, timeout);
  }

  async isCreateProjectTriggerVisible(timeout) {
    return this._isVisibleWithin(this.createProjectButton, timeout);
  }

  async isPageLoaded(timeout) {
    return this._isVisibleWithin(this.page.locator("body"), timeout);
  }

  async isFetchErrorMessageVisible(timeout = 5000) {
    return this._isVisibleWithin(this.fetchErrorMessage, timeout);
  }

  async waitForFetchErrorMessage(timeout = 15000) {
    await expect(this.fetchErrorMessage).toBeVisible({ timeout });
  }

  /**
   * Poll a locator until it is visible (or the timeout elapses) and report the
   * result as a boolean.
   *
   * Unlike `_isVisibleWithin`, this does NOT call `.first()`, so a locator that
   * already resolves to `.last()` (e.g. `this.dialog`) keeps its semantics.
   * `isVisible()` is an instantaneous snapshot, so a single call can read a
   * pre-hydration or mid-transition DOM and report the wrong state.
   */
  async _isVisibleEventually(locator, timeout = 20000) {
    if (!locator) return false;
    try {
      await expect(locator).toBeVisible({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Poll a locator until it is hidden (or the timeout elapses) and report the
   * result as a boolean. Used for "control has gone away" assertions, which
   * must wait for the close/unmount transition rather than sampling it once.
   */
  async _isHiddenEventually(locator, timeout = 10000) {
    if (!locator) return true;
    try {
      await expect(locator).toBeHidden({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================
  // Project card metadata
  // ============================================================

  /**
   * The "Created <relative time>" line on a project card.
   * `projectDestination` is async, so the card must be awaited first.
   */
  async createdTimestamp(projectName) {
    const card = await this.projectDestination(projectName);
    return card?.getByText(/^Created (?:just now|\d+ (?:minute|hour|day)s? ago)$/i).first() ?? null;
  }

  /** The description / tag placeholder shown when a card has neither. */
  async emptyMetadataLabel(projectName) {
    const card = await this.projectDestination(projectName);
    return card?.getByText(/no description added|no tags added|.+/i).first() ?? null;
  }

  async isCreatedTimestampVisible(projectName, timeout) {
    return this._isVisibleWithin(await this.createdTimestamp(projectName), timeout);
  }

  async isEmptyMetadataLabelVisible(projectName, timeout) {
    return this._isVisibleWithin(await this.emptyMetadataLabel(projectName), timeout);
  }
}
