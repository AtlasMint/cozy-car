import { describe, expect, test } from 'bun:test';
import { clamp, damp, lerp, mulberry32, smoothstep } from '../math';

describe('math', () => {
  test('lerp endpoints and midpoint', () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(-2, 2, 0.5)).toBe(0);
  });

  test('clamp', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  test('smoothstep is monotonic and bounded', () => {
    let prev = -1;
    for (let x = -0.5; x <= 1.5; x += 0.05) {
      const v = smoothstep(0, 1, x);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  test('damp converges regardless of step size', () => {
    let a = 0;
    for (let i = 0; i < 600; i++) a = damp(a, 1, 3, 1 / 60);
    let b = 0;
    for (let i = 0; i < 300; i++) b = damp(b, 1, 3, 1 / 30);
    expect(a).toBeCloseTo(1, 5);
    expect(b).toBeCloseTo(1, 5);
    // Same wall-clock time, same result within tolerance.
    let c = 0;
    let d = 0;
    for (let i = 0; i < 60; i++) c = damp(c, 1, 3, 1 / 60);
    for (let i = 0; i < 30; i++) d = damp(d, 1, 3, 1 / 30);
    expect(Math.abs(c - d)).toBeLessThan(1e-9);
  });

  test('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
