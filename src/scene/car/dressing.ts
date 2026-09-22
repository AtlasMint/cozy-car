import * as THREE from 'three';
import { CAR } from '../../core/constants';
import { Builder, mats, paneGeometry } from './parts';

/**
 * The lived-in layer: rear-view mirror with an air freshener that swings, a coffee cup in
 * the holder, a jacket on the rear bench, a sticker on the rear glass and shelf clutter.
 */
export interface DressingRig {
  group: THREE.Group;
  /** Pivot at the mirror; rotate x/z to swing the freshener. */
  freshener: THREE.Group;
  dispose(): void;
}

export function createDressing(): DressingRig {
  const b = new Builder();
  const W = CAR.FAR_WALL_Z;

  // Rear-view mirror hanging from the header, reflective face toward the driver (and camera).
  b.cyl(0.008, 0.008, 0.1, mats.trim, { x: 0.17, y: 1.3, rz: 0.54 });
  b.box(0.025, 0.07, 0.22, mats.trim, { x: 0.21, y: 1.235, z: 0.02 });
  b.box(0.004, 0.055, 0.2, mats.chrome, { x: 0.196, y: 1.235, z: 0.02 });

  // Air freshener: a little tree card on a string, pivoting from under the mirror.
  const freshener = new THREE.Group();
  freshener.name = 'freshener';
  freshener.position.set(...CAR.MIRROR_PIVOT);
  const stringGeom = new THREE.CylinderGeometry(0.0015, 0.0015, 0.11, 6);
  stringGeom.translate(0, -0.055, 0);
  const tree = new THREE.Shape();
  tree.moveTo(0, 0.055);
  tree.lineTo(-0.042, -0.035);
  tree.lineTo(-0.012, -0.035);
  tree.lineTo(-0.012, -0.06);
  tree.lineTo(0.012, -0.06);
  tree.lineTo(0.012, -0.035);
  tree.lineTo(0.042, -0.035);
  tree.closePath();
  const treeGeom = new THREE.ShapeGeometry(tree);
  treeGeom.translate(0, -0.165, 0);
  const fresh = mats.freshener;
  fresh.side = THREE.DoubleSide;
  const stringMesh = new THREE.Mesh(stringGeom, mats.paper);
  const treeMesh = new THREE.Mesh(treeGeom, fresh);
  treeMesh.castShadow = true;
  freshener.add(stringMesh, treeMesh);
  b.dyn(freshener, stringGeom, treeGeom);

  // Coffee in the cup holder on the tunnel.
  b.add(new THREE.TorusGeometry(0.045, 0.006, 8, 24), mats.vinyl, { x: 0.14, y: 0.455, z: -0.08, rx: Math.PI / 2 });
  b.cyl(0.038, 0.032, 0.11, mats.paper, { x: 0.14, y: 0.515, z: -0.08 });
  b.cyl(0.041, 0.037, 0.04, mats.cardboard, { x: 0.14, y: 0.515, z: -0.08 });
  b.cyl(0.04, 0.04, 0.012, mats.rubber, { x: 0.14, y: 0.576, z: -0.08 });

  // Jacket dumped on the rear bench.
  const lump = new THREE.SphereGeometry(0.2, 12, 8);
  lump.scale(1.0, 0.42, 1.15);
  b.add(lump, mats.jacket, { x: -0.95, y: 0.62, z: 0.38 });
  b.cyl(0.05, 0.04, 0.3, mats.jacket, { x: -0.86, y: 0.62, z: 0.14, rx: Math.PI / 2, rz: 0.3 });

  // Shelf clutter under the hatch glass and a round sticker on the glass, outside.
  b.box(0.16, 0.12, 0.22, mats.cardboard, { x: -1.55, y: 1.055, z: 0.45 });
  b.cylZ(0.03, 0.25, mats.paper, { x: -1.5, y: 1.025, z: 0.1 });
  const sticker = paneGeometry(-1.498, 1.212, -1.582, 1.148, 0.48, 0.62);
  sticker.translate(-0.61 * 0.005, 0.79 * 0.005, 0);
  mats.sticker.side = THREE.DoubleSide;
  b.add(sticker, mats.sticker);

  const built = b.finish('dressing');
  void W;
  return { group: built.group, freshener, dispose: built.dispose };
}
