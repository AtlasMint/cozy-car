import { mulberry32 } from '../util/math';
import { AUDIO } from '../core/constants';

/**
 * Rain, generated rather than filtered.
 *
 * The old layer was white noise through a highpass and a bandpass, which is television static:
 * it has rain's spectrum and none of its structure. Real rain is two things at once — a
 * broadband bed from the drops too far away to resolve, and thousands of *discrete impacts*
 * near enough to hear individually. The bed alone is static. The impacts are the rain.
 *
 * So the texture is written out sample by sample the way `noiseBuffer` already writes its noise,
 * with one decaying resonant burst per drop. Being a plain function of a seed, it is
 * deterministic and its statistics can be asserted; see tests/rain.test.ts.
 *
 * Drops wrap past the end of the buffer with a modulo, and the bed is cross-faded into itself,
 * so the result loops with no seam to click on.
 *
 * Two axes, and they live in different places. **Density** is here: a drizzle is a handful of
 * drops you can pick out one at a time, a downpour is the same drops merged into a wash, and
 * the measurable difference is crest factor rather than spectrum — past a few hundred drops a
 * second the spectrum stops moving, because the texture has simply become the impacts.
 * **Brightness** is not here; it is the lowpass in layers.ts, which opens with intensity. Trying
 * to bake it in as well only makes two controls fight over one sound.
 */

/** One-pole lowpass coefficient for a cutoff, as a fraction of the sample rate. */
function onePole(cutoffHz: number, sampleRate: number): number {
  return 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
}

/**
 * A seamless bed: noise with a gentle downward tilt, generated long and cross-faded into itself
 * so the last sample leads back into the first.
 */
function bedInto(out: Float32Array, sampleRate: number, rng: () => number): void {
  const len = out.length;
  const fade = Math.min(Math.floor(sampleRate * 0.05), len >> 2);
  // Deliberately dark. The bed is the drops too far away to resolve, and distance eats treble;
  // all the brightness in this texture has to come from the impacts, or adding drops would make
  // the rain duller instead of sharper.
  const k = onePole(AUDIO.RAIN_SYNTH.bed.cutoff, sampleRate);
  const dry = AUDIO.RAIN_SYNTH.bed.dry;
  let lp = 0;
  const raw = new Float32Array(len + fade);
  for (let i = 0; i < raw.length; i++) {
    const w = rng() * 2 - 1;
    lp += k * (w - lp);
    raw[i] = dry * w + (1 - dry) * lp * 3;
  }
  out.set(raw.subarray(0, len));
  // Equal-power fold of the overhang onto the head.
  for (let i = 0; i < fade; i++) {
    const t = (i + 1) / (fade + 1);
    const a = Math.cos((t * Math.PI) / 2);
    const b = Math.sin((t * Math.PI) / 2);
    out[i] = b * out[i]! + a * raw[len + i]!;
  }
}

/**
 * A loopable rain texture. `density` is drops per second — the one parameter that separates
 * drizzle from a downpour, because it changes the texture rather than the level.
 */
export function rainBuffer(sampleRate: number, seconds: number, density: number, seed: number): Float32Array<ArrayBuffer> {
  const len = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(new ArrayBuffer(len * 4));
  const rng = mulberry32(seed);
  bedInto(out, sampleRate, rng);
  const bedGain = AUDIO.RAIN_SYNTH.bed.gain;
  for (let i = 0; i < len; i++) out[i] = out[i]! * bedGain;

  const [tauLo, tauHi] = AUDIO.RAIN_SYNTH.tau;
  const [fLo, fHi] = AUDIO.RAIN_SYNTH.freq;
  const ratio = fHi / fLo;
  const drops = Math.max(0, Math.round(density * seconds));
  for (let d = 0; d < drops; d++) {
    const start = Math.floor(rng() * len);
    // Log-uniform, because pitch is perceived that way and rain covers three octaves.
    const f = fLo * Math.pow(ratio, rng());
    const tau = tauLo + rng() * (tauHi - tauLo);
    // Small drops ring higher, faster and quieter; big ones sit in front.
    const amp = Math.sqrt(fLo / f);
    const w = (2 * Math.PI * f) / sampleRate;
    const phase = rng() * Math.PI * 2;
    const decay = Math.exp(-1 / (tau * sampleRate));
    const dur = Math.min(len, Math.ceil(5 * tau * sampleRate));
    let env = amp;
    for (let i = 0; i < dur; i++) {
      // Part resonance, part splash: a pure sine reads as a water drop in a cave.
      const s = 0.72 * Math.sin(w * i + phase) + 0.28 * (rng() * 2 - 1);
      out[(start + i) % len] = out[(start + i) % len]! + env * s;
      env *= decay;
    }
  }

  // Fixed output level, so `density` changes what it sounds like and never how loud it is.
  let sum = 0;
  for (let i = 0; i < len; i++) sum += out[i]! * out[i]!;
  const rms = Math.sqrt(sum / len);
  if (rms > 1e-9) {
    const g = AUDIO.RAIN_SYNTH.rms / rms;
    for (let i = 0; i < len; i++) out[i] = out[i]! * g;
  }
  return out;
}

/** Fraction of total energy above roughly 2 kHz. Rises with drop density. Pure; used by tests. */
export function highRatio(buf: Float32Array, sampleRate: number): number {
  const k = onePole(2000, sampleRate);
  let lp = 0;
  let high = 0;
  let all = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]!;
    lp += k * (v - lp);
    const h = v - lp;
    high += h * h;
    all += v * v;
  }
  return all > 0 ? high / all : 0;
}
