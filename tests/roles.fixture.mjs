import { test as base, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectPage } from "../healing/PageCollector.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const loadSession = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
};

const defaultSession = loadSession(path.join(__dirname, "../session-auth.json"));
const adminSession   = loadSession(path.join(__dirname, "../session-auth-admin.json"));
const viewerSession  = loadSession(path.join(__dirname, "../session-auth-viewer.json"));

async function injectSession(page, sessionAuth) {
  if (process.env.LOCALHOST_RUN !== "true" && sessionAuth?.key && sessionAuth?.value) {
    await page.addInitScript(({ key, value }) => {
      try {
        window.sessionStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      } catch (e) {}
    }, { key: sessionAuth.key, value: sessionAuth.value });
  }
  await page.addInitScript(() => {
    try { document.documentElement.style.zoom = "100%"; } catch (e) {}
  });
}

// The role chosen in the QA Dashboard (server.js passes it as ROLE). `page` acts as that role, so
// "Viewer" really runs with the Viewer account's credentials.
const requestedRole = String(process.env.ROLE || "default").toLowerCase();
const actingSession =
  requestedRole === "admin" ? adminSession : requestedRole === "viewer" ? viewerSession : defaultSession;

export const test = base.extend({
  // Acting page - signed in as the role selected for this run (default = End User account).
  page: async ({ page }, use) => {
    await injectSession(page, actingSession);
    await use(page);
  },

  // Owner page - always the default (End User) account, whatever role the run acts as.
  ownerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const pg  = await ctx.newPage();
    await injectSession(pg, defaultSession);
    await use(pg);
    await ctx.close();
  },

  // Admin page — fresh browser context so admin session never mixes with the default session
  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const pg  = await ctx.newPage();
    await injectSession(pg, adminSession);
    await use(pg);
    await ctx.close();
  },

  // Viewer page — fresh browser context with viewer session
  viewerPage: async ({ browser }, use) => {
    const ctx = await browser.newContext();
    const pg  = await ctx.newPage();
    await injectSession(pg, viewerSession);
    await use(pg);
    await ctx.close();
  },
});

export { expect };

/**
 * Snapshot the current page DOM for auto-healing reference.
 * Same helper exported here so tests that switch to roles.fixture.mjs need no extra imports.
 */
export async function collectPageData(page, name) {
  try {
    await collectPage(page, name || "page");
  } catch (err) {
    console.warn("[collectPageData] Snapshot failed (non-fatal):", err?.message);
  }
}
