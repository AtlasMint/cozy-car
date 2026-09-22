import { describe, expect, test } from 'bun:test';
import { createEngineRig } from '../../motion/engineRig';
import { mulberry32 } from '../math';
import { MOTION } from '../../core/constants';

const run = (rig: ReturnType<typeof createEngineRig>, seconds: number, opts: Partial<Parameters<typeof rig.update>[0]> = {}) => {
  const dt = 1 / 60;
  let t = 0;
  let maxY = 0;
  let maxPitch = 0;
  let maxWheel = 0;
  while (t < seconds) {
    t += dt;
    const o = rig.update({ dt, elapsed: t, blend: 0, engine: 1, speed: 0, ampScale: 1, bumpsEnabled: true, ...opts });
    maxY = Math.max(maxY, Math.abs(o.y));
    maxPitch = Math.max(maxPitch, Math.abs(o.pitch));
    maxWheel = Math.max(maxWheel, ...o.wheels.map(Math.abs));
  }
  return { maxY, maxPitch, maxWheel };
};

describe('engine rig', () => {
  test('engine off is perfectly still', () => {
    const rig = createEngineRig(mulberry32(1));
    const r = run(rig, 3, { engine: 0, bumpsEnabled: false });
    expect(r.maxY).toBe(0);
    expect(r.maxPitch).toBe(0);
  });

  test('chill idle stays within the summed band amplitudes', () => {
    const rig = createEngineRig(mulberry32(2));
    const r = run(rig, 10, { blend: 0, speed: 0 });
    const bound = MOTION.IDLE.chill.y * 1.5 + MOTION.SWAY.chill.y;
    expect(r.maxY).toBeGreaterThan(0.002);
    expect(r.maxY).toBeLessThanOrEqual(bound + 1e-6);
    expect(r.maxWheel).toBe(0); // no bumps while parked
  });

  test('focus at speed moves more than chill, and bumps reach the wheels', () => {
    const chill = run(createEngineRig(mulberry32(3)), 20, { blend: 0, speed: 0 });
    const focus = run(createEngineRig(mulberry32(3)), 20, { blend: 1, speed: 22 });
    expect(focus.maxY).toBeGreaterThan(chill.maxY);
    expect(focus.maxPitch).toBeGreaterThan(chill.maxPitch);
    expect(focus.maxWheel).toBeGreaterThan(0.01);
    expect(focus.maxWheel).toBeLessThan(0.12);
  });

  test('a bump hits the front wheels first and the rear later', () => {
    const rig = createEngineRig(mulberry32(4));
    const dt = 1 / 120;
    rig.update({ dt, elapsed: 0, blend: 0, engine: 1, speed: 0, ampScale: 1, bumpsEnabled: false });
    rig.bump();
    let t = 0;
    let frontPeakT = -1;
    let rearPeakT = -1;
    let frontPeak = 0;
    let rearPeak = 0;
    while (t < 1) {
      t += dt;
      const o = rig.update({ dt, elapsed: t, blend: 0, engine: 0, speed: 0, ampScale: 1, bumpsEnabled: false });
      if (o.wheels[0] > frontPeak) {
        frontPeak = o.wheels[0];
        frontPeakT = t;
      }
      if (o.wheels[2] > rearPeak) {
        rearPeak = o.wheels[2];
        rearPeakT = t;
      }
    }
    expect(frontPeak).toBeGreaterThan(0.01);
    expect(rearPeak).toBeGreaterThan(0.01);
    expect(rearPeakT - frontPeakT).toBeGreaterThan(MOTION.BUMP.rearDelay * 0.8);
  });

  test('ignition dips the body then settles', () => {
    const rig = createEngineRig(mulberry32(5));
    rig.ignite();
    const dt = 1 / 60;
    let t = 0;
    let minY = 0;
    let last = 0;
    while (t < 3) {
      t += dt;
      last = rig.update({ dt, elapsed: t, blend: 0, engine: 0, speed: 0, ampScale: 1, bumpsEnabled: false }).y;
      minY = Math.min(minY, last);
    }
    expect(minY).toBeLessThan(-0.01);
    expect(Math.abs(last)).toBeLessThan(0.002);
  });

  test('reduced motion scales every band', () => {
    const full = run(createEngineRig(mulberry32(6)), 8, { blend: 1, speed: 22, ampScale: 1 });
    const reduced = run(createEngineRig(mulberry32(6)), 8, { blend: 1, speed: 22, ampScale: 0.25 });
    expect(reduced.maxY).toBeLessThan(full.maxY * 0.5);
  });
});
