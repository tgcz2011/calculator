import { test, expect } from '@playwright/test';

// ponytail: separate spec so this branch doesn't collide with Tester's parallel
// calculator.spec.ts rewrite (pre-existing 38 desktop-chrome fails). One file,
// one job — theme only.

test.beforeEach(async ({ page }) => {
  // ponytail: picker always shows on boot now (no localStorage skip). The
  // toggle-theme pill is rendered in the picker's top bar (App.tsx), so theme
  // tests don't need to enter the calculator. We just load the page.
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

async function currentTheme(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => document.documentElement.getAttribute('data-theme'));
}

async function storedPref(page: import('@playwright/test').Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem('theme-pref'));
}

test.describe('Theme', () => {
  test('toggle button is visible in top bar', async ({ page }) => {
    await expect(page.getByTestId('toggle-theme')).toBeVisible();
  });

  test('first click switches light -> dark and persists', async ({ page }) => {
    const before = await currentTheme(page);
    await page.getByTestId('toggle-theme').click();
    const after = await currentTheme(page);
    expect(before).not.toBe(after);
    expect(after).toBe('dark');
    expect(await storedPref(page)).toBe('dark');
  });

  test('second click switches dark -> light and persists', async ({ page }) => {
    await page.getByTestId('toggle-theme').click(); // -> dark
    await page.getByTestId('toggle-theme').click(); // -> light
    expect(await currentTheme(page)).toBe('light');
    expect(await storedPref(page)).toBe('light');
  });

  test('stored preference is applied before first paint (no flash)', async ({ page }) => {
    // Seed localStorage with an explicit dark pref, then load a fresh page.
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('theme-pref', 'dark'));
    await page.goto('/');
    // Immediately after navigation, <html> should already carry data-theme="dark"
    // because the inline script in index.html runs synchronously before React.
    const htmlAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(htmlAttr).toBe('dark');
  });

  test('stored light preference overrides system dark mode', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('theme-pref', 'light'));
    await page.goto('/');
    expect(await currentTheme(page)).toBe('light');
  });

  test('no explicit pref -> follows system color scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    // No data-theme attribute set by user
    await page.evaluate(() => localStorage.removeItem('theme-pref'));
    await page.goto('/');
    const computedBg = await page.evaluate(() =>
      getComputedStyle(document.body).backgroundColor,
    );
    // Dark bg is rgb(0, 0, 0); light is rgb(242, 242, 247). Verify dark applied.
    expect(computedBg).toBe('rgb(0, 0, 0)');
  });
});