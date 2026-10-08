// Cas appearance is independent of Station authentication and business state.
const DB_NAME = 'cas-appearance-v1';
const STORE = 'appearance';
const KEY = 'current';

export function validateImage(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a PNG, JPEG or WebP image.');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.');
}

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storage(action, value) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, action === 'get' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = action === 'get' ? store.get(KEY) : action === 'put' ? store.put(value, KEY) : store.delete(KEY);
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Image save cancelled.'));
    });
  } finally { db.close(); }
}

export async function mountCas(parent) {
  const response = await fetch('./assets/cas/identity.json');
  if (!response.ok) throw new Error('Cas identity could not load.');
  const identity = await response.json();
  const section = document.createElement('section');
  section.className = 'cas-desk';
  section.innerHTML = `<div class="cas-portrait"><img alt="Cas, your Station companion"></div>
    <div class="cas-introduction"><span class="cas-eyebrow">ONE CAS · EVERY THREAD</span><h2>Cas</h2>
    <p class="cas-summary"></p><p class="cas-voice"></p>
    <button type="button" class="cas-settings-toggle" aria-expanded="false">Cas appearance</button>
    <div class="cas-settings" hidden><label>Change Cas image<input type="file" accept="image/png,image/jpeg,image/webp"></label>
    <p>Your image choice stays on this device. Changing it preserves your other Station settings.</p>
    <button type="button" class="cas-restore">Restore selected look</button></div>
    <p class="cas-status" role="status" aria-live="polite"></p></div>`;
  parent.append(section);
  section.querySelector('.cas-summary').textContent = identity.summary;
  section.querySelector('.cas-voice').textContent = identity.voicePreference;
  const image = section.querySelector('img');
  const status = section.querySelector('.cas-status');
  const picker = section.querySelector('input');
  const restore = section.querySelector('.cas-restore');
  let currentURL = null;
  const defaultURL = new URL(identity.image, document.baseURI).href;
  function display(blob) {
    if (currentURL) URL.revokeObjectURL(currentURL);
    currentURL = blob ? URL.createObjectURL(blob) : null;
    image.src = currentURL || defaultURL;
  }
  display(null);
  image.onerror = () => { status.textContent = 'The image could not load. Use Cas appearance to choose another.'; };
  picker.disabled = restore.disabled = true;
  try { const saved = await storage('get'); if (saved instanceof Blob) { display(saved); status.textContent = 'Your saved Cas image is loaded.'; } }
  catch { status.textContent = 'Device image storage is unavailable. The selected default look is displayed.'; }
  section.querySelector('.cas-settings-toggle').onclick = event => {
    const settings = section.querySelector('.cas-settings');
    settings.hidden = !settings.hidden;
    event.currentTarget.setAttribute('aria-expanded', String(!settings.hidden));
  };
  picker.onchange = async () => {
    const file = picker.files[0];
    if (!file) return;
    picker.disabled = restore.disabled = true;
    try {
      validateImage(file);
      const testURL = URL.createObjectURL(file);
      try {
        const probe = new Image();
        await new Promise((resolve, reject) => {
          probe.onload = resolve;
          probe.onerror = () => reject(new Error('This file could not be decoded as an image.'));
          probe.src = testURL;
        });
      } finally { URL.revokeObjectURL(testURL); }
      await storage('put', file);
      display(file);
      status.textContent = 'Cas image saved on this device. Her identity and other settings are preserved.';
    } catch (error) { status.textContent = error.message || 'Image could not be saved. Previous image retained.'; }
    finally { picker.disabled = restore.disabled = false; picker.value = ''; }
  };
  restore.onclick = async () => {
    picker.disabled = restore.disabled = true;
    try { await storage('delete'); display(null); status.textContent = 'Your selected lace-and-armor look is restored.'; }
    catch { status.textContent = 'Could not restore the image. Your previous selection is retained.'; }
    finally { picker.disabled = restore.disabled = false; }
  };
  picker.disabled = restore.disabled = false;
  return section;
}
