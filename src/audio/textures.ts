import { mulberry32 } from '../util/math';

/**
 * Generated audio textures, written out sample by sample the way rain.ts writes rain: pure
 * functions of a seed, normalised to a fixed level, and loopable where they loop. Being pure,
 * their statistics can be asserted; see tests/textures.test.ts.
 */

const rms = (b: Float32Array): number => {
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i]! * b[i]!;
  return Math.sqrt(s / b.length);
};

const normalise = (b: Float32Array<ArrayBuffer>, target: number): Float32Array<ArrayBuffer> => {
  const r = rms(b);
  if (r > 1e-9) {
    const g = target / r;
    for (let i = 0; i < b.length; i++) b[i] = b[i]! * g;
  }
  return b;
};

/**
 * Flexural mode ratios of a free-free steel bar. A track link is a chunky irregular casting
 * rather than a bar, but the principle is what matters: these are not harmonics. Inharmonic
 * modes are why struck steel *rings* instead of sounding a note.
 */
const BAR_MODES = [1, 2.756, 5.404, 8.933, 13.344] as const;

/**
 * Track clatter: what a tracked vehicle's running gear sounds like when it moves.
 *
 * Each link engaging a sprocket or slapping a road wheel is a struck lump of steel, so each one
 * is modal synthesis: a handful of inharmonic partials over a low thump for the mass of the
 * link, under a one-millisecond click for the strike itself.
 *
 * The thing that decides whether this reads as steel or as a woodblock is not the frequencies —
 * it is that **the higher modes decay faster than the lower ones**. Wood and bone shed every
 * mode at once, which is a short even clack; metal holds its fundamental long after the bright
 * partials have gone, which is a ring. The first version of this had two partials sharing one
 * decay over 24-32 ms, and sounded exactly like bones for exactly that reason.
 *
 * Impacts are placed at `rate` per second by a seeded PRNG and wrap past the end with a modulo,
 * so the buffer loops seamlessly and its playback rate can be driven by speed.
 */
export function trackBuffer(sampleRate: number, seconds: number, rate: number, seed: number): Float32Array<ArrayBuffer> {
  const len = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(new ArrayBuffer(len * 4));
  const rng = mulberry32(seed);
  const hits = Math.max(0, Math.round(rate * seconds));
  const nyquist = sampleRate * 0.45;
  // Index 0 is the thump and decays slowest; the modes follow in ascending order, so a partial
  // that has died can be dropped off the end and the inner loop shrinks as the strike rings out.
  const w = new Float64Array(BAR_MODES.length + 1);
  const phase = new Float64Array(BAR_MODES.length + 1);
  const env = new Float64Array(BAR_MODES.length + 1);
  const decay = new Float64Array(BAR_MODES.length + 1);

  for (let h = 0; h < hits; h++) {
    const start = Math.floor(rng() * len);
    const f0 = 1200 * Math.pow(2.6, rng());
    const tau0 = 0.05 + rng() * 0.075;
    const amp = 0.55 + rng() * 0.45;
    // Every link is its own casting, so the ratios stretch a little from one to the next. A
    // fixed ratio makes every impact the same object struck again.
    const stretch = 0.93 + rng() * 0.14;

    // The mass of the link landing. Longer than anything above it, and what gives it weight.
    const thumpTau = tau0 * 1.2;
    w[0] = (2 * Math.PI * (130 * Math.pow(2, rng()))) / sampleRate;
    phase[0] = rng() * Math.PI * 2;
    env[0] = 0.35;
    decay[0] = Math.exp(-1 / (thumpTau * sampleRate));

    let n = 1;
    for (let m = 0; m < BAR_MODES.length; m++) {
      const f = f0 * BAR_MODES[m]! * (m === 0 ? 1 : stretch) * (1 + (rng() - 0.5) * 0.05);
      if (f > nyquist) break;
      w[n] = (2 * Math.PI * f) / sampleRate;
      phase[n] = rng() * Math.PI * 2;
      env[n] = 1 / Math.pow(m + 1, 0.5);
      decay[n] = Math.exp(-1 / ((tau0 / (1 + 0.7 * m)) * sampleRate));
      n++;
    }

    // 5 time constants of the slowest partial: past that it is 40 dB down and inaudible, and
    // the tail is most of what this costs to generate.
    const dur = Math.min(len, Math.ceil(5 * thumpTau * sampleRate));
    const clickLen = Math.floor(sampleRate * 0.0012);
    let alive = n;
    for (let i = 0; i < dur; i++) {
      let v = i < clickLen ? 0.8 * (rng() * 2 - 1) : 0;
      for (let k = 0; k < alive; k++) {
        v += env[k]! * Math.sin(w[k]! * i + phase[k]!);
        env[k] = env[k]! * decay[k]!;
      }
      const j = (start + i) % len;
      out[j] = out[j]! + amp * v;
      while (alive > 1 && env[alive - 1]! < 1e-4) alive--;
    }
  }
  return normalise(out, 0.18);
}

/**
 * The impulse response of a gun going off outdoors: nothing for the first few tens of
 * milliseconds while the direct sound passes, then reflections off the ground and the treeline
 * arriving as a dense decaying tail that loses its top end as it goes. A ConvolverNode fed with
 * this turns a dry burst into something that happened in a place.
 */
export function blastImpulse(sampleRate: number, seconds: number, seed: number): Float32Array<ArrayBuffer> {
  const len = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(new ArrayBuffer(len * 4));
  const rng = mulberry32(seed);
  const preDelay = Math.floor(sampleRate * 0.035);
  const tau = 0.55;
  let lp = 0;
  for (let i = preDelay; i < len; i++) {
    const t = (i - preDelay) / sampleRate;
    const w = rng() * 2 - 1;
    // Air and ground absorb treble first, so the reflections darken as they age: the one-pole
    // closes from about 5 kHz down toward 300 Hz over the tail.
    const cutoff = 300 + 4700 * Math.exp(-t / 0.4);
    const k = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    lp += k * (w - lp);
    // A handful of discrete early reflections stand proud of the diffuse tail.
    const early = t < 0.25 && rng() < 0.002 ? 2.5 : 1;
    out[i] = lp * Math.exp(-t / tau) * early;
  }
  // Level so the wet return sits alongside the dry burst rather than swamping it.
  return normalise(out, 0.05);
}
