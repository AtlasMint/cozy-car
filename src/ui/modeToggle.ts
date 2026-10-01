import { canEnter, MODES, nextMode } from '../core/mode';
import type { Store, Mode } from '../core/store';
import { el, PHONE_SIDEWAYS, type Overlay } from './overlay';
import type { Hotkeys } from './hotkeys';
import { tip } from './tooltip';

/**
 * Three-state control labelled Park / Chill / Focus, styled entirely off `aria-pressed` like
 * the vehicle picker, bound to P and F. The label names the state the user is in; those three
 * words are used identically everywhere.
 *
 * Focus cannot be entered from Park, by key or by click. The button is disabled rather than
 * quietly routed through Chill, because a control that does something other than what it says
 * is worse than one that says no. `canEnter` decides, so the button and the key cannot disagree.
 *
 * While a mode change holds the curtain the group is marked `aria-busy` rather than `disabled`,
 * for the picker's reason: a disabled button loses its focus ring and blurs the user out of the
 * control mid-interaction.
 */
export interface ModeControl {
  setBusy(on: boolean): void;
  dispose(): void;
}

const LABEL: Readonly<Record<Mode, string>> = { park: 'Park', chill: 'Chill', focus: 'Focus' };
const TIP: Readonly<Record<Mode, string>> = {
  park: 'Engine off, in an empty lot. Press P.',
  chill: 'Roadside, engine idling. Press F.',
  focus: 'The world scrolls past. Press F from Chill.',
};
const FOCUS_FROM_PARK = 'Pull out first — F';
/** The start screen's one line of copy, at a tenth of the size, for as long as it is needed. */
const HINT = window.matchMedia('(pointer: coarse)').matches
  ? 'Tap Chill to start the engine and pull out.'
  : 'Press F to start the engine and pull out.';

const CSS = /* css */ `
#overlay .ui-mode { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
#overlay .ui-mode-hint { padding: 0 6px; text-align: right; }
#overlay .ui-mode-hint[hidden] { display: none; }
#overlay .ui-seg button[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
#overlay .ui-seg button[aria-disabled="true"]:hover { background: transparent; }
/* On a phone on its side the controls are one row, and the hint is wider than the buttons it
   explains; standing in the row it would push the row onto two lines. */
@media ${PHONE_SIDEWAYS} {
  #overlay .ui-mode { position: relative; }
  #overlay .ui-mode-hint { position: absolute; right: 0; bottom: calc(100% + 6px); white-space: nowrap; }
}
`;

let cssInjected = false;

export function createModeToggle(overlay: Overlay, store: Store, hotkeys: Hotkeys): ModeControl {
  if (!cssInjected) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    cssInjected = true;
  }
  const wrap = el('div', 'ui-mode');
  const hint = el('div', 'ui-hint ui-mode-hint', HINT);
  const seg = el('div', 'ui-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Mode');
  // The swap is about a second and mostly visual, so announce it, as the picker does.
  const status = el('span');
  status.setAttribute('role', 'status');
  status.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';

  const buttons = new Map<Mode, HTMLButtonElement>();
  const untips: (() => void)[] = [];
  for (const mode of MODES) {
    const b = el('button', undefined, LABEL[mode]);
    b.type = 'button';
    untips.push(tip(b, mode === 'focus' ? () => (store.get().mode === 'park' ? FOCUS_FROM_PARK : TIP.focus) : TIP[mode]));
    b.addEventListener('click', () => {
      if (seg.getAttribute('aria-busy') === 'true') return;
      if (!canEnter(store.get().mode, mode)) return;
      store.set({ mode });
    });
    buttons.set(mode, b);
    seg.appendChild(b);
  }
  seg.appendChild(status);
  wrap.append(hint, seg);
  overlay.controls.appendChild(wrap);

  // The hint is for someone who has never pulled out this session. Once they have, they know.
  let departed = false;
  const render = (mode: Mode) => {
    if (mode !== 'park') departed = true;
    for (const [m, b] of buttons) {
      b.setAttribute('aria-pressed', String(m === mode));
      b.setAttribute('aria-disabled', String(!canEnter(mode, m) && m !== mode));
    }
    hint.hidden = !(mode === 'park' && !departed);
  };
  render(store.get().mode);
  const unsub = store.subscribe('mode', render);

  const press = (key: 'p' | 'f') => {
    if (seg.getAttribute('aria-busy') === 'true') return;
    const next = nextMode(key, store.get().mode);
    if (next === null) return;
    store.set({ mode: next });
    status.textContent = next === 'park' ? 'Parking' : next === 'chill' ? 'Pulling out' : 'Driving';
  };
  const unbind = [
    hotkeys.register({ key: 'p', label: 'P', hint: 'Park', onDown: () => press('p') }),
    hotkeys.register({ key: 'f', label: 'F', hint: 'Pull out, or Chill ⇄ Focus', onDown: () => press('f') }),
  ];

  return {
    setBusy(on) {
      seg.setAttribute('aria-busy', String(on));
      if (!on) status.textContent = '';
    },
    dispose() {
      unsub();
      for (const u of untips) u();
      for (const u of unbind) u();
      wrap.remove();
    },
  };
}
