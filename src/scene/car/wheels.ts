import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR, WORLD } from '../../core/constants';
import { mats } from './parts';

/**
 * Four wheels — chunky torus tyre and a five-spoke hub — each with its own spring offset
 * written by the engine rig and a spin rotation used in Focus. Wheels live outside bodyRig
 * so the body moves relative to them. Each part is one InstancedMesh with four instances;
 * `apply()` writes the instance matrices from the per-wheel transform nodes. A soft
 * contact-shadow disc under each wheel sells the weight.
 */
export interface Wheel {
  root: THREE.Group;
  spinner: THREE.Group;
  x: number;
  z: number;
  isFront: boolean;
  isNear: boolean;
  /** Metres of upward travel from the rest position. Applied on the next `apply()`. */
  springOffset: number;
}

export interface WheelsRig {
  group: THREE.Group;
  wheels: Wheel[];
  /** Advance every wheel's rotation by `distance` metres of travel. */
  roll(distance: number): void;
  /** Push spring offsets and spin into the instance matrices. Call once per frame. */
  apply(): void;
  dispose(): void;
}

function contactTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.6)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function nonIndexed(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  for (const g of list) g.dispose();
  return merged;
}

export function createWheels(): WheelsRig {
  const group = new THREE.Group();
  group.name = 'wheelSet';
  const R = CAR.WHEEL_RADIUS;
  const geoms: THREE.BufferGeometry[] = [];

  const tyre = new THREE.TorusGeometry(R - 0.09, 0.09, 12, 32);
  const hubParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(0.15, 0.014, 8, 32)];
  const cap = new THREE.CylinderGeometry(0.045, 0.045, CAR.WHEEL_WIDTH - 0.02, 16);
  cap.rotateX(Math.PI / 2);
  hubParts.push(cap);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(0.03, 0.13, CAR.WHEEL_WIDTH - 0.04);
    spoke.translate(0, 0.085, 0);
    spoke.rotateZ((i / 5) * Math.PI * 2);
    hubParts.push(spoke);
  }
  const hub = nonIndexed(hubParts);
  const disc = new THREE.CylinderGeometry(0.165, 0.165, CAR.WHEEL_WIDTH - 0.06, 24);
  disc.rotateX(Math.PI / 2);
  geoms.push(tyre, hub, disc);

  const parts = [
    new THREE.InstancedMesh(tyre, mats.tyre, 4),
    new THREE.InstancedMesh(hub, mats.hub, 4),
    new THREE.InstancedMesh(disc, mats.metalDark, 4),
  ];
  for (const p of parts) {
    p.castShadow = true;
    p.receiveShadow = true;
    p.frustumCulled = false;
    group.add(p);
  }

  const wheels: Wheel[] = [];
  const shadowGeoms: THREE.BufferGeometry[] = [];
  for (const isFront of [true, false]) {
    for (const isNear of [true, false]) {
      const x = (isFront ? 1 : -1) * (CAR.WHEELBASE / 2);
      const z = (isNear ? -1 : 1) * (CAR.TRACK / 2);
      const root = new THREE.Group();
      root.name = `wheel:${isFront ? 'front' : 'rear'}${isNear ? 'Near' : 'Far'}`;
      root.position.set(x, R, z);
      const spinner = new THREE.Group();
      root.add(spinner);
      group.add(root);
      wheels.push({ root, spinner, x, z, isFront, isNear, springOffset: 0 });

      const sg = new THREE.PlaneGeometry(0.8, 0.5);
      sg.rotateX(-Math.PI / 2);
      sg.translate(x, WORLD.ROAD_Y + 0.008, z);
      shadowGeoms.push(sg);
    }
  }
  const shadowTex = contactTexture();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadowGeom = nonIndexed(shadowGeoms);
  geoms.push(shadowGeom);
  const shadows = new THREE.Mesh(shadowGeom, shadowMat);
  shadows.renderOrder = 1;
  shadows.name = 'contactShadows';
  group.add(shadows);

  const apply = () => {
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i]!;
      w.root.position.y = R + w.springOffset;
      w.root.updateMatrix();
      w.spinner.updateMatrix();
      const m = w.root.matrix.clone().multiply(w.spinner.matrix);
      for (const p of parts) p.setMatrixAt(i, m);
    }
    for (const p of parts) p.instanceMatrix.needsUpdate = true;
  };
  apply();

  return {
    group,
    wheels,
    roll(distance) {
      const angle = distance / R;
      for (const w of wheels) w.spinner.rotation.z -= angle;
    },
    apply,
    dispose() {
      for (const g of geoms) g.dispose();
      for (const p of parts) p.dispose();
      shadowTex.dispose();
      shadowMat.dispose();
    },
  };
}
