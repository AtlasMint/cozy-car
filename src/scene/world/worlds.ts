import * as THREE from 'three';
import type { LampHead, World } from './world';

/**
 * Both places the vehicle can stand, behind the face of one.
 *
 * This is itself a `World`: the tick and the director call it exactly as they called the road
 * world, and which place answers is decided by `show`. Night and wetness go to both, so the
 * one out of sight stays in step and does not pop when it comes back; lamp heads come from the
 * one on show, because the point lights that track them should be where the light is.
 */
export type WorldId = 'road' | 'lot';

export interface Worlds extends World {
  show(which: WorldId): void;
  readonly shown: WorldId;
}

export function createWorlds(road: World, lot: World): Worlds {
  const group = new THREE.Group();
  group.name = 'worlds';
  group.add(road.group, lot.group);
  const both = { road, lot };
  let shown: WorldId = 'road';
  road.setVisible(true);
  lot.setVisible(false);

  return {
    group,
    get shown() {
      return shown;
    },
    show(which) {
      if (which === shown) return;
      shown = which;
      road.setVisible(which === 'road');
      lot.setVisible(which === 'lot');
    },
    update: (dt, speed) => both[shown].update(dt, speed),
    setNight(night) {
      road.setNight(night);
      lot.setNight(night);
    },
    setWetness(wet) {
      road.setWetness(wet);
      lot.setWetness(wet);
    },
    lampHeads: (out: LampHead[]) => both[shown].lampHeads(out),
    setVehicle(id) {
      road.setVehicle(id);
      lot.setVehicle(id);
    },
    setVisible(on) {
      group.visible = on;
    },
    dispose() {
      road.dispose();
      lot.dispose();
    },
  };
}
