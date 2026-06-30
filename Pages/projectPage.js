import { expect } from "@playwright/test";

export async function openAllCards(page, projectId = null) {
  await knowlegeGraphGeneration(page);
  await projectHome(page, projectId);
  await knowledgeGraphVisualization(page);
  await projectHome(page, projectId);
  await architectureModeling(page);
  await projectHome(page, projectId);
  await exploreSemanticModel(page);
  await projectHome(page, projectId);
  await codeOntology(page);
  await projectHome(page, projectId);
  await userStory(page);
  await projectHome(page, projectId);
  await aiChatAssistant(page);
  await projectHome(page, projectId);
  await designGeneration(page);
}

async function openCard(page, patterns, label) {
  await page.waitForLoadState("domcontentloaded");
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(500);

  const locators = [];
  for (const pattern of patterns) {
    locators.push(page.getByRole("button", { name: pattern }).first());
    locators.push(page.getByRole("heading", { name: pattern }).first());
    locators.push(page.locator("button, [role='button'], h2, h3, h4, div").filter({ hasText: pattern }).first());
  }

  let target = null;
  for (const locator of locators) {
    const visible = await locator.isVisible({ timeout: 3000 }).catch(() => false);
    if (visible) {
      target = locator;
      break;
    }
  }

  if (!target) {
    console.warn(`[projectPage] ${label} card not found, skipping`);
    return false;
  }

  await expect(target).toBeVisible({ timeout: 10000 });
  await target.click();
  await page.waitForTimeout(2000);
  return true;
}

export async function projectHome(page, projectId = null) {
  await page.goto(`https://ai.accionbreeze.com/dashboard/${projectId}`);
}

export async function knowlegeGraphGeneration(page) {
  await openCard(
    page,
    [/Generate\s+Functional\s+Model/i, /Functional\s+Personas/i, /Functional\s+Ontology/i],
    "Functional generation"
  );
}

export async function knowledgeGraphVisualization(page) {
  await openCard(
    page,
    [/Knowledge\s+Graph/i, /Interactive\s+Neo4j\s+visualization/i],
    "Knowledge graph visualization"
  );
}

export async function aiChatAssistant(page) {
  await openCard(page, [/AI\s+Chat\s+Assistant/i], "AI chat assistant");
}

export async function designGeneration(page) {
  await openCard(
    page,
    [/Mockups/i, /Design\s+UX\/UI\s+patterns/i, /Design\s+Generation/i],
    "Design generation"
  );
}

export async function architectureModeling(page) {
  await openCard(
    page,
    [/Architecture\s+Modeler/i, /Architecture\s+Services/i, /Architecture\s+Modeling/i],
    "Architecture modeling"
  );
}

export async function exploreSemanticModel(page) {
  await openCard(
    page,
    [/Semantic\s+Model/i, /Explore\s+Semantic\s+Model/i, /Explore\s+Analyze/i],
    "Semantic model"
  );
}

export async function codeOntology(page) {
  await openCard(
    page,
    [/Code\s+Insights/i, /Codebase\s+analysis/i, /Code\s+Ontology/i],
    "Code ontology"
  );
}

export async function userStory(page) {
  await openCard(
    page,
    [/Tickets/i, /Gherkin/i, /Functional\s+Documentation/i, /User\s+Story/i],
    "User story"
  );
}
