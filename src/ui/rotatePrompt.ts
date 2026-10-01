import type { Store } from '../core/store';
import { el, PHONE_UPRIGHT, type Overlay } from './overlay';

/**
 * A phone held upright: the screen dims and asks to be turned. The view is a wide isometric shot
 * and a portrait phone shows a sliver of it, so rather than lay the controls out for a shape
 * nothing else here suits, the app waits.
 *
 * `onUpright` hears every change, and once at the start; main stops the frame loop and holds the
 * audio behind the prompt, as for a hidden tab. Behind it the overlay is inert, so nothing under
 * the dim takes a tap or focus.
 */
export interface RotatePrompt {
  dispose(): void;
}

const ID = 'ui-rotate';

// A phone that turns a quarter anticlockwise under an arrow saying which way. The arrow carries
// the meaning on its own when motion is reduced and the phone stands still.
const ICON = /* html */ `<svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
<path d="M46 10 A18 18 0 0 0 18 12 M18 7 L18 12 L22.7 10.3"/>
<g class="phone"><rect x="21" y="21" width="22" height="36" rx="4"/><path d="M29 25 h6"/></g>
</svg>`;

const CSS = /* css */ `
#${ID} { position: fixed; inset: 0; z-index: 20; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 24px; text-align: center;
  background: rgba(12, 10, 9, 0.78); color: var(--ui-ink); font-family: var(--ui-font); -webkit-font-smoothing: antialiased;
  opacity: 0; visibility: hidden; transition: opacity 240ms ease, visibility 0s linear 240ms; }
#${ID}.is-shown { opacity: 1; visibility: visible; transition: opacity 240ms ease; }
#${ID}:focus { outline: none; }
#${ID} h2 { margin: 4px 0 0; font-size: 18px; font-weight: 600; }
#${ID} p { margin: 0; font-size: 14px; color: var(--ui-ink-dim); }
#${ID} .phone { transform-box: fill-box; transform-origin: center; animation: ui-rotate-turn 2.8s ease-in-out infinite; }
#${ID}.is-calm .phone { animation: none; }
/* Turn, hold, fade, and start again upright while invisible. */
@keyframes ui-rotate-turn {
  0% { opacity: 0; transform: none; }
  10%, 30% { opacity: 1; transform: none; }
  60%, 85% { opacity: 1; transform: rotate(-90deg); }
  100% { opacity: 0; transform: rotate(-90deg); }
}
`;

export function createRotatePrompt(overlay: Overlay, store: Store, onUpright: (upright: boolean) => void): RotatePrompt {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  // Outside #overlay, which goes inert underneath it.
  const node = el('div');
  node.id = ID;
  node.tabIndex = -1;
  node.setAttribute('role', 'dialog');
  node.setAttribute('aria-modal', 'true');
  node.setAttribute('aria-labelledby', `${ID}-title`);
  node.innerHTML = ICON;
  const title = el('h2', undefined, 'Turn your phone sideways');
  title.id = `${ID}-title`;
  node.append(title, el('p', undefined, 'Everything is paused until you do.'));
  document.body.appendChild(node);

  const mq = window.matchMedia(PHONE_UPRIGHT);
  const apply = () => {
    const upright = mq.matches;
    node.classList.toggle('is-shown', upright);
    overlay.root.inert = upright;
    if (upright) node.focus({ preventScroll: true });
    else if (document.activeElement === node) node.blur();
    onUpright(upright);
  };
  mq.addEventListener('change', apply);
  apply();

  const calm = (on: boolean) => node.classList.toggle('is-calm', on);
  calm(store.get().reducedMotion);
  const unsub = store.subscribe('reducedMotion', calm);

  return {
    dispose() {
      mq.removeEventListener('change', apply);
      unsub();
      overlay.root.inert = false;
      node.remove();
      style.remove();
    },
  };
}
