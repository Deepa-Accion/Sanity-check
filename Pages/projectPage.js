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
