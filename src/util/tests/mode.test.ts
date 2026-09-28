import { describe, expect, test } from 'bun:test';
import { canEnter, engineOn, isMode, MODES, nextMode, parseModeHash } from '../../core/mode';
import { defaultState } from '../../core/store';

describe('the mode machine', () => {
  test('the app opens parked', () => {
    expect(defaultState.mode).toBe('park');
  });

  test('P parks from anywhere, and is nothing once parked', () => {
    expect(nextMode('p', 'chill')).toBe('park');
    expect(nextMode('p', 'focus')).toBe('park');
    expect(nextMode('p', 'park')).toBeNull();
  });

  test('F pulls out of Park onto the roadside, never straight into Focus', () => {
    expect(nextMode('f', 'park')).toBe('chill');
  });

  test('F is the Chill / Focus toggle it always was', () => {
    expect(nextMode('f', 'chill')).toBe('focus');
    expect(nextMode('f', 'focus')).toBe('chill');
  });

  test('the control may not go where the key may not', () => {
    // Park → Focus is the one refused pair. A button that quietly routed through Chill would be
    // a control lying about what it does, so it is disabled instead.
    expect(canEnter('park', 'focus')).toBe(false);
    expect(canEnter('park', 'chill')).toBe(true);
    expect(canEnter('chill', 'focus')).toBe(true);
    expect(canEnter('focus', 'chill')).toBe(true);
    expect(canEnter('chill', 'park')).toBe(true);
    expect(canEnter('focus', 'park')).toBe(true);
  });

  test('going where you already are is not a transition', () => {
    for (const m of MODES) expect(canEnter(m, m)).toBe(false);
  });

  test('the engine is off exactly when parked', () => {
    expect(engineOn('park')).toBe(false);
    expect(engineOn('chill')).toBe(true);
    expect(engineOn('focus')).toBe(true);
  });

  test('every mode the key can reach is a mode', () => {
    for (const m of MODES) {
      for (const k of ['p', 'f'] as const) {
        const n = nextMode(k, m);
        if (n !== null) expect(isMode(n)).toBe(true);
      }
    }
  });
});

describe('#mode=', () => {
  test('boots into a named mode, for screenshots', () => {
    expect(parseModeHash('#mode=focus')).toBe('focus');
    expect(parseModeHash('#weather=rain&mode=chill')).toBe('chill');
    expect(parseModeHash('#mode=park')).toBe('park');
  });

  test('and into nothing for anything else', () => {
    expect(parseModeHash('')).toBeNull();
    expect(parseModeHash('#mode=drive')).toBeNull();
    expect(parseModeHash('#vehicle=van')).toBeNull();
  });
});
