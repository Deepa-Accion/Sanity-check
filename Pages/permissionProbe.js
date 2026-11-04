import { expect } from '@playwright/test';
import { DEFAULT_BASE_URL, projectCard } from './dashboardPage.js';

/**
 * Observe what the signed-in user can do on one project, without changing anything.
 * Every result is "enabled" | "disabled" | "absent" (or a boolean / list). Each page is
 * waited on for an element every role sees BEFORE absence is read, so "absent" means
 * "not offered", not "not rendered yet".
 *
 * Prerequisite: the project has one uploaded document named `fileName.txt` that is not generated.
 */

const stateOf = async (locator) => {
  if (!(await locator.count())) return 'absent';
  const disabled = await locator.first().evaluate(
    (n) => n.disabled === true || n.getAttribute('aria-disabled') === 'true' || n.hasAttribute('data-disabled')
  );
  return disabled ? 'disabled' : 'enabled';
};

const readMenuItems = async (page) => {
  const items = {};
  for (const item of await page.getByRole('menuitem').all()) {
    const disabled = await item.evaluate((n) => n.getAttribute('aria-disabled') === 'true' || n.hasAttribute('data-disabled'));
    items[(await item.innerText()).trim()] = disabled ? 'disabled' : 'enabled';
  }
  return items;
};

/**
 * The app renders role-dependent controls in stages (a default view first, then the role-specific
 * one, and menu items arrive one by one) and exposes no "loaded" signal. So read repeatedly until the
 * value has not changed for `stableMs`. Reading too early shows controls a role does not really get.
 */
async function settle(page, read, { stableMs = 1500, timeout = 15000 } = {}) {
  const started = Date.now();
  let last = JSON.stringify(await read());
  let since = Date.now();
  while (Date.now() - started < timeout && Date.now() - since < stableMs) {
    await page.waitForTimeout(300);
    const current = JSON.stringify(await read());
    if (current !== last) {
      last = current;
      since = Date.now();
    }
  }
  return JSON.parse(last);
}

const settledState = (page, locator) => settle(page, () => stateOf(locator));

/**
 * Open a menu and collect every item it shows. The project list re-renders on its own, which closes
 * an open menu, so keep a running union of what was seen and reopen the menu whenever it closes.
 * Done when nothing new has appeared for `stableMs`.
 */
async function observeMenu(page, openMenu, { stableMs = 2500, timeout = 25000 } = {}) {
  const seen = {};
  const started = Date.now();
  let lastChange = Date.now();
  while (Date.now() - started < timeout && Date.now() - lastChange < stableMs) {
    if (!(await page.getByRole('menuitem').count())) await openMenu().catch(() => {});
    const now = await readMenuItems(page);
    for (const [name, state] of Object.entries(now)) {
      if (seen[name] !== state) {
        seen[name] = state;
        lastChange = Date.now();
      }
    }
    await page.waitForTimeout(300);
  }
  await page.keyboard.press('Escape');
  return seen;
}

export async function probeProjectAccess(page, { projectId, projectName, documentName = 'fileName.txt' }) {
  const result = {};

  // ── Project list ──────────────────────────────────────────────────────────
  await page.goto(DEFAULT_BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'My projects' })).toBeVisible({ timeout: 30000 });
  const listView = await settle(page, async () => ({
    createProject: await stateOf(page.getByRole('button', { name: /create project/i })),
    listTabs: await page.getByRole('tab').allInnerTexts(),
  }));
  result.createProject = listView.createProject;
  result.listTabs = listView.listTabs;

  const allTab = page.getByRole('tab', { name: 'All', exact: true });
  if (await allTab.count()) await allTab.click(); // System Admin sees other users' projects here
  await page.getByPlaceholder(/search projects/i).first().fill(projectName);
  const card = projectCard(page, projectName);
  result.projectListed = await card.waitFor({ state: 'visible', timeout: 30000 }).then(() => true, () => false);

  result.cardMenu = {};
  if (result.projectListed) {
    result.cardMenu = await observeMenu(page, () => card.getByRole('button', { name: /project options/i }).click());
  }

  // ── Project dashboard ─────────────────────────────────────────────────────
  await page.goto(`${DEFAULT_BASE_URL}dashboard/${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: projectName })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Ask Breeze' })).toBeVisible();
  result.askBreeze = await settledState(page, page.getByRole('button', { name: 'Ask Breeze' }));
  result.dashboardShare = await settledState(page, page.getByRole('button', { name: 'Share', exact: true }));

  // ── Functional ontology page (documents) ──────────────────────────────────
  await page.goto(`${DEFAULT_BASE_URL}ontology/${projectId}/functional`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('checkbox', { name: `Select ${documentName}` })).toBeVisible({ timeout: 30000 });
  result.uploadDocuments = await settledState(page, page.getByRole('button', { name: /Upload documents/ }));
  result.generateFunctional = await settledState(page, page.getByRole('button', { name: 'Generate', exact: true }));
  result.documentMenu = await observeMenu(page, () => page.getByRole('button', { name: `More actions for ${documentName}` }).click());

  // ── Code ontology ─────────────────────────────────────────────────────────
  await page.goto(`${DEFAULT_BASE_URL}code-ontology/${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByPlaceholder('Search ontologies...')).toBeVisible({ timeout: 30000 });
  result.newCodeOntology = await settledState(page, page.getByRole('button', { name: /New Ontology/ }));

  // ── Artifacts ─────────────────────────────────────────────────────────────
  await page.goto(`${DEFAULT_BASE_URL}knowledge/${projectId}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Artifacts', exact: true })).toBeVisible({ timeout: 30000 });
  result.artifactsPage = true;
  const artifactButton = page.getByRole('button', { name: /^Functional Documentation/ });
  await artifactButton.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}); // renders after the heading
  result.generateArtifact = await settledState(page, artifactButton);

  // ── Settings ──────────────────────────────────────────────────────────────
  await page.goto(`${DEFAULT_BASE_URL}settings?tab=project`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('tab', { name: 'Themes' })).toBeVisible({ timeout: 30000 });
  result.settingsTabs = await page.getByRole('tab').allInnerTexts();
  await page.getByRole('button', { name: 'Select a project' }).click();
  await page.getByRole('listbox').getByText(projectName, { exact: true }).click();
  await expect(page.getByPlaceholder('Enter project description')).toBeVisible({ timeout: 30000 });
  result.settingsExport = await settledState(page, page.getByRole('button', { name: 'Export', exact: true }));
  result.settingsImport = await settledState(page, page.getByRole('button', { name: 'Import', exact: true }));
  result.settingsShare = await settledState(page, page.getByRole('button', { name: 'Share', exact: true }));
  result.settingsSave = await settledState(page, page.getByRole('button', { name: 'Save', exact: true }));

  return result;
}
