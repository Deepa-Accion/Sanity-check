import { test, expect } from "../auth.fixture.mjs";
import fs from "fs";
import {
  downloadArtifactPlainHtml,
  reviewArtifactsPage,
  validateCopyPlainHtmlContent,
  downloadArtifactPlainMarkdown,
  validateDownloadedPlainHtml,
  validateDownloadedPlainMarkdown,
  validatePlainMarkdownInNewWindow,
  validatePlainHtmlInNewWindow,
  validateCopyPlainMarkdownContent,
  searchAndValidateRecord,
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
    
  });

  // No fixture needed — sharedPage is already authenticated and open
  test.afterAll(async () => {
    try {
      await cleanupCreatedProjects(sharedPage, createdProjectNames);
    } finally {
      await sharedContext?.close();
    }
  });

  // Each test navigates the shared page to the artifacts URL before running
  test("@regression @artifact @downloadartifact download artifact plain html from the artifacts page", async () => {
    await sharedPage.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    await reviewArtifactsPage(sharedPage, projectId);
    lastFoundRecordsCount = await downloadArtifactPlainHtml(sharedPage, projectId, lastFoundRecordsCount);
    await validateCopyPlainHtmlContent(sharedPage, projectName, projectId);
    await validateDownloadedPlainHtml(sharedPage, projectName);
    await validatePlainHtmlInNewWindow(sharedPage, projectName);
    console.log(`[PASS] download artifact plain html`);
  });

  test("@regression @artifact @downloadartifact download artifact plain markdown from the artifacts page", async () => {
    await sharedPage.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    lastFoundRecordsCount = await downloadArtifactPlainMarkdown(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainMarkdown(sharedPage, projectName);
    await validateCopyPlainMarkdownContent(sharedPage, projectName, projectId);
    await validatePlainMarkdownInNewWindow(sharedPage, projectName);
    console.log(`[PASS] download artifact plain markdown`);
  });

  test("@regression @artifact download artifact when already one or more artifact exists", async () => {
    await sharedPage.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    lastFoundRecordsCount = await downloadArtifactPlainHtml(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainHtml(sharedPage, projectName);
    lastFoundRecordsCount = await downloadArtifactPlainMarkdown(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainMarkdown(sharedPage, projectName);
    console.log(`[PASS] download artifact when already one or more exists`);
  });

  test("@regression @artifact validate search functionality on artifacts page", async () => {
    await sharedPage.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    lastFoundRecordsCount = await downloadArtifactPlainMarkdown(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainMarkdown(sharedPage, projectName);
    lastFoundRecordsCount = await downloadArtifactPlainHtml(sharedPage, projectId, lastFoundRecordsCount);
    await validateDownloadedPlainHtml(sharedPage, projectName);
    await searchAndValidateRecord(sharedPage);
    console.log(`[PASS] validate search functionality`);
  });
});
