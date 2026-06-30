import { expect } from "@playwright/test";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

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
    const filePath = join(__dirname, '..', 'documents', `fileName.${fileType}`);
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

export async function uploadFirstDocumentInKnowledgeBase (page, fileType = 'pdf') {
  console.log('[uploadFirstDocumentInKnowledgeBase] Starting document upload process');
  await selectKnowleedgeBaseTab(page);
  await page.waitForTimeout(3000);
  
  // Check if we're in the Setup Wizard
  const startWizardBtn = page.locator('button').filter({ hasText: /Start Setup Wizard/i }).first();
  const wizardVisible = await startWizardBtn.isVisible().catch(() => false);
  if (wizardVisible) {
    console.log('[uploadFirstDocumentInKnowledgeBase] Setup Wizard detected - clicking Start Setup Wizard');
    await startWizardBtn.click();
    await page.waitForTimeout(3000);
  }
  
  // Click Initialize Knowledge button or look for Upload Documents option
  let initBtn = page.getByRole('button', { name: /initialize\s+knowledge/i }).first();
  let found = await initBtn.isVisible({ timeout: 10000 }).catch(() => false);
  if (!found) {
    initBtn = page.locator('button').filter({ hasText: /Initialize\s+Knowledge/i }).first();
    found = await initBtn.isVisible({ timeout: 10000 }).catch(() => false);
  }
  if (!found) {
    // Try to find Upload Documents button in wizard
    initBtn = page.locator('button, div').filter({ hasText: /Upload Documents/i }).first();
    found = await initBtn.isVisible({ timeout: 10000 }).catch(() => false);
  }
  if (found) {
    console.log('[uploadFirstDocumentInKnowledgeBase] Clicking Initialize/Upload button');
    await initBtn.click();
  } else {
    console.log('[uploadFirstDocumentInKnowledgeBase] Initialize/Upload button not found!');
  }
  await page.waitForTimeout(8000);
  
  // Set file input - wait for it to appear
  const fileInput = page.locator('input[type="file"]').first();
  let inputFound = await fileInput.isVisible({ timeout: 5000 }).catch(() => false);
  if (!inputFound) {
    inputFound = await fileInput.count().catch(() => 0) > 0;
  }
  if (inputFound) {
    const filePath = `${__dirname}/../documents/fileName.${fileType}`;
    console.log('[uploadFirstDocumentInKnowledgeBase] Setting file input:', filePath);
    try {
      await fileInput.setInputFiles(filePath);
      console.log('[uploadFirstDocumentInKnowledgeBase] File input set successfully');
    } catch (e) {
      console.error('[uploadFirstDocumentInKnowledgeBase] Error setting file input:', e.message);
    }
    // Wait for file to be processed
    await page.waitForTimeout(3000);
  } else {
    console.log('[uploadFirstDocumentInKnowledgeBase] File input not found!');
  }

  await page.waitForTimeout(2000);
  
  // Select Functional Ontology - try multiple selectors
  let ontologyDiv = page.locator('div').filter({ hasText: /^Functional\s+Ontology$/i }).nth(1);
  let found2 = await ontologyDiv.isVisible({ timeout: 8000 }).catch(() => false);
  if (!found2) {
    ontologyDiv = page.locator('div').filter({ hasText: /Functional\s+Ontology/i }).first();
    found2 = await ontologyDiv.isVisible({ timeout: 8000 }).catch(() => false);
  }
  if (!found2) {
    // Try radio button or label for Functional ontology
    ontologyDiv = page.locator('label, span').filter({ hasText: /Functional/i }).first();
    found2 = await ontologyDiv.isVisible({ timeout: 5000 }).catch(() => false);
  }
  if (found2) {
    console.log('[uploadFirstDocumentInKnowledgeBase] Clicking Functional Ontology');
    await ontologyDiv.click();
    await page.waitForTimeout(1000);
  } else {
    console.log('[uploadFirstDocumentInKnowledgeBase] Functional Ontology not found - continuing anyway');
  }
  
  // Click Submit/Start Analysis button
  let submitBtn = page.locator('button').filter({ hasText: /Submit|Start\s+Analysis|Upload|Confirm/i }).first();
  let found3 = await submitBtn.isVisible({ timeout: 5000 }).catch(() => false);
  
  if (found3) {
    const buttonText = await submitBtn.textContent();
    console.log('[uploadFirstDocumentInKnowledgeBase] Found submit button:', buttonText);
    try {
      await submitBtn.click();
      console.log('[uploadFirstDocumentInKnowledgeBase] Submit button clicked');
      // Wait for upload to process
      await page.waitForTimeout(8000);
    } catch (e) {
      console.error('[uploadFirstDocumentInKnowledgeBase] Error clicking submit:', e.message);
    }
  } else {
    console.log('[uploadFirstDocumentInKnowledgeBase] Submit button not found!');
  }
  
  console.log('[uploadFirstDocumentInKnowledgeBase] Document upload process completed');
  
}



export async function uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology(page, fileType = 'pdf') {
  await selectKnowleedgeBaseTab(page);
  await page.waitForTimeout(3000);
  
  // Click Add Document button
  let addDocBtn = page.getByRole('button', { name: /Add\s+Document/i }).first();
  let found = await addDocBtn.isVisible({ timeout: 10000 }).catch(() => false);
  if (!found) {
    addDocBtn = page.locator('button').filter({ hasText: /Add\s+Document/i }).first();
    found = await addDocBtn.isVisible({ timeout: 10000 }).catch(() => false);
  }
  if (found) {
    console.log('[uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology] Clicking Add Document');
    await addDocBtn.click();
  } else {
    console.log('[uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology] Add Document button not found!');
  }
  await page.waitForTimeout(8000);
  
  // Set file input
  const fileInput = page.locator('input[type="file"]').first();
  let inputFound = await fileInput.isVisible({ timeout: 5000 }).catch(() => false);
  if (!inputFound) {
    inputFound = await fileInput.count().catch(() => 0) > 0;
  }
  if (inputFound) {
    const filePath = `${__dirname}/../documents/fileName.${fileType}`;
    console.log('[uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology] Setting file input:', filePath);
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(2000);
  } else {
    console.log('[uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology] File input not found!');
  }

  await page.waitForTimeout(3000);
  
  // Select Architecture Ontology
  let ontologyDiv = page.locator('div').filter({ hasText: /^Architecture\s+Ontology$/i }).nth(1);
  found = await ontologyDiv.isVisible({ timeout: 8000 }).catch(() => false);
  if (!found) {
    ontologyDiv = page.locator('div').filter({ hasText: /Architecture\s+Ontology/i }).first();
    found = await ontologyDiv.isVisible({ timeout: 8000 }).catch(() => false);
  }
  if (found) {
    console.log('[uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology] Clicking Architecture Ontology');
    await ontologyDiv.click();
    await page.waitForTimeout(1500);
  } else {
    console.log('[uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology] Architecture Ontology not found!');
  }
  
  // Click Start Analysis
  let analysisBtn = page.getByRole('button', { name: /Start\s+Analysis/i });
  found = await analysisBtn.isVisible({ timeout: 10000 }).catch(() => false);
  if (!found) {
    analysisBtn = page.locator('button').filter({ hasText: /Start\s+Analysis/i }).first();
    found = await analysisBtn.isVisible({ timeout: 10000 }).catch(() => false);
  }
  if (found) {
    console.log('[uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology] Clicking Start Analysis');
    await analysisBtn.click();
    await page.waitForTimeout(5000);
  } else {
    console.log('[uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology] Start Analysis button not found!');
  }
  
}

export async function uploadDocumentwithDesignOntology(page, fileType = 'pdf') {
  await selectKnowleedgeBaseTab(page);
  await page.waitForTimeout(3000);
  
  // Click Add Document button
  let addDocBtn = page.getByRole('button', { name: /Add\s+Document/i }).first();
  let found = await addDocBtn.isVisible({ timeout: 10000 }).catch(() => false);
  if (!found) {
    addDocBtn = page.locator('button').filter({ hasText: /Add\s+Document/i }).first();
    found = await addDocBtn.isVisible({ timeout: 10000 }).catch(() => false);
  }
  if (found) {
    console.log('[uploadDocumentwithDesignOntology] Clicking Add Document');
    await addDocBtn.click();
  } else {
    console.log('[uploadDocumentwithDesignOntology] Add Document button not found!');
  }
  await page.waitForTimeout(8000);
  
  // Set file input
  const fileInput = page.locator('input[type="file"]').first();
  let inputFound = await fileInput.isVisible({ timeout: 5000 }).catch(() => false);
  if (!inputFound) {
    inputFound = await fileInput.count().catch(() => 0) > 0;
  }
  if (inputFound) {
    const filePath = `${__dirname}/../documents/fileName.${fileType}`;
    console.log('[uploadDocumentwithDesignOntology] Setting file input:', filePath);
    await fileInput.setInputFiles(filePath);
    await page.waitForTimeout(2000);
  } else {
    console.log('[uploadDocumentwithDesignOntology] File input not found!');
  }

  await page.waitForTimeout(3000);
  
  // Select Design Ontology
  let ontologyDiv = page.locator('div').filter({ hasText: /^Design\s+Ontology$/i }).nth(1);
  found = await ontologyDiv.isVisible({ timeout: 8000 }).catch(() => false);
  if (!found) {
    ontologyDiv = page.locator('div').filter({ hasText: /Design\s+Ontology/i }).first();
    found = await ontologyDiv.isVisible({ timeout: 8000 }).catch(() => false);
  }
  if (found) {
    console.log('[uploadDocumentwithDesignOntology] Clicking Design Ontology');
    await ontologyDiv.click();
    await page.waitForTimeout(1500);
  } else {
    console.log('[uploadDocumentwithDesignOntology] Design Ontology not found!');
  }
  
  // Click Start Analysis
  let analysisBtn = page.getByRole('button', { name: /Start\s+Analysis/i });
  found = await analysisBtn.isVisible({ timeout: 10000 }).catch(() => false);
  if (!found) {
    analysisBtn = page.locator('button').filter({ hasText: /Start\s+Analysis/i }).first();
    found = await analysisBtn.isVisible({ timeout: 10000 }).catch(() => false);
  }
  if (found) {
    console.log('[uploadDocumentwithDesignOntology] Clicking Start Analysis');
    await analysisBtn.click();
    await page.waitForTimeout(5000);
  } else {
    console.log('[uploadDocumentwithDesignOntology] Start Analysis button not found!');
  }
  
}


export async function selectKnowleedgeBaseTab(page) {
  let kbBtn = page.locator("li.relative > button[aria-label='Knowledge Base']");
  let found = await kbBtn.isVisible({ timeout: 10000 }).catch(() => false);
  
  if (!found) {
    kbBtn = page.locator('button').filter({ hasText: /Knowledge\\s+Base/i }).first();
    found = await kbBtn.isVisible({ timeout: 10000 }).catch(() => false);
  }
  
  if (found) {
    await kbBtn.click();
  }
  await page.waitForTimeout(2000);
}
export async function generateFunctionalMetric(page) {
  console.log('[generateFunctionalMetric] Starting functional metrics generation');
  
  // First, ensure we're on the Knowledge Base tab
  await selectKnowleedgeBaseTab(page);
  await page.waitForTimeout(2000);
  
  // Look for Generate Metrics button
  let genMetricBtn = page.locator('button').filter({ hasText: /Generate\s+Metrics|Generate\s+Functional/i }).first();
  let found = await genMetricBtn.isVisible({ timeout: 10000 }).catch(() => false);
  
  if (!found) {
    // Look for button with icon (metrics button might just have an icon)
    genMetricBtn = page.locator('button').filter({ hasText: /^$/ }).nth(5);
    found = await genMetricBtn.isVisible({ timeout: 5000 }).catch(() => false);
  }
  
  if (found) {
    console.log('[generateFunctionalMetric] Clicking Generate Metrics button');
    try {
      await genMetricBtn.click();
      console.log('[generateFunctionalMetric] Generate Metrics button clicked - waiting for processing (2-3 minutes)');
      // Wait for metrics generation - this can take 2-3 minutes
      await page.waitForTimeout(180000); // 3 minutes
      console.log('[generateFunctionalMetric] Metrics generation completed');
    } catch (e) {
      console.error('[generateFunctionalMetric] Error:', e.message);
    }
  } else {
    console.log('[generateFunctionalMetric] Generate Metrics button not found!');
  }
}

export async function connectRepoInKnowledgeBase(page, gitURL) {
  await page.locator("li.relative > button[aria-label='Knowledge Base']").click();
  await page.waitForTimeout(2000);
  
}

export async function uploadDocumentInAIChat(page, fileType = 'pdf', projectId) {
  await page.goto(`https://ai.accionbreeze.com/chat/requirement_agent/${projectId}`);
  const filePath = join(__dirname, '..', 'documents', `fileName.${fileType}`);
  await page.locator('input[type="file"]').first().setInputFiles(filePath);
}
