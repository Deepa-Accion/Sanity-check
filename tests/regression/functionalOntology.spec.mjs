import { test, expect } from "../auth.fixture.mjs";
import { DEFAULT_BASE_URL } from "../../Pages/dashboardPage.js";
import {
  openCreateProject,
  cleanupCreatedProjects,
} from "./regression-utils.mjs";
import fs from "fs";
import { uploadFirstDocumentForProject } from "../../Pages/knowlegeBase.js";

// Mirrors auth.fixture: load OIDC session so beforeAll can inject it manually
let sessionAuth = null;
try {
  const raw = fs.readFileSync(new URL("../../session-auth.json", import.meta.url), "utf-8");
  sessionAuth = JSON.parse(raw);
} catch {
  // no session-auth.json — tests run unauthenticated
}

const createdProjectNames = new Set();
let sharedPage;
let sharedContext;

test.describe("Regression — Functional Ontology", () => {
  // page is test-scoped in Playwright, so beforeAll receives browser (worker-scoped) instead.
  // We create our own context + page and apply the same auth init scripts as auth.fixture.
  test.beforeAll(async ({ browser }) => {
    sharedContext = await browser.newContext();
    sharedPage = await sharedContext.newPage();

    if (process.env.LOCALHOST_RUN !== "true" && sessionAuth?.key && sessionAuth?.value) {
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

    const currentDateTime = new Date().toISOString().replace(/[:.]/g, "-");
    const projectName = `regression Functional ontology ${currentDateTime}`;
    const createProjectPage = await openCreateProject(sharedPage);
    await createProjectPage.fillProjectName(projectName);
    await createProjectPage.save();
    createdProjectNames.add(projectName);
  });

  test.afterAll(async () => {
    if (sharedPage) {
      await cleanupCreatedProjects(sharedPage, createdProjectNames);
    }
    await sharedContext?.close();
  });

  test("@regression @functionalontology @validation BreezeAI create project with tag", async ({ page }) => {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await ensureProjectOpen(page, sharedPage, createdProjectNames);
    await page.waitForTimeout(2000);
    await page.goto(`${DEFAULT_BASE_URL}dashboard/${createdProjectNames.values().next().value}`);
    await page.waitForTimeout(2000);
    await uploadFirstDocumentForProject(page, "txt");
    await page.waitForTimeout(2000);
    await generateFunctionalOntology(page, createdProjectNames.values().next().value);
  });
});
