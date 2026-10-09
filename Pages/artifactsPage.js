import { expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const TARGET_URL = process.env.TARGET_URL || "https://ai.accionbreeze.com/";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function artifactsUrlPattern(projectId) {
  const baseUrl = new URL(TARGET_URL);
  const basePath = baseUrl.pathname.replace(/\/$/, "");
  const projectIdentifier = projectId == null
    ? "[^/?#]+"
    : escapeRegExp(encodeURIComponent(String(projectId)));
  return new RegExp(
    `^${escapeRegExp(`${baseUrl.origin}${basePath}`)}/knowledge/${projectIdentifier}/?(?:[?#].*)?$`,
    "i",
  );
}

function artifactBlobUrlPattern() {
  return new RegExp(`^blob:${escapeRegExp(new URL(TARGET_URL).origin)}/.+$`, "i");
}

export async function openArtifactsMenu(page, projectId = null) {
  const { menuArtifactsButton, searchArtifactsButton } = artifactLocators(page);
  await menuArtifactsButton.click();
  if (projectId) {
    await expect(page).toHaveURL(artifactsUrlPattern(projectId));
  }
  await expect(searchArtifactsButton).toBeVisible({ timeout: 5000 });
  await searchArtifactsButton.click();
}

export async function ensureArtifactsPage(page, projectId) {
  const { searchArtifactsButton } = artifactLocators(page);
  const alreadyOnArtifactsPage = artifactsUrlPattern(projectId).test(page.url());
  if (!alreadyOnArtifactsPage) {
      await openArtifactsMenu(page, projectId);
  } else {
    await expect(page).toHaveURL(artifactsUrlPattern(projectId));
  }
  await expect(searchArtifactsButton).toBeVisible({ timeout: 10000 });
}

function artifactLocators(page) {
  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
  const generateFunctionalDialog = page.getByRole("dialog", { name: "Generate Functional" });
  const artifactPreviewDialog = page.getByRole("dialog").last();
  const functionalArtifactRow = page.getByRole("row").filter({ hasText: "Functional Documentation" }).first();
  const deleteArtifactModal = page.locator('div').filter({has: page.getByText('Delete Artifact')});
  return {
    menuArtifactsButton: primaryNavigation.getByRole("button", { name: "Artifacts", exact: true }),
    downloadDocumentationBtn: page.getByRole("button", { name: /^Functional Documentation/i }).first(),
    searchArtifactsButton: page.getByRole('textbox', { name: 'Search artifacts...', exact: true }),
    generateFunctionalDialog: page.getByRole("dialog", { name: "Generate Functional" }),
    dwnldArtifactPlainHtmlBtn: generateFunctionalDialog.getByRole("button", {
      name: /Plain HTML Interactive single/i,
    }).first(),
    dwnldArtifactPlainMarkdownBtn: generateFunctionalDialog.getByRole("button", {
      name: /Plain Markdown/i,
    }).first(),
    artifactPreviewDialog,
    artifactName: functionalArtifactRow.getByText(
      /^FRD\s+[—-]\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4},\s+\d{2}:\d{2}$/
    ),
    artifactFunctionalDocumentationType: functionalArtifactRow.getByText("Functional Documentation", { exact: true }),
    artifactReadyStatus: functionalArtifactRow.getByText("Ready", { exact: true }),
    artifactCreated: functionalArtifactRow.getByText(
      /^\d{1,2}\/\d{1,2}\/\d{4}$/
    ),
    viewButton: functionalArtifactRow.getByRole("button", { name: "View", exact: true }),
    deleteButton: functionalArtifactRow.getByRole("button", { name: "Delete", exact: true }),
    previewDownloadButton: artifactPreviewDialog.locator(
      'button:has(svg.lucide-download), button[aria-label*="download" i], button[title*="download" i]',
    ).first(),
    mrkdwnOpenButton: artifactPreviewDialog.getByRole("button", { name: "Open", exact: true }).first(),
    overlayCloseButton: page.locator('svg.lucide-x'),
    copyButton: page.getByRole("button", { name: "Copy", exact: true }).first(),
    secondaryCopyButton: page.locator('button:has(svg.lucide-clipboard-copy)').first(),
    artifactsHeading: page.getByRole("heading", { name: "Artifacts", exact: true }),
    refreshArtifactsButton: page.getByRole("button", { name: "Refresh artifacts", exact: true }),
    artifactsTable: page.getByRole("table"),
    emptyArtifactsHeading: page.getByRole("heading", { name: "No artifacts yet", exact: true }),
    infoIconOnArtifactsPage:page.getByText('Prefer a controlled, reviewable functional document? Try /breeze:generate-spec'),
    infoIconBreezeCodeSnippet: page.locator('pre:has-text("/breeze:generate-spec")'),
    cancelButtonOnPopup: deleteArtifactModal.getByRole('button', { name: 'Cancel' }),
    deleteButtonOnPopup: deleteArtifactModal.getByRole('button', { name: 'Delete' }),
  }; 
}

export async function validateFunctionalArtifactRecord(page) {
  const { artifactName, artifactFunctionalDocumentationType, artifactReadyStatus, artifactCreated, viewButton, deleteButton } = artifactLocators(page);
  await expect(artifactName).toBeVisible();
  await expect(artifactFunctionalDocumentationType).toBeVisible();
  await expect(artifactReadyStatus).toBeVisible();
  await expect(artifactCreated).toBeVisible();
  await expect(viewButton).toBeVisible();
  await expect(deleteButton).toBeVisible();
}

export async function validateDownloadedHtmlFromPreviewPage(download, projectName) {
  expect(download.filename).toMatch(/^artifact_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.html$/);
  expect(fs.existsSync(download.path)).toBe(true);
  const htmlContent = fs.readFileSync(download.path, "utf8");
  expect(htmlContent).toContain("<!DOCTYPE html>");
  expect(htmlContent).toContain(projectName);
  console.log(`"${download.filename}" was successfully downloaded to the system path "${download.path}"`);
  fs.rmSync(download.path, {
  recursive: true,
  force: true,
  });
  fs.rmSync(download.downloadDir, {
  recursive: true,
  force: true,
  });
}

export async function validateDownloadedMarkdownFromPreviewPage(download, projectName) {
  expect(download.filename).toMatch(/^artifact_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.md$/);
  expect(fs.existsSync(download.path)).toBe(true);
  const markdownContent = fs.readFileSync(download.path, "utf8");
  expect(markdownContent).toContain("Functional Requirements Document");
  expect(markdownContent).toContain(projectName);
  console.log(`"${download.filename}" was successfully downloaded to the system path "${download.path}"`);
  fs.rmSync(download.path, {
  recursive: true,
  force: true,
  });
  fs.rmSync(download.downloadDir, {
  recursive: true,
  force: true,
  });
}

export async function attemptDeleteArtifactRecordButCancel(page){
  const { deleteButton, cancelButtonOnPopup } = artifactLocators(page);
  await expect(deleteButton).toBeVisible({ timeout: 5000 });
  await deleteButton.click();
  await expect(cancelButtonOnPopup).toBeVisible({ timeout: 5000 });
  await cancelButtonOnPopup.click();
  await expect(deleteButton).toBeVisible({ timeout: 5000 });
  const recordCount = await getArtifactRecordCount(page);
  return recordCount;
}

export async function deleteLatestArtifactRecord(page, lastFoundRecordsCount){
  const { deleteButton, deleteButtonOnPopup } = artifactLocators(page);
  await expect(deleteButton).toBeVisible({ timeout: 5000 });
  await deleteButton.click();
  await expect(deleteButtonOnPopup).toBeVisible({ timeout: 5000 });
  await deleteButtonOnPopup.click();
  await expect(deleteButtonOnPopup).toBeHidden({ timeout: 5000 });
  await expect(page.getByText('Artifact deleted successfully')).toBeVisible({
  timeout: 60000,
  });
    await expect(page.getByText('Artifact deleted successfully')).toBeHidden({
  timeout: 30000,
  });
  return waitForArtifactRecordCountDecrement(page, lastFoundRecordsCount);
}

export async function downloadArtifactPlainHtml(page, projectId, lastFoundRecordsCount = 0) {
  const {
    downloadDocumentationBtn,
    generateFunctionalDialog,
    dwnldArtifactPlainHtmlBtn,
    artifactReadyStatus,
  } = artifactLocators(page);
  await ensureArtifactsPage(page, projectId);
  lastFoundRecordsCount = await getArtifactRecordCount(page);
  await expect(downloadDocumentationBtn).toBeVisible({ timeout: 5000 });
  await expect(downloadDocumentationBtn).toBeEnabled({ timeout: 5000 });
  await downloadDocumentationBtn.click();
  await expect(generateFunctionalDialog).toBeVisible({ timeout: 5000 });
  await expect(dwnldArtifactPlainHtmlBtn).toBeVisible({ timeout: 5000 });
  await expect(dwnldArtifactPlainHtmlBtn).toBeEnabled({ timeout: 5000 });
  await dwnldArtifactPlainHtmlBtn.click();
  await expect(page.getByText('Artifact generation started')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Artifact generation started')).toBeHidden({ timeout: 30000 });
  await expect(artifactReadyStatus).toBeVisible({ timeout: 10000 });
  return waitForArtifactRecordCountIncrement(page, lastFoundRecordsCount);
}

export async function waitForArtifactRecordCountIncrement(page, lastFoundRecordsCount = 0) {
  const { refreshArtifactsButton } = artifactLocators(page);
  await expect(refreshArtifactsButton).toBeVisible({ timeout: 5000 });
  await refreshArtifactsButton.click();
  const rows = page.locator('tbody tr');
  // "Showing 1 to 6 of totalCount results"
  const resultsSummary = page.locator(
    'text=/Showing\\s+\\d+\\s+to\\s+\\d+\\s+of\\s+\\d+\\s+results/i'
  );
  await resultsSummary
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {});
  const hasPaginationSummary = await resultsSummary.isVisible();
  if (hasPaginationSummary) {
    let totalCount = 0;
    await expect
      .poll(
        async () => {
          await refreshArtifactsButton.click();
          const text = (await resultsSummary.textContent())?.trim() || '';
          const match = text.match(/of\s+(\d+)\s+results/i);
          totalCount = match ? Number(match[1]) : 0;
          return totalCount;
        },
        {
          timeout: 30000,
          message: `Downloading artifact failed: Expected total artifact count to increase beyond ${lastFoundRecordsCount} post download`,
        }
      )
      .toBeGreaterThan(lastFoundRecordsCount);
    console.log(
      `Artifact total count increased from ${lastFoundRecordsCount} to ${totalCount}`
    );
    return totalCount;
  }
  // Fallback for non-paginated tables
  let rowCount = 0;
  await expect
    .poll(
      async () => {
        rowCount = await rows.count();
        return rowCount;
      },
      {
        timeout: 15000,
        message: `Downloading artifact failed: Expected artifact record count to increase beyond ${lastFoundRecordsCount} post download`,
      }
    )
    .toBeGreaterThan(lastFoundRecordsCount);
  console.log(
    `Artifact record count increased from ${lastFoundRecordsCount} to ${rowCount}`
  );
  return rowCount;
}

export async function getArtifactRecordCount(page) {
  const rows = page.locator('tbody tr');
  // "Showing 1 to 6 of totalCount results"
  const resultsSummary = page.locator(
    'text=/Showing\\s+\\d+\\s+to\\s+\\d+\\s+of\\s+\\d+\\s+results/i'
  );
  await resultsSummary
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {});
  const hasPaginationSummary = await resultsSummary.isVisible();
  if (hasPaginationSummary) {
    let totalCount = 0;
    try {
      await expect
        .poll(
          async () => {
            const text = (await resultsSummary.textContent())?.trim() || '';

            const match = text.match(/of\s+(\d+)\s+results/i);

            totalCount = match ? Number(match[1]) : 0;

            return totalCount;
          },
          {
            timeout: 10000,
          }
        )
        .toBeGreaterThan(0);
    } catch {
      console.log('No artifact records found after waiting 10 seconds');
      return 0;
    }
    console.log(`Total artifact records found: ${totalCount}`);
    return totalCount;
  }
  // Fallback for non-paginated tables
  let count = 0;
  try {
    await expect
      .poll(
        async () => {
          await refreshArtifactsButton.click();
          count = await rows.count();
          return count;
        },
        {
          timeout: 10000,
        }
      )
      .toBeGreaterThan(0);
  } catch {
    console.log('No artifact records found after waiting 10 seconds');
    return 0;
  }
  console.log(`Total artifact records found: ${count}`);
  return count;
}

export async function waitForArtifactRecordCountDecrement(page, lastFoundRecordsCount = 0) {
  const { refreshArtifactsButton } = artifactLocators(page);
  await expect(refreshArtifactsButton).toBeVisible({ timeout: 5000 });
  await refreshArtifactsButton.click();
  const rows = page.locator('tbody tr');
  // "Showing 1 to 6 of totalCount results"
  const resultsSummary = page.locator(
    'text=/Showing\\s+\\d+\\s+to\\s+\\d+\\s+of\\s+\\d+\\s+results/i'
  );
  await resultsSummary
    .waitFor({ state: 'visible', timeout: 5000 })
    .catch(() => {});
  const hasPaginationSummary = await resultsSummary.isVisible();
  if (hasPaginationSummary) {
    let totalCount = 0;
    await expect
      .poll(
        async () => {
          await refreshArtifactsButton.click();
          const text = (await resultsSummary.textContent())?.trim() || '';
          const match = text.match(/of\s+(\d+)\s+results/i);
          totalCount = match ? Number(match[1]) : 0;
          return totalCount;
        },
        {
          timeout: 60000,
          intervals: [1000, 2000],
          message: `Deletion of Record failed: Expected artifact record count to decrease below ${lastFoundRecordsCount} post deletion`,
        }
      )
      .toBeLessThan(lastFoundRecordsCount);
    console.log(
      `Artifact total count decreased from ${lastFoundRecordsCount} to ${totalCount}`
    );
    return totalCount;
  }
  // Fallback for non-paginated tables
  let rowCount = 0;
  await expect
    .poll(
      async () => {
        await refreshArtifactsButton.click();
        rowCount = await rows.count();
        return rowCount;
      },
      {
        timeout: 30000,
        intervals: [1000, 2000],
        message: `Deletion of Record failed: Expected artifact record count to decrease below ${lastFoundRecordsCount} post deletion`,
      }
    )
    .toBeLessThan(lastFoundRecordsCount);
  console.log(
    `Artifact record count decreased from ${lastFoundRecordsCount} to ${rowCount}`
  );
  return rowCount;
}

export async function validateDownloadedPlainHtml(page, projectName) {
  const { viewButton, overlayCloseButton } = artifactLocators(page);
  const expectedTitle = `Functional Specification - ${projectName}`;
  await expect(viewButton).toBeVisible({ timeout: 10000 });
  await validateFunctionalArtifactRecord(page);
  await viewButton.first().click();
  await expect(page.getByText(expectedTitle, { exact: false }), `Custom Error: "${expectedTitle}" was not visible on the page within 10 seconds.`).toBeVisible({ timeout: 10000 });
  await expect(overlayCloseButton).toBeEnabled({ timeout: 5000 });
  await overlayCloseButton.click();
  await expect(overlayCloseButton).not.toBeVisible({ timeout: 5000 });
}



export async function savePreviewDownload(page) {
  const { previewDownloadButton, overlayCloseButton } = artifactLocators(page);
  const DOWNLOAD_DIR = path.join(
  process.cwd(),
  "downloads",
  `run_${Date.now()}`
  );
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  const artifactFilePattern =
    /^artifact_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
  for (const file of fs.readdirSync(DOWNLOAD_DIR)) {
    if (artifactFilePattern.test(file)) {
      fs.unlinkSync(path.join(DOWNLOAD_DIR, file));
    }
  }
  expect(
    fs.readdirSync(DOWNLOAD_DIR).filter(file =>
      artifactFilePattern.test(file)
    )
  ).toHaveLength(0);
  await expect(previewDownloadButton).toBeVisible({ timeout: 10000 });
  await expect(previewDownloadButton).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    previewDownloadButton.click(),
  ]);
  const filename = download.suggestedFilename();
  const savedPath = path.join(DOWNLOAD_DIR, filename);
  await download.saveAs(savedPath);
  console.log("Suggested filename:", download.suggestedFilename());
  console.log("Download URL:", download.url());
  expect(await download.failure()).toBeNull();
  await expect(overlayCloseButton).toBeEnabled({ timeout: 5000 });
  await overlayCloseButton.click();
  await expect(overlayCloseButton).not.toBeVisible({ timeout: 5000 });
  return { filename, path: savedPath, downloadDir: DOWNLOAD_DIR, };
}

export async function downloadPlainHtmlFromArtifactPreview(page, projectName) {
  const { viewButton } = artifactLocators(page);
  await expect(viewButton).toBeVisible({ timeout: 30000 });
  await viewButton.first().click();
  await expect(
    page.getByText(`Functional Specification - ${projectName}`, {
      exact: false,
    })
  ).toBeVisible({ timeout: 30000 });
  return savePreviewDownload(page);
}

export async function downloadPlainMarkdownFromArtifactPreview(page, projectName) {
  const { viewButton } = artifactLocators(page);
  const expectedTitle = `${projectName}`;
  await expect(viewButton).toBeVisible({ timeout: 30000 });
  await viewButton.first().click();
  await expect(page.getByText(/Functional Requirements Document/i).first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[role="dialog"] h1')).toHaveText(expectedTitle);
  return savePreviewDownload(page);
}

export async function searchAndValidateRecord(page) {
  const { searchArtifactsButton,refreshArtifactsButton } = artifactLocators(page);
  const recordCountBeforeSearch = await getArtifactRecordCount(page);
  // Capture the first record name
  const nameCells = page.locator('tbody tr td').first();
  const recordText = await nameCells.innerText();
  if (!recordText) {
    throw new Error('no downloaded artifacts present on the page to perform search validation');
  }
  const expectedRecord = recordText.trim();
  console.log(`Searching for record: ${expectedRecord}`);
  // Search for the record
  await Promise.all([
  page.waitForResponse(
    response =>
      response.url().includes('/search') &&
      response.status() === 200,
    { timeout: 10000 }
  ),
  searchArtifactsButton.fill(expectedRecord),
  ]);
  // Wait for results to render
  await page.locator('tbody tr').first().waitFor({ state: 'visible' });
  // Get all filtered rows
  const filteredRows = page.locator('tbody tr');
  const displayedRecords = (await filteredRows.allTextContents()).map(record =>
    record.trim()
  );
  const rowCount = displayedRecords.length;
  // Validate every displayed record matches the searched record
  for (const record of displayedRecords) {
    expect(record).toContain(expectedRecord);
  }
  console.log(
    `Search validation passed. Found ${rowCount} matching record(s) for "${expectedRecord}".`
  );
  await searchArtifactsButton.clear();
  await refreshArtifactsButton.click();
  const recordCountAfterClearingSearchBox = await getArtifactRecordCount(page);
  expect(recordCountBeforeSearch, 'Record count should remain the same after clearing search textbox').toBe(recordCountAfterClearingSearchBox);
  return true;
}

export async function validateDownloadedPlainMarkdown(page, projectName) {
  const { viewButton, overlayCloseButton } = artifactLocators(page);
  const expectedTitle = `${projectName}`;
  await expect(viewButton).toBeVisible({ timeout: 10000 });
  await validateFunctionalArtifactRecord(page);
  await viewButton.first().click();
  await expect(page.getByText(/Functional Requirements Document/i).first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[role="dialog"] h1')).toHaveText(expectedTitle);
  await expect(overlayCloseButton).toBeEnabled({ timeout: 5000 });
  await overlayCloseButton.click();
  await expect(overlayCloseButton).not.toBeVisible({ timeout: 5000 });
}

export async function validatePlainHtmlInNewWindow(page, projectName) {
  const { viewButton, artifactPreviewDialog, overlayCloseButton } = artifactLocators(page);
  const expectedTitle = `Functional Specification - ${projectName}`;
  await expect(viewButton).toBeVisible({ timeout: 10000 });
  await viewButton.click();
  await expect(
    page.getByText(expectedTitle, { exact: false }),
    `Custom Error: "${expectedTitle}" was not visible within 10 seconds.`
  ).toBeVisible({ timeout: 10000 });
  const openButtons = artifactPreviewDialog.getByRole("button", { name: "Open", exact: true });
  await expect(openButtons).toHaveCount(2, { timeout: 10000 });
  for (let index = 0; index < 2; index += 1) {
      const locator = openButtons.nth(index);
      await expect(locator, `Open button ${index + 1} is not visible`).toBeVisible({ timeout: 10000 });
      await expect(locator, `Open button ${index + 1} is not enabled`).toBeEnabled({ timeout: 10000 });
      const [newPage] = await Promise.all([
        page.context().waitForEvent("page", { timeout: 10000 }),
        locator.click(),
      ]);
    await newPage.waitForLoadState("domcontentloaded", { timeout: 10000 });
    await expect(newPage).toHaveURL(artifactBlobUrlPattern());
    await expect(newPage.locator("h1").first()).toHaveText("Functional Spec", { timeout: 10000 });
    await expect(newPage.locator("body")).toContainText(projectName, { timeout: 10000 });
    await newPage.close();
    await page.bringToFront();
  }
  await expect(overlayCloseButton).toBeEnabled({ timeout: 5000 });
  await overlayCloseButton.click();
  await expect(overlayCloseButton).not.toBeVisible({ timeout: 5000 });
}

export async function validatePlainMarkdownInNewWindow(page, projectName) {
  const {
    viewButton,
    mrkdwnOpenButton,
    overlayCloseButton
  } = artifactLocators(page);
  const expectedTitle = `${projectName}`;
  await expect(viewButton).toBeVisible({ timeout: 10000 });
  await viewButton.click();
  await expect(page.locator('[role="dialog"] h1')).toHaveText(expectedTitle, { timeout: 10000 });
  await expect(mrkdwnOpenButton).toBeVisible({ timeout: 10000 });
  await expect(mrkdwnOpenButton).toBeEnabled();
  const popupPromise = page.context().waitForEvent("page", { timeout: 10000 });
  await mrkdwnOpenButton.click();
  const newPage = await popupPromise;
  await newPage.waitForLoadState("domcontentloaded", { timeout: 10000 });
  await expect(newPage).toHaveURL(artifactBlobUrlPattern());
  await expect(newPage.locator("h1").first()).toHaveText(expectedTitle, { timeout: 10000 });
  await expect(newPage.locator("body")).toContainText(/Functional Requirements Document/i, { timeout: 10000 });
  await newPage.close();
  await page.bringToFront();
  await expect(overlayCloseButton).toBeEnabled({ timeout: 5000 });
  await overlayCloseButton.click();
  await expect(overlayCloseButton).not.toBeVisible({ timeout: 5000 });
}

export async function reviewArtifactsPage(page, projectId) {
  const { artifactsHeading, refreshArtifactsButton, artifactsTable, emptyArtifactsHeading, infoIconOnArtifactsPage } = artifactLocators(page);
  await ensureArtifactsPage(page, projectId);
  await expect(artifactsHeading).toBeVisible();
  await expect(refreshArtifactsButton).toBeVisible();
  await expect(infoIconOnArtifactsPage).toBeVisible();
  await validateInfoIconOnArtifactsPage(page);
  await expect(artifactsTable.or(emptyArtifactsHeading)).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: /Functional Documentation/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gherkin", exact: true })).toBeVisible();
}

export async function validateInfoIconOnArtifactsPage(page) {
  const { infoIconOnArtifactsPage, infoIconBreezeCodeSnippet } = artifactLocators(page);
  const expectedTextInfoIcon1= "The Functional Documentation button above runs a one-shot server-side generation. For a more controlled, reviewable alternative, use the /breeze:generate-spec skill from the Breeze Claude Code plugin — it produces a structured Markdown specification grouped by persona, with full citation traceability back to the functional graph, and lets you review and edit before anything is saved."
  const expectedTextInfoIcon2= "Usage (from Claude Code)"
  const expectedTextInfoIcon3= "Prerequisite: the Breeze plugin must be installed and this project linked via /breeze:setup-project. Full install guide: accionlabs/breezeai-claude-plugin."
  const expectedTextInfoIcon4= "The button above still works — use it for a quick generation. Reach for /breeze:generate-spec when you need a reviewable artifact you can version alongside your repo."
  await expect(infoIconOnArtifactsPage).toBeVisible();
  await infoIconOnArtifactsPage.click();
  await expect(infoIconBreezeCodeSnippet).toBeVisible();
  const expectedTexts = [
  expectedTextInfoIcon1,
  expectedTextInfoIcon2,
  expectedTextInfoIcon3,
  expectedTextInfoIcon4
  ];
  for (const text of expectedTexts) {
  await expect(page.getByText(text)).toBeVisible();
  console.log(`Validated visibility of expected text: "${text}"`);
  }
  await infoIconOnArtifactsPage.click();
}

export async function validateCopyPlainHtmlContent(page, projectName, projectId) {
  const { viewButton, copyButton, secondaryCopyButton, overlayCloseButton } = artifactLocators(page);
  const targetOrigin = (process.env.TARGET_URL || "https://ai.accionbreeze.com/").replace(/\/$/, "");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: targetOrigin,
  });
  const viewVisible = await viewButton.isVisible({ timeout: 5000 }).catch(() => false);
  if (!viewVisible) {
    await downloadArtifactPlainHtml(page, projectId);
  }
  await viewButton.click();
  await expect.poll(
    () => copyButton.count().then((primaryCount) =>
      secondaryCopyButton.count().then((secondaryCount) => primaryCount + secondaryCount)
    ),
    {
      timeout: 10000,
      message: "At least one HTML copy button should be rendered",
    },
  ).toBeGreaterThan(0);
  const primaryCopyButtonCount = await copyButton.count();
  const secondaryCopyButtonCount = await secondaryCopyButton.count();
  const copyButtons = [];
  if (primaryCopyButtonCount > 0) {
    copyButtons.push(copyButton);
  }
  for (let index = 0; index < secondaryCopyButtonCount; index += 1) {
    copyButtons.push(secondaryCopyButton.nth(index));
  }
  for (const candidateButton of copyButtons) {
    await expect(candidateButton).toBeVisible({ timeout: 10000 });
    await candidateButton.click();
    await expect.poll(async () => {
      const clipboardText = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
      return clipboardText.includes("<!DOCTYPE html>") && clipboardText.includes(projectName);
    }, { timeout: 10000 }).toBeTruthy();
  }
  await expect(overlayCloseButton).toBeEnabled({ timeout: 10000 });
  await overlayCloseButton.click();
  await expect(overlayCloseButton).not.toBeVisible({ timeout: 10000 });
}

export async function validateCopyPlainMarkdownContent(page, projectName, projectId) {
  const { viewButton, secondaryCopyButton, overlayCloseButton } = artifactLocators(page);
  const targetOrigin = (process.env.TARGET_URL || "https://ai.accionbreeze.com/").replace(/\/$/, "");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: targetOrigin,
  });
  const viewVisible = await viewButton.isVisible({ timeout: 5000 }).catch(() => false);
  if (!viewVisible) {
    await downloadArtifactPlainMarkdown(page, projectId);
  }
  await viewButton.click();
  await expect(secondaryCopyButton).toBeVisible({ timeout: 10000 });
  await secondaryCopyButton.click();
  await expect.poll(async () => {
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
    return clipboardText.includes("Functional Requirements Document") && clipboardText.includes(projectName);
  }, { timeout: 15000 }).toBeTruthy();
  await expect(overlayCloseButton).toBeEnabled({ timeout: 10000 });
  await overlayCloseButton.click();
  await expect(overlayCloseButton).not.toBeVisible({ timeout: 10000 });
}

export async function downloadArtifactPlainMarkdown(page, projectId, lastFoundRecordsCount = 0) {
  const {
    downloadDocumentationBtn,
    generateFunctionalDialog,
    dwnldArtifactPlainMarkdownBtn,
    artifactReadyStatus,
  } = artifactLocators(page);
  await ensureArtifactsPage(page, projectId);
  lastFoundRecordsCount = await getArtifactRecordCount(page);
  await expect(downloadDocumentationBtn).toBeVisible({ timeout: 10000 });
  await expect(downloadDocumentationBtn).toBeEnabled({ timeout: 10000 });
  await downloadDocumentationBtn.click();
  await expect(generateFunctionalDialog).toBeVisible({ timeout: 10000 });
  await expect(dwnldArtifactPlainMarkdownBtn).toBeVisible({ timeout: 10000 });
  await expect(dwnldArtifactPlainMarkdownBtn).toBeEnabled({ timeout: 10000 });
  await dwnldArtifactPlainMarkdownBtn.click();
  await expect(page.getByText('Artifact generation started')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Artifact generation started')).toBeHidden({ timeout: 30000 });
  await expect(artifactReadyStatus).toBeVisible({ timeout: 10000 });
  return waitForArtifactRecordCountIncrement(page, lastFoundRecordsCount);
}
