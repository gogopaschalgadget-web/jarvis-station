// map3d-status.js - turns the Station's status into the form the 3D map reads.
// It sends only what the server really reports. Stations with no reporter are left out, so the map shows them as not reported.

const ALIVE = 'alive';
const STALE = 'stale';

function service(services, name, whenStale) {
  const entry = services[name];
  if (!entry) return 'unknown';
  if (entry.status === ALIVE) return 'working';
  return entry.status === STALE ? whenStale : 'unknown';
}

function whole(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

// An unreadable queue file arrives as an empty queue, so an empty queue cannot be told apart from no data.
function queueCounts(queue) {
  if (!queue || typeof queue.by_status !== 'object' || !queue.by_status || !(whole(queue.total) > 0)) return null;
  const count = name => whole(queue.by_status[name]) ?? 0;
  return { ready: count('pending'), approval: count('pending') + count('pending_approval') };
}

function queueState(count) {
  if (count === null) return 'unknown';
  return count > 0 ? 'waiting' : 'idle';
}

function forgeState(generator, madeToday) {
  if (generator !== 'working') return generator;
  if (madeToday === null) return 'unknown';
  return madeToday > 0 ? 'working' : 'idle';
}

// Work held for Chris. Older servers do not send it, so it is simply absent.
function waitingOn(block) {
  if (!block || typeof block !== 'object') return null;
  const x = whole(block.x_to_post);
  const reddit = whole(block.reddit_to_review);
  if (x === null || reddit === null) return null;
  return { x, reddit, xPaused: block.x_writer_paused === true };
}

function hubState(x, reddit) {
  const both = [x, reddit];
  if (both.includes('working')) return 'working';
  if (both.includes('error')) return 'error';
  return both.includes('paused') ? 'paused' : 'unknown';
}

export function toMapStatus(data) {
  const stamp = data && (data.generated_at || data.timestamp);
  const health = data && data.health;
  if (typeof stamp !== 'string' || !Number.isFinite(Date.parse(stamp)) || !health || typeof health !== 'object') return null;

  const services = health.services && typeof health.services === 'object' ? health.services : {};
  const generator = service(services, 'content_generator', 'error');
  // X goes out by tap in the Station now, so a silent X agent is switched off, not broken.
  const xAgent = service(services, 'x_post_agent', 'paused');
  const redditAgent = service(services, 'reddit_post_agent', 'error');
  const counts = queueCounts(health.queue);
  const ready = counts ? counts.ready : null;
  const approval = counts ? counts.approval : null;
  const madeToday = health.generation ? whole(health.generation.last_24h) : null;
  const waiting = waitingOn(health.waiting);
  // A running writer that is holding back because Chris has not posted is waiting, not idle.
  const forge = generator === 'working' && waiting && waiting.xPaused ? 'waiting' : forgeState(generator, madeToday);

  return {
    updated_at: stamp,
    waiting,
    loops: {
      content: {
        stages: {
          forge: { state: forge },
          'job-board': { state: queueState(ready) },
        },
        queue: ready,
        services: [{ name: 'Content generator service', state: generator }],
      },
      traffic: {
        stages: {
          'traffic-lead': { state: queueState(approval) },
          'distribution-hub': { state: hubState(xAgent, redditAgent) },
        },
        platforms: { X: xAgent, REDDIT: redditAgent },
        services: [{ name: 'Post agent service (X)', state: xAgent }],
      },
    },
  };
}
