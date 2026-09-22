import * as THREE from 'three';
import { CAR } from '../../core/constants';
import { Builder, CUT, mats, paneGeometry } from './parts';

/**
 * Far-side body wall, roof half, glass, bonnet, tailgate and the rear-end detail that faces
 * the camera. The near side is never built; sheared parts are capped in the cut material.
 */
export interface GlassPane {
  name: string;
  mesh: THREE.Mesh;
}

export interface ShellRig {
  group: THREE.Group;
  panes: GlassPane[];
  /** 0..1 intensities for the headlights and tail-lights. */
  setLights(head: number, tail: number): void;
  dispose(): void;
}

const S = CAR.SILL_Y;
const W = CAR.FAR_WALL_Z;
const T = CAR.FAR_WALL_THICKNESS;

function sideProfile(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-1.86, S);
  s.lineTo(-1.86, 0.52);
  s.lineTo(-1.8, 0.98);
  s.lineTo(-1.3, 1.37);
  s.quadraticCurveTo(-1.22, 1.415, -1.1, 1.415);
  s.lineTo(0.02, 1.415);
  s.quadraticCurveTo(0.12, 1.4, 0.18, 1.35);
  s.lineTo(0.62, 1.0);
  s.lineTo(0.66, 0.99);
  s.lineTo(1.85, 0.86);
  s.lineTo(1.9, 0.8);
  s.lineTo(1.9, S);
  // Bottom edge from the nose back to the tail, with a wheel arch over each wheel.
  const r = CAR.ARCH_RADIUS;
  const cy = CAR.WHEEL_RADIUS;
  const half = Math.sqrt(r * r - (S - cy) * (S - cy));
  const a0 = Math.asin((S - cy) / r);
  for (const cx of [CAR.WHEELBASE / 2, -CAR.WHEELBASE / 2]) {
    s.lineTo(cx + half, S);
    s.absarc(cx, cy, r, a0, Math.PI - a0, false);
  }
  s.lineTo(-1.86, S);

  const frontWindow = new THREE.Path();
  frontWindow.moveTo(0.5, 1.02);
  frontWindow.lineTo(0.17, 1.33);
  frontWindow.lineTo(-0.28, 1.33);
  frontWindow.lineTo(-0.28, 1.02);
  frontWindow.closePath();
  const rearWindow = new THREE.Path();
  rearWindow.moveTo(-0.38, 1.02);
  rearWindow.lineTo(-0.38, 1.33);
  rearWindow.lineTo(-1.1, 1.33);
  rearWindow.lineTo(-1.27, 1.02);
  rearWindow.closePath();
  s.holes.push(frontWindow, rearWindow);
  return s;
}

function pathShape(points: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

export function createShell(): ShellRig {
  const b = new Builder();
  const halfW = CAR.WIDTH / 2;
  const panes: GlassPane[] = [];
  const paneGeoms: THREE.BufferGeometry[] = [];

  const addPane = (name: string, geometry: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry, mats.glass);
    mesh.name = `glass:${name}`;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.renderOrder = 10;
    panes.push({ name, mesh });
    paneGeoms.push(geometry);
    b.dyn(mesh);
  };

  // Far wall: the whole side silhouette with window holes and wheel arches, 5 cm thick.
  const wall = new THREE.ExtrudeGeometry(sideProfile(), { depth: T, bevelEnabled: false, curveSegments: 6 });
  wall.translate(0, 0, W);
  b.add(wall, mats.body);

  // Far side glass sits mid-wall.
  const frontGlass = new THREE.ShapeGeometry(pathShape([[0.5, 1.02], [0.17, 1.33], [-0.28, 1.33], [-0.28, 1.02]]));
  frontGlass.translate(0, 0, W + T / 2);
  addPane('sideFront', frontGlass);
  const rearGlass = new THREE.ShapeGeometry(pathShape([[-0.38, 1.02], [-0.38, 1.33], [-1.1, 1.33], [-1.27, 1.02]]));
  rearGlass.translate(0, 0, W + T / 2);
  addPane('sideRear', rearGlass);

  // Roof half with headliner, and a small rear lip.
  b.cutBox(1.34, 0.05, -halfW, W + T, mats.body, { x: -0.55, y: 1.395 });
  b.cutBox(1.28, 0.016, -halfW, W, mats.fabricLight, { x: -0.55, y: 1.362 });
  b.cutBox(0.08, 0.035, -halfW, W + T, mats.body, { x: -1.26, y: 1.41 });

  // Bonnet — slightly raised over the engine — and the front panel, grille, far headlight.
  b.cutBox(1.197, 0.03, -halfW, W + T, mats.body, { x: 1.255, y: 0.925, rz: -0.1088 });
  b.cutBox(0.06, 0.34, -halfW, W + T, mats.body, { x: 1.88, y: 0.69 });
  b.box(0.012, 0.16, 0.5, mats.trim, { x: 1.915, y: 0.68 });
  b.cylX(0.075, 0.02, mats.headLight, { x: 1.915, y: 0.72, z: 0.56 });

  // Windshield and rear glass, cut at the plane.
  addPane('windshield', paneGeometry(0.62, 1.0, 0.17, 1.355, CUT, W - 0.005));
  addPane('rear', paneGeometry(-1.29, 1.375, -1.8, 0.98, CUT, W - 0.005));

  // Tailgate below the glass, tilted with the hatch line.
  b.cutBox(0.04, 0.485, -halfW, W + T, mats.body, { x: -1.83, y: 0.74, rz: -0.124 });
  // Rear end facing camera: far tail-light cluster, indicator, number plate, badge.
  b.box(0.045, 0.28, 0.26, mats.tailLight, { x: -1.8825, y: 0.76, z: W + T - 0.13 });
  b.box(0.045, 0.07, 0.26, mats.indicator, { x: -1.8825, y: 0.58, z: W + T - 0.13 });
  b.box(0.01, 0.14, 0.46, mats.trim, { x: -1.87, y: 0.63 });
  b.box(0.015, 0.12, 0.44, mats.plate, { x: -1.875, y: 0.63 });
  b.cylX(0.03, 0.012, mats.chrome, { x: -1.875, y: 0.88, z: 0.25 });
  // Rear wiper resting on the glass.
  b.box(0.01, 0.012, 0.3, mats.trim, { x: -1.76, y: 1.02, z: 0.45 });

  // Far door mirror and the interior door card on the wall's inner face.
  b.box(0.09, 0.06, 0.13, mats.body, { x: 0.5, y: 1.04, z: W + T + 0.065 });
  b.box(0.005, 0.045, 0.1, mats.chrome, { x: 0.453, y: 1.04, z: W + T + 0.065 });
  b.box(1.83, 0.5, 0.05, mats.vinyl, { x: -0.365, y: 0.71, z: W - 0.025 });
  b.box(1.6, 0.28, 0.012, mats.fabric, { x: -0.35, y: 0.7, z: W - 0.056 });
  b.box(0.55, 0.05, 0.1, mats.vinylLight, { x: 0.07, y: 0.72, z: W - 0.1 });
  b.box(0.1, 0.02, 0.03, mats.chrome, { x: 0.3, y: 0.83, z: W - 0.065 });

  const built = b.finish('shell');
  return {
    group: built.group,
    panes,
    setLights(head, tail) {
      mats.headLight.emissiveIntensity = head * 3.5;
      mats.tailLight.emissiveIntensity = 0.15 + tail * 2.2;
      mats.indicator.emissiveIntensity = 0.1 + tail * 0.6;
    },
    dispose() {
      built.dispose();
      for (const g of paneGeoms) g.dispose();
    },
  };
}
