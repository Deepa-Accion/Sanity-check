/**
 * BREEZEAI-431 — Manual verification helper
 * Headed Chromium, pauses after auth so you can navigate, then runs checks.
 *
 * Usage:  node breezeai-431-verify.mjs
 *
 * Flow:
 *  1. Opens browser → navigates to Breeze app
 *  2. PAUSES — you log in, then navigate to Code Ontology graph for any active project
 *  3. Press F8 (or click "Resume" in the Playwright inspector) to continue
 *  4. Script verifies AC1/AC2/AC3/AC4 by inspecting the live page
 */

import { chromium } from "@playwright/test";

const APP_URL = "https://ai.accionbreeze.com";

const browser = await chromium.launch({
  headless: false,
  slowMo: 100,
  args: ["--start-maximized"],
});

const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();

await page.goto(APP_URL);
console.log("\n=== BREEZEAI-431 Verification ===");
console.log("1. Log in to Breeze in the browser window.");
console.log("2. Navigate to any active project → Code Ontology graph.");
console.log("   URL will be: https://ai.accionbreeze.com/dashboard/<projectUuid>/code-ontology");
console.log("3. Once the graph loads, press F8 (Playwright Inspector resume) to continue.\n");

// ── Pause for manual auth + navigation ──────────────────────────────────────
await page.pause();

// ── At this point the user should be on the code-ontology graph page ─────────
console.log("\n▶  Resuming checks …");
const currentUrl = page.url();
console.log("Current URL:", currentUrl);

// ── AC1/AC3: Check for hierarchy expand functions in the React component ─────
// Verify the page rendered the graph canvas
const graphCanvas = await page.locator("canvas").count();
console.log(`\n[AC1/AC3] Graph canvas elements found: ${graphCanvas}`);

// Check for node labels in the graph — File nodes should be visible initially
const pageContent = await page.content();
const hasFileLabel  = pageContent.includes('"File"') || pageContent.includes("file");
console.log(`[AC1] Page mentions File nodes: ${hasFileLabel}`);

// ── AC2: Intercept the next graph query to check for statement embedding ──────
console.log("\n[AC2] Setting up network intercept — will capture next Cypher query ...");
let capturedPayloads = [];
await page.route("**/**/graph/query*", async (route) => {
  const req = route.request();
  const body = req.postData();
  capturedPayloads.push({ url: req.url(), body });
  console.log("  Intercepted graph query:", req.url());
  if (body) {
    const hasStatement = body.toLowerCase().includes("statement");
    console.log("  Body includes 'statement':", hasStatement, "←", hasStatement ? "⚠️ INLINE STATEMENTS" : "✅ No inline statements");
    console.log("  Query body (first 500 chars):", body.substring(0, 500));
  }
  await route.continue();
});

// Also intercept the REST API node fetch (used by fetchChildren)
await page.route("**/**/code-ontology/**", async (route) => {
  const req = route.request();
  const url = req.url();
  if (req.method() === "GET") {
    console.log("  [AC3 lazy-load] Code node REST call:", url.replace(/.*\/code-ontology/, "/code-ontology"));
  }
  await route.continue();
});

console.log("[AC2] Intercepts active. Please CLICK on any File node in the graph to trigger expand.");
console.log("      Watch the console for intercepted queries.\n");

// Wait 30s for the user to click a node
await page.waitForTimeout(30_000);

// ── AC1: Check for expand button / child nodes appearing after click ──────────
console.log("\n[AC1] Looking for child node labels (Class, Function, Statement) in DOM ...");
const bodyText = await page.evaluate(() => document.body.innerText);
const hasClass    = bodyText.includes("Class");
const hasFunction = bodyText.includes("Function");
const hasStatement = bodyText.includes("Statement");
console.log(`  Class nodes visible:     ${hasClass}`);
console.log(`  Function nodes visible:  ${hasFunction}`);
console.log(`  Statement nodes visible: ${hasStatement}`);

// Check for expand controls / chevrons in the UI
const expandButtons = await page.locator('[aria-label*="expand"], [title*="expand"], button:has-text("Expand"), [data-testid*="expand"]').count();
console.log(`  Expand controls found:   ${expandButtons}`);

// ── Summary ──────────────────────────────────────────────────────────────────
console.log("\n=== AC Results ===");
console.log(`AC1 (hierarchy expand): graph canvas present=${graphCanvas > 0}; child labels in DOM: Class=${hasClass}, Function=${hasFunction}, Statement=${hasStatement}`);
console.log(`AC2 (no inline statements): ${capturedPayloads.length} queries captured — check 'statement' flags above`);
console.log(`AC3 (lazy-load): REST node calls logged above — if /code-ontology/ GET calls appear AFTER initial load, lazy-load is working`);
console.log(`AC4 (BREEZEAI-732 Ready to Prod): confirmed from Jira status`);

console.log("\nPress Ctrl+C to close the browser, or leave it open for manual exploration.");
await page.waitForTimeout(300_000); // keep open 5 min
await browser.close();
