/**
 * Role-based API coverage is kept separate from UI tests so HTTP
 * authorization is verified independently of control visibility.
 */
import { test, expect } from "../roles.fixture.mjs";
import { randomUUID } from "node:crypto";
import {
  openRoleListing,
  openCreateProject,
  selectListingTab,
  getSessionAccessToken,
  apiRequest,
  waitForProjectAbsentFromApi,
  waitForProjectHardDeleteCompletion,
} from "./regression-utils.mjs";

// -------------------------------------------------------------------------
// Module: Dashboard -> Create Project request handling
// Comment: Verify project creation keeps the form open when the request fails
// -------------------------------------------------------------------------
test("@enduser @regression @createproject @api Verify project creation keeps the form open when the request fails", async ({ page }) => {
  const createProjectPage = await openCreateProject(page);
  await createProjectPage.fillProjectName(`RequestFailure-${randomUUID()}`);
  await page.route(/\/projects(?:\?|$)/i, (route) => route.abort());

  const failedRequest = page.waitForEvent("requestfailed", {
    predicate: (request) =>
      request.method() === "POST" && /\/projects(?:\?|$)/i.test(request.url()),
  });
  await createProjectPage.save();
  await failedRequest;

  await expect(createProjectPage.dialog).toBeVisible();
  await createProjectPage.waitForFetchErrorMessage();
});

test.describe("Regression — Viewer API permissions", () => {
  test.beforeEach(async ({ viewerPage: page }) => {
    await openRoleListing(page);
  });

  // Source UI section: Dashboard > project listing, filters, search, categories.
  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project APIs
  // Comment: Verify Viewer dashboard APIs return categories and filtered project listings
  // -------------------------------------------------------------------------
  test("@viewer @regression @createproject @api Verify Viewer dashboard APIs return categories and filtered project listings", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);
    expect(token, "Viewer session should expose an access token").toBeTruthy();

    const categories = await apiRequest(page, { path: "/categories", token });
    expect(categories.status).toBe(201);
    expect(Array.isArray(categories.body?.data)).toBe(true);
    expect(typeof categories.body?.total).toBe("number");

    const projects = await apiRequest(page, {
      path: "/projects/accessible?sortOrder=desc&sortName=createdAt&page=1&limit=6",
      token,
    });
    expect(projects.status).toBe(200);
    expect(Array.isArray(projects.body?.data)).toBe(true);
    expect(typeof projects.body?.total).toBe("number");

    const favourites = await apiRequest(page, {
      path: "/projects/accessible?sortOrder=desc&sortName=createdAt&page=1&limit=6&favouritesOnly=true",
      token,
    });
    expect(favourites.status).toBe(200);
    expect(Array.isArray(favourites.body?.data)).toBe(true);
    expect(typeof favourites.body?.total).toBe("number");

    const archived = await apiRequest(page, {
      path: "/projects/accessible?archived=true&page=1&limit=6",
      token,
    });
    expect(archived.status).toBe(200);
    expect(Array.isArray(archived.body?.data)).toBe(true);
    expect(typeof archived.body?.total).toBe("number");

    const search = await apiRequest(page, {
      path: `/projects/search/accessible?q=${encodeURIComponent(`ViewerCoverageNoMatch-${randomUUID()}`)}&page=1&limit=6`,
      token,
    });
    expect(search.status).toBe(200);
    expect(search.body?.data).toEqual([]);
    expect(search.body?.total).toBe(0);
  });

  // Source UI sections: Dashboard > project listing/search and Create Project dialog.
  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project APIs
  // Comment: Verify Viewer project APIs reject missing and invalid authentication
  // -------------------------------------------------------------------------
  test("@viewer @regression @createproject @api Verify Viewer project APIs reject missing and invalid authentication", async ({ viewerPage: page }) => {
    const invalidToken = `invalid.${randomUUID()}`;
    for (const token of [null, invalidToken]) {
      const listing = await apiRequest(page, {
        path: "/projects/accessible?page=1&limit=6",
        token,
      });
      expect(listing.status).toBe(401);

      const search = await apiRequest(page, {
        path: `/projects/search/accessible?q=${encodeURIComponent(randomUUID())}&page=1&limit=6`,
        token,
      });
      expect(search.status).toBe(401);

      const create = await apiRequest(page, {
        method: "POST",
        path: "/projects",
        token,
        data: { name: `ViewerUnauthenticated-${randomUUID()}` },
      });
      expect(create.status).toBe(401);
    }
  });

  // Source UI section: Dashboard > project listing's selected-project filter.
  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project APIs
  // Comment: Verify Viewer project filtering does not expose an unknown project
  // -------------------------------------------------------------------------
  test("@viewer @regression @createproject @api Verify Viewer project filtering does not expose an unknown project", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);
    const query = new URLSearchParams({ "filters[uuid][$eq]": randomUUID() });

    const response = await apiRequest(page, {
      path: `/projects/accessible?${query}`,
      token,
    });

    expect(response.status).toBe(200);
    expect(response.body?.data).toEqual([]);
    expect(response.body?.total).toBe(0);
  });

  // API: GET /projects/accessible?page=99999&limit=6
  // Dashboard pagination must return an empty page while preserving the total
  // count for the same accessible-project query.
  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project APIs
  // Comment: Verify Viewer receives an empty API page for an out-of-range page number
  // -------------------------------------------------------------------------
  test("@viewer @regression @createproject @api Verify Viewer receives an empty API page for an out-of-range page number", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);
    const firstPage = await apiRequest(page, {
      path: "/projects/accessible?page=1&limit=6",
      token,
    });
    expect(firstPage.status).toBe(200);
    expect(typeof firstPage.body?.total).toBe("number");

    const response = await apiRequest(page, {
      path: "/projects/accessible?page=99999&limit=6",
      token,
    });

    expect(response.status).toBe(200);
    expect(response.body?.data).toEqual([]);
    expect(response.body?.total).toBe(firstPage.body.total);
  });

  // API: GET /projects/search/accessible?q=...
  // The Dashboard search must find only a project already returned as accessible to this Viewer.
  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project APIs
  // Comment: Verify Viewer can search for one accessible project through the API
  // -------------------------------------------------------------------------
  test("@viewer @regression @createproject @api Verify Viewer can search for one accessible project through the API", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);
    const listing = await apiRequest(page, {
      path: "/projects/accessible?sortOrder=desc&sortName=createdAt&page=1&limit=1",
      token,
    });
    expect(listing.status).toBe(200);
    expect(Array.isArray(listing.body?.data)).toBe(true);

    const project = listing.body.data[0];
    if (!project) {
      test.skip(true, "No Viewer-accessible project is available for positive project-search coverage.");
    }

    const projectId = project.uuid || project.id;
    const projectName = project.name;
    expect(projectId).toBeTruthy();
    expect(typeof projectName).toBe("string");
    expect(projectName.length).toBeGreaterThan(0);

    const search = await apiRequest(page, {
      path: `/projects/search/accessible?q=${encodeURIComponent(projectName)}&page=1&limit=6`,
      token,
    });
    expect(search.status).toBe(200);
    expect(Array.isArray(search.body?.data)).toBe(true);
    expect(search.body.data.some((item) => (item.uuid || item.id) === projectId)).toBe(true);
  });

  // API: GET /projects/accessible?page=1&limit=6
  // Viewer listing responses must not serialize known admin-only/internal fields.
  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project APIs
  // Comment: Verify Viewer listing responses omit internal fields
  // -------------------------------------------------------------------------
  test("@viewer @regression @createproject @api Verify Viewer listing responses omit internal fields", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);
    const response = await apiRequest(page, {
      path: "/projects/accessible?page=1&limit=6",
      token,
    });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body?.data)).toBe(true);
    expect(JSON.stringify(response.body)).not.toMatch(/adminNotes|internalId/i);
  });

  // Source UI section: Project dashboard > details, members, counts, design graph, and documents.
  // -------------------------------------------------------------------------
  // Module: Project Dashboard -> Viewer read APIs
  // Comment: Verify Viewer can read APIs for one accessible project
  // -------------------------------------------------------------------------
  test("@viewer @regression @createproject @api Verify Viewer can read APIs for one accessible project", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);
    const listing = await apiRequest(page, {
      path: "/projects/accessible?sortOrder=desc&sortName=createdAt&page=1&limit=6",
      token,
    });
    expect(listing.status).toBe(200);
    expect(Array.isArray(listing.body?.data)).toBe(true);

    const project = listing.body.data[0];
    if (!project) {
      test.skip(true, "No Viewer-accessible project is available; project-dependent API coverage cannot be executed.");
    }

    const projectId = project.uuid || project.id;
    expect(projectId).toBeTruthy();

    const selectedProjectQuery = new URLSearchParams({ "filters[uuid][$eq]": projectId });
    const details = await apiRequest(page, {
      path: `/projects/accessible?${selectedProjectQuery}`,
      token,
    });
    expect(details.status).toBe(200);
    expect(Array.isArray(details.body?.data)).toBe(true);
    expect(details.body?.total).toBe(1);
    expect(details.body.data.some((item) => (item.uuid || item.id) === projectId)).toBe(true);

    const members = await apiRequest(page, {
      path: `/projects/${encodeURIComponent(projectId)}/members`,
      token,
    });
    expect(members.status).toBe(200);
    expect(Array.isArray(members.body)).toBe(true);

    const invalidToken = `invalid.${randomUUID()}`;
    for (const tokenValue of [null, invalidToken]) {
      const unauthenticatedMembers = await apiRequest(page, {
        path: `/projects/${encodeURIComponent(projectId)}/members`,
        token: tokenValue,
      });
      expect(unauthenticatedMembers.status).toBe(401);
    }

    const nodeCounts = await apiRequest(page, {
      path: `/projects/${encodeURIComponent(projectId)}/node-counts`,
      token,
    });
    expect(nodeCounts.status).toBe(200);
    expect(nodeCounts.body).toHaveProperty("counts");

    const designGraph = await apiRequest(page, {
      path: `/design-graph/${encodeURIComponent(projectId)}/Website`,
      token,
    });
    expect(designGraph.status).toBe(200);
    expect(Array.isArray(designGraph.body?.data)).toBe(true);
    expect(typeof designGraph.body?.total).toBe("number");

    const selectedFields = "_id,architectureMetricsGenerated,agent,fileIndexedStatus,functionalMetricsGenerated,status,executionId";
    const artifactsQuery = new URLSearchParams({
      sortName: "updatedAt",
      sortOrder: "desc",
      "filters[uuid][eq]": projectId,
      "filters[type][eq]": "artifact",
      excludeCodeDerived: "true",
      page: "1",
      limit: "1",
      selectFields: selectedFields,
    });
    const artifacts = await apiRequest(page, {
      path: `/documents?${artifactsQuery}`,
      token,
    });
    expect(artifacts.status).toBe(200);
    expect(Array.isArray(artifacts.body?.data)).toBe(true);
    expect(typeof artifacts.body?.total).toBe("number");

    const documentsQuery = new URLSearchParams({
      sortName: "updatedAt",
      sortOrder: "desc",
      "filters[uuid][eq]": projectId,
      "filters[type][eq]": "document",
      excludeCodeDerived: "true",
      countOnly: "true",
      selectFields: selectedFields,
    });
    const documents = await apiRequest(page, {
      path: `/documents?${documentsQuery}`,
      token,
    });
    expect(documents.status).toBe(200);
    expect(Array.isArray(documents.body?.data)).toBe(true);
    expect(typeof documents.body?.total).toBe("number");
  });

  // Project options menu > Export Project; API: GET /projects/{id}/transfer/export.
  // Viewer export is permitted for an accessible project. Use only the first
  // accessible project and verify the response status and attachment metadata;
  // file integrity, contents, and permission filtering are not validated here.
  // -------------------------------------------------------------------------
  // Module: Dashboard -> Project export API
  // Comment: Verify Viewer can request an export for one accessible project
  // -------------------------------------------------------------------------
  test("@viewer @regression @createproject @api Verify Viewer can request an export for one accessible project", async ({ viewerPage: page }) => {
    const token = await getSessionAccessToken(page);
    const listing = await apiRequest(page, {
      path: "/projects/accessible?sortOrder=desc&sortName=createdAt&page=1&limit=1",
      token,
    });
    expect(listing.status).toBe(200);
    expect(Array.isArray(listing.body?.data)).toBe(true);

    const project = listing.body.data[0];
    if (!project) {
      test.skip(true, "No Viewer-accessible project is available for export coverage.");
    }

    const projectId = project.uuid || project.id;
    expect(projectId).toBeTruthy();
    const exportPath = `/projects/${encodeURIComponent(projectId)}/transfer/export`;
    const observedResponsePromise = page.waitForResponse((response) => {
      const request = response.request();
      return (
        request.method() === "GET" &&
        new URL(response.url()).pathname.endsWith(exportPath)
      );
    });

    const [response, observedResponse] = await Promise.all([
      apiRequest(page, { path: exportPath, token, readBody: false }),
      observedResponsePromise,
    ]);
    expect(response.status).toBe(200);
    const headers = await observedResponse.allHeaders();
    expect(headers["content-type"]).toMatch(/application\/x-ndjson\+gzip/i);
    expect(headers["content-disposition"]).toMatch(/^attachment;/i);
  });

  // Source UI section: Dashboard > Create Project dialog submission.
  // -------------------------------------------------------------------------
  // Module: Dashboard -> Viewer project APIs
  // Comment: Verify authenticated Viewer project creation is denied
  // -------------------------------------------------------------------------
  test("@viewer @regression @createproject @api Verify authenticated Viewer project creation is denied", async ({ viewerPage: page }) => {
    test.fixme(
      true,
      "The live API returned 201 and created a project for an authenticated Viewer. Do not retry this write until backend role enforcement is fixed."
    );

    const token = await getSessionAccessToken(page);
    const response = await apiRequest(page, {
      method: "POST",
      path: "/projects",
      token,
      data: { name: `ViewerAttempt-${randomUUID()}` },
    });
    expect(response.status).toBe(403);
  });
});

// API coverage for Admin project creation and permanent deletion, kept outside
// the UI lifecycle suite so that suite verifies user-visible workflows only.
// -------------------------------------------------------------------------
// Module: API -> Admin project lifecycle
// Comment: Verify Admin can create and hard-delete a project through the API
// -------------------------------------------------------------------------
test("@admin @regression @createproject @api Verify Admin can create and hard-delete a project through the API", async ({ adminPage: page }) => {
  await openRoleListing(page);
  const token = await getSessionAccessToken(page);
  expect(token, "Admin session should expose an access token").toBeTruthy();

  const projectName = `AdminApiLifecycle-${randomUUID()}`;
  let projectUuid = null;
  let hardDeleteAccepted = false;
  let hardDeleteCompleted = false;

  try {
    const createResponse = await apiRequest(page, {
      method: "POST",
      path: "/projects",
      token,
      data: { name: projectName },
    });
    expect(createResponse.status).toBe(201);
    projectUuid =
      createResponse.body?.uuid ||
      createResponse.body?.id ||
      createResponse.body?.data?.uuid ||
      createResponse.body?.data?.id;
    expect(projectUuid, "Admin project creation should return a project UUID").toBeTruthy();

    const hardDeleteResponse = await apiRequest(page, {
      method: "DELETE",
      path: `/projects/${encodeURIComponent(projectUuid)}/hard`,
      token,
    });
    hardDeleteAccepted = [200, 202].includes(hardDeleteResponse.status);
    expect(
      [200, 202],
      `Admin hard-delete API should accept project ${projectUuid}`
    ).toContain(hardDeleteResponse.status);

    await waitForProjectHardDeleteCompletion(page, projectUuid, token);
    await waitForProjectAbsentFromApi(page, projectUuid, token);
    hardDeleteCompleted = true;
  } finally {
    if (projectUuid && !hardDeleteCompleted) {
      if (!hardDeleteAccepted) {
        const cleanupResponse = await apiRequest(page, {
          method: "DELETE",
          path: `/projects/${encodeURIComponent(projectUuid)}/hard`,
          token,
        });
        expect(
          [200, 202],
          `Admin cleanup hard-delete API should accept project ${projectUuid}`
        ).toContain(cleanupResponse.status);
      }
      await waitForProjectHardDeleteCompletion(page, projectUuid, token);
      await waitForProjectAbsentFromApi(page, projectUuid, token);
      hardDeleteCompleted = true;
    }
  }

  expect(hardDeleteCompleted, "Admin hard deletion should complete and remove the project").toBe(true);
});
