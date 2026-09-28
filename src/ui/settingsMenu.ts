import type { Store } from '../core/store';
import type { Hotkeys } from './hotkeys';
import { createMenu } from './menu';
import { el, type Overlay } from './overlay';
import { tip } from './tooltip';

/**
 * The second More menu: everything that is a setting rather than a thing you play with.
 *
 * Reduce motion and Low quality used to be two checkboxes sitting in the bottom-right row,
 * created by the start screen, which owned them for no reason beyond having been written first.
 * They live here now, and the row is three controls shorter.
 *
 * The shortcut list is the hotkey registry read back rather than a sentence kept in step by
 * hand, and it is drawn each time the menu opens — this control is built before most of the
 * keys are bound, and the keys a vehicle brings with it are not the same on every vehicle.
 */
const CSS = /* css */ `
#overlay .ui-keys { display: flex; flex-direction: column; gap: 6px; }
#overlay .ui-keys div { display: grid; grid-template-columns: 26px 1fr; align-items: center; gap: 10px; font-size: 13px; }
#overlay .ui-keys .ui-kbd { justify-self: start; }
`;

let cssInjected = false;

export function createSettingsMenu(overlay: Overlay, store: Store, hotkeys: Hotkeys): { dispose(): void } {
  if (!cssInjected) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    cssInjected = true;
  }
  const host = el('div');
  overlay.controls.appendChild(host);
  const menu = createMenu(host, { label: 'More settings', align: 'right' });
  // This one stands on its own rather than inside a pill, so it brings its own.
  menu.trigger.classList.add('ui-icon-solo');

  const check = (label: string, get: () => boolean, set: (on: boolean) => void, hint: string) => {
    const wrap = el('label', 'ui-check');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = get();
    wrap.append(input, document.createTextNode(label));
    input.addEventListener('change', () => set(input.checked));
    menu.body.appendChild(wrap);
    return { input, untip: tip(wrap, hint) };
  };

  menu.body.appendChild(el('h3', undefined, 'Settings'));
  const motion = check(
    'Reduce motion',
    () => store.get().reducedMotion,
    (on) => store.set({ reducedMotion: on }),
    'Calms the shake, the sway and the camera drift',
  );
  const quality = check(
    'Low quality',
    () => store.get().quality === 'low',
    (on) => store.set({ quality: on ? 'low' : 'high' }),
    'Fewer raindrops, softer shadows, less clutter in the cabin',
  );

  menu.body.appendChild(el('hr'));
  menu.body.appendChild(el('h3', undefined, 'Shortcuts'));
  const keys = el('div', 'ui-keys');
  menu.body.appendChild(keys);
  const paintKeys = () => {
    keys.replaceChildren();
    for (const s of hotkeys.shortcuts()) {
      const row = el('div');
      row.append(el('span', 'ui-kbd', s.label), el('span', 'ui-hint', s.hint));
      keys.appendChild(row);
    }
  };
  paintKeys();
  // The menu's own handler runs first and opens it; this repaint lands in the same task, so
  // nothing is ever on screen stale.
  menu.trigger.addEventListener('click', paintKeys);

  const unsubs = [
    store.subscribe('reducedMotion', (v) => (motion.input.checked = v)),
    store.subscribe('quality', (q) => (quality.input.checked = q === 'low')),
  ];
  const untipTrigger = tip(menu.trigger, 'Motion, quality and keyboard shortcuts');

  return {
    dispose() {
      for (const u of unsubs) u();
      motion.untip();
      quality.untip();
      untipTrigger();
      menu.dispose();
      host.remove();
    },
  };
}
