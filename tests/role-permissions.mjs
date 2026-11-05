/**
 * The role the QA Dashboard run was started with (Role dropdown -> server.js sets ROLE).
 *   default -> End User      (BREEZE_USERNAME / BREEZE_PASSWORD)
 *   admin   -> System Admin  (BREEZE_USERNAME_ADMIN / BREEZE_PASSWORD_ADMIN)
 *   viewer  -> Viewer        (BREEZE_USERNAME_VIEWER / BREEZE_PASSWORD_VIEWER)
 */
const requested = String(process.env.ROLE || "default").toLowerCase();
export const ACTING_ROLE = ["admin", "viewer"].includes(requested) ? requested : "default";
export const ROLE_LABEL = { default: "End User", admin: "System Admin", viewer: "Viewer" };

/**
 * "Project Roles and Permissions Matrix" (Confluence page 2460450819) - who may do what.
 * Each row lists, in order: [End User as Project Owner, System Admin, Viewer with project role Admin,
 * Viewer with project role Viewer]. Row numbers are the matrix's "Sno".
 * Row 15 (embeddings) is "NA" for End User and Viewer in the matrix; treated as not allowed.
 */
const ALL = [true, true, true, true];
const EDITORS = [true, true, false, false];
const ADMIN_ONLY = [false, true, false, false];

export const MATRIX = {
  1: EDITORS, //  Create Project
  2: ALL, //      View Project
  3: EDITORS, //  Edit Project
  4: EDITORS, //  Delete Project
  5: ALL, //      Export Project
  6: EDITORS, //  Import Project
  7: [true, true, true, false], // Generate functional ontology
  8: ALL, //      View functional graph
  9: EDITORS, //  Generate code ontology
  10: ALL, //     View code graph
  11: ALL, //     Generate artifacts
  12: ALL, //     View generated artifacts
  13: EDITORS, // Generate architecture ontology
  14: ALL, //     View generated architecture
  15: ADMIN_ONLY, // Regeneration of embedding
  16: ALL, //     AI Chat assistant
  17: ADMIN_ONLY, // Raise a Jira ticket in AI chat
  18: EDITORS, // Share project
  19: EDITORS, // Generate design ontology
  20: ALL, //     View design ontology
  21: ALL, //     Download document
  22: EDITORS, // Manage tag
  23: EDITORS, // Delete document
  24: EDITORS, // Create Snapshot
  25: ADMIN_ONLY, // User Management
  26: ADMIN_ONLY, // Jira Management
  27: ALL, //     Theme change
  28: ALL, //     API Key generation
};

// Index of each acting role in a MATRIX row. A Viewer run uses the project role "Viewer".
const COLUMN = { default: 0, admin: 1, viewer: 3 };

/** May the role selected for this run perform matrix row `row`? */
export const can = (row, role = ACTING_ROLE) => MATRIX[row][COLUMN[role]];
