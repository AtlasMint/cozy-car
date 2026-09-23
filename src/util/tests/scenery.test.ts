import { describe, expect, test } from 'bun:test';
import { advanceField, type Instance } from '../../scene/world/scenery';
import { mulberry32 } from '../math';
import { HATCHBACK } from '../../core/vehicles';

const CRUISE = HATCHBACK.speed.focus;

const BEHIND = -9;
const LENGTH = 40;

function field(n: number): Instance[] {
  return Array.from({ length: n }, (_, i) => ({ x: BEHIND + (i / n) * LENGTH, z: 4, scale: 1, rot: 0 }));
}

describe('scenery treadmill wrap', () => {
  test('positions stay inside the field for any dt sequence', () => {
    const rng = mulberry32(11);
    const inst = field(40);
    for (let step = 0; step < 5000; step++) {
      const dt = rng() * 0.05; // includes the clamped worst case
      advanceField(inst, CRUISE * dt, BEHIND, LENGTH);
      for (const i of inst) {
        expect(i.x).toBeGreaterThanOrEqual(BEHIND);
        expect(i.x).toBeLessThan(BEHIND + LENGTH);
      }
    }
  });

  test('spacing is preserved modulo the wrap — no gaps, no bunching', () => {
    const inst = field(20);
    const gap = LENGTH / 20;
    let travelled = 0;
    for (let step = 0; step < 3000; step++) {
      const dx = CRUISE / 60;
      travelled += dx;
      advanceField(inst, dx, BEHIND, LENGTH);
    }
    const xs = inst.map((i) => i.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(gap, 6);
    // Total travel is consistent with the wrap count.
    expect(travelled).toBeGreaterThan(LENGTH);
  });

  test('a huge step wraps multiple lengths cleanly', () => {
    const inst: Instance[] = [{ x: 0, z: 0, scale: 1, rot: 0 }];
    advanceField(inst, LENGTH * 3.5, BEHIND, LENGTH);
    expect(inst[0]!.x).toBeGreaterThanOrEqual(BEHIND);
    expect(inst[0]!.x).toBeLessThan(BEHIND + LENGTH);
  });

  test('respawn fires exactly once per wrap', () => {
    const inst: Instance[] = [{ x: BEHIND + 0.5, z: 0, scale: 1, rot: 0 }];
    let calls = 0;
    advanceField(inst, 1, BEHIND, LENGTH, () => calls++);
    expect(calls).toBe(1);
    advanceField(inst, 1, BEHIND, LENGTH, () => calls++);
    expect(calls).toBe(1);
  });

  test('zero speed leaves everything untouched', () => {
    const inst = field(10);
    const before = inst.map((i) => i.x);
    advanceField(inst, 0, BEHIND, LENGTH);
    expect(inst.map((i) => i.x)).toEqual(before);
  });
});
