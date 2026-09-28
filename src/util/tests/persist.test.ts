import { describe, expect, test } from 'bun:test';
import { loadPrefs, sanitizePrefs, savePrefs, PERSIST_KEY } from '../../core/persist';

describe('prefs persistence', () => {
  test('sanitize drops malformed values and clamps volume', () => {
    expect(sanitizePrefs({ vehicle: 'spaceship', masterVolume: 1.7, reducedMotion: 'yes', quality: 'ultra' })).toEqual({ masterVolume: 1 });
    expect(sanitizePrefs({ vehicle: 'van' })).toEqual({ vehicle: 'van' });
    expect(sanitizePrefs(null)).toEqual({});
    expect(sanitizePrefs('nope')).toEqual({});
    expect(sanitizePrefs({ masterVolume: NaN })).toEqual({});
  });

  test('round-trips through a storage shim', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const saved = {
      vehicle: 'sports', masterVolume: 0.4, reducedMotion: true, quality: 'low',
      volumeEngine: 1, volumeWeather: 0.3, volumeAmbience: 0.8, volumeMusic: 0.55,
    } as const;
    savePrefs(saved, storage);
    expect(mem.has(PERSIST_KEY)).toBe(true);
    expect(loadPrefs(storage)).toEqual({ ...saved });
  });

  test('the mode is not remembered, and one remembered by v0.5 is ignored', () => {
    // The app opens parked, every time. savePrefs takes the whole state and must leave the
    // mode out of it; loadPrefs must drop one that an older build wrote.
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    // A variable rather than a literal: the point is that a state *carrying* a mode is written
    // without it, and a literal with an extra key is refused by the compiler before it can be.
    const state = { mode: 'focus', vehicle: 'van', masterVolume: 0.5, reducedMotion: false, quality: 'high', volumeEngine: 1, volumeWeather: 1, volumeAmbience: 1, volumeMusic: 1 } as const;
    savePrefs(state, storage);
    expect(JSON.parse(mem.get(PERSIST_KEY)!)).not.toHaveProperty('mode');
    expect(sanitizePrefs({ mode: 'focus', vehicle: 'van' })).toEqual({ vehicle: 'van' });
  });

  test('bus levels are clamped and each one survives on its own', () => {
    // A level of 0 is a real setting — muted weather — so it must not be dropped as falsy.
    expect(sanitizePrefs({ volumeWeather: 0 })).toEqual({ volumeWeather: 0 });
    expect(sanitizePrefs({ volumeEngine: 3, volumeMusic: -2 })).toEqual({ volumeEngine: 1, volumeMusic: 0 });
    expect(sanitizePrefs({ volumeAmbience: 'loud' })).toEqual({});
    expect(sanitizePrefs({ volumeMusic: NaN })).toEqual({});
  });

  test('corrupt JSON yields empty prefs', () => {
    const storage = { getItem: () => '{not json' };
    expect(loadPrefs(storage)).toEqual({});
  });
});
