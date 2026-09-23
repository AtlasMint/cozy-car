import { describe, expect, test } from 'bun:test';
import { loadPrefs, sanitizePrefs, savePrefs, PERSIST_KEY } from '../../core/persist';

describe('prefs persistence', () => {
  test('sanitize drops malformed values and clamps volume', () => {
    expect(sanitizePrefs({ mode: 'focus', vehicle: 'spaceship', masterVolume: 1.7, reducedMotion: 'yes', quality: 'ultra' })).toEqual({ mode: 'focus', masterVolume: 1 });
    expect(sanitizePrefs({ vehicle: 'van' })).toEqual({ vehicle: 'van' });
    expect(sanitizePrefs(null)).toEqual({});
    expect(sanitizePrefs('nope')).toEqual({});
    expect(sanitizePrefs({ masterVolume: NaN })).toEqual({});
  });

  test('round-trips through a storage shim', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    savePrefs({ mode: 'focus', vehicle: 'sports', masterVolume: 0.4, reducedMotion: true, quality: 'low' }, storage);
    expect(mem.has(PERSIST_KEY)).toBe(true);
    expect(loadPrefs(storage)).toEqual({ mode: 'focus', vehicle: 'sports', masterVolume: 0.4, reducedMotion: true, quality: 'low' });
  });

  test('corrupt JSON yields empty prefs', () => {
    const storage = { getItem: () => '{not json' };
    expect(loadPrefs(storage)).toEqual({});
  });
});
