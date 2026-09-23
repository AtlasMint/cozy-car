import * as THREE from 'three';
import type { DriverPose, VehicleSpec } from '../../core/vehicles';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { occupantMaterials } from '../car/parts';

/**
 * The driver: chunky, low-poly, built from capsules and spheres, seated in the right-hand
 * seat with hands at ten and two. The camera is behind them, so the shapes that matter are
 * the back of the head and hair, the shoulders and the hood bunched at the neck, and the
 * hoodie colour against the seat fabric. The face is two dark discs.
 *
 * Node chain: driverRoot → hips → torso → neck → head, plus shoulderL/R → (aimed segments)
 * → handL/R. Hand *targets* are parented to the steering wheel node so the hands follow it.
 */
export interface DriverFigure {
  /** The pose block this figure was built from. */
  pose: DriverPose;
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulders: [THREE.Object3D, THREE.Object3D];
  /** Rest grip points on the wheel, in the wheel node's space. Index 0 = left (near) hand. */
  gripTargets: [THREE.Object3D, THREE.Object3D];
  /** Where each hand currently is, world space. Idle writes these; `update()` aims the arms. */
  handTargets: [THREE.Vector3, THREE.Vector3];
  hands: [THREE.Mesh, THREE.Mesh];
  /** Re-aim the arm segments toward the current hand targets. Call once per frame. */
  update(): void;
  dispose(): void;
}

interface Place {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  sx?: number;
  sy?: number;
  sz?: number;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

function aim(node: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3): void {
  _dir.subVectors(to, from);
  const len = Math.max(0.01, _dir.length());
  _dir.divideScalar(len);
  node.quaternion.setFromUnitVectors(Y_AXIS, _dir);
  node.position.copy(from).addScaledVector(_dir, len / 2);
  node.scale.set(1, len, 1);
}

export function createDriverFigure(wheelNode: THREE.Object3D, parent: THREE.Object3D, v: VehicleSpec): DriverFigure {
  const m = occupantMaterials();
  const geoms: THREE.BufferGeometry[] = [];
  const g = <T extends THREE.BufferGeometry>(geom: T): T => {
    geoms.push(geom);
    return geom;
  };
  const mesh = (geom: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  /** Merge several placed parts of one material into a single static mesh under `parent`. */
  const fuse = (parent: THREE.Object3D, mat: THREE.Material, parts: { geom: THREE.BufferGeometry; p?: Place }[]) => {
    const list = parts.map(({ geom, p }) => {
      const geometry = geom.index ? geom.toNonIndexed() : geom;
      if (p) {
        const m = new THREE.Matrix4().compose(
          new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0)),
          new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1),
        );
        geometry.applyMatrix4(m);
      }
      return geometry;
    });
    const merged = g(mergeGeometries(list, false)!);
    for (const l of list) l.dispose();
    const m = mesh(merged, mat);
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  root.name = 'driver';
  parent.add(root);

  const hips = new THREE.Group();
  hips.name = 'hips';
  const P = v.pose;
  hips.position.set(P.hips[0], P.hips[1], P.hips[2]);
  root.add(hips);
  hips.add(mesh(g(new THREE.SphereGeometry(0.15, 12, 8)).scale(1.1, 0.7, 1.25), m.denim));

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.rotation.z = P.torsoLean; // leaning back into the seat
  hips.add(torso);
  // Torso capsule and shoulder caps fused into one hoodie mesh; the hood bunched at the
  // back of the neck and the drawstrings ride along as their own small meshes.
  fuse(torso, m.hoodie, [
    { geom: new THREE.CapsuleGeometry(0.15, 0.14, 4, 12), p: { y: 0.22, sz: 1.2 } },
    { geom: new THREE.SphereGeometry(0.065, 10, 8), p: { x: 0.02, y: 0.36, z: -0.19 } },
    { geom: new THREE.SphereGeometry(0.065, 10, 8), p: { x: 0.02, y: 0.36, z: 0.19 } },
  ]);
  const hood = mesh(g(new THREE.TorusGeometry(0.1, 0.048, 8, 18)), m.hoodieDark);
  hood.rotation.x = Math.PI / 2;
  hood.position.set(-0.05, 0.4, 0);
  hood.scale.set(1, 1.15, 1);
  torso.add(hood);
  fuse(torso, m.paper, [
    { geom: new THREE.CylinderGeometry(0.004, 0.004, 0.12, 5), p: { x: 0.14, y: 0.3, z: -0.035 } },
    { geom: new THREE.CylinderGeometry(0.004, 0.004, 0.12, 5), p: { x: 0.14, y: 0.3, z: 0.035 } },
  ]);

  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0.0, 0.44, 0);
  torso.add(neck);
  neck.add(mesh(g(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 10)), m.skin));

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0.0, 0.16, 0);
  neck.add(head);
  fuse(head, m.skin, [
    { geom: new THREE.SphereGeometry(0.14, 16, 12) },
    { geom: new THREE.SphereGeometry(0.03, 8, 6), p: { x: -0.01, y: -0.01, z: -0.14 } },
    { geom: new THREE.SphereGeometry(0.03, 8, 6), p: { x: -0.01, y: -0.01, z: 0.14 } },
  ]);
  fuse(head, m.hair, [
    { geom: new THREE.SphereGeometry(0.146, 16, 12), p: { x: -0.025, y: 0.03, sy: 0.92 } },
    { geom: new THREE.SphereGeometry(0.1, 12, 8), p: { x: 0.06, y: 0.09, sx: 0.9, sy: 0.5, sz: 1.1 } },
    { geom: new THREE.SphereGeometry(0.014, 8, 6), p: { x: 0.128, z: -0.055 } },
    { geom: new THREE.SphereGeometry(0.014, 8, 6), p: { x: 0.128, z: 0.055 } },
  ]);

  // Shoulder pivots on the torso (their caps are part of the fused torso mesh).
  const shoulderL = new THREE.Object3D();
  shoulderL.position.set(0.02, 0.36, -0.19);
  const shoulderR = new THREE.Object3D();
  shoulderR.position.set(0.02, 0.36, 0.19);
  torso.add(shoulderL, shoulderR);

  // Grip points on the wheel at ten and two, in wheel space.
  const centre = new THREE.Vector3(...v.cabin.wheelCentre);
  const n = new THREE.Vector3(...v.cabin.wheelNormal);
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
  const right = new THREE.Vector3().crossVectors(up, n).normalize();
  const gripWorld = (angleDeg: number) => {
    const a = (angleDeg * Math.PI) / 180;
    return centre.clone().addScaledVector(right, Math.cos(a) * v.cabin.steeringRadius).addScaledVector(up, Math.sin(a) * v.cabin.steeringRadius);
  };
  wheelNode.updateWorldMatrix(true, false);
  const gripL = new THREE.Object3D();
  gripL.name = 'gripL';
  gripL.position.copy(wheelNode.worldToLocal(gripWorld(P.gripAngles[0])));
  const gripR = new THREE.Object3D();
  gripR.name = 'gripR';
  gripR.position.copy(wheelNode.worldToLocal(gripWorld(P.gripAngles[1])));
  wheelNode.add(gripL, gripR);

  // Arms: two aimed segments each, joints as spheres, hands as slightly flattened spheres.
  const upperGeom = g(new THREE.CylinderGeometry(0.052, 0.058, 1, 10));
  const foreGeom = g(new THREE.CylinderGeometry(0.045, 0.05, 1, 10));
  const jointGeom = g(new THREE.SphereGeometry(0.052, 10, 8));
  const handGeom = g(new THREE.SphereGeometry(0.048, 10, 8));
  const arms = [shoulderL, shoulderR].map((shoulder, i) => {
    const upper = mesh(upperGeom, m.hoodie);
    const fore = mesh(foreGeom, m.hoodie);
    const elbow = mesh(jointGeom, m.hoodie);
    const hand = mesh(handGeom, m.skin);
    hand.scale.set(1, 0.8, 1.1);
    root.add(upper, fore, elbow, hand);
    return { shoulder, upper, fore, elbow, hand, outward: i === 0 ? -1 : 1 };
  });
  const hands: [THREE.Mesh, THREE.Mesh] = [arms[0]!.hand, arms[1]!.hand];
  const handTargets: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];

  // Legs: thighs along the cushion, shins dropping toward the pedals. Static, fused.
  const legParts: { geom: THREE.BufferGeometry; p?: Place }[] = [];
  const tmpObj = new THREE.Object3D();
  const placed = (geom: THREE.BufferGeometry, from: THREE.Vector3, to: THREE.Vector3) => {
    aim(tmpObj, from, to);
    tmpObj.updateMatrix();
    geom.applyMatrix4(tmpObj.matrix);
    legParts.push({ geom });
  };
  for (const dz of [-P.legSplay, P.legSplay]) {
    const z = P.hips[2] + dz;
    placed(new THREE.CylinderGeometry(0.075, 0.07, 1, 10), new THREE.Vector3(P.hips[0] + 0.02, P.hips[1] + 0.03, z), new THREE.Vector3(P.knee[0], P.knee[1], z));
    legParts.push({ geom: new THREE.SphereGeometry(0.072, 10, 8), p: { x: P.knee[0], y: P.knee[1], z } });
    placed(new THREE.CylinderGeometry(0.06, 0.055, 1, 10), new THREE.Vector3(P.knee[0], P.knee[1], z), new THREE.Vector3(P.foot[0], P.foot[1], z));
  }
  fuse(root, m.denim, legParts);

  const figure: DriverFigure = {
    pose: P,
    root,
    hips,
    torso,
    neck,
    head,
    shoulders: [shoulderL, shoulderR],
    gripTargets: [gripL, gripR],
    handTargets,
    hands,
    update() {
      root.updateWorldMatrix(true, false);
      for (let i = 0; i < 2; i++) {
        const arm = arms[i]!;
        arm.shoulder.getWorldPosition(_from);
        _to.copy(handTargets[i]!);
        // Elbow: below the shoulder–hand line and slightly outward, so the arm bends naturally.
        _mid.lerpVectors(_from, _to, 0.5);
        _mid.y -= 0.09;
        _mid.z += arm.outward * 0.03;
        // Work in root space (root has identity transform under driverRoot, which inherits body motion).
        root.worldToLocal(_from);
        root.worldToLocal(_mid);
        root.worldToLocal(_to);
        aim(arm.upper, _from, _mid);
        aim(arm.fore, _mid, _to);
        arm.elbow.position.copy(_mid);
        arm.hand.position.copy(_to);
      }
    },
    dispose() {
      for (const geom of geoms) geom.dispose();
      parent.remove(root);
      wheelNode.remove(gripL, gripR);
    },
  };
  // Initial pose: hands on the wheel.
  gripL.getWorldPosition(handTargets[0]);
  gripR.getWorldPosition(handTargets[1]);
  figure.update();
  return figure;
}
