// cas-projects.js - Cas's projects. The home screen shows one slim line and a "Cas needs you" button;
// the full cards live on a Projects screen with an Archive tab.
// ES Module. No em-dashes. Server text is set through textContent only.

import { setCasProjectWork } from './cas-animation.js';

const POLL_MS = 20_000;
const STALE_AFTER_S = 150;
const FILING_MS = 520;
const MARKS = { done: '✓', skipped: '-', held: '?', blocked: '!', pending: '○' };
const STOPPABLE = new Set(['running', 'waiting_chris', 'waiting_limit', 'blocked']);
// Which project leads the slim line on the home screen.
const LEAD_ORDER = ['waiting_chris', 'running', 'waiting_limit', 'blocked', 'stopped', 'done'];

let _apiBase = '';
let _getToken = () => '';
let _answer = async () => {};
let _panel = null;
let _sheet = null;
let _timer = null;
let _last = null;
let _tab = 'active';
const _open = new Set();       // cards with their task list showing
const _openFiled = new Set();  // archive rows showing their details
const _filing = new Set();     // archived on this phone, waiting for the PC to confirm

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function minutes(seconds) {
  const value = Math.max(0, Math.round(seconds / 60));
  if (value < 1) return 'under a minute';
  return value === 1 ? '1 minute' : value + ' minutes';
}

function day(seconds) {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function active(status) {
  return ((status && status.projects) || []).filter(project => !_filing.has(project.number));
}

function archived(status) {
  return (status && status.archive) || [];
}

function openAsks(projects) {
  return projects.reduce((count, project) => count + (project.asks || []).length, 0);
}

function lead(projects) {
  return [...projects].sort((a, b) => LEAD_ORDER.indexOf(a.status) - LEAD_ORDER.indexOf(b.status))[0];
}

async function send(text, control) {
  if (control) control.disabled = true;
  try {
    await _answer(text);
    return true;
  } catch {
    if (control) control.disabled = false;
    return false;
  }
}

// ---- a full project card, on the Projects screen ------------------------------
function taskRow(task) {
  const row = el('div', 'cas-project-task cas-task-' + task.status);
  row.append(el('span', 'cas-project-mark', MARKS[task.status] || '○'), el('span', '', task.title));
  return row;
}

function askBox(ask) {
  const box = el('div', 'cas-project-ask');
  box.append(el('p', '', ask.question));
  const buttons = el('div', 'cas-project-ask-buttons');
  (ask.options || []).forEach((option, index) => {
    buttons.append(button('', option + (option === ask.recommendation ? ' (my pick)' : ''), async () => {
      box.querySelectorAll('button').forEach(b => { b.disabled = true; });
      if (!await send('answer ' + ask.number + ': ' + (index + 1))) box.querySelectorAll('button').forEach(b => { b.disabled = false; });
    }));
  });
  box.append(buttons, el('small', '', 'Or type: answer ' + ask.number + ': and your own words.'));
  return box;
}

function fileAway(card, project, asTest) {
  if (!confirm('Move project ' + project.number + ' to the archive' + (asTest ? ' as a test' : '') + '? Nothing is deleted.')) return;
  card.classList.add('cas-filing');
  const tab = _sheet && _sheet.querySelector('[data-tab="archive"]');
  if (tab) tab.classList.add('cas-tab-catch');
  setTimeout(async () => {
    _filing.add(project.number);
    render(_last);
    if (!await send('archive ' + project.number + (asTest ? ' as test' : ''))) {
      _filing.delete(project.number);
      render(_last);
    }
  }, FILING_MS);
}

function controlRow(card, project) {
  const row = el('div', 'cas-project-controls');
  if (project.status === 'stopped' || project.status === 'blocked') {
    const label = project.status === 'blocked' ? 'Try again' : 'Resume';
    row.append(button('cas-project-resume', label, event => send('resume ' + project.number, event.currentTarget)));
  } else if (STOPPABLE.has(project.status)) {
    row.append(button('cas-project-stop', 'Stop this project', event => {
      if (confirm('Stop project ' + project.number + '? Anything it is in the middle of is thrown away. Finished tasks are kept.')) send('stop ' + project.number, event.currentTarget);
    }));
  }
  if (project.archivable) {
    row.append(button('cas-project-file', 'Archive', () => fileAway(card, project, false)),
      button('cas-project-file', 'Archive as test', () => fileAway(card, project, true)));
  }
  return row;
}

function projectCard(project, ageSeconds, stopped) {
  const card = el('div', 'cas-project cas-project-' + project.status);
  card.dataset.number = String(project.number);
  const head = el('button', 'cas-project-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(_open.has(project.number)));
  const counts = project.total ? project.done + ' of ' + project.total + ' tasks'
    : project.status === 'stopped' ? 'Stopped' : project.status === 'done' ? 'Finished' : 'Planning';
  const title = el('div', 'cas-project-title');
  title.append(el('span', 'cas-project-goal', 'Project ' + project.number + ': ' + project.goal), el('span', 'cas-project-count', counts));
  const track = el('div', 'cas-project-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  track.setAttribute('aria-valuenow', String(project.percent));
  const fill = el('div', 'cas-project-fill');
  fill.style.width = Math.max(project.percent, project.status === 'running' ? 4 : 0) + '%';
  if (project.status === 'running' && !stopped) fill.classList.add('cas-project-live');
  track.append(fill);
  let line = project.headline;
  if (project.status === 'running' && project.since) line += ' Started ' + minutes(Date.now() / 1000 - project.since) + ' ago.';
  head.append(title, track, el('p', 'cas-project-line', line));
  head.addEventListener('click', () => {
    if (_open.has(project.number)) _open.delete(project.number); else _open.add(project.number);
    renderSheet();
  });
  card.append(head);
  if (stopped) card.append(el('p', 'cas-project-warn', 'Cas is stopped. Work has paused.'));
  else if (ageSeconds > STALE_AFTER_S) card.append(el('p', 'cas-project-warn', 'The PC last reported ' + minutes(ageSeconds) + ' ago, so this may be out of date.'));
  if (project.error) card.append(el('p', 'cas-project-error', 'Last error: ' + project.error));
  if (project.status === 'done' && (project.not_verified || []).length) {
    card.append(el('p', 'cas-project-line', 'Not checked yet: ' + project.not_verified.join(' ')));
  }
  (project.asks || []).forEach(ask => card.append(askBox(ask)));
  // While all of Cas is stopped it refuses every command, so the buttons would only fail.
  if (!stopped) card.append(controlRow(card, project));
  if (_open.has(project.number)) {
    const list = el('div', 'cas-project-tasks');
    (project.tasks || []).forEach(task => list.append(taskRow(task)));
    if (!(project.tasks || []).length) list.append(el('p', 'cas-project-line', 'The task list appears once the plan is ready.'));
    card.append(list);
  }
  return card;
}

// ---- the archive ------------------------------------------------------------
function filedRow(project) {
  const row = el('div', 'cas-filed');
  const head = button('cas-filed-head', '', () => {
    if (_openFiled.has(project.number)) _openFiled.delete(project.number); else _openFiled.add(project.number);
    renderSheet();
  });
  head.setAttribute('aria-expanded', String(_openFiled.has(project.number)));
  const top = el('span', 'cas-filed-top');
  top.append(el('span', 'cas-filed-goal', 'Project ' + project.number + ': ' + project.goal));
  if (project.test) top.append(el('span', 'cas-filed-test', 'TEST'));
  head.append(top, el('span', 'cas-filed-meta', project.outcome + (project.when ? ' · ' + day(project.when) : '')));
  row.append(head);
  if (_openFiled.has(project.number)) {
    const body = el('div', 'cas-filed-body');
    body.append(el('p', '', project.goal), el('p', 'cas-project-line', project.note));
    (project.tasks || []).forEach(task => body.append(taskRow(task)));
    if ((project.not_verified || []).length) body.append(el('p', 'cas-project-line', 'Not checked: ' + project.not_verified.join(' ')));
    if (project.status === 'stopped' || project.status === 'blocked') {
      body.append(button('cas-project-resume', 'Bring back and resume', event => send('resume ' + project.number, event.currentTarget)));
    }
    row.append(body);
  }
  return row;
}

// ---- the Projects screen ------------------------------------------------------
function closeSheet() {
  if (!_sheet) return;
  _sheet.hidden = true;
  document.body.classList.remove('cas-sheet-open');
}

function openSheet(tab, focusAsk) {
  if (!_sheet) return;
  _tab = tab || _tab;
  _sheet.hidden = false;
  document.body.classList.add('cas-sheet-open');
  renderSheet();
  const list = _sheet.querySelector('.cas-sheet-body');
  if (focusAsk) {
    const ask = list.querySelector('.cas-project-ask');
    if (ask) ask.scrollIntoView({ block: 'center' });
  } else list.scrollTop = 0;
}

function buildSheet() {
  const sheet = el('div', 'cas-sheet');
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Cas projects');
  const head = el('div', 'cas-sheet-head');
  head.append(el('strong', '', 'Projects'), button('cas-sheet-close', 'Close', closeSheet));
  const tabs = el('div', 'cas-sheet-tabs');
  ['active', 'archive'].forEach(name => {
    const tab = button('cas-sheet-tab', '', () => { _tab = name; renderSheet(); });
    tab.dataset.tab = name;
    tabs.append(tab);
  });
  sheet.append(head, tabs, el('div', 'cas-sheet-body'));
  document.body.append(sheet);
  // Leaving for another part of the Station closes it.
  document.addEventListener('click', event => {
    if (event.target.closest && event.target.closest('.nav-item')) closeSheet();
  });
  return sheet;
}

function renderSheet() {
  if (!_sheet || _sheet.hidden) return;
  const status = _last;
  const projects = active(status);
  const filed = archived(status);
  _sheet.querySelectorAll('.cas-sheet-tab').forEach(tab => {
    const name = tab.dataset.tab;
    tab.textContent = (name === 'active' ? 'Active' : 'Archive') + ' (' + (name === 'active' ? projects.length : filed.length) + ')';
    tab.classList.toggle('cas-sheet-tab-on', name === _tab);
    tab.classList.remove('cas-tab-catch');
    tab.setAttribute('aria-pressed', String(name === _tab));
  });
  const list = _sheet.querySelector('.cas-sheet-body');
  const scroll = list.scrollTop;
  list.textContent = '';
  const age = status ? Date.now() / 1000 - status.updated_at : 0;
  if (_tab === 'active') {
    projects.forEach(project => list.append(projectCard(project, age, !!(status && status.stopped))));
    if (!projects.length) list.append(el('p', 'cas-sheet-empty', 'No active projects. Send build: and a goal to start one.'));
  } else {
    filed.forEach(project => list.append(filedRow(project)));
    if (!filed.length) list.append(el('p', 'cas-sheet-empty', 'Nothing archived yet.'));
  }
  list.scrollTop = scroll;
}

// ---- the home screen ---------------------------------------------------------
function renderHome(status) {
  const projects = active(status);
  const filed = archived(status);
  _panel.textContent = '';
  _panel.hidden = !projects.length && !filed.length;
  if (_panel.hidden) return;
  const asks = openAsks(projects);
  if (asks) {
    _panel.append(button('cas-needs-you', 'Cas needs you: ' + asks + (asks === 1 ? ' question' : ' questions'), () => openSheet('active', true)));
  }
  const first = lead(projects);
  if (!first) {
    _panel.append(button('cas-project-slim cas-project-slim-quiet', 'No active projects · Archive (' + filed.length + ')', () => openSheet('archive')));
    return;
  }
  const slim = button('cas-project-slim', '', () => openSheet('active'));
  const top = el('span', 'cas-slim-top');
  top.append(el('span', 'cas-slim-goal', 'Project ' + first.number + ': ' + first.goal));
  if (projects.length > 1) top.append(el('span', 'cas-slim-more', '+' + (projects.length - 1) + ' more'));
  const track = el('span', 'cas-slim-track');
  const fill = el('span', 'cas-slim-fill');
  fill.style.width = Math.max(first.percent, first.status === 'running' ? 4 : 0) + '%';
  if (first.status === 'running' && !(status && status.stopped)) fill.classList.add('cas-project-live');
  track.append(fill);
  slim.append(top, track, el('span', 'cas-slim-line', first.headline));
  _panel.append(slim);
  if (status && status.stopped) _panel.append(el('p', 'cas-project-warn', 'Cas is stopped. Work has paused.'));
}

/** The caption while Cas is really at work: only a running project, from a PC that reported recently. */
function workLabel(status, ageSeconds) {
  if (!status || status.stopped || ageSeconds > STALE_AFTER_S) return '';
  const running = (status.projects || []).find(project => project.status === 'running');
  return running ? 'Working on project ' + running.number : '';
}

function render(status) {
  _last = status;
  if (!_panel) return;
  // Once the PC confirms a project is filed, stop hiding it by hand.
  const live = new Set(((status && status.projects) || []).map(project => project.number));
  [..._filing].forEach(number => { if (!live.has(number)) _filing.delete(number); });
  const age = status ? Date.now() / 1000 - status.updated_at : 0;
  setCasProjectWork(workLabel(status, age));
  renderHome(status);
  renderSheet();
}

async function refresh() {
  if (document.hidden) return;
  try {
    const res = await fetch(_apiBase + '/api/station/cas/projects', { headers: { Authorization: 'Bearer ' + _getToken() } });
    if (!res.ok) { setCasProjectWork(''); return; }
    const data = await res.json();
    if (data && (data.status === null || typeof data.status === 'object')) render(data.status);
  } catch { setCasProjectWork(''); /* the next refresh tries again */ }
}

/** Show the project line inside the given container, build the Projects screen, and keep both current. Call once. */
export function initCasProjects(container, apiBase, getToken, answer) {
  if (_timer || !container) return;
  _apiBase = apiBase;
  _getToken = getToken;
  _answer = answer;
  _panel = el('div', 'cas-projects');
  _panel.id = 'cas-projects';
  _panel.hidden = true;
  container.prepend(_panel);
  _sheet = buildSheet();
  refresh();
  _timer = setInterval(refresh, POLL_MS);
  document.addEventListener('visibilitychange', refresh);
}
