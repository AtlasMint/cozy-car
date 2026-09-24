import { describe, expect, test } from 'bun:test';
import { shelteredByBox } from '../math';
import { VEHICLES } from '../../core/vehicles';
import { createMaterials } from '../../scene/car/parts';

/** Every spec, including the ones the picker does not offer. */
const ALL_VEHICLES = Object.keys(VEHICLES) as (keyof typeof VEHICLES)[];

/** The camera looks from −X, +Y, −Z, so the view ray into the scene runs (+1, −1, +1). */
const VIEW: readonly [number, number, number] = [1, -1, 1];

describe('shelter test', () => {
  test('a point inside the box is sheltered', () => {
    const min = [-1, 0, -1] as const;
    const max = [1, 1, 1] as const;
    expect(shelteredByBox([0, 0.5, 0], VIEW, min, max)).toBe(true);
  });

  test('a point whose view ray crosses the box is sheltered', () => {
    const min = [-1, 0, -1] as const;
    const max = [1, 1, 1] as const;
    // Directly "above and behind" along the view axis: the ray runs straight into the box.
    expect(shelteredByBox([-2, 2.5, -2], VIEW, min, max)).toBe(true);
  });

  test('a point well to one side is not sheltered', () => {
    const min = [-1, 0, -1] as const;
    const max = [1, 1, 1] as const;
    expect(shelteredByBox([0, 4, 6], VIEW, min, max)).toBe(false);
    expect(shelteredByBox([8, 0.5, 0], VIEW, min, max)).toBe(false);
  });

  for (const id of ALL_VEHICLES) {
    const v = VEHICLES[id];
    test(`${id}: a drop that would be drawn over the cabin is killed, one beside it is not`, () => {
      const { min, max } = v.shelter;
      const cx = (min[0] + max[0]) / 2;
      const cy = (min[1] + max[1]) / 2;
      const cz = (min[2] + max[2]) / 2;
      // The test is about overlap on screen, not about being overhead: a drop directly above
      // the roof has a view ray that misses the body entirely, and is correctly spared. What
      // must be killed is a drop up-and-back along the view axis, whose ray runs into the car.
      expect(shelteredByBox([cx - 3, cy + 3, cz - 3], VIEW, min, max)).toBe(true);
      expect(shelteredByBox([cx - 3, cy + 3, cz - 3 + 8], VIEW, min, max)).toBe(false);
      // Directly overhead: not drawn over the body, so not excluded.
      expect(shelteredByBox([cx, max[1] + 3, cz], VIEW, min, max)).toBe(false);
    });
  }
});

describe('draw-call budget', () => {
  // Draw calls are dominated by merged material buckets, and renderer.info counts the shadow
  // pass too, so every bucket costs two. A vehicle cannot exceed the shared material set, so
  // capping that set is what caps every vehicle at once.
  test('the material set stays within the per-vehicle bucket budget', () => {
    const keys = Object.keys(createMaterials(VEHICLES.hatchback.paint)).filter((k) => k !== 'dispose');
    expect(keys.length).toBeLessThanOrEqual(32);
  });

  test('every vehicle draws from the same material set', () => {
    // No vehicle may add a material key: that would raise the ceiling for all of them, and a
    // new material feature flag would recompile every lit program on a swap.
    const shape = Object.keys(createMaterials(VEHICLES.hatchback.paint)).sort().join(',');
    for (const id of ALL_VEHICLES) {
      expect(Object.keys(createMaterials(VEHICLES[id].paint)).sort().join(',')).toBe(shape);
    }
  });
});
