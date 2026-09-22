import * as THREE from 'three';
import { createSlab } from './world/slab';
import { createSky, type Sky } from './world/sky';

/**
 * Scene root and the node hierarchy every later system hangs off.
 *
 *  stageRoot
 *   ├─ slab                     (static)  ├─ road  └─ scenery
 *   ├─ carRoot                  (static at origin, NEVER translated)
 *   │   ├─ bodyRig              (engineRig writes y / pitch / roll here)
 *   │   │   ├─ chassis ├─ shell ├─ interior ├─ radio ├─ dressing └─ driverRoot
 *   │   └─ wheels               (each wheel: own y offset + spin, NOT under bodyRig)
 *   └─ weatherRoot
 */
export interface Stage {
  scene: THREE.Scene;
  root: THREE.Group;
  slab: THREE.Group;
  carRoot: THREE.Group;
  bodyRig: THREE.Group;
  wheels: THREE.Group;
  weatherRoot: THREE.Group;
  sky: Sky;
  fog: THREE.FogExp2;
  setFog(color: THREE.ColorRepresentation, density: number): void;
  dispose(): void;
}

export function createStage(): Stage {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'stageRoot';
  scene.add(root);

  const slabRig = createSlab();
  const slab = slabRig.group;
  slab.name = 'slab';
  root.add(slab);

  const carRoot = new THREE.Group();
  carRoot.name = 'carRoot';
  const bodyRig = new THREE.Group();
  bodyRig.name = 'bodyRig';
  const wheels = new THREE.Group();
  wheels.name = 'wheels';
  carRoot.add(bodyRig, wheels);
  root.add(carRoot);

  const weatherRoot = new THREE.Group();
  weatherRoot.name = 'weatherRoot';
  root.add(weatherRoot);

  const sky = createSky();
  scene.add(sky.mesh);

  const fog = new THREE.FogExp2(sky.fogColor.getHex(), 0.02);
  scene.fog = fog;
  scene.background = sky.fogColor;

  return {
    scene,
    root,
    slab,
    carRoot,
    bodyRig,
    wheels,
    weatherRoot,
    sky,
    fog,
    setFog(color, density) {
      fog.color.set(color);
      fog.density = density;
    },
    dispose() {
      slabRig.dispose();
      sky.dispose();
    },
  };
}
