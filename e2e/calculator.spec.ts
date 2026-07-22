import { test, expect, type Page, type Locator } from '@playwright/test';

// ponytail: KeypadButton uses aria-label for ops / fn keys (visible text
// differs from accessible name), e.g. "+" button -> aria-label="Add". The
// angle toggle now lives in the right-side toolbar (TGC-23 — the top TabBar
// was removed) with aria-label "Angle mode, currently DEG/RAD".
//
// ponytail (TGC-23): mode switching no longer goes through a top TabBar.
// The home-screen CalculatorPicker is the only mode selector in the UI; the
// `pickMode` helper below exits to the picker, then clicks the target tile.
// `history` is the one mode that isn't a picker tile (it's a view of past
// calculations, not a calculator — see spec.md §1) so we reach it via the
// Ctrl/Cmd+3 keyboard shortcut (useKeyboardExtras).
const ARIA_OP: Record<string, string> = {
  '+': 'Add', '−': 'Subtract', '×': 'Multiply', '÷': 'Divide',
  '%': 'Percent', '±': 'Negate', '=': 'Equals',
  AC: 'All clear',
  'x²': 'Square', 'xʸ': 'Exponent',
  sin: 'Sine', cos: 'Cosine', tan: 'Tangent',
  'π': 'Pi', ln: 'Natural log', log: 'Log base 10',
  '√': 'Square root', e: 'Euler number',
  '(': 'Open parenthesis', ')': 'Close parenthesis',
  '⌫': 'Backspace',
};
// ponytail (TGC-23): maps the legacy Chinese tab names to the English Mode
// tile suffix. The old TAB_LABELS set pointed at role=tab elements in the
// top TabBar; we now route them through the picker or the Ctrl+3 shortcut.
const ZH_TO_MODE: Record<string, string> = {
  '基础': 'basic',
  '科学': 'scientific',
  '历史': 'history',
  '程序员': 'programmer',
  '单位': 'units',
  '日期': 'date',
  '化学': 'chemistry',
  '高数': 'advanced',
  '贷款': 'loan',
  '个税': 'tax',
  '亲戚称呼': 'kin',
};

async function pickMode(page: Page, mode: string): Promise<void> {
  if (mode === 'history') {
    // ponytail: history isn't a picker tile (it's a view, see spec.md §1).
    // Ctrl/Cmd+3 routes to history through useKeyboardExtras.
    await page.keyboard.press('Control+3');
    return;
  }
  await page.getByTestId('exit-to-picker').click();
  await expect(page.getByTestId('calculator-picker')).toBeVisible();
  await page.getByTestId(`picker-tile-${mode}`).click();
  await expect(page.getByTestId('calculator-picker')).toHaveCount(0);
}

async function tap(page: Page, label: string): Promise<void> {
  if (label in ZH_TO_MODE) {
    await pickMode(page, ZH_TO_MODE[label]);
    return;
  }
  if (label === 'RAD' || label === 'DEG') {
    // Angle toggle moved to the right-side toolbar (App.tsx). aria-label
    // is still "Angle mode, currently DEG/RAD", so the regex still matches.
    await page.getByRole('button', { name: /^Angle mode, currently/ }).click();
    return;
  }
  const accessible = ARIA_OP[label] ?? label;
  await page.getByRole('button', { name: accessible, exact: true }).click();
}

// readResult returns a Locator so callers can pass it straight into expect().
// expect() does NOT auto-await a returned Promise<string> (Playwright 1.61),
// so the previous helper looked like it worked for toContain but broke for
// toBe/toMatch with "Received: Promise {}". A Locator is awaited by expect().
function resultLocator(page: Page): Locator {
  return page.locator("[aria-live='polite']").first();
}

async function readResult(page: Page): Promise<string> {
  return (await resultLocator(page).innerText()).trim();
}

async function errorCode(page: Page): Promise<string | null> {
  return resultLocator(page).getAttribute('data-error-code');
}

// ponytail: clear localStorage and pin locale to 'zh' for the test expectations
// (which mix English top-level tab labels with Chinese sub-tab / sync /
// currency strings). detectLocale() falls back to navigator.language when
// 'lang-pref' is unset, which differs between CI runners — pinning removes
// that flakiness. H4 i18n fixes translated Date sub-tabs, SyncSettings labels,
// and the currency snapshot, so we MUST pin to keep the Chinese expectations
// in the tests below valid.
//
// No picker-skip seed anymore — the picker always shows on boot. beforeEach
// clicks the Basic tile after the second goto so tests land in the calculator.
async function clearAndSeedLocale(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('lang-pref', 'zh');
  });
}

test.beforeEach(async ({ page }) => {
  // ponytail: goto before clear - localStorage.clear() on about:blank (opaque
  // origin) throws SecurityError on Chromium 131+. Navigate to origin, clear
  // + seed locale in one shot, then navigate again so App boots against a
  // fully primed localStorage. Finally click the Basic tile to enter the
  // calculator (no more picker-skip localStorage — picker always shows).
  await page.goto('/');
  await clearAndSeedLocale(page);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByTestId('picker-tile-basic').click();
  await expect(page.getByTestId('calculator-picker')).toHaveCount(0);
});

test.describe('Basic mode', () => {
  test('shows 0 on launch', async ({ page }) => {
    await expect(readResult(page)).resolves.toBe('');
  });

  test('12 + 34 = 46', async ({ page }) => {
    for (const k of ['1', '2', '+', '3', '4', '=']) await tap(page, k);
    await expect(readResult(page)).resolves.toBe('46');
  });

  test('12 × 3 = 36', async ({ page }) => {
    for (const k of ['1', '2', '×', '3', '=']) await tap(page, k);
    await expect(readResult(page)).resolves.toBe('36');
  });

  test('100 − 20% updates display', async ({ page }) => {
    // % is wired as /100. (100-20)/100 isn't "100 - 20%" semantics yet - verify
    // the live result updates correctly. The exact value is implementation detail.
    for (const k of ['1', '0', '0', '−', '2', '0', '%']) await tap(page, k);
    await expect(readResult(page)).resolves.toMatch(/-?\d/);
  });

  test('divide by zero shows Infinity', async ({ page }) => {
    for (const k of ['1', '÷', '0', '=']) await tap(page, k);
    await expect(readResult(page)).resolves.toBe('Infinity');
  });

  // ponytail: TGC-20 item 1 — deferred codes (UNCLOSED / PAREN /
  // MISSING_OPERAND) only surface after `=`. Typing partial expressions
  // shouldn't yell at the user mid-keystroke.
  test('partial expression shows no error until `=` is pressed (deferred UNCLOSED)', async ({ page }) => {
    await page.keyboard.type('1+');
    // Sticky-result UX: typing "1+" keeps the last good value "1" visible
    // (deferred UNCLOSED is hidden until commit). The error code stays null
    // because deferred codes don't surface live.
    await expect(readResult(page)).resolves.toBe('1');
    await expect(errorCode(page)).resolves.toBeNull();
    await tap(page, '=');
    await expect.poll(() => errorCode(page)).toBe('UNCLOSED');
  });

  test('partial paren shows no error until `=` is pressed (deferred PAREN)', async ({ page }) => {
    await page.keyboard.type('(1+2');
    await expect(readResult(page)).resolves.toBe('');
    await expect(errorCode(page)).resolves.toBeNull();
    await tap(page, '=');
    await expect.poll(() => errorCode(page)).toBe('PAREN');
  });

  test('unmatched paren emits errorCode=PAREN on commit', async ({ page }) => {
    // TGC-20: basic keypad now has `(` and `)` buttons. Type via keypad to
    // verify the new buttons wire through.
    for (const k of ['(', '1', '+', '2']) await tap(page, k);
    await expect(errorCode(page)).resolves.toBeNull();
    await tap(page, '=');
    await expect.poll(() => errorCode(page)).toBe('PAREN');
  });

  test('incomplete trailing operator emits errorCode=UNCLOSED on commit', async ({ page }) => {
    await page.keyboard.type('1+2*');
    await expect(errorCode(page)).resolves.toBeNull();
    await tap(page, '=');
    await expect.poll(() => errorCode(page)).toBe('UNCLOSED');
  });

  test('trailing operator emits errorCode=UNCLOSED on commit', async ({ page }) => {
    // mathjs classifies "1+" as "Unexpected end of expression" -> UNCLOSED,
    // not MISSING_OPERAND. With TGC-20 item 1, the live UNCLOSED is hidden;
    // commit on `=` re-surfaces it.
    for (const k of ['1', '+']) await tap(page, k);
    await expect(errorCode(page)).resolves.toBeNull();
    await tap(page, '=');
    await expect.poll(() => errorCode(page)).toBe('UNCLOSED');
  });

  test('unknown identifier emits errorCode=UNKNOWN_SYMBOL (live, not deferred)', async ({ page }) => {
    // UNKNOWN_SYMBOL is NOT in the deferred set — it surfaces as you type.
    await page.keyboard.type('foo+1');
    await expect.poll(() => errorCode(page)).toBe('UNKNOWN_SYMBOL');
  });

  test('unknown function emits errorCode=NOT_FUNCTION (live, not deferred)', async ({ page }) => {
    await page.keyboard.type('xyz(1)');
    await expect.poll(() => errorCode(page)).toBe('NOT_FUNCTION');
  });

  test('editing after a deferred error clears it', async ({ page }) => {
    // Type partial → commit → error shows. Editing should clear it.
    for (const k of ['1', '+']) await tap(page, k);
    await tap(page, '=');
    await expect.poll(() => errorCode(page)).toBe('UNCLOSED');
    // Any edit (insert or backspace) invalidates the committed error.
    await tap(page, '0');
    await expect.poll(() => errorCode(page)).toBeNull();
  });

  test('clearing expression clears the error code', async ({ page }) => {
    for (const k of ['1', '+']) await tap(page, k);
    await tap(page, '=');
    await expect.poll(() => errorCode(page)).toBe('UNCLOSED');
    await tap(page, 'AC');
    await expect.poll(() => errorCode(page)).toBeNull();
  });

  test('error state is also exposed via data-error attribute (on commit)', async ({ page }) => {
    for (const k of ['1', '+']) await tap(page, k);
    await tap(page, '=');
    await expect(resultLocator(page)).toHaveAttribute('data-error', 'true');
  });

  test('each error code renders a distinct glyph on commit', async ({ page }) => {
    // UNCLOSED via `1+2×`: basic keypad has × but the live UNCLOSED is
    // hidden until `=`. PAREN goes through the keyboard handler.
    const cases: Array<[string[], string, string]> = [
      [['1', '+', '2', '×'], 'UNCLOSED', '\u2026'],
      [['1', '+'], 'UNCLOSED', '\u2026'],
    ];
    for (const [keys, code, glyph] of cases) {
      await tap(page, 'AC');
      for (const k of keys) await tap(page, k);
      await tap(page, '=');
      const glyphEl = page.locator(`[data-error-code="${code}"] .error-glyph`);
      await expect(glyphEl).toBeVisible();
      await expect(glyphEl).toHaveText(glyph);
    }
    // PAREN: type via keyboard, commit.
    await tap(page, 'AC');
    await page.keyboard.type('(1+2');
    await tap(page, '=');
    const parenGlyph = page.locator('[data-error-code="PAREN"] .error-glyph');
    await expect(parenGlyph).toBeVisible();
    await expect(parenGlyph).toHaveText(')');
  });

  test('unknown symbol error renders ? glyph (live)', async ({ page }) => {
    await page.keyboard.type('foo+1');
    const glyphEl = page.locator('[data-error-code="UNKNOWN_SYMBOL"] .error-glyph');
    await expect(glyphEl).toBeVisible();
    await expect(glyphEl).toHaveText('?');
  });

  test('not-function error renders ƒ glyph (live)', async ({ page }) => {
    await page.keyboard.type('xyz(1)');
    const glyphEl = page.locator('[data-error-code="NOT_FUNCTION"] .error-glyph');
    await expect(glyphEl).toBeVisible();
    await expect(glyphEl).toHaveText('\u0192');
  });

  test('AC clears expression', async ({ page }) => {
    for (const k of ['1', '2', '3', '+', '4', '5']) await tap(page, k);
    await tap(page, 'AC');
    await expect(readResult(page)).resolves.toBe('');
  });

  test('keyboard input works', async ({ page }) => {
    await page.keyboard.type('2+3=');
    await expect(readResult(page)).resolves.toBe('5');
  });

  test('keyboard Enter evaluates', async ({ page }) => {
    await page.keyboard.type('9*8');
    await page.keyboard.press('Enter');
    await expect(readResult(page)).resolves.toBe('72');
  });

  // ponytail: TGC-20 item 5 — backspace key on the basic keypad.
  test('backspace key removes last character of expression', async ({ page }) => {
    for (const k of ['1', '2', '3']) await tap(page, k);
    await expect(page.locator('input[aria-label="Expression"]').inputValue()).resolves.toBe('123');
    await tap(page, '⌫');
    await expect(page.locator('input[aria-label="Expression"]').inputValue()).resolves.toBe('12');
    await tap(page, '⌫');
    await expect(page.locator('input[aria-label="Expression"]').inputValue()).resolves.toBe('1');
  });

  test('backspace on empty expression is a no-op', async ({ page }) => {
    // ponytail: Display shows '0' as the placeholder when expression is empty
    // (so the dark display area isn't visually blank). Backspace on an empty
    // expression must keep that placeholder, not crash or insert anything.
    await expect(page.locator('input[aria-label="Expression"]').inputValue()).resolves.toBe('0');
    await tap(page, '⌫');
    await expect(page.locator('input[aria-label="Expression"]').inputValue()).resolves.toBe('0');
  });

  // ponytail: TGC-20 item 4 — paren buttons on basic keypad.
  test('basic keypad has open/close parenthesis buttons', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Open parenthesis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close parenthesis' })).toBeVisible();
  });

  test('(1+2)*3 = 9 via keypad parens', async ({ page }) => {
    for (const k of ['(', '1', '+', '2', ')', '×', '3', '=']) await tap(page, k);
    await expect(readResult(page)).resolves.toBe('9');
  });

  test('(7-3)/2 = 2 via keypad parens', async ({ page }) => {
    for (const k of ['(', '7', '−', '3', ')', '÷', '2', '=']) await tap(page, k);
    await expect(readResult(page)).resolves.toBe('2');
  });
});

test.describe('Scientific mode', () => {
  test('sin(30) in DEG = 0.5', async ({ page }) => {
    await tap(page, '科学');
    // sin / cos / tan / √ buttons insert their own open paren. Adding a
    // separate `(` produced `sin((30` -> PAREN error, not the expected 0.5.
    for (const k of ['sin', '3', '0', ')']) await tap(page, k);
    await expect(readResult(page)).resolves.toMatch(/^0\.5/);
  });

  test('cos(60) in DEG = 0.5', async ({ page }) => {
    await tap(page, '科学');
    for (const k of ['cos', '6', '0', ')']) await tap(page, k);
    await expect(readResult(page)).resolves.toMatch(/^0\.5/);
  });

  test('tan(45) in DEG = 1', async ({ page }) => {
    await tap(page, '科学');
    for (const k of ['tan', '4', '5', ')']) await tap(page, k);
    await expect(readResult(page)).resolves.toMatch(/^1/);
  });

  test('sqrt(16) = 4', async ({ page }) => {
    await tap(page, '科学');
    // √ button inserts "√("; we still need to close it before = would matter.
    for (const k of ['√', '1', '6', ')']) await tap(page, k);
    await expect(readResult(page)).resolves.toBe('4');
  });

  test('factorial 5! = 120', async ({ page }) => {
    await tap(page, '科学');
    await page.keyboard.type('5!');
    await expect(readResult(page)).resolves.toBe('120');
  });

  test('toggle DEG/RAD changes sin result', async ({ page }) => {
    await tap(page, '科学');
    for (const k of ['sin', '3', '0', ')']) await tap(page, k);
    await expect(readResult(page)).resolves.toMatch(/^0\.5/);
    await tap(page, 'RAD');
    await expect(readResult(page)).resolves.toMatch(/-?0\.9/);
  });

  test('π evaluates to ~3.14159', async ({ page }) => {
    await tap(page, '科学');
    await tap(page, 'π');
    await expect(readResult(page)).resolves.toMatch(/^3\.14159/);
  });
});

test.describe('History tab', () => {
  test('records calculations and shows them', async ({ page }) => {
    for (const k of ['2', '+', '3', '=']) await tap(page, k);
    for (const k of ['4', '×', '5', '=']) await tap(page, k);
    await tap(page, '历史');
    // ponytail (L6): HistoryList header is now i18n'd via t('mode.history').
    // Use testId (locale-independent) to disambiguate from the History tab
    // label, which is also '历史' in zh locale.
    await expect(page.getByTestId('history-section-title')).toBeVisible();
    await expect(page.getByTestId('history-section-title')).toHaveText('历史');
    const items = page.locator("button:has(span:text('= '))");
    await expect(items).toHaveCount(2);
  });

  test('clearing history empties the list', async ({ page }) => {
    for (const k of ['7', '+', '8', '=']) await tap(page, k);
    await tap(page, '历史');
    await page.getByRole('button', { name: '清空' }).click();
    await expect(page.locator('text=还没有历史')).toBeVisible();
  });
});

test.describe('Responsive shell', () => {
  test('phone viewport renders phone shell', async ({ page }) => {
    const tier = await page.locator('main.shell').getAttribute('data-tier');
    expect(['phone', 'tablet', 'desktop']).toContain(tier);
  });
});

test.describe('Sync settings panel', () => {
  test('opens via gear button', async ({ page }) => {
    await page.getByTestId('open-sync-settings').click();
    await expect(page.getByTestId('sync-settings')).toBeVisible();
    await expect(page.getByTestId('sync-status')).toBeVisible();
  });

  test('坚果云 preset prefills endpoint + path + shows app-password hint', async ({ page }) => {
    await page.getByTestId('open-sync-settings').click();
    await expect(page.getByTestId('sync-endpoint')).toHaveValue('https://dav.jianguoyun.com/dav/');
    await expect(page.getByTestId('sync-path')).toHaveValue('/calc/sync.bin');
    await expect(page.getByText(/应用密码 - 在 jianguoyun\.com/)).toBeVisible();
  });

  test('switching to WebDAV clears the endpoint', async ({ page }) => {
    await page.getByTestId('open-sync-settings').click();
    await page.getByRole('radio', { name: 'WebDAV' }).check();
    await expect(page.getByTestId('sync-endpoint')).toHaveValue('');
  });

  test('connect button is disabled until all fields are valid', async ({ page }) => {
    await page.getByTestId('open-sync-settings').click();
    const connect = page.getByTestId('sync-connect');
    await expect(connect).toBeDisabled();
    await page.getByTestId('sync-username').fill('alice@example.com');
    await page.getByTestId('sync-password').fill('app-password-123');
    await page.getByTestId('sync-passphrase').fill('short');
    await expect(connect).toBeDisabled();
    await page.getByTestId('sync-passphrase').fill('correct-horse-battery');
    await page.getByTestId('sync-passphrase-confirm').fill('correct-horse-battery');
    await expect(connect).toBeEnabled();
  });

  test('passphrase mismatch shows error', async ({ page }) => {
    await page.getByTestId('open-sync-settings').click();
    await page.getByTestId('sync-username').fill('alice@example.com');
    await page.getByTestId('sync-password').fill('app-password-123');
    await page.getByTestId('sync-passphrase').fill('correct-horse-battery');
    await page.getByTestId('sync-passphrase-confirm').fill('different');
    await expect(page.getByText(/两次输入不一致/)).toBeVisible();
  });

  test('config persists, passphrase does not', async ({ page }) => {
    await page.getByTestId('open-sync-settings').click();
    await page.getByTestId('sync-username').fill('alice@example.com');
    await page.reload();
    await page.waitForLoadState('networkidle');
    // ponytail: picker always shows after reload (no persistence). Re-enter
    // the calculator before opening sync settings again.
    await page.getByTestId('picker-tile-basic').click();
    await page.getByTestId('open-sync-settings').click();
    await expect(page.getByTestId('sync-username')).toHaveValue('alice@example.com');
    await expect(page.getByTestId('sync-passphrase')).toHaveValue('');
  });

  test('close button dismisses the panel', async ({ page }) => {
    await page.getByTestId('open-sync-settings').click();
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.getByTestId('sync-settings')).toBeHidden();
  });

  test('clicking the backdrop closes the panel', async ({ page }) => {
    await page.getByTestId('open-sync-settings').click();
    // click in the backdrop area (top-left corner of the dialog)
    await page.mouse.click(5, 5);
    await expect(page.getByTestId('sync-settings')).toBeHidden();
  });

  test('iCloud shows waiting-for-native message', async ({ page }) => {
    await page.getByTestId('open-sync-settings').click();
    await page.getByRole('radio', { name: 'iCloud' }).check();
    await expect(page.getByText(/iCloud 同步等待原生 bridge/)).toBeVisible();
    // No WebDAV-specific fields under iCloud
    await expect(page.getByTestId('sync-endpoint')).toHaveCount(0);
  });
});

test.describe('Date / Time mode', () => {
  // ponytail (TGC-23): the old "Kinship tab is the last tab" test asserted
  // a TabBar ordering that's no longer applicable (TabBar removed). The
  // home-page picker has its own tile ordering — see e2e/tgc20-improvements
  // for the picker-tile coverage. No replacement here.

  test('switching to Date hides Display and Keypad', async ({ page }) => {
    await tap(page, '日期');
    await expect(page.getByTestId('date-mode')).toBeVisible();
    await expect(page.locator('main input[aria-label="Expression"]')).toHaveCount(0);
  });

  test('diff sub-tab computes days between two dates', async ({ page }) => {
    // DateTime.tsx computes `days = (a - b) / 86400000` so +N when A > B.
    // Fill A as the later date for the expected "+14" sign.
    await tap(page, '日期');
    await page.getByTestId('date-a').fill('2025-01-15');
    await page.getByTestId('date-b').fill('2025-01-01');
    await expect(page.getByTestId('date-diff-days')).toHaveText('+14 天');
  });

  test('diff is negative when A is before B', async ({ page }) => {
    await tap(page, '日期');
    await page.getByTestId('date-a').fill('2025-01-01');
    await page.getByTestId('date-b').fill('2025-01-15');
    await expect(page.getByTestId('date-diff-days')).toHaveText('-14 天');
  });

  test('add/sub adds days to a base date', async ({ page }) => {
    await tap(page, '日期');
    await page.getByRole('tab', { name: '加减' }).click();
    await page.getByTestId('date-base').fill('2025-01-01');
    await page.getByTestId('date-offset').fill('30');
    await expect(page.getByTestId('date-addsub-result-iso')).toHaveText('2025-01-31');
  });

  test('add/sub with negative offset goes backward', async ({ page }) => {
    await tap(page, '日期');
    await page.getByRole('tab', { name: '加减' }).click();
    await page.getByTestId('date-base').fill('2025-03-01');
    await page.getByTestId('date-offset').fill('-15');
    await expect(page.getByTestId('date-addsub-result-iso')).toHaveText('2025-02-14');
  });

  test('weekday sub-tab shows the weekday name', async ({ page }) => {
    await tap(page, '日期');
    await page.getByRole('tab', { name: '星期' }).click();
    await page.getByTestId('date-weekday-input').fill('2025-01-01');
    // Locale is pinned to zh (lang-pref=zh in clearAndSeedLocale via beforeEach),
    // so only the zh weekday should render; the en slot must not exist.
    await expect(page.getByTestId('date-weekday-zh')).toHaveText('星期三');
    await expect(page.getByTestId('date-weekday-en')).toHaveCount(0);
  });

  test('today button fills current date', async ({ page }) => {
    await tap(page, '日期');
    await page.getByRole('tab', { name: '星期' }).click();
    const today = new Date().toISOString().slice(0, 10);
    await page.getByTestId('date-today').click();
    await expect(page.getByTestId('date-weekday-input')).toHaveValue(today);
  });
});

test.describe('Units + Currency mode', () => {
  // ponytail (TGC-23): "Units tab is before Date tab" used to assert the top
  // TabBar order. Picker order is covered by tgc20-improvements.spec.ts. No
  // replacement here.

  test('switching to Units hides Display and Keypad', async ({ page }) => {
    await tap(page, '单位');
    await expect(page.getByTestId('units-mode')).toBeVisible();
    await expect(page.locator('main input[aria-label="Expression"]')).toHaveCount(0);
  });

  test('length conversion: 5 km = 5000 m', async ({ page }) => {
    await tap(page, '单位');
    await page.getByTestId('units-amount').fill('5');
    // convertUnits uses unitMath.format (no comma). Accept either form.
    await expect(page.getByTestId('units-result-value')).toContainText(/5,?000/);
  });

  test('mass conversion: 1 kg -> g = 1000', async ({ page }) => {
    await tap(page, '单位');
    await page.getByRole('tab', { name: '质量' }).click();
    await page.getByTestId('units-amount').fill('1');
    await expect(page.getByTestId('units-result-value')).toContainText(/1,?000/);
  });

  test('temperature conversion: 0 celsius -> 32 fahrenheit', async ({ page }) => {
    await tap(page, '单位');
    await page.getByRole('tab', { name: '温度' }).click();
    await page.getByTestId('units-amount').fill('0');
    await expect(page.getByTestId('units-result-value')).toContainText('32');
  });

  test('data conversion: 1 KiB -> 1024 byte', async ({ page }) => {
    await tap(page, '单位');
    await page.getByRole('tab', { name: '数据' }).click();
    await page.getByTestId('units-amount').fill('1');
    await page.getByTestId('units-from').selectOption('KiB');
    await page.getByTestId('units-to').selectOption('byte');
    await expect(page.getByTestId('units-result-value')).toContainText(/1,?024/);
  });

  test('swap button flips from/to', async ({ page }) => {
    await tap(page, '单位');
    await page.getByTestId('units-amount').fill('1');
    await expect(page.getByTestId('units-from')).toHaveValue('km');
    await expect(page.getByTestId('units-to')).toHaveValue('m');
    await page.getByTestId('units-swap').click();
    await expect(page.getByTestId('units-from')).toHaveValue('m');
    await expect(page.getByTestId('units-to')).toHaveValue('km');
  });

  test('currency shows snapshot stamp + USD/EUR conversion', async ({ page }) => {
    await tap(page, '单位');
    await page.getByRole('tab', { name: '货币' }).click();
    await expect(page.getByTestId('currency-snapshot')).toContainText('快照');
    await page.getByTestId('units-amount').fill('100');
    await page.getByTestId('units-from').selectOption('USD');
    await page.getByTestId('units-to').selectOption('EUR');
    // 100 USD * 0.92 = 92 EUR
    await expect(page.getByTestId('units-result-value')).toContainText('92');
    await expect(page.getByTestId('units-result-value')).toContainText('EUR');
  });
});

test.describe('Programmer mode', () => {
  // ponytail (TGC-23): "Programmer tab is the 4th tab in the locked order"
  // asserted the top TabBar ordering, which is gone. Picker tile ordering
  // is covered by tgc20-improvements.spec.ts. No replacement here.

  test('switching to Programmer hides the basic Display + Keypad', async ({ page }) => {
    await tap(page, '程序员');
    await expect(page.getByTestId('programmer-mode')).toBeVisible();
    await expect(page.locator('main input[aria-label="Expression"]')).toHaveCount(0);
  });

  test('HEX is the default radix and QWORD is the default word size', async ({ page }) => {
    await tap(page, '程序员');
    await expect(page.getByTestId('prog-radix-hex')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('prog-word-64')).toHaveAttribute('aria-checked', 'true');
  });

  test('hex letters A-F appear only when HEX is selected', async ({ page }) => {
    await tap(page, '程序员');
    await expect(page.getByTestId('prog-key-A')).toBeVisible();
    await page.getByTestId('prog-radix-dec').click();
    await expect(page.getByTestId('prog-key-A')).toHaveCount(0);
    await page.getByTestId('prog-radix-hex').click();
    await expect(page.getByTestId('prog-key-A')).toBeVisible();
  });

  test('non-allowed digits are disabled per radix (8/9 in BIN; A-F in DEC)', async ({ page }) => {
    await tap(page, '程序员');
    // HEX: all enabled
    await expect(page.getByTestId('prog-key-8')).toBeEnabled();
    await expect(page.getByTestId('prog-key-A')).toBeEnabled();
    // BIN: 8/9 disabled
    await page.getByTestId('prog-radix-bin').click();
    await expect(page.getByTestId('prog-key-8')).toBeDisabled();
    await expect(page.getByTestId('prog-key-9')).toBeDisabled();
    // DEC: A-F disabled
    await page.getByTestId('prog-radix-dec').click();
    await expect(page.getByTestId('prog-key-A')).toHaveCount(0);
  });

  test('FF + 1 = 100 in HEX QWORD', async ({ page }) => {
    await tap(page, '程序员');
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-add').click();
    await page.getByTestId('prog-key-1').click();
    await page.getByTestId('prog-key-eq').click();
    // HEX primary, padded to 16 chars (QWORD)
    await expect(page.getByTestId('prog-primary')).toContainText('0000000000000100');
  });

  test('radix table shows HEX/DEC/OCT/BIN all simultaneously', async ({ page }) => {
    await tap(page, '程序员');
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-F').click();
    // 0xFF = 255 dec = 0o377 = 0b11111111
    await expect(page.getByTestId('prog-radix-hex-value')).toContainText('FF');
    await expect(page.getByTestId('prog-radix-dec-value')).toContainText('255');
    await expect(page.getByTestId('prog-radix-oct-value')).toContainText('377');
    await expect(page.getByTestId('prog-radix-bin-value')).toContainText('11111111');
  });

  test('switching radix reformats the last token via toRadix', async ({ page }) => {
    await tap(page, '程序员');
    await page.getByTestId('prog-key-1').click();
    await page.getByTestId('prog-key-0').click(); // "10" in HEX = 16 dec
    await page.getByTestId('prog-radix-dec').click();
    // Now the same value reformatted to DEC: "10" (hex) = 16 dec -> expr shows "16"
    await expect(page.getByTestId('prog-expr')).toContainText('16');
  });

  test('switching word size re-masks (QWORD vs BYTE)', async ({ page }) => {
    await tap(page, '程序员');
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-F').click();
    // QWORD: FF as HEX
    await expect(page.getByTestId('prog-radix-hex-value')).toContainText('00000000000000FF');
    // Switch to BYTE: 0xFF truncated to 8 bits still 0xFF (hex), -1 (signed dec)
    // Engine contract (AGENTS.md): dec value is signed. 0xFF = 255u = -1s at 8-bit.
    await page.getByTestId('prog-word-8').click();
    await expect(page.getByTestId('prog-radix-hex-value')).toContainText('FF');
    await expect(page.getByTestId('prog-radix-dec-value')).toContainText('-1');
  });

  test('bitwise AND: 0xF0 & 0x0F = 0', async ({ page }) => {
    await tap(page, '程序员');
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-0').click();
    await page.getByTestId('prog-key-and').click();
    await page.getByTestId('prog-key-0').click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-eq').click();
    // Locator matcher is toContainText / toHaveText; .toMatch is for strings.
    await expect(page.getByTestId('prog-radix-hex-value')).toHaveText(/^0+$/);
  });

  test('AC clears expression', async ({ page }) => {
    await tap(page, '程序员');
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-ac').click();
    await expect(page.getByTestId('prog-expr')).toBeEmpty();
  });
});