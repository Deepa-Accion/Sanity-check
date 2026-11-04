import fs from 'fs';
import { DEFAULT_BASE_URL, DashboardPage, searchProject, deleteProject } from './dashboardPage.js';

/**
 * Safety net for serial suites: archive (the app's "Delete") every project a run created,
 * using the Admin session captured by global-setup. Only names in `createdProjects` are touched.
 * Removes each name from the set once archived. Never throws - it only warns.
 *
 * @param {import('@playwright/test').Browser} browser
 * @param {Set<string>} createdProjects
 */
export async function archiveProjectsAsAdmin(browser, createdProjects) {
  if (createdProjects.size === 0) return;

  let session;
  try {
    session = JSON.parse(fs.readFileSync(new URL('../session-auth-admin.json', import.meta.url), 'utf-8'));
  } catch {
    console.warn('[cleanup] session-auth-admin.json missing - leftover projects:', [...createdProjects]);
    return;
  }

  const context = await browser.newContext();
  const adminPage = await context.newPage();
  try {
    await adminPage.addInitScript(({ key, value }) => {
      window.sessionStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }, session);
    await adminPage.goto(DEFAULT_BASE_URL, { waitUntil: 'domcontentloaded' });
    const dashboard = new DashboardPage(adminPage);
    for (const name of [...createdProjects]) {
      await dashboard.openProjectTab('All');
      await searchProject(adminPage, name);
      await deleteProject(adminPage, name);
      createdProjects.delete(name);
    }
  } catch (err) {
    console.warn('[cleanup] could not archive leftover projects:', [...createdProjects], err?.message);
  } finally {
    await context.close();
  }
}
