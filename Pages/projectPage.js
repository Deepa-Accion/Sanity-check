import { expect } from "@playwright/test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { checkAndRecoverFromAppError } from "../tests/test-utils.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function openAllCards(page, projectId = null) {
  await knowlegeGraphGeneration(page);
  await projectHome(page, projectId);
  await knowledgeGraphVisualization(page);
  await projectHome(page, projectId);
  await architectureModeling(page);
  await projectHome(page, projectId);
  await exploreSemanticModel(page);
  await projectHome(page, projectId);
  await codeOntology(page);
  await projectHome(page, projectId);
  await userStory(page);
  await projectHome(page, projectId);
  await aiChatAssistant(page);
  await projectHome(page, projectId);
  await designGeneration(page);
}

async function openCard(page, patterns, label) {
  await page.waitForLoadState("domcontentloaded");
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);

  const locators = [];
  for (const pattern of patterns) {
    locators.push(page.getByRole("button", { name: pattern }).first());
    locators.push(page.getByRole("heading", { name: pattern }).first());
    locators.push(page.locator("button, [role='button'], h2, h3, h4, div").filter({ hasText: pattern }).first());
  }

  let target = null;
  for (const locator of locators) {
    const visible = await locator.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      target = locator;
      break;
    }
  }

  if (!target) {
    console.warn(`[projectPage] ${label} card not found, skipping`);
    return false;
  }

  await expect(target).toBeVisible({ timeout: 10000 });
  await target.click();
  await page.waitForTimeout(2000);
  return true;
}

export async function projectHome(page, projectId = null) {
  await page.goto(`${process.env.TARGET_URL || "https://ai.accionbreeze.com/"}dashboard/${projectId}`);
  await checkAndRecoverFromAppError(page);
}

async function openArtifactsMenu(page, projectId = null) {
  const { menuArtifactsButton, searchArtifactsButton } = artifactLocators(page);

  await menuArtifactsButton.click();

  if (projectId) {
    const expectedUrl = `${process.env.TARGET_URL || "https://ai.accionbreeze.com/"}knowledge/${projectId}`;
    await expect(page).toHaveURL(new RegExp(`^${expectedUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:/)?$`));
  }

  await expect(searchArtifactsButton).toBeVisible({ timeout: 30000 });
  await searchArtifactsButton.click();
}

function artifactLocators(page) {
  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
  const generateFunctionalDialog = page.getByRole("dialog", { name: "Generate Functional" });

  return {
    menuArtifactsButton: primaryNavigation.getByRole("button", { name: "Artifacts", exact: true }),
    downloadDocumentationBtn: page.getByRole("button", { name: "Functional Documentation", exact: true }),
    searchArtifactsButton: page.getByRole('textbox', { name: 'Search artifacts...', exact: true }),
    generateFunctionalDialog: page.getByRole("dialog", { name: "Generate Functional" }),
    dwnldArtifactPlainHtmlBtn: generateFunctionalDialog.getByRole("button", {
      name: /Plain HTML Interactive single/i,
    }).first(),
    dwnldArtifactPlainMarkdownBtn: generateFunctionalDialog.getByRole("button", {
      name: /Plain Markdown/i,
    }).first(),
    viewButton: page.getByRole("button", { name: "View", exact: true }).first(),
    openHtmlInNewTabButton: page.getByRole("button", {
      name: "Open",
      description: "Open HTML in new tab",
    }).first(),
    secondOpenButton: page.getByRole("button", { name: "Open" }).nth(1),
    htmlArtifactContent: page.locator("div").filter({ hasText: "htmlOpenCopy1<!DOCTYPE html>" }).nth(5),
    htmlArtifactExitOverlay: page.locator(".fixed.inset-0.bg-black\\/20"),

    artifactPreviewDialog: page.locator(".fixed.right-0.top-0").last(),
    copyButton: page.getByRole("button", { name: "Copy" }).first(),
    secondaryCopyButton: page.locator("button:nth-child(3)"),
    artifactsHeading: page.getByRole("heading", { name: "Artifacts", exact: true }),
    refreshArtifactsButton: page.getByRole("button", { name: "Refresh artifacts", exact: true }),
    artifactsTable: page.getByRole("table"),
    
    readyText: page.getByText("Ready", { exact: true })
  };
}

export async function downloadArtifactPlainHtml(page, projectId) {
  await projectHome(page, projectId);

  const {
    downloadDocumentationBtn,
    generateFunctionalDialog,
    dwnldArtifactPlainHtmlBtn,
    readyText,
  } = artifactLocators(page);
  await openArtifactsMenu(page, projectId);
  await expect(downloadDocumentationBtn).toBeVisible({ timeout: 30000 });
  await expect(downloadDocumentationBtn).toBeEnabled({ timeout: 30000 });
  await downloadDocumentationBtn.click();

  await expect(generateFunctionalDialog).toBeVisible({ timeout: 30000 });
  await expect(dwnldArtifactPlainHtmlBtn).toBeVisible({ timeout: 30000 });
  await expect(dwnldArtifactPlainHtmlBtn).toBeEnabled({ timeout: 30000 });
  await dwnldArtifactPlainHtmlBtn.click();
  await expect(readyText).toBeVisible({ timeout: 15000 });
}

export async function validateDownloadedPlainHtml(page, projectName) {
  const { viewButton, htmlArtifactContent, htmlArtifactExitOverlay } = artifactLocators(page);
  const expectedTitle = `Functional Specification - ${projectName}`;

  await viewButton.click();
  await expect(htmlArtifactContent).toBeVisible({ timeout: 15000 });
  await expect(htmlArtifactContent).toContainText(expectedTitle);
  await htmlArtifactExitOverlay.click({ position: { x: 20, y: 20 }, force: true });
  await expect(htmlArtifactExitOverlay).toBeHidden({ timeout: 15000 });
}

export async function validateDownloadedPlainMarkdown(page, projectName) {
  const { viewButton, artifactPreviewDialog, htmlArtifactExitOverlay } = artifactLocators(page);
  const expectedTitle = `${projectName}`;

  await viewButton.click();
  await expect(artifactPreviewDialog).toBeVisible({ timeout: 15000 });
  await expect(artifactPreviewDialog).toContainText(expectedTitle);
  await htmlArtifactExitOverlay.click({ position: { x: 20, y: 20 }, force: true });
  await expect(htmlArtifactExitOverlay).toBeHidden({ timeout: 15000 });
}

export async function validatePlainHtmlInNewWindow(page, projectId, projectName) {
  const { viewButton, openHtmlInNewTabButton, secondOpenButton, htmlArtifactContent } = artifactLocators(page);

  await viewButton.click();
  await expect(htmlArtifactContent).toBeVisible({ timeout: 15000 });

  const openButtons = [openHtmlInNewTabButton, secondOpenButton].filter(Boolean);

  for (const candidateButton of openButtons) {
    const buttonVisible = await candidateButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (!buttonVisible) continue;

    const popupPromise = page.waitForEvent("popup");
    await candidateButton.click();

    let popup;
    try {
      popup = await Promise.race([
        popupPromise,
        page.waitForEvent("page", { timeout: 3000 })
      ]);
    } catch {
      continue;
    }

    if (!popup) continue;

    await expect(popup).toHaveURL(/^blob:https:\/\/ai\.accionbreeze\.com\/[0-9a-f-]+$/);
    await expect(popup.locator("h1").filter({ hasText: projectName }).first()).toBeVisible();

    await popup.waitForTimeout(2000);
    await popup.close();
  }
}

export async function validatePlainMarkdownInNewWindow(page, projectId, projectName) {
  const { viewButton, artifactPreviewDialog, secondOpenButton, htmlArtifactExitOverlay } = artifactLocators(page);

  await viewButton.click();
  await expect(artifactPreviewDialog).toBeVisible({ timeout: 15000 });
  await expect(artifactPreviewDialog).not.toBeEmpty();

  const openButtons = [secondOpenButton].filter(Boolean);
  for (const candidateButton of openButtons) {
    const buttonVisible = await candidateButton.isVisible({ timeout: 5000 }).catch(() => false);
    if (!buttonVisible) continue;

    const popupPromise = page.waitForEvent("popup");
    await candidateButton.click();
    const popup = await popupPromise;

    await expect(popup).toHaveURL(/^blob:https:\/\/ai\.accionbreeze\.com\/[0-9a-f-]+$/);
    await expect(popup.locator("h1").filter({ hasText: projectName }).first()).toBeVisible();

    await popup.waitForTimeout(2000);
    await popup.close();
  }
}

export async function reviewArtifactsPage(page, projectId) {
  await projectHome(page, projectId);
  const { artifactsHeading, refreshArtifactsButton } = artifactLocators(page);

  await openArtifactsMenu(page, projectId);
  await expect(artifactsHeading).toBeVisible();
  await expect(refreshArtifactsButton).toBeVisible();
  await expect(page.getByRole("button", { name: /Functional Documentation/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gherkin", exact: true })).toBeVisible();

}

export async function validateCopyPlainHtmlContent(page, projectName, projectId = null) {
  const { viewButton, copyButton, secondaryCopyButton, htmlArtifactExitOverlay } = artifactLocators(page);
  const targetOrigin = (process.env.TARGET_URL || "https://ai.accionbreeze.com/").replace(/\/$/, "");

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: targetOrigin,
  });

  const viewVisible = await viewButton.isVisible({ timeout: 5000 }).catch(() => false);
  if (!viewVisible) {
    await downloadArtifactPlainHtml(page, projectId);
  }

  await viewButton.click();

  const copyButtons = [copyButton, secondaryCopyButton];

  for (const candidateButton of copyButtons) {
    await expect(candidateButton).toBeVisible({ timeout: 15000 });
    await candidateButton.click();

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("<!DOCTYPE html>");
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(projectName);
  }

  await htmlArtifactExitOverlay.click({ position: { x: 20, y: 20 }, force: true });
}

export async function downloadArtifactPlainMarkdown(page, projectId) {
  await projectHome(page, projectId);

  const {
    downloadDocumentationBtn,
    generateFunctionalDialog,
    dwnldArtifactPlainMarkdownBtn,
    readyText,
  } = artifactLocators(page);
  await openArtifactsMenu(page, projectId);
  await expect(downloadDocumentationBtn).toBeVisible({ timeout: 30000 });
  await expect(downloadDocumentationBtn).toBeEnabled({ timeout: 30000 });
  await downloadDocumentationBtn.click();

  await expect(generateFunctionalDialog).toBeVisible({ timeout: 30000 });
  await expect(dwnldArtifactPlainMarkdownBtn).toBeVisible({ timeout: 30000 });
  await expect(dwnldArtifactPlainMarkdownBtn).toBeEnabled({ timeout: 30000 });
  await dwnldArtifactPlainMarkdownBtn.click();
  await expect(readyText).toBeVisible({ timeout: 15000 });
}

export async function knowlegeGraphGeneration(page) {
  await openCard(
    page,
    [/Generate\s+Functional\s+Model/i, /Functional\s+Personas/i, /Functional\s+Ontology/i],
    "Functional generation"
  );
}

export async function knowledgeGraphVisualization(page) {
  await openCard(
    page,
    [/Knowledge\s+Graph/i, /Interactive\s+Neo4j\s+visualization/i],
    "Knowledge graph visualization"
  );
}

export async function aiChatAssistant(page) {
  await openCard(page, [/AI\s+Chat\s+Assistant/i], "AI chat assistant");
}

export async function designGeneration(page) {
  await openCard(
    page,
    [/Mockups/i, /Design\s+UX\/UI\s+patterns/i, /Design\s+Generation/i],
    "Design generation"
  );
}

export async function architectureModeling(page) {
  await openCard(
    page,
    [/Architecture\s+Modeler/i, /Architecture\s+Services/i, /Architecture\s+Modeling/i],
    "Architecture modeling"
  );
}

export async function exploreSemanticModel(page) {
  await openCard(
    page,
    [/Semantic\s+Model/i, /Explore\s+Semantic\s+Model/i, /Explore\s+Analyze/i],
    "Semantic model"
  );
}

export async function codeOntology(page) {
  await openCard(
    page,
    [/Code\s+Insights/i, /Codebase\s+analysis/i, /Code\s+Ontology/i],
    "Code ontology"
  );
}

export async function userStory(page) {
  await openCard(
    page,
    [/Tickets/i, /Gherkin/i, /Functional\s+Documentation/i, /User\s+Story/i],
    "User story"
  );
}

// ---------------------------------------------------------------------------
// AI Chat Assistant interaction helpers (AG-7)
//
// The existing `aiChatAssistant` above only OPENS the chat panel. These helpers
// extend that to actually send a query and read back the assistant's response
// so regression tests can assert on the content. Selectors use the same
// multi-fallback style as the rest of this repo — adjust the concrete
// selectors if the live chat DOM differs.
// ---------------------------------------------------------------------------

// Broad selector for the assistant's rendered reply bubbles. Kept permissive
// because the chat DOM is not statically known; the last match is treated as
// the most recent assistant response.
const ASSISTANT_MESSAGE_SELECTOR =
  '[data-role="assistant"], [data-message-role="assistant"], [class*="assistant" i], ' +
  '[class*="bot" i], [class*="response" i], [class*="message" i]';

function chatInputLocator(page) {
  return page
    .locator(
      'textarea[placeholder*="ask" i], textarea[placeholder*="message" i], textarea[placeholder*="type" i], ' +
        'input[placeholder*="ask" i], input[placeholder*="message" i], input[placeholder*="type" i], ' +
        'textarea, [contenteditable="true"]'
    )
    .first();
}

/**
 * Type a query into the AI Chat Assistant input and submit it. Assumes the chat
 * panel is already open (call {@link aiChatAssistant} first).
 * @param {import('@playwright/test').Page} page
 * @param {string} query
 */
export async function sendChatQuery(page, query) {
  await page.waitForLoadState("domcontentloaded");

  const input = chatInputLocator(page);
  await expect(input).toBeVisible({ timeout: 15000 });
  await input.click();
  await input.fill(query);

  // Prefer an explicit Send/Submit control; fall back to pressing Enter.
  const sendBtn = page.getByRole("button", { name: /send|submit|ask/i }).first();
  const sendVisible = await sendBtn.isVisible({ timeout: 3000 }).catch(() => false);
  if (sendVisible) {
    await sendBtn.click();
  } else {
    await input.press("Enter");
  }

  console.log(`[projectPage] Sent chat query: ${query}`);
}

/**
 * Wait for the AI Chat Assistant to finish responding and return the text of
 * the latest assistant reply. Handles AI latency and token streaming by polling
 * until the last response's text stops changing (stable for two polls).
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number, minResponses?: number }} [opts]
 * @returns {Promise<string>} the final assistant response text
 */
export async function waitForChatResponse(page, { timeout = 120000, minResponses = 1 } = {}) {
  const responses = page.locator(ASSISTANT_MESSAGE_SELECTOR);

  // 1. Wait until at least one assistant reply is rendered.
  await expect
    .poll(async () => await responses.count().catch(() => 0), {
      timeout,
      intervals: [1000, 2000, 3000],
    })
    .toBeGreaterThanOrEqual(minResponses);

  // 2. Wait for streaming to settle: the last reply's text must be non-empty
  //    and unchanged across two consecutive polls.
  const last = responses.last();
  let prev = "";
  let stable = 0;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline && stable < 2) {
    await page.waitForTimeout(2000);
    const text = (await last.innerText().catch(() => "")).trim();
    if (text && text === prev) {
      stable += 1;
    } else {
      stable = 0;
    }
    prev = text;
  }

  console.log(`[projectPage] Chat response (${prev.length} chars): ${prev.slice(0, 200)}`);
  return prev;
}

/**
 * Open the New Ontology dialog and connect a GitLab repository by URL.
 * Handles public repos (no PAT) and private repos (PAT required).
 *
 * BREEZEAI-866 — GitLab repository support
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} projectId
 * @param {{ repoUrl: string, name: string, isPrivate?: boolean, pat?: string }} opts
 * @returns {Promise<{ success: boolean, name: string }>}
 */
export async function connectGitLabRepo(page, projectId, { repoUrl, name, isPrivate = false, pat = "" }) {
  const baseUrl = process.env.TARGET_URL || "https://ai.accionbreeze.com/";

  console.log(`[connectGitLabRepo] Navigating to /code-ontology/${projectId}`);
  await page.goto(`${baseUrl}code-ontology/${projectId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  const newBtn = page.locator("button").filter({ hasText: /New\s+Ontology/i }).first();
  await expect(newBtn).toBeVisible({ timeout: 15000 });
  await newBtn.click();
  await page.waitForTimeout(2000);

  // Switch to the GitLab / URL tab if one exists
  const gitlabTab = page.locator("button, [role='tab'], label").filter({ hasText: /^GitLab$/i }).first();
  const urlTab = page.locator("button, [role='tab']").filter({ hasText: /Repository\s*URL|Git\s*URL/i }).first();

  const gitlabVisible = await gitlabTab.isVisible({ timeout: 3000 }).catch(() => false);
  const urlTabVisible = await urlTab.isVisible({ timeout: 3000 }).catch(() => false);

  if (gitlabVisible) {
    await gitlabTab.click();
    await page.waitForTimeout(1000);
  } else if (urlTabVisible) {
    await urlTab.click();
    await page.waitForTimeout(1000);
  }

  // Fill in the ontology / repo name
  const nameInput = page
    .locator('input[placeholder*="Backend API" i], input[placeholder*="ontology name" i], input[placeholder*="name" i]')
    .first();
  const nameVisible = await nameInput.isVisible({ timeout: 5000 }).catch(() => false);
  if (nameVisible) {
    await nameInput.fill(name);
    console.log(`[connectGitLabRepo] Set name: "${name}"`);
  }

  // Fill in the repo URL
  const urlInput = page
    .locator(
      'input[placeholder*="gitlab" i], input[placeholder*="repo url" i], ' +
      'input[placeholder*="repository url" i], input[placeholder*="clone url" i], ' +
      'input[placeholder*="git url" i], input[placeholder*="url" i]'
    )
    .first();
  await expect(urlInput).toBeVisible({ timeout: 8000 });
  await urlInput.fill(repoUrl);
  console.log(`[connectGitLabRepo] Entered repo URL: ${repoUrl}`);

  // Fill in PAT for private repos
  if (isPrivate && pat) {
    const patInput = page
      .locator('input[placeholder*="token" i], input[placeholder*="PAT" i], input[placeholder*="access token" i], input[type="password"]')
      .first();
    const patVisible = await patInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (patVisible) {
      await patInput.fill(pat);
      console.log("[connectGitLabRepo] PAT entered for private repo");
    } else {
      console.warn("[connectGitLabRepo] PAT input not found — UI may not require it yet");
    }
  }

  // Submit the dialog
  const saveBtn = page
    .locator("button")
    .filter({ hasText: /^Save$|^Connect$|^Submit$|^Add Repository$/i })
    .first();
  await expect(saveBtn).toBeVisible({ timeout: 5000 });
  await saveBtn.click();
  console.log("[connectGitLabRepo] Submitted — waiting for repo entry...");
  await page.waitForTimeout(5000);

  // Confirm the entry appeared in the list
  const entry = page.locator("div, li, tr").filter({ hasText: name }).first();
  const success = await entry.isVisible({ timeout: 20000 }).catch(() => false);

  console.log(`[connectGitLabRepo] Entry "${name}" visible: ${success}`);
  return { success, name };
}

/**
 * Poll the code ontology list until the named entry's row text contains
 * one of the accepted status strings, then return the matched status.
 * Reloads the page between polls to get fresh state from the backend.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} entryName
 * @param {{ acceptedStatuses?: string[], timeout?: number }} opts
 * @returns {Promise<string|null>} matched status, or null on timeout
 */
export async function waitForOntologyStatus(page, entryName, { acceptedStatuses = [], timeout = 60000 } = {}) {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const row = page.locator("div, li, tr").filter({ hasText: entryName }).first();
    const rowVisible = await row.isVisible({ timeout: 2000 }).catch(() => false);

    if (rowVisible) {
      const rowText = await row.innerText().catch(() => "");
      for (const status of acceptedStatuses) {
        if (rowText.toLowerCase().includes(status.toLowerCase())) {
          console.log(`[waitForOntologyStatus] "${entryName}" → status: ${status}`);
          return status;
        }
      }
      console.log(`[waitForOntologyStatus] Current row text: ${rowText.slice(0, 120)} — polling...`);
    }

    await page.waitForTimeout(4000);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2000);
  }

  console.warn(`[waitForOntologyStatus] Timed out after ${timeout}ms for "${entryName}"`);
  return null;
}

/**
 * Navigate to the Code Ontology page for a project, create a new ontology entry
 * by uploading a pre-generated ndjson.gz dependency-tree file, then trigger
 * generation and wait for the entry to appear in the list.
 *
 * Prerequisites: generate the ndjson.gz once with:
 *   uvx --from git+https://github.com/accionlabs/breezeai-cog breezeai-cog \
 *     repo-to-json-tree --capture-statements --repo <repo-path> --out documents/
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} projectId
 * @param {string} ontologyName  Display name for the new ontology
 * @param {string} [fileName]    Filename inside the documents/ folder (default: sanity-check-repo.ndjson.gz)
 */
export async function uploadAndGenerateCodeOntology(page, projectId, ontologyName, fileName = 'sanity-check-repo.ndjson.gz') {
  const baseUrl = process.env.TARGET_URL || 'https://ai.accionbreeze.com/';
  const filePath = join(__dirname, '..', 'documents', fileName);

  console.log(`[codeOntology] Navigating to /code-ontology/${projectId}`);
  await page.goto(`${baseUrl}code-ontology/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Open the create dialog
  const newBtn = page.locator('button').filter({ hasText: /New\s+Ontology/i }).first();
  await expect(newBtn).toBeVisible({ timeout: 15000 });
  await newBtn.click();
  await page.waitForTimeout(2000);
  console.log('[codeOntology] Opened New Ontology dialog');

  // Fill in the ontology name
  const nameInput = page.locator('input[placeholder*="Backend API" i]').first();
  await expect(nameInput).toBeVisible({ timeout: 8000 });
  await nameInput.fill(ontologyName);
  console.log(`[codeOntology] Set name: "${ontologyName}"`);

  // Upload the ndjson.gz — the file input accepts .json and .gz
  const fileInput = page.locator('#json-upload, input[accept*=".gz"]').first();
  console.log(`[codeOntology] Uploading: ${filePath}`);
  await fileInput.setInputFiles(filePath);
  await page.waitForTimeout(2000);

  // Click Save to submit
  const saveBtn = page.locator('button').filter({ hasText: /^Save$/i }).first();
  await expect(saveBtn).toBeVisible({ timeout: 5000 });
  await saveBtn.click();
  console.log('[codeOntology] Clicked Save — waiting for entry to appear...');
  await page.waitForTimeout(5000);

  // Confirm the ontology entry appeared in the list
  const ontologyEntry = page.locator('div, li, tr').filter({ hasText: ontologyName }).first();
  const appeared = await ontologyEntry.isVisible({ timeout: 30000 }).catch(() => false);
  if (appeared) {
    console.log(`[codeOntology] Ontology "${ontologyName}" created successfully`);
  } else {
    console.log('[codeOntology] Ontology entry not visible yet — may still be processing');
  }

  // Click Generate if a Generate button is present next to the entry
  const generateBtn = page.locator('button').filter({ hasText: /^Generate$/i }).first();
  const genVisible = await generateBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (genVisible) {
    console.log('[codeOntology] Clicking Generate...');
    await generateBtn.click();
    await page.waitForTimeout(10000);
    console.log('[codeOntology] Generation triggered — processing in background');
  } else {
    console.log('[codeOntology] No Generate button found — upload may be sufficient');
  }
}
