// cas-card.js - the message card drops away while Chris reads, and comes back when pressed.
// ES Module. No em-dashes. Phone layout only: wide screens have room for both.

const TUCKED = 'cas-card-tucked';
const PHONE = '(max-width: 959px)';
const MOVE_PX = 16;           // a real scroll, not a shaky tap
const INPUT_WINDOW_MS = 300;  // new replies scroll the list too, and must not hide the card
const OPEN_MS = 280;          // matches the slide in features.css
const FOLLOW_GAP_PX = 80;

/** True when the reader is at the end of the conversation, so new text should follow. */
export function nearBottom(list) {
  return !list || list.scrollHeight - list.scrollTop - list.clientHeight < FOLLOW_GAP_PX;
}

/** Wire up the card. Call once, after the panels inside it exist. */
export function initCasCard() {
  const area = document.getElementById('cas-composer-area');
  const body = document.getElementById('cas-card-body');
  const handle = document.getElementById('cas-card-handle');
  const note = document.getElementById('cas-card-note');
  const messages = document.getElementById('cas-messages');
  const status = document.getElementById('cas-status');
  const textarea = document.getElementById('cas-textarea');
  if (!area || !body || !handle || !note || !messages || !status || !textarea || area.dataset.cardReady) return;
  area.dataset.cardReady = '1';

  const phone = window.matchMedia(PHONE);
  let lastInput = -Infinity;
  let lastTop = messages.scrollTop;
  let moved = 0;

  const isTucked = () => area.classList.contains(TUCKED);

  // What Chris would otherwise miss while the card is away.
  function refreshNote() {
    const asking = !!body.querySelector('.cas-project-ask');
    note.textContent = asking ? 'Cas has a question for you'
      : status.textContent.trim() || (textarea.value.trim() ? 'Your draft is saved here' : '');
    handle.classList.toggle('cas-card-attention', asking);
  }

  function tuck() {
    if (document.activeElement === textarea) textarea.blur();
    refreshNote();
    area.classList.add(TUCKED);
    handle.setAttribute('aria-expanded', 'false');
  }

  function open() {
    const keepAtEnd = nearBottom(messages);
    area.classList.remove(TUCKED);
    handle.setAttribute('aria-expanded', 'true');
    if (!keepAtEnd) return;
    const end = performance.now() + OPEN_MS;
    const hold = () => {
      messages.scrollTop = messages.scrollHeight;
      if (performance.now() < end) requestAnimationFrame(hold);
    };
    hold();
  }

  const sawInput = () => { lastInput = performance.now(); };
  messages.addEventListener('touchstart', () => { moved = 0; lastTop = messages.scrollTop; }, { passive: true });
  messages.addEventListener('touchmove', sawInput, { passive: true });
  messages.addEventListener('wheel', sawInput, { passive: true });
  messages.addEventListener('scroll', () => {
    const step = Math.abs(messages.scrollTop - lastTop);
    lastTop = messages.scrollTop;
    if (isTucked() || !phone.matches || performance.now() - lastInput > INPUT_WINDOW_MS) {
      moved = 0;
      return;
    }
    moved += step;
    if (moved >= MOVE_PX) tuck();
  }, { passive: true });

  handle.addEventListener('click', open);
  new MutationObserver(refreshNote).observe(body, { childList: true, subtree: true, characterData: true });
}
