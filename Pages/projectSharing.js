import { expect } from '@playwright/test';
import { DEFAULT_BASE_URL } from './dashboardPage.js';

/**
 * Project sharing (project-level roles). Locators verified on Dev:
 * project dashboard "Share" button -> dialog with an email box, a "Member role" dropdown
 * (options "Admin" / "Viewer") and "Provide Access"; members are listed with a "Remove"
 * button that asks "Are you absolutely sure?" before deleting.
 */

export async function openShareDialog(page, projectId) {
  await page.goto(`${DEFAULT_BASE_URL}dashboard/${projectId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: /^Share "/ })).toBeVisible({ timeout: 30000 });
  return dialog;
}

const memberRow = (dialog, email) =>
  dialog.locator('div').filter({ hasText: email }).filter({ has: dialog.page().getByRole('button', { name: 'Remove' }) }).last();

/** Give `email` the project role "Admin" or "Viewer" and confirm it is listed. */
export async function shareProject(page, projectId, email, role) {
  const dialog = await openShareDialog(page, projectId);
  await dialog.getByRole('combobox', { name: 'Member role' }).click();
  await page.getByRole('option', { name: role, exact: true }).click();
  await dialog.getByPlaceholder('Enter email address...').fill(email);

  const granted = page.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/members\/grant-access$/.test(new URL(r.url()).pathname),
    { timeout: 30000 }
  );
  await dialog.getByRole('button', { name: 'Provide Access' }).click();
  expect((await granted).status(), `Granting ${role} access to ${email} should return 201`).toBe(201);
  await expect(memberRow(dialog, email), `${email} should be listed as ${role}`).toContainText(role);
  await dialog.getByRole('button', { name: 'Close' }).first().click();
  await expect(dialog).toBeHidden();
}

/** Remove `email` from the project (confirms the "Are you absolutely sure?" prompt). */
export async function removeMember(page, projectId, email) {
  const dialog = await openShareDialog(page, projectId);
  await memberRow(dialog, email).getByRole('button', { name: 'Remove' }).click();
  const removed = page.waitForResponse(
    (r) => r.request().method() === 'DELETE' && /\/members\/\d+$/.test(new URL(r.url()).pathname),
    { timeout: 30000 }
  );
  const confirm = page.getByRole('alertdialog');
  await expect(confirm).toContainText(/Are you absolutely sure\?/);
  await confirm.getByRole('button', { name: 'Remove' }).click();
  expect((await removed).status(), `Removing ${email} should return 200`).toBe(200);
}
