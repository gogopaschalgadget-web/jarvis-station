// cas-scenes.js - background scenes painted on the PC, kept on Railway behind this phone's device login.
// Off by default: until Chris turns them on in Settings and a set exists, this file changes nothing on screen.
// Where they show (the Missions page for now) and how they look wait on Chris's answers. No em dashes.

const ROTATE_MS = 9000;
const RELOAD_MS = 30 * 60_000;
const SHOW_MAX = 8;

let _o = { apiBase: '', getToken: () => '' };
let _list = null;          // the last listing from Railway
let _urls = [];            // object URLs of the pictures in rotation
let _timer = null;
let _turn = 0;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

async function api(path, options = {}) {
  const res = await fetch(`${_o.apiBase}/api/station/scenes${path}`, {
    ...options, headers: { ...(options.headers || {}), Authorization: 'Bearer ' + _o.getToken() },
  });
  if (!res.ok) throw new Error(String(res.status));
  return res;
}

async function picture(id) {
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('bad id');
  const blob = await (await api(`/${id}/picture`)).blob();
  if (!/^image\/(jpeg|png)$/.test(blob.type)) throw new Error('not a picture');
  return URL.createObjectURL(blob);
}

function clearLayer() {
  clearInterval(_timer); _timer = null;
  document.getElementById('st-scenes')?.remove();
  _urls.forEach(u => URL.revokeObjectURL(u));
  _urls = [];
}

/** Draw the rotating layer behind the Missions page, only when scenes are on and pictures exist. */
async function applyLayer() {
  const scenes = (_list && _list.enabled && _list.scenes) || [];
  if (!scenes.length) { clearLayer(); return; }
  const panel = document.getElementById('panel-missions');
  if (!panel) return;
  const urls = [];
  for (const scene of scenes.slice(0, SHOW_MAX)) {
    try { urls.push(await picture(scene.id)); } catch { /* one missing picture never stops the rest */ }
  }
  clearLayer();
  if (!urls.length) return;
  _urls = urls;
  const layer = el('div', 'st-scenes');
  layer.id = 'st-scenes';
  layer.setAttribute('aria-hidden', 'true');
  urls.forEach((url, i) => {
    const img = el('img', 'st-scene' + (i === 0 ? ' on' : ''));
    img.src = url; img.alt = '';
    layer.append(img);
  });
  panel.prepend(layer);
  _turn = 0;
  if (urls.length > 1 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    _timer = setInterval(() => {
      if (document.hidden) return;
      const imgs = layer.querySelectorAll('.st-scene');
      imgs[_turn].classList.remove('on');
      _turn = (_turn + 1) % imgs.length;
      imgs[_turn].classList.add('on');
    }, ROTATE_MS);
  }
}

async function reload() {
  try {
    _list = await (await api('')).json();
  } catch { return; }  // no change on any failure; the next reload tries again
  await applyLayer();
}

/** Settings › Background scenes: the switch, how many a night, and pin or ban per picture. */
export function renderScenesSettings(panel) {
  if (!panel) return;
  document.getElementById('st-scenes-card')?.remove();
  const card = el('div', 'panel-card st-scenes-card');
  card.id = 'st-scenes-card';
  card.append(el('div', 'panel-card-title', 'Background scenes'));
  const list = _list;
  if (!list) {
    card.append(el('p', 'st-scenes-note', 'Not loaded yet.'));
    panel.append(card);
    reload().then(() => { if (document.getElementById('st-scenes-card')) renderScenesSettings(panel); });
    return;
  }
  card.append(el('p', 'st-scenes-note', list.enabled
    ? 'On: pictures painted on your PC rotate behind the Missions page. Ban any you do not like.'
    : 'Off: nothing is painted and nothing on screen changes.'));
  const row = el('div', 'st-scenes-row');
  const toggle = el('button', 'st-scenes-btn' + (list.enabled ? ' on' : ''), list.enabled ? 'Turn off' : 'Turn on');
  toggle.type = 'button';
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    try {
      _list = { ..._list, ...(await (await api('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !list.enabled }) })).json()) };
      await applyLayer();
    } catch { toggle.textContent = 'Not saved, try again'; }
    renderScenesSettings(panel);
  });
  const per = el('label', 'st-scenes-per', 'A night ');
  const select = el('select');
  [0, 2, 4, 6, 8, 10, 12].forEach(n => { const o = el('option', '', String(n)); o.value = String(n); o.selected = n === list.per_night; select.append(o); });
  select.addEventListener('change', async () => {
    try {
      _list = { ..._list, ...(await (await api('/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ per_night: Number(select.value) }) })).json()) };
    } catch { /* stays as it was */ }
    renderScenesSettings(panel);
  });
  per.append(select);
  row.append(toggle, per);
  card.append(row);
  card.append(el('p', 'st-scenes-note', `${list.scenes.length} picture${list.scenes.length === 1 ? '' : 's'} ready. ` +
    'Painting runs on the PC at night once it is scheduled.'));
  const grid = el('div', 'st-scenes-grid');
  list.scenes.forEach(scene => {
    const cell = el('div', 'st-scenes-cell' + (scene.pinned ? ' pinned' : ''));
    const img = el('img'); img.alt = `${scene.room}, ${scene.mood}`;
    picture(scene.id).then(url => { img.src = url; img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true }); }).catch(() => {});
    const acts = el('div', 'st-scenes-acts');
    const mark = (what, on) => async () => {
      try {
        await api(`/${scene.id}/mark`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [what]: on }) });
        await reload();
      } catch { /* stays as it was */ }
      renderScenesSettings(panel);
    };
    const pin = el('button', '', scene.pinned ? 'Unpin' : 'Pin'); pin.type = 'button'; pin.addEventListener('click', mark('pinned', !scene.pinned));
    const ban = el('button', '', 'Ban'); ban.type = 'button'; ban.addEventListener('click', mark('banned', true));
    acts.append(pin, ban);
    cell.append(img, el('small', '', `${scene.room} · ${scene.mood}`), acts);
    grid.append(cell);
  });
  card.append(grid);
  panel.append(card);
}

/** Set up once: load the listing now and every 30 minutes. Nothing shows unless scenes are on. */
export function initScenes(options) {
  _o = { ..._o, ...options };
  reload();
  setInterval(reload, RELOAD_MS);
}
