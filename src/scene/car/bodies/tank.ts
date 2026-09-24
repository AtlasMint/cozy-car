import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Builder, type CarMaterials } from '../parts';
import type { BodyKit, VehicleSpec } from '../../../core/vehicles';
import { TANK_GUN } from '../../../core/constants';
import type { GlassPane } from '../shell';

/**
 * A modern main battle tank. Not in the picker, not in the hash, not remembered — see the key
 * handler in ui/vehiclePicker.ts.
 *
 * It is built to the same rules as the other three: no material key it does not share with them,
 * no light of its own, and no cutaway. The open thing here is the commander's hatch — the
 * turret roof is a plate with a hole in it and the commander stands in that hole, which is the
 * same conceit as the missing roof everywhere else in this scene.
 *
 * What makes a tank read as *modern* rather than as a 1944 one, in rough order of how much work
 * each does from this camera: the wedge turret with its long angled cheeks, side skirts hiding
 * the top run of track, a thin gun with a bore evacuator swelling a third of the way along, a
 * flat engine deck of grilles, and a roof covered in sights, hatches and smoke launchers.
 */

// Hull and running gear. Everything here is derived from the spec where the spec has an opinion.
const TRACK_THICK = 0.1;
const ROAD_R = 0.34;
const GUN_Y = 2.0;
/** Turret centre, a little forward of the hull's, as on most of them. */
const TURRET_X = 0.25;

/**
 * The track run, as a closed loop: a stadium around the sprocket and idler with the same stadium
 * inset for the hole, so it is a band rather than a slab and you can see daylight under the top
 * run before the skirts cover it.
 */
function trackProfile(halfRun: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const top = 2 * r;
  s.moveTo(-halfRun, 0);
  s.lineTo(halfRun, 0);
  s.absarc(halfRun, r, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-halfRun, top);
  s.absarc(-halfRun, r, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  const ir = r - TRACK_THICK;
  const hole = new THREE.Path();
  hole.moveTo(-halfRun, TRACK_THICK);
  hole.lineTo(halfRun, TRACK_THICK);
  hole.absarc(halfRun, r, ir, -Math.PI / 2, Math.PI / 2, false);
  hole.lineTo(-halfRun, top - TRACK_THICK);
  hole.absarc(-halfRun, r, ir, Math.PI / 2, (3 * Math.PI) / 2, false);
  s.holes.push(hole);
  return s;
}

/**
 * The turret in plan, nose at +x. Written as a polygon rather than composed from boxes because
 * the whole point of the shape is that the front is two long flat cheeks meeting at a point —
 * the arrow that says "built after 1980".
 *
 * Extruded along its own +z and then stood up with rx = −π/2, which maps the extrusion to world
 * +y and the plan's y to world −z. The turret is symmetric across z, so that mirror costs
 * nothing except remembering it when placing the hatch.
 */
const TURRET_OUTER: readonly (readonly [number, number])[] = [
  [1.95, 0],
  [1.12, 0.95],
  [0.72, 1.12],
  [-0.78, 1.15],
  // The bustle carries its width to a near-square back. Tapering it to a point is a 1940s
  // turret; on a modern one that volume is the ammunition, and it is a box.
  [-1.62, 1.06],
  [-1.68, 0.9],
  [-1.68, -0.9],
  [-1.62, -1.06],
  [-0.78, -1.15],
  [0.72, -1.12],
  [1.12, -0.95],
];

/** The crew space inside it. The nose forward of x 1.62 stays solid, because that is the armour. */
const TURRET_INNER: readonly (readonly [number, number])[] = [
  [1.62, 0],
  [0.98, 0.78],
  [0.62, 0.93],
  [-0.66, 0.96],
  [-1.44, 0.88],
  [-1.5, 0.74],
  [-1.5, -0.74],
  [-1.44, -0.88],
  [-0.66, -0.96],
  [0.62, -0.93],
  [0.98, -0.78],
];

function poly(points: readonly (readonly [number, number])[]): THREE.Shape {
  const s = new THREE.Shape();
  points.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

function path(points: readonly (readonly [number, number])[]): THREE.Path {
  const p = new THREE.Path();
  points.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
}

/** Stand a plan-view extrusion up: plan +z becomes world +y, plan +y becomes world −z. */
const STANDING = { rx: -Math.PI / 2 } as const;

export function buildTank(b: Builder, m: CarMaterials, v: VehicleSpec): BodyKit {
  const d = v.dims;
  const half = d.length / 2;
  const deck = d.beltY;
  const roof = d.wallTopY;
  const trackZ = d.track / 2;
  const trackW = d.wheelWidth;
  const wheelR = d.wheelRadius;
  const hullZ = trackZ - trackW / 2 - 0.04;
  const sponsonZ = d.wallZ;
  const skirtZ = sponsonZ + 0.1;
  const panes: GlassPane[] = [];

  const addPane = (name: string, geometry: THREE.BufferGeometry) => {
    const mesh = new THREE.Mesh(geometry, m.glass);
    mesh.name = `glass:${name}`;
    mesh.renderOrder = 10;
    panes.push({ name, mesh });
    b.dyn(mesh, geometry);
  };

  // ---------------------------------------------------------------- running gear
  for (const sign of [1, -1]) {
    const z = sign * trackZ;
    const track = new THREE.ExtrudeGeometry(trackProfile(d.wheelbase / 2, wheelR), { depth: trackW, bevelEnabled: false, curveSegments: 10 });
    track.translate(0, 0, z - trackW / 2);
    b.add(track, m.tyre);

    // Road wheels between the sprocket and the idler. The two at the ends turn — they are the
    // spec's wheels, built by wheels.ts — and these five do not, which nobody has ever noticed
    // on a vehicle whose tracks are the moving part.
    // Seven, nearly touching. Five widely spaced wheels is a 1940s torsion-bar layout and reads
    // as one instantly; a Leopard 2 or an Abrams has seven with barely a gap between them.
    for (const x of [-2.16, -1.44, -0.72, 0, 0.72, 1.44, 2.16]) {
      b.cylZ(ROAD_R, trackW - 0.08, m.hub, { x, y: ROAD_R, z });
      b.cylZ(ROAD_R * 0.42, trackW - 0.02, m.metalDark, { x, y: ROAD_R, z });
    }
    // Return rollers carrying the top run.
    for (const x of [-1.3, 0.35, 1.5]) b.cylZ(0.12, trackW - 0.14, m.hub, { x, y: 2 * wheelR - 0.12, z });
  }

  // ---------------------------------------------------------------- hull
  // Lower hull between the tracks, then the sponsons overhanging them.
  b.box(d.length, d.sillY - d.floorY, 2 * hullZ, m.body, { x: 0, y: (d.floorY + d.sillY) / 2 });
  // The sponson deck stops at the glacis line. Running it the full length puts a vertical wall
  // across the nose and buries the glacis inside it, which is how a modern tank becomes a brick.
  // Where the deck ends and the glacis begins. Far enough back that the plate lies at about 14
  // degrees from horizontal: at 2.2 the run was 1.38 m for a 0.65 m drop, which is 25 degrees —
  // between a T-34 and a T-72, and the one angle that would date the whole vehicle.
  const GLACIS_X = 1.38;
  b.box(half + GLACIS_X, deck - d.sillY, 2 * sponsonZ, m.body, { x: (GLACIS_X - half) / 2, y: (d.sillY + deck) / 2 });

  // Glacis: long and shallow, which is most of what the front of one of these is.
  const glacisFrom: readonly [number, number] = [GLACIS_X, deck];
  const glacisTo: readonly [number, number] = [half + 0.08, d.sillY + 0.05];
  const gdx = glacisTo[0] - glacisFrom[0];
  const gdy = glacisTo[1] - glacisFrom[1];
  b.spanBox(Math.hypot(gdx, gdy), 0.12, -sponsonZ, sponsonZ, m.body, {
    x: (glacisFrom[0] + glacisTo[0]) / 2,
    y: (glacisFrom[1] + glacisTo[1]) / 2,
    rz: Math.atan2(gdy, gdx),
  });
  // Nose and belly plate under it.
  b.box(0.12, d.sillY - d.floorY, 2 * hullZ, m.body, { x: half - 0.06, y: (d.floorY + d.sillY) / 2 });
  // Rear plate, near vertical, with the engine access hatch.
  b.box(0.12, deck - d.floorY, 2 * sponsonZ, m.body, { x: -half + 0.06, y: (d.floorY + deck) / 2 });
  b.box(0.04, 0.5, 1.5, m.trim, { x: -half - 0.01, y: 1.14 });

  // Engine deck: the rear third is grilles, and grilles are the cheapest way to say "the engine
  // is back there" at this scale.
  for (let i = 0; i < 3; i++) {
    const x = -2.85 + i * 0.95;
    b.box(0.8, 0.05, 2.2, m.metalDark, { x, y: deck + 0.02 });
    for (let j = 0; j < 7; j++) b.box(0.72, 0.05, 0.05, m.trim, { x, y: deck + 0.05, z: -0.9 + j * 0.3 });
  }
  // Exhaust louvres on the near quarter, where the plume comes from.
  b.box(0.5, 0.26, 0.1, m.metalDark, { x: -2.6, y: deck - 0.18, z: -skirtZ - 0.08 });

  // Side skirts: they hang over the top run of track, which is the silhouette cue that dates
  // one of these to the right decade. Heavy plate at the front, lighter segments behind.
  for (const sign of [1, -1]) {
    const z = sign * skirtZ;
    b.box(2.4, 0.9, 0.08, m.trim, { x: 2.2, y: 1.07, z });
    for (let i = 0; i < 4; i++) b.box(1.02, 0.83, 0.05, m.trim, { x: 0.45 - i * 1.08, y: 1.055, z });
    // Fender over the leading edge of the track.
    b.box(0.9, 0.06, 0.46, m.trim, { x: 3.0, y: 1.5, z: sign * (trackZ + 0.02) });
  }

  // Lamps. Small and armoured, because a big round headlight is a 1950s tell.
  for (const sign of [1, -1]) {
    b.box(0.1, 0.18, 0.22, m.trim, { x: half - 0.1, y: 1.3, z: sign * 1.3 });
    b.box(0.04, 0.13, 0.17, m.headLight, { x: half - 0.04, y: 1.3, z: sign * 1.3 });
    b.box(0.05, 0.12, 0.16, m.tailLight, { x: -half - 0.02, y: 1.34, z: sign * 1.34 });
    b.box(0.05, 0.06, 0.16, m.indicator, { x: -half - 0.02, y: 1.2, z: sign * 1.34 });
  }

  // ---------------------------------------------------------------- turret
  const shell = poly(TURRET_OUTER);
  shell.holes.push(path(TURRET_INNER));
  const turret = new THREE.ExtrudeGeometry(shell, { depth: roof - deck, bevelEnabled: false });
  b.add(turret, m.body, { ...STANDING, x: TURRET_X, y: deck });

  // The roof is the inner plan with a hole cut for the commander. Plan +y is world −z, so the
  // hatch at world +z is at negative plan y — the one place that mirror matters.
  const HATCH_Z = 0.46;
  const HATCH_R = 0.33;
  const roofShape = poly(TURRET_INNER);
  const hatch = new THREE.Path();
  hatch.absarc(-0.18, -HATCH_Z, HATCH_R, 0, Math.PI * 2, true);
  roofShape.holes.push(hatch);
  const loaderHatch = new THREE.Path();
  loaderHatch.absarc(-0.1, 0.5, 0.26, 0, Math.PI * 2, true);
  roofShape.holes.push(loaderHatch);
  const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: 0.06, bevelEnabled: false, curveSegments: 14 });
  b.add(roofGeo, m.body, { ...STANDING, x: TURRET_X, y: roof - 0.06 });

  // Turret floor, so looking down the hatch finds a crew compartment rather than the sky.
  b.box(2.4, 0.04, 1.8, m.vinylLight, { x: TURRET_X - 0.1, y: deck + 0.03 });
  b.box(0.42, 0.12, 0.44, m.fabric, { x: TURRET_X - 0.34, y: deck + 0.12, z: HATCH_Z });
  b.box(0.12, 0.42, 0.44, m.fabric, { x: TURRET_X - 0.56, y: deck + 0.32, z: HATCH_Z });

  // Commander's cupola: a ring around the hatch, with vision blocks all round it.
  const cupolaX = TURRET_X - 0.18;
  // Open-ended, both of them. A solid CylinderGeometry has caps, and a capped cupola plugs the
  // very hole the roof was cut for — the hatch has to be a ring you can see down, or this is the
  // first vehicle here with a sealed cabin.
  b.add(new THREE.CylinderGeometry(HATCH_R + 0.09, HATCH_R + 0.09, 0.14, 20, 1, true), m.body, { x: cupolaX, y: roof + 0.07, z: HATCH_Z });
  b.add(new THREE.CylinderGeometry(HATCH_R + 0.005, HATCH_R + 0.005, 0.16, 20, 1, true), m.vinyl, { x: cupolaX, y: roof + 0.07, z: HATCH_Z });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.box(0.07, 0.06, 0.1, m.glass, { x: cupolaX + Math.cos(a) * (HATCH_R + 0.08), y: roof + 0.09, z: HATCH_Z + Math.sin(a) * (HATCH_R + 0.08), ry: -a });
  }
  // The hatch lid, thrown back and standing up. It goes on the FAR side: the camera is at −x,
  // so a lid propped behind the commander is a lid propped in front of them.
  b.cyl(HATCH_R, HATCH_R, 0.05, m.body, { x: cupolaX, y: roof + 0.34, z: HATCH_Z + 0.36, rx: 1.24 });
  // Loader's hatch, shut.
  b.cyl(0.27, 0.27, 0.05, m.body, { x: TURRET_X - 0.1, y: roof + 0.05, z: -0.5 });
  b.box(0.16, 0.04, 0.05, m.trim, { x: TURRET_X - 0.1, y: roof + 0.09, z: -0.5 });

  // Gun: mantlet, thermal sleeve, bore evacuator a third of the way along, muzzle. The evacuator
  // is the single most modern-looking 12 cm of the whole vehicle.
  //
  // The mantlet stays merged with the turret, but the barrel is a live node, because it slides
  // back through the mantlet when the gun fires. Its pieces are merged per material inside the
  // node so the whole barrel still costs two draw calls rather than four.
  b.box(0.44, 0.56, 0.72, m.trim, { x: TURRET_X + 1.72, y: GUN_Y });
  const gunNode = new THREE.Group();
  gunNode.name = 'mainGun';
  gunNode.position.set(TURRET_X + 1.9, GUN_Y, 0);
  const gunParts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const tube = (r: number, len: number, x: number, mat: THREE.Material) => {
    const g = new THREE.CylinderGeometry(r, r, len, 14);
    g.rotateZ(Math.PI / 2);
    g.translate(x, 0, 0);
    const list = gunParts.get(mat) ?? [];
    list.push(g);
    gunParts.set(mat, list);
  };
  // Roughly an L/44 scaled to a 7 m hull: about four metres from the mantlet, not three.
  tube(0.075, 3.95, 1.975, m.metalDark);
  tube(0.1, 1.85, 1.075, m.trim);
  tube(0.145, 0.45, 2.375, m.trim);
  tube(0.095, 0.35, 3.775, m.metalDark);
  const gunGeoms: THREE.BufferGeometry[] = [];
  for (const [mat, list] of gunParts) {
    const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
    for (const g of list) g.dispose();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    gunNode.add(mesh);
    gunGeoms.push(merged);
  }
  b.dyn(gunNode, ...gunGeoms);
  /** World point the shell leaves from: the far end of the muzzle at rest. */
  const muzzle = new THREE.Vector3(TURRET_X + 1.9 + 3.95, GUN_Y, 0);

  // ---------------------------------------------------------------- firing
  // Flash and smoke get their own materials rather than keys in the shared set, the way the
  // radio's hover glow does: they are additive and transparent, neither of which belongs in a
  // set every vehicle carries. They are disposed through BodyKit.dispose.
  const flashMat = new THREE.MeshBasicMaterial({ color: '#FFF3D2', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const smokeMat = new THREE.MeshBasicMaterial({ color: '#B9B3A5', transparent: true, opacity: 0, depthWrite: false });

  const flash = new THREE.Group();
  flash.name = 'muzzleFlash';
  flash.position.copy(muzzle);
  flash.visible = false;
  const flashGeoms: THREE.BufferGeometry[] = [];
  // A star of cones pointing outward — a muzzle flash is a blast, not a beam.
  for (const [len, r, rot] of [
    [1.0, 0.46, 0],
    [0.5, 0.68, 0],
  ] as const) {
    const cone = new THREE.ConeGeometry(r, len, 10, 1, true);
    cone.rotateZ(-Math.PI / 2);
    cone.translate(len / 2 + rot, 0, 0);
    flashGeoms.push(cone);
    flash.add(new THREE.Mesh(cone, flashMat));
  }
  const core = new THREE.SphereGeometry(0.34, 10, 8);
  flashGeoms.push(core);
  flash.add(new THREE.Mesh(core, flashMat));
  b.dyn(flash, ...flashGeoms);

  const smoke = new THREE.Group();
  smoke.name = 'muzzleSmoke';
  smoke.visible = false;
  const smokeGeoms: THREE.BufferGeometry[] = [];
  for (const [dx, dy, dz, r] of [
    [0.1, 0.02, 0, 0.3],
    [0.5, 0.1, 0.12, 0.26],
    [0.5, 0.06, -0.14, 0.24],
    [0.95, 0.16, 0.04, 0.2],
    [1.35, 0.2, -0.08, 0.16],
  ] as const) {
    const puff = new THREE.SphereGeometry(r, 8, 6);
    puff.translate(dx, dy, dz);
    smokeGeoms.push(puff);
    smoke.add(new THREE.Mesh(puff, smokeMat));
  }
  b.dyn(smoke, ...smokeGeoms);

  // Oversized invisible proxy on the barrel, so the gun can be clicked without having to hit a
  // 15 cm cylinder from an isometric camera.
  const gunHitGeom = new THREE.BoxGeometry(4.0, 0.56, 0.56);
  const gunHitbox = new THREE.Mesh(gunHitGeom, new THREE.MeshBasicMaterial({ color: '#ff00ff' }));
  gunHitbox.position.set(TURRET_X + 3.9, GUN_Y, 0);
  gunHitbox.visible = false;
  gunHitbox.name = 'hitbox:mainGun';
  b.dyn(gunHitbox, gunHitGeom);

  const G = TANK_GUN;
  // Barrel recoil and hull kick are both one damped spring each, shoved once per shot.
  let barrelX = 0;
  let barrelV = 0;
  let heave = 0;
  let heaveV = 0;
  let pitch = 0;
  let pitchV = 0;
  let sinceShot: number = G.reloadS;
  const spring = (x: number, v: number, omega: number, zeta: number, dt: number): [number, number] => {
    const nv = v + (-omega * omega * x - 2 * zeta * omega * v) * dt;
    return [x + nv * dt, nv];
  };

  const ordnance = {
    hitbox: gunHitbox,
    get ready() {
      return Math.min(1, sinceShot / G.reloadS);
    },
    fire(): boolean {
      if (sinceShot < G.reloadS) return false;
      sinceShot = 0;
      barrelV = -G.recoilSpeed;
      heaveV = G.hullHeave;
      pitchV = G.hullPitch;
      return true;
    },
    update(dt: number) {
      // The springs want a clamped step, or an alt-tab integrates them to infinity. The reload
      // clock does not: clamping that too makes the gun reload in frame-time rather than in
      // seconds, and it visibly takes half again as long on a slow machine.
      const step = Math.min(dt, 0.033);
      sinceShot += dt;
      [barrelX, barrelV] = spring(barrelX, barrelV, G.barrelOmega, G.barrelZeta, step);
      // It never runs forward past battery — that is what the recuperator is for — so the
      // spring is clamped at zero on the way home rather than being allowed to overshoot.
      if (barrelX > 0) {
        barrelX = 0;
        barrelV = 0;
      }
      gunNode.position.x = TURRET_X + 1.9 + barrelX;
      [heave, heaveV] = spring(heave, heaveV, G.hullOmega, G.hullZeta, step);
      [pitch, pitchV] = spring(pitch, pitchV, G.hullOmega, G.hullZeta, step);

      const t = sinceShot;
      const lit = t < G.flashS;
      flash.visible = lit;
      if (lit) {
        const k = 1 - t / G.flashS;
        // Holds near full for the first half and then drops, rather than fading linearly from
        // the first frame — a flash that is already half gone when you first see it reads grey.
        flashMat.opacity = Math.pow(k, 0.55);
        const grow = 0.75 + (1 - k) * 0.9;
        flash.scale.set(grow, grow * k, grow * k);
        flash.position.set(muzzle.x + barrelX, muzzle.y, muzzle.z);
      }
      const puffing = t < G.smokeS;
      smoke.visible = puffing;
      if (puffing) {
        const k = t / G.smokeS;
        smokeMat.opacity = 0.44 * (1 - k) * (1 - k);
        const grow = 0.6 + k * 2.1;
        smoke.scale.setScalar(grow);
        smoke.position.set(muzzle.x + barrelX + k * 0.25, muzzle.y + k * 0.3, muzzle.z);
      }
      return { heave, pitch };
    },
  };

  // Sights. The commander's panoramic sight ahead of the hatch and the gunner's beside the gun;
  // both get real glass, so rain reads on them.
  b.box(0.3, 0.26, 0.3, m.body, { x: TURRET_X + 0.5, y: roof + 0.13, z: 0.5 });
  const periGeo = new THREE.PlaneGeometry(0.2, 0.16);
  periGeo.rotateY(-Math.PI / 2);
  // A hundredth proud of the housing face. Landing exactly on it is a coplanar pair that
  // z-fights, and after the Float32 cast the two are identical to the bit.
  periGeo.translate(TURRET_X + 0.34, roof + 0.14, 0.5);
  addPane('commanderSight', periGeo);
  b.box(0.34, 0.22, 0.26, m.body, { x: TURRET_X + 0.85, y: roof + 0.11, z: -0.42 });
  const gunSight = new THREE.PlaneGeometry(0.18, 0.14);
  gunSight.rotateY(-Math.PI / 2);
  gunSight.translate(TURRET_X + 0.67, roof + 0.12, -0.42);
  addPane('gunnerSight', gunSight);

  // Smoke grenade launchers, four a side, angled out and forward.
  for (const sign of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      b.cyl(0.045, 0.045, 0.2, m.metalDark, {
        x: TURRET_X + 0.78 - i * 0.16,
        y: roof - 0.22,
        // Outboard of the cheek, not inside it: the outer face at these plan positions is
        // about 1.10-1.13, so 1.0 buried every tube in the armour.
        z: sign * (1.14 + i * 0.012),
        rx: sign * 0.5,
        rz: -0.5,
      });
    }
  }

  // Stowage basket across the turret rear: a frame with the crew's things in it.
  b.box(0.06, 0.55, 1.75, m.metalDark, { x: TURRET_X - 1.62, y: roof - 0.28 });
  for (const z of [-0.85, 0.85]) b.box(0.5, 0.55, 0.05, m.metalDark, { x: TURRET_X - 1.4, y: roof - 0.28, z });
  for (let i = 0; i < 4; i++) b.box(0.52, 0.04, 1.7, m.metalDark, { x: TURRET_X - 1.4, y: roof - 0.5 + i * 0.16 });

  // Pintle mount beside the commander, and two whip antennae at the back of the turret.
  b.cyl(0.04, 0.04, 0.22, m.metalDark, { x: cupolaX + 0.3, y: roof + 0.2, z: HATCH_Z + 0.3 });
  b.cylX(0.03, 0.62, m.metalDark, { x: cupolaX + 0.55, y: roof + 0.3, z: HATCH_Z + 0.3 });
  for (const z of [-0.8, 0.78]) b.cyl(0.012, 0.006, 1.15, m.metalDark, { x: TURRET_X - 1.42, y: roof + 0.5, z, rz: z > 0 ? 0.12 : -0.1 });

  // ---------------------------------------------------------------- crew station
  // What the commander holds. The figure parents its grips into whatever comes back as
  // wheelNode, so this is the tank's "steering wheel" — a grab bar across the front of the
  // hatch. The node's local +Z is mapped onto wheelNormal, which puts local +X along world Z,
  // so a bar built along local X spans the hatch left to right.
  const wheelNode = new THREE.Group();
  wheelNode.name = 'steeringWheel';
  wheelNode.position.set(...v.cabin.wheelCentre);
  wheelNode.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...v.cabin.wheelNormal));
  const barGeoms: THREE.BufferGeometry[] = [];
  const bar = new THREE.CylinderGeometry(0.022, 0.022, v.cabin.steeringRadius * 2 + 0.08, 10);
  bar.rotateZ(Math.PI / 2);
  barGeoms.push(bar);
  for (const sx of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8);
    leg.translate(sx * v.cabin.steeringRadius, -0.05, 0);
    barGeoms.push(leg);
  }
  // One mesh, not three: dyn nodes are added verbatim and never merged, so each one of these is
  // its own draw call plus its own shadow pass.
  const barMerged = mergeGeometries(barGeoms.map((g) => (g.index ? g.toNonIndexed() : g)), false)!;
  for (const g of barGeoms) g.dispose();
  const barMesh = new THREE.Mesh(barMerged, m.metalDark);
  // Dyn nodes get no shadow flags from the Builder; three defaults castShadow to false.
  barMesh.castShadow = true;
  wheelNode.add(barMesh);
  b.dyn(wheelNode, barMerged);

  // Two dials on the turret wall in front of the commander, the same trick every vehicle here
  // uses to have something that moves with the engine.
  const dialZ = [HATCH_Z + 0.1, HATCH_Z - 0.1] as const;
  for (const z of dialZ) {
    b.cylX(0.05, 0.01, m.dialFace, { x: TURRET_X + 0.52, y: 2.02, z });
    b.add(new THREE.TorusGeometry(0.045, 0.004, 8, 20), m.dashGlow, { x: TURRET_X + 0.515, y: 2.02, z, ry: Math.PI / 2 });
  }
  const needles: THREE.Group[] = [];
  const needleAngle = (k: number) => -2.1 + 4.2 * Math.max(0, Math.min(1, k));
  for (const z of dialZ) {
    const g = new THREE.Group();
    g.position.set(TURRET_X + 0.512, 2.02, z);
    const geo = new THREE.BoxGeometry(0.004, 0.042, 0.004);
    geo.translate(0, 0.021, 0);
    g.add(new THREE.Mesh(geo, m.needle));
    g.rotation.x = needleAngle(0);
    needles.push(g);
    b.dyn(g, geo);
  }
  const [tacho, speedo] = needles as [THREE.Group, THREE.Group];

  // Radio set, recessed into a box on the turret roof behind the commander. createRadio puts the
  // faceplate at v.anchors.radioFace; this is the housing it sits in.
  const [rx, ry, rz] = v.anchors.radioFace;
  b.box(0.26, 0.2, 0.34, m.trim, { x: rx + 0.14, y: ry, z: rz });
  b.box(0.3, 0.04, 0.38, m.metalDark, { x: rx + 0.15, y: ry + 0.12, z: rz });

  // The hanging thing: a set of tags on a cord from the hatch ring.
  const swing = new THREE.Group();
  swing.name = 'swing';
  swing.position.set(...v.anchors.swingPivot);
  const swingGeoms: THREE.BufferGeometry[] = [];
  const cord = new THREE.CylinderGeometry(0.0015, 0.0015, v.anchors.swingLength, 5);
  cord.translate(0, -v.anchors.swingLength / 2, 0);
  swingGeoms.push(cord);
  swing.add(new THREE.Mesh(cord, m.chrome));
  for (const dz of [-0.014, 0.014]) {
    const tag = new THREE.BoxGeometry(0.026, 0.04, 0.003);
    tag.translate(dz, -v.anchors.swingLength - 0.02, 0);
    swingGeoms.push(tag);
    swing.add(new THREE.Mesh(tag, m.chrome));
  }
  b.dyn(swing, ...swingGeoms);

  // ---------------------------------------------------------------- detail
  b.detail(() => {
    // Spare track links bolted to the glacis: every one of these carries some.
    for (let i = 0; i < 5; i++) b.box(0.1, 0.1, 0.34, m.tyre, { x: 2.5 + i * 0.13, y: 1.44 - i * 0.055, z: -0.62, rz: -0.43 });
    // Tow cable slung along the near sponson, and shackles on the nose.
    b.cylX(0.02, 3.1, m.metalDark, { x: -0.4, y: 1.45, z: -sponsonZ - 0.04 });
    for (const z of [-0.85, 0.85]) b.add(new THREE.TorusGeometry(0.07, 0.022, 6, 14), m.metalDark, { x: half + 0.02, y: 1.0, z, ry: Math.PI / 2 });
    // Stowage in the turret basket: bags, a rolled tarp, a jerrycan.
    b.box(0.4, 0.26, 0.46, m.jacket, { x: TURRET_X - 1.4, y: roof - 0.34, z: 0.42 });
    b.box(0.36, 0.22, 0.4, m.cardboard, { x: TURRET_X - 1.4, y: roof - 0.36, z: -0.22 });
    b.cylX(0.14, 0.7, m.fabric, { x: TURRET_X - 1.4, y: roof - 0.08, z: -0.5 });
    b.box(0.16, 0.34, 0.12, m.metalDark, { x: TURRET_X - 1.4, y: roof - 0.3, z: -0.72 });
    // A mug on the hatch ring, and the commander's map board.
    b.cyl(0.036, 0.03, 0.08, m.paper, { x: -0.3, y: roof + 0.1, z: -0.05 });
    b.box(0.2, 0.01, 0.26, m.paper, { x: TURRET_X + 0.1, y: roof + 0.05, z: -0.85, ry: 0.3 });
    // Unit markings on the near skirt.
    b.box(0.26, 0.14, 0.006, m.plate, { x: -2.2, y: 1.2, z: -skirtZ - 0.03 });
    b.box(0.5, 0.05, 0.006, m.jacket, { x: 2.3, y: 1.42, z: -skirtZ - 0.03 });
    // The back of one of these is never bare: a stowage rack across it, tow hooks under it and
    // a convoy light. Without them the rear plate is a metre of flat paint facing the camera.
    b.box(0.16, 0.04, 2.5, m.metalDark, { x: -half - 0.14, y: 1.38 });
    b.box(0.16, 0.04, 2.5, m.metalDark, { x: -half - 0.14, y: 1.08 });
    for (const z of [-1.1, 0, 1.1]) b.box(0.16, 0.32, 0.04, m.metalDark, { x: -half - 0.14, y: 1.23, z });
    b.box(0.22, 0.24, 0.5, m.jacket, { x: -half - 0.2, y: 1.24, z: -0.55 });
    b.box(0.2, 0.2, 0.42, m.cardboard, { x: -half - 0.19, y: 1.22, z: 0.6 });
    for (const z of [-0.95, 0.95]) b.add(new THREE.TorusGeometry(0.075, 0.024, 6, 14), m.metalDark, { x: -half - 0.05, y: 0.74, z, ry: Math.PI / 2 });
    b.box(0.06, 0.1, 0.12, m.tailLight, { x: -half - 0.07, y: 1.5, z: -0.2 });
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
    gun: ordnance,
    dispose() {
      flashMat.dispose();
      smokeMat.dispose();
      (gunHitbox.material as THREE.Material).dispose();
    },
  };
}
