import { test } from "../auth.fixture.mjs";
import fs from "fs";
import { expect } from '@playwright/test';

import {
  downloadArtifactPlainHtml,
  reviewArtifactsPage,
  validateCopyPlainHtmlContent,
  downloadArtifactPlainMarkdown,
  downloadPlainHtmlFromArtifactPreview,
  downloadPlainMarkdownFromArtifactPreview,
  validateDownloadedPlainHtml,
  validateDownloadedPlainMarkdown,
  validatePlainMarkdownInNewWindow,
  validatePlainHtmlInNewWindow,
  validateCopyPlainMarkdownContent,
  searchAndValidateRecord,
  validateDownloadedHtmlFromPreviewPage,
  validateDownloadedMarkdownFromPreviewPage,
  deleteLatestArtifactRecord,
  attemptDeleteArtifactRecordButCancel,  

} from "../../Pages/artifactsPage.js";
import { DEFAULT_BASE_URL } from "../../Pages/dashboardPage.js";
import { ensureOnboardingPage } from "../../Pages/knowlegeBase.js";
import {
  ensureProjectCreated,
  prepareFunctionalMetrics,
  cleanupCreatedProjects,
} from "./regression-utils.mjs";

// Read OIDC session token to inject into the shared page (mirrors auth.fixture.mjs)
let sessionAuth = null;
try {
  const raw = fs.readFileSync(new URL("../../session-auth.json", import.meta.url), "utf-8");
  sessionAuth = JSON.parse(raw);
} catch (e) {
  console.warn("[artifacts] session-auth.json not found — shared page may be unauthenticated");
}

const createdProjectNames = new Set();

test.describe("Regression - Artifacts", () => {
  // Serial mode: tests run one-after-another and share a single browser page.
  // This allows beforeAll/afterAll to hold the shared page for all 4 tests.
  test.describe.configure({ mode: "serial" });

  let projectName = "";
  let projectId = "";
  let lastFoundRecordsCount = 0;
  let sharedContext = null;
  let sharedPage = null;

  test.beforeAll(async ({ browser }) => {
    // Create one authenticated page shared by all artifact tests
    sharedContext = await browser.newContext({ storageState: "auth.json" });
    sharedPage = await sharedContext.newPage();

    // Inject OIDC token into sessionStorage before every navigation
    // (same as what auth.fixture.mjs does for the per-test page fixture)
    if (sessionAuth?.key && sessionAuth?.value) {
      await sharedPage.addInitScript(({ key, value }) => {
        try {
          const v = typeof value === "string" ? value : JSON.stringify(value);
          window.sessionStorage.setItem(key, v);
        } catch (e) {}
      }, { key: sessionAuth.key, value: sessionAuth.value });
    }
    await sharedPage.addInitScript(() => {
      try { document.documentElement.style.zoom = "100%"; } catch (e) {}
    });

    // Full setup — runs once before all artifact tests
    await sharedPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });

    const projectState = {};
    await ensureProjectCreated(sharedPage, projectState);
    await ensureOnboardingPage(sharedPage, projectState.projectId);
    await prepareFunctionalMetrics(sharedPage, projectState);
    projectName = projectState.projectName;
    projectId = projectState.projectId;
    createdProjectNames.add(projectName);

    // Navigating to the shared page of artifacts before running any tests
    await sharedPage.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
  });

  // No fixture needed — sharedPage is already authenticated and open
  test.afterAll(async () => {
    try {
      await cleanupCreatedProjects(sharedPage, createdProjectNames);
    } finally {
      await sharedContext?.close();
    }
  });

  test("@regression @artifact @downloadartifact download artifact plain html from the artifacts page", async () => {
    await reviewArtifactsPage(sharedPage, projectId);
    lastFoundRecordsCount = await downloadArtifactPlainHtml(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainHtml(sharedPage, projectName);
    await validateCopyPlainHtmlContent(sharedPage, projectName, projectId);
    await validatePlainHtmlInNewWindow(sharedPage, projectName);
    console.log(`[PASS] download artifact plain html`);
  });

  test("@regression @artifact @downloadartifact download artifact plain markdown from the artifacts page", async () => {
    lastFoundRecordsCount = await downloadArtifactPlainMarkdown(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainMarkdown(sharedPage, projectName);
    await validateCopyPlainMarkdownContent(sharedPage, projectName, projectId);
    await validatePlainMarkdownInNewWindow(sharedPage, projectName);
    console.log(`[PASS] download artifact plain markdown`);
  });

  test("@regression @artifact download artifact when already one or more artifact exists", async () => {
    lastFoundRecordsCount = await downloadArtifactPlainHtml(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainHtml(sharedPage, projectName);
    lastFoundRecordsCount = await downloadArtifactPlainMarkdown(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainMarkdown(sharedPage, projectName);
    console.log(`[PASS] download artifact when already one or more exists`);
  });

  test("@regression @artifact validate search functionality on artifacts page", async () => {
    lastFoundRecordsCount = await downloadArtifactPlainMarkdown(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainMarkdown(sharedPage, projectName);
    lastFoundRecordsCount = await downloadArtifactPlainHtml(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainHtml(sharedPage, projectName);
    await searchAndValidateRecord(sharedPage);
    console.log(`[PASS] validate search functionality`);
  });

  test("@regression @artifact download plain HTML from the side preview", async () => {
    lastFoundRecordsCount = await downloadArtifactPlainHtml(sharedPage, projectId, lastFoundRecordsCount);
    const download = await downloadPlainHtmlFromArtifactPreview(sharedPage, projectName);
    console.log("[HTML preview] Waiting for the browser download before validating the file");
    await validateDownloadedHtmlFromPreviewPage(download, projectName);
    console.log("[HTML preview] File validation complete");
  });

  test("@regression @artifact download plain Markdown from the side preview", async () => {
    lastFoundRecordsCount = await downloadArtifactPlainMarkdown(sharedPage, projectId, lastFoundRecordsCount);
    const download = await downloadPlainMarkdownFromArtifactPreview(sharedPage, projectName);
    console.log("[Markdown preview] Waiting for the browser download before validating the file");
    await validateDownloadedMarkdownFromPreviewPage(download, projectName);
    console.log("[Markdown preview] File validation complete");
  });

  test("@regression @artifact download the functional artifact record and delete it", async () => {
    lastFoundRecordsCount = await downloadArtifactPlainHtml(sharedPage, projectId, lastFoundRecordsCount);
    const currentRecordCount = await attemptDeleteArtifactRecordButCancel(sharedPage);
    expect(currentRecordCount, "Record count should remain the same after canceling deletion").toBe(lastFoundRecordsCount);
    lastFoundRecordsCount = await deleteLatestArtifactRecord(sharedPage, lastFoundRecordsCount);
    lastFoundRecordsCount = await downloadArtifactPlainMarkdown(sharedPage, projectId, lastFoundRecordsCount);
    const currentRecordCount2 = await attemptDeleteArtifactRecordButCancel(sharedPage);
    expect(currentRecordCount2, "Record count should remain the same after canceling deletion").toBe(lastFoundRecordsCount);
    lastFoundRecordsCount = await deleteLatestArtifactRecord(sharedPage, lastFoundRecordsCount);
    console.log("record deletion successfully verified");
  });
});
