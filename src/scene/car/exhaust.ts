import * as THREE from 'three';
import type { MotionProfile } from '../../core/vehicles';
import { CAMERA_AXES_GLSL } from '../../weather/effects/instanced';

/**
 * Slow, sparse exhaust puffs from the tailpipe, which faces the camera.
 *
 * One InstancedMesh, one material, one texture — the whole plume is a single draw call. The
 * pool is small enough that the CPU can write the per-instance offset, scale and alpha every
 * frame; spawning is irregular (a rate accumulator plus the ignition cough), which a purely
 * GPU-driven system cannot express.
 */
export interface ExhaustRig {
  group: THREE.Group;
  /** `rate` puffs per second; `speed` bends the drift back along the road. */
  update(dt: number, rate: number, speed: number): void;
  /** One larger puff, for the ignition cough. */
  cough(): void;
  dispose(): void;
}

interface Puff {
  age: number;
  life: number;
  size: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  alive: boolean;
}

function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createExhaust(tip: THREE.Vector3, motion: MotionProfile, poolSize = 14): ExhaustRig {
  const E = motion.exhaust;
  const group = new THREE.Group();
  group.name = 'exhaust';

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const offsets = new Float32Array(poolSize * 3);
  const scales = new Float32Array(poolSize);
  const alphas = new Float32Array(poolSize);
  const aOffset = new THREE.InstancedBufferAttribute(offsets, 3);
  const aScale = new THREE.InstancedBufferAttribute(scales, 1);
  const aAlpha = new THREE.InstancedBufferAttribute(alphas, 1);
  aOffset.setUsage(THREE.DynamicDrawUsage);
  aScale.setUsage(THREE.DynamicDrawUsage);
  aAlpha.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aOffset', aOffset);
  geometry.setAttribute('aScale', aScale);
  geometry.setAttribute('aAlpha', aAlpha);
  geometry.instanceCount = poolSize;

  const texture = puffTexture();
  const material = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: texture }, uColor: { value: new THREE.Color('#e6e4de') } },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec3 aOffset;
      attribute float aScale;
      attribute float aAlpha;
      varying vec2 vUv;
      varying float vAlpha;
      ${CAMERA_AXES_GLSL}
      void main() {
        vUv = uv;
        vAlpha = aAlpha;
        if (aAlpha <= 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vec3 p = aOffset + camRight() * position.x * aScale + camUp() * position.y * aScale;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        float a = texture2D(uMap, vUv).a * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.name = 'exhaustPuffs';
  group.add(mesh);

  const pool: Puff[] = Array.from({ length: poolSize }, () => ({
    age: 0,
    life: 1,
    size: 0.1,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    alive: false,
  }));
  let acc = 0;

  const spawn = (big: boolean, speed: number) => {
    const p = pool.find((q) => !q.alive) ?? pool.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    p.age = 0;
    p.life = E.life * (big ? 1.4 : 0.8 + Math.random() * 0.4);
    p.size = E.size * (big ? 2.2 : 0.8 + Math.random() * 0.5);
    p.vx = -(E.drift + speed * 0.35) * (0.8 + Math.random() * 0.4);
    p.vy = E.rise * (0.8 + Math.random() * 0.5);
    p.vz = (Math.random() - 0.5) * 0.12;
    p.x = tip.x - 0.05;
    p.y = tip.y;
    p.z = tip.z;
    p.alive = true;
  };

  return {
    group,
    update(dt, rate, speed) {
      acc += rate * dt;
      while (acc >= 1) {
        acc -= 1;
        spawn(false, speed);
      }
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i]!;
        if (!p.alive) {
          alphas[i] = 0;
          continue;
        }
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) {
          p.alive = false;
          alphas[i] = 0;
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vy *= 1 - 0.6 * dt;
        offsets[i * 3] = p.x;
        offsets[i * 3 + 1] = p.y;
        offsets[i * 3 + 2] = p.z;
        scales[i] = p.size * (1 + E.grow * k * 3);
        alphas[i] = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.5;
      }
      aOffset.needsUpdate = true;
      aScale.needsUpdate = true;
      aAlpha.needsUpdate = true;
    },
    cough() {
      spawn(true, 0);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
