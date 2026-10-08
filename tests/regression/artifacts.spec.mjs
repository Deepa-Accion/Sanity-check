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
  validateMultipleRecordsVisible,
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

test.describe("Regression - Artifacts @enduser", () => {
  // Serial mode: tests run one-after-another and share a single browser page.
  // This allows beforeAll/afterAll to hold the shared page for all 4 tests.
  test.describe.configure({ mode: "serial" });

  let projectName = "";
  let projectId = "";
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

    await sharedPage.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    await expect(sharedPage.getByRole("heading", { name: "Artifacts", exact: true })).toBeVisible({ timeout: 15000 });

    // Wait until at least 1 artifact row exists — confirms persona generation has propagated
    await expect.poll(
      async () => {
        const count = await sharedPage
          .getByRole("row")
          .filter({ hasText: /Functional/i })
          .count()
          .catch(() => 0);
        if (count === 0) {
          await sharedPage.reload({ waitUntil: "domcontentloaded" });
          await sharedPage.waitForTimeout(3000);
        }
        return count;
      },
      {
        timeout: 120000,
        intervals: [5000, 10000, 15000],
        message: "Expected at least 1 artifact row (persona not yet generated)",
      }
    ).toBeGreaterThan(0);

    console.log("[artifacts.beforeAll] Project ready — artifact rows confirmed");
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
    await downloadArtifactPlainHtml(sharedPage, projectId);
    await validateCopyPlainHtmlContent(sharedPage, projectName, projectId);
    await validateDownloadedPlainHtml(sharedPage, projectName);
    await validatePlainHtmlInNewWindow(sharedPage, projectName);
    console.log(`[PASS] download artifact plain html`);
  });

  test("@regression @artifact @downloadartifact download artifact plain markdown from the artifacts page", async () => {
    await sharedPage.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    await downloadArtifactPlainMarkdown(sharedPage, projectId);
    await validateDownloadedPlainMarkdown(sharedPage, projectName);
    await validateCopyPlainMarkdownContent(sharedPage, projectName, projectId);
    await validatePlainMarkdownInNewWindow(sharedPage, projectName);
    console.log(`[PASS] download artifact plain markdown`);
  });

  test("@regression @artifact download artifact when already one artifact exists", async () => {
    await sharedPage.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    await downloadArtifactPlainHtml(sharedPage, projectId);
    await validateDownloadedPlainHtml(sharedPage, projectName);
    await downloadArtifactPlainMarkdown(sharedPage, projectId);
    await validateMultipleRecordsVisible(sharedPage);
    await validateDownloadedPlainMarkdown(sharedPage, projectName);
    console.log(`[PASS] download artifact when already one exists`);
  });

  test("@regression @artifact validate search functionality on artifacts page", async () => {
    await sharedPage.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    await downloadArtifactPlainMarkdown(sharedPage, projectId);
    await validateDownloadedPlainMarkdown(sharedPage, projectName);
    await downloadArtifactPlainHtml(sharedPage, projectId);
    await validateMultipleRecordsVisible(sharedPage);
    await validateDownloadedPlainHtml(sharedPage, projectName);
    await searchAndValidateRecord(sharedPage);
    console.log(`[PASS] validate search functionality`);
  });
});
