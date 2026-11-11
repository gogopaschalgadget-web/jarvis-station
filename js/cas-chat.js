// cas-chat.js - Cas queue send/poll/history adapter
// ES Module. No em-dashes. No hardcoded credentials.
// Callers must set untrusted server text via textContent, never innerHTML.

import { deviceKey, signEnvelope } from './cas-keys.js';

let _apiBase = '';
let _getToken = () => '';
let _onUpdate = null;
let _scope = '';
let _sending = null;

const _polling = new Map(); // requestId -> timerId
const POLL_DELAY_MS = 3_000;
const POLL_TIMEOUT_MS = 40 * 60 * 1000; // long enough for a Claude job
const DRAFT_KEY = 'cas-draft';

/** Initialise the adapter. Call once after authentication. */
export function initChat(apiBase, getToken, onUpdate, deviceId = '') {
  _apiBase = apiBase;
  _getToken = getToken;
  _onUpdate = onUpdate;
  _scope = deviceId;
}

// --- Draft: sessionStorage, survives page hide but not restart ---

export function saveDraft(text) {
  try { sessionStorage.setItem(DRAFT_KEY, text); } catch {}
}
export function loadDraft() {
  const pending = _loadPending();
  if (pending) return pending.message;
  try { return sessionStorage.getItem(DRAFT_KEY) || ''; } catch { return ''; }
}
export function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch {}
}

// --- Auth header ---

function _auth() {
  return { 'Authorization': 'Bearer ' + _getToken() };
}

// One persisted key per logical send, including retries after a lost response.
function _pendingKey() { return 'cas-pending-send:' + _scope; }
function _loadPending() {
  const raw = localStorage.getItem(_pendingKey());
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (typeof value.request_key !== 'string' || typeof value.message !== 'string') {
    throw new Error('Pending message record is invalid. Send stopped.');
  }
  return value;
}

function _genKey() {
  return crypto.randomUUID();
}

// --- Core API calls ---

/**
 * Send a message. Preserves draft on failure.
 * Returns the queued request item on success.
 * Throws with .status set to the HTTP status on auth/server errors.
 */
export async function sendMessage(text, attachments = [], route = {}) {
  if (_sending) return _sending;
  _sending = _sendMessage(text, attachments, route);
  try { return await _sending; } finally { _sending = null; }
}

// route.header is the signed first line ("@sonnet ask"), saying who answers and whether this only asks.
// route.threadId picks the thread; it is not signed because it only chooses which memory Cas reads.
const HEADER = /^@(sonnet|opus|chatgpt:[a-z0-9][a-z0-9.\-]{0,47}) (ask|change)$/;

async function _sendMessage(text, attachments, route) {
  const header = route.header && HEADER.test(route.header) ? route.header : '';
  const threadId = route.threadId || null;
  if (!text || !text.trim()) throw new Error('empty message');
  saveDraft(text);
  const message = text.trim();
  // Screenshots are not part of a signed command yet, so those messages go unsigned and the PC refuses them.
  // Only the same text reuses the saved key, so a lost reply can never send it twice.
  // Changed text is a new message: an unconfirmed older one must not block the box.
  const saved = _loadPending();
  const isRetry = saved && saved.message === message && JSON.stringify(saved.attachments || []) === JSON.stringify(attachments)
    && (saved.thread_id || null) === threadId && (saved.header || '') === header;
  const pending = isRetry ? saved : { request_key: _genKey(), message, attachments, thread_id: threadId, header,
    envelope: attachments.length ? null : await signEnvelope('message', header ? header + '\n' + message : message) };
  // Storage failures stop the send before it reaches the server.
  localStorage.setItem(_pendingKey(), JSON.stringify(pending));
  const { header: _signedLine, ...sendable } = pending;
  if (!sendable.thread_id) delete sendable.thread_id; // the server before threads refuses unknown fields
  const body = JSON.stringify(sendable);
  const res = await fetch(`${_apiBase}/api/station/cas/messages`, {
    method: 'POST',
    headers: { ..._auth(), 'Content-Type': 'application/json' },
    body,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.detail || err.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const item = await res.json();
  if (!item || typeof item.id !== 'string' || item.message !== message ||
      !['queued', 'running', 'completed', 'failed'].includes(item.status)) {
    throw new Error('Acceptance could not be verified. Retry this message.');
  }
  localStorage.removeItem(_pendingKey());
  clearDraft();
  _startPoll(item.id);
  return item;
}

/** Send an approval, a cancel or a stop. Each is signed by this phone. */
export async function sendSigned(kind, message, body, threadId = null) {
  const envelope = await signEnvelope(kind, body);
  const payload = { request_key: _genKey(), message, attachments: [], envelope };
  if (threadId) payload.thread_id = threadId; // shown in the thread it belongs to
  const res = await fetch(`${_apiBase}/api/station/cas/messages`, {
    method: 'POST',
    headers: { ..._auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const item = await res.json();
  _startPoll(item.id);
  return item;
}

/** Offer this phone's public key. The PC decides whether to trust it. Returns the code to compare. */
export async function offerDeviceKey() {
  const key = await deviceKey();
  const res = await fetch(`${_apiBase}/api/station/cas/device-key`, {
    method: 'POST',
    headers: { ..._auth(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ public_key: key.publicKey, label: navigator.platform || 'Phone' }),
  });
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return key.code;
}

/**
 * Load recent history for this device, newest first.
 * Throws with .status on HTTP errors (401/403 = auth failure).
 */
export async function loadHistory(limit = 20, thread = null) {
  const which = thread ? `&thread=${encodeURIComponent(thread)}` : '';
  const res = await fetch(
    `${_apiBase}/api/station/cas/messages?limit=${encodeURIComponent(limit)}${which}`,
    { headers: _auth() }
  );
  if (!res.ok) {
    const e = new Error(`history HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  const data = await res.json();
  return Array.isArray(data.items) ? data.items : [];
}

/**
 * Resume polling for any queued or running items from a history load.
 * Safe to call with an empty array.
 */
export function resumePendingPolling(items) {
  for (const item of items) {
    if (item.status === 'queued' || item.status === 'running') {
      _startPoll(item.id);
    }
  }
}

/** Stop polling for a specific request (e.g. user navigated away). */
export function stopPolling(requestId) {
  const t = _polling.get(requestId);
  if (t != null) { clearTimeout(t); _polling.delete(requestId); }
}

/** Stop all active polling timers. */
export function stopAllPolling() {
  for (const t of _polling.values()) clearTimeout(t);
  _polling.clear();
}

// --- Internal polling ---

function _startPoll(requestId) {
  if (_polling.has(requestId)) return; // already polling
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  _schedulePoll(requestId, deadline, POLL_DELAY_MS);
}

function _schedulePoll(requestId, deadline, delayMs) {
  const t = setTimeout(() => _doPoll(requestId, deadline), delayMs);
  _polling.set(requestId, t);
}

async function _doPoll(requestId, deadline) {
  if (Date.now() > deadline) {
    _polling.delete(requestId);
    _onUpdate && _onUpdate({
      id: requestId, status: 'failed',
      error: 'Timed out waiting for Cas reply. Check worker status.',
    });
    return;
  }
  try {
    const res = await fetch(
      `${_apiBase}/api/station/cas/messages/${encodeURIComponent(requestId)}`,
      { headers: _auth() }
    );
    if (!res.ok) {
      // Non-2xx: retry unless auth failed
      if (res.status === 401 || res.status === 403) {
        _polling.delete(requestId);
        const e = new Error(`poll auth ${res.status}`);
        e.status = res.status;
        _onUpdate && _onUpdate({ id: requestId, status: 'failed', error: 'Session expired.' });
        return;
      }
      _schedulePoll(requestId, deadline, POLL_DELAY_MS * 2);
      return;
    }
    const item = await res.json();
    _onUpdate && _onUpdate(item);
    if (item.status === 'completed' || item.status === 'failed') {
      _polling.delete(requestId);
    } else {
      _schedulePoll(requestId, deadline, POLL_DELAY_MS);
    }
  } catch {
    // Network error: back off and retry
    _schedulePoll(requestId, deadline, POLL_DELAY_MS * 2);
  }
}

export function pendingAttachments() { return _loadPending()?.attachments || []; }

// --- Threads and folders. Only names and placement; what Cas may do is always the signed message. ---

async function _json(method, path, body) {
  const res = await fetch(`${_apiBase}/api/station/cas${path}`, {
    method,
    headers: body ? { ..._auth(), 'Content-Type': 'application/json' } : _auth(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(typeof err.detail === 'string' ? err.detail : `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}
export const listThreads = () => _json('GET', '/threads');
export const createThread = fields => _json('POST', '/threads', fields);
export const updateThread = (id, changes) => _json('PATCH', `/threads/${encodeURIComponent(id)}`, changes);
export const createFolder = name => _json('POST', '/folders', { name });
export const updateFolder = (id, changes) => _json('PATCH', `/folders/${encodeURIComponent(id)}`, changes);
export const projectStatus = () => _json('GET', '/projects');
