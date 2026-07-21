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

  test('picker renders all five calculator tiles enabled (basic/scientific/programmer/units/date)', async ({ page }) => {
    await clearPickerPref(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const tiles = page.locator('[data-testid^="picker-tile-"]');
    const count = await tiles.count();
    // ponytail: 5 tiles — basic, scientific, programmer, units, date.
    // History is intentionally NOT a picker tile (it's a view, not a calculator).
    expect(count).toBe(5);
    const enabled = await page.locator('[data-testid^="picker-tile-"][data-enabled="true"]').count();
    expect(enabled).toBe(5);
    // Verify each tile is present by testid.
    for (const m of ['basic', 'scientific', 'programmer', 'units', 'date']) {
      await expect(page.getByTestId(`picker-tile-${m}`)).toBeVisible();
    }
  });

  test('picking Scientific tile enters scientific mode and persists choice', async ({ page }) => {
    await clearPickerPref(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('picker-tile-scientific').click();
    await expect(page.getByTestId('calculator-picker')).toHaveCount(0);
    const stored = await page.evaluate(() => localStorage.getItem('calc:last-pick'));
    expect(stored).toBe('scientific');
    // Scientific keypad renders the scientific function grid (sin / cos / etc.)
    // Use exact: true because "Cosine" contains "Sine" as a substring.
    await expect(page.getByRole('button', { name: 'Sine', exact: true })).toBeVisible();
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

  // ponytail (TGC-20 hotfix): button-click BS was the only path exercised
  // before, which is why 412 tests missed the double-dispatch. Click the
  // input to put real focus on it (matching user behaviour), then press BS
  // via keyboard — Display's local onKeyDown and App's window listener both
  // see the event; without the guard one press deleted two characters.
  test('keyboard Backspace on focused input deletes exactly one character', async ({ page }) => {
    await seedBasicSkip(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const input = page.locator('input[aria-label="Expression"]');
    // Build "1234" via the keypad so the cursor naturally lands at end (4).
    for (const k of ['1', '2', '3', '4']) {
      await page.getByRole('button', { name: k, exact: true }).click();
    }
    await expect(input.inputValue()).resolves.toBe('1234');
    // Now click the input to put real focus on it (user behaviour: edit in
    // place after typing). We need the click to land at the RIGHT edge of
    // the input so the caret stays at end (the text is right-aligned, so a
    // default center click lands in the empty left gutter and moves the
    // caret to position 0). The double-dispatch path is cursor-at-end; if
    // we land elsewhere, App's window handler bails out and the test no
    // longer exercises the bug.
    const box = await input.boundingBox();
    if (!box) throw new Error('input boundingBox is null');
    await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Expression',
    );
    // Single BS press — must delete exactly one char, not two.
    await page.keyboard.press('Backspace');
    await expect(input.inputValue()).resolves.toBe('123');
    await page.keyboard.press('Backspace');
    await expect(input.inputValue()).resolves.toBe('12');
    await page.keyboard.press('Backspace');
    await expect(input.inputValue()).resolves.toBe('1');
  });

  // ponytail (TGC-20 hotfix): same key-scoped guard should also fix the
  // related Enter-double-history bug (two equals() calls would record the
  // same expression twice into history). One press, one history entry.
  test('keyboard Enter on focused input records history exactly once', async ({ page }) => {
    await seedBasicSkip(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const input = page.locator('input[aria-label="Expression"]');
    // Operators expose aria-label = "Add" / "Subtract" etc., not the visible
    // symbol. We click the keypad buttons directly with the accessible name.
    await page.getByRole('button', { name: '2', exact: true }).click();
    await page.getByRole('button', { name: 'Add' }).click();
    await page.getByRole('button', { name: '3', exact: true }).click();
    const box = await input.boundingBox();
    if (!box) throw new Error('input boundingBox is null');
    await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === 'Expression',
    );
    // Pre-fix (TGC-20 hotfix), a single Enter press on the focused input
    // called calc.equals() twice — Display's local onKeyDown and App's
    // window listener each dispatched once — so two history entries landed
    // for the same 2+3 expression. After the fix, exactly one entry.
    await page.keyboard.press('Enter');
    await expect(resultLocator(page)).toContainText('5');
    const historyCount = await page.evaluate(() => {
      const raw = localStorage.getItem('calc:history');
      const arr = raw ? (JSON.parse(raw) as Array<{ result: string }>) : [];
      return arr.filter((e) => e.result === '5').length;
    });
    expect(historyCount).toBe(1);
  });
});