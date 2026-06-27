// app.js - Station orchestrator, API integration, navigation
// ES Module. No em-dashes. No credentials.
// Phase 3: fetches from Railway origin with per-device opaque token auth.

import { ROOMS, NAV_ITEMS, ROOM_COLORS, OP_STATUSES, PROGRESSION_STATES, TIER_COLORS } from './rooms.js';
import { initRenderer, setDrawCallback, setRoomTapHandler, setApiData, requestRedraw, resetView } from './renderer.js';
import { drawRooms, hexToRgba } from './room-views.js';

const API_BASE = 'https://web-production-eb2a6.up.railway.app';
const REFRESH_INTERVAL_MS = 60000;

let currentTab = 'station';
let apiData = null;
let refreshInterval = null;

// --- AUTH HELPERS ---
function getDeviceToken() {
  return localStorage.getItem('station_device_token') || '';
}

function getDeviceId() {
  return localStorage.getItem('station_device_id') || '';
}

function isAuthenticated() {
  return !!getDeviceToken();
}

function clearAuth() {
  if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  localStorage.removeItem('station_device_token');
  localStorage.removeItem('station_device_id');
  showPairingUI();
}

async function pairDevice(code, name) {
  const errEl = document.getElementById('pair-error');
  const btn = document.getElementById('pair-btn');
  if (errEl) errEl.textContent = '';
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/api/auth/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairing_code: code, device_name: name }),
    });
    const data = await res.json();
    if (res.ok && data.token) {
      localStorage.setItem('station_device_token', data.token);
      localStorage.setItem('station_device_id', data.device_id);
      location.reload();
    } else {
      if (errEl) errEl.textContent = data.error || 'Pairing failed';
    }
  } catch (err) {
    if (errEl) errEl.textContent = 'Network error. Check connection.';
  } finally {
    if (btn) btn.disabled = false;
  }
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
  if (!isAuthenticated()) {
    showPairingUI();
    return;
  }

  const canvas = document.getElementById('station-canvas');
  if (!canvas) return;

  initRenderer(canvas);
  setDrawCallback(drawRooms);
  setRoomTapHandler(onRoomTap);
  setupNav();
  fetchStatus();
  refreshInterval = setInterval(fetchStatus, REFRESH_INTERVAL_MS);
});

// --- API ---
async function fetchStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/station/status`, {
      headers: { 'Authorization': 'Bearer ' + getDeviceToken() },
    });
    if (res.status === 401) {
      clearAuth();
      return;
    }
    if (!res.ok) {
      console.error('[Station] API returned', res.status);
      return;
    }
    apiData = await res.json();
    setApiData(apiData);
    updateHeader(apiData);
    updateTabContent();
  } catch (err) {
    console.error('[Station] API fetch failed:', err);
  }
}

// --- PAIRING UI ---
function showPairingUI() {
  document.body.innerHTML = `
    <div style="
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      min-height:100vh; background:#0a0e14; color:#c8d0dc; font-family:sans-serif;
      padding:1.5rem;
    ">
      <div style="
        background:#141922; border-radius:12px; padding:2rem; max-width:360px; width:100%;
        border:1px solid #1e2530;
      ">
        <h2 style="text-align:center; color:#22d3ee; margin-top:0; font-size:1.3rem;">
          Station Pairing
        </h2>
        <p style="text-align:center; font-size:0.85rem; color:#6b7a8d; margin-bottom:1.5rem;">
          Enter the 6-digit code from the Cassian dashboard.
        </p>
        <input id="pair-code" type="text" inputmode="numeric" maxlength="6"
          placeholder="000000"
          style="
            width:100%; box-sizing:border-box; padding:0.75rem; font-size:1.5rem;
            text-align:center; letter-spacing:0.5rem; background:#0a0e14;
            border:1px solid #2a3344; border-radius:8px; color:#c8d0dc;
            font-family:monospace; margin-bottom:1rem;
          " />
        <input id="pair-name" type="text" placeholder="Device name (e.g. Chris iPhone)"
          style="
            width:100%; box-sizing:border-box; padding:0.6rem; font-size:0.9rem;
            background:#0a0e14; border:1px solid #2a3344; border-radius:8px;
            color:#c8d0dc; margin-bottom:1rem;
          " />
        <button id="pair-btn"
          style="
            width:100%; padding:0.75rem; font-size:1rem; font-weight:600;
            background:#22d3ee; color:#0a0e14; border:none; border-radius:8px;
            cursor:pointer;
          ">
          Pair Device
        </button>
        <div id="pair-error" style="
          color:#ef4444; text-align:center; font-size:0.85rem; margin-top:0.75rem; min-height:1.2rem;
        "></div>
      </div>
    </div>
  `;
  document.getElementById('pair-btn')?.addEventListener('click', () => {
    const code = document.getElementById('pair-code')?.value?.trim() || '';
    const name = document.getElementById('pair-name')?.value?.trim() || 'Unknown Device';
    if (!/^\d{6}$/.test(code)) {
      const errEl = document.getElementById('pair-error');
      if (errEl) errEl.textContent = 'Enter a 6-digit numeric code.';
      return;
    }
    pairDevice(code, name);
  });
  // Allow Enter key on code input
  document.getElementById('pair-code')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('pair-btn')?.click();
  });
}

// --- HEADER + METRICS BAR ---
function updateHeader(data) {
  const s = data?.station;
  if (!s) return;

  const el = document.getElementById('header-stats');
  if (el) {
    el.innerHTML = `
      <span class="header-stat">Lv<span class="val">${s.level}</span> ${esc(s.level_name)}</span>
    `;
  }

  // Metrics bar
  const h = data.health || {};
  const svcs = h.services || {};
  const aliveCount = Object.values(svcs).filter(v => v.status === 'alive').length;
  const totalSvc = Object.keys(svcs).length;
  const liveCount = (h.live_posts || []).length;

  setMetric('m-days', s.days_remaining, s.days_remaining < 30 ? 'warn' : '');
  setMetric('m-budget', '$' + s.budget_remaining.toFixed(2), s.budget_remaining < 10 ? 'warn' : 'good');
  setMetric('m-services', aliveCount + '/' + totalSvc, aliveCount < totalSvc ? 'warn' : 'good');
  setMetric('m-posts', String(liveCount), liveCount > 0 ? 'good' : '');
  setMetric('m-revenue', '$' + s.revenue_total.toFixed(0), '');
}

function setMetric(id, val, cls) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = val;
    el.className = 'metric-val' + (cls ? ' ' + cls : '');
  }
}

// --- NAVIGATION ---
function setupNav() {
  const nav = document.getElementById('station-nav');
  if (!nav) return;

  nav.innerHTML = NAV_ITEMS.map(item => `
    <div class="nav-item ${item.id === currentTab ? 'active' : ''} ${!item.active ? 'locked' : ''}"
         data-tab="${item.id}" ${!item.active ? 'data-future="' + (item.future || '') + '"' : ''}>
      <span class="nav-icon">${item.icon}</span>
      <span class="nav-label">${item.label}</span>
    </div>
  `).join('');

  nav.addEventListener('click', (e) => {
    const tab = e.target.closest('.nav-item');
    if (!tab) return;
    const id = tab.dataset.tab;
    const navItem = NAV_ITEMS.find(n => n.id === id);
    if (navItem && !navItem.active) return;
    switchTab(id);
  });
}

function switchTab(tabId) {
  currentTab = tabId;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === tabId);
  });

  // Show/hide canvas vs tab panels
  const main = document.querySelector('.station-main');
  const overlay = document.getElementById('room-overlay');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('visible'));

  if (tabId === 'station') {
    main.style.display = 'block';
    if (overlay) overlay.classList.remove('visible');
    requestRedraw();
  } else {
    main.style.display = 'none';
    if (overlay) overlay.classList.remove('visible');
    const panel = document.getElementById(`panel-${tabId}`);
    if (panel) {
      panel.classList.add('visible');
      updateTabContent();
    }
  }
}

// --- TAB CONTENT ---
function updateTabContent() {
  if (!apiData) return;
  if (currentTab === 'missions') renderMissions();
  if (currentTab === 'content-review') renderContentReview();
  if (currentTab === 'agents') renderAgents();
  if (currentTab === 'log') renderLog();
  if (currentTab === 'settings') renderSettings();
}

// --- CONTENT REVIEW (Build 2C, Session AR) -------------------------------
// Backs /api/content-review/{next,verdict,queue}. Shows post body, rubric
// dim scores with correction dropdowns, approve/edit/reject buttons,
// XP toast on success. Standalone XP path via game_engine.add_xp.
let currentReviewItem = null;
let reviewPanelMode = 'idle'; // idle | edit | reject
let isLoadingReview = false;
let reviewPlatform = 'reddit'; // 'reddit' | 'x' | 'both' ('both' -> null to backend)
let reviewTab = 'posts'; // 'posts' | 'anchors' (anchor curation merged into the Review tab)

// Whitelist of rubric dimension keys per engines/shared/content_review_payload.py.
// Mirrors RubricDimension Literal. Filter chris_corrections to prevent 422
// from backend pydantic validation on stale/typo keys.
const VALID_RUBRIC_DIMS = new Set([
  'task_fulfillment', 'factual_grounding', 'clarity_scannability',
  'voice_fit', 'value_usefulness'
]);

async function fetchNextReviewItem(platform = null) {
  try {
    const res = await fetch(`${API_BASE}/api/content-review/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getDeviceToken() },
      body: JSON.stringify({ platform }),
    });
    if (res.status === 401 || res.status === 403) { clearAuth(); return null; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[Review] /next failed', res.status, err);
      return null;
    }
    const data = await res.json();
    return data.item || null;
  } catch (err) {
    console.error('[Review] fetch error:', err);
    return null;
  }
}

async function submitVerdict(payload) {
  try {
    const res = await fetch(`${API_BASE}/api/content-review/verdict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getDeviceToken() },
      body: JSON.stringify(payload),
    });
    if (res.status === 401 || res.status === 403) { clearAuth(); return null; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[Review] /verdict failed', res.status, err);
      alert('Verdict submit failed: ' + (err.error || res.status));
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('[Review] verdict error:', err);
    alert('Network error submitting verdict');
    return null;
  }
}

function renderXpToast(xpAwarded, breakdown, idempotent) {
  if (idempotent) return; // do not toast duplicate submits
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:1rem;left:50%;transform:translateX(-50%);background:#d4a853;color:#0a0e14;padding:0.75rem 1.25rem;border-radius:8px;font-weight:bold;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.4);';
  const parts = [`+${xpAwarded} XP`];
  if (breakdown.base) parts.push(`base ${breakdown.base}`);
  if (breakdown.corrections) parts.push(`corrections +${breakdown.corrections}`);
  if (breakdown.edit) parts.push(`edit +${breakdown.edit}`);
  if (breakdown.rejection_reason) parts.push(`reason +${breakdown.rejection_reason}`);
  if (breakdown.streak_multiplier && breakdown.streak_multiplier > 1) parts.push(`x${breakdown.streak_multiplier} streak`);
  toast.textContent = parts.join(' | ');
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function dimCardHtml(name, dim) {
  if (!dim || dim.abstained) {
    return `<div class="panel-card" style="opacity:0.6"><div class="panel-card-title">${esc(name)}</div><div style="font-size:0.85rem;color:#888">(abstained or unavailable)</div></div>`;
  }
  const labelColors = { fail: '#ef4444', partial: '#f97316', meets: '#22c55e', strong: '#22d3ee' };
  const labelStr = String(dim.label || 'unknown');
  const color = labelColors[labelStr] || '#888';
  const score = ((dim.calibrated_score || 0) * 10).toFixed(1);
  const conf = dim.confidence != null ? (dim.confidence * 100).toFixed(0) + '%' : '?';
  const evidence = Array.isArray(dim.evidence) ? dim.evidence.slice(0, 3) : [];
  return `
    <div class="panel-card">
      <div class="panel-card-title">${esc(name)}</div>
      <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
        <span style="background:${color};color:#0a0e14;padding:0.25rem 0.5rem;border-radius:4px;font-weight:bold;font-size:0.85rem">${esc(labelStr.toUpperCase())}</span>
        <span style="color:#22d3ee">${score}/10</span>
        <span style="color:#888;font-size:0.85rem">conf ${conf}</span>
      </div>
      ${evidence.length ? `<ul style="margin:0;padding-left:1.25rem;font-size:0.8rem;color:#aaa">${evidence.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : ''}
      <div style="margin-top:0.5rem">
        <label style="font-size:0.8rem;color:#888">Override:</label>
        <select data-dim="${esc(name)}" class="correction-select" style="margin-left:0.5rem;background:#141922;color:#c8d0dc;border:1px solid #1e2530;padding:0.25rem;border-radius:4px">
          <option value="">(no change)</option>
          <option value="fail">fail</option>
          <option value="partial">partial</option>
          <option value="meets">meets</option>
          <option value="strong">strong</option>
        </select>
      </div>
    </div>`;
}

function platformSelectorHtml() {
  const opts = [['reddit', 'Reddit'], ['x', 'X'], ['both', 'Both']];
  return '<div class="panel-card" style="display:flex;gap:0.5rem;justify-content:center">' +
    opts.map(([v, l]) => `<button data-platform="${v}" class="platform-btn" style="flex:1;background:${reviewPlatform === v ? '#22d3ee' : '#141922'};color:${reviewPlatform === v ? '#0a0e14' : '#c8d0dc'};border:1px solid #1e2530;padding:0.5rem;border-radius:6px;font-weight:bold;cursor:pointer">${l}</button>`).join('') +
    '</div>';
}

function wirePlatformSelector(panel) {
  panel.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.platform;
      if (v === reviewPlatform) return;
      reviewPlatform = v;
      currentReviewItem = null;
      reviewPanelMode = 'idle';
      renderContentReview();
    });
  });
}

// Posts vs Anchors mode switch at the top of the Review tab (Build 3B, Session BX).
function reviewModeSelectorHtml() {
  const tabs = [['posts', 'Posts'], ['anchors', 'Anchors']];
  return '<div class="panel-card" style="display:flex;gap:0.5rem;justify-content:center">' +
    tabs.map(([v, l]) => `<button data-review-tab="${v}" class="review-tab-btn" style="flex:1;background:${reviewTab === v ? '#d4a853' : '#141922'};color:${reviewTab === v ? '#0a0e14' : '#c8d0dc'};border:1px solid #1e2530;padding:0.5rem;border-radius:6px;font-weight:bold;cursor:pointer">${l}</button>`).join('') +
    '</div>';
}

function wireReviewModeSelector(panel) {
  panel.querySelectorAll('.review-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.reviewTab;
      if (v === reviewTab) return;
      reviewTab = v;
      reviewPanelMode = 'idle';
      renderContentReview();
    });
  });
}

function renderContentReview() {
  const panel = document.getElementById('panel-content-review');
  if (!panel) return;
  // Anchors mode renders into the same Review panel.
  if (reviewTab === 'anchors') { renderAnchorReview(); return; }
  // BUG J2: never rebuild the panel while the user is mid-edit/reject; the 60s
  // auto-refresh would otherwise wipe in-progress input.
  if (reviewPanelMode === 'edit' || reviewPanelMode === 'reject') return;

  if (currentReviewItem === null && !isLoadingReview) {
    isLoadingReview = true;
    panel.innerHTML = reviewModeSelectorHtml() + `<div class="panel-card"><div class="panel-card-title">Loading next review...</div></div>`;
    wireReviewModeSelector(panel);
    fetchNextReviewItem(reviewPlatform === 'both' ? null : reviewPlatform).then(item => {
      isLoadingReview = false;
      if (item) {
        item._renderedAt = Date.now();
        currentReviewItem = item;
        renderContentReview();
      } else {
        // Empty queue. Do NOT auto-refetch (would infinite loop).
        panel.innerHTML = reviewModeSelectorHtml() + platformSelectorHtml() + `
          <div class="panel-card">
            <div class="panel-card-title">No posts to review</div>
            <div style="font-size:0.9rem;color:#888;margin-bottom:0.75rem">Queue is empty. New posts appear here after the generator runs and passes QC.</div>
            <button id="review-refresh-btn" style="background:#22d3ee;color:#0a0e14;border:none;padding:0.6rem 1rem;border-radius:6px;font-weight:bold;cursor:pointer">Check again</button>
          </div>`;
        wirePlatformSelector(panel);
        wireReviewModeSelector(panel);
        document.getElementById('review-refresh-btn')?.addEventListener('click', () => {
          currentReviewItem = null;
          renderContentReview();
        });
      }
    });
    return;
  }
  if (isLoadingReview) return;

  const item = currentReviewItem;
  const verdict = item.rubric_verdict;
  const dims = verdict ? (verdict.dimensions || {}) : {};
  const overallScore = verdict && typeof verdict.overall_score === 'number' ? verdict.overall_score.toFixed(1) : '0.0';
  const overall = verdict
    ? `<span style="color:#22d3ee">${overallScore}/10</span> conf <span style="color:#888">${esc(verdict.overall_confidence || 'low')}</span>`
    : '<span style="color:#888">no rubric (X post or pre-2A)</span>';
  const recAction = verdict ? esc(verdict.recommended_action || 'human_review') : 'manual';
  const ageMin = item.queue_age_seconds ? Math.round(item.queue_age_seconds / 60) : 0;
  const subreddit = item.subreddit || (item.platform === 'x' ? 'X' : 'unknown');
  const platformLabel = String(item.platform || 'reddit').toUpperCase();
  const oppSrc = item.opportunity_source || {};
  const oppTitle = oppSrc.post_title || '';
  const oppSnippet = oppSrc.post_body_snippet || '';
  const oppUrl = oppSrc.thread_url || '';

  panel.innerHTML = reviewModeSelectorHtml() + platformSelectorHtml() + `
    <div class="panel-card">
      <div class="panel-card-title">${esc(platformLabel)} | r/${esc(subreddit)} | ${esc(item.post_type || '?')}</div>
      <div style="font-size:0.85rem;color:#888;margin-bottom:0.5rem">${esc(item.post_id || '?')} | age ${ageMin}m | rubric ${overall} | rec: ${recAction}</div>
      ${oppTitle || oppSnippet || oppUrl ? `
        <div style="background:#1a1e28;padding:0.75rem;border-radius:6px;margin-bottom:0.75rem;border-left:3px solid #d4a853">
          <div style="font-size:0.8rem;color:#d4a853;font-weight:bold;margin-bottom:0.25rem">ORIGINAL POST</div>
          ${oppTitle ? `<div style="font-size:0.9rem;color:#c8d0dc;font-weight:bold;margin-bottom:0.25rem">${esc(oppTitle)}</div>` : ''}
          ${oppSnippet ? `<div style="font-size:0.85rem;color:#aaa;margin-bottom:0.5rem;white-space:pre-wrap">${esc(oppSnippet)}</div>` : ''}
          ${oppUrl ? `<a href="${esc(oppUrl)}" target="_blank" rel="noopener" style="font-size:0.8rem;color:#22d3ee;text-decoration:underline">View on Reddit</a>` : ''}
        </div>
      ` : ''}
      <div style="font-size:0.8rem;color:#888;margin-bottom:0.25rem">GENERATED REPLY</div>
      <div style="background:#0a0e14;padding:0.75rem;border-radius:6px;font-family:monospace;font-size:0.85rem;white-space:pre-wrap;max-height:300px;overflow-y:auto;border:1px solid #1e2530">${esc(item.body || '(no body)')}</div>
    </div>
    ${verdict && Object.keys(dims).length ? `
      <div class="panel-card-title" style="margin-top:1rem;padding:0 0.5rem">Rubric Dimensions</div>
      ${Object.entries(dims).map(([name, dim]) => dimCardHtml(name, dim)).join('')}
    ` : ''}
    <div class="panel-card" id="action-panel">
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center">
        <button data-action="approve" class="action-btn" style="background:#22c55e;color:#0a0e14;border:none;padding:0.75rem 1.25rem;border-radius:6px;font-weight:bold;cursor:pointer;font-size:0.95rem">Approve</button>
        <button data-action="edit" class="action-btn" style="background:#eab308;color:#0a0e14;border:none;padding:0.75rem 1.25rem;border-radius:6px;font-weight:bold;cursor:pointer;font-size:0.95rem">Edit</button>
        <button data-action="reject" class="action-btn" style="background:#ef4444;color:#0a0e14;border:none;padding:0.75rem 1.25rem;border-radius:6px;font-weight:bold;cursor:pointer;font-size:0.95rem">Reject</button>
        <button data-action="skip" class="action-btn" style="background:#444;color:#c8d0dc;border:none;padding:0.75rem 1.25rem;border-radius:6px;cursor:pointer;font-size:0.95rem">Skip</button>
      </div>
      <div id="extra-fields" style="margin-top:1rem"></div>
    </div>
  `;

  panel.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => onReviewAction(btn.dataset.action));
  });
  wirePlatformSelector(panel);
  wireReviewModeSelector(panel);
}

function gatherCorrections() {
  const out = {};
  const panel = document.getElementById('panel-content-review');
  if (!panel) return out;
  // Scope to panel to avoid cross-tab contamination.
  panel.querySelectorAll('.correction-select').forEach(sel => {
    if (sel.value && VALID_RUBRIC_DIMS.has(sel.dataset.dim)) {
      out[sel.dataset.dim] = sel.value;
    }
  });
  return out;
}

async function onReviewAction(action) {
  if (!currentReviewItem) return;
  if (action === 'skip') {
    currentReviewItem = null;
    reviewPanelMode = 'idle';
    renderContentReview();
    return;
  }
  // BUG J1: Edit/Reject are mode-entry actions only. If already in that mode,
  // return without falling through to the submit path (which would ship a
  // payload with chris_action/chris_overall unset, causing a 422).
  if (action === 'edit' && reviewPanelMode === 'edit') return;
  if (action === 'reject' && reviewPanelMode === 'reject') return;
  // Edit and Reject need extra input fields
  if (action === 'edit' && reviewPanelMode !== 'edit') {
    reviewPanelMode = 'edit';
    const extra = document.getElementById('extra-fields');
    if (extra) extra.innerHTML = `
      <label style="display:block;color:#888;font-size:0.85rem;margin-bottom:0.25rem">Edited body:</label>
      <textarea id="edit-body" style="width:100%;height:150px;background:#0a0e14;color:#c8d0dc;border:1px solid #1e2530;border-radius:4px;padding:0.5rem;font-family:monospace;font-size:0.85rem">${esc(currentReviewItem.body || '')}</textarea>
      <label style="display:block;color:#888;font-size:0.85rem;margin:0.5rem 0 0.25rem">Edit diff (short description):</label>
      <textarea id="edit-diff" placeholder="What did you change?" style="width:100%;height:60px;background:#0a0e14;color:#c8d0dc;border:1px solid #1e2530;border-radius:4px;padding:0.5rem;font-size:0.85rem"></textarea>
      <button id="submit-edit" style="margin-top:0.5rem;background:#22d3ee;color:#0a0e14;border:none;padding:0.6rem 1rem;border-radius:6px;font-weight:bold;cursor:pointer">Submit Edit + Approve</button>
    `;
    document.getElementById('submit-edit')?.addEventListener('click', () => onReviewAction('submit-edit'));
    return;
  }
  if (action === 'reject' && reviewPanelMode !== 'reject') {
    reviewPanelMode = 'reject';
    const extra = document.getElementById('extra-fields');
    if (extra) extra.innerHTML = `
      <label style="display:block;color:#888;font-size:0.85rem;margin-bottom:0.25rem">Why reject? (training data)</label>
      <textarea id="reject-reason" placeholder="Wrong tone, banned claim, off-topic, etc." style="width:100%;height:80px;background:#0a0e14;color:#c8d0dc;border:1px solid #1e2530;border-radius:4px;padding:0.5rem;font-size:0.85rem"></textarea>
      <button id="submit-reject" style="margin-top:0.5rem;background:#ef4444;color:#0a0e14;border:none;padding:0.6rem 1rem;border-radius:6px;font-weight:bold;cursor:pointer">Submit Reject</button>
    `;
    document.getElementById('submit-reject')?.addEventListener('click', () => onReviewAction('submit-reject'));
    return;
  }
  // Build and submit payload
  const start = currentReviewItem._renderedAt || Date.now();
  let payload = {
    post_id: currentReviewItem.post_id,
    platform: currentReviewItem.platform || 'reddit',
    chris_corrections: gatherCorrections(),
    review_duration_seconds: Math.min(3600, Math.round((Date.now() - start) / 1000)),
  };
  if (action === 'approve') {
    payload.chris_action = 'approve';
    payload.chris_overall = 'approve';
  } else if (action === 'submit-edit') {
    const editedBody = document.getElementById('edit-body')?.value || '';
    const editDiff = (document.getElementById('edit-diff')?.value || '').trim();
    // Guard against no-op edits
    if (editedBody === (currentReviewItem.body || '') && !editDiff) {
      alert('No changes detected. Use Approve if no edit needed.');
      return;
    }
    payload.chris_action = 'edit';
    payload.chris_overall = 'approve';
    payload.edited_body = editedBody;
    payload.edit_diff = editDiff || null;
  } else if (action === 'submit-reject') {
    payload.chris_action = 'reject';
    payload.chris_overall = 'reject';
    payload.rejection_reason = (document.getElementById('reject-reason')?.value || '').trim() || null;
  }
  const result = await submitVerdict(payload);
  if (result && result.success) {
    renderXpToast(result.xp_awarded, result.xp_breakdown, result.idempotent);
    currentReviewItem = null;
    reviewPanelMode = 'idle';
    renderContentReview();
  }
}

// --- ANCHOR REVIEW (Build 3B, Session BX) --------------------------------
// Backs /api/anchor-review/{next,decision}. Phone-operable curation of voice_fit
// calibration anchors. One-tap Approve / Reject. v1: no edit, no why field.
// Approving populates the judge config but scoring stays unchanged until anchors
// are switched on (ANCHORS_ENABLED, a separate v2 step).
let currentAnchorItem = null;
let isLoadingAnchor = false;
let anchorRejectMode = false;

async function fetchNextAnchor() {
  try {
    const res = await fetch(`${API_BASE}/api/anchor-review/next`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getDeviceToken() },
      body: JSON.stringify({}),
    });
    if (res.status === 401 || res.status === 403) { clearAuth(); return null; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[Anchor] /next failed', res.status, err);
      return null;
    }
    const data = await res.json();
    return data.item || null;
  } catch (err) {
    console.error('[Anchor] fetch error:', err);
    return null;
  }
}

async function submitAnchorDecision(candidateId, decision, rejectReason = null) {
  try {
    const body = { candidate_id: candidateId, decision };
    if (decision === 'reject' && rejectReason) body.reject_reason = rejectReason;
    const res = await fetch(`${API_BASE}/api/anchor-review/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getDeviceToken() },
      body: JSON.stringify(body),
    });
    if (res.status === 401 || res.status === 403) { clearAuth(); return null; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[Anchor] /decision failed', res.status, err);
      alert('Anchor decision failed: ' + (err.error || res.status));
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error('[Anchor] decision error:', err);
    alert('Network error submitting decision');
    return null;
  }
}

function renderAnchorReview() {
  const panel = document.getElementById('panel-content-review');
  if (!panel) return;

  // Mid-reject: do not let the 60s auto-refresh rebuild the panel and wipe the
  // in-progress reject reason (mirrors the reviewPanelMode guard in renderContentReview).
  if (anchorRejectMode) return;

  if (currentAnchorItem === null && !isLoadingAnchor) {
    isLoadingAnchor = true;
    panel.innerHTML = reviewModeSelectorHtml() + `<div class="panel-card"><div class="panel-card-title">Loading next anchor...</div></div>`;
    wireReviewModeSelector(panel);
    fetchNextAnchor().then(item => {
      isLoadingAnchor = false;
      if (item) {
        currentAnchorItem = item;
        renderAnchorReview();
      } else {
        panel.innerHTML = reviewModeSelectorHtml() + `
          <div class="panel-card">
            <div class="panel-card-title">No anchors to review</div>
            <div style="font-size:0.9rem;color:#888;margin-bottom:0.75rem">No candidates pending. New ones appear after the drift refresh runs on the home PC and the forwarder pushes them up.</div>
            <button id="anchor-refresh-btn" style="background:#22d3ee;color:#0a0e14;border:none;padding:0.6rem 1rem;border-radius:6px;font-weight:bold;cursor:pointer">Check again</button>
          </div>`;
        wireReviewModeSelector(panel);
        document.getElementById('anchor-refresh-btn')?.addEventListener('click', () => {
          currentAnchorItem = null;
          renderAnchorReview();
        });
      }
    });
    return;
  }
  if (isLoadingAnchor) return;

  const item = currentAnchorItem;
  const labelColors = { strong: '#22c55e', fail: '#ef4444' };
  const color = labelColors[item.label] || '#888';
  const labelStr = String(item.label || '?').toUpperCase();
  const personaTxt = item.persona_id ? (esc(item.persona_id) + (item.persona_inferred ? ' (inferred)' : '')) : 'unknown persona';
  const postType = item.post_type ? esc(item.post_type) : 'unknown type';
  const fullText = item.body || item.excerpt || '(no text)';

  panel.innerHTML = reviewModeSelectorHtml() + `
    <div class="panel-card">
      <div class="panel-card-title">Anchor candidate <span id="anchor-pending" style="color:#888;font-weight:normal;font-size:0.85rem"></span></div>
      <div style="font-size:0.85rem;color:#888;margin-bottom:0.5rem">${esc(item.post_id || '?')} | ${esc(item.dimension || 'voice_fit')}</div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem">
        <span style="background:${color};color:#0a0e14;padding:0.25rem 0.6rem;border-radius:4px;font-weight:bold;font-size:0.8rem">${esc(labelStr)} EXAMPLE</span>
        <span style="background:#1e2530;color:#c8d0dc;padding:0.25rem 0.6rem;border-radius:4px;font-size:0.8rem">${personaTxt}</span>
        <span style="background:#1e2530;color:#c8d0dc;padding:0.25rem 0.6rem;border-radius:4px;font-size:0.8rem">${postType}</span>
      </div>
      ${item.title ? `<div style="font-size:0.95rem;color:#c8d0dc;font-weight:bold;margin-bottom:0.5rem">${esc(item.title)}</div>` : ''}
      <div style="font-size:0.8rem;color:#888;margin-bottom:0.25rem">FULL POST</div>
      <div style="background:#0a0e14;padding:0.75rem;border-radius:6px;font-family:monospace;font-size:0.85rem;white-space:pre-wrap;max-height:50vh;overflow-y:auto;border:1px solid #1e2530">${esc(fullText)}</div>
      ${item.thread_url ? `<a href="${esc(item.thread_url)}" target="_blank" rel="noopener" style="display:inline-block;margin-top:0.5rem;font-size:0.8rem;color:#22d3ee;text-decoration:underline">View original thread</a>` : ''}
      <div style="font-size:0.8rem;color:#888;margin-top:0.75rem">Approve to use this as a ${esc(String(item.label || '').toLowerCase())} voice example for the ${personaTxt} persona. Scoring stays unchanged until anchors are switched on.</div>
    </div>
    <div class="panel-card">
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center">
        <button data-anchor-action="approve" class="anchor-btn" style="background:#22c55e;color:#0a0e14;border:none;padding:0.75rem 1.25rem;border-radius:6px;font-weight:bold;cursor:pointer;font-size:0.95rem">Approve</button>
        <button data-anchor-action="reject" class="anchor-btn" style="background:#ef4444;color:#0a0e14;border:none;padding:0.75rem 1.25rem;border-radius:6px;font-weight:bold;cursor:pointer;font-size:0.95rem">Reject</button>
        <button data-anchor-action="skip" class="anchor-btn" style="background:#444;color:#c8d0dc;border:none;padding:0.75rem 1.25rem;border-radius:6px;cursor:pointer;font-size:0.95rem">Skip</button>
      </div>
    </div>`;

  panel.querySelectorAll('.anchor-btn').forEach(btn => {
    btn.addEventListener('click', () => onAnchorAction(btn.dataset.anchorAction));
  });
  wireReviewModeSelector(panel);

  fetchAnchorQueueCount().then(n => {
    const el = document.getElementById('anchor-pending');
    if (el && n != null) el.textContent = `(${n} pending)`;
  });
}

async function fetchAnchorQueueCount() {
  try {
    const res = await fetch(`${API_BASE}/api/anchor-review/queue`, {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + getDeviceToken() },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.total_pending;
  } catch (err) {
    return null;
  }
}

async function onAnchorAction(action) {
  if (!currentAnchorItem) return;
  if (action === 'skip') {
    currentAnchorItem = null;
    anchorRejectMode = false;
    renderAnchorReview();
    return;
  }
  if (action === 'reject' && !anchorRejectMode) {
    // First reject tap: reveal the freetext reason capture (the training signal).
    anchorRejectMode = true;
    const card = document.querySelector('#panel-content-review .panel-card:last-child');
    if (card && !document.getElementById('anchor-reject-reason')) {
      const div = document.createElement('div');
      div.style.marginTop = '0.75rem';
      div.innerHTML = `
        <label style="display:block;color:#888;font-size:0.85rem;margin-bottom:0.25rem">Why reject? (training data)</label>
        <textarea id="anchor-reject-reason" placeholder="Wrong tone, banned claim, off-topic, etc." style="width:100%;height:80px;background:#0a0e14;color:#c8d0dc;border:1px solid #1e2530;border-radius:4px;padding:0.5rem;font-size:0.85rem"></textarea>
        <button id="anchor-submit-reject" style="margin-top:0.5rem;background:#ef4444;color:#0a0e14;border:none;padding:0.6rem 1rem;border-radius:6px;font-weight:bold;cursor:pointer">Submit Reject</button>`;
      card.appendChild(div);
      document.getElementById('anchor-submit-reject')?.addEventListener('click', () => onAnchorAction('submit-reject'));
      document.getElementById('anchor-reject-reason')?.focus();
    }
    return;
  }
  let rejectReason = null;
  if (action === 'submit-reject') {
    rejectReason = (document.getElementById('anchor-reject-reason')?.value || '').trim() || null;
    action = 'reject';
  }
  const result = await submitAnchorDecision(currentAnchorItem.candidate_id, action, rejectReason);
  if (result && result.success) {
    currentAnchorItem = null;
    anchorRejectMode = false;
    renderAnchorReview();
  }
}

function renderMissions() {
  const panel = document.getElementById('panel-missions');
  if (!panel) return;
  const q = apiData.health?.queue || {};
  const bs = q.by_status || {};
  const parked = apiData.health?.parked || [];
  const live = apiData.health?.live_posts || [];

  panel.innerHTML = `
    <div class="panel-card">
      <div class="panel-card-title">Content Queue</div>
      <div class="stat-row"><span class="stat-label">Total</span><span class="stat-value">${q.total || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Posted</span><span class="stat-value" style="color:var(--accent-green)">${bs.posted || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Approved</span><span class="stat-value" style="color:var(--accent-cyan)">${bs.approved || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Pending</span><span class="stat-value" style="color:var(--accent-yellow)">${bs.pending || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Declined</span><span class="stat-value">${bs.declined || 0}</span></div>
    </div>
    ${parked.length > 0 ? `
    <div class="panel-card">
      <div class="panel-card-title">Parked Posts (${parked.length})</div>
      ${parked.map(p => `<div class="stat-row"><span class="stat-label">${esc(p.id)}</span><span class="stat-value">${esc(p.platform)}</span></div>`).join('')}
    </div>` : ''}
    ${live.length > 0 ? `
    <div class="panel-card">
      <div class="panel-card-title">Live Posts (${live.length})</div>
      ${live.map(p => `
        <div class="stat-row">
          <span class="stat-label">${esc(p.id)} ${p.age_hours != null ? p.age_hours + 'h' : ''}</span>
          <span class="stat-value" style="color:${p.harvested ? 'var(--accent-green)' : 'var(--accent-yellow)'}">
            ${p.harvested ? 'harvested' : 'no metrics'}
          </span>
        </div>`).join('')}
    </div>` : ''}
  `;
}

function renderAgents() {
  const panel = document.getElementById('panel-agents');
  if (!panel) return;
  const svcs = apiData.health?.services || {};

  panel.innerHTML = `
    <div class="panel-card">
      <div class="panel-card-title">NSSM Services</div>
      ${Object.entries(svcs).map(([name, s]) => `
        <div class="service-row">
          <span><span class="svc-dot ${s.status}"></span>${esc(name)}</span>
          <span class="stat-value" style="color:${s.status === 'alive' ? 'var(--accent-green)' : 'var(--accent-red)'}">
            ${s.age_s != null ? Math.round(s.age_s / 60) + 'm ago' : '?'}
          </span>
        </div>
      `).join('')}
    </div>
    <div class="panel-card">
      <div class="panel-card-title">Engagement</div>
      <div class="stat-row">
        <span class="stat-label">Status</span>
        <span class="stat-value" style="color:${apiData.health?.engagement?.status === 'never_run' ? 'var(--accent-red)' : 'var(--accent-green)'}">
          ${esc(apiData.health?.engagement?.status || 'unknown')}
        </span>
      </div>
    </div>
    ${gitOpsCardHtml()}
  `;
}

function gitOpsCardHtml() {
  const go = apiData.health?.git_ops;
  if (!go) return '';
  const lr = go.last_result;
  const lrStatus = lr ? lr.status : 'none';
  const lrColor = lrStatus === 'success' ? 'var(--accent-green)' : lrStatus === 'failed' ? 'var(--accent-red)' : 'var(--accent-yellow, #d4a853)';
  const lrAction = lr && lr.action ? esc(lr.action) : '';
  const lrTime = lr && lr.timestamp ? lr.timestamp.slice(11, 16) : '';
  return `
    <div class="panel-card">
      <div class="panel-card-title">Git-Ops Bot</div>
      <div class="stat-row">
        <span class="stat-label">Queue</span>
        <span class="stat-value" style="color:${go.queue_depth > 0 ? 'var(--accent-yellow, #d4a853)' : 'var(--accent-green)'}">${go.queue_depth} pending</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Processed</span>
        <span class="stat-value">${go.total_processed}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">Errors (24h)</span>
        <span class="stat-value" style="color:${go.errors_24h > 0 ? 'var(--accent-red)' : 'var(--accent-green)'}">${go.errors_24h}</span>
      </div>
      ${lr ? `<div class="stat-row">
        <span class="stat-label">Last${lrAction ? ' (' + lrAction + ')' : ''}</span>
        <span class="stat-value" style="color:${lrColor}">${esc(lrStatus)}${lrTime ? ' ' + lrTime : ''}</span>
      </div>` : ''}
    </div>`;
}

function renderLog() {
  const panel = document.getElementById('panel-log');
  if (!panel) return;
  const flags = apiData.health?.flags || [];

  panel.innerHTML = `
    <div class="panel-card">
      <div class="panel-card-title">System Flags</div>
      ${flags.map(f => {
        const cls = f.includes('healthy') || f.includes('No flags') ? 'flag-ok'
          : f.includes('stale') || f.includes('down') || f.includes('offline') ? 'flag-error' : 'flag-warn';
        return `<div class="flag-item ${cls}">${esc(f)}</div>`;
      }).join('')}
    </div>
    <div class="panel-card">
      <div class="panel-card-title">Generation Rate</div>
      <div class="stat-row"><span class="stat-label">Last 24h</span><span class="stat-value">${apiData.health?.generation?.last_24h || 0}</span></div>
      <div class="stat-row"><span class="stat-label">Last 7 days</span><span class="stat-value">${apiData.health?.generation?.last_7d || 0}</span></div>
    </div>
    <div class="panel-card">
      <div class="panel-card-title">Last Refresh</div>
      <div class="stat-row"><span class="stat-label">Timestamp</span><span class="stat-value">${apiData.timestamp || '?'}</span></div>
    </div>
  `;
}

function renderSettings() {
  const panel = document.getElementById('panel-settings');
  if (!panel) return;
  panel.innerHTML = `
    <div class="panel-card">
      <div class="panel-card-title">Station Settings</div>
      <div class="stat-row"><span class="stat-label">Auto-refresh</span><span class="stat-value">${REFRESH_INTERVAL_MS / 1000}s</span></div>
      <div class="stat-row"><span class="stat-label">API endpoint</span><span class="stat-value">/api/station/status</span></div>
      <div class="stat-row"><span class="stat-label">Device</span><span class="stat-value">${esc(getDeviceId().slice(0, 8) || '?')}</span></div>
      <div class="stat-row"><span class="stat-label">Version</span><span class="stat-value">2.2.1</span></div>
    </div>
    <div class="panel-card" style="cursor:pointer" onclick="location.reload()">
      <div class="panel-card-title" style="color:var(--accent-cyan); text-align:center">Force Refresh</div>
    </div>
    <div class="panel-card" id="reset-view-btn" style="cursor:pointer">
      <div class="panel-card-title" style="color:var(--accent-gold); text-align:center">Reset Map View</div>
    </div>
    <div class="panel-card" id="unpair-btn" style="cursor:pointer">
      <div class="panel-card-title" style="color:var(--accent-red,#ef4444); text-align:center">Unpair Device</div>
    </div>
  `;
  document.getElementById('reset-view-btn')?.addEventListener('click', () => {
    resetView();
    switchTab('station');
  });
  document.getElementById('unpair-btn')?.addEventListener('click', () => {
    if (confirm('Unpair this device? You will need a new pairing code.')) {
      clearAuth();
    }
  });
}

// --- ROOM DETAIL OVERLAY ---
function onRoomTap(room) {
  showRoomOverlay(room);
}

function showRoomOverlay(room) {
  const overlay = document.getElementById('room-overlay');
  if (!overlay) return;

  const colors = ROOM_COLORS[room.id];
  const roomState = apiData?.rooms?.[String(room.id)] || {};
  const prog = roomState.progression || 'blueprint';
  const op = roomState.operational || 'offline';
  const progDef = PROGRESSION_STATES[prog];
  const opDef = OP_STATUSES[op];

  overlay.innerHTML = `
    <div class="room-overlay-header">
      <span class="room-overlay-title" style="color:${colors.accent}">${room.id}. ${room.name}</span>
      <div class="room-close-btn" id="close-room">X</div>
    </div>
    <div class="room-status-bar">
      <span class="status-badge progression-badge">${progDef?.label || prog}</span>
      <span class="status-badge" style="background:${hexAlpha(opDef?.color || '#888', 0.15)};color:${opDef?.color || '#888'}">
        ${opDef?.label || op}
      </span>
    </div>
    <div class="room-desc">${room.desc}${roomState.detail ? ' - ' + esc(roomState.detail) : ''}</div>
    <div class="equip-section-title">${room.type === 'production' ? '7-Stage Loop Equipment' : 'Equipment'}</div>
    ${room.equipment.map(eq => {
      const tierColor = eq.tier ? (TIER_COLORS[eq.tier] || '#444') : null;
      const statusColor = getEquipStatusColor(eq.status);
      return `
      <div class="equip-card">
        ${eq.stage != null ? `<div class="equip-stage">${eq.stage}</div>` : ''}
        <div class="equip-info">
          <div class="equip-name">${eq.name}</div>
          <div class="equip-sub">${eq.sub}</div>
        </div>
        <span class="equip-status" style="color:${statusColor}">${(eq.status || '').toUpperCase()}</span>
        ${eq.tier ? `<span class="equip-tier" style="border-color:${tierColor};color:${tierColor}">${eq.tier}</span>` : ''}
      </div>`;
    }).join('')}
  `;

  overlay.classList.add('visible');

  document.getElementById('close-room')?.addEventListener('click', () => {
    overlay.classList.remove('visible');
  });
}

function getEquipStatusColor(status) {
  const map = {
    active: '#22c55e', online: '#22c55e', scanning: '#22c55e',
    idle: '#6b7a8d', standby: '#6b7a8d',
    manual: '#eab308', manual_ops: '#eab308',
    offline: '#ef4444',
    future: '#333',
  };
  return map[status] || '#6b7a8d';
}

function hexAlpha(hex, a) {
  if (!hex || hex[0] !== '#') return `rgba(128,128,128,${a})`;
  return hexToRgba(hex, a);
}

// --- ESCAPE HELPER ---
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
