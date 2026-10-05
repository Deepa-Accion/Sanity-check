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
  const generateButton = page.getByRole('button', { name: /^Generate$/i }).first();
  const generatedStatus = page.getByText(/^Generated$/).first();

  if (!(await generatedStatus.isVisible().catch(() => false))) {
    await generateButton.waitFor({ state: 'visible', timeout: 15000 });
    await expect(generateButton).toBeEnabled();
    await generateButton.click({ timeout: 10000 });
  }

  await expect.poll(async () => {
    const generated = await generatedStatus.isVisible().catch(() => false);
    if (!generated) {
      const refreshBtn = page.locator('button[aria-label*="refresh" i], button:has-text("Refresh")').first();
      await refreshBtn.click().catch(() => {});
    }
    return generated;
  }, { timeout: 180000, intervals: [5000, 10000, 15000] }).toBe(true);
  
  const reviewButton = page.getByRole('button', { name: /^Review$/i }).first();

  if (await reviewButton.isVisible()) {
    await reviewButton.click({ timeout: 5000 });
  }
  const approveButton = page.getByRole('button', {
  name: 'Approve',
  });
  await expect(approveButton).toBeVisible();
  await approveButton.click({ timeout: 5000 });
  await expect(
  page.getByText('Changes approved', { exact: true })).toBeVisible({ timeout: 5000 });
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
  const m = page.url().match(/(?:dashboard|ontology|onboarding)\/([0-9a-f-]{30,})/i);
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
    await page.getByText('Upload Documents', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    console.log("[_navigateToOntologyPage] landed on functional ontology page");
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
  await page.getByText('uploaded successfully').waitFor({ state: 'visible', timeout: 10000 });
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
