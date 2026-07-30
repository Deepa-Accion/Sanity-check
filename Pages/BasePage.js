/**
 * Base class for Page Object Models with opt-in auto-healing.
 *
 * Extend this instead of using raw page:
 *
 *   export class DashboardPage extends BasePage {
 *     constructor(page, healer) {
 *       super(page, 'DashboardPage', healer);
 *     }
 *
 *     async clickCreateProject() {
 *       // This locator is tracked and healed automatically
 *       await this.find('button[aria-label="Create Project"]').click();
 *     }
 *   }
 */

import { HealingPage } from '../healing/HealingPage.js';
import { collectPage } from '../healing/PageCollector.js';
import { AutoHealer } from '../healing/AutoHealer.js';

export class BasePage {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} pageName   - logical name for PageData storage
   * @param {AutoHealer} [healer] - shared healer instance (optional)
   */
  constructor(page, pageName, healer) {
    this.rawPage = page;
    this.pageName = pageName;
    this.healer = healer || new AutoHealer();

    // hp is the self-healing proxy; use it inside POM methods
    this.hp = new HealingPage(page, pageName, this.healer, null);
  }

  /**
   * Returns a HealingLocator for the given selector.
   * Use this inside POM methods instead of this.rawPage.locator().
   */
  find(selector, options) {
    return this.hp.locator(selector, options);
  }

  /**
   * Snapshot the current page DOM into PageData/{pageName}.json.
   * Call at the start of a test after navigating to the page.
   */
  async snapshot() {
    await collectPage(this.rawPage, this.pageName);
  }

  /**
   * Navigate to the page URL and snapshot it.
   * @param {string} url
   */
  async goto(url, options) {
    await this.rawPage.goto(url, options);
    await this.rawPage.waitForLoadState('domcontentloaded');
    await this.snapshot();
  }

  /** Wait for page to reach a stable state. */
  async waitForReady() {
    await this.rawPage.waitForLoadState('networkidle').catch(() => {});
  }

  /** Alias for rawPage.waitForTimeout. */
  async wait(ms) {
    await this.rawPage.waitForTimeout(ms);
  }

  /** Raw page – use only when the healing proxy doesn't support what you need. */
  get page() { return this.rawPage; }
}
