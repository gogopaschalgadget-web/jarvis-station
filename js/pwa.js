// pwa.js - PWA shell: service worker registration, offline banner, install hint.
// Install hint is hidden when already running in standalone (home screen) mode.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('./sw.js')
    .then(reg => reg.update())
    .catch(err => console.warn('Offline shell unavailable:', err.message));
}

function _isStandalone() {
  return (
    (navigator && navigator.standalone === true) ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

function mountPwaControls() {
  if (document.getElementById('station-offline-banner')) return;

  // Install hint: only when not already installed as a PWA
  if (!_isStandalone() && !document.getElementById('station-install-help')) {
    const install = document.createElement('details');
    install.id = 'station-install-help';
    install.className = 'station-install-help';
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    install.innerHTML = isIOS ?
      '<summary>Install on iPhone</summary>' +
      '<p>Open this Station in Safari. Tap Share, then Add to Home Screen. ' +
      'Open the new icon and pair your device when prompted.</p>' :
      '<summary>Install Station</summary>' +
      '<p>Use your browser’s install icon in the address bar, or its menu to install this Station as an app.</p>';
    document.body.append(install);
  }

  const offline = document.createElement('p');
  offline.id = 'station-offline-banner';
  offline.className = 'station-offline-banner';
  offline.textContent = 'You are offline. Reconnect to refresh your live data.';
  document.body.append(offline);
  updateOffline();
}

function updateOffline() {
  const el = document.getElementById('station-offline-banner');
  if (el) el.hidden = navigator.onLine;
}

addEventListener('online', updateOffline);
addEventListener('offline', updateOffline);
addEventListener('station:surface-changed', mountPwaControls);
if (document.readyState === 'loading') {
  addEventListener('DOMContentLoaded', mountPwaControls);
} else {
  mountPwaControls();
}
