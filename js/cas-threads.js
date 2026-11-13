// cas-threads.js - Cas threads, folders, who answers, Ask / Change code, and the folding picture.
// ES Module. No em dashes. Names from the server go in with textContent, never innerHTML.
// A thread only chooses which of Cas's memories the PC reads. What Cas may do is always the signed message.

import { listThreads, createThread, updateThread, createFolder, updateFolder, projectStatus } from './cas-chat.js';

const $ = id => document.getElementById(id);
const MAIN = 'main';
const NEW = 'new';
const KEY_CURRENT = 'cas-thread';
const KEY_MAIN_MODEL = 'cas-main-model';
const KEY_SEEN = 'cas-thread-seen';
const KEY_SHUT = 'cas-folders-shut';
const KEY_FOLDED = 'cas-picture-folded';
const KEY_ROTATE = 'cas-scene-rotate';
const KEY_NEXT_SCENE = 'cas-scene-next';
const KEY_HINT = 'cas-thread-hint-done';
const NO_FOLDER = '';

const SVG = {
  folder: '<svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"/></svg>',
  caret: '<svg class="caret" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
};
const GROUPS = [
  ['Claude', 'your Pro plan'], ['ChatGPT', 'your ChatGPT plan'], ['Gemini', 'not linked yet'],
  ['Grok', 'not linked yet'], ['Local AI', 'after the BIOS update'],
];
const CLAUDE = {
  sonnet: { name: 'Sonnet', cls: '', what: 'Quick and careful. Passes hard ones to Opus.' },
  opus: { name: 'Opus', cls: 'opus', what: 'Deepest thinker. Uses your limit faster.' },
};
const LATER = [
  ['Gemini', 'Gemini', 'Pick its models here once your Google account is linked.'],
  ['Grok', 'Grok', 'Pick its models here once your xAI account is linked.'],
  ['Local AI', 'Local AI', 'Runs on your PC.'],
];
const SCENES = [
  ['assets/cas/scene-current.jpg', '50% 6%'],
  ['assets/cas/scene-map.jpg', '45% 20%'],
  ['assets/cas/scene-standing.jpg', '50% 2%'],
  ['assets/cas/scene-console.jpg', '45% 30%'],
];

let folders = [];
let threads = [];
let current = MAIN;
let draft = null;          // a new thread waits for its first message, which names it
let mode = 'ask';
let chatgpt = { list: [], ready: false, safe: false, change: false };
let onOpen = () => {};
let mainUnread = false;
let loaded = false;

const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  json(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
};

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

const byId = id => threads.find(t => t.id === id);

// ---- who answers ----------------------------------------------------------
/** Name and colour for a model value such as 'sonnet' or 'chatgpt:gpt-6-astra'. */
export function modelLabel(model) {
  if (!model) return { name: 'Cas', cls: '' };
  if (CLAUDE[model]) return CLAUDE[model];
  if (model.startsWith('chatgpt:')) {
    const slug = model.slice(8);
    const found = chatgpt.list.find(m => m.slug === slug);
    return { name: found ? found.name : slug, cls: 'gpt' };
  }
  return { name: model, cls: '' };
}

// ChatGPT is offered only when the PC says it checks ChatGPT's sandbox before every question
// (security review F1, 2026-11-11). A PC running older code says nothing, so ChatGPT stays off there.
function chatgptLocked() { return !chatgpt.safe; }

function chosenModel() {
  if (current === MAIN) return store.get(KEY_MAIN_MODEL, 'sonnet');
  if (current === NEW) return draft?.model || 'sonnet';
  return byId(current)?.model || 'sonnet';
}

function currentModel() {
  const model = chosenModel();
  return chatgptLocked() && model.startsWith('chatgpt:') ? 'sonnet' : model;
}

function showModel() {
  const label = modelLabel(currentModel());
  $('model-name').textContent = label.name;
  $('model-chip').className = 'cas-model-chip ' + label.cls;
  showModeHelp();
}

/** Who makes a code change in this thread. A PC that cannot have ChatGPT change code gives the change to Sonnet. */
function changeMaker() {
  const model = currentModel();
  return model.startsWith('chatgpt:') && !chatgpt.change ? 'Sonnet' : modelLabel(model).name;
}

function showModeHelp() {
  const help = $('cas-mode-help');
  if (!help) return;
  help.textContent = mode === 'change'
    ? `${changeMaker()} makes it on its own branch and tests it. Nothing is pushed without your tap.`
    : 'Cas answers from the code, live data and this thread. Nothing is changed.';
}

async function loadModels() {
  try {
    const data = await projectStatus();
    const models = data?.status?.models;
    if (models && Array.isArray(models.chatgpt)) {
      chatgpt = { list: models.chatgpt.filter(m => m && typeof m.slug === 'string'), ready: !!models.chatgpt_ready,
        safe: models.chatgpt_sandbox === 'checked', change: models.chatgpt_change === 'checked' };
      showModel();
    }
  } catch { /* the menu shows ChatGPT as waiting on the PC */ }
}

function modelRow(value, label, what, cls, on, off) {
  const button = el('button', `${cls}${on ? ' on' : ''}`);
  button.type = 'button';
  if (value) button.dataset.m = value;
  button.disabled = !!off;
  button.append(el('i', 'dot'), el('b', '', label), el('em', '', what));
  return button;
}

function openModelMenu(event) {
  event.stopPropagation();
  const menu = $('model-menu');
  if (!menu.hidden) { menu.hidden = true; return; }
  closeSheet();
  dropHint();
  const now = currentModel();
  menu.replaceChildren();
  for (const [group, note] of GROUPS) {
    const head = el('small', 'grp', group.toUpperCase());
    head.append(el('span', '', note));
    menu.append(head);
    if (group === 'Claude') {
      for (const [value, m] of Object.entries(CLAUDE)) menu.append(modelRow(value, m.name, m.what, m.cls, value === now));
    } else if (group === 'ChatGPT' && chatgptLocked()) {
      menu.append(modelRow('', 'ChatGPT models', 'Off until the PC runs the safer ChatGPT setup.', 'gpt', false, true));
    } else if (group === 'ChatGPT') {
      if (!chatgpt.list.length) {
        menu.append(modelRow('', 'ChatGPT models', 'They appear once the PC reports what your plan offers.', 'gpt', false, true));
      }
      for (const m of chatgpt.list) {
        const value = 'chatgpt:' + m.slug;
        menu.append(modelRow(value, m.name, chatgpt.ready ? 'Through the Codex app on your PC.' : 'The Codex app was not found on the PC.',
          'gpt', value === now, !chatgpt.ready));
      }
    } else {
      for (const [g, name, what] of LATER) if (g === group) menu.append(modelRow('', name, what, 'local', false, true));
    }
  }
  menu.append(el('p', '', 'Code changes always use Claude, because that is where the safety checks live.'));
  const r = $('model-chip').getBoundingClientRect();
  menu.style.top = Math.round(r.bottom + 6) + 'px';
  menu.style.left = Math.round(Math.max(8, Math.min(r.right - 280, window.innerWidth - 288))) + 'px';
  menu.hidden = false;
}

async function pickModel(value) {
  $('model-menu').hidden = true;
  const before = currentModel();
  if (value === before) return;
  if (current === MAIN) store.set(KEY_MAIN_MODEL, value);
  else if (current === NEW) draft.model = value;
  else {
    const t = byId(current);
    t.model = value;
    try { await updateThread(t.id, { model: value }); }
    catch (err) { t.model = before; showModel(); toast(err.message || 'Could not change who answers.'); return; }
  }
  showModel();
  swap($('model-chip'));
  toast(`${modelLabel(value).name} answers in this thread now`);
}

// ---- the dock: thread name, who answers, new ---------------------------------
function swap(node) { node.classList.remove('cas-plate-swap'); void node.offsetWidth; node.classList.add('cas-plate-swap'); }

function showPlate() {
  let title = 'Main chat', crumb = 'Everything from before, plus Cas updates';
  if (current === NEW) {
    const folder = folders.find(f => f.id === draft?.folderId);
    title = draft?.parentId ? 'New sub-thread' : 'New thread';
    crumb = draft?.parentTitle ? `Sub-thread of ${draft.parentTitle}` : `${folder ? folder.name + ' › ' : ''}Its title comes from your first message`;
  } else if (current !== MAIN) {
    const t = byId(current);
    const parent = t?.parent_id ? byId(t.parent_id) : null;
    const folder = folders.find(f => f.id === t?.folder_id);
    title = t?.title || 'Thread';
    crumb = [folder ? folder.name : 'No folder', parent && parent.title].filter(Boolean).join(' › ');
  }
  $('thread-title').textContent = title;
  $('thread-crumb').textContent = crumb;
  swap($('thread-plate'));
  showEmber();
  showModel();
  showWhere();
}

/** The message box says where the next message goes, so replying in an open thread is never a guess. */
function showWhere() {
  let where = 'Main chat', hint = 'Ask Cas anything';
  if (current === NEW) {
    const folder = folders.find(f => f.id === draft?.folderId);
    where = draft?.parentTitle ? `a new sub-thread of ${draft.parentTitle}` : `a new thread${folder ? ` in ${folder.name}` : ''}`;
    hint = 'First message. It becomes the title.';
  } else if (current !== MAIN) {
    where = byId(current)?.title || 'this thread';
    hint = 'Reply in this thread';
  }
  const box = $('cas-compose-where');
  if (box) box.lastElementChild.textContent = where;
  $('cas-textarea').placeholder = mode === 'change' ? 'Describe the change' : hint;
}

function seen() { return store.json(KEY_SEEN, {}); }
function markSeen(id) {
  const t = byId(id);
  if (!t) return;
  const all = seen();
  all[id] = t.updated;
  store.set(KEY_SEEN, JSON.stringify(all));
}
const SEEN_SLACK_S = 5; // the phone's and the server's clocks differ a little
const repliedAway = new Set(); // replies this phone saw arrive for a thread that was not open
const unread = t => t.id !== current && (repliedAway.has(t.id) || t.updated > (seen()[t.id] ?? t.created) + SEEN_SLACK_S);

function showEmber() {
  $('bar-ember').hidden = !(threads.some(unread) || (current !== MAIN && mainUnread));
}

/** Cas said something in the main chat while another thread is open. */
export function setMainUnread(on) { mainUnread = on && current !== MAIN; showEmber(); }

/** What the empty message area says while a new thread waits for its first message. */
export function draftNote() {
  if (draft?.parentTitle) return `A sub-thread of "${draft.parentTitle}". Cas already sees the end of that thread, so just say what you want to dig into. Your first message becomes its title.`;
  const folder = folders.find(f => f.id === draft?.folderId);
  return `A new thread${folder ? ` in ${folder.name}` : ''}. Your first message becomes its title.`;
}

/** 'main', 'new', or a thread id. */
export function currentKey() { return current; }

/** True when the thread lives in a folder named Brainstorm, where Cas's ideas can start a loop. */
export function inBrainstorm(id) {
  const thread = byId(id);
  const folder = thread && folders.find(f => f.id === thread.folder_id);
  return !!folder && /brainstorm/i.test(folder.name);
}

/** Open a thread made elsewhere (such as a mission's own thread). Reloads the list first so a new one is known. */
export async function showThread(id) {
  await refresh();
  if (byId(id)) openThread(id);
}

function openThread(id, { quiet = false } = {}) {
  current = id;
  if (id !== NEW) { draft = null; store.set(KEY_CURRENT, id); }
  if (id === MAIN) mainUnread = false;
  repliedAway.delete(id);
  markSeen(id);
  showPlate();
  closeSheet();
  if (!quiet) onOpen(id);
}

function startNew({ folderId = null, parent = null } = {}) {
  const from = parent ? byId(parent) : null;
  draft = {
    folderId: from ? from.folder_id : folderId,
    parentId: from ? from.id : null,
    parentTitle: from ? from.title : null,
    model: from ? from.model : currentModel(),
  };
  openThread(NEW);
  const folder = folders.find(f => f.id === draft.folderId);
  toast(from ? `Sub-thread of ${from.title}. Type its first message; it already sees the end of that thread.`
    : `New thread${folder ? ` in ${folder.name}` : ''}. Type its first message; that becomes its title.`);
}

/** Start a sub-thread from the open thread (or from the one given). */
export function branchOff(id = current) {
  if (id === MAIN || id === NEW || !byId(id)) { startNew(); return; }
  const parent = byId(id).parent_id || id; // one level only
  startNew({ parent });
}

/**
 * Where the next message goes and its signed first line. A new thread is made here, named from the message.
 * Returns { threadId, header, key } where key is 'main' or the thread id.
 */
export async function routeFor(text, asMode = mode) {
  if (current === NEW) {
    const title = text.split('\n')[0].trim().slice(0, 60) || 'New thread';
    const made = await createThread({ title, folder_id: draft.parentId ? null : draft.folderId,
      parent_id: draft.parentId, model: draft.model });
    threads.unshift({ ...made, last: '' });
    openThread(made.id, { quiet: true });
  }
  const model = currentModel();
  return { threadId: current === MAIN ? null : current, header: `@${model} ${asMode}`, key: current };
}

/** After a send or a reply, so the list order and last line stay current without a reload. */
export function touch(key, line, { reply = false } = {}) {
  const t = byId(key);
  if (!t) return;
  t.updated = Date.now() / 1000;
  if (line) t.last = line.split('\n')[0].slice(0, 90);
  if (key === current) markSeen(key);
  else if (reply) repliedAway.add(key);
  showEmber();
}

// ---- the thread list ----------------------------------------------------------
const sheetOpen = () => $('thread-sheet').classList.contains('open');

function when(ts) {
  if (!ts) return '';
  const age = Date.now() / 1000 - ts;
  if (age < 60) return 'now';
  if (age < 3600) return `${Math.floor(age / 60)} min`;
  const d = new Date(ts * 1000);
  if (age < 86400) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (age < 6 * 86400) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function row(t) {
  const isMain = t === MAIN;
  const item = el('div', `cas-trow${(isMain ? MAIN : t.id) === current ? ' on' : ''}${!isMain && t.parent_id ? ' sub' : ''}${isMain ? ' main' : ''}`);
  if (isMain) item.append(el('span', 'seal', 'C'));
  const text = el('div', 't');
  text.append(el('b', '', isMain ? 'Main chat' : t.title), el('span', '', isMain ? 'Everything from before, plus Cas updates' : (t.last || 'New thread')));
  const side = el('div', 'w', isMain ? '' : when(t.updated));
  const label = modelLabel(isMain ? store.get(KEY_MAIN_MODEL, 'sonnet') : t.model);
  side.append(el('small', `cas-row-model ${label.cls}`, label.name));
  if (isMain ? mainUnread : unread(t)) side.append(el('i', 'cas-ember'));
  item.append(text, side);
  if (!isMain) {
    const more = el('button', 'more', '···');
    more.type = 'button';
    more.setAttribute('aria-label', `Options for ${t.title}`);
    more.addEventListener('click', event => { event.stopPropagation(); threadMenu(t, more); });
    item.append(more);
    item.dataset.id = t.id;
  }
  item.addEventListener('click', () => openThread(isMain ? MAIN : t.id));
  return item;
}

function withSubs(list) {
  const out = [];
  for (const t of list.filter(x => !x.parent_id || !list.some(p => p.id === x.parent_id))) {
    out.push(t, ...list.filter(x => x.parent_id === t.id));
  }
  return out;
}

function renderList() {
  const q = $('thread-search').value.trim().toLowerCase();
  const match = t => !q || t.title.toLowerCase().includes(q) || (t.last || '').toLowerCase().includes(q);
  const list = $('thread-list');
  list.replaceChildren();
  if (!q || 'main chat'.includes(q)) list.append(row(MAIN));
  const shut = new Set(store.json(KEY_SHUT, []));
  for (const folder of [...folders, null]) {
    const key = folder ? folder.id : NO_FOLDER;
    const inside = withSubs(threads.filter(t => (t.folder_id || NO_FOLDER) === key && match(t)));
    if (!inside.length && (folder === null || q)) continue;
    const head = el('div', 'cas-folder-head' + (shut.has(key) ? ' shut' : ''));
    head.setAttribute('role', 'button');
    head.tabIndex = 0;
    head.insertAdjacentHTML('afterbegin', SVG.folder);
    head.append(el('span', '', folder ? folder.name : 'No folder'), el('em', '', String(inside.length)));
    if (folder) {
      const more = el('button', 'more', '···');
      more.type = 'button';
      more.setAttribute('aria-label', `Options for folder ${folder.name}`);
      more.addEventListener('click', event => { event.stopPropagation(); folderMenu(folder, more); });
      head.append(more);
    }
    head.insertAdjacentHTML('beforeend', SVG.caret);
    head.addEventListener('click', () => {
      const now = new Set(store.json(KEY_SHUT, []));
      now.has(key) ? now.delete(key) : now.add(key);
      store.set(KEY_SHUT, JSON.stringify([...now]));
      head.classList.toggle('shut');
    });
    const body = el('div', 'cas-folder-body');
    const inner = el('div');
    if (inside.length) inside.forEach(t => inner.append(row(t)));
    else inner.append(el('p', 'cas-folder-empty', 'Empty. Start a thread here, or use the dots on a thread to move it in.'));
    if (folder && !q) inner.append(menuButton('+ New thread in this folder', () => startNew({ folderId: folder.id }), 'cas-folder-new'));
    body.append(inner);
    list.append(head, body);
  }
}

function openSheet() {
  renderList();
  dropHint();
  $('model-menu').hidden = true;
  $('cas-composer-area')?.classList.add('cas-card-tucked'); // room for the list
  $('thread-sheet').classList.add('open');
  $('thread-sheet').setAttribute('aria-hidden', 'false');
  $('thread-plate').setAttribute('aria-expanded', 'true');
  refresh().then(() => { if (sheetOpen()) renderList(); });
}

function closeSheet() {
  $('thread-sheet').classList.remove('open');
  $('thread-sheet').setAttribute('aria-hidden', 'true');
  $('thread-plate').setAttribute('aria-expanded', 'false');
  $('row-menu').hidden = true;
}

function placeMenu(menu, anchor) {
  const r = anchor.getBoundingClientRect();
  menu.style.top = Math.round(Math.min(r.bottom + 4, window.innerHeight - 250)) + 'px';
  menu.style.left = Math.round(Math.max(8, r.right - 210)) + 'px';
  menu.hidden = false;
}

function menuButton(label, action, cls = '') {
  const b = el('button', cls, label);
  b.type = 'button';
  // Stop here: an action may swap the menu's contents, and the page's "tap outside closes menus" check
  // would then see a button that is no longer inside the menu and close it (Move to folder did this).
  b.addEventListener('click', event => { event.stopPropagation(); action(event); });
  return b;
}

function inlineInput(value, placeholder, done, replace) {
  const input = el('input', 'cas-inline-input');
  input.value = value;
  input.placeholder = placeholder;
  input.maxLength = 80;
  let finished = false;
  const finish = () => { if (finished) return; finished = true; done(input.value.trim()); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') finish(); if (e.key === 'Escape') { finished = true; renderList(); } });
  input.addEventListener('blur', finish);
  if (replace) replace.replaceWith(input); else $('thread-list').prepend(input);
  input.focus();
  input.select();
}

async function save(action, okText) {
  try { await action(); if (okText) toast(okText); }
  catch (err) { toast(err.message || 'That did not save. Try again.'); }
  await refresh();
  renderList();
  showPlate();
}

function threadMenu(t, anchor) {
  const menu = $('row-menu');
  menu.replaceChildren(
    menuButton('Rename', () => {
      menu.hidden = true;
      inlineInput(t.title, 'Thread name', title => {
        if (!title || title === t.title) { renderList(); return; }
        save(() => updateThread(t.id, { title }));
      }, $('thread-list').querySelector(`[data-id="${CSS.escape(t.id)}"]`));
    }),
    ...(t.parent_id ? [] : [menuButton('Move to folder', () => moveMenu(t, anchor))]),
    menuButton('New sub-thread', () => { menu.hidden = true; branchOff(t.id); }),
    menuButton('Archive', () => {
      menu.hidden = true;
      $('thread-list').querySelector(`[data-id="${CSS.escape(t.id)}"]`)?.classList.add('leaving');
      save(async () => {
        await updateThread(t.id, { archived: true });
        if (current === t.id || byId(current)?.parent_id === t.id) openThread(MAIN);
      }, 'Archived. Nothing is deleted.');
    }, 'warn'),
  );
  placeMenu(menu, anchor);
}

function moveMenu(t, anchor) {
  const menu = $('row-menu');
  menu.replaceChildren(el('small', '', 'MOVE TO'),
    ...[...folders, null].map(f => menuButton(f ? f.name : 'No folder', () => {
      menu.hidden = true;
      save(() => updateThread(t.id, { folder_id: f ? f.id : null }), 'Moved');
    })));
  placeMenu(menu, anchor);
}

function folderMenu(folder, anchor) {
  const menu = $('row-menu');
  menu.replaceChildren(
    menuButton('New thread here', () => { menu.hidden = true; startNew({ folderId: folder.id }); }),
    menuButton('Rename folder', () => {
      menu.hidden = true;
      inlineInput(folder.name, 'Folder name', name => {
        if (!name || name === folder.name) { renderList(); return; }
        save(() => updateFolder(folder.id, { name }));
      });
    }),
    menuButton('Archive folder', () => {
      menu.hidden = true;
      save(() => updateFolder(folder.id, { archived: true }), 'Folder archived. Its threads moved to No folder.');
    }, 'warn'),
  );
  placeMenu(menu, anchor);
}

function newFolder() {
  inlineInput('', 'Folder name, then Enter', name => {
    if (!name) { renderList(); return; }
    save(() => createFolder(name), `Folder "${name}" made`);
  });
}

async function refresh() {
  try {
    const data = await listThreads();
    folders = Array.isArray(data.folders) ? data.folders : [];
    threads = Array.isArray(data.threads) ? data.threads : [];
    loaded = true;
  } catch (err) {
    if (err.status === 404) loaded = false; // the server is older than threads
  }
  if (current !== MAIN && current !== NEW && loaded && !byId(current)) openThread(MAIN);
  else if (byId(current)) markSeen(current); // what is on screen has been seen
  showEmber();
}

// ---- Ask / Change code -----------------------------------------------------------
export function currentMode() { return mode; }

export function setMode(next, { quiet = false } = {}) {
  mode = next === 'change' ? 'change' : 'ask';
  const lever = $('cas-mode');
  lever.classList.toggle('is-change', mode === 'change');
  lever.classList.remove('cas-mode-clunk'); void lever.offsetWidth; lever.classList.add('cas-mode-clunk');
  lever.querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  $('cas-composer-area').classList.toggle('is-change', mode === 'change');
  showWhere();
  showModeHelp();
  if (!quiet) {
    toast(mode === 'change' ? 'Change code: own branch, tested, your tap to push' : 'Ask: Cas answers, nothing is changed');
    if (navigator.vibrate) navigator.vibrate(12);
  }
}

// ---- the picture: rotating scenes, folds away to the three buttons ------------------
let scene = 0;
let front = 'cas-shot-a';

function showScene(index) {
  scene = (index + SCENES.length) % SCENES.length;
  const back = front === 'cas-shot-a' ? 'cas-shot-b' : 'cas-shot-a';
  const img = $(back);
  img.onload = () => { img.classList.add('on'); $(front).classList.remove('on'); front = back; };
  img.style.objectPosition = SCENES[scene][1];
  img.src = SCENES[scene][0];
  [...$('cas-scene-dots').children].forEach((dot, n) => dot.classList.toggle('on', n === scene));
}

function foldPicture(on) {
  typingFold = false; // Chris's own choice wins over the fold for typing
  dropHint();
  $('cas-visual').classList.toggle('tucked', on);
  $('cas-scene').classList.toggle('pic-folded', on);
  store.set(KEY_FOLDED, on ? '1' : '0');
}

/** Called while Chris reads: the picture folds away like the message card. */
export function reading() { if (!$('cas-visual').classList.contains('tucked')) foldPicture(true); }

/** While Chris types on a phone, the picture steps aside so the message box and Send fit above the keyboard. Not saved. */
let typingFold = false;
export function typing(on) {
  const visual = $('cas-visual');
  if (on && !visual.classList.contains('tucked')) {
    visual.classList.add('tucked'); $('cas-scene').classList.add('pic-folded'); typingFold = true;
  } else if (!on && typingFold) {
    typingFold = false; visual.classList.remove('tucked'); $('cas-scene').classList.remove('pic-folded');
  }
}

function initPicture() {
  const rotate = store.get(KEY_ROTATE, '1') === '1';
  const dots = $('cas-scene-dots');
  dots.replaceChildren(...SCENES.map(() => el('i')));
  scene = (Number(store.get(KEY_NEXT_SCENE, '0')) || 0) % SCENES.length;
  store.set(KEY_NEXT_SCENE, String(rotate ? scene + 1 : scene));
  showScene(scene);
  $('cas-visual').addEventListener('click', e => {
    if (!e.target.closest('button') && !e.target.closest('#thread-dock') && store.get(KEY_ROTATE, '1') === '1'
        && !$('cas-visual').classList.contains('tucked')) showScene(scene + 1);
  });
  $('visual-fold').addEventListener('click', e => { e.stopPropagation(); foldPicture(true); });
  $('visual-pull').addEventListener('click', () => foldPicture(false));
  let swipeY = null;
  $('cas-visual').addEventListener('touchstart', e => { swipeY = e.touches[0].clientY; }, { passive: true });
  $('cas-visual').addEventListener('touchend', e => {
    if (swipeY != null && e.changedTouches[0].clientY - swipeY > 30) foldPicture(false);
    swipeY = null;
  }, { passive: true });
  if (store.get(KEY_FOLDED, '0') === '1') foldPicture(true);
  // Older Safari has no overflow: clip, and a focused button can nudge the picture sideways.
  $('cas-visual').addEventListener('scroll', e => { e.currentTarget.scrollTop = 0; e.currentTarget.scrollLeft = 0; });
  const button = $('cas-rotate-btn');
  if (button) {
    const show = () => { const on = store.get(KEY_ROTATE, '1') === '1'; button.textContent = on ? 'Scenes: rotate' : 'Scenes: keep one'; button.setAttribute('aria-pressed', String(on)); };
    button.addEventListener('click', () => { store.set(KEY_ROTATE, store.get(KEY_ROTATE, '1') === '1' ? '0' : '1'); show(); });
    show();
  }
}

// ---- small things ------------------------------------------------------------------
let toastTimer;
export function toast(text) {
  const box = $('cas-toast');
  if (!box) return;
  box.textContent = text;
  box.hidden = false;
  box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 2600);
}

function dropHint() { $('cas-thread-hint')?.remove(); }

function showHint() {
  if (store.get(KEY_HINT, '') === '1' || $('cas-visual').classList.contains('tucked')) return;
  store.set(KEY_HINT, '1');
  const hint = el('div', 'cas-thread-hint', 'Tap the name for all threads');
  hint.id = 'cas-thread-hint';
  document.body.append(hint);
  const r = $('thread-plate').getBoundingClientRect();
  hint.style.top = Math.round(r.bottom + 10) + 'px';
  hint.style.left = Math.round(r.left) + 'px';
  setTimeout(dropHint, 6000);
}

/** Wire up threads. opened(key) is called whenever another thread is opened ('main' or a thread id). */
export async function initThreads(opened) {
  onOpen = opened;
  initPicture();
  $('thread-plate').addEventListener('click', () => (sheetOpen() ? closeSheet() : openSheet()));
  $('thread-search').addEventListener('input', renderList);
  $('new-folder').addEventListener('click', newFolder);
  $('new-thread-bar').addEventListener('click', () => startNew({ folderId: byId(current)?.folder_id || draft?.folderId || null }));
  $('model-chip').addEventListener('click', openModelMenu);
  $('model-menu').addEventListener('click', e => {
    const b = e.target.closest('button[data-m]');
    if (b && !b.disabled) pickModel(b.dataset.m);
  });
  $('cas-messages').addEventListener('pointerdown', () => { if (sheetOpen()) closeSheet(); });
  $('cas-mode').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b) setMode(b.dataset.mode); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#row-menu') && !e.target.closest('.more')) $('row-menu').hidden = true;
    if (!e.target.closest('#model-menu') && !e.target.closest('#model-chip')) $('model-menu').hidden = true;
  });
  setMode('ask', { quiet: true });
  await refresh();
  const saved = store.get(KEY_CURRENT, MAIN);
  current = saved !== MAIN && byId(saved) ? saved : MAIN;
  showPlate();
  loadModels();
  setInterval(() => { if (!document.hidden) refresh(); }, 60000);
  requestAnimationFrame(showHint);
  return current;
}
