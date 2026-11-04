import fs from 'fs';

/**
 * Thin API helpers for API-integrated sanity checks (backend reads).
 *
 * Configuration (all from .env, nothing hardcoded):
 *   BREEZE_API_URL   optional - backend base URL. If unset it is discovered from the
 *                    first backend call the UI itself makes (POST /projects).
 */

let discoveredApiBase = null;

/** Start recording the backend origin from the UI's own POST /projects call. */
export function trackApiBase(page) {
  page.on('response', (response) => {
    if (discoveredApiBase) return;
    const request = response.request();
    if (request.method() !== 'POST') return;
    const url = new URL(response.url());
    if (/^\/projects\/?$/.test(url.pathname) && url.origin !== new URL(page.url()).origin) {
      discoveredApiBase = url.origin;
    }
  });
}

export function getApiBase() {
  const base = (process.env.BREEZE_API_URL || discoveredApiBase || '').replace(/\/$/, '');
  if (!base) {
    throw new Error('Backend API URL unknown: set BREEZE_API_URL in .env or run a UI project-creation step first.');
  }
  return base;
}

export function getAccessToken() {
  const file = new URL('../session-auth.json', import.meta.url);
  const session = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const token = session?.value?.access_token;
  if (!token) throw new Error('No access_token in session-auth.json - global-setup login did not complete.');
  return token;
}

/** Authenticated GET against the backend as the default user. */
export async function apiGet(request, path) {
  return request.get(`${getApiBase()}${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
}
