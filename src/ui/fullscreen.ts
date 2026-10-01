import { el, PHONE_SIDEWAYS, type Overlay } from './overlay';

/**
 * Full screen, on a phone on its side. The browser's bars take a good part of a landscape
 * phone's height, so the first time it is sideways the screen dims and offers to hide them, and
 * while they are hidden a button in the top-right corner brings them back.
 *
 * Asked once a visit. Whatever the answer, and however full screen later ends — that button, or
 * the system's own back gesture — it is not offered again until the page is reloaded.
 *
 * Only where a page can go full screen at all. An iPhone's browser cannot, so it is never asked.
 */
export interface Fullscreen {
  dispose(): void;
}

const icon = (d: string) =>
  `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
const EXPAND = 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5';
const COLLAPSE = 'M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5';

const CSS = /* css */ `
#overlay .ui-corner.top { top: max(12px, env(safe-area-inset-top)); bottom: auto; right: max(12px, env(safe-area-inset-right)); }
#overlay .ui-corner.top [hidden] { display: none; }
#overlay .ui-fs-ask { position: absolute; inset: 0; z-index: 5; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 24px; text-align: center;
  background: rgba(12, 10, 9, 0.78); pointer-events: auto; opacity: 0; visibility: hidden; transition: opacity 240ms ease, visibility 0s linear 240ms; }
#overlay .ui-fs-ask.is-shown { opacity: 1; visibility: visible; transition: opacity 240ms ease; }
#overlay .ui-fs-ask h2 { margin: 0; font-size: 18px; font-weight: 600; }
#overlay .ui-fs-ask p { margin: 0; max-width: 34ch; font-size: 14px; color: var(--ui-ink-dim); }
#overlay .ui-fs-ask .row { display: flex; gap: 10px; margin-top: 6px; }
#overlay .ui-fs-ask .row button { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; }
#overlay .ui-fs-ask .go { background: var(--ui-accent); color: #22201f; border-color: var(--ui-accent); }
`;

export function createFullscreen(overlay: Overlay): Fullscreen {
  if (!document.fullscreenEnabled) return { dispose() {} };
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const ask = el('div', 'ui-fs-ask');
  ask.setAttribute('role', 'dialog');
  ask.setAttribute('aria-modal', 'true');
  ask.setAttribute('aria-labelledby', 'ui-fs-title');
  const title = el('h2', undefined, 'Play full screen?');
  title.id = 'ui-fs-title';
  const go = el('button', 'go');
  go.type = 'button';
  go.innerHTML = `${icon(EXPAND)}<span>Full screen</span>`;
  const later = el('button', undefined, 'Not now');
  later.type = 'button';
  const row = el('div', 'row');
  row.append(go, later);
  ask.append(title, el('p', undefined, "Hides the browser's bars. The button in the top corner brings them back."), row);

  // A corner of its own, so it steps aside with the others while the radio is open.
  const corner = el('div', 'ui-corner top');
  const exit = el('button', 'ui-icon ui-icon-solo');
  exit.type = 'button';
  exit.innerHTML = icon(COLLAPSE);
  exit.setAttribute('aria-label', 'Exit full screen');
  corner.appendChild(exit);
  overlay.root.append(corner, ask);

  const sideways = window.matchMedia(PHONE_SIDEWAYS);
  let asked = false;
  const update = () => {
    const full = document.fullscreenElement !== null;
    exit.hidden = !(full && sideways.matches);
    const asking = sideways.matches && !full && !asked;
    const opening = asking && !ask.classList.contains('is-shown');
    ask.classList.toggle('is-shown', asking);
    // A frame later: turning from upright, the rotate prompt may not have let go of the overlay yet.
    if (opening) requestAnimationFrame(() => go.focus({ preventScroll: true }));
  };
  const answer = () => {
    asked = true;
    update();
  };

  // Synchronous in the click: full screen is only granted inside the gesture that asked for it.
  go.addEventListener('click', () => {
    answer();
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch((err) => console.warn('[fullscreen]', err));
  });
  later.addEventListener('click', answer);
  exit.addEventListener('click', () => void document.exitFullscreen().catch(() => {}));
  document.addEventListener('fullscreenchange', update);
  sideways.addEventListener('change', update);
  update();

  return {
    dispose() {
      document.removeEventListener('fullscreenchange', update);
      sideways.removeEventListener('change', update);
      corner.remove();
      ask.remove();
      style.remove();
    },
  };
}
