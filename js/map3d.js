// map3d.js - the 3D Station map inside the Station tab (ES Module).
// It downloads only after a tap, and is removed on leaving the tab to free the phone's memory.
// The flat map stays underneath as the fallback. No credentials, no em-dashes.

const OPENED_KEY = 'station-map3d-opened';
const DOWNLOAD_NOTE = 'The first time downloads about 20 MB.';

let holder = null;
let frame = null;
let toggle = null;
let confirmBox = null;
let wantsFlat = false;

function readOpened() {
  try { return localStorage.getItem(OPENED_KEY) === '1'; } catch { return false; }
}

function saveOpened() {
  try { localStorage.setItem(OPENED_KEY, '1'); } catch { /* the choice is only a convenience */ }
}

function closeConfirm() {
  if (confirmBox) confirmBox.remove();
  confirmBox = null;
}

function setLabel() {
  if (toggle) toggle.textContent = frame ? 'Flat map' : '3D Map';
}

function openFrame() {
  closeConfirm();
  wantsFlat = false;
  saveOpened();
  if (frame) return;
  frame = document.createElement('iframe');
  frame.id = 'station-map3d';
  frame.title = 'Station 3D map';
  frame.src = 'map3d/index.html';
  holder.append(frame);
  setLabel();
}

function closeFrame() {
  if (frame) frame.remove();
  frame = null;
  setLabel();
}

function askFirst() {
  if (confirmBox) return;
  confirmBox = document.createElement('div');
  confirmBox.className = 'map3d-confirm';
  const text = document.createElement('p');
  text.textContent = DOWNLOAD_NOTE;
  const open = document.createElement('button');
  open.type = 'button';
  open.textContent = 'Open 3D Map';
  open.addEventListener('click', openFrame);
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = 'Not now';
  cancel.addEventListener('click', closeConfirm);
  confirmBox.append(text, open, cancel);
  holder.append(confirmBox);
}

function onToggle() {
  if (frame) {
    wantsFlat = true;
    closeFrame();
  } else if (readOpened()) {
    openFrame();
  } else {
    askFirst();
  }
}

export function enterMap3d() {
  holder = document.getElementById('station-main');
  if (!holder) return;
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'map3d-toggle';
    toggle.addEventListener('click', onToggle);
    holder.append(toggle);
  }
  if (readOpened() && !wantsFlat) openFrame();
  setLabel();
}

export function leaveMap3d() {
  closeConfirm();
  closeFrame();
}
