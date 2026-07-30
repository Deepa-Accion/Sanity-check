import { AutoHealer } from './AutoHealer.js';

const ACTION_METHODS = new Set([
  'click', 'fill', 'type', 'check', 'uncheck', 'selectOption', 'tap',
  'innerText', 'textContent', 'getAttribute', 'waitFor', 'scrollIntoViewIfNeeded',
  'hover', 'focus', 'blur', 'press', 'dispatchEvent',
]);

function isLocatorError(err) {
  const msg = err?.message || '';
  return (
    msg.includes('not found') ||
    msg.includes('not visible') ||
    msg.includes('Timeout') ||
    msg.includes('strict mode violation') ||
    msg.includes('waiting for locator')
  );
}

export class HealingLocator {
  constructor(loc, selector, pageName, healer, rawPage) {
    this._loc = loc;
    this._selector = selector;
    this._pageName = pageName;
    this._healer = healer;
    this._rawPage = rawPage;
  }

  // Proxy action calls with heal-on-failure
  async _call(method, args) {
    try {
      return await this._loc[method](...args);
    } catch (err) {
      if (!isLocatorError(err)) throw err;
      console.log(`[AutoHeal] "${this._selector}" failed on .${method}() — attempting heal`);
      const healed = await this._healer.findAlternative(this._selector, this._pageName, this._rawPage);
      if (!healed) {
        console.log(`[AutoHeal] No alternative found for "${this._selector}"`);
        throw err;
      }
      console.log(`[AutoHeal] "${this._selector}" → "${healed}"`);
      return await this._rawPage.locator(healed)[method](...args);
    }
  }

  click(...args) { return this._call('click', args); }
  fill(...args) { return this._call('fill', args); }
  type(...args) { return this._call('type', args); }
  check(...args) { return this._call('check', args); }
  uncheck(...args) { return this._call('uncheck', args); }
  selectOption(...args) { return this._call('selectOption', args); }
  tap(...args) { return this._call('tap', args); }
  hover(...args) { return this._call('hover', args); }
  focus(...args) { return this._call('focus', args); }
  press(...args) { return this._call('press', args); }
  innerText(...args) { return this._call('innerText', args); }
  textContent(...args) { return this._call('textContent', args); }
  getAttribute(...args) { return this._call('getAttribute', args); }
  waitFor(...args) { return this._call('waitFor', args); }
  scrollIntoViewIfNeeded(...args) { return this._call('scrollIntoViewIfNeeded', args); }
  isVisible(...args) { return this._loc.isVisible(...args); }
  isEnabled(...args) { return this._loc.isEnabled(...args); }
  isChecked(...args) { return this._loc.isChecked(...args); }
  count(...args) { return this._loc.count(...args); }
  all(...args) { return this._loc.all(...args); }
  setInputFiles(...args) { return this._call('setInputFiles', args); }

  // Chaining — return new HealingLocator wrappers
  filter(opts) { return new HealingLocator(this._loc.filter(opts), this._selector, this._pageName, this._healer, this._rawPage); }
  first() { return new HealingLocator(this._loc.first(), this._selector, this._pageName, this._healer, this._rawPage); }
  last() { return new HealingLocator(this._loc.last(), this._selector, this._pageName, this._healer, this._rawPage); }
  nth(i) { return new HealingLocator(this._loc.nth(i), this._selector, this._pageName, this._healer, this._rawPage); }
  locator(sel, opts) { return new HealingLocator(this._loc.locator(sel, opts), sel, this._pageName, this._healer, this._rawPage); }

  // Expose the raw Playwright Locator so expect() works
  get raw() { return this._loc; }
}

export class HealingPage {
  constructor(page, pageName, healer) {
    this._page = page;
    this._pageName = pageName;
    this._healer = healer || new AutoHealer();
  }

  locator(selector, opts) {
    return new HealingLocator(this._page.locator(selector, opts), selector, this._pageName, this._healer, this._page);
  }

  getByRole(role, opts) {
    const label = typeof opts?.name === 'string' ? opts.name : '';
    return new HealingLocator(
      this._page.getByRole(role, opts),
      `[role="${role}"]${label ? `:has-text("${label}")` : ''}`,
      this._pageName, this._healer, this._page
    );
  }

  getByText(text, opts) {
    return new HealingLocator(this._page.getByText(text, opts), `:has-text("${text}")`, this._pageName, this._healer, this._page);
  }

  getByLabel(text, opts) {
    return new HealingLocator(this._page.getByLabel(text, opts), `[aria-label="${text}"]`, this._pageName, this._healer, this._page);
  }

  getByPlaceholder(text, opts) {
    return new HealingLocator(this._page.getByPlaceholder(text, opts), `[placeholder="${text}"]`, this._pageName, this._healer, this._page);
  }

  // Delegate everything else to the raw page
  get rawPage() { return this._page; }
  getHealer() { return this._healer; }
}
