import * as THREE from 'three';

/**
 * Lighting rig. Phase 1 ships a fixed clear-day rig; Phase 7 drives it from weather and
 * day/night. Exactly one light casts shadows, with a tight frustum around the car.
 */
export interface LightingRig {
  group: THREE.Group;
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  dispose(): void;
}

export function createLighting(): LightingRig {
  const group = new THREE.Group();
  group.name = 'lighting';

  const hemi = new THREE.HemisphereLight('#dfe8ee', '#6b5f52', 0.9);
  group.add(hemi);

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
    dispose() {
      key.shadow.dispose();
    },
  };
}
