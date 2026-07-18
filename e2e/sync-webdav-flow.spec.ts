// WebDAV sync flow e2e. Verifies the production fetch path works in a real
// browser: WebDavSyncProvider's default fetchFn is `globalThis.fetch.bind(globalThis)`
// (src/sync/webdav.ts:44) - without the .bind, browsers throw
// "Failed to execute 'fetch' on 'Window': Illegal invocation" because fetch
// requires this===Window and a class field default captures the unbound ref.
// smoke tests inject a fake fetch so they never exercise this default.
//
// No addInitScript fetch-bind workaround here - the production code must work
// on its own. If this spec goes red with "Illegal invocation", the .bind fix
// regressed.
//
// ponytail: fake WebDAV server via page.route() - no network. One test, two
// assertions: (1) connect leaves 'connected' status - proves .bind; (2) the
// PUT body is base64 ciphertext, not plaintext JSON - proves the E2E push path
// runs end-to-end in a browser (smoke only sees injected fakeFetch). Full
// multi-device round-trip is covered by smoke's double-device case.

import { test, expect, type Page } from '@playwright/test';

// Minimal fake WebDAV server. Stores the last PUT body so we can assert it's
// encrypted. GET/PROPFIND return 404 (empty remote on first connect); PUT/MKCOL
// succeed.
function installFakeWebDav(page: Page): { lastPutBody: () => string | null; putCount: () => number } {
  let lastPutBody: string | null = null;
  let putCount = 0;
  void page.route('**/dav.jianguoyun.com/**', async (route) => {
    switch (route.request().method()) {
      case 'PROPFIND':
      case 'GET':
        await route.fulfill({ status: 404 });
        return;
      case 'PUT':
        lastPutBody = route.request().postData() ?? null;
        putCount += 1;
        await route.fulfill({ status: 204 });
        return;
      case 'MKCOL':
        await route.fulfill({ status: 201 });
        return;
      case 'DELETE':
        await route.fulfill({ status: 204 });
        return;
      default:
        await route.fulfill({ status: 405 });
    }
  });
  return { lastPutBody: () => lastPutBody, putCount: () => putCount };
}

async function openSettingsAndConnect(page: Page, passphrase = 'correct-horse-battery') {
  await page.getByTestId('open-sync-settings').click();
  // 坚果云 preset is the default - endpoint + path already filled.
  await page.getByTestId('sync-username').fill('alice@example.com');
  await page.getByTestId('sync-password').fill('app-password-123');
  await page.getByTestId('sync-passphrase').fill(passphrase);
  await page.getByTestId('sync-passphrase-confirm').fill(passphrase);
  await page.getByTestId('sync-connect').click();
}

test.beforeEach(async ({ page }) => {
  // ponytail: goto before clear - localStorage.clear() on about:blank (opaque
  // origin) throws SecurityError on Chromium 131+.
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/');
  await page.waitForLoadState('networkidle');
});

test.describe('WebDAV sync flow', () => {
  test('connect + push works in browser (fetch.bind fix + E2E blob)', async ({ page }) => {
    const server = installFakeWebDav(page);
    await openSettingsAndConnect(page);

    const status = page.getByTestId('sync-status');
    // Without src/sync/webdav.ts:44's .bind(globalThis), the banner would read
    // "出错: Failed to execute 'fetch' on 'Window': Illegal invocation".
    await expect(status).toHaveAttribute('data-status', 'connected', { timeout: 10_000 });
    await expect(status).not.toContainText('Illegal invocation');

    // Connect ran a full sync(): PROPFIND/GET (404) + PUT of local snapshot.
    await expect.poll(() => server.putCount(), { timeout: 6_000 }).toBeGreaterThanOrEqual(1);
    const body = server.lastPutBody();
    expect(body).toBeTruthy();
    // E2E: blob is base64 ciphertext (salt[16]||iv[12]||ct). Must not be valid
    // JSON and must not leak the payload kind marker in plaintext.
    expect(body!).not.toMatch(/^\{.*\}$/s);
    expect(body!).not.toContain('calc-history');
  });
});
