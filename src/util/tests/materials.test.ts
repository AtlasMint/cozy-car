import { describe, expect, test } from 'bun:test';
import { createMaterials, occupantMaterials, type PaintSpec } from '../../scene/car/parts';

const PAINT_A: PaintSpec = {
  body: '#112233',
  trim: '#000000',
  hub: '#888888',
  vinyl: '#221100',
  fabric: '#334455',
  fabricDark: '#112211',
};
const PAINT_B: PaintSpec = { ...PAINT_A, body: '#ff8800', fabric: '#00ff00' };

describe('per-vehicle material sets', () => {
  test('two live sets do not share paint', () => {
    const a = createMaterials(PAINT_A);
    const b = createMaterials(PAINT_B);
    expect(a.body.color.getHexString()).toBe('112233');
    expect(b.body.color.getHexString()).toBe('ff8800');
    expect(a.body.color.getHexString()).not.toBe(b.body.color.getHexString());
    expect(a.fabric.color.getHexString()).not.toBe(b.fabric.color.getHexString());
    a.dispose();
    b.dispose();
  });

  test('two live sets do not share the lamps that are written every frame', () => {
    // shell.setLights and interior.setDashGlow write emissiveIntensity per frame. With one
    // shared set, two vehicles alive at once would fight over these.
    const a = createMaterials(PAINT_A);
    const b = createMaterials(PAINT_B);
    a.headLight.emissiveIntensity = 3.5;
    a.tailLight.emissiveIntensity = 1.25;
    a.dashGlow.emissiveIntensity = 1.2;
    expect(b.headLight.emissiveIntensity).toBe(0);
    expect(b.tailLight.emissiveIntensity).toBe(0.15);
    expect(b.dashGlow.emissiveIntensity).toBe(0);
    a.dispose();
    b.dispose();
  });

  test('disposing one set leaves the other usable', () => {
    const a = createMaterials(PAINT_A);
    const b = createMaterials(PAINT_B);
    a.dispose();
    expect(b.body.color.getHexString()).toBe('ff8800');
    b.headLight.emissiveIntensity = 2;
    expect(b.headLight.emissiveIntensity).toBe(2);
    b.dispose();
  });

  test('the occupant set is shared and survives vehicle disposal', () => {
    // One driver, one outfit, for every vehicle.
    const first = occupantMaterials();
    const second = occupantMaterials();
    expect(second).toBe(first);
    const v = createMaterials(PAINT_A);
    v.dispose();
    expect(occupantMaterials().hoodie).toBe(first.hoodie);
  });

  test('dispose() is not itself a material', () => {
    const a = createMaterials(PAINT_A);
    expect(typeof a.dispose).toBe('function');
    a.dispose();
  });
});
