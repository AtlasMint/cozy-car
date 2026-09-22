import type * as THREE from 'three';
import { el, type Overlay } from './overlay';

/**
 * Hidden stats panel behind `#debug`: fps, draw calls, triangles, programs, and the
 * quality tier. Top-left, monospace, no chrome — a tool, not part of the diorama.
 */
export interface DebugStats {
  update(dt: number, renderer: THREE.WebGLRenderer, quality: string): void;
  dispose(): void;
}

export function createDebugStats(overlay: Overlay): DebugStats | null {
  if (!/(^|[#&])debug(=|&|$)/.test(location.hash)) return null;
  const box = el('pre');
  box.style.cssText =
    'position:absolute;top:12px;left:12px;margin:0;padding:8px 10px;font:12px/1.4 ui-monospace,Menlo,monospace;color:#f2e3c9;background:rgba(0,0,0,0.55);border-radius:8px;pointer-events:none;';
  overlay.root.appendChild(box);
  let acc = 0;
  let n = 0;
  let fps = 0;
  let worst = 0;
  return {
    update(dt, renderer, quality) {
      acc += dt;
      n++;
      worst = Math.max(worst, dt);
      if (acc >= 0.5) {
        fps = Math.round(n / acc);
        const r = renderer.info.render;
        box.textContent =
          `fps ${fps}  worst ${(worst * 1000).toFixed(1)} ms\n` +
          `calls ${r.calls}  tris ${r.triangles}\n` +
          `programs ${renderer.info.programs?.length ?? 0}  quality ${quality}\n` +
          `dpr ${renderer.getPixelRatio().toFixed(2)}`;
        acc = 0;
        n = 0;
        worst = 0;
      }
    },
    dispose() {
      box.remove();
    },
  };
}
