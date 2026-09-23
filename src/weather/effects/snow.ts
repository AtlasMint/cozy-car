import * as THREE from 'three';
import { WEATHER_FX, WORLD } from '../../core/constants';
import { mulberry32 } from '../../util/math';
import type { WeatherEffect } from '../director';
import { CAMERA_AXES_GLSL, OFFSCREEN_GLSL, SHELTER_GLSL, instancedQuads } from './instanced';

/**
 * Snow: slower, larger, soft round sprites with lateral drift and near-zero shear. The same
 * car-box exclusion as rain. At high intensity, white caps tint the slab's shoulders.
 */
export interface SnowEffect extends WeatherEffect {
  mountCaps(slab: THREE.Object3D): void;
}

export function createSnow(quality: 'low' | 'high'): SnowEffect {
  const S = WEATHER_FX.SNOW;
  const count = quality === 'low' ? S.countLow : S.count;
  const geometry = instancedQuads(count, mulberry32(202));
  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uShear: { value: 0 },
    uFall: { value: S.fall },
    uHeight: { value: S.height },
    uSize: { value: S.size },
    uDrift: { value: S.drift },
    uField: { value: new THREE.Vector4(S.field.x0, S.field.x1, S.field.z0, S.field.z1) },
    uCarMin: { value: new THREE.Vector3(...WEATHER_FX.CAR_BOX.min) },
    uCarMax: { value: new THREE.Vector3(...WEATHER_FX.CAR_BOX.max) },
    fogColor: { value: new THREE.Color() },
    fogDensity: { value: 0.02 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute float aCull;
      uniform float uTime, uIntensity, uShear, uFall, uHeight, uSize, uDrift;
      uniform vec4 uField;
      uniform vec3 uCarMin, uCarMax;
      varying vec2 vUv;
      varying float vFade;
      #include <fog_pars_vertex>
      ${CAMERA_AXES_GLSL}
      ${OFFSCREEN_GLSL}
      ${SHELTER_GLSL}
      void main() {
        if (aCull > uIntensity) { discardVertex(); return; }
        float x0 = mix(uField.x, uField.y, aSeed.x);
        float z0 = mix(uField.z, uField.w, aSeed.y);
        float speed = uFall * (0.75 + 0.5 * aSeed.w);
        float y = uHeight - mod(aSeed.z * uHeight + uTime * speed, uHeight);
        float ph = aSeed.z * 6.2831;
        float x = x0 + sin(uTime * 0.7 + ph) * uDrift + sin(uTime * 0.23 + ph * 2.1) * uDrift * 0.6 - (uHeight - y) * uShear * 0.3;
        float z = z0 + cos(uTime * 0.6 + ph * 1.7) * uDrift * 0.6;
        if (shelteredByBox(vec3(x, y, z), camFwd(), uCarMin, uCarMax)) { discardVertex(); return; }
        float size = uSize * (0.6 + 0.8 * aSeed.w);
        vec3 pos = vec3(x, y, z) + camRight() * position.x * size + camUp() * position.y * size;
        vUv = uv;
        vFade = smoothstep(uHeight, uHeight - 1.5, y) * smoothstep(0.0, 0.25, y);
        vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFade;
      #include <fog_pars_fragment>
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.3, d) * 0.85 * vFade;
        if (a < 0.003) discard;
        gl_FragColor = vec4(vec3(0.96, 0.97, 0.99), a);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'snow';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.visible = false;

  // Snow caps: white sheets that fade in with intensity.
  const capMat = new THREE.MeshStandardMaterial({ color: '#F4F6F8', roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  const capGeoms: THREE.BufferGeometry[] = [];
  const caps: THREE.Mesh[] = [];
  const cap = (w: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, y, z);
    capGeoms.push(g);
    const m = new THREE.Mesh(g, capMat);
    m.receiveShadow = true;
    m.renderOrder = 5;
    m.visible = false;
    caps.push(m);
    return m;
  };
  const shoulder = (WORLD.SLAB_WIDTH / 2 - WORLD.ROAD_WIDTH / 2) * 0.96;
  const length = WORLD.SLAB_FRONT - WORLD.SLAB_BACK;
  const mid = (WORLD.SLAB_FRONT + WORLD.SLAB_BACK) / 2;
  const nearCap = cap(length, shoulder, mid, 0.006, -(WORLD.ROAD_WIDTH / 2 + shoulder / 2 + 0.05));
  const farCap = cap(length, shoulder, mid, 0.006, WORLD.ROAD_WIDTH / 2 + shoulder / 2 + 0.05);

  return {
    mount(parent) {
      parent.add(mesh);
    },
    mountCaps(slab) {
      slab.add(nearCap, farCap);
    },
    setIntensity(n) {
      uniforms.uIntensity.value = n;
      mesh.visible = n > 0.005;
      const k = THREE.MathUtils.smoothstep(n, 0.25, 0.8);
      capMat.opacity = k * 0.9;
      for (const c of caps) c.visible = k > 0.01;
    },
    update(dt, speed) {
      uniforms.uTime.value += dt;
      uniforms.uShear.value = Math.min(1, speed / 22) * S.shear;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      capMat.dispose();
      for (const g of capGeoms) g.dispose();
    },
  };
}
