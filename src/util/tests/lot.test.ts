import { describe, expect, test } from 'bun:test';
import { bayLines, clearOfCabin, lotProps, type Aabb } from '../../scene/world/lot';
import { LOT } from '../../core/constants';
import { VEHICLES } from '../../core/vehicles';

// Every spec in the registry, not only the ones with a button: a bin beside the near door is
// a bin beside the near door on any of them.
const specs = Object.entries(VEHICLES);

describe('the camera rule', () => {
  const hatch = VEHICLES.hatchback.dims;

  test('paint is always allowed', () => {
    const line: Aabb = { name: 'line', min: [-1, 0, -1], max: [1, 0.01, 1] };
    expect(clearOfCabin(line, hatch)).toBe(true);
  });

  test('anything standing in the near-rear quadrant is not', () => {
    // A bin beside the near door: lower x than the nose, lower z than the far wall.
    const bin: Aabb = { name: 'bin', min: [-0.5, 0, -1.6], max: [-0.1, 1, -1.2] };
    expect(clearOfCabin(bin, hatch)).toBe(false);
  });

  test('ahead of the nose is clear, however tall', () => {
    const tree: Aabb = { name: 'tree', min: [hatch.length / 2, 0, -3], max: [hatch.length / 2 + 1, 4, -2] };
    expect(clearOfCabin(tree, hatch)).toBe(true);
  });

  test('beyond the far wall is clear, however tall', () => {
    const post: Aabb = { name: 'post', min: [-3, 0, hatch.wallZ], max: [-2.9, 5, hatch.wallZ + 0.1] };
    expect(clearOfCabin(post, hatch)).toBe(true);
  });

  test('a thing that straddles the nose is not clear', () => {
    // min.x is what counts: the part behind the nose is the part in the way.
    const straddle: Aabb = { name: 'straddle', min: [hatch.length / 2 - 0.1, 0, -2], max: [hatch.length / 2 + 1, 1, -1] };
    expect(clearOfCabin(straddle, hatch)).toBe(false);
  });
});

describe('the lot', () => {
  for (const [id, v] of specs) {
    test(`${id}: nothing standing in the lot comes between the lens and the cabin`, () => {
      for (const p of lotProps()) expect({ prop: p.name, clear: clearOfCabin(p, v.dims) }).toEqual({ prop: p.name, clear: true });
    });

    test(`${id}: the head kerb clears the nose`, () => {
      expect(LOT.KERB_X).toBeGreaterThan(v.dims.length / 2);
    });
  }

  test('the bay lines are symmetric about the bay the vehicle is in', () => {
    const lines = bayLines(LOT.BAY.width, 3);
    expect(lines).toEqual([-1.35 * 3, -1.35, 1.35, 1.35 * 3].map((n) => n / 1.35 * (LOT.BAY.width / 2)));
    for (const z of lines) expect(lines).toContain(-z);
    expect(lines).not.toContain(0);
  });

  test('the bay lines fit on the painted surface', () => {
    for (const z of bayLines(LOT.BAY.width, 3)) expect(Math.abs(z)).toBeLessThanOrEqual(LOT.SURFACE.halfWidth);
  });
});
