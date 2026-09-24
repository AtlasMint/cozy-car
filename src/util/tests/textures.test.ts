import { describe, expect, test } from 'bun:test';
import { blastImpulse, trackBuffer } from '../../audio/textures';
import { turboHz } from '../../audio/engineVoice';
import { TANK } from '../../core/vehicles';

const SR = 44100;
const rms = (b: Float32Array, from = 0, to = b.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += b[i]! * b[i]!;
  return Math.sqrt(s / Math.max(1, to - from));
};
/** Fraction of samples more than 3 RMS out: how much of a texture is transient. */
const peakiness = (b: Float32Array) => {
  const r = rms(b);
  let n = 0;
  for (let i = 0; i < b.length; i++) if (Math.abs(b[i]!) > 3 * r) n++;
  return n / b.length;
};

describe('track clatter', () => {
  const t = trackBuffer(SR, 1, 28, 1);

  test('is the length asked for, at a fixed level, and finite', () => {
    expect(t.length).toBe(SR);
    expect(rms(t)).toBeCloseTo(0.18, 4);
    for (let i = 0; i < t.length; i += 97) expect(Number.isFinite(t[i]!)).toBe(true);
  });

  test('is made of impacts, not of noise', () => {
    // Steel links hitting sprockets are discrete events; a texture of them stands well above
    // its own RMS far more often than the noise it would otherwise be mistaken for.
    const noise = new Float32Array(SR);
    let seed = 7;
    for (let i = 0; i < SR; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      noise[i] = seed / 2147483648 - 1;
    }
    expect(peakiness(t)).toBeGreaterThan(peakiness(noise) * 2);
  });

  test('a denser rate is less peaky, the same way rain is', () => {
    expect(peakiness(trackBuffer(SR, 1, 90, 1))).toBeLessThan(peakiness(trackBuffer(SR, 1, 14, 1)));
  });

  test('has no DC and loops without a click', () => {
    let sum = 0;
    for (let i = 0; i < t.length; i++) sum += t[i]!;
    expect(Math.abs(sum / t.length)).toBeLessThan(0.002);
    const steps: number[] = [];
    for (let i = 1; i < t.length; i++) steps.push(Math.abs(t[i]! - t[i - 1]!));
    steps.sort((a, b) => a - b);
    expect(Math.abs(t[0]! - t[t.length - 1]!)).toBeLessThanOrEqual(steps[Math.floor(steps.length * 0.999)]!);
  });

  test('the same seed gives the same clatter', () => {
    const a = trackBuffer(SR, 0.5, 30, 42);
    const b = trackBuffer(SR, 0.5, 30, 42);
    const c = trackBuffer(SR, 0.5, 30, 43);
    expect(Array.from(a.subarray(0, 64))).toEqual(Array.from(b.subarray(0, 64)));
    expect(Array.from(a.subarray(0, 64))).not.toEqual(Array.from(c.subarray(0, 64)));
  });
});

describe('the space a gun goes off in', () => {
  const ir = blastImpulse(SR, 2.6, 5);

  test('starts with silence while the direct sound passes', () => {
    // Outdoors the first reflection is tens of milliseconds behind the shot itself.
    expect(rms(ir, 0, Math.floor(SR * 0.03))).toBe(0);
    expect(rms(ir, Math.floor(SR * 0.04), Math.floor(SR * 0.1))).toBeGreaterThan(0);
  });

  test('decays, and is nearly gone by the end', () => {
    const early = rms(ir, Math.floor(SR * 0.05), Math.floor(SR * 0.3));
    const late = rms(ir, Math.floor(SR * 2.2), ir.length);
    expect(late).toBeLessThan(early * 0.05);
  });

  test('darkens as it goes', () => {
    // Air and ground absorb treble first. Measure how much of each window is high-frequency by
    // the size of the sample-to-sample steps relative to the level.
    const roughness = (from: number, to: number) => {
      let d = 0;
      for (let i = from + 1; i < to; i++) d += Math.abs(ir[i]! - ir[i - 1]!);
      return d / Math.max(1e-9, rms(ir, from, to) * (to - from));
    };
    expect(roughness(Math.floor(SR * 0.05), Math.floor(SR * 0.2))).toBeGreaterThan(roughness(Math.floor(SR * 1.2), Math.floor(SR * 1.6)) * 1.5);
  });

  test('is finite, has no DC, and is the length asked for', () => {
    expect(ir.length).toBe(Math.floor(SR * 2.6));
    let sum = 0;
    for (let i = 0; i < ir.length; i++) {
      expect(Number.isFinite(ir[i]!)).toBe(true);
      sum += ir[i]!;
    }
    expect(Math.abs(sum / ir.length)).toBeLessThan(0.001);
  });
});

describe('the turbocharger', () => {
  const turbo = TANK.audio.turbo!;

  test('the tank has one and nothing else does', () => {
    expect(turbo).toBeDefined();
    expect(TANK.audio.tracks).toBeDefined();
  });

  test('pitch follows load from idle to loaded, monotonically', () => {
    expect(turboHz(turbo, 0)).toBe(turbo.freq.idle);
    expect(turboHz(turbo, 1)).toBe(turbo.freq.loaded);
    let last = -1;
    for (let k = 0; k <= 1; k += 0.1) {
      const hz = turboHz(turbo, k);
      expect(hz).toBeGreaterThan(last);
      last = hz;
    }
    // Load is clamped: a driver value past the range does not run the turbine off the chart.
    expect(turboHz(turbo, 3)).toBe(turbo.freq.loaded);
    expect(turboHz(turbo, -1)).toBe(turbo.freq.idle);
  });

  test('it spools rather than snaps', () => {
    expect(turbo.spoolS).toBeGreaterThan(0.2);
    expect(turbo.gain.loaded).toBeGreaterThan(turbo.gain.idle);
    expect(turbo.freq.loaded).toBeGreaterThan(turbo.freq.idle);
  });
});
