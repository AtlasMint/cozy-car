import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, paneGeometry, type CarMaterials } from '../parts';
import type { BodyKit, VehicleSpec } from '../../../core/vehicles';
import type { GlassPane } from '../shell';
import { lerp } from '../../../util/math';

/**
 * The yellow sports car: a cheap, loved 1970s roadster, not a supercar.
 *
 * Low and wide and shorter than the hatchback, with one unbroken wedge line from the scuttle
 * to the nose — break that line into segments and it becomes a generic three.js car. The
 * cabin is open like every vehicle here, so a roll hoop carries the top silhouette and a wind
 * blocker behind the seats explains the open top as deliberate rather than missing.
 *
 * High sill and low seat is the real sports-car proportion, and it is what gives the cabin
 * light a surface to sit in — see PLAN-cars.md §14.
 */

/** The flank, extruded to make each side wall. Rear at −X, nose at +X. */
function sideProfile(v: VehicleSpec): THREE.Shape {
  const S = v.dims.sillY;
  const half = v.dims.length / 2;
  const belt = v.dims.beltY;
  const deck = 0.86;
  const s = new THREE.Shape();
  s.moveTo(-half, S);
  s.lineTo(-half, deck);
  s.lineTo(-0.6, deck);
  s.lineTo(-0.5, belt);
  s.lineTo(0.62, belt);
  s.lineTo(0.72, 0.78);
  // One straight wedge from the scuttle to the nose. Do not break this line.
  s.lineTo(0.9, 0.72);
  s.lineTo(1.62, 0.52);
  s.lineTo(half, 0.5);
  s.lineTo(half, S);

  const r = v.dims.archRadius;
  const cy = v.dims.wheelRadius;
  const halfArch = Math.sqrt(r * r - (S - cy) * (S - cy));
  const a0 = Math.asin((S - cy) / r);
  for (const cx of [v.dims.wheelbase / 2, -v.dims.wheelbase / 2]) {
    s.lineTo(cx + halfArch, S);
    s.absarc(cx, cy, r, a0, Math.PI - a0, false);
  }
  s.lineTo(-half, S);
  return s;
}

/** A flared arch lip, proud of the wall: the rears visibly fill more, which is the proportion. */
function archFlare(cx: number, r: number, cy: number, sill: number): THREE.Shape {
  const s = new THREE.Shape();
  const a0 = Math.asin(Math.max(-1, Math.min(1, (sill - cy) / r)));
  s.absarc(cx, cy, r, a0, Math.PI - a0, false);
  s.absarc(cx, cy, r - 0.075, Math.PI - a0, a0, true);
  s.closePath();
  return s;
}

export function buildSports(b: Builder, m: CarMaterials, v: VehicleSpec): BodyKit {
  const d = v.dims;
  const half = d.length / 2;
  const W = d.wallZ;
  const T = d.wallThickness;
  const S = d.sillY;
  const belt = d.beltY;
  const deck = 0.86;
  const hoopY = d.wallTopY;
  const panes: GlassPane[] = [];

  const addPane = (name: string, geometry: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry, m.glass);
    mesh.name = `glass:${name}`;
    mesh.renderOrder = 10;
    panes.push({ name, mesh });
    b.dyn(mesh, geometry);
  };

  // ---------------------------------------------------------------- body sides
  for (const sign of [1, -1]) {
    const wall = new THREE.ExtrudeGeometry(sideProfile(v), { depth: T, bevelEnabled: false, curveSegments: 8 });
    wall.translate(0, 0, sign > 0 ? W : -W - T);
    b.add(wall, m.body);

    // Arch flares, 0.06 proud of the wall.
    for (const cx of [d.wheelbase / 2, -d.wheelbase / 2]) {
      const flare = new THREE.ExtrudeGeometry(archFlare(cx, d.archRadius + 0.03, d.wheelRadius, S), {
        depth: 0.06,
        bevelEnabled: false,
        curveSegments: 10,
      });
      flare.translate(0, 0, sign > 0 ? W + T : -W - T - 0.06);
      b.add(flare, m.body);
    }

    // Sill blade and the door-top rail.
    b.box(1.35, 0.07, 0.05, m.trim, { x: 0.1, y: S - 0.03, z: sign * (W + T + 0.015) });
    // A thin cap on the door top, not a bar: the cockpit opening is the shape that reads.
    b.box(1.12, 0.018, 0.06, m.trim, { x: 0.06, y: belt + 0.008, z: sign * (W + T - 0.02) });

    // Bullet mirror on a stalk. The near one is deliberately a different colour: one visible
    // repair is what makes a cheap sports car read as loved rather than new.
    const mirrorMat = sign < 0 ? m.trim : m.body;
    b.cylZ(0.012, 0.09, m.trim, { x: 0.58, y: 0.86, z: sign * (W + T + 0.045) });
    b.sphere(0.055, mirrorMat, { x: 0.58, y: 0.93, z: sign * (W + T + 0.1) }, 10);

    // Rectangular headlight, set into the nose panel rather than standing on the bonnet.
    b.box(0.03, 0.075, 0.2, m.headLight, { x: half - 0.03, y: 0.44, z: sign * 0.46 });
    b.box(0.012, 0.095, 0.22, m.trim, { x: half - 0.045, y: 0.44, z: sign * 0.46 });

    // Tail lights and indicator on the tail panel.
    b.box(0.04, 0.12, 0.3, m.tailLight, { x: -half + 0.02, y: 0.7, z: sign * 0.46 });
    b.box(0.04, 0.05, 0.16, m.indicator, { x: -half + 0.02, y: 0.58, z: sign * 0.52 });
  }

  // ---------------------------------------------------------------- floor and tub
  b.box(2.5, d.floorTopY - d.floorY, 2 * W - 0.04, m.carpet, { x: 0.0, y: (d.floorY + d.floorTopY) / 2 });
  // Front and rear bulkheads, which close the tub.
  b.box(0.06, 0.5, 2 * W, m.metalDark, { x: 0.78, y: 0.45 });
  b.box(0.06, 0.62, 2 * W, m.metalDark, { x: -0.52, y: 0.5 });
  // Centre tunnel spine — the widest interior feature after the sills.
  b.box(1.5, 0.3, 0.26, m.vinyl, { x: 0.1, y: 0.35 });
  // Inner sills, 0.29 wide: they are what make the cockpit read as a tub rather than a room.
  for (const sign of [1, -1]) b.box(1.35, 0.3, 0.29, m.vinyl, { x: 0.1, y: 0.35, z: sign * (W - 0.145) });

  // ---------------------------------------------------------------- nose and deck
  // Bonnet: one flat panel on the wedge line, no bulge.
  const bonnetLen = Math.hypot(1.62 - 0.9, 0.52 - 0.72);
  b.spanBox(bonnetLen, 0.03, -W - T, W + T, m.body, { x: (0.9 + 1.62) / 2, y: (0.72 + 0.52) / 2, rz: Math.atan2(0.52 - 0.72, 1.62 - 0.9) });
  b.spanBox(0.3, 0.03, -W - T, W + T, m.body, { x: 0.76, y: 0.75, rz: -0.19 });
  // Nose panel, grille slot and splitter.
  b.box(0.05, 0.22, 2 * (W + T), m.body, { x: half - 0.02, y: 0.4 });
  b.box(0.015, 0.06, 1.0, m.trim, { x: half + 0.005, y: 0.44 });
  b.box(0.26, 0.025, 1.7, m.trim, { x: half - 0.1, y: 0.28 });

  // Rear deck: the largest single surface in frame, and where the stripe goes.
  b.spanBox(1.18, 0.04, -W - T, W + T, m.body, { x: -1.05, y: deck });
  b.box(0.05, 0.38, 2 * (W + T), m.body, { x: -half + 0.02, y: 0.68 });
  // Tail panel detail: plate, badge, and the dark diffuser the twin pipes sit in.
  b.box(0.02, 0.11, 0.4, m.plate, { x: -half - 0.005, y: 0.62 });
  b.cylX(0.026, 0.012, m.chrome, { x: -half - 0.005, y: 0.79 });
  b.box(0.1, 0.2, 0.52, m.trim, { x: -half + 0.05, y: 0.34 });
  for (const z of [-0.13, 0.13]) b.cylX(0.038, 0.1, m.chrome, { x: -half + 0.02, y: 0.3, z });

  // Deck stripe and its pinstripes — the toy cue that stops a wedge reading as generic.
  b.detail(() => {
    b.spanBox(1.2, 0.006, -0.15, 0.15, m.vinyl, { x: -1.05, y: deck + 0.022 });
    for (const z of [-0.17, 0.17]) b.spanBox(1.2, 0.006, z - 0.006, z + 0.006, m.plate, { x: -1.05, y: deck + 0.022 });
    // Engine deck louvres, suggested with three slots.
    for (const x of [-0.82, -0.92, -1.02]) b.box(0.018, 0.01, 0.3, m.trim, { x, y: deck + 0.018 });
  });

  // ---------------------------------------------------------------- roll hoop and blocker
  for (const z of [-0.4, 0.4]) b.box(0.045, hoopY - belt + 0.06, 0.045, m.trim, { x: -0.56, y: (belt + hoopY) / 2 + 0.02, z });
  b.box(0.045, 0.045, 0.845, m.trim, { x: -0.56, y: hoopY + 0.02 });
  addPane('blocker', paneGeometry(-0.4, 0.97, -0.44, 1.16, -0.4, 0.4));
  // Windshield: raked back hard, and the pane the droplets read on.
  addPane('windshield', paneGeometry(0.66, 0.95, 0.3, 1.16, -W + 0.02, W - 0.02));
  // Windshield frame.
  for (const z of [-W + 0.05, W - 0.05]) {
    b.spanBox(Math.hypot(0.36, 0.21), 0.022, z - 0.014, z + 0.014, m.trim, { x: 0.48, y: 1.055, rz: Math.atan2(0.21, -0.36) });
  }
  b.spanBox(0.035, 0.025, -W + 0.05, W - 0.05, m.trim, { x: 0.3, y: 1.168 });

  // ---------------------------------------------------------------- cockpit
  const seat = (zc: number) => {
    const hw = v.cabin.seatWidth / 2;
    const tilt = 0.24;
    b.spanBox(0.46, 0.1, zc - hw, zc + hw, m.fabric, { x: 0.16, y: 0.46 });
    // Bolsters standing proud: from directly above they are the entire bucket-seat signal.
    for (const s of [-1, 1]) b.spanBox(0.46, 0.1, zc + s * (hw - 0.035) - 0.035, zc + s * (hw - 0.035) + 0.035, m.fabricDark, { x: 0.16, y: 0.55 });
    const bx = -0.04;
    const by = 0.76;
    b.spanBox(0.12, 0.42, zc - hw, zc + hw, m.fabric, { x: bx, y: by, rz: tilt });
    for (const s of [-1, 1]) b.spanBox(0.14, 0.42, zc + s * (hw - 0.03) - 0.03, zc + s * (hw - 0.03) + 0.03, m.fabricDark, { x: bx, y: by, rz: tilt });
    // Integrated headrest — a fixed hump, not a separate pad.
    b.spanBox(0.1, 0.12, zc - 0.11, zc + 0.11, m.fabric, { x: -0.14, y: 0.99, rz: tilt });
  };
  seat(v.cabin.driverZ);
  seat(v.cabin.passengerZ);
  // Nothing else on the near side: the passenger seat is already the largest foreground shape.

  // Dash: a low cowl, a binnacle over the wheel, two dials with the tacho dominant.
  b.spanBox(0.16, 0.16, -W, W, m.vinyl, { x: 0.66, y: 0.74 });
  b.spanBox(0.2, 0.12, -W, W, m.vinylLight, { x: 0.74, y: 0.58 });
  b.box(0.14, 0.1, 0.32, m.vinyl, { x: 0.6, y: 0.86, z: v.cabin.driverZ });
  const dialZ = [v.cabin.driverZ + 0.07, v.cabin.driverZ - 0.07] as const;
  const dialR = [0.058, 0.042] as const;
  dialZ.forEach((z, i) => {
    b.cylX(dialR[i]!, 0.01, m.dialFace, { x: 0.53, y: 0.845, z });
    b.add(new THREE.TorusGeometry(dialR[i]! - 0.004, 0.004, 8, 22), m.dashGlow, { x: 0.525, y: 0.845, z, ry: Math.PI / 2 });
  });

  // Needles (live).
  const needles: THREE.Group[] = [];
  const needleAngle = (k: number) => lerp(-2.1, 2.1, Math.max(0, Math.min(1, k)));
  dialZ.forEach((z, i) => {
    const g = new THREE.Group();
    g.position.set(0.522, 0.845, z);
    const geo = new THREE.BoxGeometry(0.004, dialR[i]! * 0.72, 0.004);
    geo.translate(0, dialR[i]! * 0.36, 0);
    g.add(new THREE.Mesh(geo, m.needle));
    g.rotation.x = needleAngle(0);
    needles.push(g);
    b.dyn(g, geo);
  });
  const [tacho, speedo] = needles as [THREE.Group, THREE.Group];

  // Steering wheel: small, nearly upright.
  const wheelNode = new THREE.Group();
  wheelNode.name = 'steeringWheel';
  wheelNode.position.set(...v.cabin.wheelCentre);
  wheelNode.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...v.cabin.wheelNormal));
  const wheelParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(v.cabin.steeringRadius, 0.018, 10, 30)];
  const hub = new THREE.CylinderGeometry(0.036, 0.036, 0.035, 14);
  hub.rotateX(Math.PI / 2);
  wheelParts.push(hub);
  for (const a of [Math.PI / 2, -Math.PI / 6, (-5 * Math.PI) / 6]) {
    const spoke = new THREE.BoxGeometry(0.018, v.cabin.steeringRadius, 0.014);
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
  b.cyl(0.018, 0.018, 0.16, m.vinyl, { x: 0.52, y: 0.73, z: v.cabin.driverZ, rz: 1.31 });

  // Centre stack: the gear lever and handbrake. The radio itself is createRadio's — this used
  // to draw a second, canted fascia over the top of it, which is what stuck out of the dash.
  b.cyl(0.011, 0.011, 0.16, m.chrome, { x: 0.26, y: 0.42 });
  b.sphere(0.026, m.vinyl, { x: 0.26, y: 0.5 }, 10);
  b.cyl(0.01, 0.01, 0.2, m.vinyl, { x: 0.02, y: 0.42, rz: 0.55 });

  // Dressing: a keyring swinging from the column, and a cup on the tunnel.
  const swing = new THREE.Group();
  swing.name = 'swing';
  swing.position.set(...v.anchors.swingPivot);
  const ringGeoms: THREE.BufferGeometry[] = [];
  const cord = new THREE.CylinderGeometry(0.0012, 0.0012, v.anchors.swingLength, 5);
  cord.translate(0, -v.anchors.swingLength / 2, 0);
  const fob = new THREE.BoxGeometry(0.03, 0.04, 0.005);
  fob.translate(0, -v.anchors.swingLength - 0.02, 0);
  ringGeoms.push(cord, fob);
  swing.add(new THREE.Mesh(cord, m.chrome), new THREE.Mesh(fob, m.tailLight));
  b.dyn(swing, ...ringGeoms);
  b.detail(() => {
    b.cyl(0.032, 0.028, 0.09, m.paper, { x: 0.02, y: 0.55, z: -0.1 });
    b.cyl(0.034, 0.03, 0.03, m.cardboard, { x: 0.02, y: 0.56, z: -0.1 });
    // A strap over the bonnet: the visible repair.
    b.spanBox(0.06, 0.008, -W - T - 0.01, W + T + 0.01, m.jacket, { x: 1.2, y: 0.645, rz: -0.27 });
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
