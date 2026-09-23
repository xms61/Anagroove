import { expect, test, type Page } from '@playwright/test';

interface StoredClue {
  id: string;
  row: number;
  col: number;
  length: number;
  direction: 'across' | 'down';
  answer: string;
}

async function loadPuzzle(page: Page) {
  await page.goto('/');
  await expect(page).toHaveTitle(/^Anagroove/);
  // The first visit generates a puzzle from the fixture catalog and stores it locally
  await expect(page.getByRole('button', { name: /^1[AD]\b/ }).first()).toBeVisible({ timeout: 30_000 });
  const puzzle = await page.evaluate(() => JSON.parse(localStorage.getItem('spotyspice_active_live_puzzle') || 'null'));
  expect(puzzle?.clues?.length).toBeGreaterThan(0);
  return puzzle as { id: string; clues: StoredClue[] };
}

test('generate, type every answer, solve', async ({ page }) => {
  const puzzle = await loadPuzzle(page);
  const filled = new Set<string>();
  const input = page.locator('input[autocapitalize="characters"]');

  for (const clue of puzzle.clues) {
    const cells = Array.from({ length: clue.length }, (_, i) =>
      clue.direction === 'across' ? `${clue.row}:${clue.col + i}` : `${clue.row + i}:${clue.col}`);
    // Selecting a clue puts the cursor on its first empty cell; typing runs to the end of the word
    const firstEmpty = cells.findIndex(cell => !filled.has(cell));
    if (firstEmpty === -1) continue;
    await page.getByRole('button', { name: new RegExp(`^${clue.id}\\b`) }).click();
    await input.focus();
    await page.keyboard.type(clue.answer.slice(firstEmpty));
    cells.forEach(cell => filled.add(cell));
  }

  await expect(page.getByRole('dialog', { name: 'Songs In This Puzzle' })).toBeVisible();
  // The solve is recorded server-side (fire-and-forget request)
  await expect.poll(() => page.evaluate(async () => {
    const res = await fetch('/api/history', { headers: { 'X-User-Id': localStorage.getItem('spotyspice_user_id') || '' } });
    return JSON.stringify(await res.json());
  })).toContain(puzzle.id);
});

test('no horizontal scrolling on a 375 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await loadPuzzle(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the theme picked in Settings applies and survives a reload', async ({ page }) => {
  await loadPuzzle(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'city');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByLabel('Theme').selectOption('berlin');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'berlin');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'berlin');
});
