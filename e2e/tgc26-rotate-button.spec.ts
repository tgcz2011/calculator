// ponytail (TGC-26 #4): regression tests for the rotate (↻) button root fix.
//
// The bug: the ↻ button's onClick called orientation.toggle() on web, which
// routes to screen.orientation.lock() - dead on iOS Safari and denied
// fullscreen elsewhere - so the button was a no-op ("rotate键不生效"). The
// old e2e only asserted the button existed and was labeled "↻ 旋转"; it never
// asserted a click did anything, so the dead button sailed through 645
// passed. These tests click the button and assert the shell's
// data-force-landscape (mobile web) / data-aspect (desktop) actually flips.

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

test.describe('TGC-26 #4 ↻ button drives CSS force-landscape on mobile web', () => {
  test('basic: clicking ↻ toggles data-force-landscape true then false', async ({ page }, testInfo) => {
    // Only phone-portrait projects enter force-landscape (tier=phone,
    // orientation=portrait). Tablet/desktop skip.
    test.skip(
      !['mobile-iphone', 'mobile-android'].includes(testInfo.project.name),
      'Force-landscape only triggers on phone-portrait viewports.',
    );
    await page.getByTestId('picker-tile-basic').click();
    const shell = page.locator('main.shell');
    // Basic does not auto-rotate on enter.
    await expect(shell).toHaveAttribute('data-force-landscape', 'false');

    // Click ↻ -> rotated=true -> CSS force-landscape on.
    await page.getByTestId('toggle-orientation').click();
    await expect(shell).toHaveAttribute('data-force-landscape', 'true');
    await expect(shell).toHaveAttribute('data-orient', 'landscape');

    // Click ↻ again (now inside the rotated shell - pointer events remap
    // through the CSS transform, same as the Sine test in tgc25) -> back to
    // portrait.
    await page.getByTestId('toggle-orientation').click();
    await expect(shell).toHaveAttribute('data-force-landscape', 'false');
    await expect(shell).toHaveAttribute('data-orient', 'portrait');
  });

  test('scientific: ↻ overrides the auto-force-landscape off then on', async ({ page }, testInfo) => {
    test.skip(
      !['mobile-iphone', 'mobile-android'].includes(testInfo.project.name),
      'Force-landscape only triggers on phone-portrait viewports.',
    );
    await page.getByTestId('picker-tile-scientific').click();
    const shell = page.locator('main.shell');
    // Entering scientific auto-sets rotated=true (TGC-24 #6 auto-force-
    // landscape preserved).
    await expect(shell).toHaveAttribute('data-force-landscape', 'true');

    // ↻ overrides to portrait (user wants portrait scientific).
    await page.getByTestId('toggle-orientation').click();
    await expect(shell).toHaveAttribute('data-force-landscape', 'false');

    // ↻ again -> back to landscape.
    await page.getByTestId('toggle-orientation').click();
    await expect(shell).toHaveAttribute('data-force-landscape', 'true');
  });

  test('exiting to picker clears force-landscape even if rotated was on', async ({ page }, testInfo) => {
    test.skip(
      !['mobile-iphone', 'mobile-android'].includes(testInfo.project.name),
      'Force-landscape only triggers on phone-portrait viewports.',
    );
    await page.getByTestId('picker-tile-basic').click();
    await page.getByTestId('toggle-orientation').click();
    await expect(page.locator('main.shell')).toHaveAttribute('data-force-landscape', 'true');
    // Exit to picker -> rotated reset, picker never renders rotated. The
    // picker <main> doesn't carry data-force-landscape at all, so assert via
    // the absence of a CSS rotate transform (the user-visible guarantee).
    await page.getByTestId('exit-to-picker').click();
    await expect(page.getByTestId('calculator-picker')).toBeVisible();
    const transform = await page
      .locator('main.shell')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform).toBe('none');
  });
});

test.describe('TGC-26 #4 ↻ button toggles aspect lock on desktop (dataDesktop gate)', () => {
  test('clicking ↻ flips data-aspect locked <-> auto', async ({ page }, testInfo) => {
    // The desktop branch is gated on dataDesktop (isTauri || tier==='desktop'),
    // NOT the old static isDesktop (768px). On desktop-chrome (>=1024px) both
    // are true; this test pins that the ↻ button (not just the dedicated
    // toggle-aspect pill) toggles the aspect lock via dataDesktop.
    test.skip(
      testInfo.project.name !== 'desktop-chrome',
      'Aspect-lock CSS is desktop-platform only.',
    );
    await page.getByTestId('picker-tile-basic').click();
    const shell = page.locator('main.shell');
    await expect(shell).toHaveAttribute('data-desktop', 'true');
    await expect(shell).toHaveAttribute('data-aspect', 'locked');

    await page.getByTestId('toggle-orientation').click();
    await expect(shell).toHaveAttribute('data-aspect', 'auto');
    await page.getByTestId('toggle-orientation').click();
    await expect(shell).toHaveAttribute('data-aspect', 'locked');
  });
});
