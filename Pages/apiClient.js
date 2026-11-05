import fs from 'fs';

/**
 * Thin API helpers for API-integrated sanity checks (backend reads).
 *
 * Configuration (all from .env, nothing hardcoded):
 *   BREEZE_API_URL   optional - backend base URL. If unset it is discovered from the
 *                    first backend call the UI itself makes (POST /users/login).
 */

let discoveredApiBase = null;

/**
 * Start recording the backend origin from the UI's own calls: the login call every role makes
 * (POST /users/login) or a project call. A Viewer never creates a project, so login is the reliable one.
 */
export function trackApiBase(page) {
  page.on('response', (response) => {
    if (discoveredApiBase) return;
    const url = new URL(response.url());
    if (!/^\/(users\/login|projects)\/?$/.test(url.pathname)) return;
    if (url.origin !== new URL(page.url()).origin) discoveredApiBase = url.origin;
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
  // Same role as the browser: the QA Dashboard's ROLE selection (default / admin / viewer).
  const role = String(process.env.ROLE || 'default').toLowerCase();
  const fileName = { admin: 'session-auth-admin.json', viewer: 'session-auth-viewer.json' }[role] || 'session-auth.json';
  const file = new URL(`../${fileName}`, import.meta.url);
  const session = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const token = session?.value?.access_token;
  if (!token) throw new Error(`No access_token in ${fileName} - global-setup login did not complete.`);
  return token;
}

/** Authenticated GET against the backend as the role selected for this run. */
export async function apiGet(request, path) {
  return request.get(`${getApiBase()}${path}`, {
    headers: { Authorization: `Bearer ${getAccessToken()}` },
  });
}
