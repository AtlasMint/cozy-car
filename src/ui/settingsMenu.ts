import type { Store } from '../core/store';
import { createMenu } from './menu';
import { el, type Overlay } from './overlay';
import { tip } from './tooltip';

/**
 * The second More menu: everything that is a setting rather than a thing you play with.
 *
 * Reduce motion and Low quality used to be two checkboxes sitting in the bottom-right row,
 * created by the start screen, which owned them for no reason beyond having been written first.
 * They live here now, and the row is three controls shorter.
 */
export function createSettingsMenu(overlay: Overlay, store: Store): { dispose(): void } {
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
  const keys = el('div', 'ui-hint');
  keys.innerHTML = 'Press <span class="ui-kbd">V</span> to change vehicle, <span class="ui-kbd">F</span> to switch between Chill and Focus.';
  menu.body.appendChild(keys);

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
