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
  if (currentTab === 'agents') renderAgents();
  if (currentTab === 'log') renderLog();
  if (currentTab === 'settings') renderSettings();
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
  `;
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
      <div class="stat-row"><span class="stat-label">Version</span><span class="stat-value">2.0.0</span></div>
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
    manual: '#eab308',
    offline: '#ef4444',
    future: '#333',
  };
  return map[status] || '#6b7a8d';
}

function hexAlpha(hex, a) {
  if (!hex || hex[0] !== '#') return `rgba(128,128,128,${a})`;
  return hexToRgba(hex, a);
}

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
