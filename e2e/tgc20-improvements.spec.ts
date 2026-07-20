// ponytail: dedicated spec for TGC-20 (改进逻辑) features. Kept separate from
// calculator.spec.ts so a regression here doesn't cascade. Covers:
//   - Calculator picker (home-screen selector, item 2)
//   - Language switcher (item 3)
//   - Backspace key in basic mode (item 5)
//   - Parens in basic mode (item 4)
//   - Deferred-error semantics (item 1) for incomplete expressions

import { test, expect, type Page, type Locator } from '@playwright/test';

async function seedBasicSkip(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('calc:last-pick', 'basic');
  });
}

async function clearPickerPref(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('calc:last-pick');
  });
}

async function clearLocalePref(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('lang-pref');
  });
}

function resultLocator(page: Page): Locator {
  return page.locator("[aria-live='polite']").first();
}

test.beforeEach(async ({ page }) => {
  // Boot from a clean localStorage. Individual tests seed what they need.
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test.describe('Calculator picker (item 2)', () => {
  test('shows picker when no last-pick is stored', async ({ page }) => {
    await clearPickerPref(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('calculator-picker')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Basic' }).first()).toBeVisible();
  });

  test('clicking the Basic tile enters the calculator and persists choice', async ({ page }) => {
    await clearPickerPref(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('picker-tile-basic').click();
    await expect(page.getByTestId('calculator-picker')).toHaveCount(0);
    // picker-skip persisted
    const stored = await page.evaluate(() => localStorage.getItem('calc:last-pick'));
    expect(stored).toBe('basic');
    // basic keypad is rendered
    await expect(page.getByRole('button', { name: 'Open parenthesis' })).toBeVisible();
  });

  test('returning visit with stored pref skips the picker', async ({ page }) => {
    await seedBasicSkip(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('calculator-picker')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open parenthesis' })).toBeVisible();
  });

  test('picker renders only Basic as enabled', async ({ page }) => {
    await clearPickerPref(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const tiles = page.locator('[data-testid^="picker-tile-"]');
    const count = await tiles.count();
    expect(count).toBeGreaterThanOrEqual(1);
    const enabled = await page.locator('[data-testid^="picker-tile-"][data-enabled="true"]').count();
    expect(enabled).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Language switcher (item 3)', () => {
  test('toggle switches locale and persists', async ({ page }) => {
    await seedBasicSkip(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const before = await page.evaluate(() => localStorage.getItem('lang-pref'));
    await page.getByTestId('toggle-locale').click();
    const after = await page.evaluate(() => localStorage.getItem('lang-pref'));
    expect(after).not.toBe(before);
    expect(['zh', 'en']).toContain(after);
  });

  test('TabBar labels reflect the active locale', async ({ page }) => {
    await seedBasicSkip(page);
    await clearLocalePref(page);
    // Force zh locale.
    await page.evaluate(() => localStorage.setItem('lang-pref', 'zh'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // First tab is Basic; in zh that's "基础".
    await expect(page.getByRole('tab').first()).toHaveText('基础');

    // Switch to en.
    await page.getByTestId('toggle-locale').click();
    await expect(page.getByRole('tab').first()).toHaveText('Basic');
  });

  test('display error message localizes based on locale', async ({ page }) => {
    await seedBasicSkip(page);
    await page.evaluate(() => localStorage.setItem('lang-pref', 'en'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.type('1+');
    await page.keyboard.press('Enter');
    await expect(resultLocator(page)).toContainText('Expression incomplete');

    // Switch to zh, type and commit again.
    await page.getByTestId('toggle-locale').click();
    await page.keyboard.press('Backspace'); // clear the 1
    await page.keyboard.type('2+');
    await page.keyboard.press('Enter');
    await expect(resultLocator(page)).toContainText('表达式未闭合');
  });

  test('unknown symbol error localizes on switch', async ({ page }) => {
    await seedBasicSkip(page);
    await page.evaluate(() => localStorage.setItem('lang-pref', 'en'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.type('foo+1');
    // Live error - UNKNOWN_SYMBOL is not deferred.
    await expect(resultLocator(page)).toContainText('Unknown symbol');

    await page.getByTestId('toggle-locale').click();
    await expect(resultLocator(page)).toContainText('未知符号');
  });

  test('<html lang> reflects active locale', async ({ page }) => {
    await seedBasicSkip(page);
    await page.evaluate(() => localStorage.setItem('lang-pref', 'zh'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.getByTestId('toggle-locale').click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('Basic mode parens (item 4)', () => {
  test('parenthesis buttons insert ( and )', async ({ page }) => {
    await seedBasicSkip(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Open parenthesis' }).click();
    await page.getByRole('button', { name: 'Close parenthesis' }).click();
    await expect(page.locator('input[aria-label="Expression"]').inputValue()).resolves.toBe('()');
  });

  test('nested parens evaluate correctly', async ({ page }) => {
    await seedBasicSkip(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    for (const k of ['(', '2', '+', '3', ')', '×', '(', '4', '+', '1', ')', '=']) {
      if (k === '(') await page.getByRole('button', { name: 'Open parenthesis' }).click();
      else if (k === ')') await page.getByRole('button', { name: 'Close parenthesis' }).click();
      else if (k === '=') await page.getByRole('button', { name: 'Equals' }).click();
      else if (k === '×') await page.getByRole('button', { name: 'Multiply' }).click();
      else if (k === '+') await page.getByRole('button', { name: 'Add' }).click();
      else await page.getByRole('button', { name: k, exact: true }).click();
    }
    await expect(resultLocator(page)).toContainText('25');
  });

  test('PAREN error stays hidden until `=` on unmatched paren', async ({ page }) => {
    await seedBasicSkip(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: 'Open parenthesis' }).click();
    await page.getByRole('button', { name: '1', exact: true }).click();
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: '2', exact: true }).click();
    // No error yet.
    await expect(resultLocator(page).getAttribute('data-error-code')).resolves.toBeNull();
    await page.getByRole('button', { name: 'Equals' }).click();
    await expect.poll(() => resultLocator(page).getAttribute('data-error-code')).toBe('PAREN');
  });
});

test.describe('Basic mode backspace (item 5)', () => {
  test('backspace key removes one character at a time', async ({ page }) => {
    await seedBasicSkip(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    for (const k of ['1', '2', '3', '4']) {
      await page.getByRole('button', { name: k, exact: true }).click();
    }
    await expect(page.locator('input[aria-label="Expression"]').inputValue()).resolves.toBe('1234');
    await page.getByRole('button', { name: 'Backspace' }).click();
    await expect(page.locator('input[aria-label="Expression"]').inputValue()).resolves.toBe('123');
    await page.getByRole('button', { name: 'Backspace' }).click();
    await expect(page.locator('input[aria-label="Expression"]').inputValue()).resolves.toBe('12');
  });

  test('backspace after committed error clears the error', async ({ page }) => {
    await seedBasicSkip(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.keyboard.type('1+');
    await page.keyboard.press('Enter');
    await expect.poll(() => resultLocator(page).getAttribute('data-error-code')).toBe('UNCLOSED');
    await page.getByRole('button', { name: 'Backspace' }).click();
    await expect.poll(() => resultLocator(page).getAttribute('data-error-code')).toBeNull();
  });
});