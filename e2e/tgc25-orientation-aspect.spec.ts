// ponytail (TGC-25): regression tests for the three "hard" fixes:
//   #6 scientific force-landscape (CSS rotate, not the broken Screen
//      Orientation API lock+hint),
//   #7 landscape scientific display no longer collapses to 0 (display-area
//      min-height floor; keypad scrolls),
//   #8 desktop aspect lock truly holds 9:16 (width derived from available
//      height) and engages on Tauri at any width (data-desktop).
//
// These pin the root causes so a future "fix" doesn't silently reintroduce
// the old lock+hint no-op, the 0.64-ratio drift, or the 0px display.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang-pref', 'zh');
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test.describe('TGC-25 #6 scientific force-landscape (CSS rotate)', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Force-landscape is device/orientation-driven; covered by the mobile projects.',
  );
  // Only the phone-portrait projects actually enter force-landscape
  // (isDesktop=false, tier=phone, orientation=portrait). Desktop/tablet
  // projects skip because isDesktop/tier differ at load.
  test('scientific on phone-portrait rotates the shell via CSS', async ({ page }, testInfo) => {
    test.skip(
      !['mobile-iphone', 'mobile-android'].includes(testInfo.project.name),
      'Force-landscape only triggers on phone-portrait viewports.',
    );
    await page.getByTestId('picker-tile-scientific').click();
    const shell = page.locator('main.shell');
    await expect(shell).toHaveAttribute('data-force-landscape', 'true');
    await expect(shell).toHaveAttribute('data-orient', 'landscape');
    // The shell is rotated: its transform is a non-identity matrix (rotate
    // 90deg), and its layout box is landscape (width > height).
    const { rotated, landscapeBox } = await shell.evaluate((el) => {
      const cs = getComputedStyle(el);
      const m = cs.transform; // "none" or matrix(...)
      const rotated = m !== 'none' && m.startsWith('matrix');
      return { rotated, landscapeBox: el.offsetWidth > el.offsetHeight };
    });
    expect(rotated).toBe(true);
    expect(landscapeBox).toBe(true);
    // Pointer events remap through the transform: tapping Sine inserts sin(.
    await page.getByRole('button', { name: 'Sine', exact: true }).click();
    await expect(page.locator('[aria-label="Expression"]')).toHaveValue('sin(');
  });

  test('basic mode does NOT force-landscape on phone-portrait', async ({ page }, testInfo) => {
    test.skip(
      !['mobile-iphone', 'mobile-android'].includes(testInfo.project.name),
      'Phone-portrait only.',
    );
    await page.getByTestId('picker-tile-basic').click();
    await expect(page.locator('main.shell')).toHaveAttribute('data-force-landscape', 'false');
  });
});

test.describe('TGC-25 #7 landscape scientific display floor', () => {
  test('display-area stays visible (not 0px) in landscape scientific', async ({ page }) => {
    // Load at phone portrait (isDesktop=false at module load), enter
    // scientific, then rotate to landscape. The scientific keypad has 8
    // rows; without the floor the display-area used to collapse to 0px.
    await page.getByTestId('picker-tile-scientific').click();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(150);
    const dispH = await page.locator('.display-area').evaluate((el) => el.offsetHeight);
    // 22vh of 390px ~= 86px. Floor keeps it well above 0 (the regression
    // value). Assert > 50 to leave room for token rounding.
    expect(dispH).toBeGreaterThan(50);
    // And the keypad scrolls internally instead of crushing the display.
    const keypadScrolls = await page.locator('main.shell').evaluate((el) => {
      const kp = Array.from(el.children).find((c) => c.querySelector('.ui-key'));
      return kp ? kp.scrollHeight > kp.clientHeight : false;
    });
    expect(keypadScrolls).toBe(true);
  });
});

test.describe('TGC-25 #8 desktop aspect lock (true 9:16)', () => {
  test('locked shell holds 9:16 (width derived from height)', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-chrome',
      'Aspect-lock CSS is desktop-platform only.',
    );
    await page.getByTestId('picker-tile-basic').click();
    const shell = page.locator('main.shell');
    await expect(shell).toHaveAttribute('data-desktop', 'true');
    await expect(shell).toHaveAttribute('data-aspect', 'locked');
    const ratio = await shell.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width / r.height;
    });
    // 9/16 = 0.5625. The old CSS drifted to ~0.64 because width stayed 480
    // while max-height capped height. Allow a tiny tolerance for sub-pixel
    // rounding from the min() formula.
    expect(Math.abs(ratio - 9 / 16)).toBeLessThan(0.01);
  });

  test('unlocking drops the ratio constraint (full-width column)', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop-chrome',
      'Aspect-lock CSS is desktop-platform only.',
    );
    await page.getByTestId('picker-tile-basic').click();
    await page.getByTestId('toggle-aspect').click();
    await expect(page.locator('main.shell')).toHaveAttribute('data-aspect', 'auto');
    const ratio = await page.locator('main.shell').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.width / r.height;
    });
    // Unlocked = 480-wide column at full height -> ratio clearly wider than
    // 9:16 (0.5625). On 1280x720 this is ~480/672 = 0.714.
    expect(ratio).toBeGreaterThan(0.6);
  });
});
