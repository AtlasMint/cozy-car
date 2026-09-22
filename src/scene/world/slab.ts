import * as THREE from 'three';
import { PALETTE, WORLD } from '../../core/constants';

/**
 * The diorama base: a rounded plinth with visible thickness. The road runs along its long
 * (X) axis. It is asymmetric — short behind the car, long ahead — and the far end tapers so
 * that, when it is in view at all, it reads as dissolving into the backdrop rather than
 * stopping.
 */
export interface SlabRig {
  group: THREE.Group;
  dispose(): void;
}

function roundedPolygon(points: [number, number][], radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const cur = points[i]!;
    const next = points[(i + 1) % n]!;
    const inDir = new THREE.Vector2(cur[0] - prev[0], cur[1] - prev[1]).normalize();
    const outDir = new THREE.Vector2(next[0] - cur[0], next[1] - cur[1]).normalize();
    const a = new THREE.Vector2(cur[0] - inDir.x * radius, cur[1] - inDir.y * radius);
    const b = new THREE.Vector2(cur[0] + outDir.x * radius, cur[1] + outDir.y * radius);
    if (i === 0) shape.moveTo(a.x, a.y);
    else shape.lineTo(a.x, a.y);
    shape.quadraticCurveTo(cur[0], cur[1], b.x, b.y);
  }
  shape.closePath();
  return shape;
}

export function createSlab(): SlabRig {
  const group = new THREE.Group();
  const halfBack = WORLD.SLAB_WIDTH / 2;
  const halfFront = WORLD.SLAB_FAR_WIDTH / 2;

  // Shape (u, v) = (world x, world z). Extruded along shape-Z, then rotated so that axis is −Y.
  const shape = roundedPolygon(
    [
      [WORLD.SLAB_BACK, -halfBack],
      [WORLD.SLAB_FRONT, -halfFront],
      [WORLD.SLAB_FRONT, halfFront],
      [WORLD.SLAB_BACK, halfBack],
    ],
    WORLD.SLAB_CORNER,
  );
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: WORLD.SLAB_THICKNESS,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
    curveSegments: 10,
  });
  const topMat = new THREE.MeshStandardMaterial({ color: PALETTE.SLAB_TOP, roughness: 0.95, metalness: 0 });
  const sideMat = new THREE.MeshStandardMaterial({ color: PALETTE.SLAB_SIDE, roughness: 0.9, metalness: 0 });
  const mesh = new THREE.Mesh(geometry, [topMat, sideMat]);
  mesh.rotation.x = Math.PI / 2; // shape +Z (extrude) → world −Y; shape +Y → world +Z
  mesh.position.y = -0.04; // pull the top bevel down so the flat top sits exactly at y=0
  mesh.receiveShadow = true;
  mesh.name = 'plinth';
  group.add(mesh);

  return {
    group,
    dispose() {
      geometry.dispose();
      topMat.dispose();
      sideMat.dispose();
    },
  };
}
