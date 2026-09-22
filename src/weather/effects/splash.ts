import * as THREE from 'three';
import { WEATHER_FX } from '../../core/constants';
import { mulberry32 } from '../../util/math';
import type { WeatherEffect } from '../director';
import { CAMERA_AXES_GLSL, OFFSCREEN_GLSL, instancedQuads } from './instanced';

/**
 * Splash rings on the road surface, density tied to rain intensity, and — while moving —
 * wheel spray: a short cone of fast, short-lived particles trailing each wheel. The rear wheels
 * throw theirs straight toward the camera.
 */
export function createSplash(wheelPositions: THREE.Vector3[]): WeatherEffect {
  const P = WEATHER_FX.SPLASH;

  // --- Rings
  const ringGeom = instancedQuads(P.count, mulberry32(303));
  const ringUniforms = {
    uTime: { value: 0 },
    uIntensity: { value: 0 },
    uRing: { value: P.ring },
    uLife: { value: P.life },
    uField: { value: new THREE.Vector4(P.field.x0, P.field.x1, P.field.z0, P.field.z1) },
    uCarMin: { value: new THREE.Vector3(...WEATHER_FX.CAR_BOX.min) },
    uCarMax: { value: new THREE.Vector3(...WEATHER_FX.CAR_BOX.max) },
  };
  const ringMat = new THREE.ShaderMaterial({
    uniforms: ringUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide, // rings lie flat; their winding faces the road
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute float aCull;
      uniform float uTime, uIntensity, uRing, uLife;
      uniform vec4 uField;
      uniform vec3 uCarMin, uCarMax;
      varying vec2 vUv;
      varying float vT;
      ${OFFSCREEN_GLSL}
      void main() {
        if (aCull > uIntensity) { discardVertex(); return; }
        float t = fract(aSeed.z + uTime / (uLife * (0.8 + 0.4 * aSeed.w)));
        // each cycle, jump to a new spot derived from the cycle index
        float cycle = floor(aSeed.z + uTime / (uLife * (0.8 + 0.4 * aSeed.w)));
        float jx = fract(sin(cycle * 12.9898 + aSeed.x * 78.233) * 43758.5453);
        float jz = fract(sin(cycle * 39.425 + aSeed.y * 11.135) * 24634.6345);
        float x = mix(uField.x, uField.y, jx);
        float z = mix(uField.z, uField.w, jz);
        bool inside = x > uCarMin.x && x < uCarMax.x && z > uCarMin.z && z < uCarMax.z;
        if (inside) { discardVertex(); return; }
        float r = uRing * (0.15 + 0.85 * t) * (0.7 + 0.6 * aSeed.w);
        vec3 pos = vec3(x + position.x * r * 2.0, 0.018, z + position.y * r * 2.0);
        vUv = uv;
        vT = t;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vT;
      void main() {
        float r = length(vUv - 0.5) * 2.0;
        float ring = smoothstep(0.62, 0.82, r) * (1.0 - smoothstep(0.9, 1.0, r));
        float a = ring * (1.0 - vT) * 0.38;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(0.82, 0.86, 0.9), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const rings = new THREE.Mesh(ringGeom, ringMat);
  rings.name = 'splashRings';
  rings.frustumCulled = false;
  rings.renderOrder = 6;
  rings.visible = false;

  // --- Wheel spray
  const S = P.spray;
  const wheels = wheelPositions.slice(0, 4);
  const sprayCount = S.perWheel * wheels.length;
  const sprayGeom = instancedQuads(sprayCount, mulberry32(404));
  // Encode the emitter index into a small attribute.
  const emitter = new Float32Array(sprayCount);
  for (let i = 0; i < sprayCount; i++) emitter[i] = Math.floor(i / S.perWheel);
  sprayGeom.setAttribute('aEmitter', new THREE.InstancedBufferAttribute(emitter, 1));
  const sprayUniforms = {
    uTime: { value: 0 },
    uSpray: { value: 0 },
    uSpeed: { value: 0 },
    uLife: { value: S.life },
    uBack: { value: S.back },
    uUp: { value: S.up },
    uSpread: { value: S.spread },
    uSize: { value: S.size },
    uEmitters: { value: [0, 1, 2, 3].map((i) => wheels[i]?.clone() ?? new THREE.Vector3()) },
  };
  const sprayMat = new THREE.ShaderMaterial({
    uniforms: sprayUniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute float aCull;
      attribute float aEmitter;
      uniform float uTime, uSpray, uSpeed, uLife, uBack, uUp, uSpread, uSize;
      uniform vec3 uEmitters[4];
      varying vec2 vUv;
      varying float vA;
      ${CAMERA_AXES_GLSL}
      ${OFFSCREEN_GLSL}
      void main() {
        if (aCull > uSpray) { discardVertex(); return; }
        vec3 e = uEmitters[int(aEmitter)];
        float t = fract(aSeed.z + uTime / uLife);
        float back = (uBack + uSpeed * 0.06) * t * (0.7 + 0.6 * aSeed.w);
        float up = uUp * t * (1.0 - t) * 4.0 * (0.5 + 0.5 * aSeed.x) * 0.5;
        float side = (aSeed.y - 0.5) * uSpread * (0.4 + t);
        vec3 centre = e + vec3(-0.28 - back, 0.04 + up, side);
        float size = uSize * (0.5 + 0.9 * t);
        vec3 pos = centre + camRight() * position.x * size + camUp() * position.y * size;
        vUv = uv;
        vA = (1.0 - t) * uSpray;
        gl_Position = projectionMatrix * viewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vA;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, d) * vA * 0.5;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(0.9, 0.93, 0.96), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const spray = new THREE.Mesh(sprayGeom, sprayMat);
  spray.name = 'wheelSpray';
  spray.frustumCulled = false;
  spray.renderOrder = 21;
  spray.visible = false;

  let intensity = 0;
  return {
    mount(parent) {
      parent.add(rings, spray);
    },
    setIntensity(n) {
      intensity = n;
      ringUniforms.uIntensity.value = n;
      rings.visible = n > 0.005;
    },
    update(dt, speed) {
      ringUniforms.uTime.value += dt;
      sprayUniforms.uTime.value += dt;
      sprayUniforms.uSpeed.value = speed;
      const k = THREE.MathUtils.clamp((speed - S.minSpeed) / 8, 0, 1);
      const s = intensity * k;
      sprayUniforms.uSpray.value = s;
      spray.visible = s > 0.005;
    },
    dispose() {
      ringGeom.dispose();
      ringMat.dispose();
      sprayGeom.dispose();
      sprayMat.dispose();
    },
  };
}
