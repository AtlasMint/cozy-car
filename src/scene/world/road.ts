import * as THREE from 'three';
import { PALETTE, WORLD } from '../../core/constants';

/**
 * Road surface on the slab. Scrolled by texture offset, never by moving geometry. The asphalt
 * and markings are painted into a canvas at startup so there is no binary asset.
 */
export interface RoadRig {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  /** Advance the surface by `distance` metres toward −X (the car's travel is +X). */
  scroll(distance: number): void;
  /** 0 = dry, 1 = soaked. Darkens and glosses the asphalt. */
  setWetness(w: number): void;
  dispose(): void;
}

function paintRoadTexture(size: number): HTMLCanvasElement {
  // The canvas U axis (width) maps to world X (road length); V (height) maps to world Z.
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const metresPerPx = WORLD.ROAD_TILE_LENGTH / size;
  const pxPerMetreV = size / WORLD.ROAD_WIDTH;

  ctx.fillStyle = PALETTE.ASPHALT;
  ctx.fillRect(0, 0, size, size);

  // Speckle: many tiny variance dots.
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  let seed = 1234567;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < d.length; i += 4) {
    const v = (rnd() - 0.5) * 26;
    d[i] = Math.max(0, Math.min(255, d[i]! + v));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1]! + v));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2]! + v * 0.9));
  }
  ctx.putImageData(img, 0, 0);

  // Tar seams every ~4 m for a subtle rhythm.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 0, 2, size);
  ctx.fillRect(size / 2, 0, 2, size);

  // Markings.
  ctx.fillStyle = PALETTE.MARKING;
  const lineW = 0.12 * pxPerMetreV;
  const edgeInset = 0.45 * pxPerMetreV;
  ctx.globalAlpha = 0.82;
  ctx.fillRect(0, edgeInset, size, lineW);
  ctx.fillRect(0, size - edgeInset - lineW, size, lineW);
  // Dashed centre line: 3 m dash, 5 m gap in an 8 m tile.
  const dashPx = 3 / metresPerPx;
  ctx.fillRect(size * 0.15, size / 2 - lineW / 2, dashPx, lineW);
  ctx.globalAlpha = 1;
  return canvas;
}

export function createRoad(maxAnisotropy: number): RoadRig {
  const canvas = paintRoadTexture(WORLD.ROAD_TEXTURE_PX);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = maxAnisotropy;
  const length = WORLD.SLAB_FRONT - WORLD.SLAB_BACK;
  map.repeat.set(length / WORLD.ROAD_TILE_LENGTH, 1);

  const material = new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0 });
  const geometry = new THREE.PlaneGeometry(length, WORLD.ROAD_WIDTH);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((WORLD.SLAB_FRONT + WORLD.SLAB_BACK) / 2, WORLD.ROAD_Y, 0);
  mesh.receiveShadow = true;
  mesh.name = 'road';

  const dryColor = new THREE.Color('#ffffff');
  const wetColor = new THREE.Color('#8a8f96');

  return {
    mesh,
    material,
    scroll(distance) {
      // A feature at texture coordinate u sits at world x = x0 + (u − offset)·TILE, so moving
      // the surface toward −X means increasing the offset.
      map.offset.x = (map.offset.x + distance / WORLD.ROAD_TILE_LENGTH) % 1;
    },
    setWetness(w) {
      material.color.lerpColors(dryColor, wetColor, w);
      material.roughness = 0.92 - 0.5 * w;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
  };
}
