import { expect } from '@playwright/test';
import fs from 'fs';
import zlib from 'zlib';
import { DEFAULT_BASE_URL } from './dashboardPage.js';

/**
 * Page object for the Settings area (Project Settings: export / import, Themes).
 * Locators were verified against the live Dev UI (aria-labels, ids and roles only).
 */
export class SettingsPage {
  constructor(page) {
    this.page = page;
    this.projectPicker = page.getByRole('button', { name: 'Select a project' });
    this.exportButton = page.getByRole('button', { name: 'Export', exact: true });
    this.importButton = page.getByRole('button', { name: 'Import', exact: true });
  }

  // ── Themes ────────────────────────────────────────────────────────────────
  async openThemes() {
    await this.page.goto(`${DEFAULT_BASE_URL}settings?tab=themes`, { waitUntil: 'domcontentloaded' });
    await expect(this.page.getByRole('heading', { name: 'Themes', level: 2 })).toBeVisible();
  }

  themeButton(themeName) {
    return this.page.getByRole('button', { name: `Apply ${themeName} theme` });
  }

  /** Active theme as exposed by the app on the root element. */
  activeTheme() {
    return this.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  }

  async applyTheme(themeName) {
    await this.themeButton(themeName).click();
    await expect(this.themeButton(themeName)).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => this.activeTheme(), { message: `Theme "${themeName}" should be applied to <html data-theme>` })
      .toBe(themeName.toLowerCase());
  }

  // ── Project settings ──────────────────────────────────────────────────────
  async openProjectSettings(projectName) {
    await this.page.goto(`${DEFAULT_BASE_URL}settings?tab=project`, { waitUntil: 'domcontentloaded' });
    await expect(this.projectPicker).toBeVisible();
    await this.projectPicker.click();
    const option = this.page.getByRole('listbox').getByText(projectName, { exact: true });
    await expect(option, `Project "${projectName}" should be selectable in Project Settings`).toBeVisible();
    await option.click();
    await expect(this.exportButton).toBeVisible();
  }

  /** Edit the selected project's description via Project Settings and confirm the save request succeeded. */
  async updateProjectDescription(description) {
    const field = this.page.getByPlaceholder('Enter project description');
    await expect(field).toBeVisible();
    await field.fill(description);
    const saved = this.page.waitForResponse(
      (r) => ['PUT', 'PATCH', 'POST'].includes(r.request().method()) && /\/projects\/[^/?]+\/?$/.test(new URL(r.url()).pathname),
      { timeout: 30000 }
    );
    await this.page.getByRole('button', { name: 'Save', exact: true }).click();
    const response = await saved;
    expect(response.ok(), `Saving project settings failed: HTTP ${response.status()}`).toBe(true);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  /**
   * Export the selected project. Defaults to the Functional scope only: exporting every
   * scope has been observed to drop the connection on Dev (see QA report D-07).
   * @returns {Promise<{ path: string, filename: string, meta: object, lines: string[] }>}
   */
  async exportProject({ scopes = ['functional'], outPath, timeout = 240000 } = {}) {
    await this.exportButton.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    for (const scope of ['functional', 'design', 'architecture']) {
      const box = dialog.locator(`#scope-${scope}`);
      if (scopes.includes(scope)) await box.check();
      else await box.uncheck();
    }

    const downloadPromise = this.page.waitForEvent('download', { timeout });
    await dialog.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    const path = outPath || (await download.path());
    if (outPath) await download.saveAs(outPath);

    const text = zlib.gunzipSync(fs.readFileSync(path)).toString('utf-8');
    const lines = text.split('\n').filter(Boolean);
    const meta = JSON.parse(lines[0]);

    await dialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(dialog).toBeHidden();
    return { path, filename, meta, lines };
  }

  // ── Import ────────────────────────────────────────────────────────────────
  async openImportDialog() {
    await this.importButton.click();
    const dialog = this.page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /^Import into/ })).toBeVisible();
    return dialog;
  }

  /**
   * Import a bundle into the selected project (destructive for the project's graph data).
   * Requires a user permitted to import (the Admin user in this environment).
   */
  async importBundle(filePath, { timeout = 300000 } = {}) {
    const dialog = await this.openImportDialog();
    await dialog.locator('input[type="file"]').setInputFiles(filePath);
    await dialog.getByRole('button', { name: 'Wipe and import' }).click();

    const confirm = this.page.getByRole('alertdialog');
    await expect(confirm).toContainText(/Overwrite this project's data\?/);
    await confirm.getByRole('button', { name: 'Wipe and import' }).click();

    await expect(
      dialog.getByText('Import completed'),
      'Import should finish with "Import completed" (an "Import failed" message means the user lacks permission or the bundle is invalid)'
    ).toBeVisible({ timeout });
    await dialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(dialog).toBeHidden();
  }

  /** Upload a file that is not a valid bundle and return the validation message shown. */
  async importInvalidBundle({ name, mimeType, buffer }) {
    const dialog = await this.openImportDialog();
    await dialog.locator('input[type="file"]').setInputFiles({ name, mimeType, buffer });
    await dialog.getByRole('button', { name: 'Wipe and import' }).click();
    const confirm = this.page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: 'Wipe and import' }).click();
    // The error is rendered at page level (outside the dialog element).
    const failure = this.page.getByText(/not a valid gzip|no "type" field|Import failed|invalid/i).first();
    await expect(failure).toBeVisible({ timeout: 60000 });
    const message = (await failure.innerText()).trim();
    await dialog.getByRole('button', { name: 'Close' }).first().click();
    await expect(dialog).toBeHidden();
    return message;
  }
}
