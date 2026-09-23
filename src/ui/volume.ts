import { AUDIO } from '../core/constants';
import type { Store } from '../core/store';
import { el, type Overlay } from './overlay';

/**
 * Bottom-right volume control: a mute button and a slider, both reading and writing the one
 * value `store.masterVolume`.
 *
 * Mute is not a separate flag. Muted *is* zero, so the slider always shows the level you are
 * actually hearing and there is no second state to keep in step with it — which also makes
 * dragging the slider to zero a mute, for free and by construction. The only thing the button
 * remembers is where to come back to.
 */
const ICON_ON = /* html */ `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
<path d="M4 9.4h3.3L12 5.4v13.2l-4.7-4H4z" fill="currentColor"/>
<path d="M15.4 9.3a3.9 3.9 0 0 1 0 5.4M18.1 6.8a7.5 7.5 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`;

const ICON_MUTED = /* html */ `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
<path d="M4 9.4h3.3L12 5.4v13.2l-4.7-4H4z" fill="currentColor"/>
<path d="M15.8 9.6l4.8 4.8M20.6 9.6l-4.8 4.8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
</svg>`;

export function createVolumeControl(overlay: Overlay, store: Store): { dispose(): void } {
  // A div, not a label: a button inside a label forwards its activation to the labelled
  // control, which would make every click on the speaker also grab the slider.
  const wrap = el('div', 'ui-range');
  const button = el('button', 'ui-icon');
  button.type = 'button';
  const input = el('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1';
  input.step = '0.01';
  input.setAttribute('aria-label', 'Volume');
  wrap.append(button, input);
  overlay.controls.appendChild(wrap);

  // Where un-muting returns to. Seeded from the boot level so a page that loads muted still
  // un-mutes to something audible.
  let restore = store.get().masterVolume || AUDIO.DEFAULT_VOLUME;

  const render = (v: number) => {
    const muted = v <= 0;
    input.value = String(v);
    button.innerHTML = muted ? ICON_MUTED : ICON_ON;
    const label = muted ? 'Unmute' : 'Mute';
    button.setAttribute('aria-label', label);
    button.title = label;
  };

  input.addEventListener('input', () => {
    const v = Number(input.value);
    // Dragging to zero is a mute, so it must not overwrite the level to come back to.
    if (v > 0) restore = v;
    store.set({ masterVolume: v });
  });

  button.addEventListener('click', () => {
    const v = store.get().masterVolume;
    if (v > 0) {
      restore = v;
      store.set({ masterVolume: 0 });
    } else {
      store.set({ masterVolume: restore > 0 ? restore : AUDIO.DEFAULT_VOLUME });
    }
  });

  render(store.get().masterVolume);
  const unsub = store.subscribe('masterVolume', render);
  return {
    dispose() {
      unsub();
      wrap.remove();
    },
  };
}
