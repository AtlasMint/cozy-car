import { AUDIO } from '../core/constants';
import { BUS_LABEL, BUS_NAMES, BUS_STORE_KEY, type Bus } from '../audio/mixer';
import type { AppState, Store } from '../core/store';
import { createMenu, menuRow } from './menu';
import { el, type Overlay } from './overlay';
import { tip } from './tooltip';

/** What each group holds, said where the slider for it is. */
const BUS_TIP: Readonly<Record<Bus, string>> = {
  engine: 'Engine, exhaust and tyres',
  weather: 'Rain, wind and thunder',
  ambience: 'The world outside the car',
  music: "The radio. Spotify's own volume lives inside its player.",
};

/**
 * Bottom-right volume control: a mute button, a slider for everything, and a More menu holding
 * one slider per group. The main slider is the output level; the menu is the balance.
 *
 * Mute is not a separate flag. Muted *is* zero, so the slider always shows the level you are
 * actually hearing and there is no second state to keep in step with it — which also makes
 * dragging the slider to zero a mute, for free and by construction. The only thing the button
 * remembers is where to come back to.
 */

/** Muted is simply zero. There is no second flag that could disagree with the slider. */
export function isMuted(volume: number): boolean {
  return volume <= 0;
}

/**
 * Pressing the speaker: where the volume goes, and what to remember for next time. Pure.
 *
 * `restore` is only ever written from a non-zero level, so dragging the slider to zero and
 * then pressing un-mute returns you to where you were before you dragged, not to zero.
 */
export function toggleMute(current: number, restore: number): { volume: number; restore: number } {
  if (!isMuted(current)) return { volume: 0, restore: current };
  return { volume: restore > 0 ? restore : AUDIO.DEFAULT_VOLUME, restore };
}

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

  // The balance, behind More. Anchored to the right of the pill so it cannot run off screen.
  const menu = createMenu(wrap, { label: 'Sound balance', align: 'right' });
  menu.body.appendChild(el('h3', undefined, 'Balance'));
  const unsubs: (() => void)[] = [];
  const untips: (() => void)[] = [tip(menu.trigger, 'Balance the engine, weather, ambience and music')];
  for (const bus of BUS_NAMES) {
    const key = BUS_STORE_KEY[bus];
    const slider = el('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.01';
    slider.setAttribute('aria-label', `${BUS_LABEL[bus]} volume`);
    const readout = el('span', 'ui-hint');
    const paint = (v: number) => {
      slider.value = String(v);
      readout.textContent = `${Math.round(v * 100)}%`;
    };
    paint(store.get()[key]);
    slider.addEventListener('input', () => store.set({ [key]: Number(slider.value) } as Partial<AppState>));
    unsubs.push(store.subscribe(key, paint));
    untips.push(tip(slider, BUS_TIP[bus]));
    menu.body.appendChild(menuRow(BUS_LABEL[bus], slider, readout));
  }

  // Where un-muting returns to. Seeded from the boot level so a page that loads muted still
  // un-mutes to something audible.
  let restore = store.get().masterVolume || AUDIO.DEFAULT_VOLUME;

  const render = (v: number) => {
    const muted = isMuted(v);
    input.value = String(v);
    button.innerHTML = muted ? ICON_MUTED : ICON_ON;
    button.setAttribute('aria-label', muted ? 'Unmute' : 'Mute');
  };

  input.addEventListener('input', () => {
    const v = Number(input.value);
    // Dragging to zero is a mute, so it must not overwrite the level to come back to.
    if (v > 0) restore = v;
    store.set({ masterVolume: v });
  });

  button.addEventListener('click', () => {
    const next = toggleMute(store.get().masterVolume, restore);
    restore = next.restore;
    store.set({ masterVolume: next.volume });
  });

  render(store.get().masterVolume);
  const unsub = store.subscribe('masterVolume', render);
  untips.push(
    tip(button, () => (isMuted(store.get().masterVolume) ? 'Unmute' : 'Mute everything')),
    tip(input, 'Overall volume. Balance the groups under the dots.'),
  );
  return {
    dispose() {
      unsub();
      for (const u of unsubs) u();
      for (const u of untips) u();
      menu.dispose();
      wrap.remove();
    },
  };
}
