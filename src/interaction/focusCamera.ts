import type { Store } from '../core/store';
import type { IsoCamera } from '../core/isoCamera';
import type { Registry } from './interactables';
import { INTERACTION } from '../core/constants';

/**
 * Orthographic push-in to an interactable and back, driven by store.focusedObject. Exit on
 * Escape or via whoever clears focusedObject. Parallax is disabled while focused (main reads
 * focusedObject), and engine amplitudes are scaled there too.
 */
export interface FocusCamera {
  /** Resolves when the current transition finishes. */
  readonly transition: Promise<void> | null;
  dispose(): void;
}

export function createFocusCamera(iso: IsoCamera, registry: Registry, store: Store): FocusCamera {
  let current: string | null = null;
  let transition: Promise<void> | null = null;

  const apply = (id: string | null) => {
    if (id === current) return;
    const prev = current ? registry.get(current) : undefined;
    current = id;
    prev?.onBlur?.();
    const next = id ? registry.get(id) : undefined;
    if (next?.focus) {
      next.onFocus?.();
      transition = iso.frame(next.focus.target, next.focus.zoom, INTERACTION.PUSH_IN_MS, next.focus.azimuthOffset ?? 0);
    } else {
      transition = iso.reset(INTERACTION.PUSH_IN_MS);
    }
  };
  const unsub = store.subscribe('focusedObject', apply);
  apply(store.get().focusedObject);

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && store.get().focusedObject) {
      e.preventDefault();
      store.set({ focusedObject: null });
    }
  };
  // Capture phase on window so Escape works even after an iframe has taken focus and given
  // it back; while the iframe itself holds focus, the panel's blur guard re-arms it.
  window.addEventListener('keydown', onKey, true);

  return {
    get transition() {
      return transition;
    },
    dispose() {
      unsub();
      window.removeEventListener('keydown', onKey, true);
    },
  };
}
