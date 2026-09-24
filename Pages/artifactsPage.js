import { expect } from "@playwright/test";

const TARGET_URL = process.env.TARGET_URL || "https://ai.accionbreeze.com/";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function artifactsUrlPattern(projectId) {
  const uuidPattern = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const projectIdentifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(projectId))
    ? escapeRegExp(String(projectId))
    : uuidPattern;

  return new RegExp(`^${escapeRegExp(TARGET_URL)}knowledge/${projectIdentifier}(?:/)?$`, "i");
}

function artifactBlobUrlPattern() {
  return new RegExp(`^blob:${escapeRegExp(new URL(TARGET_URL).origin)}/.+$`, "i");
}

async function openArtifactsMenu(page, projectId = null) {
  const { menuArtifactsButton, searchArtifactsButton } = artifactLocators(page);

  await menuArtifactsButton.click();

  if (projectId) {
    await expect(page).toHaveURL(artifactsUrlPattern(projectId));
  }

  await expect(searchArtifactsButton).toBeVisible({ timeout: 5000 });
  await searchArtifactsButton.click();
}

async function ensureArtifactsPage(page, projectId) {
  const { searchArtifactsButton } = artifactLocators(page);
  const alreadyOnArtifactsPage = /\/knowledge\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:[/?#]|$)/i.test(page.url());

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
    viewButton: functionalArtifactRow.getByRole("button", { name: "View", exact: true }),
    mrkdwnOpenButton: artifactPreviewDialog.getByRole("button", { name: "Open", exact: true }).first(),
    overlayCloseButton: page.locator('svg.lucide-x'),
    copyButton: page.getByRole("button", { name: "Copy", exact: true }).first(),
    secondaryCopyButton: page.locator('button:has(svg.lucide-clipboard-copy)').first(),
    artifactsHeading: page.getByRole("heading", { name: "Artifacts", exact: true }),
    refreshArtifactsButton: page.getByRole("button", { name: "Refresh artifacts", exact: true }),
    artifactsTable: page.getByRole("table"),
    emptyArtifactsHeading: page.getByRole("heading", { name: "No artifacts yet", exact: true }),
    artifactReady: functionalArtifactRow.getByText("Ready", { exact: true }),
    infoIconOnArtifactsPage:page.getByText('Prefer a controlled, reviewable functional document? Try /breeze:generate-spec'),
    infoIconBreezeCodeSnippet: page.locator('pre:has-text("/breeze:generate-spec")'),
    functionalArtifactRecord: page.getByRole("row").filter({ hasText: "Functional Documentation" })
  }; 
}

export async function downloadArtifactPlainHtml(page, projectId) {
  const {
    downloadDocumentationBtn,
    generateFunctionalDialog,
    dwnldArtifactPlainHtmlBtn,
    artifactReady,
  } = artifactLocators(page);

  await ensureArtifactsPage(page, projectId);

  await expect(downloadDocumentationBtn).toBeVisible({ timeout: 5000 });
  await expect(downloadDocumentationBtn).toBeEnabled({ timeout: 5000 });
  await downloadDocumentationBtn.click();
  await expect(generateFunctionalDialog).toBeVisible({ timeout: 5000 });

  await expect(dwnldArtifactPlainHtmlBtn).toBeVisible({ timeout: 5000 });
  await expect(dwnldArtifactPlainHtmlBtn).toBeEnabled({ timeout: 5000 });
  await dwnldArtifactPlainHtmlBtn.click();
  await expect(artifactReady).toBeVisible({ timeout: 10000 });
  return getArtifactRecordCount(page);
}

export async function getArtifactRecordCount(page) {
  const rows = page.locator('tbody tr');
  let count = 0;

  try {
    await expect
      .poll(async () => {
        count = await rows.count();
        return count;
      }, {
        timeout: 10000,
      })
      .toBeGreaterThan(0);
  } catch {
    console.log('No artifact records found after waiting 10 seconds');
    return 0;
  }

  console.log(`Total artifact records found: ${count}`);
  return count;
}

export async function validateDownloadedPlainHtml(page, projectName) {
  const { viewButton, overlayCloseButton } = artifactLocators(page);
  const expectedTitle = `Functional Specification - ${projectName}`;

  await expect(viewButton).toBeVisible({ timeout: 10000 });
  await viewButton.click();
  await expect(page.getByText(expectedTitle, { exact: false }), `Custom Error: "${expectedTitle}" was not visible on the page within 10 seconds.`).toBeVisible({ timeout: 10000 });
  
  await expect(overlayCloseButton).toBeEnabled({ timeout: 5000 });
  await overlayCloseButton.click();
  await expect(overlayCloseButton).not.toBeVisible({ timeout: 5000 });
}

export async function validateMultipleRecordsVisible(page) {
  const { functionalArtifactRecord } = artifactLocators(page);
  let count = 0;
  await expect
    .poll(async () => {
      count = await functionalArtifactRecord.count();
      return count;
    }, {
      timeout: 10000,
    })
    .toBeGreaterThan(1);
  console.log(`Found ${count} Functional Artifact Records`);
  return true;
}

export async function searchAndValidateRecord(page) {
  const { searchArtifactsButton } = artifactLocators(page);

  // Capture the first record name
  const nameCells = page.locator('tbody tr td').first();
  const recordText = await nameCells.innerText();
  if (!recordText) {
    throw new Error('Record name cell is empty or not found');
  }
  const expectedRecord = recordText.trim();
  console.log(`Searching for record: ${expectedRecord}`);

  // Search for the record
  await searchArtifactsButton.fill(expectedRecord);
  await page.waitForLoadState('networkidle');
  // Get all filtered rows
  const filteredRows = page.locator('tbody tr');
  const displayedRecords = (await filteredRows.allTextContents()).map(record =>
    record.trim()
  );

  const rowCount = displayedRecords.length;
  // Fail if no records are found
  if (rowCount === 0) {
    throw new Error(
    `Search validation failed. No records found for "${expectedRecord}".`);
    }
  // Validate every displayed record matches the searched record
  for (const record of displayedRecords) {
    expect(record).toContain(expectedRecord);
  }

  console.log(
    `Search validation passed. Found ${rowCount} matching record(s) for "${expectedRecord}".`
  );

  return true;
}

export async function validateDownloadedPlainMarkdown(page, projectName) {
  const { viewButton, overlayCloseButton } = artifactLocators(page);
  const expectedTitle = `${projectName}`;

  await expect(viewButton).toBeVisible({ timeout: 10000 });
  await viewButton.click();
  await expect(page.getByText(/Functional Requirements Document/i).first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[role="dialog"] h1')).toHaveText(expectedTitle);
  await expect(overlayCloseButton).toBeEnabled({ timeout: 5000 });
  await overlayCloseButton.click();
  await expect(overlayCloseButton).not.toBeVisible({ timeout: 5000 });
}

export async function validatePlainHtmlInNewWindow(page, projectName) {
  const { viewButton, artifactPreviewDialog } = artifactLocators(page);

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
}

export async function validatePlainMarkdownInNewWindow(page, projectName) {
  const {
    viewButton,
    mrkdwnOpenButton,
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
}

export async function reviewArtifactsPage(page, projectId) {
  const { artifactsHeading, refreshArtifactsButton, artifactsTable, emptyArtifactsHeading, infoIconOnArtifactsPage } = artifactLocators(page);

  await openArtifactsMenu(page, projectId);
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

export async function downloadArtifactPlainMarkdown(page, projectId) {
  const {
    downloadDocumentationBtn,
    generateFunctionalDialog,
    dwnldArtifactPlainMarkdownBtn,
    artifactReady,
  } = artifactLocators(page);

  await ensureArtifactsPage(page, projectId);
  await expect(downloadDocumentationBtn).toBeVisible({ timeout: 10000 });
  await expect(downloadDocumentationBtn).toBeEnabled({ timeout: 10000 });
  await downloadDocumentationBtn.click();

  await expect(generateFunctionalDialog).toBeVisible({ timeout: 10000 });
  await expect(dwnldArtifactPlainMarkdownBtn).toBeVisible({ timeout: 10000 });
  await expect(dwnldArtifactPlainMarkdownBtn).toBeEnabled({ timeout: 10000 });
  await dwnldArtifactPlainMarkdownBtn.click();
  await expect(artifactReady).toBeVisible({ timeout: 10000 });
}
