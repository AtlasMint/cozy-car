import { WEATHER_FX } from '../../core/constants';
import { randRange } from '../../util/math';

/**
 * Every 8–25 s: a two-frame ambient spike plus a random secondary flicker, then thunder
 * delayed 1–6 s. Returns a 0..1 flash value each frame; the director maps it onto lights
 * and sky. Only active while the weather is `thunder`.
 */
export interface LightningEffect {
  setIntensity(n: number): void;
  update(dt: number): number;
  onThunder(cb: (strength: number) => void): () => void;
  /** Force a strike now (debugging). */
  strike(): void;
}

export function createLightning(): LightningEffect {
  const L = WEATHER_FX.LIGHTNING;
  let intensity = 0;
  let nextIn = randRange(L.minGap * 0.5, L.maxGap * 0.6);
  let flash = 0;
  let hold = 0; // frames of full brightness left
  let secondaryIn = -1;
  let secondaryStrength = 0;
  const thunderQueue: { t: number; strength: number }[] = [];
  const listeners = new Set<(s: number) => void>();

  const fire = (strength: number) => {
    flash = Math.max(flash, strength);
    hold = 2;
  };

  return {
    setIntensity(n) {
      intensity = n;
    },
    strike() {
      const s = randRange(0.7, 1);
      fire(s);
      secondaryIn = randRange(0.08, 0.22);
      secondaryStrength = s * randRange(0.35, 0.7);
      thunderQueue.push({ t: randRange(L.thunderMin, L.thunderMax), strength: s });
    },
    update(dt) {
      if (intensity > 0.3) {
        nextIn -= dt;
        if (nextIn <= 0) {
          this.strike();
          nextIn = randRange(L.minGap, L.maxGap);
        }
      }
      if (secondaryIn >= 0) {
        secondaryIn -= dt;
        if (secondaryIn < 0) fire(secondaryStrength);
      }
      for (let i = thunderQueue.length - 1; i >= 0; i--) {
        thunderQueue[i]!.t -= dt;
        if (thunderQueue[i]!.t <= 0) {
          const s = thunderQueue[i]!.strength;
          thunderQueue.splice(i, 1);
          for (const cb of listeners) cb(s);
        }
      }
      if (hold > 0) hold--;
      else flash *= Math.exp(-dt / 0.09);
      if (flash < 0.002) flash = 0;
      return flash * intensity;
    },
    onThunder(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
