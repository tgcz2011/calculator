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

  // ponytail (TGC-27 #2 follow-up): the long-expression wrap fix removed the
  // result's auto-shrink-to-0.4x, which let a multi-line result spill past
  // the display column and paint visually onto the keypad on desktop
  // aspect-locked basic (152px display column vs ~315px three-line 100px
  // result). The Display wrapper now bounds its children (overflow:hidden)
  // and the result/textarea each have internal scroll when their content
  // exceeds their share. This test asserts the regression: result content
  // must stay inside the display column AND the keypad must start where the
  // display column ends (no overlap).
  test('long result on desktop aspect-locked basic stays inside the display column (no paint onto keypad)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chrome', 'desktop aspect-locked geometry is desktop-only');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByTestId('picker-tile-basic').click();
    // Ensure the desktop aspect lock is on (it's the default on desktop).
    const shell = page.locator('main.shell');
    await expect(shell).toHaveAttribute('data-aspect', 'locked');

    const input = page.locator('textarea[aria-label="Expression"]');
    await expect(input).toBeVisible();
    await input.click();
    // 1234567 * 8910111 -> 110001290006937 (15 digits, wraps to 3 lines at 100px).
    await page.keyboard.type('1234567*8910111');
    await input.press('Enter');
    const result = page.getByTestId('result');
    await expect(result).toBeVisible();

    const layout = await page.evaluate(() => {
      const display = document.querySelector('.display-area') as HTMLElement | null;
      const ta = document.querySelector('textarea[aria-label="Expression"]') as HTMLTextAreaElement | null;
      const res = document.querySelector('[data-testid="result"]') as HTMLElement | null;
      // Find the first VISIBLE .ui-key — basic/scientific keypads share the
      // .ui-key class with the hidden persistent mode panes (programmer,
      // chemistry, etc.) which are mounted with the HTML `hidden` attribute
      // to keep their state. document.querySelector picks the first one in
      // DOM order, which is always a hidden pane here (0×0 rect), so filter
      // by offsetParent to get the actually-rendered keypad.
      const allKeys = Array.from(document.querySelectorAll('.ui-key')) as HTMLElement[];
      const firstKey = allKeys.find((k) => k.offsetParent !== null) ?? null;
      if (!display || !ta || !res || !firstKey) return null;
      const dRect = display.getBoundingClientRect();
      const tRect = ta.getBoundingClientRect();
      const rRect = res.getBoundingClientRect();
      const kRect = firstKey.getBoundingClientRect();
      return {
        display: { top: dRect.top, bottom: dRect.bottom, height: display.clientHeight },
        textarea: { top: tRect.top, bottom: tRect.bottom, height: ta.clientHeight, scrollHeight: ta.scrollHeight, scrollTop: ta.scrollTop },
        result: { top: rRect.top, bottom: rRect.bottom, height: res.clientHeight, scrollHeight: res.scrollHeight, scrollTop: res.scrollTop },
        firstKey: { top: kRect.top, bottom: kRect.bottom },
      };
    });
    expect(layout).not.toBeNull();
    const l = layout!;
    // The result must not extend below the display column.
    expect(l.result.bottom).toBeLessThanOrEqual(l.display.bottom + 1);
    // The textarea must not extend below the display column either.
    expect(l.textarea.bottom).toBeLessThanOrEqual(l.display.bottom + 1);
    // The keypad must start at or below the display column's bottom edge
    // (no visual overlap of result/textarea onto keypad).
    expect(l.firstKey.top).toBeGreaterThanOrEqual(l.display.bottom - 1);
    // Sanity: result actually wraps onto multiple lines (3+) for this input.
    expect(l.result.scrollHeight).toBeGreaterThan(l.result.height * 1.4);
  });
});