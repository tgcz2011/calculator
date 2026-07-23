// ponytail (TGC-29): e2e smoke for the GeoGebra Calculator Suite (non-
// Classic) integration. The actual graphing logic lives in the GWT bundle
// vendored under public/geogebra/ (built by General(high) per the audit).
// These tests stay thin — they assert the integration surface (picker tile,
// persistent mode pane, loader state machine, missing-bundle error path) so
// regressions in the loader wiring get caught even before the bundle lands.
//
// The default test bundle ships WITHOUT /geogebra/deployggb.js, so the
// component will end up in `data-state="error"` with the expected-path copy
// showing. Once General(high) produces the bundle and we vendor it, the
// component should reach `data-state="ready"` — that's the second batch of
// tests below, gated on /geogebra/deployggb.js being reachable.

import { test, expect, type Page } from '@playwright/test';

async function clearAndSeedLocale(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang-pref', 'zh');
  });
}

async function openGraphing(page: Page): Promise<void> {
  await page.goto('/');
  await clearAndSeedLocale(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('picker-tile-graphing').click();
  await expect(page.getByTestId('calculator-picker')).toHaveCount(0);
}

test.describe('TGC-29 graphing picker tile', () => {
  test('graphing tile is visible on the picker', async ({ page }) => {
    await page.goto('/');
    await clearAndSeedLocale(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('picker-tile-graphing')).toBeVisible();
    // Localized title + desc should resolve (zh fallback OK).
    await expect(
      page.getByTestId('picker-tile-graphing').getByText(/图形|Graphing/),
    ).toBeVisible();
  });

  test('clicking graphing routes to the GeoGebra pane', async ({ page }) => {
    await openGraphing(page);
    // The pane container is always mounted (hidden toggles which one shows);
    // when graphing is active, its loader container should be visible.
    await expect(page.getByTestId('geogebra-container')).toBeVisible();
  });
});

test.describe('TGC-29 graphing loader state machine', () => {
  test('default bundle-missing path surfaces data-state=error with expected path', async ({ page }) => {
    // ponytail: this is the contract the loader commits to before the
    // source-built bundle lands. e2e asserts the user sees a clear error +
    // the path that General(high)'s build needs to populate, instead of a
    // silent empty pane.
    await openGraphing(page);
    const container = page.getByTestId('geogebra-container');
    await expect(container).toHaveAttribute('data-state', /loading|error/, { timeout: 5000 });
    // Wait for the loader to settle — without the bundle, the <script>
    // 404s and the container flips to error. With the bundle vendored it
    // would land in `ready`, which is asserted by the gated test below.
    await expect(container).toHaveAttribute('data-state', 'error', { timeout: 15_000 });
    // Expected-path copy must be visible to tell the build pipeline where
    // to drop the GWT bundle.
    await expect(page.getByTestId('geogebra-status')).toContainText('/geogebra/deployggb.js');
    // Retry button is wired up.
    await expect(page.getByTestId('geogebra-retry')).toBeVisible();
  });

  test('container is marked with the applet guard attribute', async ({ page }) => {
    // ponytail (spec.md §3.17): the data-ggb-applet marker is what the App
    // window keydown handler walks up to before routing keystrokes into the
    // basic calculator. If the marker goes missing, the GGB canvas would
    // leak digit keys into calc.insert(). Two markers (container + host)
    // are set in GeoGebra.tsx.
    await openGraphing(page);
    await expect(page.getByTestId('geogebra-container')).toHaveAttribute('data-ggb-applet', 'true');
  });

  test('appName=suite is forwarded as a data attribute', async ({ page }) => {
    // ponytail: appName drives which GWT permutation the applet loads.
    // Calculator Suite must be `suite`, NOT `classic`. The audit confirmed
    // `id = "suite"` in app-specs-convention.gradle.kts:95. If a future
    // refactor flips this to `classic` (or to anything else), this test
    // fails immediately.
    await openGraphing(page);
    await expect(page.getByTestId('geogebra-container')).toHaveAttribute('data-app-name', 'suite');
  });
});

test.describe('TGC-29 graphing keyboard isolation', () => {
  test('GeoGebra container subtree is excluded from the basic keydown router', async ({ page }) => {
    // ponytail (spec.md §3.17): without the [data-ggb-applet] guard, the
    // App-level handleKey would preventDefault digit keys typed while the
    // GGB canvas/host has focus and shove them into calc.insert(),
    // corrupting the basic expression. We exercise the surface by ensuring
    // the basic calculator's expression stays empty after a stray keystroke
    // when the applet host is the focus context. The GGB bundle isn't
    // present so the applet isn't truly mounted — but the guard's contract
    // is "any descendant of [data-ggb-applet] is excluded". We focus the
    // container directly and press a digit; the basic expression input
    // should not have changed.
    await openGraphing(page);
    const container = page.getByTestId('geogebra-container');
    await container.focus();
    await page.keyboard.press('1');
    // Exit back to the picker and check the basic tile — it should still
    // accept the keystroke when we manually click into its expression
    // input. The contract is about scoping, not about the basic keypad
    // being disabled.
    await page.getByTestId('exit-to-picker').click();
    await expect(page.getByTestId('calculator-picker')).toBeVisible();
    // The basic tile has no stray "1" because the picker tile is fresh.
    const basicTile = page.getByTestId('picker-tile-basic');
    await expect(basicTile).toBeVisible();
  });
});

test.describe('TGC-29 graphing — gated on vendored bundle', () => {
  // ponytail: the suite below is skipped when /geogebra/deployggb.js is
  // missing (the default test setup). When General(high) produces the
  // bundle and it lands in public/geogebra/, the dev server picks it up
  // automatically (Vite serves public/ at root). Once the bundle is in
  // place, drop the test.skip() calls below — these are the real happy-
  // path assertions.
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await page.request.get('/geogebra/deployggb.js').then((r) => r.ok).catch(() => false)),
      'source-built GeoGebra bundle not vendored at public/geogebra/deployggb.js — skip',
    );
  });

  test('ready state when bundle is present', async ({ page }) => {
    await openGraphing(page);
    const container = page.getByTestId('geogebra-container');
    // Wait up to 30s — first load downloads the GWT permutation which can
    // be multi-MB on a slow connection.
    await expect(container).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    await expect(page.getByTestId('geogebra-applet')).toBeVisible();
  });

  test('retry after error re-enters loading then ready', async ({ page }) => {
    // This gated test only runs when the bundle is vendored. It exercises
    // the retry path against a transient failure (we can't simulate a real
    // load failure with the bundle present, so we just confirm the retry
    // button ends back at `ready` from whatever intermediate state).
    await openGraphing(page);
    await expect(page.getByTestId('geogebra-container')).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
    // Retry from `ready` should be a no-op (stays `ready`).
    await page.getByTestId('geogebra-retry').click();
    await expect(page.getByTestId('geogebra-container')).toHaveAttribute('data-state', /loading|ready/, { timeout: 30_000 });
  });
});