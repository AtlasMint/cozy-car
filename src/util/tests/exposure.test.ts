import { describe, expect, test } from 'bun:test';
import { floorExposure, seeThrough, SEE_THROUGH_BELOW, VEHICLES, VEHICLE_ORDER } from '../../core/vehicles';
import { castsShadow, createMaterials, renderOrderFor } from '../../scene/car/parts';

describe('floor exposure', () => {
  test('a point on the floor clears the near wall exactly when y + z + wallZ > wallTopY', () => {
    // The formula solved at the floor: the visible strip starts at z = wallTop − floorTop − wallZ.
    const d = { wallZ: 1, floorTopY: 0.5, wallTopY: 1.5 };
    // strip starts at z = 0, so half the floor is visible
    expect(floorExposure(d)).toBeCloseTo(0.5, 6);
    expect(floorExposure({ ...d, wallTopY: 2.5 })).toBe(0);
    expect(floorExposure({ ...d, wallTopY: 0.4 })).toBe(1);
  });

  test('the two low bodies are readable and the camper is not', () => {
    expect(floorExposure(VEHICLES.hatchback.dims)).toBeCloseTo(0.307, 3);
    expect(floorExposure(VEHICLES.sports.dims)).toBeCloseTo(0.42, 3);
    expect(floorExposure(VEHICLES.van.dims)).toBe(0);
  });

  test('see-through follows the geometry, never a declaration', () => {
    for (const id of VEHICLE_ORDER) {
      const v = VEHICLES[id];
      expect(seeThrough(v)).toBe(floorExposure(v.dims) < SEE_THROUGH_BELOW);
    }
    expect(seeThrough(VEHICLES.van)).toBe(true);
    expect(seeThrough(VEHICLES.hatchback)).toBe(false);
    expect(seeThrough(VEHICLES.sports)).toBe(false);
  });

  test('raising a readable body past the threshold flips it', () => {
    // The rule has to bite on geometry alone, or a future body could grow a roof unchecked.
    const grown = { ...VEHICLES.hatchback, dims: { ...VEHICLES.hatchback.dims, wallTopY: 2.2 } };
    expect(seeThrough(grown)).toBe(true);
  });
});

describe('the see-through wall material', () => {
  test('every vehicle carries it, so a tall body adds no material key', () => {
    for (const id of VEHICLE_ORDER) {
      const m = createMaterials(VEHICLES[id].paint);
      expect(m.ghost.transparent).toBe(true);
      expect(m.ghost.opacity).toBeLessThan(1);
      // It is the body's own colour: a wall you can see through, not a pane of glass.
      expect(m.ghost.color.getHexString()).toBe(m.body.color.getHexString());
      m.dispose();
    }
  });

  test('it casts no shadow and composites after the cabin behind it', () => {
    expect(castsShadow('ghost')).toBe(false);
    expect(renderOrderFor('ghost')).toBeGreaterThan(renderOrderFor('body'));
    expect(renderOrderFor('body')).toBe(0);
  });
});
