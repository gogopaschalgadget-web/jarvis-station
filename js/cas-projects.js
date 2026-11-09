// cas-projects.js - live progress of Cas's projects, above the message box.
// ES Module. No em-dashes. Server text is set through textContent only.

const POLL_MS = 20_000;
const STALE_AFTER_S = 150;
const MARKS = { done: '✓', skipped: '-', held: '?', blocked: '!', pending: '○' };
const WAITING = new Set(['waiting_chris', 'blocked', 'stopped']);

let _apiBase = '';
let _getToken = () => '';
let _answer = async () => {};
let _panel = null;
let _timer = null;
const _open = new Set();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function minutes(seconds) {
  const value = Math.max(0, Math.round(seconds / 60));
  if (value < 1) return 'under a minute';
  return value === 1 ? '1 minute' : value + ' minutes';
}

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
    const button = el('button', '', option + (option === ask.recommendation ? ' (my pick)' : ''));
    button.type = 'button';
    button.addEventListener('click', async () => {
      box.querySelectorAll('button').forEach(b => { b.disabled = true; });
      try {
        await _answer('answer ' + ask.number + ': ' + (index + 1));
      } catch {
        box.querySelectorAll('button').forEach(b => { b.disabled = false; });
      }
    });
    buttons.append(button);
  });
  box.append(buttons, el('small', '', 'Or type: answer ' + ask.number + ': and your own words.'));
  return box;
}

function projectCard(project, ageSeconds, stopped) {
  const card = el('div', 'cas-project cas-project-' + project.status);
  const head = el('button', 'cas-project-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(_open.has(project.number)));
  const counts = project.total ? project.done + ' of ' + project.total + ' tasks' : 'Planning';
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
    render(_last);
  });
  card.append(head);
  if (stopped) card.append(el('p', 'cas-project-warn', 'Cas is stopped. Work has paused.'));
  else if (ageSeconds > STALE_AFTER_S) card.append(el('p', 'cas-project-warn', 'The PC last reported ' + minutes(ageSeconds) + ' ago, so this may be out of date.'));
  (project.asks || []).forEach(ask => card.append(askBox(ask)));
  if (_open.has(project.number)) {
    const list = el('div', 'cas-project-tasks');
    (project.tasks || []).forEach(task => list.append(taskRow(task)));
    if (!(project.tasks || []).length) list.append(el('p', 'cas-project-line', 'The task list appears once the plan is ready.'));
    card.append(list);
  }
  return card;
}

let _last = null;

function render(status) {
  _last = status;
  if (!_panel) return;
  const scroll = _panel.scrollTop;
  _panel.textContent = '';
  const projects = (status && status.projects) || [];
  _panel.hidden = !projects.length;
  const age = status ? Date.now() / 1000 - status.updated_at : 0;
  projects.forEach(project => _panel.append(projectCard(project, age, !!status.stopped)));
  _panel.scrollTop = scroll;
}

async function refresh() {
  if (document.hidden) return;
  try {
    const res = await fetch(_apiBase + '/api/station/cas/projects', { headers: { Authorization: 'Bearer ' + _getToken() } });
    if (!res.ok) return;
    const data = await res.json();
    if (data && (data.status === null || typeof data.status === 'object')) render(data.status);
  } catch { /* the next refresh tries again */ }
}

/** Show the progress panel inside the given container and keep it current. Call once. */
export function initCasProjects(container, apiBase, getToken, answer) {
  if (_timer || !container) return;
  _apiBase = apiBase;
  _getToken = getToken;
  _answer = answer;
  _panel = el('div', 'cas-projects');
  _panel.id = 'cas-projects';
  _panel.hidden = true;
  container.prepend(_panel);
  refresh();
  _timer = setInterval(refresh, POLL_MS);
  document.addEventListener('visibilitychange', refresh);
}
