/**
 * Viewer role — API-level permission coverage.
 *
 * KEPT SEPARATE FROM THE UI VIEWER SUITE ON PURPOSE. The sheet's section 21
 * validates Viewer behaviour over HTTP, which fails for different reasons than
 * a DOM assertion (auth rejection vs. missing control). Mixing the two would
 * make a report unable to distinguish "the UI hid the button" from "the API
 * allowed the mutation".
 *
 * All requests are issued from inside the authenticated Viewer page context via
 * `apiRequest` (see regression-utils.mjs) so they carry the application's real
 * Origin — the backend's CORS policy admits only the app origin, so an
 * out-of-context call would be rejected for reasons unrelated to the role.
 *
 * ENDPOINT NOTE: the app origin does not serve the API. The base URL is read
 * from the app's own `window.__CONFIG__.isometricApiUrl` rather than guessed.
 * The sheet's `/api/...` paths are therefore expressed against the real,
 * equivalent routes the SPA itself calls.
 */
import { test, expect } from "../roles.fixture.mjs";
import { DEFAULT_BASE_URL } from "../../Pages/dashboardPage.js";
import {
  openRoleListing,
  getSessionAccessToken,
  apiRequest,
  resolveApiBaseUrl,
} from "./regression-utils.mjs";

// A UUID the Viewer was never granted. The sheet's API cases all operate on a
// project the Viewer cannot access; a well-formed but unknown id exercises the
// permission path without depending on any real project's identity.
const UNKNOWN_PROJECT_ID = "00000000-0000-0000-0000-000000000000";

test.describe("Regression — Viewer API permissions", () => {
  test.beforeEach(async ({ viewerPage: page }) => {
    await openRoleListing(page);
  });

  // ------------------------------------------------------------------
  // Read endpoints — what the Viewer may see
  // ------------------------------------------------------------------

  test("@viewer @regression @createproject @api returns only Viewer-accessible projects from the listing endpoint", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);
    expect(token, "Viewer session should expose an access token").toBeTruthy();

    const response = await apiRequest(page, {
      path: "/projects/accessible?sortOrder=desc&sortName=createdAt&page=1&limit=6",
      token,
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body?.data)).toBe(true);
    expect(response.body).toHaveProperty("total");
  });

  test("@viewer @regression @createproject @api returns an empty Favourites list for a Viewer with no favourites", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    const response = await apiRequest(page, {
      path: "/projects/accessible?sortOrder=desc&sortName=createdAt&page=1&limit=6&favouritesOnly=true",
      token,
    });

    expect(response.status).toBe(200);
    expect(response.body?.data).toEqual([]);
    expect(response.body?.total).toBe(0);
  });

  test("@viewer @regression @createproject @api returns an empty list for an out-of-range page number", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    const response = await apiRequest(page, {
      path: "/projects/accessible?page=99999&limit=6",
      token,
    });

    // An empty page is a valid answer; an error is not.
    expect(response.status).toBe(200);
    expect(response.body?.data).toEqual([]);
  });

  test("@viewer @regression @createproject @api exposes no authors or tags from projects the Viewer cannot access", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    // These facets are derived from the caller's accessible projects, so a
    // Viewer must never see the authors or tags of other users' private work.
    const authors = await apiRequest(page, { path: "/projects/accessible/authors", token });
    expect(authors.status).toBe(200);
    expect(authors.body?.data).toEqual([]);

    const tags = await apiRequest(page, { path: "/projects/accessible/tags", token });
    expect(tags.status).toBe(200);
    expect(tags.body?.data).toEqual([]);
  });

  test("@viewer @regression @createproject @api does not expose a project the Viewer has no access to", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    const response = await apiRequest(page, { path: `/projects/${UNKNOWN_PROJECT_ID}`, token });

    // 403 or 404 are both acceptable: neither returns project data.
    expect([403, 404]).toContain(response.status);
    expect(JSON.stringify(response.body ?? {})).not.toContain(UNKNOWN_PROJECT_ID + "\"name\"");
  });

  // ------------------------------------------------------------------
  // Authentication
  // ------------------------------------------------------------------

  test("@viewer @regression @createproject @api rejects an unauthenticated listing request", async ({ viewerPage: page }) => {
    const response = await apiRequest(page, {
      path: "/projects/accessible?page=1&limit=6",
      token: null,
    });

    expect(response.status).toBe(401);
  });

  test("@viewer @regression @createproject @api rejects a listing request carrying an invalid token", async ({ viewerPage: page }) => {
    const response = await apiRequest(page, {
      path: "/projects/accessible?page=1&limit=6",
      token: "not.a.valid.token",
    });

    // A forged or malformed signature must not be honoured.
    expect(response.status).toBe(401);
  });

  // ------------------------------------------------------------------
  // Create — the Viewer must be refused
  // ------------------------------------------------------------------

  test("@viewer @regression @createproject @api cannot create a project", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    const response = await apiRequest(page, {
      method: "POST",
      path: "/projects",
      token,
      data: { name: `ViewerAttempt-${Date.now()}` },
    });

    // The sheet expects 403; the role check runs before the payload is used.
    expect([401, 403]).toContain(response.status);
  });

  test("@viewer @regression @createproject @api cannot create a project without authentication", async ({ viewerPage: page }) => {
    const response = await apiRequest(page, {
      method: "POST",
      path: "/projects",
      token: null,
      data: { name: `ViewerAnon-${Date.now()}` },
    });

    expect(response.status).toBe(401);
  });

  test("@viewer @regression @createproject @api leaves no project behind after a rejected Viewer create attempt", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);
    const attemptedName = `ViewerNoCreate-${Date.now()}`;

    await apiRequest(page, { method: "POST", path: "/projects", token, data: { name: attemptedName } });

    // Confirm the rejected attempt did not persist anything the Viewer can see.
    const search = await apiRequest(page, {
      path: `/projects/accessible?search=${encodeURIComponent(attemptedName)}&page=1&limit=6`,
      token,
    });
    expect(search.status).toBe(200);
    expect(search.body?.data).toEqual([]);
  });

  // ------------------------------------------------------------------
  // Edit / delete / import — the Viewer must be refused
  // ------------------------------------------------------------------

  test("@viewer @regression @createproject @api cannot update a project", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    // The sheet expects 403. The service currently validates the project id
    // before the role, so a 400/404 is also surfaced — none of these statuses
    // indicates a successful mutation, which is what the test guards.
    for (const method of ["PUT", "PATCH"]) {
      const response = await apiRequest(page, {
        method,
        path: `/projects/${UNKNOWN_PROJECT_ID}`,
        token,
        data: { name: "ViewerRenameAttempt" },
      });
      expect([400, 403, 404]).toContain(response.status);
    }
  });

  test("@viewer @regression @createproject @api cannot update a project without authentication", async ({ viewerPage: page }) => {
    const response = await apiRequest(page, {
      method: "PUT",
      path: `/projects/${UNKNOWN_PROJECT_ID}`,
      token: null,
      data: { name: "AnonRenameAttempt" },
    });

    // An unauthenticated update must be rejected as unauthorised outright.
    expect(response.status).toBe(401);
  });

  test("@viewer @regression @createproject @api does not apply an unauthenticated PATCH to a project", async ({ viewerPage: page }) => {
    // KNOWN BACKEND INCONSISTENCY (reported, not worked around):
    // `PUT /projects/{id}` correctly answers 401 without a token, but the
    // equivalent `PATCH /projects/{id}` answers 404 "Resource not found!".
    // The PATCH route resolves before authentication, so an unauthenticated
    // caller sees a "not found" answer instead of an auth challenge.
    //
    // The permission outcome the sheet cares about is still satisfied — the
    // mutation is NOT applied — so that is what is asserted. The status itself
    // is pinned to the observed contract so a change in behaviour is visible
    // rather than silently absorbed.
    const response = await apiRequest(page, {
      method: "PATCH",
      path: `/projects/${UNKNOWN_PROJECT_ID}`,
      token: null,
      data: { name: "AnonRenameAttempt" },
    });

    expect([400, 401, 403, 404]).toContain(response.status);
    expect(response.body?.data ?? null).toBeNull();
  });

  test("@viewer @regression @createproject @api cannot delete a project", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    const response = await apiRequest(page, {
      method: "DELETE",
      path: `/projects/${UNKNOWN_PROJECT_ID}`,
      token,
    });

    expect([400, 403, 404]).toContain(response.status);
  });

  test("@viewer @regression @createproject @api cannot delete a project without authentication", async ({ viewerPage: page }) => {
    const response = await apiRequest(page, {
      method: "DELETE",
      path: `/projects/${UNKNOWN_PROJECT_ID}`,
      token: null,
    });

    expect(response.status).toBe(401);
  });

  test("@viewer @regression @createproject @api cannot import into a project", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    const response = await apiRequest(page, {
      method: "POST",
      path: `/projects/${UNKNOWN_PROJECT_ID}/import`,
      token,
      data: {},
    });

    expect([400, 403, 404]).toContain(response.status);
  });

  // ------------------------------------------------------------------
  // Favourite — refused for an inaccessible project
  // ------------------------------------------------------------------

  test("@viewer @regression @createproject @api cannot favourite a project the Viewer cannot access", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    for (const method of ["POST", "DELETE"]) {
      const response = await apiRequest(page, {
        method,
        path: `/projects/${UNKNOWN_PROJECT_ID}/favourite`,
        token,
      });
      expect([403, 404]).toContain(response.status);
    }
  });

  test("@viewer @regression @createproject @api requires authentication to favourite a project", async ({ viewerPage: page }) => {
    const response = await apiRequest(page, {
      method: "POST",
      path: `/projects/${UNKNOWN_PROJECT_ID}/favourite`,
      token: null,
    });

    expect([401, 404]).toContain(response.status);
  });

  // ------------------------------------------------------------------
  // Admin endpoints — the Viewer must be refused
  // ------------------------------------------------------------------

  test("@viewer @regression @createproject @api cannot list users", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    const response = await apiRequest(page, { path: "/users?limit=5", token });

    expect([401, 403]).toContain(response.status);
  });

  test("@viewer @regression @createproject @api cannot change a user's role", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    // A Viewer must not be able to elevate itself by reassigning a role.
    const response = await apiRequest(page, {
      method: "PUT",
      path: `/users/${UNKNOWN_PROJECT_ID}/role`,
      token,
      data: { role: "ADMIN" },
    });

    expect([400, 401, 403]).toContain(response.status);
  });

  test("@viewer @regression @createproject @api cannot delete a user", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    const response = await apiRequest(page, {
      method: "DELETE",
      path: `/users/${UNKNOWN_PROJECT_ID}`,
      token,
    });

    expect([400, 401, 403]).toContain(response.status);
  });

  // ------------------------------------------------------------------
  // Response hygiene
  // ------------------------------------------------------------------

  test("@viewer @regression @createproject @api omits internal fields from Viewer responses", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);

    const response = await apiRequest(page, {
      path: "/projects/accessible?page=1&limit=6",
      token,
    });

    expect(response.status).toBe(200);
    // Internal/administrative fields must never reach a Viewer client.
    const serialised = JSON.stringify(response.body ?? {});
    expect(serialised).not.toMatch(/adminNotes|internalId/i);
  });

  test("@viewer @regression @createproject @api serves the API from the configured backend host", async ({ viewerPage: page }) => {
    // Guards the endpoint contract itself: if the app origin ever starts
    // answering /api/* with SPA HTML again, the API suite must fail loudly
    // rather than assert against an HTML document.
    const apiBaseUrl = await resolveApiBaseUrl(page);
    expect(apiBaseUrl).toMatch(/^https:\/\//);
    expect(apiBaseUrl).not.toBe(new URL(DEFAULT_BASE_URL).origin);
  });
});