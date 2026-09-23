import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE } from '../../core/constants';

function std(color: THREE.ColorRepresentation, roughness: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
}

/** Shared materials for the whole car. Disposed once by the car assembler. */
export const mats = {
  body: std(PALETTE.BODY, 0.55),
  trim: std(PALETTE.BODY_TRIM, 0.8),
  vinyl: std(PALETTE.VINYL, 0.85),
  vinylLight: std('#3B302A', 0.85),
  fabric: std(PALETTE.FABRIC, 0.95),
  fabricDark: std('#4E4138', 0.95),
  carpet: std('#4A3B32', 0.98),
  metal: std('#55514D', 0.5, { metalness: 0.45 }),
  metalDark: std('#2E2B29', 0.6, { metalness: 0.3 }),
  chrome: std(PALETTE.CHROME, 0.22, { metalness: 0.9 }),
  tyre: std(PALETTE.TYRE, 0.95),
  hub: std(PALETTE.HUB, 0.45, { metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({
    color: PALETTE.GLASS,
    transparent: true,
    opacity: 0.4,
    roughness: 0.12,
    metalness: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  tailLight: std(PALETTE.TAIL_LIGHT, 0.35, { emissive: PALETTE.TAIL_LIGHT, emissiveIntensity: 0.15 }),
  indicator: std('#E0A23A', 0.35, { emissive: '#E0A23A', emissiveIntensity: 0.1 }),
  headLight: std(PALETTE.HEAD_LIGHT, 0.3, { emissive: PALETTE.HEAD_LIGHT, emissiveIntensity: 0 }),
  dashGlow: std(PALETTE.DASH_GLOW, 0.6, { emissive: PALETTE.DASH_GLOW, emissiveIntensity: 0 }),
  dialFace: std('#181310', 0.6),
  needle: std('#FF6A3D', 0.5, { emissive: '#FF6A3D', emissiveIntensity: 0 }),
  lcd: std(PALETTE.LCD, 0.5, { emissive: PALETTE.LCD, emissiveIntensity: 0 }),
  plate: std('#E9E4D2', 0.6),
  rubber: std('#1B1A19', 0.95),
  engine: std('#4A4744', 0.55, { metalness: 0.4 }),
  engineCover: std('#6B2F2A', 0.6),
  paper: std('#E8E2D6', 0.9),
  cardboard: std('#B08D5C', 0.95),
  jacket: std('#A98B3C', 0.9),
  freshener: std('#3E8A5A', 0.9),
  sticker: std('#E8D7B9', 0.8),
  skin: std(PALETTE.SKIN, 0.85),
  hair: std(PALETTE.HAIR, 0.9),
  hoodie: std(PALETTE.HOODIE, 0.92),
  hoodieDark: std('#396B44', 0.92),
  denim: std('#3A4A63', 0.95),
} as const;

export type MaterialKey = keyof typeof mats;

export function disposeMaterials(): void {
  for (const m of Object.values(mats)) m.dispose();
}

export interface Place {
  x?: number;
  y?: number;
  z?: number;
  rx?: number;
  ry?: number;
  rz?: number;
}

const _m = new THREE.Matrix4();
const _e = new THREE.Euler();

export function placeGeometry(g: THREE.BufferGeometry, p: Place): THREE.BufferGeometry {
  _e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
  _m.makeRotationFromEuler(_e);
  _m.setPosition(p.x ?? 0, p.y ?? 0, p.z ?? 0);
  g.applyMatrix4(_m);
  return g;
}

/**
 * A flat pane between two points in the XY (side) plane, spanning z0..z1. Used for glass and
 * any tilted sheet. `inset` shrinks the pane along its edges.
 */
export function paneGeometry(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, inset = 0) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) - inset * 2;
  const width = z1 - z0 - inset * 2;
  const g = new THREE.PlaneGeometry(width, len);
  const yAxis = new THREE.Vector3(dx, dy, 0).normalize();
  const xAxis = new THREE.Vector3(0, 0, 1);
  const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
  const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  m.setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  g.applyMatrix4(m);
  return g;
}

/** Position of a part's centre after tilting a local offset about a pivot (rotation about Z). */
export function tilted(pivotX: number, pivotY: number, offX: number, offY: number, rz: number): [number, number] {
  const c = Math.cos(rz);
  const s = Math.sin(rz);
  return [pivotX + offX * c - offY * s, pivotY + offX * s + offY * c];
}

/**
 * Collects static parts per material and merges them into one mesh each, so the whole car
 * costs a couple of dozen draw calls. Dynamic parts (wheels, needles, the steering wheel)
 * are added as live objects.
 */
export class Builder {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private dynamic: THREE.Object3D[] = [];
  private owned: THREE.BufferGeometry[] = [];

  add(g: THREE.BufferGeometry, mat: THREE.Material, p?: Place): void {
    if (p) placeGeometry(g, p);
    let list = this.buckets.get(mat);
    if (!list) {
      list = [];
      this.buckets.set(mat, list);
    }
    list.push(g);
  }

  box(w: number, h: number, d: number, mat: THREE.Material, p: Place = {}): void {
    this.add(new THREE.BoxGeometry(w, h, d), mat, p);
  }

  /** Cylinder along local Y (rotate with rx/rz to change the axis). */
  cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, p: Place = {}, radial = 18): void {
    this.add(new THREE.CylinderGeometry(rTop, rBottom, h, radial), mat, p);
  }

  /** Cylinder whose axis runs along world X. */
  cylX(r: number, len: number, mat: THREE.Material, p: Place = {}, radial = 18): void {
    this.add(new THREE.CylinderGeometry(r, r, len, radial), mat, { ...p, rz: (p.rz ?? 0) + Math.PI / 2 });
  }

  /** Cylinder whose axis runs along world Z. */
  cylZ(r: number, len: number, mat: THREE.Material, p: Place = {}, radial = 18): void {
    this.add(new THREE.CylinderGeometry(r, r, len, radial), mat, { ...p, rx: (p.rx ?? 0) + Math.PI / 2 });
  }

  sphere(r: number, mat: THREE.Material, p: Place = {}, seg = 12): void {
    this.add(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4)), mat, p);
  }

  /**
   * Axis-aligned box given by its lateral span z0..z1, optionally tilted about its own centre
   * (rz, about the lateral axis).
   */
  spanBox(w: number, h: number, z0: number, z1: number, mat: THREE.Material, p: { x?: number; y?: number; rz?: number } = {}): void {
    const g = new THREE.BoxGeometry(w, h, z1 - z0);
    g.translate(0, 0, (z0 + z1) / 2);
    g.rotateZ(p.rz ?? 0);
    g.translate(p.x ?? 0, p.y ?? 0, 0);
    this.add(g, mat);
  }

  /** A live object kept as its own node (wheels, needles, anything that moves). */
  dyn(obj: THREE.Object3D, ...geometries: THREE.BufferGeometry[]): void {
    this.dynamic.push(obj);
    this.owned.push(...geometries);
  }

  finish(name: string): { group: THREE.Group; dispose(): void } {
    const group = new THREE.Group();
    group.name = name;
    const merged: THREE.BufferGeometry[] = [];
    for (const [mat, list] of this.buckets) {
      const nonIndexed = list.map((g) => (g.index ? g.toNonIndexed() : g));
      const geometry = mergeGeometries(nonIndexed, false);
      for (const g of list) g.dispose();
      for (const g of nonIndexed) if (!list.includes(g)) g.dispose();
      if (!geometry) continue;
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.castShadow = mat !== mats.glass;
      mesh.receiveShadow = true;
      mesh.name = `${name}:${matName(mat)}`;
      group.add(mesh);
      merged.push(geometry);
    }
    for (const obj of this.dynamic) group.add(obj);
    const owned = this.owned;
    return {
      group,
      dispose() {
        for (const g of merged) g.dispose();
        for (const g of owned) g.dispose();
      },
    };
  }
}

function matName(mat: THREE.Material): string {
  for (const [k, v] of Object.entries(mats)) if (v === mat) return k;
  return 'material';
}
