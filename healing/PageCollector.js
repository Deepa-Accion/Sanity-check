import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_DATA_DIR = path.join(__dirname, '..', 'PageData');

export async function collectPage(page, name) {
  await fs.mkdir(PAGE_DATA_DIR, { recursive: true });

  const elements = await page.evaluate(() => {
    const results = [];
    for (const el of document.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      results.push({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: [...el.classList].join(' ') || null,
        text: el.textContent?.trim().slice(0, 200) || null,
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        placeholder: el.getAttribute('placeholder') || null,
        type: el.getAttribute('type') || null,
        name: el.getAttribute('name') || null,
        dataTestId: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || null,
      });
    }
    return results;
  });

  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100);
  await fs.writeFile(path.join(PAGE_DATA_DIR, `${safeName}.json`), JSON.stringify(elements, null, 2));
  return elements;
}

export async function loadPageData(name) {
  const safeName = name.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100);
  try {
    const raw = await fs.readFile(path.join(PAGE_DATA_DIR, `${safeName}.json`), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
