// Installable frontend shell only. Authenticated API responses are never cached.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(registration => registration.update()).catch(error => console.warn('Offline shell unavailable:', error.message));
}
function mountPwaControls() {
  if (document.getElementById('station-install-help')) return;
  const install = document.createElement('details');
  install.id = 'station-install-help';
  install.className = 'station-install-help';
  install.innerHTML = '<summary>Install on iPhone</summary><p>Open this Station in Safari. Tap Share, then Add to Home Screen. Open the new icon and pair your device when prompted.</p>';
  document.body.append(install);
  const offline = document.createElement('p');
  offline.id = 'station-offline-banner';
  offline.className = 'station-offline-banner';
  offline.textContent = 'You are offline. Reconnect to refresh your live work.';
  document.body.append(offline);
  updateOffline();
}
function updateOffline() {
  const offline = document.getElementById('station-offline-banner');
  if (offline) offline.hidden = navigator.onLine;
}
addEventListener('online', updateOffline);
addEventListener('offline', updateOffline);
addEventListener('station:surface-changed', mountPwaControls);
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mountPwaControls);
else mountPwaControls();
