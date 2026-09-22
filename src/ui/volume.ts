import type { Store } from '../core/store';
import { el, type Overlay } from './overlay';

/** Bottom-right volume slider bound to store.masterVolume. */
export function createVolumeControl(overlay: Overlay, store: Store): { dispose(): void } {
  const wrap = el('label', 'ui-range');
  const text = el('span', 'ui-hint', 'Volume');
  const input = el('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.value = String(store.get().masterVolume);
  input.setAttribute('aria-label', 'Volume');
  wrap.append(text, input);
  overlay.controls.appendChild(wrap);
  input.addEventListener('input', () => store.set({ masterVolume: Number(input.value) }));
  const unsub = store.subscribe('masterVolume', (v) => (input.value = String(v)));
  return {
    dispose() {
      unsub();
      wrap.remove();
    },
  };
}
