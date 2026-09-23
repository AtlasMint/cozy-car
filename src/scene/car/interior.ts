import * as THREE from 'three';
import type { VehicleSpec } from '../../core/vehicles';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, tilted } from './parts';
import type { CarMaterials } from './parts';
import { lerp } from '../../util/math';

/**
 * Dashboard, dials, steering wheel (right-hand drive), console, both front seats, rear bench,
 * shelf and visors.
 */
export interface InteriorRig {
  /** Steering wheel pivot at the hub; the driver's hands are parented here. */
  wheelNode: THREE.Group;
  setTacho(rpm: number): void;
  setSpeedo(kmh: number): void;
  /** 0..1 dash backlight, needles and LCD glow. */
  setDashGlow(k: number): void;
}

function seat(b: Builder, m: CarMaterials, v: VehicleSpec, zc: number): void {
  const hw = v.cabin.seatWidth / 2;
  // Cushion with side bolsters and the frame beneath.
  b.spanBox(0.5, 0.14, zc - hw, zc + hw, m.fabric, { x: 0.2, y: 0.51 });
  b.spanBox(0.5, 0.05, zc + hw - 0.08, zc + hw, m.fabricDark, { x: 0.2, y: 0.605 });
  b.spanBox(0.5, 0.05, zc - hw, zc - hw + 0.08, m.fabricDark, { x: 0.2, y: 0.605 });
  b.spanBox(0.4, 0.1, zc - 0.2, zc + 0.2, m.metalDark, { x: 0.2, y: 0.39 });
  b.spanBox(0.5, 0.03, zc + 0.18, zc + 0.22, m.metalDark, { x: 0.2, y: 0.335 });
  b.spanBox(0.5, 0.03, zc - 0.22, zc - 0.18, m.metalDark, { x: 0.2, y: 0.335 });
  // Backrest, leaning back, with bolsters, a centre seam and a low headrest on two posts.
  // Kept low so the driver's shoulders and the back of their head clear it from the camera.
  const tilt = 0.2;
  const [bx, by] = tilted(-0.03, 0.5, -0.07, 0.24, tilt);
  b.spanBox(0.14, 0.46, zc - hw, zc + hw, m.fabric, { x: bx, y: by, rz: tilt });
  b.spanBox(0.16, 0.42, zc + hw - 0.07, zc + hw, m.fabricDark, { x: bx, y: by, rz: tilt });
  b.spanBox(0.16, 0.42, zc - hw, zc - hw + 0.07, m.fabricDark, { x: bx, y: by, rz: tilt });
  const [sx, sy] = tilted(-0.03, 0.5, -0.145, 0.24, tilt);
  b.spanBox(0.006, 0.38, zc - 0.012, zc + 0.012, m.fabricDark, { x: sx, y: sy, rz: tilt });
  const [hx, hy] = tilted(-0.03, 0.5, -0.06, 0.55, tilt);
  b.spanBox(0.1, 0.11, zc - 0.12, zc + 0.12, m.fabric, { x: hx, y: hy, rz: tilt });
  const [px, py] = tilted(-0.03, 0.5, -0.06, 0.485, tilt);
  b.spanBox(0.014, 0.05, zc + 0.05, zc + 0.064, m.metal, { x: px, y: py, rz: tilt });
  b.spanBox(0.014, 0.05, zc - 0.064, zc - 0.05, m.metal, { x: px, y: py, rz: tilt });
}

export function createInterior(b: Builder, m: CarMaterials, v: VehicleSpec): InteriorRig {
  const W = v.dims.wallZ;

  // Dashboard: raised rear lip, deeper front section, knee panel beneath, glovebox lid.
  b.spanBox(0.1, 0.23, -W, W, m.vinyl, { x: 0.67, y: 0.875 });
  b.spanBox(0.18, 0.2, -W, W, m.vinyl, { x: 0.81, y: 0.86 });
  b.spanBox(0.16, 0.3, -W, W, m.vinylLight, { x: 0.82, y: 0.61 });
  b.box(0.012, 0.16, 0.36, m.vinyl, { x: 0.735, y: 0.64, z: v.cabin.passengerZ - 0.04 });
  b.box(0.006, 0.015, 0.05, m.chrome, { x: 0.728, y: 0.7, z: v.cabin.passengerZ - 0.04 });
  // Binnacle hood over the wheel, two dials with emissive rings.
  b.box(0.16, 0.12, 0.34, m.vinyl, { x: 0.58, y: 0.99, z: v.cabin.driverZ });
  const dialZ = [v.cabin.driverZ - 0.08, v.cabin.driverZ + 0.08] as const;
  for (const z of dialZ) {
    b.cylX(0.05, 0.01, m.dialFace, { x: 0.505, y: 0.99, z });
    b.add(new THREE.TorusGeometry(0.046, 0.004, 8, 24), m.dashGlow, { x: 0.5, y: 0.99, z, ry: Math.PI / 2 });
  }
  // Centre stack: vents, heater knobs, a cubby. The radio module fills the gap at y≈0.85.
  b.box(0.06, 0.44, 0.34, m.vinyl, { x: 0.59, y: 0.72, z: 0 });
  b.box(0.01, 0.04, 0.1, m.rubber, { x: 0.555, y: 0.905, z: -0.09 });
  b.box(0.01, 0.04, 0.1, m.rubber, { x: 0.555, y: 0.905, z: 0.09 });
  for (const z of [-0.08, 0, 0.08]) b.cylX(0.014, 0.012, m.hub, { x: 0.553, y: 0.7, z });
  b.box(0.01, 0.05, 0.2, m.rubber, { x: 0.555, y: 0.585, z: 0 });
  // Gear lever and handbrake on the tunnel.
  b.box(0.1, 0.03, 0.1, m.rubber, { x: 0.3, y: 0.465 });
  b.cyl(0.012, 0.012, 0.2, m.chrome, { x: 0.3, y: 0.55 });
  b.sphere(0.03, m.vinyl, { x: 0.3, y: 0.66 });
  b.cyl(0.012, 0.012, 0.22, m.vinyl, { x: 0.0, y: 0.54, rz: 0.6 });

  // Seats.
  seat(b, m, v, v.cabin.driverZ);
  seat(b, m, v, v.cabin.passengerZ);

  // Rear bench, headrests, parcel shelf.
  b.spanBox(0.5, 0.14, -0.72, 0.72, m.fabric, { x: -0.97, y: 0.51 });
  const benchTilt = 0.15;
  const [rbx, rby] = tilted(-1.2, 0.5, -0.06, 0.25, benchTilt);
  b.spanBox(0.12, 0.46, -0.72, 0.72, m.fabric, { x: rbx, y: rby, rz: benchTilt });
  const [rhx, rhy] = tilted(-1.2, 0.5, -0.06, 0.55, benchTilt);
  for (const z of [-0.4, 0.4]) b.spanBox(0.1, 0.12, z - 0.13, z + 0.13, m.fabric, { x: rhx, y: rhy, rz: benchTilt });
  b.spanBox(0.5, 0.02, -W, W, m.vinyl, { x: -1.55, y: 0.985 });

  // Sun visors under the windshield header.
  for (const z of [-0.45, 0.45]) b.box(0.2, 0.012, 0.3, m.vinyl, { x: 0.05, y: 1.32, z });

  // Steering wheel (live node) and column.
  const wheelNode = new THREE.Group();
  wheelNode.name = 'steeringWheel';
  wheelNode.position.set(...v.cabin.wheelCentre);
  wheelNode.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...v.cabin.wheelNormal));
  const wheelParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(v.cabin.steeringRadius, 0.021, 10, 32)];
  const hub = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16);
  hub.rotateX(Math.PI / 2);
  wheelParts.push(hub);
  for (const a of [Math.PI, 0, -Math.PI / 2]) {
    const spoke = new THREE.BoxGeometry(0.022, 0.14, 0.018);
    spoke.translate(0, 0.095, 0);
    spoke.rotateZ(a - Math.PI / 2);
    wheelParts.push(spoke);
  }
  const wheelGeom = mergeGeometries(wheelParts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  for (const g of wheelParts) g.dispose();
  const wheelMesh = new THREE.Mesh(wheelGeom, m.vinyl);
  wheelMesh.castShadow = true;
  wheelNode.add(wheelMesh);
  b.dyn(wheelNode, wheelGeom);
  b.cyl(0.02, 0.02, 0.215, m.vinyl, { x: 0.51, y: 0.895, z: v.cabin.driverZ, rz: 1.19 });

  // Needles (live).
  const needles: THREE.Group[] = [];
  for (const z of dialZ) {
    const g = new THREE.Group();
    g.position.set(0.496, 0.99, z);
    const geo = new THREE.BoxGeometry(0.004, 0.042, 0.004);
    geo.translate(0, 0.021, 0);
    g.add(new THREE.Mesh(geo, m.needle));
    needles.push(g);
    b.dyn(g, geo);
  }
  const needleAngle = (k: number) => lerp(-2.1, 2.1, THREE.MathUtils.clamp(k, 0, 1));
  const [tacho, speedo] = needles as [THREE.Group, THREE.Group];
  tacho.rotation.x = needleAngle(0);
  speedo.rotation.x = needleAngle(0);

  return {
    wheelNode,
    setTacho(rpm) {
      tacho.rotation.x = needleAngle(rpm / v.gauges.rpmFull);
    },
    setSpeedo(kmh) {
      speedo.rotation.x = needleAngle(kmh / v.gauges.kmhFull);
    },
    setDashGlow(k) {
      m.dashGlow.emissiveIntensity = k * 1.2;
      m.needle.emissiveIntensity = k * 1.6;
      m.lcd.emissiveIntensity = k * 0.9;
    },
  };
}

