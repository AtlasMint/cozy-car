import { describe, expect, test } from 'bun:test';
import { TANK, VEHICLES, VEHICLE_ORDER } from '../../core/vehicles';
import { TANK_GUN } from '../../core/constants';
import { isListedVehicle, type AppState } from '../../core/store';
import { loadPrefs, sanitizePrefs, savePrefs } from '../../core/persist';
import { nextVehicle, parseVehicleHash } from '../../ui/vehiclePicker';
import { Builder, createMaterials } from '../../scene/car/parts';

/**
 * The tank is a whole vehicle that is not on offer. These are the rules that keep it that way —
 * each one is a place that looks like an oversight and is not.
 */
describe('the vehicle that is not listed', () => {
  test('it is a real spec in the registry', () => {
    expect(VEHICLES.tank).toBe(TANK);
    expect(TANK.id).toBe('tank');
  });

  test('the picker does not offer it', () => {
    expect(VEHICLE_ORDER).not.toContain('tank');
    expect(isListedVehicle('tank')).toBe(false);
    for (const id of VEHICLE_ORDER) expect(isListedVehicle(id)).toBe(true);
  });

  test('a link cannot name it', () => {
    expect(parseVehicleHash('#vehicle=tank')).toBeNull();
    expect(parseVehicleHash('#vehicle=van')).toBe('van');
  });

  test('a stored preference cannot hold it', () => {
    expect(sanitizePrefs({ vehicle: 'tank' })).toEqual({});
    expect(sanitizePrefs({ vehicle: 'sports' })).toEqual({ vehicle: 'sports' });
  });

  test('reaching it costs the user nothing', () => {
    // Dropping the key would still overwrite the stored choice with nothing, so the last listed
    // vehicle has to be read back and carried forward.
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const base = { mode: 'chill', masterVolume: 0.5, reducedMotion: false, quality: 'high',
      volumeEngine: 1, volumeWeather: 1, volumeAmbience: 1, volumeMusic: 1 } as const;
    savePrefs({ ...base, vehicle: 'sports' } as Pick<AppState, 'mode' | 'vehicle' | 'masterVolume' | 'volumeEngine' | 'volumeWeather' | 'volumeAmbience' | 'volumeMusic' | 'reducedMotion' | 'quality'>, storage);
    expect(loadPrefs(storage).vehicle).toBe('sports');
    savePrefs({ ...base, vehicle: 'tank' } as Pick<AppState, 'mode' | 'vehicle' | 'masterVolume' | 'volumeEngine' | 'volumeWeather' | 'volumeAmbience' | 'volumeMusic' | 'reducedMotion' | 'quality'>, storage);
    expect(loadPrefs(storage).vehicle).toBe('sports');
  });

  test('it builds, and hands back everything a vehicle owes', () => {
    const m = createMaterials(TANK.paint);
    const b = new Builder(m);
    const kit = TANK.build(b, m, TANK);
    const built = b.finish('car');
    expect(typeof kit.setLights).toBe('function');
    expect(typeof kit.setTacho).toBe('function');
    expect(typeof kit.setSpeedo).toBe('function');
    expect(typeof kit.setDashGlow).toBe('function');
    expect(kit.wheelNode.name).toBe('steeringWheel');
    // Zero panes would not throw — it would just mean weather never appears on it, silently.
    expect(kit.panes.length).toBeGreaterThan(0);
    expect(kit.exhaustTip.lengthSq()).toBeGreaterThan(0);
    // The setters are called every frame, so they have to survive being called.
    kit.setLights(1, 1);
    kit.setTacho(1500);
    kit.setSpeedo(40);
    kit.setDashGlow(1);
    built.dispose();
    m.dispose();
  });

  test('the track run fits the hull it is bolted to', () => {
    // The band's vertical agreement with the wheels is geometry, not spec — both read
    // dims.wheelRadius, so no spec value can float the tank. What a spec value CAN break is the
    // run's length: it spans sprocket to idler plus a radius at each end, inside the hull.
    expect(TANK.dims.wheelRadius).toBeGreaterThan(0);
    expect(TANK.dims.wheelWidth).toBeGreaterThan(0);
    expect(TANK.dims.wheelbase + 2 * TANK.dims.wheelRadius).toBeLessThanOrEqual(TANK.dims.length);
  });

  test('both ends of the track run are the same width', () => {
    // rearWidthScale widens only the rear pair. On a road vehicle that is a staggered look; on
    // one continuous band it would make the two ends of the same track different widths.
    expect(TANK.dims.rearWidthScale).toBe(1);
  });
});

describe('which vehicle a key press reaches', () => {
  test('V cycles the listed vehicles and never lands on the unlisted one', () => {
    let at: 'hatchback' | 'van' | 'sports' = 'hatchback';
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      at = nextVehicle('v', at, at) as typeof at;
      seen.push(at);
    }
    expect(seen).toEqual(['van', 'sports', 'hatchback', 'van', 'sports', 'hatchback']);
  });

  test('T reaches it, and is a no-op once there', () => {
    expect(nextVehicle('t', 'sports', 'sports')).toBe('tank');
    expect(nextVehicle('t', 'tank', 'sports')).toBeNull();
  });

  test('V returns from it to the vehicle you left, not to the top of the list', () => {
    // This is the whole of what "returns to the accessible vehicle list" has to mean when the
    // thing you are leaving has no place in it.
    expect(nextVehicle('v', 'tank', 'sports')).toBe('sports');
    expect(nextVehicle('v', 'tank', 'van')).toBe('van');
    expect(nextVehicle('v', 'tank', 'hatchback')).toBe('hatchback');
  });
});

describe('the main gun', () => {
  const arm = () => {
    const m = createMaterials(TANK.paint);
    const b = new Builder(m);
    const kit = TANK.build(b, m, TANK);
    const built = b.finish('car');
    return { gun: kit.gun!, free: () => { built.dispose(); kit.dispose?.(); m.dispose(); } };
  };
  const run = (gun: NonNullable<ReturnType<typeof arm>['gun']>, seconds: number, fps = 60) => {
    for (let i = 0; i < Math.round(seconds * fps); i++) gun.update(1 / fps);
  };

  test('only the tank carries one', () => {
    expect(TANK.build.length).toBeGreaterThan(0);
    for (const id of VEHICLE_ORDER) {
      const spec = VEHICLES[id];
      const m = createMaterials(spec.paint);
      const b = new Builder(m);
      const kit = spec.build(b, m, spec);
      expect(kit.gun).toBeUndefined();
      b.finish('car').dispose();
      m.dispose();
    }
  });

  test('it fires once, then has to reload', () => {
    const { gun, free } = arm();
    expect(gun.fire()).toBe(true);
    expect(gun.fire()).toBe(false);
    run(gun, TANK_GUN.reloadS * 0.5);
    expect(gun.fire()).toBe(false);
    run(gun, TANK_GUN.reloadS * 0.6);
    expect(gun.ready).toBe(1);
    expect(gun.fire()).toBe(true);
    free();
  });

  test('the reload clock runs in seconds, not in frames', () => {
    // It used to share the springs' clamped step, which made the gun reload half again as
    // slowly on anything under 30 fps.
    const fast = arm();
    const slow = arm();
    fast.gun.fire();
    slow.gun.fire();
    run(fast.gun, TANK_GUN.reloadS + 0.2, 60);
    run(slow.gun, TANK_GUN.reloadS + 0.2, 12);
    expect(fast.gun.ready).toBe(1);
    expect(slow.gun.ready).toBe(1);
    fast.free();
    slow.free();
  });

  test('firing kicks the hull, and the hull comes back', () => {
    const { gun, free } = arm();
    gun.fire();
    let peakHeave = 0;
    let peakPitch = 0;
    for (let i = 0; i < 90; i++) {
      const k = gun.update(1 / 60);
      peakHeave = Math.max(peakHeave, Math.abs(k.heave));
      peakPitch = Math.max(peakPitch, Math.abs(k.pitch));
    }
    // Enough to see — a couple of centimetres and a degree or two.
    expect(peakHeave).toBeGreaterThan(0.015);
    expect(peakPitch).toBeGreaterThan(0.015);
    // ...and not so much that the tank leaps.
    expect(peakHeave).toBeLessThan(0.12);
    expect(peakPitch).toBeLessThan(0.12);
    run(gun, 4);
    const settled = gun.update(1 / 60);
    expect(Math.abs(settled.heave)).toBeLessThan(0.002);
    expect(Math.abs(settled.pitch)).toBeLessThan(0.002);
    free();
  });

  test('an idle gun costs nothing and stays still', () => {
    const { gun, free } = arm();
    for (let i = 0; i < 120; i++) {
      const k = gun.update(1 / 60);
      expect(k.heave).toBe(0);
      expect(k.pitch).toBe(0);
    }
    free();
  });
});
