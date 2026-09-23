import * as THREE from 'three';
import type { VehicleSpec } from '../../core/vehicles';
import { Builder, paneGeometry } from './parts';
import type { CarMaterials } from './parts';

/**
 * Body shell: both side walls (doors, pillars, window frames), bonnet, front and rear panels,
 * tailgate, all glass, lights and mirrors. There is no roof panel — the cabin is open to the
 * sky so the camera looks straight down into it — but the window frames and header rails stay,
 * so the hatchback silhouette still reads.
 */
export interface GlassPane {
  name: string;
  mesh: THREE.Mesh;
}

export interface ShellRig {
  panes: GlassPane[];
  /** 0..1 intensities for the headlights and tail-lights. */
  setLights(head: number, tail: number): void;
}

/** The two side windows, whose sill sits on the vehicle's belt line. */
function windows(v: VehicleSpec): [number, number][][] {
  const B = v.dims.beltY;
  return [
    [[0.5, B], [0.17, 1.33], [-0.28, 1.33], [-0.28, B]],
    [[-0.38, B], [-0.38, 1.33], [-1.1, 1.33], [-1.27, B]],
  ];
}

function sideProfile(v: VehicleSpec): THREE.Shape {
  const S = v.dims.sillY;
  const R = v.dims.wallTopY;
  const s = new THREE.Shape();
  s.moveTo(-1.86, S);
  s.lineTo(-1.86, 0.52);
  s.lineTo(-1.8, 0.98);
  s.lineTo(-1.3, 1.37);
  s.quadraticCurveTo(-1.22, R, -1.1, R);
  s.lineTo(0.02, R);
  s.quadraticCurveTo(0.12, 1.4, 0.18, 1.35);
  s.lineTo(0.62, 1.0);
  s.lineTo(0.66, 0.99);
  s.lineTo(1.85, 0.86);
  s.lineTo(1.9, 0.8);
  s.lineTo(1.9, S);
  // Bottom edge from the nose back to the tail, with a wheel arch over each wheel.
  const r = v.dims.archRadius;
  const cy = v.dims.wheelRadius;
  const half = Math.sqrt(r * r - (S - cy) * (S - cy));
  const a0 = Math.asin((S - cy) / r);
  for (const cx of [v.dims.wheelbase / 2, -v.dims.wheelbase / 2]) {
    s.lineTo(cx + half, S);
    s.absarc(cx, cy, r, a0, Math.PI - a0, false);
  }
  s.lineTo(-1.86, S);
  for (const win of windows(v)) {
    const hole = new THREE.Path();
    win.forEach(([x, y], i) => (i === 0 ? hole.moveTo(x, y) : hole.lineTo(x, y)));
    hole.closePath();
    s.holes.push(hole);
  }
  return s;
}

function pathShape(points: [number, number][]): THREE.Shape {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

export function createShell(b: Builder, m: CarMaterials, v: VehicleSpec): ShellRig {
  const S = v.dims.sillY;
  const W = v.dims.wallZ;
  const T = v.dims.wallThickness;
  const [FRONT_WINDOW, REAR_WINDOW] = windows(v);
  const panes: GlassPane[] = [];

  const addPane = (name: string, geometry: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry, m.glass);
    mesh.name = `glass:${name}`;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.renderOrder = 10;
    panes.push({ name, mesh });
    b.dyn(mesh, geometry);
  };

  for (const sign of [1, -1]) {
    const side = sign > 0 ? 'Far' : 'Near';
    // Side wall: the whole silhouette with window holes and wheel arches, 5 cm thick.
    const wall = new THREE.ExtrudeGeometry(sideProfile(v), { depth: T, bevelEnabled: false, curveSegments: 6 });
    wall.translate(0, 0, sign > 0 ? W : -W - T);
    b.add(wall, m.body);
    // Side glass sits mid-wall.
    const zGlass = sign * (W + T / 2);
    const front = new THREE.ShapeGeometry(pathShape(FRONT_WINDOW));
    front.translate(0, 0, zGlass);
    addPane(`sideFront${side}`, front);
    const rear = new THREE.ShapeGeometry(pathShape(REAR_WINDOW));
    rear.translate(0, 0, zGlass);
    addPane(`sideRear${side}`, rear);
    // Door mirror.
    b.box(0.09, 0.06, 0.13, m.body, { x: 0.5, y: 1.04, z: sign * (W + T + 0.065) });
    b.box(0.005, 0.045, 0.1, m.chrome, { x: 0.453, y: 1.04, z: sign * (W + T + 0.065) });
    // Door card on the inner face: fabric insert, armrest, inner handle.
    b.box(1.83, 0.5, 0.05, m.vinyl, { x: -0.365, y: 0.71, z: sign * (W - 0.025) });
    b.box(1.6, 0.28, 0.012, m.fabric, { x: -0.35, y: 0.7, z: sign * (W - 0.056) });
    b.box(0.55, 0.05, 0.1, m.vinylLight, { x: 0.07, y: 0.72, z: sign * (W - 0.1) });
    b.box(0.1, 0.02, 0.03, m.chrome, { x: 0.3, y: 0.83, z: sign * (W - 0.065) });
    // Tail-light cluster and indicator on each rear corner; headlight on each front corner.
    b.box(0.045, 0.28, 0.26, m.tailLight, { x: -1.8825, y: 0.76, z: sign * (W + T - 0.13) });
    b.box(0.045, 0.07, 0.26, m.indicator, { x: -1.8825, y: 0.58, z: sign * (W + T - 0.13) });
    b.cylX(0.075, 0.02, m.headLight, { x: 1.915, y: 0.72, z: sign * 0.56 });
  }

  // Header rails where a roof would meet the glass: the windshield header and the hatch hinge.
  b.box(0.16, 0.055, v.dims.width, m.body, { x: 0.1, y: 1.3875 });
  b.box(0.1, 0.05, v.dims.width, m.body, { x: -1.25, y: 1.39 });

  // Bonnet — slightly raised over the engine — front panel and grille.
  b.spanBox(1.197, 0.03, -W - T, W + T, m.body, { x: 1.255, y: 0.925, rz: -0.1088 });
  b.spanBox(0.06, 0.34, -W - T, W + T, m.body, { x: 1.88, y: 0.69 });
  b.box(0.012, 0.16, 0.5, m.trim, { x: 1.915, y: 0.68 });

  // Windshield and hatch glass, wall to wall.
  addPane('windshield', paneGeometry(0.62, 1.0, 0.17, 1.355, -W + 0.005, W - 0.005));
  addPane('rear', paneGeometry(-1.29, 1.375, -1.8, 0.98, -W + 0.005, W - 0.005));

  // Tailgate below the glass, tilted with the hatch line; number plate, badge, rear wiper.
  b.spanBox(0.04, 0.485, -W - T, W + T, m.body, { x: -1.83, y: 0.74, rz: -0.124 });
  b.box(0.01, 0.14, 0.46, m.trim, { x: -1.87, y: 0.63 });
  b.box(0.015, 0.12, 0.44, m.plate, { x: -1.875, y: 0.63 });
  b.cylX(0.03, 0.012, m.chrome, { x: -1.875, y: 0.88, z: 0.25 });
  b.box(0.01, 0.012, 0.3, m.trim, { x: -1.76, y: 1.02, z: 0.45 });

  return {
    panes,
    setLights(head, tail) {
      m.headLight.emissiveIntensity = head * 3.5;
      m.tailLight.emissiveIntensity = 0.15 + tail * 1.1;
      m.indicator.emissiveIntensity = 0.1 + tail * 0.6;
    },
  };
}
