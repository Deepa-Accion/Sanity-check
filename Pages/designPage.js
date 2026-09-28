import { expect } from '@playwright/test';
import { CreateProjectPage } from './createProjectFile.js';


export async function clickOnDesign(page) {
}
export async function createUserJourney(page) {
  const searchInput = page.getByRole('textbox', { name: /search projects/i }).first();
  await expect(searchInput).toBeVisible({ timeout: 20000 });
  await searchInput.fill('');
  await expect(searchInput).toHaveValue('');
}

