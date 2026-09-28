import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOT, PALETTE } from '../../core/constants';
import type { VehicleId } from '../../core/store';
import { VEHICLES, type VehicleDims } from '../../core/vehicles';
import { mulberry32 } from '../../util/math';
import type { LampHead, World } from './world';

/**
 * An empty parking lot on the same plinth, in the same light, under the same weather.
 *
 * The vehicle sits nose-in to a kerb in the middle bay of a row of three; the aisle is behind
 * it, a verge with one lamp post and a couple of trees is ahead of it, and a low wall runs
 * along the far edge. Nothing else: no other cars, no people. The choice of nose-in is the
 * camera's — see `clearOfCabin` — and it also puts the one place a camper can set a table where
 * nothing of it can come between the lens and the open cabin.
 *
 * Everything here is one vertex-colour material plus one lamp material, like the scenery, so
 * the lot adds no material key and no light: the lamp head is emissive, and the point light
 * that falls on the vehicle's nose at night is one of the two the road world uses for its
 * streetlights, pointed here instead.
 *
 * Furniture is the lot's, per vehicle, not the body's: it must not ride `bodyRig` (a table does
 * not idle with an engine) and it is built in the lot's materials. In v0.6 exactly one vehicle
 * has any — the camper, which has had its passenger seat swivelled to face the table since
 * v0.4 with the comment "the vehicle is parked, and someone's partner turned their chair
 * round". Here that is finally true.
 */

export interface Aabb {
  name: string;
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/**
 * The rule the treadmill has always followed, as an inequality. The camera looks along
 * d ∝ (+1, −k, +1), so a prop at P is in front of a cabin point Q only if Q = P + t·d for some
 * t > 0, which needs Q.x > P.x and Q.z > P.z. A prop of any height is therefore clear of the
 * cabin when it is entirely ahead of the nose or entirely beyond the far wall. Anything that
 * fails both is only allowed if it is paint.
 */
export function clearOfCabin(p: Aabb, dims: Pick<VehicleDims, 'length' | 'wallZ'>): boolean {
  if (p.max[1] <= LOT.KERB.height) return true;
  return p.min[0] >= dims.length / 2 || p.min[2] >= dims.wallZ;
}

/** Every prop the lot stands up, as the box it occupies. The test runs the rule over this. */
export function lotProps(): Aabb[] {
  const K = LOT.KERB;
  const S = LOT.SURFACE;
  const V = LOT.VERGE;
  const kerbX0 = LOT.KERB_X;
  const kerbX1 = kerbX0 + K.width;
  const vergeX1 = kerbX1 + V.depth;
  const props: Aabb[] = [
    { name: 'headKerb', min: [kerbX0, 0, -S.halfWidth], max: [kerbX1, K.height, S.halfWidth] },
    { name: 'farWall', min: [S.back, 0, S.halfWidth], max: [kerbX0, LOT.WALL.height, S.halfWidth + LOT.WALL.thickness] },
    { name: 'verge', min: [kerbX1, 0, -S.halfWidth], max: [vergeX1, 0.02, S.halfWidth] },
    { name: 'lampPost', min: [LOT.LAMP.x - 0.6, 0, LOT.LAMP.z - 0.3], max: [LOT.LAMP.x + 0.1, 5.3, LOT.LAMP.z + 0.3] },
  ];
  for (const [i, p] of LOT.PINES.entries()) props.push({ name: `pine${i}`, min: [p.x - 0.9, 0, p.z - 0.9], max: [p.x + 0.9, 3.7, p.z + 0.9] });
  for (const [i, b] of LOT.BUSHES.entries()) props.push({ name: `bush${i}`, min: [b.x - 0.6, 0, b.z - 0.6], max: [b.x + 0.6, 0.7, b.z + 0.6] });
  for (const z of [-S.halfWidth + 0.15, S.halfWidth - 0.15]) props.push({ name: 'bollard', min: [kerbX1 + 0.05, 0, z - 0.08], max: [kerbX1 + 0.25, 0.9, z + 0.08] });
  // The camper's picnic set. Only shown for the camper, but held to the rule for every spec:
  // where it stands must be clear whichever vehicle is in the bay.
  const P = LOT.PICNIC;
  const hl = P.table.length / 2;
  const hw = P.table.width / 2;
  props.push({ name: 'picnicTable', min: [P.x - hl, 0, P.z - hw], max: [P.x + hl, P.table.height, P.z + hw] });
  for (const side of [-1, 1]) props.push({ name: 'chair', min: [P.x - 0.25, 0, P.z + side * (hw + 0.45) - 0.25], max: [P.x + 0.25, 0.85, P.z + side * (hw + 0.45) + 0.25] });
  props.push({ name: 'cooler', min: [P.x + hl + 0.1, 0, P.z - 0.2], max: [P.x + hl + 0.55, 0.36, P.z + 0.2] });
  props.push({ name: 'lantern', min: [P.x - 0.1, P.table.height, P.z - 0.1], max: [P.x + 0.1, P.table.height + 0.3, P.z + 0.1] });
  return props;
}

/**
 * The camper's table on the verge: a picnic table, two folding chairs either side of it turned
 * to face each other across it, a cooler at its end and a lantern on it. The lantern's glass is
 * the one part not in the vertex-colour mesh, because it glows.
 */
function buildPicnic(vertexMat: THREE.Material, lanternMat: THREE.Material): { group: THREE.Group; lantern: THREE.Vector3; dispose(): void } {
  const P = LOT.PICNIC;
  const T = P.table;
  const wood = '#8B6A48';
  const woodDark = '#6E5238';
  const canvas = '#3E6B8A';
  const frame = '#5E6266';
  const hl = T.length / 2;
  const hw = T.width / 2;
  const parts: THREE.BufferGeometry[] = [
    // The top, and two trestle ends under it.
    colored(at(new THREE.BoxGeometry(T.length, 0.05, T.width), P.x, T.height - 0.025, P.z), wood),
    colored(at(new THREE.BoxGeometry(0.06, T.height - 0.05, T.width - 0.2), P.x - hl + 0.15, (T.height - 0.05) / 2, P.z), woodDark),
    colored(at(new THREE.BoxGeometry(0.06, T.height - 0.05, T.width - 0.2), P.x + hl - 0.15, (T.height - 0.05) / 2, P.z), woodDark),
    // The cooler, at the end nearer the verge.
    colored(at(new THREE.BoxGeometry(0.45, 0.32, 0.4), P.x + hl + 0.325, 0.16, P.z), '#3A5A8C'),
    colored(at(new THREE.BoxGeometry(0.47, 0.05, 0.42), P.x + hl + 0.325, 0.345, P.z), '#E4E0D3'),
    // The lantern's body; the glass is separate.
    colored(at(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 8), P.x, T.height + 0.02, P.z), frame),
    colored(at(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8), P.x, T.height + 0.235, P.z), frame),
  ];
  // Two folding chairs, one either side, facing the table.
  for (const side of [-1, 1]) {
    const cz = P.z + side * (hw + 0.45);
    parts.push(
      colored(at(new THREE.BoxGeometry(0.42, 0.04, 0.42), P.x, 0.44, cz), canvas),
      colored(at(new THREE.BoxGeometry(0.42, 0.42, 0.04), P.x, 0.65, cz + side * 0.21), canvas),
    );
    for (const dx of [-0.19, 0.19]) {
      for (const dz of [-0.19, 0.19]) parts.push(colored(at(new THREE.CylinderGeometry(0.012, 0.012, 0.44, 5), P.x + dx, 0.22, cz + dz), frame));
    }
  }
  const geom = merge(parts);
  const mesh = new THREE.Mesh(geom, vertexMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'lot:picnic';
  const glassGeom = at(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 8), P.x, T.height + 0.13, P.z);
  const glass = new THREE.Mesh(glassGeom, lanternMat);
  glass.name = 'lot:lantern';
  const group = new THREE.Group();
  group.name = 'lot:dressing:van';
  group.add(mesh, glass);
  return {
    group,
    lantern: new THREE.Vector3(P.x, T.height + 0.16, P.z),
    dispose() {
      geom.dispose();
      glassGeom.dispose();
    },
  };
}

/** The z of each bay line: the vehicle's bay is centred, its neighbours either side. */
export function bayLines(width: number, bays: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= bays; i++) out.push((i - bays / 2) * width);
  return out;
}

function colored(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const list = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(list, false)!;
  for (const g of parts) g.dispose();
  for (const g of list) g.dispose();
  return merged;
}

function at(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry {
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

/** A box by its AABB, which is how the props are stated. */
function boxOf(p: Aabb, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const sx = p.max[0] - p.min[0];
  const sy = p.max[1] - p.min[1];
  const sz = p.max[2] - p.min[2];
  return colored(at(new THREE.BoxGeometry(sx, sy, sz), p.min[0] + sx / 2, p.min[1] + sy / 2, p.min[2] + sz / 2), color);
}

/**
 * The painted surface: asphalt with the road's speckle, bay lines faded to the alpha a lot
 * that nobody repaints has, a drain and a stain. U maps to world x, V to world z.
 */
function paintSurface(): HTMLCanvasElement {
  const S = LOT.SURFACE;
  const B = LOT.BAY;
  const length = S.front - S.back;
  const width = S.halfWidth * 2;
  const canvas = document.createElement('canvas');
  canvas.width = LOT.TEXTURE_PX;
  canvas.height = Math.round((LOT.TEXTURE_PX * width) / length);
  const ctx = canvas.getContext('2d')!;
  const px = canvas.width / length; // pixels per metre, both axes
  const X = (x: number) => (x - S.back) * px;
  const Z = (z: number) => (z + S.halfWidth) * px;

  ctx.fillStyle = PALETTE.ASPHALT;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const rnd = mulberry32(0x10a7);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (rnd() - 0.5) * 26;
    d[i] = Math.max(0, Math.min(255, d[i]! + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + v));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + v * 0.9));
  }
  ctx.putImageData(img, 0, 0);

  // A darker patch where the row was patched once, and an oil stain in the aisle.
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(X(-9.5), Z(-3.6), 2.2 * px, 1.4 * px);
  const stain = ctx.createRadialGradient(X(-6.2), Z(1.1), 0, X(-6.2), Z(1.1), 0.7 * px);
  stain.addColorStop(0, 'rgba(10,8,12,0.55)');
  stain.addColorStop(1, 'rgba(10,8,12,0)');
  ctx.fillStyle = stain;
  ctx.fillRect(X(-7.2), Z(0.1), 2 * px, 2 * px);

  // Bay lines: the row the vehicle is in, heads at the kerb, and the row across the aisle,
  // heads facing back, painted from the far edge of the surface up to its own head.
  ctx.fillStyle = PALETTE.MARKING;
  ctx.globalAlpha = B.alpha;
  const lw = B.line * px;
  const head = LOT.KERB_X;
  const rowBack = head - B.length;
  const aisleHead = rowBack - LOT.AISLE;
  for (const z of bayLines(B.width, 3)) {
    ctx.fillRect(X(rowBack), Z(z) - lw / 2, (head - rowBack) * px, lw);
    ctx.fillRect(X(S.back), Z(z) - lw / 2, (aisleHead - S.back) * px, lw);
  }
  ctx.globalAlpha = 1;

  // A drain grate at the low point of the aisle.
  ctx.fillStyle = '#2C2B2D';
  ctx.fillRect(X(-5.2), Z(-2.6), 0.5 * px, 0.36 * px);
  ctx.fillStyle = '#4A494C';
  for (let i = 0; i < 5; i++) ctx.fillRect(X(-5.2) + 0.04 * px + i * 0.09 * px, Z(-2.6) + 0.04 * px, 0.04 * px, 0.28 * px);
  return canvas;
}

export function createLot(maxAnisotropy: number): World {
  const group = new THREE.Group();
  group.name = 'world:lot';
  const S = LOT.SURFACE;

  // --- The surface.
  const map = new THREE.CanvasTexture(paintSurface());
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;
  const surfaceMat = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });
  const surfaceGeom = new THREE.PlaneGeometry(S.front - S.back, S.halfWidth * 2);
  const surface = new THREE.Mesh(surfaceGeom, surfaceMat);
  surface.rotation.x = -Math.PI / 2;
  surface.position.set((S.front + S.back) / 2, LOT.SURFACE_Y, 0);
  surface.receiveShadow = true;
  surface.name = 'lot';
  group.add(surface);
  const dryColor = new THREE.Color('#ffffff');
  const wetColor = new THREE.Color('#8a8f96');

  // --- Everything that stands up, from the same table the rule is checked against.
  const props = new Map(lotProps().map((p) => [p.name, p]));
  const vertexMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const parts: THREE.BufferGeometry[] = [
    boxOf(props.get('headKerb')!, '#BDB7A9'),
    boxOf(props.get('farWall')!, '#A39C8E'),
    boxOf(props.get('verge')!, LOT.VERGE.color),
  ];
  for (const p of props.values()) {
    if (p.name === 'bollard') parts.push(boxOf(p, '#5E6266'));
  }
  // The same pine the roadside grows, and the same bush.
  for (const p of LOT.PINES) {
    parts.push(
      colored(at(new THREE.CylinderGeometry(0.08, 0.11, 0.7, 6), p.x, 0.35, p.z), '#5A3F2C'),
      colored(at(new THREE.ConeGeometry(0.9, 1.6, 7), p.x, 1.4, p.z), '#2F5A3E'),
      colored(at(new THREE.ConeGeometry(0.7, 1.4, 7), p.x, 2.3, p.z), '#37684A'),
      colored(at(new THREE.ConeGeometry(0.45, 1.1, 7), p.x, 3.1, p.z), '#3F7654'),
    );
  }
  for (const b of LOT.BUSHES) {
    parts.push(
      colored(at(new THREE.SphereGeometry(0.45, 8, 6).scale(1, 0.7, 1), b.x, 0.3, b.z), '#4C6B3F'),
      colored(at(new THREE.SphereGeometry(0.35, 8, 6).scale(1, 0.7, 1), b.x + 0.35, 0.25, b.z + 0.2), '#55764A'),
    );
  }
  const staticGeom = merge(parts);
  const statics = new THREE.Mesh(staticGeom, vertexMat);
  statics.castShadow = true;
  statics.receiveShadow = true;
  statics.name = 'lot:props';
  group.add(statics);

  // --- The lamp post, its arm reaching back over the bay. The head is its own material so it
  // can glow, exactly as the streetlights do.
  const L = LOT.LAMP;
  const poleMat = new THREE.MeshStandardMaterial({ color: '#4A4E52', roughness: 0.7, metalness: 0.3 });
  const poleGeom = merge([at(new THREE.CylinderGeometry(0.05, 0.07, 5.2, 8), L.x, 2.6, L.z), at(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6).rotateZ(Math.PI / 2), L.x - 0.25, 5.1, L.z)]);
  const pole = new THREE.Mesh(poleGeom, poleMat);
  pole.name = 'lot:lamp';
  const lampMat = new THREE.MeshStandardMaterial({ color: '#E9E2CF', emissive: PALETTE.SODIUM, emissiveIntensity: 0, roughness: 0.5 });
  const headGeom = at(new THREE.BoxGeometry(0.5, 0.14, 0.24), L.x - 0.45, 5.12, L.z);
  const head = new THREE.Mesh(headGeom, lampMat);
  head.name = 'lot:lampHead';
  group.add(pole, head);
  const headPos = new THREE.Vector3(L.x - 0.45, 5.05, L.z);

  // --- Furniture, per vehicle. Built once each, shown for the vehicle it belongs to. A lantern
  // on the table is the second lamp head, at a lantern's level, whenever it is on show.
  const lanternMat = new THREE.MeshStandardMaterial({ color: '#FFE2A8', emissive: '#FFC07A', emissiveIntensity: 0, roughness: 0.4 });
  const dressing: Partial<Record<VehicleId, ReturnType<typeof buildPicnic>>> = {
    van: buildPicnic(vertexMat, lanternMat),
  };
  for (const d of Object.values(dressing)) {
    d.group.visible = false;
    group.add(d.group);
  }
  let shownDressing: VehicleId | null = null;

  // --- The wheel stop under the nose, placed per vehicle: ahead of the front tyre's contact.
  const stopGeom = new THREE.BoxGeometry(LOT.WHEEL_STOP.length, LOT.WHEEL_STOP.height, LOT.WHEEL_STOP.depth);
  const stopMat = new THREE.MeshStandardMaterial({ color: '#C9C2B2', roughness: 0.95 });
  const stop = new THREE.Mesh(stopGeom, stopMat);
  stop.castShadow = true;
  stop.receiveShadow = true;
  stop.name = 'lot:wheelStop';
  group.add(stop);
  const placeStop = (id: VehicleId) => {
    const d = VEHICLES[id].dims;
    stop.position.set(d.wheelbase / 2 + d.wheelRadius + 0.1 + LOT.WHEEL_STOP.depth / 2, LOT.WHEEL_STOP.height / 2, 0);
    stop.scale.z = 1;
  };
  placeStop('hatchback');

  return {
    group,
    update() {
      /* a lot does not move */
    },
    setNight(night) {
      lampMat.emissiveIntensity = night * 2.5;
      lanternMat.emissiveIntensity = night * 1.8;
    },
    setWetness(wet) {
      surfaceMat.color.lerpColors(dryColor, wetColor, wet);
      surfaceMat.roughness = 0.92 - 0.5 * wet;
    },
    lampHeads(out: LampHead[]) {
      if (out.length === 0) return 0;
      out[0]!.position.copy(headPos);
      out[0]!.intensity = 1;
      const d = shownDressing ? dressing[shownDressing] : undefined;
      if (!d || out.length < 2) return 1;
      out[1]!.position.copy(d.lantern);
      out[1]!.intensity = LOT.PICNIC.lanternLevel;
      return 2;
    },
    setVehicle(id) {
      placeStop(id);
      for (const [vid, d] of Object.entries(dressing)) d.group.visible = vid === id;
      shownDressing = id in dressing ? id : null;
    },
    setVisible(on) {
      group.visible = on;
    },
    dispose() {
      surfaceGeom.dispose();
      surfaceMat.dispose();
      map.dispose();
      staticGeom.dispose();
      vertexMat.dispose();
      poleGeom.dispose();
      poleMat.dispose();
      headGeom.dispose();
      lampMat.dispose();
      stopGeom.dispose();
      stopMat.dispose();
      lanternMat.dispose();
      for (const d of Object.values(dressing)) d.dispose();
    },
  };
}
