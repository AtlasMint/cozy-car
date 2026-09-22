import * as THREE from 'three';

/**
 * Lighting rig. Phase 1 ships a fixed clear-day rig; Phase 7 drives it from weather and
 * day/night. Exactly one light casts shadows, with a tight frustum around the car.
 */
export interface LightingRig {
  group: THREE.Group;
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  cabin: THREE.PointLight;
  dash: THREE.PointLight;
  /** 0..1: dash glow and the warm cabin pocket come up with the engine. */
  setIgnition(k: number): void;
  dispose(): void;
}

export function createLighting(): LightingRig {
  const group = new THREE.Group();
  group.name = 'lighting';

  const hemi = new THREE.HemisphereLight('#dfe8ee', '#8a7a68', 1.1);
  group.add(hemi);

  // The warm pocket: a cabin light and the amber dash glow. Neither casts shadows. The
  // contrast between this and the cool exterior is the whole mood.
  const cabin = new THREE.PointLight('#FFB86B', 3.0, 3.5, 1.6);
  cabin.position.set(0.15, 1.15, 0.15);
  cabin.name = 'cabinLight';
  const dash = new THREE.PointLight('#C9884A', 0, 1.6, 1.8);
  dash.position.set(0.5, 0.92, 0.1);
  dash.name = 'dashLight';
  // A little fill so the engine reads under the bonnet.
  const bay = new THREE.PointLight('#FFE2B8', 0.9, 1.6, 1.8);
  bay.position.set(1.3, 0.95, -0.45);
  bay.name = 'bayLight';
  group.add(cabin, dash, bay);

  const key = new THREE.DirectionalLight('#fff0d8', 2.4);
  // Front-left-above: daylight pours in through the cut and the shadow falls to screen-right.
  key.position.set(5, 8, -5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4.5;
  key.shadow.camera.right = 4.5;
  key.shadow.camera.top = 4.5;
  key.shadow.camera.bottom = -4.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  group.add(key, key.target);

  return {
    group,
    hemi,
    key,
    cabin,
    dash,
    setIgnition(k) {
      dash.intensity = 1.3 * k;
      cabin.intensity = 0.7 + 2.3 * k;
    },
    dispose() {
      key.shadow.dispose();
    },
  };
}
