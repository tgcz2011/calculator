// Server-blind E2E encryption for the sync blob. Uses Web Crypto (PBKDF2 +
// AES-GCM), available natively in browsers, Tauri webview, Capacitor WKWebView,
// and Node 20+ (for tests). No external dep.
//
// Blob format (all binary, base64 for transport):
//   salt[16] || iv[12] || ciphertext
//
// The salt travels with the blob (it's not secret - it just defeats rainbow
// tables). The passphrase exists only in the user's head and the local
// keychain/keystore (P2 native bridge). The WebDAV server and iCloud both see
// only base64 ciphertext - decrypting without the passphrase is infeasible even
// if the server is compromised.
//
// ponytail: AES-GCM gives authenticated encryption (integrity + confidentiality
// in one primitive). No separate MAC, no key rotation, no per-entry encryption
// - the whole snapshot is one blob. Upgrade path: per-entry encryption if
// partial sync ever lands (it won't for a 5KB history).

const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_HASH = 'SHA-256';
const KEY_LENGTH_BITS = 256;

export class SyncCryptoError extends Error {
  constructor(message: string, readonly code: 'decrypt' | 'wrong_pass' | 'malformed') {
    super(message);
    this.name = 'SyncCryptoError';
  }
}

function b64encode(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: PBKDF2_HASH },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt UTF-8 plaintext into a base64 blob. */
export async function encryptBlob(plaintext: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  const out = new Uint8Array(salt.length + iv.length + ct.length);
  out.set(salt, 0);
  out.set(iv, salt.length);
  out.set(ct, salt.length + iv.length);
  return b64encode(out);
}

/** Decrypt a base64 blob back to UTF-8 plaintext. Throws SyncCryptoError on failure. */
export async function decryptBlob(blob: string, passphrase: string): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = b64decode(blob.trim());
  } catch {
    throw new SyncCryptoError('malformed base64 blob', 'malformed');
  }
  if (bytes.length < SALT_BYTES + IV_BYTES + 1) {
    throw new SyncCryptoError('blob too short', 'malformed');
  }
  const salt = bytes.slice(0, SALT_BYTES);
  const iv = bytes.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ct = bytes.slice(SALT_BYTES + IV_BYTES);
  const key = await deriveKey(passphrase, salt);
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
    return new TextDecoder().decode(pt);
  } catch {
    // AES-GCM auth tag mismatch = wrong passphrase OR tampered ciphertext.
    // Both look identical to the caller; we don't distinguish (constant-time-ish).
    throw new SyncCryptoError('wrong passphrase or tampered blob', 'wrong_pass');
  }
}
