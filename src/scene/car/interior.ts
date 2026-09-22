import * as THREE from 'three';
import { CAR } from '../../core/constants';
import { Builder, CUT, mats, tilted } from './parts';
import { lerp } from '../../util/math';

/**
 * Dashboard, dials, steering wheel (right-hand drive), console, seats — the driver's intact,
 * the passenger's sectioned on the cut plane — rear bench, shelf and visors.
 */
export interface InteriorRig {
  group: THREE.Group;
  /** Steering wheel pivot at the hub; the driver's hands are parented here. */
  wheelNode: THREE.Group;
  setTacho(rpm: number): void;
  setSpeedo(kmh: number): void;
  /** 0..1 dash backlight, needles and LCD glow. */
  setDashGlow(k: number): void;
  dispose(): void;
}

const W = CAR.FAR_WALL_Z;
const halfW = CAR.WIDTH / 2;

function seat(b: Builder, zc: number): void {
  const hw = CAR.SEAT_WIDTH / 2;
  // Cushion with side bolsters and the frame beneath.
  b.cutBox(0.5, 0.14, zc - hw, zc + hw, mats.fabric, { x: 0.2, y: 0.51 }, 'foam');
  b.cutBox(0.5, 0.05, zc + hw - 0.08, zc + hw, mats.fabricDark, { x: 0.2, y: 0.605 });
  b.cutBox(0.5, 0.05, zc - hw, zc - hw + 0.08, mats.fabricDark, { x: 0.2, y: 0.605 });
  b.cutBox(0.4, 0.1, zc - 0.2, zc + 0.2, mats.metalDark, { x: 0.2, y: 0.39 });
  b.cutBox(0.5, 0.03, zc + 0.18, zc + 0.22, mats.metalDark, { x: 0.2, y: 0.335 });
  b.cutBox(0.5, 0.03, zc - 0.22, zc - 0.18, mats.metalDark, { x: 0.2, y: 0.335 });
  // Backrest, leaning back, with bolsters, a centre seam and a headrest on two posts.
  const tilt = 0.2;
  const [bx, by] = tilted(-0.03, 0.5, -0.07, 0.31, tilt);
  b.cutBox(0.14, 0.6, zc - hw, zc + hw, mats.fabric, { x: bx, y: by, rz: tilt }, 'foam');
  b.cutBox(0.16, 0.56, zc + hw - 0.07, zc + hw, mats.fabricDark, { x: bx, y: by, rz: tilt });
  b.cutBox(0.16, 0.56, zc - hw, zc - hw + 0.07, mats.fabricDark, { x: bx, y: by, rz: tilt });
  const [sx, sy] = tilted(-0.03, 0.5, -0.145, 0.31, tilt);
  b.cutBox(0.006, 0.5, zc - 0.012, zc + 0.012, mats.fabricDark, { x: sx, y: sy, rz: tilt });
  const [hx, hy] = tilted(-0.03, 0.5, -0.06, 0.7, tilt);
  b.cutBox(0.1, 0.13, zc - 0.13, zc + 0.13, mats.fabric, { x: hx, y: hy, rz: tilt }, 'foam');
  const [px, py] = tilted(-0.03, 0.5, -0.06, 0.615, tilt);
  b.cutBox(0.014, 0.05, zc + 0.05, zc + 0.064, mats.metal, { x: px, y: py, rz: tilt });
  b.cutBox(0.014, 0.05, zc - 0.064, zc - 0.05, mats.metal, { x: px, y: py, rz: tilt });
}

export function createInterior(): InteriorRig {
  const b = new Builder();

  // Dashboard: raised rear lip, deeper front section, knee panel beneath.
  b.cutBox(0.1, 0.23, -halfW, W, mats.vinyl, { x: 0.67, y: 0.875 });
  b.cutBox(0.18, 0.2, -halfW, W, mats.vinyl, { x: 0.81, y: 0.86 });
  b.cutBox(0.16, 0.3, -halfW, W, mats.vinylLight, { x: 0.82, y: 0.61 });
  // Binnacle hood over the wheel, two dials with emissive rings.
  b.box(0.16, 0.12, 0.34, mats.vinyl, { x: 0.58, y: 0.99, z: CAR.DRIVER_Z });
  const dialZ = [CAR.DRIVER_Z - 0.08, CAR.DRIVER_Z + 0.08] as const;
  for (const z of dialZ) {
    b.cylX(0.05, 0.01, mats.dialFace, { x: 0.505, y: 0.99, z });
    b.add(new THREE.TorusGeometry(0.046, 0.004, 8, 24), mats.dashGlow, { x: 0.5, y: 0.99, z, ry: Math.PI / 2 });
  }
  // Centre stack: vents, heater knobs, a cubby. The radio module fills the gap at y≈0.85.
  b.box(0.06, 0.44, 0.34, mats.vinyl, { x: 0.59, y: 0.72, z: 0 });
  b.box(0.01, 0.04, 0.1, mats.rubber, { x: 0.555, y: 0.905, z: -0.09 });
  b.box(0.01, 0.04, 0.1, mats.rubber, { x: 0.555, y: 0.905, z: 0.09 });
  for (const z of [-0.08, 0, 0.08]) b.cylX(0.014, 0.012, mats.hub, { x: 0.553, y: 0.7, z });
  b.box(0.01, 0.05, 0.2, mats.rubber, { x: 0.555, y: 0.585, z: 0 });
  // Gear lever and handbrake on the tunnel.
  b.box(0.1, 0.03, 0.1, mats.rubber, { x: 0.3, y: 0.465 });
  b.cyl(0.012, 0.012, 0.2, mats.chrome, { x: 0.3, y: 0.55 });
  b.sphere(0.03, mats.vinyl, { x: 0.3, y: 0.66 });
  b.cyl(0.012, 0.012, 0.22, mats.vinyl, { x: 0.0, y: 0.54, rz: 0.6 });

  // Seats: driver intact on the far side, passenger sectioned by the cut plane.
  seat(b, CAR.DRIVER_Z);
  seat(b, CAR.PASSENGER_Z);

  // Rear bench, headrests, parcel shelf.
  b.cutBox(0.5, 0.14, -0.72, W, mats.fabric, { x: -0.97, y: 0.51 }, 'foam');
  const benchTilt = 0.15;
  const [rbx, rby] = tilted(-1.2, 0.5, -0.06, 0.25, benchTilt);
  b.cutBox(0.12, 0.46, -0.72, W, mats.fabric, { x: rbx, y: rby, rz: benchTilt }, 'foam');
  const [rhx, rhy] = tilted(-1.2, 0.5, -0.06, 0.55, benchTilt);
  for (const z of [-0.4, 0.4]) b.cutBox(0.1, 0.12, z - 0.13, z + 0.13, mats.fabric, { x: rhx, y: rhy, rz: benchTilt });
  b.cutBox(0.5, 0.02, -0.72, W, mats.vinyl, { x: -1.55, y: 0.985 });

  // Sun visors: the far one whole, the near one sectioned like everything else on the plane.
  b.box(0.2, 0.012, 0.3, mats.vinyl, { x: 0.05, y: 1.32, z: 0.45 });
  b.cutBox(0.2, 0.012, -0.6, -0.3, mats.vinyl, { x: 0.05, y: 1.32 });

  // Steering wheel (live node) and column.
  const wheelNode = new THREE.Group();
  wheelNode.name = 'steeringWheel';
  wheelNode.position.set(...CAR.WHEEL_CENTRE);
  wheelNode.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...CAR.WHEEL_NORMAL));
  const wheelGeoms: THREE.BufferGeometry[] = [];
  const rim = new THREE.TorusGeometry(CAR.STEERING_RADIUS, 0.021, 10, 32);
  const hub = new THREE.CylinderGeometry(0.045, 0.045, 0.04, 16);
  hub.rotateX(Math.PI / 2);
  wheelGeoms.push(rim, hub);
  const rimMesh = new THREE.Mesh(rim, mats.vinyl);
  const hubMesh = new THREE.Mesh(hub, mats.vinyl);
  rimMesh.castShadow = hubMesh.castShadow = true;
  wheelNode.add(rimMesh, hubMesh);
  for (const a of [Math.PI, 0, -Math.PI / 2]) {
    const spoke = new THREE.BoxGeometry(0.022, 0.14, 0.018);
    spoke.translate(0, 0.095, 0);
    spoke.rotateZ(a - Math.PI / 2);
    wheelGeoms.push(spoke);
    const m = new THREE.Mesh(spoke, mats.vinyl);
    m.castShadow = true;
    wheelNode.add(m);
  }
  b.dyn(wheelNode, ...wheelGeoms);
  b.cyl(0.02, 0.02, 0.215, mats.vinyl, { x: 0.51, y: 0.895, z: CAR.DRIVER_Z, rz: 1.19 });

  // Needles (live).
  const needles: THREE.Group[] = [];
  const needleGeoms: THREE.BufferGeometry[] = [];
  for (const z of dialZ) {
    const g = new THREE.Group();
    g.position.set(0.496, 0.99, z);
    const geo = new THREE.BoxGeometry(0.004, 0.042, 0.004);
    geo.translate(0, 0.021, 0);
    needleGeoms.push(geo);
    g.add(new THREE.Mesh(geo, mats.needle));
    needles.push(g);
    b.dyn(g, geo);
  }
  const needleAngle = (k: number) => lerp(-2.1, 2.1, THREE.MathUtils.clamp(k, 0, 1));
  const [tacho, speedo] = needles as [THREE.Group, THREE.Group];
  tacho.rotation.x = needleAngle(0);
  speedo.rotation.x = needleAngle(0);

  const built = b.finish('interior');
  return {
    group: built.group,
    wheelNode,
    setTacho(rpm) {
      tacho.rotation.x = needleAngle(rpm / 8000);
    },
    setSpeedo(kmh) {
      speedo.rotation.x = needleAngle(kmh / 180);
    },
    setDashGlow(k) {
      mats.dashGlow.emissiveIntensity = k * 1.2;
      mats.needle.emissiveIntensity = k * 1.6;
      mats.lcd.emissiveIntensity = k * 0.9;
    },
    dispose() {
      built.dispose();
      for (const g of needleGeoms) g.dispose();
    },
  };
}

export { CUT };
