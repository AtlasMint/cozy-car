import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR, WORLD } from '../../core/constants';
import { mats } from './parts';

/**
 * Four wheels — chunky torus tyre and a five-spoke hub — each with its own spring offset
 * written by the engine rig and a spin rotation used in Focus. Wheels live outside bodyRig
 * so the body moves relative to them. A soft contact-shadow disc under each sells the weight.
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
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function createWheels(): WheelsRig {
  const group = new THREE.Group();
  group.name = 'wheelSet';
  const R = CAR.WHEEL_RADIUS;
  const geoms: THREE.BufferGeometry[] = [];

  const tyre = new THREE.TorusGeometry(R - 0.09, 0.09, 12, 32);
  geoms.push(tyre);

  const hubParts: THREE.BufferGeometry[] = [];
  const ring = new THREE.TorusGeometry(0.15, 0.014, 8, 32);
  hubParts.push(ring);
  const cap = new THREE.CylinderGeometry(0.045, 0.045, CAR.WHEEL_WIDTH - 0.02, 16);
  cap.rotateX(Math.PI / 2);
  hubParts.push(cap);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(0.03, 0.13, CAR.WHEEL_WIDTH - 0.04);
    spoke.translate(0, 0.085, 0);
    spoke.rotateZ((i / 5) * Math.PI * 2);
    hubParts.push(spoke);
  }
  const hub = mergeGeometries(hubParts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  for (const g of hubParts) g.dispose();
  geoms.push(hub);
  const disc = new THREE.CylinderGeometry(0.165, 0.165, CAR.WHEEL_WIDTH - 0.06, 24);
  disc.rotateX(Math.PI / 2);
  geoms.push(disc);

  const shadowTex = contactTexture();
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadowGeom = new THREE.PlaneGeometry(0.8, 0.5);
  shadowGeom.rotateX(-Math.PI / 2);
  geoms.push(shadowGeom);

  const wheels: Wheel[] = [];
  for (const isFront of [true, false]) {
    for (const isNear of [true, false]) {
      const x = (isFront ? 1 : -1) * (CAR.WHEELBASE / 2);
      const z = (isNear ? -1 : 1) * (CAR.TRACK / 2);
      const root = new THREE.Group();
      root.name = `wheel:${isFront ? 'front' : 'rear'}${isNear ? 'Near' : 'Far'}`;
      root.position.set(x, R, z);
      const spinner = new THREE.Group();
      const tyreMesh = new THREE.Mesh(tyre, mats.tyre);
      const hubMesh = new THREE.Mesh(hub, mats.hub);
      const discMesh = new THREE.Mesh(disc, mats.metalDark);
      for (const m of [tyreMesh, hubMesh, discMesh]) {
        m.castShadow = true;
        m.receiveShadow = true;
        spinner.add(m);
      }
      root.add(spinner);
      group.add(root);

      const shadow = new THREE.Mesh(shadowGeom, shadowMat);
      shadow.position.set(x, WORLD.ROAD_Y + 0.008, z);
      shadow.renderOrder = 1;
      group.add(shadow);

      wheels.push({ root, spinner, x, z, isFront, isNear, springOffset: 0 });
    }
  }

  return {
    group,
    wheels,
    roll(distance) {
      const angle = distance / R;
      for (const w of wheels) w.spinner.rotation.z -= angle;
    },
    apply() {
      for (const w of wheels) w.root.position.y = R + w.springOffset;
    },
    dispose() {
      for (const g of geoms) g.dispose();
      shadowTex.dispose();
      shadowMat.dispose();
    },
  };
}
