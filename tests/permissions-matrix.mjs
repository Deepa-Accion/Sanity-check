import fs from "fs";
import path from "path";
import { test, expect } from "./roles.fixture.mjs";
import {
  DEFAULT_BASE_URL,
  DashboardPage,
  createProject,
  projectCard,
  searchProject,
  deleteProject,
} from "../Pages/dashboardPage.js";
import { uploadFirstDocumentInKnowledgeBase } from "../Pages/knowlegeBase.js";
import { SettingsPage } from "../Pages/settingsPage.js";
import { shareProject, removeMember } from "../Pages/projectSharing.js";
import { probeProjectAccess } from "../Pages/permissionProbe.js";
import { archiveProjectsAsAdmin } from "../Pages/adminCleanup.js";

/**
 * "Project Roles and Permissions Matrix" (Confluence page 2460450819, last edited Oct 22 2026).
 *
 * The matrix has System Admin / End user / Viewer columns, each with project-level sub-roles. This
 * suite checks the four combinations reachable with the three accounts in .env:
 *
 *   owner         End user as Project Owner      BREEZE_USERNAME(_PASSWORD)
 *   admin         System Admin (not a member)    BREEZE_USERNAME_ADMIN
 *   viewerAdmin   Viewer given project role Admin    BREEZE_USERNAME_VIEWER
 *   viewerViewer  Viewer given project role Viewer   BREEZE_USERNAME_VIEWER
 *
 * Each matrix cell becomes one test that compares the UI (control present / enabled / hidden)
 * with the matrix. Rows 8, 10, 13, 14, 15, 17, 19, 20 and 24 are not automated yet (they need
 * generated ontologies, a code ontology, or Jira); End user Project Admin/Viewer and System Admin
 * sub-roles need extra accounts.
 */

const CONTEXTS = [
  ["owner", "End User (Project Owner)"],
  ["admin", "System Admin"],
  ["viewerAdmin", "Viewer (Project Admin)"],
  ["viewerViewer", "Viewer (Project Viewer)"],
];

const ALL = [true, true, true, true]; // owner, admin, viewerAdmin, viewerViewer
const EDITORS = [true, true, false, false];

const ROWS = [
  { row: 1, name: "Create Project", allowed: EDITORS, signal: (p) => p.createProject === "enabled" },
  { row: 2, name: "View Project", allowed: ALL, signal: (p) => p.projectListed },
  { row: 3, name: "Edit Project", allowed: EDITORS, signal: (p) => p.settingsSave === "enabled" },
  { row: 4, name: "Delete Project", allowed: EDITORS, signal: (p) => p.cardMenu["Delete"] === "enabled" },
  { row: 5, name: "Export Project", allowed: ALL, signal: (p) => p.cardMenu["Export Project"] === "enabled" && p.settingsExport === "enabled" },
  { row: 6, name: "Import Project", allowed: EDITORS, signal: (p) => p.cardMenu["Import Project"] === "enabled" && p.settingsImport === "enabled" },
  { row: 7, name: "Generate functional ontology", allowed: [true, true, true, false], signal: (p) => p.generateFunctional === "enabled" },
  { row: 9, name: "Generate code ontology", allowed: EDITORS, signal: (p) => p.newCodeOntology === "enabled" },
  { row: 11, name: "Generate artifacts", allowed: ALL, signal: (p) => p.generateArtifact === "enabled" },
  { row: 12, name: "View generated artifacts", allowed: ALL, signal: (p) => p.artifactsPage === true },
  { row: 16, name: "AI Chat assistant", allowed: ALL, signal: (p) => p.askBreeze === "enabled" },
  { row: 18, name: "Share project", allowed: EDITORS, signal: (p) => p.settingsShare === "enabled" },
  { row: 21, name: "Download document", allowed: ALL, signal: (p) => p.documentMenu["Download"] === "enabled" },
  { row: 22, name: "Manage tag", allowed: EDITORS, signal: (p) => p.documentMenu["Manage Tags"] === "enabled" },
  { row: 23, name: "Delete document", allowed: EDITORS, signal: (p) => p.documentMenu["Delete"] === "enabled" },
  { row: 25, name: "User Management", allowed: [false, true, false, false], signal: (p) => p.settingsTabs.includes("User Management") },
  { row: 26, name: "Jira Management", allowed: [false, true, false, false], signal: (p) => p.settingsTabs.includes("Jira Board Management") },
  { row: 27, name: "Theme change", allowed: ALL, signal: (p) => p.settingsTabs.includes("Themes") },
  { row: 28, name: "API Key generation", allowed: ALL, signal: (p) => p.settingsTabs.includes("API Key") },
];

// Cells where Dev currently differs from the matrix. They are expected to fail (test.fail), so the
// suite stays green but flags the day Dev and the matrix agree again (an unexpected pass fails).
// key: `${row}:${context}` -> what Dev does today.
const KNOWN_MISMATCH = {
  "5:viewerAdmin": "Dev hides Export for a Viewer (card menu and Settings have no Export)",
  "5:viewerViewer": "Dev hides Export for a Viewer (card menu and Settings have no Export)",
  "7:viewerAdmin": "Dev disables Generate for a Viewer even when the project role is Admin",
};

// Observations are written to disk because Playwright restarts the worker after a failed test,
// which would otherwise lose in-memory results before the per-cell tests read them.
const PROBES_FILE = path.join(process.cwd(), "test-results", "permission-probes.json");
const loadProbes = () => {
  try {
    return JSON.parse(fs.readFileSync(PROBES_FILE, "utf-8"));
  } catch {
    return {};
  }
};
const saveProbe = (context, data) => {
  const all = loadProbes();
  all[context] = data;
  fs.mkdirSync(path.dirname(PROBES_FILE), { recursive: true });
  fs.writeFileSync(PROBES_FILE, JSON.stringify(all, null, 2));
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

const sessionUser = (file) => {
  const session = JSON.parse(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf-8"));
  const payload = JSON.parse(Buffer.from(session.value.access_token.split(".")[1], "base64url").toString());
  return payload.preferred_username || payload.email;
};

export function registerPermissionMatrix() {
  const permProjects = new Set();
  const shared = { name: "", id: "" };

  async function createTracked(page, name) {
    await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" }); // createProject starts from the dashboard
    const id = await createProject(page, name);
    expect(id, `Project creation did not return an ID for ${name}`).toMatch(UUID_RE);
    permProjects.add(name);
    return id;
  }

  test.describe("Sanity Suite - Permissions Matrix", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(({ browserName }) => browserName !== "chromium", "Permission checks are maintained for Chromium only.");

    test.afterAll(async ({ browser }) => {
      await archiveProjectsAsAdmin(browser, permProjects);
    });

    test("@sanity @permissions Role accounts are three different users", async () => {
      for (const key of ["BREEZE_USERNAME", "BREEZE_USERNAME_ADMIN", "BREEZE_USERNAME_VIEWER"]) {
        expect(process.env[key], `${key} must be set in .env - without it global-setup silently reuses the default user`).toBeTruthy();
      }
      const users = [
        sessionUser("session-auth.json"),
        sessionUser("session-auth-admin.json"),
        sessionUser("session-auth-viewer.json"),
      ];
      expect(new Set(users).size, `Role sessions must belong to three different users, got: ${users.join(", ")}`).toBe(3);
    });

    test("@sanity @permissions Setup: project with a document, shared with the Viewer account as Viewer", async ({ page }) => {
      fs.rmSync(PROBES_FILE, { force: true }); // never judge a run against stale observations
      shared.name = `SanityPerm-${stamp()}-Automation`;
      shared.id = await createTracked(page, shared.name);
      await page.goto(`${DEFAULT_BASE_URL}dashboard/${shared.id}`, { waitUntil: "domcontentloaded" });
      await uploadFirstDocumentInKnowledgeBase(page, "txt");
      await shareProject(page, shared.id, process.env.BREEZE_USERNAME_VIEWER, "Viewer");
    });

    test("@sanity @permissions Observe: End User (Project Owner)", async ({ page }) => {
      saveProbe("owner", await probeProjectAccess(page, { projectId: shared.id, projectName: shared.name }));
    });

    test("@sanity @permissions Observe: System Admin", async ({ adminPage }) => {
      saveProbe("admin", await probeProjectAccess(adminPage, { projectId: shared.id, projectName: shared.name }));
    });

    test("@sanity @permissions Observe: Viewer (Project Viewer)", async ({ viewerPage }) => {
      saveProbe("viewerViewer", await probeProjectAccess(viewerPage, { projectId: shared.id, projectName: shared.name }));
    });

    test("@sanity @permissions Change the Viewer account's project role to Admin", async ({ page }) => {
      await removeMember(page, shared.id, process.env.BREEZE_USERNAME_VIEWER);
      await shareProject(page, shared.id, process.env.BREEZE_USERNAME_VIEWER, "Admin");
    });

    test("@sanity @permissions Observe: Viewer (Project Admin)", async ({ viewerPage }) => {
      saveProbe("viewerAdmin", await probeProjectAccess(viewerPage, { projectId: shared.id, projectName: shared.name }));
    });

    // Executed (not just observed): rows 4, 5 and 6 for the End User who owns the project.
    test("@sanity @permissions Row 4 (executed) End User owner archives their own project", async ({ page }) => {
      const name = `SanityPermDelete-${stamp()}-Automation`;
      await createTracked(page, name);
      await page.goto(DEFAULT_BASE_URL, { waitUntil: "domcontentloaded" });
      await searchProject(page, name);
      await deleteProject(page, name); // card menu -> Delete -> Archive
      permProjects.delete(name);

      await new DashboardPage(page).openProjectTab("Archived");
      await page.getByPlaceholder(/search projects/i).first().fill(name);
      await expect(projectCard(page, name), "Archived project should be listed under Archived").toBeVisible({ timeout: 30000 });
    });

    let ownerBundlePath = "";

    test("@sanity @permissions Row 5 (executed) End User owner exports the project", async ({ page }, testInfo) => {
      const settings = new SettingsPage(page);
      await settings.openProjectSettings(shared.name);
      ownerBundlePath = testInfo.outputPath("perm-export.ndjson.gz");
      const { meta } = await settings.exportProject({ scopes: ["functional"], outPath: ownerBundlePath });
      expect(meta.projectUuid, "Exported bundle should belong to the project").toBe(shared.id);
    });

    test("@sanity @permissions Row 6 (executed) End User owner imports into their own project", async ({ page }) => {
      // Matrix says the End User who owns a project may import; Dev answers HTTP 403 (seen repeatedly).
      // Expected to fail until Dev and the matrix agree - an unexpected pass will flag that day.
      test.fail(true, "Matrix vs Dev: Dev returns HTTP 403 when the End User owner imports into their own project");
      expect(ownerBundlePath && fs.existsSync(ownerBundlePath), "The export test must run first and produce a bundle").toBeTruthy();
      const targetName = `SanityPermImport-${stamp()}-Automation`;
      await createTracked(page, targetName);
      const settings = new SettingsPage(page);
      await settings.openProjectSettings(targetName);
      await settings.importBundle(ownerBundlePath);
    });
  });

  // One test per matrix cell (matrix row x role). A separate, non-serial group so one mismatching
  // cell does not skip the others; the observations come from the file written above.
  test.describe("Sanity Suite - Permissions Matrix cells", () => {
    test.skip(({ browserName }) => browserName !== "chromium", "Permission checks are maintained for Chromium only.");
    const probes = new Proxy({}, { get: (_t, context) => loadProbes()[context] });

    for (const { row, name, allowed, signal } of ROWS) {
      CONTEXTS.forEach(([context, label], index) => {
        const expected = allowed[index];
        test(`@sanity @permissions Row ${row} ${name} - ${label}: ${expected ? "allowed" : "blocked"}`, async () => {
          const known = KNOWN_MISMATCH[`${row}:${context}`];
          if (known) test.fail(true, `Matrix vs Dev: ${known}`);
          expect(probes[context], `No observation for ${label} - an earlier "Observe" test failed`).toBeTruthy();
          expect(
            Boolean(signal(probes[context])),
            `Row ${row} "${name}" for ${label}: matrix says ${expected ? "allowed" : "blocked"}`
          ).toBe(expected);
        });
      });
    }

  });
}
