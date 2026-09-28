import * as THREE from 'three';
import type { VehicleId } from '../../core/store';
import { createRoad } from './road';
import { createScenery } from './scenery';

/**
 * What the vehicle stands in. One interface, so that a place can be exchanged for another
 * without the director or the tick knowing which is under the wheels.
 *
 * The road and the scenery used to be two objects that main.ts and the weather director each
 * talked to separately — four call sites for one idea. A second world would have made that
 * four objects and eight. Behind this, a world is one thing with one `update`, and what a
 * world is made of is its own business.
 */
export interface LampHead {
  position: THREE.Vector3;
  /** 1 is a streetlight. A lantern on a table is a good deal less. */
  intensity: number;
}

export interface World {
  group: THREE.Group;
  /** Per frame. A treadmill scrolls by `speed`; a place that does not move ignores it. */
  update(dt: number, speed: number): void;
  /** 0..1: lamp heads glow. */
  setNight(night: number): void;
  /** 0 = dry, 1 = soaked. */
  setWetness(wet: number): void;
  /** The lamp heads nearest the vehicle, for the point lights that track them. Returns how many. */
  lampHeads(out: LampHead[]): number;
  /** The vehicle just arrived. A world with furniture of its own per vehicle swaps it here. */
  setVehicle(id: VehicleId): void;
  setVisible(on: boolean): void;
  dispose(): void;
}

/** The roadside: the scrolling road and the treadmill of scenery beside it. */
export function createRoadWorld(maxAnisotropy: number): World {
  const road = createRoad(maxAnisotropy);
  const scenery = createScenery();
  const group = new THREE.Group();
  group.name = 'world:road';
  group.add(road.mesh, scenery.group);
  // Scratch for the head positions; the scenery only ever reports as many as it has lights for.
  const scratch = [new THREE.Vector3(), new THREE.Vector3()];

  return {
    group,
    update(dt, speed) {
      road.scroll(speed * dt);
      scenery.update(dt, speed);
    },
    setNight: (night) => scenery.setNight(night),
    setWetness: (wet) => road.setWetness(wet),
    lampHeads(out) {
      const n = Math.min(scenery.streetlightHeads(scratch), out.length);
      for (let i = 0; i < n; i++) {
        out[i]!.position.copy(scratch[i]!);
        out[i]!.intensity = 1;
      }
      return n;
    },
    setVehicle() {
      /* the roadside is the same for every vehicle */
    },
    setVisible(on) {
      group.visible = on;
    },
    dispose() {
      road.dispose();
      scenery.dispose();
    },
  };
}
