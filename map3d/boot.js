// Loads the 3D map in pieces with a progress bar, then starts it. Same-site files only.
(function () {
  const bar = document.getElementById('map3d-bar');
  const note = document.getElementById('map3d-note');
  const retry = document.getElementById('map3d-retry');
  const screen = document.getElementById('map3d-loading');
  const phone = Math.min(window.innerWidth, window.innerHeight) < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent);
  if (phone) { window.STATION_POST = false; window.STATION_MAX_RATIO = 1.5; }

  function progress(fraction, text) {
    bar.style.width = Math.round(fraction * 100) + '%';
    note.textContent = text;
  }

  async function fetchOk(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('load failed');
    return response;
  }

  async function models(manifest) {
    const total = manifest.models.reduce((sum, file) => sum + file.size, 0);
    const queue = manifest.models.slice();
    const store = window.STATION_GLB = {};
    let done = 0;
    async function worker() {
      while (queue.length) {
        const file = queue.shift();
        store[file.key] = await (await fetchOk(`${file.url}?v=${manifest.version}`)).arrayBuffer();
        done += file.size;
        progress(0.05 + 0.85 * done / total, `Loading the Station: ${Math.round(done / 1e6)} of ${Math.round(total / 1e6)} MB`);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
  }

  function script(src) {
    return new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = src;
      tag.async = false;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('script failed'));
      document.body.append(tag);
    });
  }

  async function start() {
    retry.hidden = true;
    progress(0.02, 'Starting');
    try {
      const manifest = await (await fetch(`manifest.json?t=${Date.now()}`, { cache: 'no-store' })).json();
      await models(manifest);
      progress(0.92, 'Building the scene');
      await new Promise(resolve => setTimeout(resolve, 30));
      for (const src of manifest.scripts) await script(`${src}?v=${manifest.code}`);
      screen.hidden = true;
    } catch (error) {
      progress(0, 'The map could not load. Check your connection and try again.');
      retry.hidden = false;
    }
  }

  retry.addEventListener('click', () => { window.location.reload(); });
  start();
})();
