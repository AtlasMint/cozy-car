import { describe, expect, test } from 'bun:test';
import { createSpring } from '../../motion/spring';

describe('critically damped spring', () => {
  test('converges to the target without overshoot', () => {
    const s = createSpring(0);
    let max = 0;
    for (let i = 0; i < 600; i++) {
      s.step(1, 1 / 60, 2.2);
      max = Math.max(max, s.x);
    }
    expect(s.x).toBeCloseTo(1, 3);
    expect(max).toBeLessThanOrEqual(1 + 1e-6);
  });

  test('is stable for large steps', () => {
    const s = createSpring(0);
    for (let i = 0; i < 40; i++) s.step(1, 0.5, 6);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(s.x).toBeCloseTo(1, 3);
  });

  test('settles in roughly the expected time', () => {
    // ω = 2.2 rad/s → ~95 % settled within ~2.5 s for a critically damped system.
    const s = createSpring(0);
    let t = 0;
    while (t < 2.5) {
      s.step(1, 1 / 120, 2.2);
      t += 1 / 120;
    }
    expect(s.x).toBeGreaterThan(0.93);
  });

  test('a kick decays back to the target', () => {
    const s = createSpring(0);
    s.kick(1);
    let peak = 0;
    for (let i = 0; i < 300; i++) {
      s.step(0, 1 / 60, 8);
      peak = Math.max(peak, s.x);
    }
    expect(peak).toBeGreaterThan(0.02);
    expect(Math.abs(s.x)).toBeLessThan(1e-3);
  });
});
