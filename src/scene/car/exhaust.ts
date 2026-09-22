import * as THREE from 'three';
import { MOTION } from '../../core/constants';

/**
 * Slow, sparse exhaust puffs from the tailpipe, which faces the camera. A small pool of
 * sprites; each spawns at the tip, drifts back and up, grows and fades.
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
  sprite: THREE.Sprite;
  age: number;
  life: number;
  size: number;
  vx: number;
  vy: number;
  vz: number;
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

export function createExhaust(tip: THREE.Vector3, poolSize = 14): ExhaustRig {
  const group = new THREE.Group();
  group.name = 'exhaust';
  const texture = puffTexture();
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: '#e6e4de',
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  const pool: Puff[] = [];
  for (let i = 0; i < poolSize; i++) {
    const sprite = new THREE.Sprite(material.clone());
    sprite.visible = false;
    group.add(sprite);
    pool.push({ sprite, age: 0, life: 1, size: 0.1, vx: 0, vy: 0, vz: 0 });
  }
  let acc = 0;

  const spawn = (big: boolean, speed: number) => {
    const p = pool.find((q) => !q.sprite.visible) ?? pool.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    p.age = 0;
    p.life = MOTION.EXHAUST.life * (big ? 1.4 : 0.8 + Math.random() * 0.4);
    p.size = MOTION.EXHAUST.size * (big ? 2.2 : 0.8 + Math.random() * 0.5);
    p.vx = -(MOTION.EXHAUST.drift + speed * 0.35) * (0.8 + Math.random() * 0.4);
    p.vy = MOTION.EXHAUST.rise * (0.8 + Math.random() * 0.5);
    p.vz = (Math.random() - 0.5) * 0.12;
    p.sprite.position.copy(tip).add(new THREE.Vector3(-0.05, 0, 0));
    p.sprite.visible = true;
    (p.sprite.material as THREE.SpriteMaterial).opacity = big ? 0.7 : 0.5;
    p.sprite.scale.setScalar(p.size);
  };

  return {
    group,
    update(dt, rate, speed) {
      acc += rate * dt;
      while (acc >= 1) {
        acc -= 1;
        spawn(false, speed);
      }
      for (const p of pool) {
        if (!p.sprite.visible) continue;
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) {
          p.sprite.visible = false;
          continue;
        }
        p.sprite.position.x += p.vx * dt;
        p.sprite.position.y += p.vy * dt;
        p.sprite.position.z += p.vz * dt;
        p.vy *= 1 - 0.6 * dt;
        const s = p.size * (1 + MOTION.EXHAUST.grow * k * 3);
        p.sprite.scale.setScalar(s);
        const mat = p.sprite.material as THREE.SpriteMaterial;
        mat.opacity = (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85) * 0.5;
      }
    },
    cough() {
      spawn(true, 0);
    },
    dispose() {
      texture.dispose();
      material.dispose();
      for (const p of pool) (p.sprite.material as THREE.Material).dispose();
    },
  };
}
