import type { Store } from '../core/store';
import { el, type Overlay } from './overlay';

/**
 * The gesture gate. The app opens on a still, silent, engine-off diorama with one control.
 * Web Audio needs a user gesture anyway, so it is diegetic rather than apologetic.
 */
export function createStartScreen(overlay: Overlay, store: Store): { dispose(): void } {
  const screen = el('div', 'start');
  const inner = el('div', 'start-inner');
  const button = el('button', undefined, 'Start the engine');
  button.type = 'button';
  button.setAttribute('aria-label', 'Start the engine');
  const hint = el('div', 'ui-hint', 'A small car, idling in your weather. Nothing to drive; just sit behind them.');
  inner.append(button, hint);
  screen.appendChild(inner);
  overlay.centre.appendChild(screen);

  // Reduce-motion toggle lives in the bottom-right cluster and mirrors the store flag.
  const check = el('label', 'ui-check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = store.get().reducedMotion;
  check.append(input, document.createTextNode('Reduce motion'));
  overlay.controls.appendChild(check);
  input.addEventListener('change', () => store.set({ reducedMotion: input.checked }));
  const unsub = store.subscribe('reducedMotion', (v) => (input.checked = v));

  const start = () => {
    if (store.get().engineOn) return;
    store.set({ engineOn: true });
    screen.classList.add('is-hidden');
    button.disabled = true;
    screen.addEventListener('transitionend', () => screen.remove(), { once: true });
    setTimeout(() => screen.remove(), 900);
  };
  button.addEventListener('click', start);
  button.focus({ preventScroll: true });

  return {
    dispose() {
      unsub();
      screen.remove();
      check.remove();
    },
  };
}
