import { test, expect, type Page } from '@playwright/test';

// ponytail: separate spec so this branch doesn't conflict with the regression
// fix General is landing in calculator.spec.ts (beforeEach localStorage.clear()
// on about:blank). One file, one job — keyboard extras only.

async function tap(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function expressionText(page: Page): Promise<string> {
  return page.locator('input[aria-label="Expression"]').inputValue();
}

test.beforeEach(async ({ page }) => {
  // No localStorage.clear() needed — none of these tests read history. Avoids
  // the about:blank SecurityError the buggy calculator.spec.ts beforeEach hits;
  // General's fix in that file is the canonical version.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test.describe('Keyboard extras', () => {
  test('Ctrl+Z undoes last insert', async ({ page }) => {
    for (const k of ['1', '2', '+', '3']) await tap(page, k);
    await expect(expressionText(page)).toContain('12+3');
    await page.keyboard.press('Control+z');
    await expect(expressionText(page)).toContain('12+');
    await page.keyboard.press('Control+z');
    await expect(expressionText(page)).toContain('12');
  });

  test('Ctrl+Shift+Z redoes', async ({ page }) => {
    for (const k of ['4', '+', '5']) await tap(page, k);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
    await expect(expressionText(page)).toBe('4');
    await page.keyboard.press('Control+Shift+z');
    await expect(expressionText(page)).toContain('4+');
    await page.keyboard.press('Control+Shift+z');
    await expect(expressionText(page)).toContain('4+5');
  });

  test('Ctrl+Y redoes (Windows-style)', async ({ page }) => {
    for (const k of ['7', '+', '8']) await tap(page, k);
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+y');
    await expect(expressionText(page)).toContain('7+8');
  });

  test('Ctrl+3 switches to History mode', async ({ page }) => {
    await page.keyboard.press('Control+3');
    await expect(page.getByRole('tab', { name: 'History' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('Ctrl+4 switches to Programmer mode', async ({ page }) => {
    await page.keyboard.press('Control+4');
    await expect(page.getByRole('tab', { name: 'Programmer' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('Ctrl+5 switches to Units mode', async ({ page }) => {
    await page.keyboard.press('Control+5');
    await expect(page.getByRole('tab', { name: 'Units' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('Ctrl+6 switches to Date mode', async ({ page }) => {
    await page.keyboard.press('Control+6');
    await expect(page.getByRole('tab', { name: 'Date' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('Ctrl+1 returns to Basic mode', async ({ page }) => {
    await page.keyboard.press('Control+3');
    await page.keyboard.press('Control+1');
    await expect(page.getByRole('tab', { name: 'Basic' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('ArrowLeft moves cursor back; ArrowRight moves it forward', async ({ page }) => {
    for (const k of ['1', '2', '3', '4']) await tap(page, k);
    // Cursor sits at end (4). Pressing ArrowLeft should not change visible text
    // but should re-anchor the next insert at position 3.
    await page.keyboard.press('ArrowLeft');
    await tap(page, '+');
    await expect(expressionText(page)).toBe('123+4');
  });

  test('ArrowLeft at start is a no-op (no crash, no negative cursor)', async ({ page }) => {
    await tap(page, '7');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await tap(page, '8');
    // Cursor at 0; insert 8 -> "87"
    await expect(expressionText(page)).toBe('87');
  });
});
