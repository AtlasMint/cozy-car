import * as THREE from 'three';
import type { VehicleSpec } from '../../core/vehicles';
import type { Builder } from './parts';

/**
 * The horn: no geometry of its own, only the place you press it.
 *
 * A horn button is the middle of the steering wheel, and every vehicle already tells us where
 * that is — `cabin.wheelCentre` and `cabin.steeringRadius`, which the driver's grips are built
 * from. So this is a hitbox and nothing else, sized off the wheel it sits in, and it works on a
 * vehicle whose "wheel" is a grab bar across a hatch as readily as on one with a rim.
 *
 * It is parented to the car rather than to the live `wheelNode`, for the same reason the radio's
 * is: the wheel turns, and a hitbox that swung with it would be a target that moves while you
 * are reaching for it.
 */
export interface HornRig {
  hitbox: THREE.Mesh;
  dispose(): void;
}

/**
 * Half-extents, as multiples of the steering radius. Shallow across the car and generous in the
 * plane of the wheel: an oversized box, like every hitbox here, but not so deep that it reaches
 * the console behind it — on the hatchback the radio's own box starts 1 cm away.
 */
const DEPTH = 0.6;
const FACE = 1.05;

export function createHorn(b: Builder, v: VehicleSpec): HornRig {
  const [x, y, z] = v.cabin.wheelCentre;
  const r = v.cabin.steeringRadius;
  const geom = new THREE.BoxGeometry(r * DEPTH * 2, r * FACE * 2, r * FACE * 2);
  const hitbox = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: '#ff00ff' }));
  hitbox.position.set(x, y, z);
  hitbox.visible = false;
  hitbox.name = 'hitbox:horn';
  b.dyn(hitbox, geom);

  return {
    hitbox,
    dispose() {
      (hitbox.material as THREE.Material).dispose();
    },
  };
}
