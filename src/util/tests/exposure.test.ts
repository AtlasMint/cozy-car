import { describe, expect, test } from 'bun:test';
import { floorExposure, seeThrough, SEE_THROUGH_BELOW, VEHICLES, type VehicleSpec } from '../../core/vehicles';
import { Builder, createMaterials } from '../../scene/car/parts';

/** Every spec, including the ones the picker does not offer. */
const ALL_VEHICLES = Object.keys(VEHICLES) as (keyof typeof VEHICLES)[];

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
    for (const id of ALL_VEHICLES) {
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

describe('the camper opens rather than fades', () => {
  const build = (spec: VehicleSpec) => {
    const m = createMaterials(spec.paint);
    const b = new Builder(m);
    const kit = spec.build(b, m, spec);
    const built = b.finish('car');
    const names = kit.panes.map((p) => p.name);
    built.dispose();
    m.dispose();
    return names;
  };

  test('the walls the camera looks through are not built at all', () => {
    const names = build(VEHICLES.van);
    // Absent, not translucent: no near-side glass, because there is no near side to set it in,
    // and no rear window, because there is no rear panel to cut it out of.
    expect(names.some((n) => n.endsWith('Near'))).toBe(false);
    expect(names).not.toContain('rear');
    // The cab keeps its screen, and the far side keeps both windows.
    expect(names).toContain('windscreen');
    expect(names.filter((n) => n.endsWith('Far')).length).toBe(2);
  });

  test('a body short enough to look into keeps every wall', () => {
    // Drop the camper's roof back under the threshold; the walls and their glass must return.
    const short = { ...VEHICLES.van, dims: { ...VEHICLES.van.dims, wallTopY: 1.9 } };
    expect(seeThrough(short)).toBe(false);
    const names = build(short);
    expect(names).toContain('rear');
    expect(names.filter((n) => n.endsWith('Near')).length).toBe(2);
  });

  test('a removed side panel still owes its wheels an arch', () => {
    // Wheel centres sit at y = wheelRadius, so a wheel reaches 2r — above the cabin floor on
    // every vehicle. That is why the near side keeps a wing and a lip: without them the wheel
    // rises into the room.
    for (const id of ALL_VEHICLES) {
      const d = VEHICLES[id].dims;
      expect(2 * d.wheelRadius).toBeGreaterThan(d.floorTopY);
    }
  });
});
