import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PALETTE, WORLD } from '../../core/constants';
import { mulberry32 } from '../../util/math';

/**
 * The treadmill. Roadside archetypes as InstancedMeshes; every instance carries an `x` that
 * decreases with road speed and wraps to the far end when it passes behind the slab, taking
 * a fresh lateral offset, scale and rotation so repetition is unreadable.
 *
 * Tall archetypes live only on the far verge: from the rear-left camera, anything tall on the
 * near verge would sweep between the lens and the car as it passes.
 */
export interface SceneryRig {
  group: THREE.Group;
  update(dt: number, speed: number): void;
  /** 0..1 night: streetlight heads glow. */
  setNight(night: number): void;
  /** World positions of the streetlight heads nearest the car, for the light sweep. */
  streetlightHeads(out: THREE.Vector3[]): number;
  dispose(): void;
}

export interface Instance {
  x: number;
  z: number;
  scale: number;
  rot: number;
}

/**
 * Pure wrap step. Moves every instance by −dx and wraps anything behind `behind` forward by
 * `length`, calling `respawn` so the caller can re-randomise it. Positions always stay in
 * [behind, behind + length).
 */
export function advanceField(instances: Instance[], dx: number, behind: number, length: number, respawn?: (i: Instance) => void): void {
  for (const inst of instances) {
    inst.x -= dx;
    if (inst.x < behind) {
      inst.x += length * Math.ceil((behind - inst.x) / length);
      respawn?.(inst);
    } else if (inst.x >= behind + length) {
      inst.x -= length * Math.ceil((inst.x - (behind + length - 1e-9)) / length);
      respawn?.(inst);
    }
  }
}

interface Archetype {
  name: string;
  count: number;
  side: 'far' | 'near' | 'both';
  /** Lateral band from the road edge outward, metres. */
  band: [number, number];
  scale: [number, number];
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Fixed spacing along X (streetlights) instead of random placement. */
  spacing?: number;
  castShadow: boolean;
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

function place(g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): THREE.BufferGeometry {
  g.rotateY(ry);
  g.translate(x, y, z);
  return g;
}

export function createScenery(seed = 7): SceneryRig {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  group.name = 'scenery';
  const S = WORLD.SCENERY;
  const roadEdge = WORLD.ROAD_WIDTH / 2;
  const vertexMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const poleMat = new THREE.MeshStandardMaterial({ color: '#4A4E52', roughness: 0.7, metalness: 0.3 });
  const lampMat = new THREE.MeshStandardMaterial({ color: '#E9E2CF', emissive: PALETTE.SODIUM, emissiveIntensity: 0, roughness: 0.5 });

  // --- Geometry per archetype (unit scale, base at y = 0).
  const pine = merge([
    colored(place(new THREE.CylinderGeometry(0.08, 0.11, 0.7, 6), 0, 0.35, 0), '#5A3F2C'),
    colored(place(new THREE.ConeGeometry(0.9, 1.6, 7), 0, 1.4, 0), '#2F5A3E'),
    colored(place(new THREE.ConeGeometry(0.7, 1.4, 7), 0, 2.3, 0), '#37684A'),
    colored(place(new THREE.ConeGeometry(0.45, 1.1, 7), 0, 3.1, 0), '#3F7654'),
  ]);
  const bush = merge([
    colored(place(new THREE.SphereGeometry(0.45, 8, 6).scale(1, 0.7, 1), 0, 0.3, 0), '#4C6B3F'),
    colored(place(new THREE.SphereGeometry(0.35, 8, 6).scale(1, 0.7, 1), 0.35, 0.25, 0.2), '#55764A'),
    colored(place(new THREE.SphereGeometry(0.3, 8, 6).scale(1, 0.7, 1), -0.3, 0.22, -0.15), '#43603A'),
  ]);
  const guardrail = merge([
    colored(place(new THREE.BoxGeometry(2.0, 0.22, 0.05), 0, 0.62, 0), '#9CA0A4'),
    colored(place(new THREE.BoxGeometry(0.08, 0.7, 0.08), -0.9, 0.35, -0.06), '#5E6266'),
    colored(place(new THREE.BoxGeometry(0.08, 0.7, 0.08), 0.9, 0.35, -0.06), '#5E6266'),
  ]);
  const sign = merge([
    colored(place(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), 0, 0.5, 0), '#6A6E72'),
    colored(place(new THREE.BoxGeometry(0.04, 0.4, 0.5), 0, 1.15, 0), '#E4E0D3'),
    colored(place(new THREE.BoxGeometry(0.01, 0.3, 0.4), -0.025, 1.15, 0), '#3E6B8A'),
  ]);
  const marker = merge([
    colored(place(new THREE.BoxGeometry(0.1, 0.9, 0.1), 0, 0.45, 0), '#E4E0D3'),
    colored(place(new THREE.BoxGeometry(0.11, 0.12, 0.11), 0, 0.78, 0), '#C8281E'),
  ]);
  // A low roadside kiosk rather than a tower: the slab is only ten metres wide, so anything
  // tall on the far verge walls off the sky.
  const building = merge([
    colored(place(new THREE.BoxGeometry(1.6, 1.7, 0.9), 0, 0.85, 0), '#A8A094'),
    colored(place(new THREE.BoxGeometry(1.8, 0.14, 1.1), 0, 1.77, 0), '#6E6A63'),
    colored(place(new THREE.BoxGeometry(0.9, 0.6, 0.05), 0, 1.05, -0.47), '#3A4A5A'),
    colored(place(new THREE.BoxGeometry(0.5, 1.1, 0.05), 0, 0.55, 0.47), '#4A3B32'),
  ]);
  const pole = merge([
    place(new THREE.CylinderGeometry(0.05, 0.07, 5.2, 8), 0, 2.6, 0),
    place(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6).rotateZ(Math.PI / 2), 0, 5.1, -0.25).rotateY(Math.PI / 2),
  ]);
  // The head sits over the verge, not over the road: at the van's wider framing a long
  // cantilever drags the fixture into shot.
  const lamp = place(new THREE.BoxGeometry(0.5, 0.14, 0.24), 0, 5.12, -0.45);

  const archetypes: Archetype[] = [
    { name: 'streetlight', count: S.STREETLIGHTS, side: 'far', band: [0.9, 1.0], scale: [1, 1], geometry: pole, material: poleMat, spacing: S.STREETLIGHT_SPACING, castShadow: false },
    { name: 'lamp', count: S.STREETLIGHTS, side: 'far', band: [0.9, 1.0], scale: [1, 1], geometry: lamp, material: lampMat, spacing: S.STREETLIGHT_SPACING, castShadow: false },
    { name: 'pine', count: S.PINES, side: 'far', band: [1.4, 2.3], scale: [0.7, 1.05], geometry: pine, material: vertexMat, castShadow: true },
    { name: 'building', count: S.BUILDINGS, side: 'far', band: [1.3, 1.6], scale: [0.9, 1.1], geometry: building, material: vertexMat, castShadow: false },
    { name: 'bush', count: S.BUSHES, side: 'both', band: [0.7, 2.2], scale: [0.6, 1.3], geometry: bush, material: vertexMat, castShadow: true },
    { name: 'guardrail', count: S.GUARDRAILS, side: 'near', band: [0.35, 0.4], scale: [1, 1], geometry: guardrail, material: vertexMat, castShadow: false },
    { name: 'sign', count: S.SIGNS, side: 'far', band: [0.6, 0.9], scale: [0.9, 1.1], geometry: sign, material: vertexMat, castShadow: false },
    { name: 'marker', count: S.MARKERS, side: 'near', band: [0.5, 0.6], scale: [0.9, 1.1], geometry: marker, material: vertexMat, castShadow: false },
  ];

  const meshes: THREE.InstancedMesh[] = [];
  const fields: { arch: Archetype; mesh: THREE.InstancedMesh; instances: Instance[] }[] = [];
  const dummy = new THREE.Object3D();
  const behind = S.RECYCLE_BEHIND;
  const length = S.FIELD_LENGTH;

  const randomise = (arch: Archetype, inst: Instance) => {
    const far = arch.side === 'far' || (arch.side === 'both' && rng() < 0.5);
    const lateral = roadEdge + arch.band[0] + rng() * (arch.band[1] - arch.band[0]);
    inst.z = far ? lateral : -lateral;
    inst.scale = arch.scale[0] + rng() * (arch.scale[1] - arch.scale[0]);
    inst.rot = arch.spacing ? (far ? 0 : Math.PI) : rng() * Math.PI * 2;
    if (arch.name === 'guardrail' || arch.name === 'building' || arch.name === 'sign') inst.rot = far ? 0 : Math.PI;
    if (arch.name === 'sign') inst.rot = Math.PI / 2; // face the oncoming car
  };

  for (const arch of archetypes) {
    const mesh = new THREE.InstancedMesh(arch.geometry, arch.material, arch.count);
    mesh.name = `scenery:${arch.name}`;
    mesh.castShadow = arch.castShadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const instances: Instance[] = [];
    for (let i = 0; i < arch.count; i++) {
      const inst: Instance = { x: 0, z: 0, scale: 1, rot: 0 };
      inst.x = arch.spacing ? behind + S.STREETLIGHT_PHASE + i * arch.spacing : behind + ((i + rng() * 0.9) / arch.count) * length;
      randomise(arch, inst);
      instances.push(inst);
    }
    group.add(mesh);
    meshes.push(mesh);
    fields.push({ arch, mesh, instances });
  }

  const write = () => {
    for (const f of fields) {
      for (let i = 0; i < f.instances.length; i++) {
        const inst = f.instances[i]!;
        dummy.position.set(inst.x, 0, inst.z);
        dummy.rotation.set(0, inst.rot, 0);
        dummy.scale.setScalar(inst.scale);
        dummy.updateMatrix();
        f.mesh.setMatrixAt(i, dummy.matrix);
      }
      f.mesh.instanceMatrix.needsUpdate = true;
    }
  };
  write();

  const lampField = fields.find((f) => f.arch.name === 'lamp')!;

  return {
    group,
    update(dt, speed) {
      if (speed === 0) return;
      const dx = speed * dt;
      for (const f of fields) {
        advanceField(f.instances, dx, behind, length, f.arch.spacing ? undefined : (inst) => randomise(f.arch, inst));
      }
      write();
    },
    setNight(night) {
      lampMat.emissiveIntensity = night * 2.5;
    },
    streetlightHeads(out) {
      let n = 0;
      for (const inst of lampField.instances) {
        if (n >= out.length) break;
        out[n]!.set(inst.x, 5.12, inst.z - 0.45);
        n++;
      }
      return n;
    },
    dispose() {
      for (const a of archetypes) a.geometry.dispose();
      for (const m of meshes) m.dispose();
      vertexMat.dispose();
      poleMat.dispose();
      lampMat.dispose();
    },
  };
}
