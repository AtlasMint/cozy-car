import { describe, expect, test } from 'bun:test';
import { buildOrderTable, cycleHz, firingHz, HARMONICS } from '../../audio/engineVoice';
import { VEHICLES, type EngineProfile } from '../../core/vehicles';

/** Every spec, including the ones the picker does not offer. */
const ALL_VEHICLES = Object.keys(VEHICLES) as (keyof typeof VEHICLES)[];

const mag = (t: { real: Float32Array; imag: Float32Array }, k: number) => Math.hypot(t.real[k]!, t.imag[k]!);

const base: EngineProfile = {
  ...VEHICLES.hatchback.audio,
  cylinders: 4,
  cylinderSpread: 0,
  asymmetryDeg: 0,
};

describe('engine frequency identities', () => {
  test('a four-stroke fires cylinders/2 times per crank revolution', () => {
    // 4-cylinder at 750 rpm → 25 Hz, the classic 2nd engine order.
    expect(firingHz(750, 4)).toBeCloseTo(25, 6);
    expect(firingHz(2200, 4)).toBeCloseTo(73.333, 3);
    expect(firingHz(1800, 4)).toBeCloseTo(60, 6); // 30 Hz rotation × 2nd order
    expect(firingHz(800, 6)).toBeCloseTo(40, 6);
    expect(firingHz(800, 8)).toBeCloseTo(53.333, 3);
  });

  test('the oscillator runs at the engine cycle, which is half a rotation order', () => {
    expect(cycleHz(750)).toBeCloseTo(6.25, 6);
    // firing frequency is always cylinders × the cycle rate
    for (const rpm of [620, 750, 980, 2200, 3400]) {
      expect(firingHz(rpm, 4)).toBeCloseTo(cycleHz(rpm) * 4, 6);
    }
  });

  test('harmonic k of the cycle is engine order k/2', () => {
    // The whole point of running at rpm/120: order 2 lands on harmonic 4.
    const rpm = 750;
    const orderTwoHz = 2 * (rpm / 60);
    expect(cycleHz(rpm) * 4).toBeCloseTo(orderTwoHz, 6);
  });
});

describe('order table', () => {
  test('an ideal four-cylinder puts its energy on the firing order and its harmonics', () => {
    const t = buildOrderTable(base, 0.3);
    // Order 2 = harmonic 4, order 4 = harmonic 8, and so on.
    for (const k of [4, 8, 12]) expect(mag(t, k)).toBeGreaterThan(1e-3);
    // Everything else, including every half-order, is silent when all cylinders are identical.
    for (const k of [1, 2, 3, 5, 6, 7, 9, 10, 11]) expect(mag(t, k)).toBeLessThan(1e-6);
  });

  test('per-cylinder spread is what creates the half-order comb', () => {
    const even = buildOrderTable(base, 0.3);
    const lumpy = buildOrderTable({ ...base, cylinderSpread: 0.12 }, 0.3);
    // Odd harmonics are the half-orders (k=1 is order 0.5, k=3 is order 1.5).
    for (const k of [1, 2, 3, 6]) {
      expect(mag(even, k)).toBeLessThan(1e-6);
      expect(mag(lumpy, k)).toBeGreaterThan(1e-4);
    }
    // and the firing order still dominates
    expect(mag(lumpy, 4)).toBeGreaterThan(mag(lumpy, 1));
  });

  test('firing asymmetry also leaks into the half-orders', () => {
    const square = buildOrderTable(base, 0.3);
    const skewed = buildOrderTable({ ...base, asymmetryDeg: 8 }, 0.3);
    expect(mag(square, 2)).toBeLessThan(1e-6);
    expect(mag(skewed, 2)).toBeGreaterThan(1e-4);
  });

  test('a lower rolloff is a brighter pulse', () => {
    const dark = buildOrderTable(base, 0.6);
    const bright = buildOrderTable(base, 0.2);
    const high = (t: ReturnType<typeof buildOrderTable>) => {
      let sum = 0;
      for (let k = 16; k <= HARMONICS; k++) sum += mag(t, k);
      return sum;
    };
    expect(high(bright)).toBeGreaterThan(high(dark) * 10);
  });

  test('coefficients are finite, sized and free of DC', () => {
    for (const id of ALL_VEHICLES) {
      const v = VEHICLES[id];
      for (const rolloff of [v.audio.rolloff.idle, v.audio.rolloff.loaded]) {
        const t = buildOrderTable(v.audio, rolloff);
        expect(t.real.length).toBe(HARMONICS + 1);
        expect(t.imag.length).toBe(HARMONICS + 1);
        expect(t.real[0]).toBe(0);
        expect(t.imag[0]).toBe(0);
        for (let k = 0; k <= HARMONICS; k++) {
          expect(Number.isFinite(t.real[k]!)).toBe(true);
          expect(Number.isFinite(t.imag[k]!)).toBe(true);
        }
        // there is actually a signal
        let total = 0;
        for (let k = 1; k <= HARMONICS; k++) total += mag(t, k);
        expect(total).toBeGreaterThan(0.01);
      }
    }
  });

  test('every shipped vehicle is louder on its firing order than on its half-orders', () => {
    for (const id of ALL_VEHICLES) {
      const v = VEHICLES[id];
      const t = buildOrderTable(v.audio, v.audio.rolloff.idle);
      const firing = v.audio.cylinders; // harmonic index of the firing order
      expect(mag(t, firing)).toBeGreaterThan(mag(t, 1));
      expect(mag(t, firing)).toBeGreaterThan(mag(t, firing - 1));
    }
  });
});
