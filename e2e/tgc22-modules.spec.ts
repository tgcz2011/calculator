// ponytail (TGC-22): e2e smoke for the five UI calculators added in this
// batch — live exchange rates (currency sub-view), loan, tax, kin, and the
// picker tiles that route into them. These tests stay thin: the heavy math
// lives in src/loan/engine.ts, src/tax/engine.ts, and the relationship.js
// npm package; smoke.ts already covers those, so here we only assert that
// the UI surfaces the right components and lets the user interact with them.

import { test, expect, type Page } from '@playwright/test';

async function clearAndSeedLocale(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang-pref', 'zh');
  });
}

async function openTile(page: Page, mode: 'loan' | 'tax' | 'kin' | 'units'): Promise<void> {
  await page.goto('/');
  await clearAndSeedLocale(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByTestId(`picker-tile-${mode}`).click();
  // Picker should disappear; the mode's root testid should appear.
  await expect(page.getByTestId('calculator-picker')).toHaveCount(0);
  await expect(page.getByTestId(`${mode}-mode`)).toBeVisible();
}

test.describe('TGC-22 picker tiles', () => {
  test('loan / tax / kin tiles are visible on the picker', async ({ page }) => {
    await page.goto('/');
    await clearAndSeedLocale(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    for (const m of ['loan', 'tax', 'kin']) {
      await expect(page.getByTestId(`picker-tile-${m}`)).toBeVisible();
    }
  });

  test('loan tile routes to the loan calculator', async ({ page }) => {
    await openTile(page, 'loan');
    await expect(page.getByTestId('loan-equal-monthly')).toBeVisible();
  });

  test('tax tile routes to the tax calculator', async ({ page }) => {
    await openTile(page, 'tax');
    await expect(page.getByTestId('tax-comprehensive-result')).toBeVisible();
  });

  test('kin tile routes to the kinship calculator', async ({ page }) => {
    await openTile(page, 'kin');
    await expect(page.getByTestId('kin-result')).toBeVisible();
  });
});

test.describe('TGC-22 currency live rates', () => {
  test('currency sub-view shows refresh + snapshot info', async ({ page }) => {
    await openTile(page, 'units');
    // Switch to currency category.
    await page.getByRole('tab', { name: '货币', exact: true }).click();
    await expect(page.getByTestId('currency-snapshot')).toBeVisible();
    await expect(page.getByTestId('currency-source')).toBeVisible();
    await expect(page.getByTestId('currency-refresh')).toBeVisible();
    // Refresh button must not throw when clicked (network or fallback).
    await page.getByTestId('currency-refresh').click();
    await expect(page.getByTestId('units-result')).toBeVisible();
  });
});

test.describe('TGC-22 loan calculator', () => {
  test('defaults populate the equal-payment view', async ({ page }) => {
    await openTile(page, 'loan');
    await expect(page.getByTestId('loan-equal-monthly')).toContainText(/¥/);
  });

  test('switching to equal-principal shows first-year breakdown', async ({ page }) => {
    await openTile(page, 'loan');
    await page.getByRole('tab', { name: '等额本金', exact: true }).click();
    await expect(page.getByTestId('loan-principal-result')).toBeVisible();
    await expect(page.getByTestId('loan-principal-first')).toContainText(/¥/);
  });

  test('IRR view accepts haircut input and shows warning', async ({ page }) => {
    await openTile(page, 'loan');
    await page.getByRole('tab', { name: '实际年化', exact: true }).click();
    // Drop the received amount below the principal to simulate 砍头息.
    await page.getByTestId('loan-received-input').fill('800000');
    await expect(page.getByTestId('loan-irr-warning')).toBeVisible();
    await expect(page.getByTestId('loan-irr-apr')).toContainText('%');
  });

  test('prepay view shows savings when prepay > 0', async ({ page }) => {
    await openTile(page, 'loan');
    await page.getByRole('tab', { name: '提前还款', exact: true }).click();
    await expect(page.getByTestId('loan-prepay-saved')).toContainText(/¥/);
  });
});

test.describe('TGC-22 tax calculator', () => {
  test('comprehensive view shows tax + summary', async ({ page }) => {
    await openTile(page, 'tax');
    await expect(page.getByTestId('tax-comprehensive-tax')).toContainText(/¥/);
  });

  test('bonus view recommends one of the two tracks', async ({ page }) => {
    await openTile(page, 'tax');
    await page.getByRole('tab', { name: '年终奖', exact: true }).click();
    await expect(page.getByTestId('tax-bonus-preferred')).toContainText(/计税/);
    await expect(page.getByTestId('tax-bonus-separate-total')).toContainText(/¥/);
    await expect(page.getByTestId('tax-bonus-combined-total')).toContainText(/¥/);
  });

  test('grossup view solves back to a gross monthly salary', async ({ page }) => {
    await openTile(page, 'tax');
    await page.getByRole('tab', { name: '反推税前', exact: true }).click();
    await expect(page.getByTestId('tax-gross-monthly')).toContainText(/¥/);
  });
});

test.describe('TGC-22 kinship calculator', () => {
  test('default expression 爸爸的妈妈 resolves to 奶奶', async ({ page }) => {
    await openTile(page, 'kin');
    await expect(page.getByTestId('kin-result-value')).toContainText('奶奶');
  });

  test('quick chip appends to expression', async ({ page }) => {
    await openTile(page, 'kin');
    // Clear and start fresh.
    await page.getByTestId('kin-expr-input').fill('');
    // Tap 父 chip → 爸爸
    await page.getByTestId('kin-quick-father').click();
    await expect(page.getByTestId('kin-expr-input')).toHaveValue('爸爸');
    // Tap 母 chip → 爸爸的妈妈
    await page.getByTestId('kin-quick-mother').click();
    await expect(page.getByTestId('kin-expr-input')).toHaveValue('爸爸的妈妈');
    await expect(page.getByTestId('kin-result-value')).toContainText('奶奶');
  });

  test('reverse toggle flips direction', async ({ page }) => {
    await openTile(page, 'kin');
    // Switch to "对方称呼我" —叔叔 is then 我→侄
    await page.getByTestId('kin-expr-input').fill('叔叔');
    await page.getByTestId('kin-reverse-theirs').click();
    await expect(page.getByTestId('kin-result-value')).toContainText(/侄/);
  });

  test('region chips accept taps without error', async ({ page }) => {
    await openTile(page, 'kin');
    await page.getByTestId('kin-expr-input').fill('叔叔的爸爸');
    for (const id of ['kin-region-default', 'kin-region-north', 'kin-region-south']) {
      await page.getByTestId(id).click();
    }
    // Result still resolves to something non-empty after the last tap.
    await expect(page.getByTestId('kin-result-value')).toContainText(/.+/);
  });
});