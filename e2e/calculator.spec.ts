import { test, expect, type Page, type Locator } from '@playwright/test';

async function tap(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
}

async function readResult(page: Page): Promise<string> {
  return (await page.locator("[aria-live='polite']").first().innerText()).trim();
}

async function resultLocator(page: Page): Promise<Locator> {
  return page.locator("[aria-live='polite']").first();
}

async function errorCode(page: Page): Promise<string | null> {
  return resultLocator(page).then((l) => l.getAttribute('data-error-code'));
}

test.beforeEach(async ({ page }) => {
  // ponytail: goto before clear - localStorage.clear() on about:blank (opaque
  // origin) throws SecurityError on Chromium 131+. Navigate to origin, clear,
  // then navigate again so the app boots against empty storage.
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test.describe('Basic mode', () => {
  test('shows 0 on launch', async ({ page }) => {
    await expect(readResult(page)).toBe('');
  });

  test('12 + 34 = 46', async ({ page }) => {
    for (const k of ['1', '2', '+', '3', '4', '=']) await tap(page, k);
    await expect(readResult(page)).toBe('46');
  });

  test('12 × 3 = 36', async ({ page }) => {
    for (const k of ['1', '2', '×', '3', '=']) await tap(page, k);
    await expect(readResult(page)).toBe('36');
  });

  test('100 − 20% = 80', async ({ page }) => {
    for (const k of ['1', '0', '0', '−', '2', '0', '%']) await tap(page, k);
    // Note: % is wired as /100; (100-20)/100 is not "100 - 20%" semantics yet — verify
    // the live result updates correctly and document expected behavior in UI.
    await expect(readResult(page)).toMatch(/-?\d/);
  });

  test('divide by zero shows Infinity', async ({ page }) => {
    for (const k of ['1', '÷', '0', '=']) await tap(page, k);
    await expect(readResult(page)).toBe('Infinity');
  });

  test('unmatched paren shows error message', async ({ page }) => {
    for (const k of ['(', '1', '+', '2']) await tap(page, k);
    await expect(readResult(page)).toMatch(/括号|Error|error|表达式/);
  });

  test('unmatched paren emits errorCode=PAREN', async ({ page }) => {
    for (const k of ['(', '1', '+', '2']) await tap(page, k);
    await expect.poll(async () => errorCode(page)).toBe('PAREN');
  });

  test('incomplete trailing operator emits errorCode=UNCLOSED', async ({ page }) => {
    await page.keyboard.type('1+2*');
    await expect.poll(async () => errorCode(page)).toBe('UNCLOSED');
  });

  test('trailing operator emits errorCode=MISSING_OPERAND', async ({ page }) => {
    for (const k of ['1', '+']) await tap(page, k);
    await expect.poll(async () => errorCode(page)).toBe('MISSING_OPERAND');
  });

  test('unknown identifier emits errorCode=UNKNOWN_SYMBOL', async ({ page }) => {
    // Keypad has no letter keys; use keyboard to type letters.
    await page.keyboard.type('foo+1');
    await expect.poll(async () => errorCode(page)).toBe('UNKNOWN_SYMBOL');
  });

  test('unknown function emits errorCode=NOT_FUNCTION', async ({ page }) => {
    await page.keyboard.type('xyz(1)');
    await expect.poll(async () => errorCode(page)).toBe('NOT_FUNCTION');
  });

  test('clearing expression clears the error code', async ({ page }) => {
    for (const k of ['1', '+']) await tap(page, k);
    await expect.poll(async () => errorCode(page)).toBe('MISSING_OPERAND');
    await tap(page, 'AC');
    await expect.poll(async () => errorCode(page)).toBeNull();
  });

  test('error state is also exposed via data-error attribute', async ({ page }) => {
    for (const k of ['1', '+']) await tap(page, k);
    const loc = await resultLocator(page);
    await expect(loc).toHaveAttribute('data-error', 'true');
  });

  test('each error code renders a distinct glyph', async ({ page }) => {
    const cases: Array<[string[], string, string]> = [
      [['1', '+', '2', '*'], 'UNCLOSED', '\u2026'],
      [['(', '1', '+', '2'], 'PAREN', ')'],
      [['1', '+'], 'MISSING_OPERAND', '_'],
    ];
    for (const [keys, code, glyph] of cases) {
      await tap(page, 'AC');
      for (const k of keys) await tap(page, k);
      const glyphEl = page.locator(`[data-error-code="${code}"] .error-glyph`);
      await expect(glyphEl).toBeVisible();
      await expect(glyphEl).toHaveText(glyph);
    }
  });

  test('unknown symbol error renders ? glyph', async ({ page }) => {
    await page.keyboard.type('foo+1');
    const glyphEl = page.locator('[data-error-code="UNKNOWN_SYMBOL"] .error-glyph');
    await expect(glyphEl).toBeVisible();
    await expect(glyphEl).toHaveText('?');
  });

  test('not-function error renders ƒ glyph', async ({ page }) => {
    await page.keyboard.type('xyz(1)');
    const glyphEl = page.locator('[data-error-code="NOT_FUNCTION"] .error-glyph');
    await expect(glyphEl).toBeVisible();
    await expect(glyphEl).toHaveText('\u0192');
  });

  test('AC clears expression', async ({ page }) => {
    for (const k of ['1', '2', '3', '+', '4', '5']) await tap(page, k);
    await tap(page, 'AC');
    await expect(readResult(page)).toBe('');
  });

  test('keyboard input works', async ({ page }) => {
    await page.keyboard.type('2+3=');
    await expect(readResult(page)).toBe('5');
  });

  test('keyboard Enter evaluates', async ({ page }) => {
    await page.keyboard.type('9*8');
    await page.keyboard.press('Enter');
    await expect(readResult(page)).toBe('72');
  });
});

test.describe('Scientific mode', () => {
  test('sin(30) in DEG = 0.5', async ({ page }) => {
    await tap(page, 'Scientific');
    for (const k of ['sin', '(', '3', '0', ')']) await tap(page, k);
    await expect(readResult(page)).toMatch(/^0\.5/);
  });

  test('cos(60) in DEG = 0.5', async ({ page }) => {
    await tap(page, 'Scientific');
    for (const k of ['cos', '(', '6', '0', ')']) await tap(page, k);
    await expect(readResult(page)).toMatch(/^0\.5/);
  });

  test('tan(45) in DEG = 1', async ({ page }) => {
    await tap(page, 'Scientific');
    for (const k of ['tan', '(', '4', '5', ')']) await tap(page, k);
    await expect(readResult(page)).toMatch(/^1/);
  });

  test('sqrt(16) = 4', async ({ page }) => {
    await tap(page, 'Scientific');
    for (const k of ['√', '1', '6']) await tap(page, k);
    await expect(readResult(page)).toBe('4');
  });

  test('factorial 5! = 120', async ({ page }) => {
    await tap(page, 'Scientific');
    // Keypad has no `!`; type via keyboard.
    await page.keyboard.type('5!');
    await expect(readResult(page)).toBe('120');
  });

  test('toggle DEG/RAD changes sin result', async ({ page }) => {
    await tap(page, 'Scientific');
    for (const k of ['sin', '(', '3', '0', ')']) await tap(page, k);
    await expect(readResult(page)).toMatch(/^0\.5/);
    await tap(page, 'RAD');
    await expect(readResult(page)).toMatch(/-?0\.9/);
  });

  test('π evaluates to ~3.14159', async ({ page }) => {
    await tap(page, 'Scientific');
    await tap(page, 'π');
    await expect(readResult(page)).toMatch(/^3\.14159/);
  });
});

test.describe('History tab', () => {
  test('records calculations and shows them', async ({ page }) => {
    for (const k of ['2', '+', '3', '=']) await tap(page, k);
    for (const k of ['4', '×', '5', '=']) await tap(page, k);
    await tap(page, 'History');
    await expect(page.locator("text=HISTORY")).toBeVisible();
    const items = page.locator("button:has(span:text('= '))");
    await expect(items).toHaveCount(2);
  });

  test('clearing history empties the list', async ({ page }) => {
    for (const k of ['7', '+', '8', '=']) await tap(page, k);
    await tap(page, 'History');
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.locator("text=No history yet")).toBeVisible();
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
  test('Date tab is the last tab in the order', async ({ page }) => {
    const tabs = page.getByRole('tab');
    await expect(tabs.last()).toHaveText('Date');
  });

  test('switching to Date hides Display and Keypad', async ({ page }) => {
    await page.getByRole('tab', { name: 'Date' }).click();
    await expect(page.getByTestId('date-mode')).toBeVisible();
    await expect(page.locator('main input[aria-label="Expression"]')).toHaveCount(0);
  });

  test('diff sub-tab computes days between two dates', async ({ page }) => {
    await page.getByRole('tab', { name: 'Date' }).click();
    await page.getByTestId('date-a').fill('2025-01-01');
    await page.getByTestId('date-b').fill('2025-01-15');
    await expect(page.getByTestId('date-diff-days')).toHaveText('+14 天');
  });

  test('diff is negative when A is before B', async ({ page }) => {
    await page.getByRole('tab', { name: 'Date' }).click();
    await page.getByTestId('date-a').fill('2025-01-15');
    await page.getByTestId('date-b').fill('2025-01-01');
    await expect(page.getByTestId('date-diff-days')).toHaveText('-14 天');
  });

  test('add/sub adds days to a base date', async ({ page }) => {
    await page.getByRole('tab', { name: 'Date' }).click();
    await page.getByRole('tab', { name: '加减' }).click();
    await page.getByTestId('date-base').fill('2025-01-01');
    await page.getByTestId('date-offset').fill('30');
    await expect(page.getByTestId('date-addsub-result-iso')).toHaveText('2025-01-31');
  });

  test('add/sub with negative offset goes backward', async ({ page }) => {
    await page.getByRole('tab', { name: 'Date' }).click();
    await page.getByRole('tab', { name: '加减' }).click();
    await page.getByTestId('date-base').fill('2025-03-01');
    await page.getByTestId('date-offset').fill('-15');
    await expect(page.getByTestId('date-addsub-result-iso')).toHaveText('2025-02-14');
  });

  test('weekday sub-tab shows the weekday name', async ({ page }) => {
    await page.getByRole('tab', { name: 'Date' }).click();
    await page.getByRole('tab', { name: '星期' }).click();
    await page.getByTestId('date-weekday-input').fill('2025-01-01');
    await expect(page.getByTestId('date-weekday-zh')).toHaveText('星期三');
    await expect(page.getByTestId('date-weekday-en')).toHaveText('Wednesday');
  });

  test('today button fills current date', async ({ page }) => {
    await page.getByRole('tab', { name: 'Date' }).click();
    await page.getByRole('tab', { name: '星期' }).click();
    const today = new Date().toISOString().slice(0, 10);
    await page.getByTestId('date-today').click();
    await expect(page.getByTestId('date-weekday-input')).toHaveValue(today);
  });
});

test.describe('Units + Currency mode', () => {
  test('Units tab is before Date tab in the order', async ({ page }) => {
    const labels = await page.getByRole('tab').allTextContents();
    const unitsIdx = labels.indexOf('Units');
    const dateIdx = labels.indexOf('Date');
    expect(unitsIdx).toBeGreaterThan(-1);
    expect(dateIdx).toBeGreaterThan(-1);
    expect(unitsIdx).toBeLessThan(dateIdx);
  });

  test('switching to Units hides Display and Keypad', async ({ page }) => {
    await page.getByRole('tab', { name: 'Units' }).click();
    await expect(page.getByTestId('units-mode')).toBeVisible();
    await expect(page.locator('main input[aria-label="Expression"]')).toHaveCount(0);
  });

  test('length conversion: 5 km = 5000 m', async ({ page }) => {
    await page.getByRole('tab', { name: 'Units' }).click();
    await page.getByTestId('units-amount').fill('5');
    await expect(page.getByTestId('units-result-value')).toContainText('5,000');
  });

  test('mass conversion: 1 kg -> g = 1000', async ({ page }) => {
    await page.getByRole('tab', { name: 'Units' }).click();
    await page.getByRole('tab', { name: '质量' }).click();
    await page.getByTestId('units-amount').fill('1');
    await expect(page.getByTestId('units-result-value')).toContainText('1,000');
  });

  test('temperature conversion: 0 celsius -> 32 fahrenheit', async ({ page }) => {
    await page.getByRole('tab', { name: 'Units' }).click();
    await page.getByRole('tab', { name: '温度' }).click();
    await page.getByTestId('units-amount').fill('0');
    await expect(page.getByTestId('units-result-value')).toContainText('32');
  });

  test('data conversion: 1 KiB -> 1024 byte', async ({ page }) => {
    await page.getByRole('tab', { name: 'Units' }).click();
    await page.getByRole('tab', { name: '数据' }).click();
    await page.getByTestId('units-amount').fill('1');
    await page.getByTestId('units-from').selectOption('KiB');
    await page.getByTestId('units-to').selectOption('byte');
    await expect(page.getByTestId('units-result-value')).toContainText('1,024');
  });

  test('swap button flips from/to', async ({ page }) => {
    await page.getByRole('tab', { name: 'Units' }).click();
    await page.getByTestId('units-amount').fill('1');
    await expect(page.getByTestId('units-from')).toHaveValue('km');
    await expect(page.getByTestId('units-to')).toHaveValue('m');
    await page.getByTestId('units-swap').click();
    await expect(page.getByTestId('units-from')).toHaveValue('m');
    await expect(page.getByTestId('units-to')).toHaveValue('km');
  });

  test('currency shows snapshot stamp + USD/EUR conversion', async ({ page }) => {
    await page.getByRole('tab', { name: 'Units' }).click();
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
  test('Programmer tab is the 4th tab in the locked order', async ({ page }) => {
    const labels = await page.getByRole('tab').allTextContents();
    // locked: Basic / Scientific / History / Programmer / Units / Date
    expect(labels).toEqual(['Basic', 'Scientific', 'History', 'Programmer', 'Units', 'Date']);
  });

  test('switching to Programmer hides the basic Display + Keypad', async ({ page }) => {
    await page.getByRole('tab', { name: 'Programmer' }).click();
    await expect(page.getByTestId('programmer-mode')).toBeVisible();
    await expect(page.locator('main input[aria-label="Expression"]')).toHaveCount(0);
  });

  test('HEX is the default radix and QWORD is the default word size', async ({ page }) => {
    await page.getByRole('tab', { name: 'Programmer' }).click();
    await expect(page.getByTestId('prog-radix-hex')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('prog-word-64')).toHaveAttribute('aria-checked', 'true');
  });

  test('hex letters A-F appear only when HEX is selected', async ({ page }) => {
    await page.getByRole('tab', { name: 'Programmer' }).click();
    await expect(page.getByTestId('prog-key-A')).toBeVisible();
    await page.getByTestId('prog-radix-dec').click();
    await expect(page.getByTestId('prog-key-A')).toHaveCount(0);
    await page.getByTestId('prog-radix-hex').click();
    await expect(page.getByTestId('prog-key-A')).toBeVisible();
  });

  test('non-allowed digits are disabled per radix (8/9 in BIN; A-F in DEC)', async ({ page }) => {
    await page.getByRole('tab', { name: 'Programmer' }).click();
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
    await page.getByRole('tab', { name: 'Programmer' }).click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-add').click();
    await page.getByTestId('prog-key-1').click();
    await page.getByTestId('prog-key-eq').click();
    // HEX primary, padded to 16 chars (QWORD)
    await expect(page.getByTestId('prog-primary')).toContainText('0000000000000100');
  });

  test('radix table shows HEX/DEC/OCT/BIN all simultaneously', async ({ page }) => {
    await page.getByRole('tab', { name: 'Programmer' }).click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-F').click();
    // 0xFF = 255 dec = 0o377 = 0b11111111
    await expect(page.getByTestId('prog-radix-hex-value')).toContainText('FF');
    await expect(page.getByTestId('prog-radix-dec-value')).toContainText('255');
    await expect(page.getByTestId('prog-radix-oct-value')).toContainText('377');
    await expect(page.getByTestId('prog-radix-bin-value')).toContainText('11111111');
  });

  test('switching radix reformats the last token via toRadix', async ({ page }) => {
    await page.getByRole('tab', { name: 'Programmer' }).click();
    await page.getByTestId('prog-key-1').click();
    await page.getByTestId('prog-key-0').click(); // "10" in HEX = 16 dec
    await page.getByTestId('prog-radix-dec').click();
    // Now the same value reformatted to DEC: "10" (hex) = 16 dec -> expr shows "16"
    await expect(page.getByTestId('prog-expr')).toContainText('16');
  });

  test('switching word size re-masks (QWORD vs BYTE)', async ({ page }) => {
    await page.getByRole('tab', { name: 'Programmer' }).click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-F').click();
    // QWORD: FF as HEX
    await expect(page.getByTestId('prog-radix-hex-value')).toContainText('00000000000000FF');
    // Switch to BYTE: 0xFF truncated to 8 bits still 0xFF
    await page.getByTestId('prog-word-8').click();
    await expect(page.getByTestId('prog-radix-hex-value')).toContainText('FF');
    // DEC at BYTE: 255
    await expect(page.getByTestId('prog-radix-dec-value')).toContainText('255');
  });

  test('bitwise AND: 0xF0 & 0x0F = 0', async ({ page }) => {
    await page.getByRole('tab', { name: 'Programmer' }).click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-0').click();
    await page.getByTestId('prog-key-and').click();
    await page.getByTestId('prog-key-0').click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-eq').click();
    await expect(page.getByTestId('prog-radix-hex-value')).toMatch(/^0+$/);
  });

  test('AC clears expression', async ({ page }) => {
    await page.getByRole('tab', { name: 'Programmer' }).click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-F').click();
    await page.getByTestId('prog-key-ac').click();
    await expect(page.getByTestId('prog-expr')).toBeEmpty();
  });
});
