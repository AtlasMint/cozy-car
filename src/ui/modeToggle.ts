import type { Store, Mode } from '../core/store';
import { el, type Overlay } from './overlay';

/**
 * Two-state control labelled Chill / Focus. Keyboard accessible, aria-pressed, bound to F.
 * The label names the state the user is in; those two words are used identically everywhere.
 */
export function createModeToggle(overlay: Overlay, store: Store): { dispose(): void } {
  const seg = el('div', 'ui-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Mode');
  const buttons = new Map<Mode, HTMLButtonElement>();
  for (const mode of ['chill', 'focus'] as Mode[]) {
    const b = el('button', undefined, mode === 'chill' ? 'Chill' : 'Focus');
    b.type = 'button';
    b.title = mode === 'chill' ? 'Parked, engine idling' : 'Driving — press F to toggle';
    b.addEventListener('click', () => store.set({ mode }));
    buttons.set(mode, b);
    seg.appendChild(b);
  }
  const render = (mode: Mode) => {
    for (const [m, b] of buttons) b.setAttribute('aria-pressed', String(m === mode));
  };
  render(store.get().mode);
  const unsub = store.subscribe('mode', render);
  overlay.controls.appendChild(seg);

  const onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 'f' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    store.set({ mode: store.get().mode === 'chill' ? 'focus' : 'chill' });
  };
  window.addEventListener('keydown', onKey);

  return {
    dispose() {
      unsub();
      window.removeEventListener('keydown', onKey);
      seg.remove();
    },
  };
}
