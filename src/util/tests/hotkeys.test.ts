import { describe, expect, test } from 'bun:test';
import { hotkeyOf, isTypingTarget, releasedKey, type KeyEventLike, type KeyTarget } from '../../ui/hotkeys';

const el = (tagName: string, isContentEditable = false): KeyTarget => ({ tagName, isContentEditable });
const key = (k: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  key: k,
  code: k === ' ' ? 'Space' : `Key${k.toUpperCase()}`,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  ...mods,
});

describe('typing targets', () => {
  test('are the places text goes', () => {
    expect(isTypingTarget(el('INPUT'))).toBe(true);
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(el('SELECT'))).toBe(true);
    expect(isTypingTarget(el('DIV', true))).toBe(true);
  });

  test('and nothing else', () => {
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(el('CANVAS'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('what counts as a hotkey', () => {
  const canvas = el('CANVAS');

  test('a bare letter or digit does', () => {
    expect(hotkeyOf(key('v'), canvas, canvas)).toBe('v');
    expect(hotkeyOf(key('7'), canvas, canvas)).toBe('7');
  });

  test('case is not part of it', () => {
    // Shift+V is still V: the app has never distinguished them and a caps lock should not
    // silently turn every shortcut off.
    expect(hotkeyOf(key('V'), canvas, canvas)).toBe('v');
  });

  test('a modifier makes it the browser or the OS talking, not us', () => {
    for (const mod of ['metaKey', 'ctrlKey', 'altKey'] as const) {
      expect(hotkeyOf(key('v', { [mod]: true }), canvas, canvas)).toBeNull();
    }
  });

  test('typing into something is never a shortcut', () => {
    // The radio panel's link box is the case this exists for: pasting a Spotify URL types a v.
    expect(hotkeyOf(key('v'), el('INPUT'), el('INPUT'))).toBeNull();
    expect(hotkeyOf(key('v'), el('DIV', true), el('DIV', true))).toBeNull();
  });

  test('a key that is not one character is nobody here', () => {
    expect(hotkeyOf(key('Escape'), canvas, canvas)).toBeNull();
    expect(hotkeyOf(key('ArrowLeft'), canvas, canvas)).toBeNull();
    expect(hotkeyOf(key('?'), canvas, canvas)).toBeNull();
  });
});

describe('the space bar', () => {
  const canvas = el('CANVAS');

  test('is a hotkey when nothing has claimed it', () => {
    expect(hotkeyOf(key(' '), canvas, canvas)).toBe('space');
  });

  test('belongs to the focused control that activates on it', () => {
    // The browser's rule, not ours: taking space from a focused button would break every
    // control on the overlay for anyone driving it from the keyboard.
    for (const tag of ['BUTTON', 'A', 'SUMMARY', 'INPUT', 'TEXTAREA', 'SELECT']) {
      expect(hotkeyOf(key(' '), canvas, el(tag))).toBeNull();
    }
  });

  test('is judged on what has focus, not on where the event landed', () => {
    // A keydown on the body while a button holds focus is still that button's space.
    expect(hotkeyOf(key(' '), el('BODY'), el('BUTTON'))).toBeNull();
  });
});

describe('releasing a key', () => {
  test('is the same name the press had', () => {
    expect(releasedKey({ key: 'h', code: 'KeyH' })).toBe('h');
    expect(releasedKey({ key: 'H', code: 'KeyH' })).toBe('h');
    expect(releasedKey({ key: ' ', code: 'Space' })).toBe('space');
  });

  test('and is decided without any of the guards', () => {
    // A horn held while the pointer lands in a text box must still be able to stop: a keyup
    // that the guards refuse to name is a key that never comes back up.
    const pressed = hotkeyOf(key('h'), el('CANVAS'), el('CANVAS'));
    expect(releasedKey({ key: 'h', code: 'KeyH' })).toBe(pressed!);
    // And it names the key even where a press would have been refused outright.
    expect(hotkeyOf(key('h'), el('INPUT'), el('INPUT'))).toBeNull();
    expect(releasedKey({ key: 'h', code: 'KeyH' })).toBe('h');
  });
});
