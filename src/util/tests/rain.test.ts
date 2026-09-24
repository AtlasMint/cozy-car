import { describe, expect, test } from 'bun:test';
import { highRatio, rainBuffer } from '../../audio/rain';
import { AUDIO } from '../../core/constants';

const SR = 44100;
const S = AUDIO.RAIN_SYNTH;
/**
 * How much of the texture is transient: the fraction of samples standing more than 3 RMS above
 * the average. Crest factor is the obvious measure and the wrong one — it is a maximum, so one
 * lucky drop moves it and it is not monotone across seeds.
 */
const peakiness = (b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i]! * b[i]!;
  const r = Math.sqrt(s / b.length);
  let n = 0;
  for (let i = 0; i < b.length; i++) if (Math.abs(b[i]!) > 3 * r) n++;
  return n / b.length;
};
const rms = (b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i]! * b[i]!;
  return Math.sqrt(s / b.length);
};

describe('the rain texture', () => {
  const light = rainBuffer(SR, 1, S.density.light, 1);
  const heavy = rainBuffer(SR, 1, S.density.heavy, 1);

  test('it is the length it was asked for', () => {
    expect(light.length).toBe(SR);
    expect(rainBuffer(SR, 2, 500, 1).length).toBe(SR * 2);
  });

  test('density changes the texture, never the level', () => {
    // Both normalise to the same RMS, so the drizzle/downpour axis is not a volume knob in
    // disguise — the layer gain is what carries loudness.
    expect(rms(light)).toBeCloseTo(S.rms, 4);
    expect(rms(heavy)).toBeCloseTo(S.rms, 4);
  });

  test('drops brighten the bed they sit on', () => {
    // The impacts ring between 1.2 and 8 kHz and the bed is deliberately dark, so any drops at
    // all have to pull energy upward — otherwise they are not being heard as drops.
    const bed = rainBuffer(SR, 1, 0, 1);
    expect(highRatio(light, SR)).toBeGreaterThan(highRatio(bed, SR) * 1.25);
    expect(highRatio(heavy, SR)).toBeGreaterThan(highRatio(bed, SR) * 1.25);
  });

  test('a downpour is the drizzle merged, not the drizzle brightened', () => {
    // Past a few hundred drops a second the spectrum stops moving — the texture has become the
    // impacts. What keeps changing is peakiness: sparse drops stand out, dense ones average into
    // a wash. This is the axis the buffer owns; brightness belongs to the filter in layers.ts.
    expect(peakiness(heavy)).toBeLessThan(peakiness(light));
    expect(peakiness(light)).toBeGreaterThan(peakiness(rainBuffer(SR, 1, 0, 1)));
  });

  test('no DC offset', () => {
    for (const b of [light, heavy]) {
      let sum = 0;
      for (let i = 0; i < b.length; i++) sum += b[i]!;
      expect(Math.abs(sum / b.length)).toBeLessThan(0.002);
    }
  });

  test('the seam is not a click', () => {
    // Looping joins the last sample to the first. That step has to be ordinary — no larger
    // than the steps everywhere else in the buffer.
    for (const b of [light, heavy]) {
      const steps: number[] = [];
      for (let i = 1; i < b.length; i++) steps.push(Math.abs(b[i]! - b[i - 1]!));
      steps.sort((x, y) => x - y);
      const p999 = steps[Math.floor(steps.length * 0.999)]!;
      expect(Math.abs(b[0]! - b[b.length - 1]!)).toBeLessThanOrEqual(p999);
    }
  });

  test('the same seed gives the same rain', () => {
    const a = rainBuffer(SR, 0.5, 2000, 42);
    const b = rainBuffer(SR, 0.5, 2000, 42);
    const c = rainBuffer(SR, 0.5, 2000, 43);
    expect(Array.from(a.subarray(0, 64))).toEqual(Array.from(b.subarray(0, 64)));
    expect(Array.from(a.subarray(0, 64))).not.toEqual(Array.from(c.subarray(0, 64)));
  });

  test('a density of zero is a bed and nothing else', () => {
    const bed = rainBuffer(SR, 0.5, 0, 7);
    expect(rms(bed)).toBeCloseTo(S.rms, 4);
    expect(highRatio(bed, SR)).toBeLessThan(highRatio(light, SR));
  });

  test('density is monotone in peakiness across the whole range', () => {
    // A guard against a future tweak that makes the middle of the range behave differently
    // from its ends.
    for (const seed of [1, 3, 7, 99]) {
      const p = [450, 900, 2200, 5200, 12000].map((d) => peakiness(rainBuffer(SR, 1, d, seed)));
      for (let i = 1; i < p.length; i++) expect(p[i]!).toBeLessThan(p[i - 1]!);
    }
  });

  test('nothing clips', () => {
    for (const b of [light, heavy]) {
      let peak = 0;
      for (let i = 0; i < b.length; i++) peak = Math.max(peak, Math.abs(b[i]!));
      expect(peak).toBeLessThan(1);
    }
  });
});
