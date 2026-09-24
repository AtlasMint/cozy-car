/**
 * Tooltips for the overlay's controls.
 *
 * `title` was doing this job on three controls and doing it badly: about a second of delay, no
 * styling, and nothing at all for keyboard users until focus happens to linger. This shows after
 * a short hover, immediately on keyboard focus — someone tabbing has already asked the question
 * — and never on a coarse pointer, where there is no hover and a tooltip is just a popup in the
 * way.
 *
 * One bubble is shared by every caller: only one control can be described at a time anyway.
 */
const COARSE = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const HOVER_DELAY_MS = 350;
const BUBBLE_ID = 'ui-tip';

const CSS = /* css */ `
#${BUBBLE_ID} { position: fixed; z-index: 10; max-width: 240px; padding: 6px 10px; border-radius: 9px;
  background: var(--ui-bg-strong, rgba(22,18,16,0.9)); border: 1px solid var(--ui-line, rgba(242,227,201,0.28));
  color: var(--ui-ink, #f2e3c9); font-family: var(--ui-font, system-ui); font-size: 13px; line-height: 1.3;
  pointer-events: none; opacity: 0; transform: translateY(3px); transition: opacity 120ms ease, transform 120ms ease;
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
#${BUBBLE_ID}.is-shown { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) { #${BUBBLE_ID} { transition: none; transform: none; } }
`;

let bubble: HTMLElement | null = null;
let shownFor: HTMLElement | null = null;

function ensureBubble(): HTMLElement {
  if (bubble) return bubble;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  bubble = document.createElement('div');
  bubble.id = BUBBLE_ID;
  bubble.setAttribute('role', 'tooltip');
  document.body.appendChild(bubble);
  return bubble;
}

function place(target: HTMLElement) {
  const b = ensureBubble();
  const r = target.getBoundingClientRect();
  // Measured after the text is in, so the width is the real one.
  const bw = b.offsetWidth;
  const bh = b.offsetHeight;
  let left = r.left + r.width / 2 - bw / 2;
  left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
  // Above by default — every control that has one of these lives at the bottom of the screen.
  let top = r.top - bh - 8;
  if (top < 8) top = r.bottom + 8;
  b.style.left = `${Math.round(left)}px`;
  b.style.top = `${Math.round(top)}px`;
}

function hideTip() {
  if (!bubble || !shownFor) return;
  bubble.classList.remove('is-shown');
  shownFor.removeAttribute('aria-describedby');
  shownFor = null;
}

function showTip(target: HTMLElement, text: string) {
  if (!text) return;
  const b = ensureBubble();
  b.textContent = text;
  shownFor = target;
  target.setAttribute('aria-describedby', BUBBLE_ID);
  place(target);
  b.classList.add('is-shown');
}

/**
 * Describe a control. `text` may be a function when the label changes with state, as the mute
 * button's does. Returns a teardown.
 */
export function tip(target: HTMLElement, text: string | (() => string)): () => void {
  // The native tooltip would otherwise render underneath this one.
  target.removeAttribute('title');
  if (COARSE) return () => {};
  const read = () => (typeof text === 'function' ? text() : text);

  let timer = 0;
  const clear = () => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
  };
  const onEnter = () => {
    clear();
    timer = window.setTimeout(() => showTip(target, read()), HOVER_DELAY_MS);
  };
  const onLeave = () => {
    clear();
    if (shownFor === target) hideTip();
  };
  const onFocus = () => {
    // Only for keyboard focus. A click focuses too, and a bubble over the thing you just
    // clicked is noise.
    if (!target.matches(':focus-visible')) return;
    clear();
    showTip(target, read());
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && shownFor === target) hideTip();
  };

  target.addEventListener('pointerenter', onEnter);
  target.addEventListener('pointerleave', onLeave);
  target.addEventListener('pointerdown', onLeave);
  target.addEventListener('focus', onFocus);
  target.addEventListener('blur', onLeave);
  target.addEventListener('keydown', onKey);

  return () => {
    clear();
    if (shownFor === target) hideTip();
    target.removeEventListener('pointerenter', onEnter);
    target.removeEventListener('pointerleave', onLeave);
    target.removeEventListener('pointerdown', onLeave);
    target.removeEventListener('focus', onFocus);
    target.removeEventListener('blur', onLeave);
    target.removeEventListener('keydown', onKey);
  };
}
