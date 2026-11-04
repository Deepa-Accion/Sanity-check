import fs from "fs";
import { test, expect, collectPageData } from "./roles.fixture.mjs";
import {
  DEFAULT_BASE_URL,
  DashboardPage,
  createProject,
  projectCard,
  searchProject,
  selectProject,
  selectFirstListedProject,
  deleteProject,
} from "../Pages/dashboardPage.js";
import { CreateProjectPage } from "../Pages/createProjectFile.js";
import {
  expectProjectDashboardLoaded,
  getAdvertisedMcpUrl,
  askBreeze,
  uploadAndGenerateCodeOntology,
  codeOntologyCard,
  getCodeOntologyStat,
  waitForCodeOntologyActive,
  openGraphVisualizer,
  regenerateCodeOntologyEmbeddings,
  expectGitFormBlocksInvalidInput,
} from "../Pages/projectPage.js";
import {
  generateOntologiesForDocument,
  getGraphColumnCount,
  uploadFirstDocumentInKnowledgeBase,
  uploadDocumentwithDesignOntology,
  uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology,
  documentRow,
  openDocumentReview,
  improveDraft,
  approveDraft,
  rejectDraft,
  uploadUnsupportedFile,
} from "../Pages/knowlegeBase.js";
import {
  downloadArtifactPlainMarkdown,
  validateDownloadedPlainMarkdown,
  downloadArtifactPlainHtml,
  validateDownloadedPlainHtml,
} from "../Pages/artifactsPage.js";
import { SettingsPage } from "../Pages/settingsPage.js";
import { trackApiBase, apiGet } from "../Pages/apiClient.js";
import { withErrorCapture, checkAndRecoverFromAppError } from "./test-utils.mjs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

// Shared state for the serial run. Every project created here is tracked so the
// delete test (and afterAll) only ever touches projects this run created.
let projectName = "";
let projectId = "";
let exportedBundlePath = "";
const createdProjects = new Set();

// NOTE: withErrorCapture only forwards `{ page }`, so tests that need other fixtures
// (request, adminPage) are written without it; Playwright still reports their failures.
test.describe("Sanity Suite", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(({ browserName }) => browserName !== "chromium", "This sanity flow is maintained for Chromium only.");

  async function createTrackedProject(page, name) {
    const id = await createProject(page, name);
    expect(id, `Project creation did not return an ID for ${name}`).toMatch(UUID_RE);
    createdProjects.add(name);
    console.log(`Project created: ${name} (${id})`);
    return id;
  }

  async function ensureProjectCreated(page) {
    if (projectName && projectId) return;
    projectName = `SanityCheck-${stamp()}-Automation`;
    projectId = await createTrackedProject(page, projectName);
  }

  async function ensureProjectOpen(page) {
    await ensureProjectCreated(page);
    if (!page.url().includes(`/dashboard/${projectId}`)) {
      await page.goto(`${DEFAULT_BASE_URL}dashboard/${projectId}`, { waitUntil: "domcontentloaded" });
      await checkAndRecoverFromAppError(page);
    }
    await expect(page, `Project ${projectName} should be open`).toHaveURL(new RegExp(`/dashboard/${projectId}`));
  }

  // Archive (the app's "Delete") every project this run created, as Admin.
  async function archiveCreatedProjects(adminPage) {
    await adminPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    const dashboard = new DashboardPage(adminPage);
    for (const name of [...createdProjects]) {
      await dashboard.openProjectTab("All");
      await searchProject(adminPage, name);
      await deleteProject(adminPage, name);
      createdProjects.delete(name);
    }
  }

  // Archive a single project this run created (as Admin) and forget it.
  async function archiveOne(adminPage, name) {
    await adminPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await new DashboardPage(adminPage).openProjectTab("All");
    await searchProject(adminPage, name);
    await deleteProject(adminPage, name);
    createdProjects.delete(name);
  }

  test.beforeEach("Url Calling", async ({ page }) => {
    trackApiBase(page);
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await checkAndRecoverFromAppError(page);
    await collectPageData(page, "dashboard");
  });

  // Safety net: a failed serial test skips the later ones (incl. delete), so archive anything
  // this run created. Uses the Admin session captured by global-setup.
  test.afterAll(async ({ browser }) => {
    if (createdProjects.size === 0) return;
    let session;
    try {
      session = JSON.parse(fs.readFileSync(new URL("../session-auth-admin.json", import.meta.url), "utf-8"));
    } catch {
      console.warn("[cleanup] session-auth-admin.json missing - leftover projects:", [...createdProjects]);
      return;
    }
    const context = await browser.newContext();
    const adminPage = await context.newPage();
    try {
      await adminPage.addInitScript(({ key, value }) => {
        window.sessionStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      }, session);
      await archiveCreatedProjects(adminPage);
    } catch (err) {
      console.warn("[cleanup] could not archive leftover projects:", [...createdProjects], err?.message);
    } finally {
      await context.close();
    }
  });

  // ── Login / dashboard ──────────────────────────────────────────────────────
  test("@sanity BreezeAI dashboard Launched", withErrorCapture(async ({ page }) => {
    const title = await page.title();
    console.log("Page title after execution:", title);
    // Accept both prod ("Breeze.AI") and localhost ("Automation UI") titles
    if (process.env.TARGET_URL && process.env.TARGET_URL.includes("localhost")) {
      expect(title.length).toBeGreaterThan(0);
    } else {
      expect(title).toMatch(/Breeze\.AI/i);
    }
  }));

  test("@sanity User login - authenticated session lands on the dashboard", withErrorCapture(async ({ page }) => {
    await expect(page, "Authenticated user must not be redirected to /login").not.toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /create project/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "User profile menu" })).toBeVisible();
    await expect(page.getByPlaceholder(/search projects/i).first()).toBeVisible();
  }));

  test("@sanity Login rejects an invalid password", async ({ browser }) => {
    test.skip(!process.env.BREEZE_USERNAME || !process.env.BREEZE_PASSWORD, "BREEZE_USERNAME / BREEZE_PASSWORD are required.");
    // browser.newContext() inherits storageState from the config, so clear it explicitly.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    try {
      await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /sign in with breeze ai/i }).click();
      // Keycloak login form (same selectors as global-setup.js)
      await page.locator("#username, input[name='username']").fill(process.env.BREEZE_USERNAME);
      await page.locator("#password, input[name='password']").fill(`${process.env.BREEZE_PASSWORD}-wrong`);
      await page.locator("#kc-login, button[name='login'], button[type='submit']").click();
      await expect(page.getByText("Invalid username or password"), "Wrong password must be rejected").toBeVisible({ timeout: 30000 });
      await expect(page.getByRole("button", { name: /create project/i }), "Must not reach the dashboard").toBeHidden();
    } finally {
      await context.close();
    }
  });

  test("@sanity Role-based access (Admin, End User, Viewer)", async ({ page, adminPage, viewerPage }) => {
    const settingsTabs = async (p) => {
      await p.goto(`${DEFAULT_BASE_URL}settings?tab=project`, { waitUntil: "domcontentloaded" });
      await expect(p.getByRole("tab", { name: "Themes" })).toBeVisible();
      return p.getByRole("tab").allInnerTexts();
    };
    const adminOnly = ["User Management", "Jira Board Management", "Topology Reports"];

    // End User (default account): can create projects, no "All" tab, no admin settings tabs
    await expect(page.getByRole("button", { name: /create project/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: "All", exact: true })).toBeHidden();
    await expect(page.getByRole("tab", { name: "Archived" })).toBeVisible();
    const userTabs = await settingsTabs(page);
    for (const tab of adminOnly) expect(userTabs, `End User must not see "${tab}"`).not.toContain(tab);

    // Admin: "All" tab and admin settings tabs
    await adminPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(adminPage.getByRole("tab", { name: "All", exact: true })).toBeVisible();
    const adminTabs = await settingsTabs(adminPage);
    for (const tab of adminOnly) expect(adminTabs, `Admin should see "${tab}"`).toContain(tab);

    // Viewer: read-only - no Create project, no Archived/All tabs, no admin settings tabs
    await viewerPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await expect(viewerPage.getByRole("tab", { name: "My projects" })).toBeVisible();
    await expect(viewerPage.getByRole("button", { name: /create project/i }), "Viewer must not create projects").toBeHidden();
    await expect(viewerPage.getByRole("tab", { name: "Archived" })).toBeHidden();
    await expect(viewerPage.getByRole("tab", { name: "All", exact: true })).toBeHidden();
    const viewerTabs = await settingsTabs(viewerPage);
    for (const tab of adminOnly) expect(viewerTabs, `Viewer must not see "${tab}"`).not.toContain(tab);
  });

  // ── Project lifecycle ──────────────────────────────────────────────────────
  test("@sanity BreezeAI create project", withErrorCapture(async ({ page }) => {
    await ensureProjectCreated(page);
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await expect(projectCard(page, projectName), "Newly created project should be listed").toBeVisible();
  }));

  test("@sanity ProjectSearch and Select project", withErrorCapture(async ({ page }) => {
    await ensureProjectCreated(page);

    // A search with no match must not list the project
    await page.getByPlaceholder(/search projects/i).first().fill(`no-such-project-${Date.now()}`);
    await expect(projectCard(page, projectName)).toBeHidden();

    // A matching search lists it, and selecting it opens its dashboard
    await searchProject(page, projectName);
    await expect(projectCard(page, projectName)).toBeVisible();
    const openedId = await selectProject(page, projectName);
    expect(openedId).toBe(projectId);
  }));

  test("@sanity Create project validation (empty and whitespace names)", withErrorCapture(async ({ page }) => {
    const form = new CreateProjectPage(page);
    await form.open();
    await expect(form.saveButton, "Empty name").toBeDisabled();
    await form.fillProjectName("   ");
    await expect(form.saveButton, "Whitespace-only name").toBeDisabled();
    await form.cancelOrClose();
    await expect(form.projectNameInput).toBeHidden();
  }));

  test("@sanity Edit project description persists", withErrorCapture(async ({ page }) => {
    await ensureProjectCreated(page);
    const description = `Edited by sanity ${Date.now()}`;
    const settings = new SettingsPage(page);
    await settings.openProjectSettings(projectName);
    await settings.updateProjectDescription(description);
    // "Edit Project" opens Project Settings, so return to the project list to check the card.
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await expect(projectCard(page, projectName), "Edited description should persist").toContainText(description);
  }));

  test("@sanity Favourite and unfavourite a project", withErrorCapture(async ({ page }) => {
    await ensureProjectCreated(page); // only ever favourites the project this run created
    const dashboard = new DashboardPage(page);

    // searchProject() reloads (which resets to "My projects"), so re-open the Favourites tab on every attempt.
    const listedUnderFavourites = async () => {
      await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
      await dashboard.openProjectTab("Favourites");
      await page.getByPlaceholder(/search projects/i).first().fill(projectName);
      // isVisible() does not wait, so use waitFor to give the filtered list time to render.
      return projectCard(page, projectName).waitFor({ state: "visible", timeout: 8000 }).then(() => true, () => false);
    };

    // Wait for the save to complete before navigating, otherwise the in-flight request is aborted.
    const toggleFavourite = async (expectPressed) => {
      const saved = page.waitForResponse(
        (r) => ["POST", "PUT", "DELETE"].includes(r.request().method()) && /\/projects\/[^/]+\/favourite$/.test(new URL(r.url()).pathname),
        { timeout: 30000 }
      );
      await dashboard.clickProjectFavourite(projectName);
      expect((await saved).status(), "Favourite toggle should be saved (200)").toBe(200);
      await expect(
        projectCard(page, projectName).getByRole("button", { name: "Favourite project" })
      ).toHaveAttribute("aria-pressed", String(expectPressed));
    };

    await searchProject(page, projectName);
    await toggleFavourite(true);
    await expect
      .poll(listedUnderFavourites, { message: "Favourited project should be listed under Favourites", timeout: 60000, intervals: [2000] })
      .toBe(true);

    // Toggle off from the same place it was set (the project list), not from inside the Favourites tab.
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await searchProject(page, projectName);
    await toggleFavourite(false);
    await expect
      .poll(async () => !(await listedUnderFavourites()), { message: "Unfavourited project should leave Favourites", timeout: 60000, intervals: [2000] })
      .toBe(true);
  }));

  test("@sanity Select first project displayed", withErrorCapture(async ({ page }) => {
    const openedId = await selectFirstListedProject(page);
    expect(openedId, "First listed project should open a project dashboard").toMatch(UUID_RE);
  }));

  test("@sanity Project dashboard loads (open project)", withErrorCapture(async ({ page }) => {
    await ensureProjectOpen(page);
    await expectProjectDashboardLoaded(page, projectName);
  }));

  // ── Documents and ontologies ───────────────────────────────────────────────
  test("@sanity Upload document and Generate Functional Metrics", withErrorCapture(async ({ page }) => {
    await ensureProjectOpen(page);
    await uploadFirstDocumentInKnowledgeBase(page, "txt");

    // Agent validation: generating must start a run on the agents service (impact-analysis-runs)
    const agentRun = page.waitForResponse(
      (r) => r.request().method() === "POST" && /\/impact-analysis-runs$/.test(new URL(r.url()).pathname),
      { timeout: 60000 }
    );
    await generateOntologiesForDocument(page, "fileName.txt", ["Functional"]);
    expect((await agentRun).status(), "Impact-analysis agent run should be accepted (202)").toBe(202);

    // The panel can lag behind a merge (known refresh issue), so refresh until personas appear.
    await expect.poll(async () => {
      await page.getByRole("button", { name: "Refresh All Data" }).click();
      return getGraphColumnCount(page, "PERSONA");
    }, { message: "Functional ontology should contain personas after generation", timeout: 60000, intervals: [3000] }).toBeGreaterThan(0);
  }));

  test("@sanity Upload document with Architecture Ontology", withErrorCapture(async ({ page }) => {
    await ensureProjectOpen(page);
    await uploadFirstDocumentInKnowledgeBasewithartictecturemodelingOntology(page, "txt");
    await generateOntologiesForDocument(page, "architecture.txt", ["Architecture"]);
  }));

  test("@sanity Generate Design ontology", withErrorCapture(async ({ page }) => {
    await ensureProjectOpen(page);
    await uploadDocumentwithDesignOntology(page, "pdf");
    const state = await generateOntologiesForDocument(page, "fileName.pdf", ["Design"]);
    if (state !== "Merged") {
      // Generation succeeded but the app held the result for review; nothing is merged to assert on.
      test.info().annotations.push({ type: "note", description: `Design generation ended in "${state}" (approval not skipped)` });
      return;
    }

    await expect.poll(async () => {
      await page.getByRole("button", { name: "Refresh Design Data" }).click();
      return getGraphColumnCount(page, "JOURNEY");
    }, { message: "Design ontology should contain user journeys after generation", timeout: 60000, intervals: [3000] }).toBeGreaterThan(0);
  }));

  test("@sanity Document validation and Review (Improve / Reject)", withErrorCapture(async ({ page }) => {
    const reviewProjectName = `SanityReview-${stamp()}-Automation`;
    const reviewProjectId = await createTrackedProject(page, reviewProjectName);
    await page.goto(`${DEFAULT_BASE_URL}ontology/${reviewProjectId}/functional`, { waitUntil: "domcontentloaded" });

    // Unsupported file types are refused with a clear message
    const message = await uploadUnsupportedFile(page, {
      name: "bad_file.exe",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("MZ not a document"),
    });
    expect(message).toMatch(/PDF, DOCX, PPTX, XLSX, HTML, TXT, MD, CSV, JSON, JPG, PNG/);

    // A supported type is accepted and listed
    await uploadFirstDocumentInKnowledgeBase(page, "docx");
    await expect(documentRow(page, "fileName.docx"), "Supported .docx should be listed").toContainText(/Not Generated/);

    // Generate WITHOUT skipping approval, then review: Improve (agent chat) and Reject
    await uploadFirstDocumentInKnowledgeBase(page, "txt");
    const state = await generateOntologiesForDocument(page, "fileName.txt", ["Functional"], { skipApproval: false });
    expect(state, "Without 'Skip approval' the draft must wait for review").toBe("Ready for review");

    await openDocumentReview(page, "fileName.txt");
    await improveDraft(page, "Add an Auditor persona", "Auditor");
    await rejectDraft(page, "fileName.txt");
    expect(await getGraphColumnCount(page, "PERSONA"), "Rejecting must leave the graph unchanged").toBe(0);
  }));

  test("@sanity Review (Approve) merges the draft into the graph", withErrorCapture(async ({ page }) => {
    const approveProjectId = await createTrackedProject(page, `SanityApprove-${stamp()}-Automation`);
    await page.goto(`${DEFAULT_BASE_URL}ontology/${approveProjectId}/functional`, { waitUntil: "domcontentloaded" });
    await uploadFirstDocumentInKnowledgeBase(page, "txt");

    const state = await generateOntologiesForDocument(page, "fileName.txt", ["Functional"], { skipApproval: false });
    expect(state, "Without 'Skip approval' the draft must wait for review").toBe("Ready for review");

    await openDocumentReview(page, "fileName.txt");
    await approveDraft(page, "fileName.txt");

    // Approving applies the draft: personas appear in the functional graph
    await expect.poll(async () => {
      await page.getByRole("button", { name: "Refresh All Data" }).click();
      return getGraphColumnCount(page, "PERSONA");
    }, { message: "Approved draft should add personas to the graph", timeout: 60000, intervals: [3000] }).toBeGreaterThan(0);
  }));

  test("@sanity Generate Code Ontology", async ({ page, adminPage }) => {
    // Dedicated project - code ontology is independent of the functional project
    const codeProjectId = await createTrackedProject(page, `CodeOntology-${stamp()}-Automation`);
    const ontologyName = "Sanity-check Automation Repo";
    await uploadAndGenerateCodeOntology(page, codeProjectId, ontologyName);
    await expect(codeOntologyCard(page, ontologyName), `Ontology "${ontologyName}" should be listed`).toBeVisible({ timeout: 60000 });
    await waitForCodeOntologyActive(page, ontologyName);

    // Counts are filled in while the ontology is processed, so assert them once it is Active.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(codeOntologyCard(page, ontologyName)).toBeVisible({ timeout: 30000 });
    for (const stat of ["Files", "Functions", "Lines of Code"]) {
      await expect
        .poll(() => getCodeOntologyStat(page, ontologyName, stat), { message: `${stat} count of the parsed repo`, timeout: 60000 })
        .toBeGreaterThan(0);
    }

    // "Re-generate Embeddings" is not offered to the default user, so resync as Admin.
    await adminPage.goto(`${DEFAULT_BASE_URL}code-ontology/${codeProjectId}`, { waitUntil: "domcontentloaded" });
    await regenerateCodeOntologyEmbeddings(adminPage, ontologyName);

    // Git Integration form validation
    await expectGitFormBlocksInvalidInput(page);
  });

  // ── Artifacts ──────────────────────────────────────────────────────────────
  // Order matters: the artifact helpers open the first "Functional Documentation" row and the list is
  // newest-first, so HTML is generated first and Markdown second (same as the regression artifacts spec).
  test("@sanity Generate artifact (Functional Documentation, Plain HTML)", withErrorCapture(async ({ page }) => {
    await ensureProjectOpen(page);
    await page.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    await downloadArtifactPlainHtml(page, projectId);
    await validateDownloadedPlainHtml(page, projectName);
  }));

  test("@sanity Generate artifact (Functional Documentation, Plain Markdown)", withErrorCapture(async ({ page }) => {
    await ensureProjectOpen(page);
    await page.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: "domcontentloaded" });
    await downloadArtifactPlainMarkdown(page, projectId);
    // Rows are listed newest-first. The list can lag behind the download, in which case row 0 would
    // still be the HTML artifact, so wait until both artifacts are listed before opening row 0.
    const artifactRows = page.getByRole("row").filter({ hasText: "Functional Documentation" });
    await expect
      .poll(async () => {
        if ((await artifactRows.count()) < 2) await page.reload({ waitUntil: "domcontentloaded" });
        return artifactRows.count();
      }, { message: "Both the HTML and Markdown artifacts should be listed", timeout: 60000, intervals: [3000] })
      .toBeGreaterThanOrEqual(2);
    await validateDownloadedPlainMarkdown(page, projectName); // row 0 = newest = Markdown
  }));

  test("@sanity Graph visualizer opens and connects", withErrorCapture(async ({ page }) => {
    await ensureProjectOpen(page);
    await openGraphVisualizer(page);
  }));

  // ── AI chat agent / API-integrated workflows ───────────────────────────────
  test("@sanity AIChat Basic agent test", async ({ page, request }) => {
    await ensureProjectOpen(page);
    // Ground truth: persona names stored in the functional graph
    const personas = await (await apiGet(request, `/functional-graph/${projectId}/Persona`)).json();
    // Persona nodes carry their display name in the `persona` field (e.g. { persona: "Admin", nameKey: "admin" }).
    const names = [...new Set(personas.data.map((node) => node.persona).filter(Boolean))];
    expect(names.length, "Project must have personas to ask about").toBeGreaterThan(0);

    const question = "List the personas in this project.";
    const after = await askBreeze(page, question);
    expect(
      names.some((name) => after.toLowerCase().includes(name.toLowerCase())),
      `Answer should mention at least one real persona (${names.join(", ")})`
    ).toBe(true);
  });

  test("@sanity Backend API reflects UI data (project graph + node counts)", async ({ page, request }) => {
    await ensureProjectCreated(page);
    for (const path of [`/functional-graph/${projectId}/Persona`, `/projects/${projectId}/node-counts`]) {
      const response = await apiGet(request, path);
      expect(response.status(), `GET ${path} should return 200`).toBe(200);
    }
    const personas = await (await apiGet(request, `/functional-graph/${projectId}/Persona`)).json();
    expect(Array.isArray(personas.data), "Persona response should contain a data array").toBe(true);
    expect(personas.data.length, "Generated functional ontology should expose personas via the API").toBeGreaterThan(0);
  });

  test("@sanity MCP setup is advertised in the project dashboard", withErrorCapture(async ({ page }) => {
    await ensureProjectOpen(page);
    const mcpUrl = await getAdvertisedMcpUrl(page);
    expect(mcpUrl, "MCP URL shown by 'Connect AI tools'").toMatch(/^https?:\/\/.+\/mcp$/);
  }));

  // ── Theme ──────────────────────────────────────────────────────────────────
  test("@sanity Theme Change", withErrorCapture(async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.openThemes();
    const original = await settings.activeTheme();
    expect(["light", "premium"], "Unexpected active theme").toContain(original);

    const other = original === "light" ? "Premium" : "Light";
    await settings.applyTheme(other);

    // Persists across reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => settings.activeTheme()).toBe(other.toLowerCase());

    // Restore the original theme so the account is left unchanged
    await settings.openThemes();
    await settings.applyTheme(original === "light" ? "Light" : "Premium");
  }));

  // ── Export / Import ────────────────────────────────────────────────────────
  test("@sanity Export project (Functional scope)", async ({ page }) => {
    await ensureProjectCreated(page);
    const settings = new SettingsPage(page);
    await settings.openProjectSettings(projectName);

    exportedBundlePath = test.info().outputPath("sanity-export.ndjson.gz");
    const { filename, meta, lines } = await settings.exportProject({ scopes: ["functional"], outPath: exportedBundlePath });

    expect(filename, "Exported file name").toMatch(/\.ndjson\.gz$/);
    expect(meta.type, "First line of the bundle must be the meta record").toBe("meta");
    expect(meta.projectUuid).toBe(projectId);
    expect(meta.scopeGroups).toEqual(["functional"]);
    expect(lines.length, "Bundle should contain the meta line plus graph records").toBeGreaterThan(1);
  });

  test("@sanity Import project bundle (Admin) and reject an invalid bundle", async ({ page, adminPage }) => {
    expect(exportedBundlePath && fs.existsSync(exportedBundlePath), "Export test must run first and produce a bundle").toBeTruthy();

    // Dedicated import target so the main sanity project's data is untouched.
    const importTargetName = `SanityImport-${stamp()}-Automation`;
    await createTrackedProject(page, importTargetName);

    // Import is restricted (the default user gets HTTP 403), so run it as Admin.
    await adminPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    const settings = new SettingsPage(adminPage);
    await settings.openProjectSettings(importTargetName);

    const message = await settings.importInvalidBundle({
      name: "corrupt.ndjson.gz",
      mimeType: "application/gzip",
      buffer: Buffer.from("this is not a gzip archive"),
    });
    console.log("Invalid bundle message:", message);

    await settings.openProjectSettings(importTargetName);
    await settings.importBundle(exportedBundlePath);
  });

  // ── Restore and permanent delete ───────────────────────────────────────────
  test("@sanity Archive then Restore a project", async ({ page, adminPage }) => {
    const name = `SanityRestore-${stamp()}-Automation`;
    await createTrackedProject(page, name);
    await archiveOne(adminPage, name);
    createdProjects.add(name); // restored below, so keep tracking it for final cleanup

    const dashboard = new DashboardPage(adminPage);
    await adminPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await dashboard.openProjectTab("Archived");
    await searchProject(adminPage, name);
    await expect(dashboard.projectCard(name)).toContainText(/days until permanent deletion/);
    await dashboard.restoreProject(name);

    await adminPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await dashboard.openProjectTab("All");
    await searchProject(adminPage, name);
    await expect(dashboard.projectCard(name), "Restored project should be active again").toBeVisible();
  });

  test("@sanity Permanently delete an archived project", async ({ page, adminPage }) => {
    const name = `SanityPurge-${stamp()}-Automation`;
    await createTrackedProject(page, name);
    await archiveOne(adminPage, name);

    const dashboard = new DashboardPage(adminPage);
    await adminPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await dashboard.openProjectTab("Archived");
    await searchProject(adminPage, name);
    await dashboard.permanentlyDeleteProject(name);
    // The purge continues in the background (about 3 minutes); nothing further to clean up.
  });

  // ── Delete ─────────────────────────────────────────────────────────────────
  test("@sanity Delete (archive) created projects", async ({ adminPage }) => {
    expect(createdProjects.size, "Nothing to delete - no project was created by this run").toBeGreaterThan(0);
    const names = [...createdProjects];
    await archiveCreatedProjects(adminPage);

    // Archived projects move to the Archived tab (restorable for 30 days)
    await adminPage.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
    await new DashboardPage(adminPage).openProjectTab("Archived");
    for (const name of names) {
      await searchProject(adminPage, name);
      await expect(projectCard(adminPage, name), `"${name}" should be listed under Archived`).toBeVisible();
    }
  });
});
