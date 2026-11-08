// cas-keys.js - this phone's signing key for Cas commands.
// The private key is created non-extractable and stays in this browser.
// The PC only trusts the public key after it is approved there, so Railway cannot forge a command.

const DB_NAME = 'cas-device-key';
const STORE = 'keys';
const RECORD = 'device';

function _db() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function _get() {
  const db = await _db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(RECORD);
    request.onsuccess = () => resolve(request.result);
    tx.oncomplete = () => db.close();
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function _put(pair) {
  const db = await _db();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(pair, RECORD);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function _b64(bytes) {
  let text = '';
  for (const b of new Uint8Array(bytes)) text += String.fromCharCode(b);
  return btoa(text);
}

async function _sha256Hex(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

let _cached = null;

/** This phone's key, created on first use. */
export async function deviceKey() {
  if (_cached) return _cached;
  let pair = await _get();
  if (!pair) {
    pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    await _put(pair);
  }
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey);
  const hash = await _sha256Hex(raw);
  _cached = { pair, publicKey: _b64(raw), keyId: hash.slice(0, 16), code: hash.slice(-6).toUpperCase() };
  return _cached;
}

/** A signed command. The format matches engines/cas/signing.py on the PC. */
export async function signEnvelope(kind, body) {
  const key = await deviceKey();
  const requestId = crypto.randomUUID();
  const tsMs = Date.now();
  const bodyHash = await _sha256Hex(new TextEncoder().encode(body));
  const signedText = ['cas-v1', key.keyId, kind, requestId, String(tsMs), bodyHash].join('\n');
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key.pair.privateKey, new TextEncoder().encode(signedText));
  return { key_id: key.keyId, kind, request_id: requestId, ts_ms: tsMs, body, signature: _b64(signature) };
}
