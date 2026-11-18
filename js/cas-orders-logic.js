// Orders of the Day and Dashboard rules that need no page.

export const BLOCKS = [['production', 'Production'], ['operation', 'Operation'], ['analytics', 'Analytics'], ['learning', 'Learning']];

const STATUS = {
  running: ['Running', 'ok'], waiting_you: ['Waiting on you', 'wait'], blocked: ['Blocked', 'blk'], idle: ['Idle', 'unk'], unknown: ['Unknown', 'unk'],
};

export function agoText(seconds) {
  if (seconds == null) return 'unknown';
  if (seconds < 90) return 'just now';
  if (seconds < 5400) return Math.round(seconds / 60) + ' min ago';
  if (seconds < 172800) return Math.round(seconds / 3600) + ' h ago';
  return Math.round(seconds / 86400) + ' days ago';
}

export function hoursText(minutes) {
  const n = Number.isFinite(minutes) ? minutes : 0;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? (m ? `${h} h ${m}` : `${h} h`) : `${m} min`;
}

function weekOk(week) {
  return !!week && Number.isFinite(week.minutes) && Number.isFinite(week.cap);
}

export function weekText(week) {
  return weekOk(week) ? `This week: ${hoursText(week.minutes)} of ${hoursText(week.cap)}` : '';
}

export function weekNote(week) {
  return weekOk(week) && week.minutes > week.cap ? `You are over your ${Math.round(week.cap / 60)} hours for this week.` : '';
}

export function windowText(w) {
  const opens = Number(String((w && w.opens) || '09:00').slice(0, 2));
  const closes = Number(String((w && w.closes) || '17:00').slice(0, 2));
  return `Open ${opens} to ${closes % 12 || 12}`;
}

export function streakText(n) {
  return `Streak: ${n} day${n === 1 ? '' : 's'}`;
}

export function carryTag(n) {
  return n > 0 ? `Carried ${n} day${n === 1 ? '' : 's'}` : '';
}

export function statusInfo(status) {
  const [label, cls] = STATUS[status] || STATUS.unknown;
  return { label, cls };
}

export function proofInfo(proof) {
  if (proof && proof.state === 'proven') return { proven: true, text: 'Proven from the phone' + (typeof proof.proven_at === 'string' && proof.proven_at ? ', ' + proof.proven_at.slice(0, 10) : '') };
  return { proven: false, text: 'Not yet proven' };
}

/** A one-tap row (or a duty, which has no card) is ticked from the list; any other card opens so its own Done is used. */
export function tickAction(row) {
  return row.kind === 'duty' || row.one_tap ? 'tick' : 'open';
}

export function loopAction(loop) {
  const id = loop.proof && loop.proof.test_item_id;
  if (!id) return null;
  return loop.proof.state === 'proven' ? { type: 'open', id, label: 'Run test' } : { type: 'add', id, label: 'Add to Orders' };
}

export function numbersFor(numbers, block) {
  return (numbers || []).filter(n => n && (n.block || 'analytics') === block);
}

export function numberView(n) {
  if (n.value == null) return { value: 'unknown', note: n.source ? 'no value yet' : 'no source yet', unknown: true };
  return { value: n.value, note: [n.source, n.age_s != null ? agoText(n.age_s) : ''].filter(Boolean).join(' · '), unknown: false };
}

export function tomorrowLocal(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function resetText(w) {
  const h = Number(((w && w.resets) || '02:00').slice(0, 2));
  return `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
}

export const budgetLabel = m => `${m} min`;

export function sittingTitle(g) {
  return `Sitting ${g.n} · ${g.minutes} min`;
}

/** The server's shape with every field defaulted, so a missing field reads as nothing, never as undefined. */
export function normalizeOrders(j) {
  if (!j || !Array.isArray(j.rows)) return null;
  const rows = j.rows.filter(r => r && typeof r === 'object').map(r => ({
    key: String(r.key || ''), kind: r.kind === 'duty' ? 'duty' : 'card', id: r.id, title: String(r.title || ''), minutes: Number.isFinite(r.minutes) ? r.minutes : 0,
    why: String(r.why || ''), done: !!r.done, one_tap: !!r.one_tap, test: !!r.test, carried: Number(r.carried) || 0, sitting: r.sitting || null, quick: !!r.quick,
  }));
  return {
    rows, day: j.day, kind: j.kind === 'weekend' ? 'weekend' : 'weekday', budget: j.budget, budgets: (Array.isArray(j.budgets) ? j.budgets : []).filter(Number.isFinite),
    window: j.window && typeof j.window === 'object' ? j.window : { opens: '09:00', closes: '17:00', resets: '02:00' }, questions: (Array.isArray(j.questions) ? j.questions : []).filter(q => q && q.key),
    sittings: Array.isArray(j.sittings) ? j.sittings.filter(g => g && Array.isArray(g.keys)) : null, done: rows.filter(r => r.done).length, total: rows.length,
    minutes_left: rows.filter(r => !r.done).reduce((n, r) => n + r.minutes, 0), streak: Number(j.streak) || 0, week: j.week && typeof j.week === 'object' ? j.week : null,
    drop_needs_why: j.drop_needs_why !== false, now: j.now,
  };
}

function groupOf(d, g) {
  const byKey = new Map(d.rows.map(r => [r.key, r]));
  const rows = g.keys.map(k => byKey.get(k)).filter(Boolean);
  return { n: g.n, minutes: g.minutes, long: !!g.long, rows, done: rows.filter(r => r.done).length, total: rows.length };
}

/** Sittings hold the longer work; a row the server did not place still shows, in a last group. */
export function sittingGroups(d) {
  const placed = (d.sittings || []).map((g, i) => ({ n: Number(g.n) || i + 1, minutes: Number(g.minutes) || 0, long: !!g.long, keys: g.keys }));
  const seen = new Set(placed.flatMap(g => g.keys));
  const left = d.rows.filter(r => !r.quick && !seen.has(r.key));
  if (left.length) placed.push({ n: placed.length + 1, minutes: left.reduce((n, r) => n + r.minutes, 0), long: false, keys: left.map(r => r.key) });
  return placed.map(g => groupOf(d, g)).filter(g => g.rows.length);
}

/** Everything of five minutes or less, each taken on its own. */
export function quickGroup(d) {
  const rows = d.rows.filter(r => r.quick);
  return rows.length ? { minutes: rows.reduce((n, r) => n + r.minutes, 0), rows, done: rows.filter(r => r.done).length, total: rows.length } : null;
}

export function quickTitle(g) {
  return `Quick tasks · ${g.minutes} min`;
}

/** The whole day in one line. */
export function rundownText(d) {
  if (!d.total) return 'Today: nothing planned yet.';
  const q = quickGroup(d);
  const s = sittingGroups(d).length;
  const parts = [];
  if (q) parts.push(`${q.total} quick task${q.total === 1 ? '' : 's'}`);
  if (s) parts.push(`${s} sitting${s === 1 ? '' : 's'}`);
  return `Today: ${parts.join(' and ')}, about ${d.rows.reduce((n, r) => n + r.minutes, 0)} minutes.${Number.isFinite(d.budget) ? ` Your time today: ${d.budget} minutes.` : ''}`;
}

export function allDoneText(d) {
  return d.total > 0 && d.done === d.total ? 'That is everything for today.' : '';
}

export function normalizeDashboard(j) {
  if (!j || !Array.isArray(j.loops)) return null;
  const loops = j.loops.map(l => ({
    id: l.id, name: String(l.name || ''), status: l.status || 'unknown', status_note: l.status_note || '', last_run_age_s: Number.isFinite(l.last_run_age_s) ? l.last_run_age_s : null,
    needs: Array.isArray(l.needs) ? l.needs : [], proof: l.proof && typeof l.proof === 'object' ? l.proof : { state: 'not_proven' },
  }));
  return { loops, numbers: Array.isArray(j.numbers) ? j.numbers : [], proven: loops.filter(l => l.proof.state === 'proven').length, total: loops.length };
}
