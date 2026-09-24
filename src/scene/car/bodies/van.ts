import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, paneGeometry, type CarMaterials } from '../parts';
import { seeThrough, type BodyKit, type VehicleSpec } from '../../../core/vehicles';
import type { GlassPane } from '../shell';
import { lerp } from '../../../util/math';

/**
 * The camper van: a high-top van with a lived-in back, at the height one actually is.
 *
 * It used to be 1.95 m, which is a number solved for rather than measured: a point inside the
 * cabin clears the near wall only when `y + z + wallZ > wallTopY`, and 1.95 was the tallest
 * roof that still showed the hatchback's ~30% of floor. At 2.58 m — a real 5.6 m panel van with
 * a high top — `floorExposure` is zero and the solid near wall shows you nothing at all.
 *
 * So the two walls this camera looks through — the near one at −z and the rear one at −x — are
 * simply not built, exactly as the roof is not built. `seeThrough(v)` decides it from the
 * geometry, so the two facts cannot drift.
 *
 * What stays is what stays on the roof: the frame. Two posts and the wall-top rail outline the
 * near opening, the rear pillars carry its lights, and each near wheel keeps an arch, because
 * a wheel's top sits above the floor line and without one it would rise into the room. The
 * engine bay keeps its whole wing: there is nothing behind it worth seeing, and the front wheel
 * gets its arch from it for free.
 *
 * The long flank, the open wall-top rail and the dinette table under its light are the three
 * hero shapes. See PLAN-cars.md §15.
 */

const LIVING_X0 = -2.8;
const LIVING_X1 = 1.3;

/** Side window band: sill on the vehicle's belt line, half a metre of glass above it. */
const WINDOW_H = 0.5;

function sideProfile(v: VehicleSpec): THREE.Shape {
  const S = v.dims.sillY;
  const DECK = v.dims.wallTopY;
  const half = v.dims.length / 2;
  const s = new THREE.Shape();
  s.moveTo(-half, S);
  s.lineTo(-half, DECK);
  s.lineTo(LIVING_X1, DECK);
  // The front face of the high top: a steep raked drop onto the cab roof, which is what makes
  // the extra half-metre read as a pod bonded onto a van rather than as a taller van.
  s.lineTo(1.36, 2.16);
  s.lineTo(1.42, 1.88);
  s.lineTo(2.05, 1.25);
  s.lineTo(2.72, 1.18);
  s.lineTo(half, 1.08);
  s.lineTo(half, 0.66);

  const r = v.dims.archRadius;
  const cy = v.dims.wheelRadius;
  const halfArch = Math.sqrt(Math.max(0.0001, r * r - (S - cy) * (S - cy)));
  const a0 = Math.asin(Math.max(-1, Math.min(1, (S - cy) / r)));
  for (const cx of [v.dims.wheelbase / 2, -v.dims.wheelbase / 2]) {
    s.lineTo(cx + halfArch, S);
    s.absarc(cx, cy, r, a0, Math.PI - a0, false);
  }
  s.lineTo(-half, S);

  // Square windows: campers have square windows, and it is the cheapest way to say
  // "this is not a car". Both sit on the belt line so the band reads as one line down the flank.
  const B = v.dims.beltY;
  for (const [x0, x1, y0, y1] of [
    [0.95, -0.15, B, B + WINDOW_H],
    [-1.25, -1.95, B + 0.1, B + WINDOW_H],
  ] as const) {
    const h = new THREE.Path();
    h.moveTo(x0, y0);
    h.lineTo(x0, y1);
    h.lineTo(x1, y1);
    h.lineTo(x1, y0);
    h.closePath();
    s.holes.push(h);
  }
  return s;
}

/** Where the front wheel arch meets the sill, and the arc that cuts it. */
function archAt(v: VehicleSpec, cx: number) {
  const S = v.dims.sillY;
  const cy = v.dims.wheelRadius;
  const r = v.dims.archRadius;
  const dy = Math.max(-1, Math.min(1, (S - cy) / r));
  return { cx, cy, r, S, halfWidth: Math.sqrt(Math.max(0.0001, r * r - (S - cy) * (S - cy))), a0: Math.asin(dy) };
}

/**
 * The engine bay and the wing that wraps the front wheel: the one piece of the near side that
 * stays solid. It stops at the bonnet line, so the driver's head and shoulders are still clear
 * of it, and it carries the front arch so no lip is needed there.
 */
function frontWingProfile(v: VehicleSpec): THREE.Shape {
  const { cx, cy, r, S, halfWidth: ha, a0 } = archAt(v, v.dims.wheelbase / 2);
  const half = v.dims.length / 2;
  const s = new THREE.Shape();
  s.moveTo(cx - ha, S);
  s.lineTo(cx - ha, 1.06);
  s.lineTo(cx + ha, 1.32);
  // Forward of the cowl it is the real nose profile, unchanged.
  s.lineTo(2.05, 1.25);
  s.lineTo(2.72, 1.18);
  s.lineTo(half, 1.08);
  s.lineTo(half, 0.66);
  s.lineTo(cx + ha, S);
  s.absarc(cx, cy, r, a0, Math.PI - a0, false);
  s.closePath();
  return s;
}

/** A wheel arch lip: the crescent a removed side panel leaves behind over its wheel. */
function archLipProfile(v: VehicleSpec, cx0: number, width: number): THREE.Shape {
  const { cx, cy, r, S, a0 } = archAt(v, cx0);
  const outer = r + width;
  const a1 = Math.asin(Math.max(-1, Math.min(1, (S - cy) / outer)));
  const s = new THREE.Shape();
  s.absarc(cx, cy, outer, a1, Math.PI - a1, false);
  s.absarc(cx, cy, r, Math.PI - a0, a0, true);
  s.closePath();
  return s;
}

export function buildVan(b: Builder, m: CarMaterials, v: VehicleSpec): BodyKit {
  const d = v.dims;
  const half = d.length / 2;
  const W = d.wallZ;
  const T = d.wallThickness;
  const DECK = d.wallTopY;
  const B = d.beltY;
  const floor = d.floorTopY;
  // The camera looks from −x, −z: those two walls are the ones between it and the cabin, so on
  // a body this tall they are left out the way the roof is left out.
  const open = seeThrough(v);
  const panes: GlassPane[] = [];

  const addPane = (name: string, geometry: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry, m.glass);
    mesh.name = `glass:${name}`;
    mesh.renderOrder = 10;
    panes.push({ name, mesh });
    b.dyn(mesh, geometry);
  };

  // ---------------------------------------------------------------- walls
  // With the rear panel gone the lights move onto the rear pillars, which is the only thing
  // left back there to hang them from.
  const tailX = open ? LIVING_X0 - 0.07 : -half + 0.02;
  const tailZ = open ? W - 0.04 : 0.78;

  for (const sign of [1, -1]) {
    const solid = sign > 0 || !open;
    if (solid) {
      const wall = new THREE.ExtrudeGeometry(sideProfile(v), { depth: T, bevelEnabled: false, curveSegments: 8 });
      wall.translate(0, 0, sign > 0 ? W : -W - T);
      b.add(wall, m.body);

      // Side window glass. A PlaneGeometry already lies in XY facing ±Z, which is exactly the
      // orientation a window in a side wall needs — it only has to be moved into place.
      for (const [name, x0, x1, y0, y1] of [
        ['dinette', 0.95, -0.15, B, B + WINDOW_H],
        ['kitchen', -1.25, -1.95, B + 0.1, B + WINDOW_H],
      ] as const) {
        const geo = new THREE.PlaneGeometry(Math.abs(x1 - x0), y1 - y0);
        geo.translate((x0 + x1) / 2, (y0 + y1) / 2, sign * (W + T / 2));
        addPane(`${name}${sign > 0 ? 'Far' : 'Near'}`, geo);
      }
    }

    // Skirt below the sill, and the aluminium rail that caps the open wall. Both survive an
    // absent panel: they are the floor pan's edge and the rim of the opening, not the wall.
    b.box(4.4, 0.16, 0.06, m.trim, { x: -0.3, y: d.sillY - 0.08, z: sign * (W + T - 0.01) });
    b.box(LIVING_X1 - LIVING_X0, 0.05, 0.09, m.hub, { x: (LIVING_X0 + LIVING_X1) / 2, y: DECK + 0.02, z: sign * (W + T / 2) });

    // Mirror on a long arm, as a van has. The near one hangs off the wing, which stays.
    b.cylZ(0.016, 0.16, m.trim, { x: 2.16, y: 1.5, z: sign * (W + T + 0.08) });
    b.box(0.05, 0.2, 0.1, m.trim, { x: 2.16, y: 1.42, z: sign * (W + T + 0.16) });

    // Headlights and tail lights.
    b.box(0.05, 0.14, 0.3, m.headLight, { x: half - 0.02, y: 0.86, z: sign * 0.74 });
    b.box(0.04, 0.34, 0.24, m.tailLight, { x: tailX, y: 1.05, z: sign * tailZ });
    b.box(0.04, 0.1, 0.24, m.indicator, { x: tailX, y: 0.82, z: sign * tailZ });
  }

  // What is left of the near side when its panel goes: two posts under the rail, and a lip over
  // the rear wheel. The front wheel's arch comes with the wing.
  if (open) {
    for (const x of [LIVING_X0 + 0.06, LIVING_X1 - 0.06]) {
      b.box(0.09, DECK - d.sillY, T, m.body, { x, y: (d.sillY + DECK) / 2, z: -(W + T / 2) });
    }
    const wing = new THREE.ExtrudeGeometry(frontWingProfile(v), { depth: T, bevelEnabled: false, curveSegments: 8 });
    wing.translate(0, 0, -W - T);
    b.add(wing, m.body);
    const lip = new THREE.ExtrudeGeometry(archLipProfile(v, -d.wheelbase / 2, 0.1), { depth: T, bevelEnabled: false, curveSegments: 10 });
    lip.translate(0, 0, -W - T);
    b.add(lip, m.body);
    // Rear pillars: the frame of the rear opening, and what the tail lights now sit on.
    for (const z of [tailZ, -tailZ]) b.box(0.09, DECK - d.sillY, 0.1, m.body, { x: LIVING_X0 - 0.025, y: (d.sillY + DECK) / 2, z });
  }

  // Rail across the front and back of the open top, so the box reads as deliberately open.
  for (const x of [LIVING_X0 + 0.02, LIVING_X1 - 0.02]) b.box(0.09, 0.05, 2 * W, m.hub, { x, y: DECK + 0.02 });

  // ---------------------------------------------------------------- floor, walls, ends
  b.box(LIVING_X1 - LIVING_X0, 0.06, 2 * W, m.carpet, { x: (LIVING_X0 + LIVING_X1) / 2, y: floor });
  // Cab floor, one step lower.
  b.box(1.5, 0.06, 2 * W - 0.1, m.carpet, { x: 2.05, y: floor - 0.2 });
  b.box(0.24, 0.2, 2 * W - 0.1, m.vinylLight, { x: LIVING_X1 + 0.12, y: floor - 0.1 });
  // Rear wall — the other one the camera looks through — and its window. Both go on a body
  // tall enough to need the opening; the pillars and the bumper below carry what was on them.
  if (!open) {
    b.box(0.06, DECK - d.sillY, 2 * W, m.body, { x: LIVING_X0 - 0.03, y: (d.sillY + DECK) / 2 });
    addPane('rear', paneGeometry(LIVING_X0 - 0.06, B + 0.1, LIVING_X0 - 0.06, B + 0.7, -0.45, 0.45));
  }
  b.box(0.02, 0.13, 0.5, m.plate, { x: LIVING_X0 - 0.07, y: open ? 0.76 : 0.95 });
  b.box(0.1, 0.24, 2 * (W + T), m.trim, { x: LIVING_X0 - 0.06, y: 0.72 });
  b.box(0.1, 0.24, 2 * (W + T), m.trim, { x: half - 0.02, y: 0.72 });
  // Front: windscreen, bonnet, grille.
  addPane('windscreen', paneGeometry(2.05, 1.25, 1.45, 1.88, -W + 0.04, W - 0.04));
  b.spanBox(0.7, 0.04, -W - T, W + T, m.body, { x: 2.4, y: 1.22, rz: -0.1 });
  b.box(0.06, 0.5, 2 * (W + T), m.body, { x: half - 0.02, y: 0.86 });
  b.box(0.015, 0.16, 1.2, m.trim, { x: half + 0.01, y: 1.02 });

  // ---------------------------------------------------------------- open-top details
  // Roof vents can only be expressed as their frames: open collars over a flange.
  for (const x of [0.35, -1.85]) {
    for (const z of [-0.2, 0.2]) b.box(0.4, 0.06, 0.03, m.hub, { x, y: DECK + 0.05, z });
    for (const zz of [-0.2, 0.2]) b.box(0.03, 0.06, 0.4, m.hub, { x: x + (zz > 0 ? 0.2 : -0.2), y: DECK + 0.05 });
  }
  // One vent lid propped open, near the middle of the roofline so it breaks the top edge.
  b.spanBox(0.42, 0.02, -0.22, 0.22, m.glass, { x: 0.52, y: DECK + 0.16, rz: 0.55 });

  // Awning roll on the near side — the most legible camper cue that exists, for three
  // primitives. It mounts on the near wall, so it goes when the near wall goes: anything left
  // on that plane is drawn over the open cabin, and a 3.4 m cylinder reads as a bar across the
  // middle of the room rather than as a rolled awning. The frame gets away with it; this did not.
  if (!open) {
    b.cylX(0.06, 3.4, m.body, { x: -0.8, y: DECK - 0.16, z: -(W + T + 0.07) });
    for (const x of [1.0, -2.6]) b.box(0.06, 0.12, 0.22, m.trim, { x, y: DECK - 0.24, z: -(W + T + 0.06) });
  }

  // ---------------------------------------------------------------- interior, far side
  // Everything here clears the near wall: y + z > 0.95.
  // Dinette against the far wall with an aisle on the near side.
  b.box(0.46, 0.1, 0.86, m.fabric, { x: -1.05, y: floor + 0.42, z: 0.55 });
  b.box(0.46, 0.1, 0.86, m.fabric, { x: 0.35, y: floor + 0.42, z: 0.55 });
  b.box(0.1, 0.44, 0.86, m.fabric, { x: -1.26, y: floor + 0.66, z: 0.55 });
  b.box(0.1, 0.44, 0.86, m.fabric, { x: 0.56, y: floor + 0.66, z: 0.55 });
  b.box(0.86, 0.05, 0.62, m.cardboard, { x: -0.35, y: floor + 0.88, z: 0.6 });
  b.cyl(0.03, 0.03, 0.32, m.chrome, { x: -0.35, y: floor + 0.7, z: 0.6 });
  // Kitchen: worktop, hob rings, sink and a swan-neck tap.
  b.box(1.05, 0.06, 0.82, m.cardboard, { x: -1.95, y: floor + 1.04, z: 0.58 });
  b.box(1.05, 0.98, 0.8, m.vinylLight, { x: -1.95, y: floor + 0.52, z: 0.6 });
  b.box(0.26, 0.02, 0.22, m.trim, { x: -1.72, y: floor + 1.08, z: 0.5 });
  for (const z of [0.44, 0.58]) b.add(new THREE.TorusGeometry(0.038, 0.006, 6, 16), m.chrome, { x: -1.72, y: floor + 1.1, z, rx: Math.PI / 2 });
  b.cyl(0.11, 0.11, 0.03, m.chrome, { x: -2.18, y: floor + 1.06, z: 0.62 });
  b.cyl(0.012, 0.012, 0.16, m.chrome, { x: -2.3, y: floor + 1.14, z: 0.62 });
  // Overhead lockers above the window band. The half-metre a high top adds is exactly the
  // half-metre a camper puts lockers in; without them the new wall is only more wall. Two
  // units with a gap, because one 3.3 m slab reads as a shelf rather than as cabinets.
  for (const [x, len] of [
    [-1.86, 1.72],
    [0.06, 1.5],
  ] as const) {
    b.box(len, 0.32, 0.28, m.vinylLight, { x, y: B + 0.72, z: W - 0.18 });
    b.box(len - 0.06, 0.26, 0.02, m.cardboard, { x, y: B + 0.72, z: W - 0.33 });
    for (const dx of [-0.3, 0.3]) b.box(0.02, 0.025, 0.11, m.chrome, { x: x + dx, y: B + 0.6, z: W - 0.35 });
  }

  // ---------------------------------------------------------------- cab
  const seat = (zc: number, swivel: number) => {
    const g = new THREE.Group();
    g.position.set(1.62, floor - 0.2, zc);
    g.rotation.y = swivel;
    const parts: THREE.BufferGeometry[] = [];
    const push = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      parts.push(geo);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      g.add(mesh);
    };
    const cush = new THREE.BoxGeometry(0.5, 0.12, 0.52);
    cush.translate(0, 0.46, 0);
    push(cush, m.fabric);
    const back = new THREE.BoxGeometry(0.14, 0.62, 0.52);
    back.translate(-0.2, 0.8, 0);
    push(back, m.fabric);
    const post = new THREE.CylinderGeometry(0.07, 0.11, 0.4, 10);
    post.translate(0, 0.2, 0);
    push(post, m.metalDark);
    b.dyn(g, ...parts);
  };
  // Right-hand drive, matching the range. The near seat is swivelled to face the table: the
  // vehicle is parked, and someone's partner turned their chair round.
  seat(v.cabin.driverZ, 0);
  seat(v.cabin.passengerZ, 2.44);

  // Cab-rear bulkhead, deliberately half height. A full one puts its top edge exactly on the
  // sightline from this camera to the driver's torso, and the cab occupant disappears.
  b.box(0.08, 0.62, 2 * W - 0.1, m.vinyl, { x: LIVING_X1 + 0.04, y: floor + 0.31 });
  // The shelf the radio sits on, above the bulkhead on the far side only.
  b.box(0.34, 0.04, 0.78, m.cardboard, { x: 1.35, y: 1.22, z: 0.62 });
  for (const z of [0.3, 0.94]) b.box(0.06, 0.34, 0.06, m.vinyl, { x: 1.35, y: 1.05, z });

  // Dash, binnacle and two dials.
  b.spanBox(0.26, 0.2, -W + 0.05, W - 0.05, m.vinyl, { x: 2.16, y: 1.24 });
  b.box(0.2, 0.12, 0.4, m.vinyl, { x: 2.02, y: 1.36, z: v.cabin.driverZ });
  const dialZ = [v.cabin.driverZ + 0.09, v.cabin.driverZ - 0.09] as const;
  for (const z of dialZ) {
    b.cylX(0.055, 0.01, m.dialFace, { x: 1.94, y: 1.33, z });
    b.add(new THREE.TorusGeometry(0.05, 0.004, 8, 22), m.dashGlow, { x: 1.935, y: 1.33, z, ry: Math.PI / 2 });
  }
  const needles: THREE.Group[] = [];
  const needleAngle = (k: number) => lerp(-2.1, 2.1, Math.max(0, Math.min(1, k)));
  for (const z of dialZ) {
    const g = new THREE.Group();
    g.position.set(1.932, 1.33, z);
    const geo = new THREE.BoxGeometry(0.004, 0.046, 0.004);
    geo.translate(0, 0.023, 0);
    g.add(new THREE.Mesh(geo, m.needle));
    g.rotation.x = needleAngle(0);
    needles.push(g);
    b.dyn(g, geo);
  }
  const [tacho, speedo] = needles as [THREE.Group, THREE.Group];

  // Big flat steering wheel — the van driving position.
  const wheelNode = new THREE.Group();
  wheelNode.name = 'steeringWheel';
  wheelNode.position.set(...v.cabin.wheelCentre);
  wheelNode.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...v.cabin.wheelNormal));
  const wheelParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(v.cabin.steeringRadius, 0.022, 10, 30)];
  const hub = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14);
  hub.rotateX(Math.PI / 2);
  wheelParts.push(hub);
  for (const a of [Math.PI / 2, -Math.PI / 6, (-5 * Math.PI) / 6]) {
    const spoke = new THREE.BoxGeometry(0.024, v.cabin.steeringRadius, 0.016);
    spoke.translate(0, v.cabin.steeringRadius / 2, 0);
    spoke.rotateZ(a - Math.PI / 2);
    wheelParts.push(spoke);
  }
  const wheelGeom = mergeGeometries(wheelParts.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  for (const g of wheelParts) g.dispose();
  const wheelMesh = new THREE.Mesh(wheelGeom, m.vinyl);
  wheelMesh.castShadow = true;
  wheelNode.add(wheelMesh);
  b.dyn(wheelNode, wheelGeom);
  b.cyl(0.022, 0.022, 0.22, m.vinyl, { x: 1.9, y: 1.36, z: v.cabin.driverZ, rz: 0.79 });

  // The hanging thing: a paper mobile from the cab bulkhead. Longer thread, slower swing.
  const swing = new THREE.Group();
  swing.name = 'swing';
  swing.position.set(...v.anchors.swingPivot);
  const swingGeoms: THREE.BufferGeometry[] = [];
  const cord = new THREE.CylinderGeometry(0.0015, 0.0015, v.anchors.swingLength, 5);
  cord.translate(0, -v.anchors.swingLength / 2, 0);
  swingGeoms.push(cord);
  swing.add(new THREE.Mesh(cord, m.paper));
  for (const [dz, dy] of [
    [0, 0],
    [0.05, -0.05],
    [-0.05, -0.09],
  ] as const) {
    const disc = new THREE.CylinderGeometry(0.022, 0.022, 0.003, 10);
    disc.rotateX(Math.PI / 2);
    disc.translate(dz, -v.anchors.swingLength + dy, 0);
    swingGeoms.push(disc);
    swing.add(new THREE.Mesh(disc, m.paper));
  }
  b.dyn(swing, ...swingGeoms);

  // ---------------------------------------------------------------- detail
  b.detail(() => {
    // Two stripes of unequal weight: one reads as a sticker, two read as a 1982 decal set.
    // A decal needs a panel, so the near pair goes with the near panel.
    for (const sign of open ? [1] : [1, -1]) {
      b.box(4.9, 0.2, 0.004, m.jacket, { x: -0.5, y: 1.12, z: sign * (W + T + 0.006) });
      b.box(4.9, 0.06, 0.004, m.jacket, { x: -0.5, y: 0.98, z: sign * (W + T + 0.006) });
    }
    // Curtains: three overlapping cylinders read as folded fabric far better than a flat plane.
    const curtain = (x: number, z: number) => {
      for (let i = 0; i < 3; i++) b.cyl(0.035, 0.035, WINDOW_H - 0.08, m.cardboard, { x: x + i * 0.035, y: B + WINDOW_H / 2, z: z - i * 0.012 });
      b.box(0.34, 0.05, 0.03, m.trim, { x: x + 0.04, y: B + WINDOW_H + 0.03, z });
    };
    curtain(0.78, W - 0.03);
    curtain(-1.32, W - 0.03);
    // The near curtain hung in a near window. Both are gone together.
    if (!open) curtain(0.78, -W + 0.03);
    // A festoon slung under the locker, wired to the dash glow so it comes up with ignition.
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      b.sphere(0.018, m.dashGlow, { x: lerp(0.6, -2.2, t), y: B + 0.52 - Math.sin(t * Math.PI) * 0.05, z: W - 0.3 }, 8);
    }
    // The life in it: kettle, mug, paperbacks, a map, boots by the door, a tea towel.
    b.cyl(0.05, 0.055, 0.1, m.chrome, { x: -1.72, y: floor + 1.12, z: 0.52 });
    b.cyl(0.032, 0.03, 0.08, m.paper, { x: -2.05, y: floor + 1.11, z: 0.44 });
    b.box(0.14, 0.03, 0.1, m.paper, { x: -0.4, y: floor + 0.92, z: 0.52 });
    b.box(0.13, 0.025, 0.09, m.jacket, { x: -0.52, y: floor + 0.95, z: 0.66 });
    b.box(0.2, 0.02, 0.15, m.cardboard, { x: -0.16, y: floor + 0.91, z: 0.66, ry: 0.4 });
    b.box(0.1, 0.12, 0.28, m.vinyl, { x: -2.5, y: floor + 0.09, z: 0.5 });
    b.box(0.12, 0.09, 0.26, m.vinyl, { x: -2.62, y: floor + 0.06, z: 0.62, rz: 1.3 });
    b.box(0.02, 0.22, 0.14, m.plate, { x: -1.6, y: floor + 0.86, z: 0.2 });
    // Three postcards, all deliberately off-square: that is the whole trick.
    for (const [x, y, r] of [
      [-0.9, 1.99, 0.06],
      [-0.66, 1.93, -0.09],
      [-1.14, 1.9, 0.03],
    ] as const) {
      b.box(0.005, 0.11, 0.08, m.paper, { x, y, z: W - 0.055, rx: r });
    }
  });

  return {
    panes,
    setLights(head, tail) {
      m.headLight.emissiveIntensity = head * 3.5;
      m.tailLight.emissiveIntensity = 0.15 + tail * 1.1;
      m.indicator.emissiveIntensity = 0.1 + tail * 0.6;
    },
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
    exhaustTip: new THREE.Vector3(...v.anchors.exhaustTip),
    swing,
  };
}
