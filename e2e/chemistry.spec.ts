import { test, expect } from '@playwright/test';

// Chemistry equation balancer e2e. Mirrors the calculator.spec.ts beforeEach:
// pin locale to zh, boot, click the Chemistry picker tile.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang-pref', 'zh');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('picker-tile-chemistry').click();
  await expect(page.getByTestId('calculator-picker')).toHaveCount(0);
});

test.describe('Chemistry balancer', () => {
  test('switching to Chemistry hides the basic Display + Keypad', async ({ page }) => {
    await expect(page.getByTestId('chem-mode')).toBeVisible();
    await expect(page.locator('main input[aria-label="Expression"]')).toHaveCount(0);
  });

  test('H2 + O2 -> H2O balances to 2 H2 + O2 -> 2 H2O', async ({ page }) => {
    await page.getByTestId('chem-input').fill('H2 + O2 -> H2O');
    await page.getByTestId('chem-balance').click();
    // Equation text contains the highlighted coefficients 2 ... 2.
    await expect(page.getByTestId('chem-equation')).toContainText('2');
    // Coefficients are exposed via data-coefficient attributes.
    const coeffs = page.locator('[data-coefficient]');
    await expect.poll(async () => coeffs.allTextContents()).toEqual(['2', '2']);
  });

  test('conservation table lists elements with matching counts', async ({ page }) => {
    await page.getByTestId('chem-input').fill('H2 + O2 -> H2O');
    await page.getByTestId('chem-balance').click();
    const table = page.getByTestId('chem-conservation');
    await expect(table).toBeVisible();
    // H row: reactants 4, products 4 (2*2 each side)
    await expect(table.locator('tr[data-element="H"] td').nth(1)).toHaveText('4');
    await expect(table.locator('tr[data-element="H"] td').nth(2)).toHaveText('4');
    // O row: reactants 2, products 2
    await expect(table.locator('tr[data-element="O"] td').nth(1)).toHaveText('2');
    await expect(table.locator('tr[data-element="O"] td').nth(2)).toHaveText('2');
  });

  test('Enter key triggers balance', async ({ page }) => {
    await page.getByTestId('chem-input').fill('C3H8 + O2 -> CO2 + H2O');
    await page.getByTestId('chem-input').press('Enter');
    await expect(page.getByTestId('chem-equation')).toBeVisible();
    // Coefficient 1 (C3H8) is omitted by chemistry convention; only non-1
    // coefficients render a data-coefficient span.
    const coeffs = page.locator('[data-coefficient]');
    await expect.poll(async () => coeffs.allTextContents()).toEqual(['5', '3', '4']);
  });

  test('example chips fill the input and balance', async ({ page }) => {
    // The KMnO4 redox example is the last chip.
    await page.getByTestId('chem-example-5').click();
    await expect(page.getByTestId('chem-input')).toHaveValue('KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2');
    await expect(page.getByTestId('chem-equation')).toBeVisible();
    const coeffs = page.locator('[data-coefficient]');
    await expect.poll(async () => coeffs.allTextContents()).toEqual(['2', '16', '2', '2', '8', '5']);
  });

  test('ionic equation balances and shows charge row', async ({ page }) => {
    await page.getByTestId('chem-input').fill('Fe2+ + Cu -> Fe + Cu2+');
    await page.getByTestId('chem-balance').click();
    await expect(page.getByTestId('chem-equation')).toBeVisible();
    // No coefficients (all 1) -> no data-coefficient spans.
    await expect(page.locator('[data-coefficient]')).toHaveCount(0);
    // Charge balance row present and balanced.
    await expect(page.locator('tr[data-element="charge"]')).toBeVisible();
    await expect(page.locator('tr[data-element="charge"] td[data-ok="true"]')).toBeVisible();
  });

  test('clear button wipes input and result', async ({ page }) => {
    await page.getByTestId('chem-input').fill('H2 + O2 -> H2O');
    await page.getByTestId('chem-balance').click();
    await expect(page.getByTestId('chem-result')).toBeVisible();
    await page.getByTestId('chem-clear').click();
    await expect(page.getByTestId('chem-input')).toHaveValue('');
    await expect(page.getByTestId('chem-result')).toHaveCount(0);
  });

  test('invalid input shows an error with stable error code', async ({ page }) => {
    // No arrow -> SYNTAX.
    await page.getByTestId('chem-input').fill('H2 + O2');
    await page.getByTestId('chem-balance').click();
    const err = page.getByTestId('chem-result');
    await expect(err).toBeVisible();
    await expect(err).toHaveAttribute('data-error-code', /SYNTAX|NO_SOLUTION|AMBIGUOUS/);
  });

  test('ambiguous reaction surfaces AMBIGUOUS error code', async ({ page }) => {
    await page.getByTestId('chem-input').fill('C + O2 -> CO + CO2');
    await page.getByTestId('chem-balance').click();
    await expect(page.getByTestId('chem-result')).toHaveAttribute('data-error-code', 'AMBIGUOUS');
  });
});
