import { loadPageData } from './PageCollector.js';

export class AutoHealer {
  constructor() {
    this.healingLog = [];
  }

  async findAlternative(selector, pageName, page) {
    const tokens = this._extractTokens(selector);
    if (!tokens.length) return null;

    const elements = await loadPageData(pageName);
    if (!elements) {
      return this._scanLiveDom(page, tokens);
    }

    const candidates = elements
      .map(el => ({ el, score: this._score(el, tokens) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);

    if (!candidates.length) return null;

    const healed = this._buildSelector(candidates[0].el);
    this.healingLog.push({
      original: selector,
      healed,
      score: candidates[0].score,
      timestamp: new Date().toISOString(),
    });
    return healed;
  }

  _extractTokens(selector) {
    const tokens = [];
    const textMatch = selector.match(/(?:has-text|text)\s*[=(]\s*["']?([^"')]+)["']?\s*\)?/i);
    if (textMatch) tokens.push({ type: 'text', value: textMatch[1].trim() });

    const roleMatch = selector.match(/\[role=["']?([^\]"']+)["']?\]/i);
    if (roleMatch) tokens.push({ type: 'role', value: roleMatch[1] });

    const phMatch = selector.match(/\[placeholder[*^$]?=["']?([^\]"']+)["']?\]/i);
    if (phMatch) tokens.push({ type: 'placeholder', value: phMatch[1] });

    const ariaMatch = selector.match(/\[aria-label[*^$]?=["']?([^\]"']+)["']?\]/i);
    if (ariaMatch) tokens.push({ type: 'ariaLabel', value: ariaMatch[1] });

    const testIdMatch = selector.match(/\[data-testid=["']?([^\]"']+)["']?\]/i);
    if (testIdMatch) tokens.push({ type: 'dataTestId', value: testIdMatch[1] });

    return tokens;
  }

  _score(el, tokens) {
    let score = 0;
    for (const { type, value } of tokens) {
      const v = value.toLowerCase();
      if (type === 'text') {
        if (el.text?.toLowerCase().includes(v)) score += 10;
        if (el.ariaLabel?.toLowerCase().includes(v)) score += 8;
      } else if (type === 'role') {
        if (el.role?.toLowerCase() === v) score += 5;
      } else if (type === 'placeholder') {
        if (el.placeholder?.toLowerCase().includes(v)) score += 8;
      } else if (type === 'ariaLabel') {
        if (el.ariaLabel?.toLowerCase().includes(v)) score += 8;
      } else if (type === 'dataTestId') {
        if (el.dataTestId?.toLowerCase() === v) score += 15;
      }
    }
    return score;
  }

  _buildSelector(el) {
    if (el.dataTestId) return `[data-testid="${el.dataTestId}"]`;
    if (el.id) return `#${el.id}`;
    if (el.ariaLabel) return `[aria-label="${el.ariaLabel}"]`;
    if (el.role && el.text) return `[role="${el.role}"]:has-text("${el.text.slice(0, 50)}")`;
    if (el.text) return `:has-text("${el.text.slice(0, 50)}")`;
    return el.tag;
  }

  async _scanLiveDom(page, tokens) {
    for (const { type, value } of tokens) {
      if (type === 'text') {
        const loc = page.locator(`:has-text("${value}")`).first();
        const visible = await loc.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) return `:has-text("${value}")`;
      }
    }
    return null;
  }

  getHealingLog() {
    return [...this.healingLog];
  }
}
