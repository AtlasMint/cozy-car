import * as THREE from 'three';
import type { VehicleSpec } from '../../core/vehicles';
import { Builder, paneGeometry } from './parts';
import type { CarMaterials } from './parts';

/**
 * The lived-in layer: rear-view mirror with an air freshener that swings, a coffee cup in
 * the holder, a jacket on the rear bench, a sticker on the rear glass and shelf clutter.
 */
export interface DressingRig {
  /** Pivot at the mirror; rotate x/z to swing the freshener. */
  freshener: THREE.Group;
}

export function createDressing(b: Builder, m: CarMaterials, v: VehicleSpec): DressingRig {

  // Rear-view mirror hanging from the header, reflective face toward the driver (and camera).
  b.cyl(0.008, 0.008, 0.1, m.trim, { x: 0.17, y: 1.3, rz: 0.54 });
  b.box(0.025, 0.07, 0.22, m.trim, { x: 0.21, y: 1.235, z: 0.02 });
  b.box(0.004, 0.055, 0.2, m.chrome, { x: 0.196, y: 1.235, z: 0.02 });

  // Air freshener: a little tree card on a string, pivoting from under the mirror.
  const freshener = new THREE.Group();
  freshener.name = 'freshener';
  freshener.position.set(...v.anchors.swingPivot);
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
  const fresh = m.freshener;
  fresh.side = THREE.DoubleSide;
  const stringMesh = new THREE.Mesh(stringGeom, m.paper);
  const treeMesh = new THREE.Mesh(treeGeom, fresh);
  treeMesh.castShadow = true;
  freshener.add(stringMesh, treeMesh);
  b.dyn(freshener, stringGeom, treeGeom);

  // Coffee in the cup holder on the tunnel.
  b.add(new THREE.TorusGeometry(0.045, 0.006, 8, 24), m.vinyl, { x: 0.14, y: 0.455, z: -0.08, rx: Math.PI / 2 });
  b.cyl(0.038, 0.032, 0.11, m.paper, { x: 0.14, y: 0.515, z: -0.08 });
  b.cyl(0.041, 0.037, 0.04, m.cardboard, { x: 0.14, y: 0.515, z: -0.08 });
  b.cyl(0.04, 0.04, 0.012, m.rubber, { x: 0.14, y: 0.576, z: -0.08 });

  // Jacket dumped on the rear bench.
  const lump = new THREE.SphereGeometry(0.2, 12, 8);
  lump.scale(1.0, 0.42, 1.15);
  b.add(lump, m.jacket, { x: -0.95, y: 0.62, z: 0.38 });
  b.cyl(0.05, 0.04, 0.3, m.jacket, { x: -0.86, y: 0.62, z: 0.14, rx: Math.PI / 2, rz: 0.3 });

  // Shelf clutter under the hatch glass and a round sticker on the glass, outside.
  b.box(0.16, 0.12, 0.22, m.cardboard, { x: -1.55, y: 1.055, z: 0.45 });
  b.cylZ(0.03, 0.25, m.paper, { x: -1.5, y: 1.025, z: 0.1 });
  const sticker = paneGeometry(-1.498, 1.212, -1.582, 1.148, 0.48, 0.62);
  sticker.translate(-0.61 * 0.005, 0.79 * 0.005, 0);
  m.sticker.side = THREE.DoubleSide;
  b.add(sticker, m.sticker);

  return { freshener };
}
