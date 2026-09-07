import { expect } from '@playwright/test';

export class LoginPage {
  constructor(page) {
    this.page = page;
  }

  async navigateToLogin(url = 'https://ai.accionbreeze.com/?page=1') {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });

    const dashboardReady = this.page.getByRole('button', { name: /create project/i }).first();
    if (await dashboardReady.isVisible().catch(() => false)) {
      return;
    }

    const landingButton = this.page
      .getByRole('button', { name: /sign in with breeze ai|sign in/i })
      .first();

    if (await landingButton.isVisible().catch(() => false)) {
      await landingButton.click();
    }

    const createProjectButton = this.page.getByRole('button', { name: /create project/i }).first();
    if (await createProjectButton.isVisible().catch(() => false)) {
      return;
    }

    if (this.page.url().includes('/dashboard')) {
      return;
    }

    await this.waitForLoginForm();
  }

  async waitForLoginForm() {
    const usernameSelector = 'input[type="email"], input[name*="email" i], input[name*="username" i], input[autocomplete*="email" i], input[placeholder*="email" i], input[placeholder*="username" i]';
    const passwordSelector = 'input[type="password"], input[name*="password" i], input[autocomplete*="current-password" i], input[placeholder*="password" i]';

    const checks = [
      async () => {
        const pageUsername = this.page.locator(usernameSelector).first();
        const pagePassword = this.page.locator(passwordSelector).first();
        return await pageUsername.isVisible().catch(() => false) || await pagePassword.isVisible().catch(() => false);
      },
      async () => {
        const iframeUsername = this.page.frameLocator('iframe').locator(usernameSelector).first();
        const iframePassword = this.page.frameLocator('iframe').locator(passwordSelector).first();
        return await iframeUsername.isVisible().catch(() => false) || await iframePassword.isVisible().catch(() => false);
      }
    ];

    let found = false;
    for (const check of checks) {
      found = await check();
      if (found) break;
    }

    if (!found) {
      await expect
        .poll(async () => {
          for (const check of checks) {
            if (await check()) return true;
          }
          return false;
        }, { timeout: 30000, intervals: [500, 1000, 1500, 2000] })
        .toBeTruthy();
    }
  }

  async login(username, password) {
    await this.waitForLoginForm();

    const usernameField = this.page
      .locator('input[type="email"], input[name*="email" i], input[name*="username" i], input[autocomplete*="email" i], input[placeholder*="email" i], input[placeholder*="username" i]')
      .first();

    const passwordField = this.page
      .locator('input[type="password"], input[name*="password" i], input[autocomplete*="current-password" i], input[placeholder*="password" i]')
      .first();

    const iframeUsernameField = this.page.frameLocator('iframe').locator('input[type="email"], input[name*="email" i], input[name*="username" i], input[autocomplete*="email" i], input[placeholder*="email" i], input[placeholder*="username" i]').first();
    const iframePasswordField = this.page.frameLocator('iframe').locator('input[type="password"], input[name*="password" i], input[autocomplete*="current-password" i], input[placeholder*="password" i]').first();

    const userField = (await usernameField.isVisible().catch(() => false)) ? usernameField : iframeUsernameField;
    const passField = (await passwordField.isVisible().catch(() => false)) ? passwordField : iframePasswordField;

    await expect(userField).toBeVisible({ timeout: 30000 });
    await expect(passField).toBeVisible({ timeout: 30000 });
    await userField.fill(username);
    await passField.fill(password);

    const submitButton = this.page
      .getByRole('button', { name: /sign in/i })
      .first();
    const iframeSubmitButton = this.page.frameLocator('iframe').getByRole('button', { name: /sign in/i }).first();

    if (await submitButton.isVisible().catch(() => false)) {
      await submitButton.click();
    } else if (await iframeSubmitButton.isVisible().catch(() => false)) {
      await iframeSubmitButton.click();
    }
  }

  async waitForAppReady() {
    await this.page.getByRole('button', { name: /create project/i }).waitFor({ state: 'visible', timeout: 60000 });
  }
}
