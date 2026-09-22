import * as THREE from 'three';
import { WEATHER_FX } from '../../core/constants';
import type { GlassPane } from '../../scene/car/shell';
import type { WeatherEffect } from '../director';

/**
 * Droplets on the windshield and far windows: cellular placement, slow downward drift,
 * occasional runnels; in Focus the drift turns up-and-back. Also interior condensation — a
 * soft haze when the outside is cold or it is raining, which makes the cabin read as warm
 * and sealed. Overlays share each pane's geometry and ride along under bodyRig.
 */
export interface GlassEffect extends WeatherEffect {
  setCondensation(n: number): void;
  setDrift(v: THREE.Vector2): void;
}

export function createGlass(panes: GlassPane[]): GlassEffect {
  const G = WEATHER_FX.GLASS;
  const uniforms = {
    uTime: { value: 0 },
    uDrops: { value: 0 },
    uCondense: { value: 0 },
    uDrift: { value: new THREE.Vector2(0, -0.06) },
    uCell: { value: G.cell },
    uDropAlpha: { value: G.dropAlpha },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uDrops, uCondense, uCell, uDropAlpha;
      uniform vec2 uDrift;
      varying vec3 vPos;
      float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main() {
        // Droplet grid in car-space metres so scale is consistent across panes.
        vec2 p = (vPos.xy + uDrift * uTime) / uCell;
        vec2 cell = floor(p);
        vec2 f = fract(p);
        float h = hash21(cell);
        vec2 c = vec2(hash21(cell + 1.7), hash21(cell + 9.1)) * 0.5 + 0.25;
        float r = 0.14 + 0.2 * hash21(cell + 4.3);
        float d = length(f - c);
        float present = step(h, uDrops * 0.75);
        float drop = smoothstep(r, r * 0.55, d) * present;
        float hl = smoothstep(r * 0.55, 0.0, length(f - c + vec2(0.06, -0.06))) * present;
        // Runnels: a few cells carry a thin streak downward.
        float streakX = 0.5 + 0.3 * (hash21(cell.xx + 3.3) - 0.5);
        float run = smoothstep(0.03, 0.0, abs(f.x - streakX)) * step(0.9, hash21(cell + 2.2)) * uDrops * 0.45;
        // Condensation: grainy haze on the inner surface.
        float grain = hash21(floor(vPos.xy * 40.0) + floor(uTime * 0.2));
        float cond = uCondense * (0.55 + 0.25 * grain);
        vec3 dropCol = mix(vec3(0.86, 0.9, 0.94), vec3(1.0), hl);
        vec3 col = mix(vec3(0.92, 0.94, 0.96), dropCol, clamp(drop + hl, 0.0, 1.0));
        float a = drop * uDropAlpha + hl * 0.5 + run * 0.35 + cond * 0.6;
        if (a < 0.004) discard;
        gl_FragColor = vec4(col, min(a, 0.92));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const overlays: THREE.Mesh[] = [];
  for (const pane of panes) {
    const m = new THREE.Mesh(pane.mesh.geometry, material);
    m.name = `droplets:${pane.name}`;
    m.renderOrder = 12;
    m.visible = false;
    pane.mesh.add(m);
    overlays.push(m);
  }
  const visible = () => {
    const on = uniforms.uDrops.value > 0.005 || uniforms.uCondense.value > 0.005;
    for (const o of overlays) o.visible = on;
  };
  return {
    mount() {
      /* overlays are children of the panes already */
    },
    setIntensity(n) {
      uniforms.uDrops.value = n;
      visible();
    },
    setCondensation(n) {
      uniforms.uCondense.value = n;
      visible();
    },
    setDrift(v) {
      uniforms.uDrift.value.copy(v);
    },
    update(dt) {
      uniforms.uTime.value += dt;
    },
    dispose() {
      material.dispose();
      for (const o of overlays) o.parent?.remove(o);
    },
  };
}
