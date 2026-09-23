import * as THREE from 'three';
import { CAR } from '../../core/constants';
import { Builder, mats } from './parts';

/**
 * Floorpan, sills, bulkhead, bumpers, engine, exhaust and the near-side running gear seen
 * through the wheel wells.
 */
export interface ChassisRig {
  exhaustTip: THREE.Vector3;
}

export function createChassis(b: Builder): ChassisRig {
  const F = CAR.FLOOR_Y;
  const FT = CAR.FLOOR_TOP_Y;
  const S = CAR.SILL_Y;
  const W = CAR.FAR_WALL_Z;
  const floorY = (F + FT) / 2;
  const floorH = FT - F;

  // Lower body tub — whole. The cabin floor sits 14 cm below the sill line so you look in
  // over a low lip; the front and rear sections are full-width blocks with open wheel wells.
  const tubH = S - F;
  const tubY = (F + S) / 2;
  b.box(1.75, floorH, CAR.WIDTH - 0.04, mats.carpet, { x: 0.025, y: floorY });
  b.box(1.0, floorH, 1.0, mats.metalDark, { x: 1.4, y: floorY });
  b.box(1.05, floorH, 1.0, mats.carpet, { x: -1.375, y: floorY });
  for (const sgn of [1, -1]) {
    b.box(0.41, tubH, CAR.WIDTH, mats.body, { x: sgn * 1.7, y: tubY });
    b.box(0.06, tubH, CAR.WIDTH, mats.body, { x: sgn * 0.93, y: tubY });
    b.box(0.53, tubH, 0.04, mats.metalDark, { x: sgn * 1.225, y: tubY, z: 0.52 });
    b.box(0.53, tubH, 0.04, mats.metalDark, { x: sgn * 1.225, y: tubY, z: -0.52 });
  }
  // Sills under the doors on both sides.
  for (const sign of [1, -1]) b.box(1.75, tubH, 0.18, mats.body, { x: 0.025, y: tubY, z: sign * (W + CAR.FAR_WALL_THICKNESS - 0.09) });
  // Transmission tunnel and the rear floor riser under the bench.
  b.box(2.1, 0.13, 0.26, mats.carpet, { x: -0.15, y: FT + 0.065 });
  b.box(0.6, 0.12, 1.1, mats.carpet, { x: -1.0, y: FT + 0.06 });
  // Bulkhead between the engine bay and the cabin.
  b.box(0.06, 0.61, CAR.WIDTH - 0.06, mats.metalDark, { x: 0.92, y: FT + 0.305 });
  // Bumpers — whole.
  const halfLength = CAR.LENGTH / 2;
  b.box(0.08, 0.16, CAR.WIDTH, mats.trim, { x: halfLength, y: 0.44 });
  b.box(0.08, 0.16, CAR.WIDTH, mats.trim, { x: -halfLength, y: 0.44 });

  // Engine — the thing that is running — under the bonnet.
  const ez = -0.07;
  b.box(0.5, 0.28, 0.58, mats.engine, { x: 1.3, y: 0.64, z: ez });
  b.box(0.4, 0.08, 0.46, mats.engineCover, { x: 1.3, y: 0.82, z: ez });
  b.cyl(0.1, 0.1, 0.05, mats.metalDark, { x: 1.25, y: 0.885, z: ez - 0.06 });
  b.cylX(0.03, 0.14, mats.rubber, { x: 1.19, y: 0.885, z: ez - 0.06 });
  b.cylX(0.09, 0.03, mats.metalDark, { x: 1.035, y: 0.6, z: ez + 0.04 });
  b.cylX(0.04, 0.03, mats.metal, { x: 1.035, y: 0.78, z: ez - 0.16 });
  b.box(0.04, 0.3, 0.64, mats.metalDark, { x: 1.82, y: 0.65 });
  b.cylX(0.14, 0.02, mats.metal, { x: 1.78, y: 0.65, z: 0 });
  b.box(0.2, 0.16, 0.2, mats.rubber, { x: 1.7, y: 0.58, z: -0.24 });
  b.cyl(0.012, 0.012, 0.03, mats.chrome, { x: 1.65, y: 0.675, z: -0.3 });
  b.cyl(0.012, 0.012, 0.03, mats.chrome, { x: 1.75, y: 0.675, z: -0.3 });
  b.cyl(0.05, 0.05, 0.14, mats.paper, { x: 1.65, y: 0.57, z: 0.3 });
  b.cylX(0.02, 0.5, mats.rubber, { x: 1.55, y: 0.72, z: -0.24 });

  // Exhaust: muffler, tailpipe, chrome tip peeking out below the rear bumper toward camera.
  const tip = new THREE.Vector3(...CAR.EXHAUST_TIP);
  b.cylX(0.07, 0.45, mats.metal, { x: -1.3, y: 0.22, z: -0.45 });
  b.cylX(0.028, 0.5, mats.metalDark, { x: -1.75, y: tip.y, z: tip.z });
  b.cylX(0.034, 0.08, mats.chrome, { x: tip.x, y: tip.y, z: tip.z });
  // Fuel tank under the rear floor.
  b.box(0.4, 0.16, 0.7, mats.rubber, { x: -1.1, y: 0.2 });

  // Exposed near-side suspension: strut, spring, lower arm and axle stub at each near wheel.
  for (const x of [CAR.WHEELBASE / 2, -CAR.WHEELBASE / 2]) {
    const z = -CAR.TRACK / 2 + 0.11;
    b.cyl(0.02, 0.02, 0.26, mats.metal, { x, y: 0.36, z });
    b.cyl(0.045, 0.045, 0.12, mats.metalDark, { x, y: 0.42, z });
    b.box(0.04, 0.03, 0.22, mats.metalDark, { x, y: 0.26, z: z + 0.08 });
    b.cylZ(0.03, 0.12, mats.metalDark, { x, y: CAR.WHEEL_RADIUS, z: z - 0.02 });
  }

  return { exhaustTip: tip };
}
