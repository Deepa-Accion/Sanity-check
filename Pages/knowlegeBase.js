import { expect } from "@playwright/test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { checkAndRecoverFromAppError } from "../tests/test-utils.mjs";

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Page Object for BreezeAI Dashboard
// Encapsulates actions like creating a project

/**
 * Create a new project from the BreezeAI dashboard.
 * Adjust selectors as needed to match the real UI.
 * @param {import('@playwright/test').Page} page
 * @param {string} projectName
 */


export async function uploadDocumentInKnowledgeBase(page, fileType = 'pdf') {
  // Click Knowledge Base tab
  let kbBtn = page.locator("li.relative > button[aria-label='Knowledge Base']");
  let found = await kbBtn.isVisible().catch(() => false);
  if (!found) {
    kbBtn = page.locator('button').filter({ hasText: /Knowledge\s+Base/i });
  }
  await kbBtn.click();
  await page.waitForTimeout(2000);
  
  // Click Initialize Knowledge button
  let initBtn = page.getByRole('button', { name: /initialize\s+knowledge/i }).first();
  found = await initBtn.isVisible().catch(() => false);
  if (!found) {
    initBtn = page.locator('button').filter({ hasText: /Initialize\s+Knowledge/i }).first();
  }
  await initBtn.click();
  await page.waitForTimeout(1000);
  
  // Click image for upload
  const imgBtn = page.getByRole('img').nth(1);
  found = await imgBtn.isVisible().catch(() => false);
  if (found) {
    await imgBtn.click();
  }
  
  // Set file input
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.count().catch(() => 0)) {
    const filePath = join(__dirname, '..', 'test-data', 'documents', `fileName.${fileType}`);
    await fileInput.setInputFiles(filePath);
  }
  
  await page.waitForTimeout(2000);
  
  // Select Functional Ontology
  let ontologyDiv = page.locator('div').filter({ hasText: /^Functional\s+Ontology$/i }).nth(1);
  found = await ontologyDiv.isVisible().catch(() => false);
  if (found) {
    await ontologyDiv.click();
  }
  
  // Click Start Analysis
  let analysisBtn = page.getByRole('button', { name: /Start\s+Analysis/i });
  found = await analysisBtn.isVisible().catch(() => false);
  if (found) {
    await analysisBtn.click();
  }
}

export async function uploadFirstpdfDocument(page) {
  console.log('[uploadFirstDocumentInKnowledgeBase] Navigating to functional ontology page');
  await _navigateToOntologyPage(page, 'functional');
  const filePath = `${__dirname}/../test-data/documents/ice_cream_ecommerce.pdf`;
  await _uploadFileOnOntologyPage(page, filePath);
  console.log('[uploadFirstDocumentInKnowledgeBase] Upload complete');
}

export async function netButtonClickOnObardingPage(page) {
  const nextBtn = page.getByRole('button', { name: /Next/i }).first();
}

export async function uploadFirstDocumentInKnowledgeBase(page, fileType = 'pdf') {
  console.log('[uploadFirstDocumentInKnowledgeBase] Navigating to functional ontology page');
  await _navigateToOntologyPage(page, 'functional');
  const filePath = `${__dirname}/../test-data/documents/fileName.${fileType}`;
  console.log('[uploadFirstDocumentInKnowledgeBase] Uploading:', filePath);
  await _uploadFileOnOntologyPage(page, filePath);
  console.log('[uploadFirstDocumentInKnowledgeBase] Upload complete');
}

export async function uploadFirstDocumentForProject(page, fileType = 'pdf') {
  // Delegates to the proven file-chooser approach on the functional ontology page
  await uploadFirstDocumentInKnowledgeBase(page, fileType);
}

export async function ensureOnboardingPage(page, projectId) {
  const base = (process.env.TARGET_URL || 'https://ai.accionbreeze.com/').replace(/\/$/, '');
  if (!page.url().includes('onboarding')) {
    await page.goto(`${base}/onboarding/${projectId}`);
    await expect(page).toHaveURL(/onboarding/);
  }
  await page.waitForLoadState('networkidle');
}

export async function generateFunctionalOntology(page) {
  console.log('[generateFunctionalOntology] Navigating to functional ontology page');
  await _navigateToOntologyPage(page, 'functional');
  await page.waitForTimeout(2000);

  await expect.poll(async () => {
    const generated = await page.locator('p:has-text("Generated")').first().isVisible().catch(() => false);
    if (!generated) {
      const refreshBtn = page.locator('button[aria-label*="refresh" i], button:has-text("Refresh")').first();
      await refreshBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    return generated;
  }, { timeout: 180000, intervals: [5000, 10000, 15000] }).toBe(true);
  console.log('[generateFunctionalOntology] Functional ontology confirmed as Generated');
}

export async function uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology(page, fileType = 'txt') {
  console.log('[uploadArchitecture] Navigating to architecture ontology page');
  await _navigateToOntologyPage(page, 'architecture');
  const filePath = `${__dirname}/../test-data/documents/architecture.txt`;
  console.log('[uploadArchitecture] Uploading:', filePath);
  await _uploadFileOnOntologyPage(page, filePath);
  console.log('[uploadArchitecture] Upload complete');
}

export async function uploadDocumentwithDesignOntology(page, fileType = 'pdf') {
  console.log('[uploadDesign] Navigating to design ontology page');
  await _navigateToOntologyPage(page, 'design');
  const filePath = `${__dirname}/../test-data/documents/fileName.${fileType}`;
  console.log('[uploadDesign] Uploading:', filePath);
  await _uploadFileOnOntologyPage(page, filePath);
  console.log('[uploadDesign] Upload complete');
}


// ─── Internal helpers ────────────────────────────────────────────────────────

function _extractProjectUuid(page) {
  const m = page.url().match(/(?:dashboard|ontology)\/([0-9a-f-]{30,})/i);
  return m?.[1] || null;
}

async function _navigateToOntologyPage(page, type) {
  await checkAndRecoverFromAppError(page);
  const uuid = _extractProjectUuid(page);
  if (!uuid) throw new Error(`[navigateToOntologyPage] Cannot find project UUID in URL: ${page.url()}`);
  const base = (process.env.TARGET_URL || 'https://ai.accionbreeze.com/').replace(/\/$/, '');
  const target = `${base}/ontology/${uuid}/${type}`;
  if (!page.url().includes(`/ontology/${uuid}/${type}`)) {
    await page.goto(target, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
  }
}

async function _uploadFileOnOntologyPage(page, filePath) {
  const uploadBtn = page.getByRole('button', { name: /Upload Documents/i }).first();
  await uploadBtn.waitFor({ state: 'visible', timeout: 15000 });
  await uploadBtn.click();

  // The modal is a div[role="dialog"], not a <dialog> tag — must use getByRole
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible', timeout: 20000 });

  // Use file-chooser event — direct setInputFiles on the hidden input won't
  // trigger the React state update so "Upload All" never appears
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
  const dragZone = dialog.getByText(/Drag.*drop files here/i).first();
  if (await dragZone.isVisible().catch(() => false)) {
    await dragZone.click();
  } else {
    await dialog.click();
  }
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);

  // After file is selected the "Upload All" button appears — click it
  const uploadAllBtn = page.getByRole('button', { name: /Upload All/i }).first();
  await uploadAllBtn.waitFor({ state: 'visible', timeout: 15000 });
  await uploadAllBtn.click();
  await page.waitForTimeout(3000);
}

// ─── Exported tab helper ──────────────────────────────────────────────────────

export async function selectKnowleedgeBaseTab(page, type = 'functional') {
  await _navigateToOntologyPage(page, type);
}
export async function generateFunctionalMetric(page) {
  console.log('[generateFunctionalMetric] Navigating to functional ontology page');
  await _navigateToOntologyPage(page, 'functional');
  await page.waitForTimeout(2000);

  // Wait for at least one document to show "Generated" status (up to 3 min)
  console.log('[generateFunctionalMetric] Waiting for document to reach Generated status...');
  await expect.poll(async () => {
    const generated = await page.locator('p:has-text("Generated")').first().isVisible().catch(() => false);
    if (!generated) {
      // Click Refresh if available to check latest status
      const refreshBtn = page.locator('button[aria-label*="refresh" i], button:has-text("Refresh")').first();
      await refreshBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    return generated;
  }, { timeout: 180000, intervals: [5000, 10000, 15000] }).toBe(true);
  console.log('[generateFunctionalMetric] Functional metrics confirmed as Generated');
}

export async function generateArchitectureOntology(page) {
  console.log('[generateArchitectureOntology] Navigating to architecture ontology page');
  await _navigateToOntologyPage(page, 'architecture');
  await page.waitForTimeout(2000);

  // Click any "Generate" buttons for documents not yet generated
  const generateBtns = page.getByRole('button', { name: /^Generate$/i });
  const count = await generateBtns.count();
  if (count > 0) {
    console.log(`[generateArchitectureOntology] Clicking ${count} Generate button(s)`);
    for (let i = 0; i < count; i++) {
      await generateBtns.nth(i).click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // Wait for at least one document to show "Generated" status (up to 3 min)
  console.log('[generateArchitectureOntology] Waiting for document to reach Generated status...');
  await expect.poll(async () => {
    const generated = await page.locator('p:has-text("Generated")').first().isVisible().catch(() => false);
    if (!generated) {
      const refreshBtn = page.locator('button:has-text("Refresh")').first();
      await refreshBtn.click().catch(() => {});
      await page.waitForTimeout(2000);
    }
    return generated;
  }, { timeout: 180000, intervals: [5000, 10000, 15000] }).toBe(true);
  console.log('[generateArchitectureOntology] Architecture ontology confirmed as Generated');
}

export async function connectRepoInKnowledgeBase(page, gitURL) {
  await page.locator("li.relative > button[aria-label='Knowledge Base']").click();
  await page.waitForTimeout(2000);
  
}

export async function uploadDocumentInAIChat(page, fileType = 'pdf', projectId) {
  await page.goto(`${process.env.TARGET_URL || "https://ai.accionbreeze.com/"}chat/requirement_agent/${projectId}`);
  const filePath = join(__dirname, '..', 'test-data', 'documents', `fileName.${fileType}`);
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
}

// ─── Document-row ontology generation (current Sources panel) ─────────────────
// Flow verified on Dev: row "Generate" -> "Impact agent" dialog -> pick ontologies,
// optionally "Skip approval" -> "Generate (N)" -> row goes In Progress -> Merged.
// NOTE: a status of "Not Generated" also contains the word "Generated", so never
// match on that substring - assert on "Merged" instead.

export function documentRow(page, fileName) {
  return page
    .locator('div')
    .filter({ has: page.getByRole('checkbox', { name: `Select ${fileName}`, exact: true }) })
    .filter({ hasText: /Created/ }) // the full card (status + actions), not just the checkbox wrapper
    .last();
}

/**
 * Generate the given ontologies for an uploaded document and wait until it is merged.
 * Approval is skipped so the run needs no manual review step.
 * @param {string} fileName       document as listed in Sources (e.g. "fileName.txt")
 * @param {string[]} ontologies   any of "Functional" | "Design" | "Architecture" | "Code"
 * @returns {Promise<'Merged'|'Ready for review'>} the final state of the document row
 */
export async function generateOntologiesForDocument(page, fileName, ontologies = ['Functional'], { timeout = 300000, skipApproval = true } = {}) {
  const row = documentRow(page, fileName);
  await expect(row, `Document "${fileName}" should be listed in Sources`).toBeVisible({ timeout: 30000 });
  await row.getByRole('button', { name: 'Generate', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Select ontologies to analyze/i)).toBeVisible();

  // Only Functional is pre-selected. Selecting Design also includes Functional.
  const wanted = new Set(ontologies);
  const clickCard = (name) => dialog.getByText(name, { exact: true }).first().click();
  for (const name of ['Design', 'Architecture', 'Code']) {
    if (wanted.has(name)) await clickCard(name);
  }
  if (!wanted.has('Functional') && !wanted.has('Design')) await clickCard('Functional');

  const skipSwitch = dialog.getByRole('switch');
  if (((await skipSwitch.getAttribute('aria-checked')) === 'true') !== skipApproval) await skipSwitch.click();
  await expect(skipSwitch).toHaveAttribute('aria-checked', String(skipApproval));

  await dialog.getByRole('button', { name: /^Generate \(\d+\)$/ }).click();
  await expect(dialog).toBeHidden({ timeout: 15000 });

  // "Skip approval" is not always honored (Design has been seen ending in "Ready for review"),
  // so accept either end state and report which one occurred.
  const currentRow = () => documentRow(page, fileName);
  await expect(
    currentRow(),
    `"${fileName}" did not reach "Merged" or "Ready for review" for ${ontologies.join(', ')} within ${timeout / 1000}s`
  ).toContainText(/Merged|Ready for review/, { timeout });
  return /Merged/.test(await currentRow().innerText()) ? 'Merged' : 'Ready for review';
}

/** Read the node count shown in a graph column header, e.g. "PERSONA 2" -> 2. */
export async function getGraphColumnCount(page, columnLabel) {
  // Headers are upper-cased by CSS, so match case-insensitively on the DOM text.
  const header = page.locator('div').filter({ hasText: new RegExp(`^\\s*${columnLabel}\\s*\\d+`, 'i') }).last();
  await expect(header, `Column header "${columnLabel}" should be visible`).toBeVisible({ timeout: 15000 });
  const text = await header.innerText();
  return Number(text.match(/\d+/)?.[0] ?? 0);
}


// ─── Review flow (Ready for review -> Review -> Improve / Reject / Approve) ───

/** Open the review panel of a document that is "Ready for review". */
export async function openDocumentReview(page, fileName) {
  await documentRow(page, fileName).getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByText(`Review: ${fileName}`)).toBeVisible({ timeout: 30000 });
  for (const name of ['Reject', 'Improve', 'Approve']) {
    await expect(page.getByRole('button', { name, exact: true }), `"${name}" in the review panel`).toBeVisible();
  }
}

/**
 * Improve: shows the chat agent. Sending feedback must be accepted by the agents service, the agent
 * must finish revising ("Agent is revising the draft..." disappears) and its reply must reference
 * the request (the instruction text appears in the thread more than once: user message + reply).
 * @param {string} keyword a distinctive word from the instruction that the agent's reply should echo
 */
export async function improveDraft(page, instruction, keyword, { timeout = 180000 } = {}) {
  await page.getByRole('button', { name: 'Improve', exact: true }).click();
  await expect(page.getByText('Improve this draft')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Regenerate' })).toBeVisible();
  const feedback = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/feedback$/.test(new URL(r.url()).pathname),
    { timeout: 30000 }
  );
  const box = page.getByPlaceholder('Describe what to change…');
  await box.fill(instruction);
  await box.press('Enter');
  expect((await feedback).status(), 'Improve feedback should be accepted by the agent').toBe(200);

  await expect(page.getByText('Agent is revising the draft'), 'Agent should finish revising').toBeHidden({ timeout });
  await expect
    .poll(() => page.getByText(new RegExp(keyword, 'i')).count(), {
      message: `Agent reply should reference "${keyword}" (user message + reply = at least 2 mentions)`,
      timeout: 60000,
    })
    .toBeGreaterThanOrEqual(2);
}

/** Approve: the run is applied to the graph and the document moves Merging -> Merged. */
export async function approveDraft(page, fileName, { timeout = 180000 } = {}) {
  const approved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/approve$/.test(new URL(r.url()).pathname),
    { timeout: 30000 }
  );
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  expect((await approved).status(), 'Approve should return 200').toBe(200);
  await expect(documentRow(page, fileName), `"${fileName}" did not reach "Merged" after approval`).toContainText(/Merged/, { timeout });
}

/**
 * Reject: no confirmation dialog; the run is rejected and the graph is left unchanged.
 * While the agent is still working on an Improve revision the backend answers 409 (conflict),
 * so retry until it settles, then require a 200.
 */
export async function rejectDraft(page, fileName, { timeout = 180000 } = {}) {
  const deadline = Date.now() + timeout;
  let status = 0;
  while (Date.now() < deadline) {
    const rejected = page.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/reject$/.test(new URL(r.url()).pathname),
      { timeout: 30000 }
    );
    await page.getByRole('button', { name: 'Reject', exact: true }).click();
    status = (await rejected).status();
    if (status !== 409) break;
    await page.waitForTimeout(5000); // revision still running - try again
  }
  expect(status, 'Reject should return 200 (409 means the agent was still busy for the whole wait)').toBe(200);
  await expect(documentRow(page, fileName)).toContainText(/Rejected/, { timeout: 30000 });
  await expect(documentRow(page, fileName).getByRole('button', { name: 'View summary' })).toBeVisible();
}

/** Upload a file the app must refuse (unsupported type) and return the message shown. */
export async function uploadUnsupportedFile(page, { name, mimeType, buffer }) {
  await page.getByRole('button', { name: /Upload Documents/i }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const chooserPromise = page.waitForEvent('filechooser', { timeout: 15000 });
  await dialog.getByText(/Drag.*drop files here/i).first().click();
  await (await chooserPromise).setFiles({ name, mimeType, buffer });
  const message = page.getByText(/files are supported\./i).first();
  await expect(message, `"${name}" should be rejected with a supported-types message`).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: /Upload All/i }), 'Nothing should be queued for upload').toBeHidden();
  const text = (await message.innerText()).trim();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  return text;
}
