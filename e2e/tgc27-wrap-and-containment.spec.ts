import { expect, test } from '@playwright/test';

test.describe('TGC-27 long-expression wrap + menu containment', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        localStorage.setItem('lang-pref', 'zh');
      } catch {}
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('basic calculator wraps long numeric input onto multiple lines', async ({ page }) => {
    await page.getByTestId('picker-tile-basic').click();
    const input = page.locator('textarea[aria-label="Expression"]');
    await expect(input).toBeVisible();
    await input.click();
    const longExpr = '1'.repeat(70);
    await page.keyboard.type(longExpr);
    await expect(input).toHaveValue(longExpr);
    // ponytail (TGC-27): the textarea auto-resizes to its scrollHeight after
    // the keystroke commits. If wrap is on, scrollHeight exceeds one line.
    // We measure BOTH lineCount (via offsetHeight / lineHeight) AND raw
    // scrollHeight vs single-line lineHeight so we don't depend on
    // getComputedStyle returning a non-zero lineHeight (textarea lineHeight
    // resolves to `normal` ~ 1.2em by default; we use 1.4 fallback).
    const meta = await input.evaluate((el) => {
      const ta = el as HTMLTextAreaElement;
      const cs = getComputedStyle(ta);
      const fs = parseFloat(cs.fontSize);
      const rawLh = parseFloat(cs.lineHeight);
      const lh = Number.isFinite(rawLh) && rawLh > 0 ? rawLh : fs * 1.4;
      const oneLineHeight = lh;
      return {
        offsetHeight: ta.offsetHeight,
        scrollHeight: ta.scrollHeight,
        clientHeight: ta.clientHeight,
        singleLineHeight: oneLineHeight,
        fontSize: fs,
        lineHeight: lh,
        // Visible wrap: scrollHeight > 1.5× singleLineHeight is a strong signal
        // the content wrapped onto >=2 lines.
        wrapsOnMultipleLines: ta.scrollHeight > oneLineHeight * 1.5,
        horizontalOverflow: ta.scrollWidth - ta.clientWidth,
      };
    });
    expect(meta.wrapsOnMultipleLines).toBe(true);
    expect(meta.horizontalOverflow).toBeLessThanOrEqual(2);
  });

  test('scientific calculator wraps long input the same way', async ({ page }) => {
    await page.getByTestId('picker-tile-scientific').click();
    const input = page.locator('textarea[aria-label="Expression"]');
    await expect(input).toBeVisible();
    // The scientific shell CSS-rotates and contains a giant scientific keypad
    // that overlays the textarea on click; use a force click to bypass the
    // overlay hit-test (the textarea still receives keystrokes via the App
    // keyboard router).
    await input.click({ force: true });
    const longExpr = '1'.repeat(70);
    await page.keyboard.type(longExpr);
    await expect(input).toHaveValue(longExpr);
    const meta = await input.evaluate((el) => {
      const ta = el as HTMLTextAreaElement;
      const cs = getComputedStyle(ta);
      const fs = parseFloat(cs.fontSize);
      const rawLh = parseFloat(cs.lineHeight);
      const lh = Number.isFinite(rawLh) && rawLh > 0 ? rawLh : fs * 1.4;
      return {
        scrollHeight: ta.scrollHeight,
        singleLineHeight: lh,
        wrapsOnMultipleLines: ta.scrollHeight > lh * 1.5,
        horizontalOverflow: ta.scrollWidth - ta.clientWidth,
      };
    });
    expect(meta.wrapsOnMultipleLines).toBe(true);
    expect(meta.horizontalOverflow).toBeLessThanOrEqual(2);
  });

  test('units chip-segment tabs stay fully visible on phone-portrait width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 720 });
    await page.getByTestId('picker-tile-units').click();
    // The Units chip-segment has data-testid via aria-label; address by its
    // visible role inside the active pane to skip the hidden chemistry/etc.
    const seg = page.locator('[data-testid="units-mode"] .ui-chip-segment').first();
    await expect(seg).toBeVisible();
    const overflow = await seg.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);
    const visibleChips = await seg.locator('.ui-chip').count();
    expect(visibleChips).toBeGreaterThanOrEqual(6);
  });

  test('app toolbar wraps pills on a 320px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.getByTestId('picker-tile-basic').click();
    const tb = page.locator('.app-toolbar').first();
    await expect(tb).toBeVisible();
    // Each pill must remain inside the toolbar box (no horizontal overflow).
    const tbOverflow = await tb.evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(tbOverflow).toBeLessThanOrEqual(2);
    const pillCount = await page.locator('.ui-pill').count();
    expect(pillCount).toBeGreaterThanOrEqual(5);
  });
});