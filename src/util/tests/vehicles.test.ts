import { describe, expect, test } from 'bun:test';
import { VEHICLES, VEHICLE_ORDER, type VehicleSpec } from '../../core/vehicles';

const specs: [string, VehicleSpec][] = VEHICLE_ORDER.map((id) => [id, VEHICLES[id]]);

describe('vehicle specs', () => {
  test('the registry is complete and self-consistent', () => {
    expect(VEHICLE_ORDER.length).toBe(3);
    for (const [id, v] of specs) expect(VEHICLES[v.id]).toBe(VEHICLES[id as keyof typeof VEHICLES]);
  });

  for (const [id, v] of specs) {
    describe(id, () => {
      test('the shelter box encloses the body', () => {
        // halfLength + 0.06, wallTop + 0.045, halfWidthOuter + 0.02 — the rule that reproduces
        // the hatchback's shipped box exactly.
        const halfLength = v.dims.length / 2;
        const halfWidth = v.dims.wallZ + v.dims.wallThickness;
        expect(v.shelter.min[0]).toBeLessThanOrEqual(-halfLength);
        expect(v.shelter.max[0]).toBeGreaterThanOrEqual(halfLength);
        expect(v.shelter.min[1]).toBe(0);
        expect(v.shelter.max[1]).toBeGreaterThanOrEqual(v.dims.wallTopY);
        expect(v.shelter.min[2]).toBeLessThanOrEqual(-halfWidth);
        expect(v.shelter.max[2]).toBeGreaterThanOrEqual(halfWidth);
      });

      test('the rear bump delay is the wheelbase crossed at cruising speed', () => {
        // A derived quantity frozen as a constant, so it is wrong by default on a new wheelbase.
        expect(v.motion.bump.rearDelay).toBeCloseTo(v.dims.wheelbase / v.speed.focus, 3);
      });

      test('the radio push-in frames the same world height on every vehicle', () => {
        // radioZoom is a multiplier against viewSize, so it must scale with it.
        expect(v.camera.radioZoom).toBeCloseTo((3.2 * v.camera.viewSize) / 5.2, 2);
      });

      test('the body fits inside its own frame', () => {
        // Projected height at the fixed isometric elevation must leave headroom.
        const projected = 0.7071 * (v.dims.length + v.dims.width) * Math.sin(35.264 * (Math.PI / 180)) + v.dims.wallTopY * Math.cos(35.264 * (Math.PI / 180));
        expect(projected).toBeLessThan(v.camera.viewSize);
        expect(v.camera.minViewWidth).toBeGreaterThan(v.camera.viewSize);
      });

      test('geometry is physically sensible', () => {
        expect(v.dims.wheelbase).toBeLessThan(v.dims.length);
        expect(v.dims.track).toBeLessThan(v.dims.width);
        expect(v.dims.archRadius).toBeGreaterThan(v.dims.wheelRadius);
        expect(v.dims.floorTopY).toBeGreaterThan(v.dims.floorY);
        expect(v.dims.sillY).toBeGreaterThan(v.dims.floorTopY);
        expect(v.dims.wallTopY).toBeGreaterThan(v.dims.beltY);
        expect(v.dims.spokes).toBeGreaterThanOrEqual(0);
      });

      test('the engine voice is a four-stroke with a sane order structure', () => {
        expect(v.audio.cylinders % 2).toBe(0);
        // firing frequency = rpm * cylinders / 120
        const idleFiring = (v.motion.rpm.idle * v.audio.cylinders) / 120;
        expect(idleFiring).toBeGreaterThan(10);
        expect(idleFiring).toBeLessThan(60);
        expect(v.audio.modes.length).toBeGreaterThanOrEqual(3);
        for (let i = 1; i < v.audio.modes.length; i++) {
          expect(v.audio.modes[i]!).toBeGreaterThan(v.audio.modes[i - 1]!);
        }
        // irregularity always falls under load: engines are least stable at idle
        expect(v.audio.irregularity.loaded).toBeLessThan(v.audio.irregularity.idle);
        // and the pulse always brightens under load
        expect(v.audio.rolloff.loaded).toBeLessThan(v.audio.rolloff.idle);
      });

      test('the driver can reach the wheel', () => {
        const [hx, hy] = v.pose.hips;
        const [wx, wy] = v.cabin.wheelCentre;
        const reach = Math.hypot(wx - hx, wy - hy);
        expect(reach).toBeGreaterThan(0.2);
        expect(reach).toBeLessThan(0.95);
      });
    });
  }
});
