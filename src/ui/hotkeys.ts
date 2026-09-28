/**
 * One place where a key press becomes an action.
 *
 * Every control used to bring its own `window.addEventListener('keydown', …)` and its own copy
 * of the same guards: no modifiers, not while someone is typing, not while the key belongs to
 * the control that has focus. Three copies were three chances to disagree, and the shortcut
 * line in the settings menu was a fourth — a sentence someone had to remember to edit.
 *
 * So the guards live here once and the list of shortcuts is the registry read back. A key that
 * is not registered cannot be advertised, and one registered without a label is deliberately
 * unadvertised: the tank and its gun are things you have to be told about.
 */

/** The little of an element this module needs, so the rules above can be tested without a DOM. */
export interface KeyTarget {
  tagName: string;
  isContentEditable: boolean;
}

/** The little of a KeyboardEvent the rules read. */
export interface KeyEventLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}

export interface HotkeySpec {
  /** A single letter or digit, lower case, or 'space'. See `hotkeyOf`. */
  key: string;
  /** How the key is drawn in the shortcut list. Absent keeps it off the list entirely. */
  label?: string;
  /** What it does, in the list. Only read when there is a label. */
  hint?: string;
  /**
   * Returning false means "not mine after all" and leaves the press to the browser. It only
   * matters for the space bar, the one key here the page itself has a use for: a handler that
   * declines keeps space scrolling whatever is under it.
   */
  onDown(): boolean | void;
  /** Held keys — the horn. Also fires if the window loses focus mid-press. */
  onUp?(): void;
  /** Auto-repeat is for typing. Off unless the key really wants to fire while held down. */
  repeat?: boolean;
}

export interface Shortcut {
  key: string;
  label: string;
  hint: string;
}

export interface Hotkeys {
  /** Bind a key. The returned function unbinds it, and releases it first if it is held. */
  register(spec: HotkeySpec): () => void;
  /** Every registered key carrying a label, in the order they were bound. */
  shortcuts(): readonly Shortcut[];
  dispose(): void;
}

/** Somewhere text goes. A shortcut must never eat a character someone meant to type. */
export function isTypingTarget(t: KeyTarget | null): boolean {
  if (!t) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

/** Controls that do something with the space bar themselves. It is theirs while they have focus. */
const TAKES_SPACE = ['BUTTON', 'A', 'SUMMARY'];

/**
 * Which hotkey this event is, or null for none. Pure, because this is the whole rule about what
 * a shortcut is allowed to interrupt and it is worth being able to state it in one place.
 *
 * `target` is where the event landed; `active` is what has focus. They are usually the same, and
 * the space bar is why they are both here: a keydown inside the overlay lands on the focused
 * button, and taking space away from it would break every button on the page for keyboard users.
 */
export function hotkeyOf(e: KeyEventLike, target: KeyTarget | null, active: KeyTarget | null): string | null {
  if (e.metaKey || e.ctrlKey || e.altKey) return null;
  if (isTypingTarget(target)) return null;
  if (e.code === 'Space') {
    if (isTypingTarget(active) || (active !== null && TAKES_SPACE.includes(active.tagName))) return null;
    return 'space';
  }
  const k = e.key.toLowerCase();
  return /^[a-z0-9]$/.test(k) ? k : null;
}

/** What a keyup releases. No guards: a key held down must always be able to come back up. */
export function releasedKey(e: Pick<KeyEventLike, 'key' | 'code'>): string {
  return e.code === 'Space' ? 'space' : e.key.toLowerCase();
}

export function createHotkeys(): Hotkeys {
  const specs = new Map<string, HotkeySpec>();
  const order: string[] = [];
  const held = new Set<string>();

  const release = (key: string) => {
    if (!held.delete(key)) return;
    specs.get(key)?.onUp?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const key = hotkeyOf(e, e.target as KeyTarget | null, document.activeElement as KeyTarget | null);
    if (key === null) return;
    const spec = specs.get(key);
    if (!spec) return;
    if (e.repeat && !spec.repeat) return;
    held.add(key);
    // Only once we know it was handled: otherwise this eats the page's own space bar.
    if (spec.onDown() !== false && key === 'space') e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => release(releasedKey(e));
  // A key held while the window loses focus never sends its keyup. Without this the horn would
  // still be sounding when you came back.
  const onBlur = () => {
    for (const key of [...held]) release(key);
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    register(spec) {
      if (specs.has(spec.key)) console.warn(`[hotkeys] ${spec.key} was already bound; the new binding wins`);
      else order.push(spec.key);
      specs.set(spec.key, spec);
      return () => {
        if (specs.get(spec.key) !== spec) return; // someone else owns it now
        release(spec.key);
        specs.delete(spec.key);
        order.splice(order.indexOf(spec.key), 1);
      };
    },
    shortcuts() {
      const out: Shortcut[] = [];
      for (const key of order) {
        const spec = specs.get(key);
        if (spec?.label) out.push({ key, label: spec.label, hint: spec.hint ?? '' });
      }
      return out;
    },
    dispose() {
      onBlur();
      specs.clear();
      order.length = 0;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    },
  };
}
