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
    return card?.getByText(/^(?:no description added|no tags added)$/i).first() ?? null;
  }

  async isCreatedTimestampVisible(projectName, timeout) {
    return this._isVisibleWithin(await this.createdTimestamp(projectName), timeout);
  }

  async isEmptyMetadataLabelVisible(projectName, timeout) {
    return this._isVisibleWithin(await this.emptyMetadataLabel(projectName), timeout);
  }

  // ============================================================
  // Project listing tabs
  // ============================================================

  /**
   * The project-listing tab buttons, in render order.
   *
   * SCOPE NOTE — a plain role/name lookup is not safe here: the sidebar also
   * contains a DISABLED button whose accessible name is "Projects", which is a
   * navigation section rather than a listing tab. Scoping to the enabled,
   * exactly-named sub-tabs keeps that sidebar control out of the result set.
   */
  get projectTabs() {
    return this.page
      .getByRole("button", { name: /^(my projects|all projects|favourites|archived)$/i })
      .filter({ hasText: /^(my projects|all projects|favourites|archived)$/i });
  }

  /**
   * A single listing tab by name ("My Projects" / "Favourites" / "Archived").
   */
  projectTab(name) {
    const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return this.projectTabs.filter({ hasText: new RegExp(`^${escaped}$`, "i") }).first();
  }

  /**
   * Whether a listing tab is rendered at all.
   */
  async isProjectTabVisible(name, timeout = 10000) {
    return this._isVisibleWithin(this.projectTab(name), timeout);
  }

  /**
   * Whether the "Showing X to Y of N results" pagination summary is rendered.
   *
   * NOTE: the summary TEXT itself is read by the pre-existing
   * `getProjectListSummary(page)` in dashboardPage.js, so it is reused rather
   * than reimplemented here.
   */
  async isPaginationSummaryVisible() {
    return this._isVisibleWithin(
      this.page.locator("text=/showing\\s+\\d+\\s+to\\s+\\d+\\s+of\\s+\\d+\\s+results/i").first()
    );
  }

  projectCard(projectName) {
    return this.page
      .locator("article")
      .filter({ has: this.page.getByText(projectName, { exact: true }) })
      .first();
  }

  async openProjectOptionsMenu(projectName) {
    const card = this.projectCard(projectName);
    await expect(card).toBeVisible({ timeout: 20000 });
    const options = card.getByRole("button", { name: /project options/i }).first();
    await expect(options).toBeVisible({ timeout: 15000 });
    await options.click();

    const menu = this.page.getByRole("menu", { name: /project options/i }).first();
    await expect(menu).toBeVisible({ timeout: 15000 });
    return menu;
  }

  async archiveProject(projectName, projectUuid) {
    if (!projectUuid) {
      throw new Error("Cannot archive a project without its UUID");
    }
    const card = this.projectCard(projectName);
    await expect(card).toBeVisible({ timeout: 20000 });
    const options = card.getByRole("button", { name: /project options/i }).first();
    await expect(options).toBeVisible({ timeout: 15000 });
    await options.click();

    const menu = this.page.getByRole("menu", { name: /project options/i }).first();
    const archiveResponsePromise = this.page.waitForResponse(
      (response) =>
        ["DELETE", "PATCH", "POST"].includes(response.request().method()) &&
        new URL(response.url()).pathname.includes(projectUuid) &&
        /project|archive/i.test(new URL(response.url()).pathname),
      { timeout: 30000 }
    );
    const archiveAction = menu
      .getByRole("menuitem", { name: /^(delete|archive)$/i })
      .or(menu.getByRole("button", { name: /^(delete|archive)$/i }))
      .first();
    await expect(archiveAction).toBeVisible({ timeout: 15000 });

    const acceptNativeConfirmation = (dialog) => dialog.accept();
    this.page.once("dialog", acceptNativeConfirmation);
    await archiveAction.dispatchEvent("click");

    const confirmation = this.page
      .locator('[role="dialog"], [role="alertdialog"]')
      .filter({ hasText: projectName })
      .last();
    let hasConfirmation = false;
    try {
      await confirmation.waitFor({ state: "visible", timeout: 2000 });
      hasConfirmation = true;
    } catch (error) {
      if (error.name !== "TimeoutError") throw error;
    }
    if (hasConfirmation) {
      this.page.off("dialog", acceptNativeConfirmation);
      const archiveButton = confirmation.getByRole("button", { name: /^archive$/i }).last();
      await expect(archiveButton).toBeVisible({ timeout: 10000 });
      await archiveButton.click();
    } else {
      this.page.off("dialog", acceptNativeConfirmation);
    }

    const archiveResponse = await archiveResponsePromise;
    expect(
      archiveResponse.ok(),
      `Project archive request returned HTTP ${archiveResponse.status()}`
    ).toBe(true);
    return {
      method: archiveResponse.request().method(),
      path: new URL(archiveResponse.url()).pathname,
      status: archiveResponse.status(),
    };
  }

  async ensureArchivedProjectVisible(projectName) {
    const card = this.projectCard(projectName);
    try {
      await card.waitFor({ state: "visible", timeout: 3000 });
      return card;
    } catch (error) {
      if (error.name !== "TimeoutError") throw error;
    }

    const lastPageButton = this.page.getByRole("button", { name: /last page/i });
    await expect(lastPageButton).toBeVisible({ timeout: 10000 });
    await expect(lastPageButton).toBeEnabled();
    await lastPageButton.click();
    await expect(card).toBeVisible({ timeout: 30000 });
    return card;
  }
}

export class UserManagementPage {
  constructor(page) {
    this.page = page;
  }

  get settingsTab() {
    return this.page
      .getByRole("tab", { name: /user management/i })
      .or(this.page.getByRole("button", { name: /^user management$/i }))
      .or(this.page.getByText(/^user management$/i))
      .first();
  }

  get createUserButton() {
    return this.page.getByRole("button", { name: /^create user$/i }).last();
  }

  get createUserDialog() {
    return this.page.getByRole("dialog").last();
  }

  get createUserFirstNameInput() {
    return this.createUserDialog
      .getByLabel(/first name/i)
      .or(this.createUserDialog.getByPlaceholder(/jane/i))
      .first();
  }

  get createUserLastNameInput() {
    return this.createUserDialog
      .getByLabel(/last name/i)
      .or(this.createUserDialog.getByPlaceholder(/doe/i))
      .first();
  }

  get createUserEmailInput() {
    return this.createUserDialog
      .getByLabel(/email/i)
      .or(this.createUserDialog.getByPlaceholder(/@/))
      .or(this.createUserDialog.locator('input[type="email"]'))
      .first();
  }

  get createUserRoleControl() {
    return this.createUserDialog.getByRole("combobox").last();
  }

  get searchInput() {
    return this.page
      .getByRole("tabpanel")
      .getByRole("textbox", { name: /jane@example\.com/i })
      .first();
  }

  get refreshUserListButton() {
    return this.page.getByRole("button", { name: /^refresh$/i });
  }

  get firstUserPageButton() {
    return this.page.getByRole("button", { name: /^first page$/i });
  }

  get previousUserPageButton() {
    return this.page.getByRole("button", { name: /^previous page$/i });
  }

  get nextUserPageButton() {
    return this.page.getByRole("button", { name: /^next page$/i });
  }

  get lastUserPageButton() {
    return this.page.getByRole("button", { name: /^last page$/i });
  }

  get userListSummary() {
    return this.page
      .getByText(/showing\s+\d+\s+to\s+\d+\s+of\s+\d+\s+results/i)
      .last();
  }

  get themesTab() {
    return this.page.getByRole("tab", { name: /^themes$/i });
  }

  async openSettingsFromProfile() {
    const profileMenu = this.page.getByRole("menu", { name: /user profile menu/i });
    await this.page.getByRole("button", { name: /user profile menu/i }).click();
    await expect(profileMenu).toBeVisible();
    await profileMenu.getByText(/^settings$/i).click();
    await expect(this.page).toHaveURL(/\/settings/i, { timeout: 30000 });
  }

  async loginCreatedUser(email, password, baseUrl) {
    await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const signInButton = this.page.getByRole("button", { name: /sign in with breeze ai/i });
    const profileMenuButton = this.page.getByRole("button", { name: /user profile menu/i });
    const profileMenu = this.page.getByRole("menu", { name: /user profile menu/i });
    const logoutCurrentUser = async () => {
      await profileMenuButton.click();
      await expect(profileMenu).toBeVisible();
      const logoutRequest = this.page.waitForRequest(
        (request) => /openid-connect\/logout/i.test(request.url()),
        { timeout: 30000 }
      );
      await profileMenu.locator('[role="menuitem"]').filter({ hasText: /logout/i }).click();
      await logoutRequest;
    };
    await expect
      .poll(
        async () =>
          (await signInButton.isVisible().catch(() => false)) ||
          (await profileMenuButton.isVisible().catch(() => false)),
        { timeout: 20000, message: "Expected the sign-in button or an authenticated profile menu" }
      )
      .toBe(true);
    if (await profileMenuButton.isVisible().catch(() => false)) {
      await logoutCurrentUser();
      await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    }
    await expect(signInButton).toBeVisible({ timeout: 20000 });
    await signInButton.click();
    const usernameInput = this.page.locator("#username, input[name='username']").first();
    await expect
      .poll(
        async () =>
          (await usernameInput.isVisible().catch(() => false)) ||
          (await profileMenuButton.isVisible().catch(() => false)),
        { timeout: 60000, message: "Expected the identity-provider login form or authenticated app after sign-in" }
      )
      .toBe(true);

    if (!(await usernameInput.isVisible().catch(() => false))) {
      await logoutCurrentUser();

      await this.page.goto(baseUrl, { waitUntil: "domcontentloaded" });
      await signInButton.click();
      await expect(usernameInput).toBeVisible({ timeout: 60000 });
    }

    await usernameInput.fill(email);
    await this.page.locator("#password, input[name='password']").first().fill(password);
    const roleLookup = this.page.waitForResponse(
      (response) => /\/users\/login/i.test(response.url()),
      { timeout: 60000 }
    );
    await this.page.locator("#kc-login, button[name='login'], button[type='submit']").first().click();
    const roleResponse = await roleLookup;
    expect(roleResponse.ok(), `The created user's role lookup failed with HTTP ${roleResponse.status()}`).toBe(true);
    await expect(this.page.getByRole("button", { name: /user profile menu/i })).toBeVisible({
      timeout: 60000,
    });
  }

  async readSettingsHeadingsAndTabs() {
    await expect(this.page.getByRole("heading", { name: /^settings$/i })).toBeVisible({
      timeout: 20000,
    });
    const settingsTablist = this.page.getByRole("tablist", { name: /settings sections/i });
    await expect(settingsTablist).toBeVisible({ timeout: 20000 });
    const pageTitle = await this.page.title();
    const [headings, tabs, allTabs] = await Promise.all([
      this.page.getByRole("main").locator("h1, h2, h3, h4, h5, h6").evaluateAll((elements) =>
        elements
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => element.innerText.trim())
          .filter(Boolean)
      ),
      settingsTablist.getByRole("tab", { selected: true }).allInnerTexts(),
      settingsTablist.getByRole("tab").allInnerTexts(),
    ]);
    return {
      pageTitle,
      headings: [...new Set(headings)],
      tabs: [...new Set(tabs)],
      allTabs: [...new Set(allTabs)],
    };
  }

  async openUserManagement() {
    await expect(this.settingsTab).toBeVisible({ timeout: 20000 });
    await this.settingsTab.dispatchEvent("click");
    await expect(this.page.getByText(/user management/i).first()).toBeVisible({ timeout: 20000 });
  }

  async openThemes() {
    await expect(this.themesTab).toBeVisible();
    await this.themesTab.click();
    await expect(this.themesTab).toHaveAttribute("aria-selected", "true");
    await expect(this.themeOption("Light")).toBeVisible();
    await expect(this.themeOption("Premium")).toBeVisible();
  }

  themeOption(themeName) {
    return this.page.getByRole("button", {
      name: `Apply ${themeName} theme`,
      exact: true,
    });
  }

  async selectTheme(themeName) {
    if (!["Light", "Premium"].includes(themeName)) {
      throw new Error(`Unsupported Settings theme: ${themeName}`);
    }
    await this.themeOption(themeName).click();
    await expect.poll(() => this.getSelectedThemeName()).toBe(themeName);
  }

  async getSelectedThemeName() {
    const selectedThemeLabels = await this.page
      .getByRole("tabpanel")
      .getByRole("button", { name: /^Apply (Light|Premium) theme$/i })
      .evaluateAll((buttons) =>
        buttons
          .filter((button) => button.getAttribute("aria-pressed") === "true")
          .map((button) => button.getAttribute("aria-label"))
      );
    if (selectedThemeLabels.length !== 1) {
      throw new Error(`Expected one selected Settings theme, found ${selectedThemeLabels.length}.`);
    }
    const match = selectedThemeLabels[0].match(/^Apply (Light|Premium) theme$/i);
    if (!match) throw new Error(`Unexpected selected Settings theme: ${selectedThemeLabels[0]}`);
    return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  }

  async getPersistedThemeName() {
    return this.page.evaluate(() => localStorage.getItem("theme"));
  }

  async openCreateUserDialog() {
    await this.createUserButton.click();
    await expect(this.createUserDialog).toBeVisible();
    return this.createUserDialog;
  }

  async closeCreateUserDialog() {
    await this.createUserDialog.getByRole("button", { name: /^cancel$/i }).click();
    await expect(this.createUserDialog).toBeHidden();
  }

  async refreshUserList() {
    const usersResponse = this.page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/users" &&
        url.searchParams.has("page")
      );
    });
    await this.refreshUserListButton.click();
    const response = await usersResponse;
    expect(response.ok(), `Refreshing the user list failed with HTTP ${response.status()}`).toBe(true);
    await expect(this.userListSummary).toBeVisible();
  }

  async getUserListSummaryDetails() {
    await expect(this.userListSummary).toBeVisible();
    const match = (await this.userListSummary.innerText()).match(
      /showing\s+(\d+)\s+to\s+(\d+)\s+of\s+(\d+)\s+results/i
    );
    if (!match) throw new Error("User Management pagination summary did not include its range and total.");
    return { start: Number(match[1]), end: Number(match[2]), total: Number(match[3]) };
  }

  async getTotalUserCount() {
    await expect(this.page.getByRole("table").first()).toBeVisible({ timeout: 20000 });
    return (await this.getUserListSummaryDetails()).total;
  }

  async getVisibleUserRowCount() {
    const table = this.page.getByRole("table").first();
    await expect(table).toBeVisible();
    return Math.max(0, (await table.getByRole("row").count()) - 1);
  }

  async getFirstUserEmail() {
    const firstUserRow = this.page.getByRole("table").first().getByRole("row").nth(1);
    await expect(firstUserRow).toBeVisible();
    const email = (await firstUserRow.getByRole("cell").nth(1).innerText()).trim();
    if (!email.includes("@")) throw new Error(`Unexpected email in first User Management row: ${email}`);
    return email;
  }

  async getAvailableUserRoles(email) {
    const roleControl = this.userRow(email).getByRole("combobox").last();
    await expect(roleControl).toBeVisible();
    await roleControl.click();
    const roleOptions = this.page.getByRole("option");
    await expect(roleOptions.first()).toBeVisible();
    const options = (await roleOptions.allInnerTexts()).map((option) => option.trim());
    await this.page.keyboard.press("Escape");
    return options;
  }

  async searchUser(email) {
    await expect(this.searchInput).toBeVisible({ timeout: 15000 });
    await this.searchInput.fill(email);
    const row = this.userRow(email);
    await expect.poll(() => row.count(), { timeout: 20000 }).toBeGreaterThan(0);
    await expect(row).toBeVisible();
    return row;
  }

  async userExists(email) {
    await expect(this.searchInput).toBeVisible({ timeout: 15000 });
    await this.searchInput.fill(email);
    const row = this.userRow(email);
    const emptyState = this.page.getByText(/no users?|no records?|no results?/i).first();
    let result = false;
    await expect
      .poll(
        async () => {
          if (await row.count()) {
            result = true;
            return "found";
          }
          if (await emptyState.isVisible().catch(() => false)) return "not-found";
          return "pending";
        },
        { timeout: 20000, message: `Expected User Management search to finish for ${email}` }
      )
      .not.toBe("pending");
    return result;
  }

  async deleteUser(email) {
    const row = this.userRow(email);
    await expect(row).toBeVisible({ timeout: 20000 });
    const deleteButton = row.getByRole("button", { name: /delete user/i });
    await expect(deleteButton).toBeVisible();

    const deleteResponse = this.page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        /\/users?(?:\/|$)/i.test(new URL(response.url()).pathname),
      { timeout: 30000 }
    );
    const acceptNativeConfirmation = (dialog) => dialog.accept();
    this.page.once("dialog", acceptNativeConfirmation);
    await deleteButton.click();

    const confirmation = this.page.locator('[role="dialog"], [role="alertdialog"]').last();
    const confirmationVisible = await confirmation
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true, () => false);
    if (confirmationVisible) {
      const confirmDelete = confirmation.getByRole("button", { name: /^(delete user|delete)$/i }).last();
      await expect(confirmDelete).toBeVisible({ timeout: 10000 });
      this.page.off("dialog", acceptNativeConfirmation);
      await confirmDelete.click();
    } else {
      this.page.off("dialog", acceptNativeConfirmation);
    }

    const response = await deleteResponse;
    expect(response.ok(), `Deleting ${email} failed with HTTP ${response.status()}`).toBe(true);
    await this.page.getByRole("button", { name: /^refresh$/i }).click();
    await expect(row).toBeHidden({ timeout: 20000 });
    await expect.poll(() => row.count(), { timeout: 10000 }).toBe(0);
  }

  async clearSearch() {
    await this.searchInput.fill("");
  }

  userRow(email) {
    return this.page.getByRole("row").filter({ hasText: email }).last();
  }

  async createUser({ name, email, role }) {
    const dialog = await this.openCreateUserDialog();

    if (await this.createUserFirstNameInput.count()) {
      await this.createUserFirstNameInput.fill(name.split(/\s+/)[0]);
    }
    if (await this.createUserLastNameInput.count()) {
      await this.createUserLastNameInput.fill(name.split(/\s+/).slice(1).join(" ") || "User");
    }

    const fullName = dialog.getByLabel(/^(full )?name$/i);
    if (await fullName.count()) await fullName.fill(name);

    await expect(this.createUserEmailInput).toBeVisible();
    await this.createUserEmailInput.fill(email);

    await this.selectRole(this.createUserDialog, role);
    await dialog.getByRole("button", { name: /^create user$/i }).click();

    const copiedButton = this.page.getByRole("button", { name: /i['’]?ve copied it/i }).last();
    await expect(copiedButton).toBeVisible({ timeout: 20000 });
    const copyButton = this.page.getByRole("button", { name: /copy/i }).last();
    await expect(copyButton).toBeVisible({ timeout: 10000 });
    await copyButton.click();
    const password = await this.page.evaluate(() => navigator.clipboard.readText());
    expect(password.trim(), "The generated user password should be copied before acknowledging it").not.toBe("");
    await copiedButton.click();
    return password.trim();
  }

  async changeUserRole(email, role) {
    const row = this.userRow(email);
    await expect(row).toBeVisible({ timeout: 20000 });
    await this.selectRole(row, role);

    const confirmation = this.page.locator('[role="dialog"], [role="alertdialog"]').last();
    const confirmationVisible = await confirmation
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true, () => false);
    if (confirmationVisible) {
      await confirmation.getByRole("button", { name: /change role/i }).click();
    }

    const saveButton = row.getByRole("button", { name: /^(save|update)$/i }).last();
    if (await saveButton.isVisible().catch(() => false)) {
      await saveButton.click();
    }

    const roleControl = row.getByRole("combobox").last();
    if (await roleControl.count()) {
      const tagName = await roleControl.evaluate((element) => element.tagName.toLowerCase());
      if (tagName === "select") {
        await expect.poll(
          () => roleControl.locator("option:checked").innerText(),
          { timeout: 20000 }
        ).toBe(role);
      } else {
        await expect(roleControl).toContainText(
          new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
          { timeout: 20000 }
        );
      }
      return;
    }

    await expect(row).toContainText(
      new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
      { timeout: 20000 }
    );
  }

  async selectRole(scope, role) {
    const roleControl = scope.getByRole("combobox").last();
    if (await roleControl.count()) {
      const tagName = await roleControl.evaluate((element) => element.tagName.toLowerCase());
      if (tagName === "select") {
        await roleControl.selectOption({ label: role });
      } else {
        await roleControl.click();
        await this.page.getByRole("option", { name: role, exact: true }).last().click();
      }
      return;
    }

    const roleButton = scope.getByRole("button", { name: /end user|viewer|admin/i }).last();
    await expect(roleButton).toBeVisible({ timeout: 10000 });
    await roleButton.click();
    await this.page.getByRole("option", { name: role, exact: true })
      .or(this.page.getByRole("menuitem", { name: role, exact: true }))
      .last()
      .click();
  }
}
