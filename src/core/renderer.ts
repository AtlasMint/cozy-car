import * as THREE from 'three';
import { RENDER } from './constants';

export interface RendererRig {
  renderer: THREE.WebGLRenderer;
  /** Current drawing-buffer-independent CSS size. */
  readonly width: number;
  readonly height: number;
  onResize(fn: (width: number, height: number) => void): () => void;
  setNightExposure(night: number): void;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): RendererRig {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.MAX_PIXEL_RATIO));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = RENDER.EXPOSURE_DAY;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in three r186

  const listeners = new Set<(w: number, h: number) => void>();
  let width = 1;
  let height = 1;

  const apply = () => {
    const w = Math.max(1, canvas.clientWidth || window.innerWidth);
    const h = Math.max(1, canvas.clientHeight || window.innerHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    for (const fn of listeners) fn(w, h);
  };

  const ro = new ResizeObserver(apply);
  ro.observe(canvas);
  window.addEventListener('resize', apply);
  apply();

  return {
    renderer,
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    onResize(fn) {
      listeners.add(fn);
      fn(width, height);
      return () => listeners.delete(fn);
    },
    setNightExposure(night) {
      renderer.toneMappingExposure = RENDER.EXPOSURE_DAY + (RENDER.EXPOSURE_NIGHT - RENDER.EXPOSURE_DAY) * night;
    },
    dispose() {
      ro.disconnect();
      window.removeEventListener('resize', apply);
      renderer.dispose();
    },
  };
}
