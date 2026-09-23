import * as THREE from 'three';
import { WEATHER_FX } from '../../core/constants';
import { mulberry32 } from '../../util/math';
import type { WeatherEffect } from '../director';
import { CAMERA_AXES_GLSL, OFFSCREEN_GLSL, SHELTER_GLSL, instancedQuads } from './instanced';

/**
 * Rain: thousands of instanced thin quads whose fall, wrap and shear are computed in the
 * vertex shader. Streaks shear along −X as road speed rises. The shelter exclusion is built
 * in: any drop inside the car's bounding box, or in front of it along the view, is never drawn.
 */
export function createRain(quality: 'low' | 'high'): WeatherEffect {
  const R = WEATHER_FX.RAIN;
  const count = quality === 'low' ? R.countLow : R.count;
  const geometry = instancedQuads(count, mulberry32(101));
  const uniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uShear: { value: 0 },
    uFall: { value: R.fall },
    uHeight: { value: R.height },
    uLength: { value: R.length },
    uWidth: { value: R.width },
    uColor: { value: new THREE.Color(R.color) },
    uAlpha: { value: R.alpha },
    uField: { value: new THREE.Vector4(R.field.x0, R.field.x1, R.field.z0, R.field.z1) },
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
    // The streak's long axis runs down the fall direction, which flips its winding relative to
    // an up-oriented billboard; render both faces so no drop is back-face culled.
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute float aCull;
      uniform float uTime, uIntensity, uShear, uFall, uHeight, uLength, uWidth;
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
        float speed = uFall * (0.85 + 0.3 * aSeed.w);
        float y = uHeight - mod(aSeed.z * uHeight + uTime * speed, uHeight);
        float x = x0 - (uHeight - y) * uShear * 0.35;
        if (shelteredByBox(vec3(x, y, z0), camFwd(), uCarMin, uCarMax)) { discardVertex(); return; }
        vec3 dir = normalize(vec3(-uShear, -1.0, 0.0));
        vec3 side = normalize(cross(dir, camFwd()));
        float len = uLength * (0.7 + 0.6 * aSeed.w) * (1.0 + 0.6 * uShear);
        vec3 pos = vec3(x, y, z0) + side * position.x * uWidth + dir * position.y * len;
        vUv = uv;
        // fade in near the top so drops do not pop in, and thin out very near the ground
        vFade = smoothstep(uHeight, uHeight - 1.5, y) * smoothstep(0.0, 0.4, y);
        vec4 mvPosition = viewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uAlpha;
      varying vec2 vUv;
      varying float vFade;
      #include <fog_pars_fragment>
      void main() {
        float across = 1.0 - abs(vUv.x * 2.0 - 1.0);
        float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
        float a = across * across * along * uAlpha * vFade;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'rain';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.visible = false;

  return {
    mount(parent) {
      parent.add(mesh);
    },
    setShelter(min, max) {
      uniforms.uCarMin.value.set(min[0], min[1], min[2]);
      uniforms.uCarMax.value.set(max[0], max[1], max[2]);
    },
    setIntensity(n) {
      uniforms.uIntensity.value = n;
      mesh.visible = n > 0.005;
    },
    update(dt, speed) {
      uniforms.uTime.value += dt;
      uniforms.uShear.value = Math.min(R.shearMax, speed / R.fall);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
