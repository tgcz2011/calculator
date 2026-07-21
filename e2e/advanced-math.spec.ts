import { test, expect } from '@playwright/test';

// Advanced math calculator e2e. Mirrors calculator.spec.ts beforeEach: pin
// locale zh, boot, click the Calculus (高数) picker tile. Results are asserted
// via data-text (a plain-text mirror of the result) since KaTeX's rendered
// HTML uses math minus signs etc. that are fragile to assert on directly.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang-pref', 'zh');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('picker-tile-advanced').click();
  await expect(page.getByTestId('calculator-picker')).toHaveCount(0);
});

async function resultText(page: import('@playwright/test').Page): Promise<string> {
  const el = page.getByTestId('adv-result-text');
  await expect(el).toBeVisible();
  return el.getAttribute('data-text') ?? '';
}

test.describe('Advanced math calculator', () => {
  test('switching to Calculus hides the basic Display + Keypad', async ({ page }) => {
    await expect(page.getByTestId('adv-mode')).toBeVisible();
    await expect(page.locator('main input[aria-label="Expression"]')).toHaveCount(0);
  });

  test('seven sub-tabs are present; derivative is the default', async ({ page }) => {
    for (const id of ['solve', 'deriv', 'integral', 'limit', 'series', 'matrix', 'logic']) {
      await expect(page.getByTestId(`adv-tab-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('adv-tab-deriv')).toHaveAttribute('aria-selected', 'true');
  });

  test('derivative: d/dx x^3 = 3x^2', async ({ page }) => {
    // Default tab is deriv, default expr x^3, order 1.
    await page.getByTestId('adv-compute').click();
    await expect.poll(() => resultText(page)).toBe('3 * x ^ 2');
  });

  test('derivative: d3/dx3 x^3 = 6', async ({ page }) => {
    await page.getByTestId('adv-order').fill('3');
    await page.getByTestId('adv-compute').click();
    await expect.poll(() => resultText(page)).toBe('6');
  });

  test('solve: x^2 - 4 = 0 -> x = -2, x = 2', async ({ page }) => {
    await page.getByTestId('adv-tab-solve').click();
    await page.getByTestId('adv-expr').fill('x^2 - 4 = 0');
    await page.getByTestId('adv-compute').click();
    await expect.poll(() => resultText(page)).toBe('x = -2, x = 2');
  });

  test('integral: x^2 from 0 to 1 ~= 0.3333', async ({ page }) => {
    await page.getByTestId('adv-tab-integral').click();
    await page.getByTestId('adv-expr').fill('x^2');
    await page.getByTestId('adv-a').fill('0');
    await page.getByTestId('adv-b').fill('1');
    await page.getByTestId('adv-compute').click();
    await expect.poll(() => resultText(page)).toContain('0.3333');
  });

  test('limit: sin(x)/x as x->0 = 1', async ({ page }) => {
    await page.getByTestId('adv-tab-limit').click();
    await page.getByTestId('adv-expr').fill('sin(x)/x');
    await page.getByTestId('adv-point').fill('0');
    await page.getByTestId('adv-compute').click();
    await expect.poll(() => resultText(page)).toBe('1');
  });

  test('limit: (1+1/x)^x as x->inf = e', async ({ page }) => {
    await page.getByTestId('adv-tab-limit').click();
    await page.getByTestId('adv-expr').fill('(1+1/x)^x');
    await page.getByTestId('adv-point').fill('inf');
    await page.getByTestId('adv-compute').click();
    const txt = await resultText(page);
    expect(Number(txt)).toBeCloseTo(Math.E, 2);
  });

  test('series: taylor e^x order 5', async ({ page }) => {
    await page.getByTestId('adv-tab-series').click();
    await page.getByTestId('adv-expr').fill('e^x');
    await page.getByTestId('adv-order').fill('5');
    await page.getByTestId('adv-compute').click();
    await expect.poll(() => resultText(page)).toContain('1 + 1 * x');
  });

  test('matrix: det [[1,2],[3,4]] = -2', async ({ page }) => {
    await page.getByTestId('adv-tab-matrix').click();
    await page.getByTestId('adv-matrix').fill('1 2; 3 4');
    await page.getByTestId('adv-matrix-op-det').click();
    await page.getByTestId('adv-compute').click();
    await expect.poll(() => resultText(page)).toBe('-2');
  });

  test('matrix: solve Ax=b', async ({ page }) => {
    await page.getByTestId('adv-tab-matrix').click();
    await page.getByTestId('adv-matrix').fill('2 1; 1 -1');
    await page.getByTestId('adv-matrix-op-solve').click();
    await page.getByTestId('adv-matrix-b').fill('5\n-2');
    await page.getByTestId('adv-compute').click();
    // Solution x = [1, 3].
    await expect.poll(() => resultText(page)).toBe('1; 3');
  });

  test('logic: truth table for A and B has 4 rows, 1 true', async ({ page }) => {
    await page.getByTestId('adv-tab-logic').click();
    await page.getByTestId('adv-expr').fill('A and B');
    await page.getByTestId('adv-compute').click();
    const table = page.getByTestId('adv-truth-table');
    await expect(table).toBeVisible();
    // 4 assignment rows.
    await expect(table.locator('tbody tr')).toHaveCount(4);
    // Exactly one row with result T.
    await expect(table.locator('tbody td[data-result="T"]')).toHaveCount(1);
  });

  test('syntax error surfaces a stable error code', async ({ page }) => {
    await page.getByTestId('adv-tab-deriv').click();
    await page.getByTestId('adv-expr').fill('x @@ y');
    await page.getByTestId('adv-compute').click();
    const err = page.getByTestId('adv-result');
    await expect(err).toBeVisible();
    await expect(err).toHaveAttribute('data-error-code', /.+/);
  });
});
