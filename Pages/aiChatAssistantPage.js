import { expect } from "@playwright/test";

const CHAT_PATH = /\/chat\/[^/?#]+/i;

export class AiChatAssistantPage {
  constructor(page) {
    this.page = page;
    this.chatLog = page.getByRole("log", { name: "Chat messages" });
    this.chatForm = page.getByRole("form", { name: "Chat message input" });
    this.messageInput = page.getByRole("textbox", { name: "Type your message" });
    this.sendButton = page.getByRole("button", { name: "Send message" });
    this.stopButton = page.getByRole("button", { name: "Stop generating" });
    this.queryMode = page.getByRole("combobox").first();
    this.experimentalMode = page.getByRole("combobox").nth(1);
    this.deepAnalysis = page.getByRole("switch", { name: "Toggle deep analysis" });
    this.copyButton = this.chatLog.getByRole("button", { name: "Copy to clipboard" });
    this.jiraButton = this.chatLog.getByRole("button", {
      name: "Raise a Jira ticket from this conversation",
    });
    // UI verification
    this.assistantHeading = page.getByRole("heading").filter({ hasText: /assistant/i }).first();
    this.moreExamplesSection = page.getByText(/more examples/i, { exact: false }).first();
    this.quickStartCards = page.getByRole("button", {
      name: /functional ontology|code ontology|cross.functional tracing|impact analysis/i,
    });
    this.breadcrumb = page
      .getByRole("navigation", { name: /breadcrumb/i })
      .or(page.locator("nav").filter({ hasText: /dashboard/i }))
      .first();
    // Loading / generating state
    this.loadingIndicator = page
      .locator("[aria-busy='true'],[data-loading='true'],[class*='typing-indicator'],[class*='spinner']")
      .first();
    this.retryButton = page.getByRole("button", { name: /retry|try again/i });
    // GQ v2 sidebar
    this.chatsSidebar = page
      .locator("[class*='sidebar'],[aria-label*='Chats'],[aria-label*='CHATS'],[role='complementary']")
      .filter({ hasText: /chats/i })
      .first();
    // Jira dialog
    this.jiraDialog = page.getByRole("dialog");
    // Toolbar — examples
    this.examplesButton = page.getByRole("button", { name: /examples/i });
    // Timestamps
    this.timestamps = page.locator("[class*='timestamp'],time").filter({ hasText: /\d{1,2}:\d{2}/ });
  }

  async openFirstProjectFromDashboard() {
    return this.openProjectFromDashboard(0);
  }

  async openProjectFromDashboard(index) {
    await expect(this.page.getByRole("navigation", { name: "Main navigation" })).toBeVisible({
      timeout: 60000,
    });
    const project = this.page.locator("article").filter({ hasText: /\S/ }).nth(index);
    await expect(project).toBeVisible({ timeout: 30000 });
    const projectTitle = (await project.innerText())
      .split("\n")
      .map((value) => value.trim())
      .find(Boolean);
    if (!projectTitle) {
      throw new Error("No project title was found in the first visible project card");
    }
    await project.getByText(projectTitle, { exact: true }).first().click({ force: true });
    await expect.poll(() => this.page.url(), { timeout: 30000 }).toMatch(/\/dashboard\/[^/?#]+/i);
    return this.page.url().match(/\/dashboard\/([^/?#]+)/i)?.[1] || null;
  }

  async open(projectId) {
    await this.page.goto(`${new URL(this.page.url()).origin}/chat/${projectId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(this.page).toHaveURL(CHAT_PATH, { timeout: 30000 });
    await expect(this.messageInput).toBeVisible({ timeout: 30000 });
  }

  promptCard(name) {
    return this.page.getByRole("button", { name: new RegExp(name, "i") }).first();
  }

  async choosePrompt(name) {
    const prompt = this.promptCard(name);
    await expect(prompt).toBeVisible({ timeout: 10000 });
    await prompt.click();
  }

  async sendMessage(message, { submitWithEnter = false } = {}) {
    await expect(this.messageInput).toBeVisible({ timeout: 15000 });
    // If a prior response is still streaming, wait for it to finish.
    // Sending while the Stop-generating button is visible blocks the new submission.
    await expect(this.stopButton).not.toBeVisible({ timeout: 45000 }).catch(() => {});
    // Click first to ensure the textarea is focused before fill/send.
    await this.messageInput.click();
    if (submitWithEnter) {
      // Use pressSequentially so React's onKeyDown/onChange handlers fire per-character
      // and the component's internal state is in sync before Enter is pressed.
      // fill() sets the DOM value directly (paste-like) and React state may lag,
      // causing the Enter handler to see an empty string and skip the submit.
      await this.messageInput.clear();
      // Timeout scales with message length: 60 s base covers up to ~3000 chars at 20 ms/char.
      await this.messageInput.pressSequentially(message, { delay: 20, timeout: Math.max(60000, message.length * 30) });
      // Sync barrier 1: DOM value must equal what we typed.
      await expect(this.messageInput).toHaveValue(message, { timeout: 10000 });
      // Sync barrier 2 (optional): wait for send button to be enabled as confirmation
      // that React state is non-empty. Catch in case the button is temporarily replaced
      // by the Stop-generating button (e.g., a prior response is still streaming).
      await expect(this.sendButton).toBeEnabled({ timeout: 5000 }).catch(() => {});
      await this.messageInput.press("Enter");
    } else {
      await this.messageInput.fill(message);
      // Always try to click the send button; fall back to Enter if it's not enabled.
      // NOTE: do NOT check "message already in chatLog" as a skip condition —
      // prompt-card paragraphs and More Examples buttons live inside the chat log
      // and share the same text, so that check would falsely skip the actual send.
      try {
        await expect(this.sendButton).toBeEnabled({ timeout: 5000 });
        await this.sendButton.click();
      } catch {
        await this.messageInput.press("Enter");
      }
    }
    // Wait for the input to clear — the most reliable signal that the app
    // accepted and submitted the message (clears on success, stays filled on failure).
    await expect(this.messageInput).toHaveValue("", { timeout: 15000 });
  }

  async waitForResponse({ timeout = 180000 } = {}) {
    const countBefore = await this.copyButton.count();

    // Primary strategy: wait for the Stop-generating button to appear (AI started),
    // then wait for it to disappear (AI finished).  This is more reliable than polling
    // the copy-button count because it tracks the actual generation lifecycle.
    const stopAppeared = await this.stopButton
      .waitFor({ state: "visible", timeout: 20000 })
      .then(() => true)
      .catch(() => false);

    if (stopAppeared) {
      // AI is generating — wait for it to finish (stop button disappears).
      // Catch page-navigation errors (context closed) — if the page navigated,
      // generation is implicitly done.
      await expect(this.stopButton).not.toBeVisible({ timeout }).catch(e => {
        if (/closed|navigated|destroyed/i.test(e.message)) return;
        throw e;
      });
    } else {
      // Stop button never appeared within 20 s (very fast response or missed window) —
      // fall back to polling the copy-button count directly.
      await expect.poll(
        async () => this.copyButton.count(),
        { timeout, intervals: [1000, 2000, 3000] },
      ).toBeGreaterThan(countBefore);
      // Safety drain: the count-poll can succeed while AI is still streaming
      // (e.g. a prior copy button already existed).  Always ensure generation
      // has fully finished before returning so the next test starts clean.
      await expect(this.stopButton).not.toBeVisible({ timeout: 30000 }).catch(() => {});
    }

    // Wait for the new copy button (the countBefore-th index) to be stably visible.
    await expect(this.copyButton.nth(countBefore)).toBeVisible({ timeout: 10000 }).catch(() => {});

    // Go up 3 levels from the Copy button:
    //   .. = button group (Copy + Raise Jira)
    //   ../.. = actions bar (button group + timestamp)
    //   ../../.. = response bubble (paragraph + actions bar)
    const response = this.copyButton.last().locator("xpath=../../..");
    await expect(response).toContainText(/\S+/, { timeout: 20000 }).catch(e => {
      if (/closed|navigated|destroyed/i.test(e.message)) return;
      throw e;
    });
    return (await response.innerText().catch(() => "")).trim();
  }

  async submitWhitespace() {
    const before = await this.chatLog.getByText(/^\s*$/, { exact: true }).count().catch(() => 0);
    await this.messageInput.fill("   ");
    if (await this.sendButton.isVisible().catch(() => false)) {
      await this.sendButton.click();
    }
    await this.page.waitForTimeout(500);
    const after = await this.chatLog.getByText(/^\s*$/, { exact: true }).count().catch(() => 0);
    return { before, after };
  }

  async selectQueryMode(label) {
    await this.queryMode.click();
    const option = this.page
      .getByRole("option", { name: new RegExp(label, "i") })
      .or(this.page.getByRole("menuitem", { name: new RegExp(label, "i") }))
      .first();
    await expect(option).toBeVisible({ timeout: 5000 });
    await option.click();
  }

  async startNewChat() {
    // Use getByRole (not CSS [role=]) so it matches <aside> elements with implicit complementary role.
    const sidebar = this.page.getByRole("complementary");
    const newChat = sidebar.getByRole("button", { name: /new chat/i });
    await expect(newChat).toBeVisible({ timeout: 10000 });
    await newChat.click();
    // Wait until the fresh empty thread is shown (quick-start cards appear = blank chat active).
    await expect(this.quickStartCards.first()).toBeVisible({ timeout: 15000 });
  }

  async switchChat(nameOrIndex = 0) {
    // Thread buttons live inside <li> elements in the GQ v2 sidebar (<aside>).
    // Filter out "Thread actions" buttons to get only the topic-title buttons.
    const sidebar = this.page.getByRole("complementary");
    const threadButtons = sidebar.locator("li").getByRole("button").filter({ hasNotText: /thread actions/i });
    const target =
      typeof nameOrIndex === "number"
        ? threadButtons.nth(nameOrIndex)
        : threadButtons.filter({ hasText: nameOrIndex }).first();
    await expect(target).toBeVisible({ timeout: 10000 });
    await target.click();
  }

  async copyLatestResponse() {
    await expect(this.copyButton.last()).toBeVisible({ timeout: 10000 });
    await this.copyButton.last().click();
  }

  async raiseJiraTicket() {
    await expect(this.jiraButton.last()).toBeVisible({ timeout: 10000 });
    await this.jiraButton.last().click();
  }

  async hasJiraAction() {
    return this.jiraButton.last().isVisible({ timeout: 2000 }).catch(() => false);
  }

  async latestUserMessage(message) {
    return this.chatLog.getByText(message, { exact: true }).last();
  }

  // Returns the combobox visible text (default query mode label)
  async getQueryModeDefaultValue() {
    return (await this.queryMode.innerText()).trim();
  }

  // Opens dropdown, counts options, closes with Escape
  async getQueryModeOptions() {
    await this.queryMode.click();
    const options = this.page.getByRole("option").or(this.page.getByRole("menuitem"));
    await expect(options.first()).toBeVisible({ timeout: 5000 });
    const count = await options.count();
    await this.page.keyboard.press("Escape");
    return count;
  }

  // Opens dropdown, checks if v2 option has an "Experimental" badge text
  async hasExperimentalBadge() {
    await this.queryMode.click();
    const v2Option = this.page
      .getByRole("option", { name: /general query v2/i })
      .or(this.page.getByRole("menuitem", { name: /general query v2/i }))
      .first();
    await expect(v2Option).toBeVisible({ timeout: 5000 });
    const hasBadge = await v2Option.getByText(/experimental/i).isVisible().catch(() => false);
    await this.page.keyboard.press("Escape");
    return hasBadge;
  }

  // Returns placeholder attribute of the message input
  async getInputPlaceholder() {
    return this.messageInput.getAttribute("placeholder");
  }

  // Returns true if deep analysis toggle is currently checked
  async isDeepAnalysisChecked() {
    return this.deepAnalysis.isChecked().catch(() => false);
  }

  // Checks whether an "Experimental" label exists near the deep analysis toggle
  async hasDeepAnalysisExperimentalLabel() {
    const label = this.page
      .locator("label,span,div")
      .filter({ hasText: /^experimental$/i })
      .first();
    return label.isVisible({ timeout: 3000 }).catch(() => false);
  }

  // Returns count of visible quick-start category cards
  async getQuickStartCardCount() {
    return this.quickStartCards.count();
  }

  // Returns count of buttons inside the MORE EXAMPLES section
  async getMoreExamplesButtonCount() {
    const section = this.page
      .locator("section,div,aside")
      .filter({ hasText: /more examples/i })
      .first();
    return section.getByRole("button").count().catch(() => 0);
  }

  // True if quick-start cards are visible
  async quickStartCardsVisible() {
    return this.quickStartCards.first().isVisible({ timeout: 5000 }).catch(() => false);
  }

  // True if quick-start cards are no longer visible
  async quickStartCardsHidden() {
    return this.quickStartCards.first().isHidden({ timeout: 5000 }).catch(() => true);
  }

  // Enables the deep analysis toggle (idempotent)
  async enableDeepAnalysis() {
    if (!(await this.deepAnalysis.isChecked().catch(() => false))) {
      await this.deepAnalysis.click();
    }
    await expect(this.deepAnalysis).toBeChecked({ timeout: 5000 });
  }

  // Disables the deep analysis toggle (idempotent)
  async disableDeepAnalysis() {
    if (await this.deepAnalysis.isChecked().catch(() => false)) {
      await this.deepAnalysis.click();
    }
    await expect(this.deepAnalysis).not.toBeChecked({ timeout: 5000 });
  }

  // True if the GQ v2 CHATS sidebar is currently visible
  async isChatsSidebarVisible() {
    const bySelector = await this.chatsSidebar.isVisible({ timeout: 3000 }).catch(() => false);
    if (bySelector) return true;
    // GQ v2 sidebar renders as <aside role="complementary"> with "chats" text
    return this.page.getByRole("complementary").filter({ hasText: /chats/i }).isVisible({ timeout: 5000 }).catch(() => false);
  }

  async selectQueryModeV1() {
    await this.selectQueryMode("General Query");
  }

  async selectQueryModeV2() {
    await this.selectQueryMode("General Query v2");
  }

  // Waits up to `timeout` ms for a loading indicator to appear
  async waitForLoadingIndicator({ timeout = 8000 } = {}) {
    await this.loadingIndicator.waitFor({ state: "visible", timeout }).catch(() => {});
  }

  // Clicks the stop-generating button
  async stopGenerating() {
    await expect(this.stopButton).toBeVisible({ timeout: 30000 });
    await this.stopButton.click();
  }

  // True if send button is disabled OR stop button is visible (both indicate "busy")
  async isSendDisabledOrStopVisible() {
    const stopVisible = await this.stopButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (stopVisible) return true;
    return this.sendButton.isDisabled({ timeout: 2000 }).catch(() => false);
  }

  // True if message input is currently enabled
  async isInputEnabled() {
    return this.messageInput.isEnabled({ timeout: 5000 }).catch(() => false);
  }

  // True if message input is currently disabled
  async isInputDisabled() {
    return this.messageInput.isDisabled({ timeout: 5000 }).catch(() => false);
  }

  // Clicks the examples toolbar button
  async clickExamplesButton() {
    await expect(this.examplesButton).toBeVisible({ timeout: 10000 });
    await this.examplesButton.click();
  }

  // Returns count of thread items in the v2 CHATS sidebar
  async getThreadCount() {
    const sidebar = this.page.getByRole("complementary");
    const visible = await sidebar.isVisible({ timeout: 3000 }).catch(() => false);
    if (!visible) return 0;
    // Thread title buttons live inside <li> elements; exclude "New Chat" and action buttons.
    const threads = sidebar.locator("li").getByRole("button")
      .filter({ hasNotText: /new chat|thread actions/i });
    return threads.count().catch(() => 0);
  }

  // Returns thread-title buttons in the v2 sidebar (excludes "New Chat" and action buttons)
  _threadButtons() {
    return this.page.getByRole("complementary")
      .locator("li").getByRole("button")
      .filter({ hasNotText: /new chat|thread actions/i });
  }

  // Clicks the thread at `index` in the v2 sidebar
  async clickThreadAt(index = 0) {
    const thread = this._threadButtons().nth(index);
    await expect(thread).toBeVisible({ timeout: 10000 });
    await thread.click();
  }

  // Hovers over the latest AI response and clicks Raise Jira Ticket, then waits for the dialog
  async openJiraDialog() {
    const responseArea = this.copyButton.last().locator("xpath=../..");
    await responseArea.hover();
    await expect(this.jiraButton.last()).toBeVisible({ timeout: 5000 });
    await this.jiraButton.last().click();
    await expect(this.jiraDialog).toBeVisible({ timeout: 10000 });
  }

  // Returns value of the first textbox in the Jira dialog (title field).
  // Waits up to 5s for async pre-fill before reading.
  async getJiraDialogTitleValue() {
    const titleInput = this.jiraDialog.getByRole("textbox").first();
    await expect(titleInput).toBeVisible({ timeout: 5000 }).catch(() => {});
    await expect(titleInput).not.toBeEmpty({ timeout: 5000 }).catch(() => {});
    return titleInput.inputValue().catch(() => "");
  }

  // Returns value of the description field (second textbox or textarea) in the Jira dialog.
  // Waits up to 3s for async pre-fill before reading.
  async getJiraDialogDescriptionValue() {
    const descInput = this.jiraDialog.getByRole("textbox").nth(1)
      .or(this.jiraDialog.locator("textarea,[name*='description']").first());
    await expect(descInput).not.toBeEmpty({ timeout: 3000 }).catch(() => {});
    return descInput.inputValue().catch(() => "");
  }

  // Clicks Cancel inside the Jira dialog
  async cancelJiraDialog() {
    const cancelBtn = this.jiraDialog.getByRole("button", { name: /cancel/i });
    await expect(cancelBtn).toBeVisible({ timeout: 5000 });
    await cancelBtn.click();
    await expect(this.jiraDialog).toBeHidden({ timeout: 5000 });
  }

  // Closes the Jira dialog via its X / close button
  async closeJiraDialogWithX() {
    const closeBtn = this.jiraDialog
      .getByRole("button", { name: /close|dismiss/i })
      .or(this.jiraDialog.locator("button[aria-label*='close'],button[class*='close']"))
      .first();
    await expect(closeBtn).toBeVisible({ timeout: 5000 });
    await closeBtn.click();
    await expect(this.jiraDialog).toBeHidden({ timeout: 5000 });
  }

  // Returns count of timestamp elements visible in the chat log
  async getTimestampCount() {
    return this.timestamps.count().catch(() => 0);
  }

  // Clicks the Dashboard link in the breadcrumb
  async navigateToDashboardViaBreadcrumb() {
    const link = this.page
      .getByRole("link", { name: /dashboard/i })
      .or(this.page.getByRole("button", { name: /dashboard/i }))
      .first();
    await expect(link).toBeVisible({ timeout: 10000 });
    await link.click();
    await expect.poll(() => this.page.url(), { timeout: 15000 }).toMatch(/\/dashboard\//i);
  }

  // True if the Agent breadcrumb button is disabled
  async isAgentButtonDisabled() {
    const agentBtn = this.page.getByRole("button", { name: /^agent$/i });
    return agentBtn.isDisabled({ timeout: 5000 }).catch(() => false);
  }

  // Hovers a thread at `index`, then renames it
  async renameThread(index, newName) {
    const thread = this._threadButtons().nth(index);
    await thread.hover();
    const renameBtn = this.page
      .getByRole("button", { name: /rename/i })
      .or(this.page.getByRole("menuitem", { name: /rename/i }));
    if (!(await renameBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      await thread.click({ button: "right" });
    }
    await renameBtn.first().click();
    const input = this.page
      .getByRole("textbox")
      .filter({ hasValue: "" })
      .or(this.page.locator("[contenteditable='true']"))
      .last();
    await input.fill(newName);
    await input.press("Enter");
  }

  // Hovers a thread at `index`, clicks delete, confirms
  async deleteThread(index) {
    const thread = this._threadButtons().nth(index);
    await thread.hover();
    const deleteBtn = this.page
      .getByRole("button", { name: /delete/i })
      .or(this.page.getByRole("menuitem", { name: /delete/i }));
    if (!(await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      await thread.click({ button: "right" });
    }
    await deleteBtn.first().click();
    const confirmBtn = this.page.getByRole("button", { name: /confirm|delete/i }).last();
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await confirmBtn.click();
    }
  }

  // Collapses the v2 CHATS sidebar
  async collapseSidebar() {
    const btn = this.page
      .getByRole("button", { name: /collapse|hide sidebar/i })
      .or(this.page.locator("[aria-label*='collapse'],[aria-label*='close sidebar']"))
      .first();
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
  }

  // Expands the v2 CHATS sidebar
  async expandSidebar() {
    const btn = this.page
      .getByRole("button", { name: /expand|show sidebar/i })
      .or(this.page.locator("[aria-label*='expand'],[aria-label*='open sidebar']"))
      .first();
    await expect(btn).toBeVisible({ timeout: 10000 });
    await btn.click();
  }

  // Returns the scrollHeight of the message input textarea (for resize checks)
  async getInputHeight() {
    return this.page.evaluate((el) => el ? el.scrollHeight : 0, await this.messageInput.elementHandle());
  }

  // Locator for the "Today" group label in the v2 CHATS sidebar
  get todayGroupLabel() {
    return this.page.getByRole("complementary").getByText(/^today$/i).first();
  }

  // Locator for the last user message bubble in the chat log
  get latestUserBubble() {
    return this.chatLog
      .locator("[class*='user'],[data-role='user'],[class*='human']")
      .last();
  }

  // Hover thread at index and assert a rename control is present (returns true/false)
  async threadHasRenameOption(index) {
    const thread = this._threadButtons().nth(index);
    await thread.hover();
    const renameBtn = this.page
      .getByRole("button", { name: /rename/i })
      .or(this.page.getByRole("menuitem", { name: /rename/i }));
    return renameBtn.isVisible({ timeout: 3000 }).catch(() => false);
  }

  // Hover thread at index and assert a delete control is present (returns true/false)
  async threadHasDeleteOption(index) {
    const thread = this._threadButtons().nth(index);
    await thread.hover();
    const deleteBtn = this.page
      .getByRole("button", { name: /delete/i })
      .or(this.page.getByRole("menuitem", { name: /delete/i }));
    return deleteBtn.isVisible({ timeout: 3000 }).catch(() => false);
  }

  // Clicks delete on thread at index and returns true if a confirmation dialog appeared
  async deleteThreadExpectConfirm(index) {
    const thread = this._threadButtons().nth(index);
    await thread.hover();
    const deleteBtn = this.page
      .getByRole("button", { name: /delete/i })
      .or(this.page.getByRole("menuitem", { name: /delete/i }));
    if (!(await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      await thread.click({ button: "right" });
    }
    await deleteBtn.first().click();
    const dialog = this.page.getByRole("dialog").or(this.page.getByRole("alertdialog"));
    const appeared = await dialog.isVisible({ timeout: 5000 }).catch(() => false);
    // dismiss without confirming so the thread is preserved
    await this.page.keyboard.press("Escape").catch(() => {});
    return appeared;
  }
}
