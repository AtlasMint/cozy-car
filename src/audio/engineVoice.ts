import type { EngineProfile } from '../core/vehicles';

/**
 * The engine: a combustion pulse train played through fixed resonators.
 *
 * A four-stroke's cycle is two crank revolutions, so its spectrum sits at half-orders of crank
 * rotation — 0.5, 1, 1.5, 2… Run one oscillator at the *cycle* rate, rpm/120, and every integer
 * harmonic k of it is engine order k/2, so the half-orders come free and the whole pulse train
 * is a single band-limited node.
 *
 * The two things that make an engine sound lumpy rather than synthetic — fixed per-cylinder
 * gain differences and fixed firing asymmetry — are periodic over that cycle, so they bake
 * straight into the wave's Fourier coefficients at no runtime cost. Cylinder-to-cylinder
 * variation repeating once per two revolutions is exactly why half-order content exists in a
 * real engine.
 *
 * Everything downstream of the pulse train is FIXED: an exhaust pipe does not change length
 * with engine speed. The old synth swept a lowpass with rpm and held the excitation smooth,
 * which is backwards, and is why it read as a synth patch rather than a machine.
 *
 * See docs/PLAN-cars.md §11 for the model and its sources.
 */

/** Orders up to 32 (harmonic 64); everything above that is carried by the noise layers. */
export const HARMONICS = 64;

export interface OrderTable {
  real: Float32Array<ArrayBuffer>;
  imag: Float32Array<ArrayBuffer>;
}

/**
 * Fourier coefficients of one engine cycle. Pure — this is the part worth unit testing.
 *
 * The pulse train is `x(t) = Σ_i g_i · p(t − φ_i·T)`, so its k-th coefficient is the pulse
 * shape's k-th coefficient times `Σ_i g_i·e^(−j2πkφ_i)`. With even gains and exact spacing
 * that sum is zero except at multiples of the cylinder count, which is the firing order and
 * its harmonics; the per-cylinder spread is what leaks energy into the half-orders.
 */
export function buildOrderTable(p: EngineProfile, rolloff: number): OrderTable {
  const n = Math.max(1, Math.round(p.cylinders));
  const real = new Float32Array(new ArrayBuffer((HARMONICS + 1) * 4));
  const imag = new Float32Array(new ArrayBuffer((HARMONICS + 1) * 4));
  const gains: number[] = [];
  const phases: number[] = [];
  for (let i = 0; i < n; i++) {
    // Deterministic, not random: these are this engine's permanent character, and a fixed
    // pattern is what produces a steady half-order comb rather than noise. The golden angle
    // keeps the pattern aperiodic — a symmetric one (every other cylinder rich) would only
    // excite alternate half-orders, which is not how a real engine's spread behaves.
    const g = i * 2.399963;
    gains.push(1 + p.cylinderSpread * Math.sin(g + 1.1));
    phases.push(i / n + (p.asymmetryDeg / 720) * Math.sin(g + 0.4));
  }
  for (let k = 1; k <= HARMONICS; k++) {
    // Exponential harmonic rolloff models the pressure-release pulse; λ is the brightness knob.
    const shape = Math.exp(-0.5 * k * rolloff);
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = 2 * Math.PI * k * phases[i]!;
      re += gains[i]! * Math.cos(a);
      im -= gains[i]! * Math.sin(a);
    }
    real[k] = (shape * re) / n;
    imag[k] = (shape * im) / n;
  }
  return { real, imag };
}

/** Firing frequency of a four-stroke, Hz. Pure. */
export function firingHz(rpm: number, cylinders: number): number {
  return (rpm * cylinders) / 120;
}

/** The engine cycle rate — 720° of crank — which is what the pulse oscillator runs at. Pure. */
export function cycleHz(rpm: number): number {
  return rpm / 120;
}

export interface EngineVoice {
  output: AudioNode;
  /** rpm drives the pulse rate; load is 0 at idle and 1 under full load. */
  set(rpm: number, load: number): void;
  dispose(): void;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, brown: boolean): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      d[i] = w;
    }
  }
  return buf;
}

/** Half-wave rectifier, so a bipolar modulator gates noise once per pulse rather than twice. */
function rectifierCurve(): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(257 * 4));
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.max(0, x);
  }
  return c;
}

/** Soft clip. Drive rises with load, which is where the growl comes from. */
function softClipCurve(drive: number): Float32Array<ArrayBuffer> {
  const c = new Float32Array(new ArrayBuffer(257 * 4));
  const k = 1 + drive * 6;
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

export function createEngineVoice(ctx: AudioContext, p: EngineProfile): EngineVoice {
  const nodes: AudioNode[] = [];
  const out = ctx.createGain();
  out.gain.value = 1;

  // --- the pulse train: two waves, idle and loaded, crossfaded by load.
  const idleTable = buildOrderTable(p, p.rolloff.idle);
  const loadTable = buildOrderTable(p, p.rolloff.loaded);
  const idleWave = ctx.createPeriodicWave(idleTable.real, idleTable.imag);
  const loadWave = ctx.createPeriodicWave(loadTable.real, loadTable.imag);

  const oscIdle = ctx.createOscillator();
  const oscLoad = ctx.createOscillator();
  oscIdle.setPeriodicWave(idleWave);
  oscLoad.setPeriodicWave(loadWave);
  const gIdle = ctx.createGain();
  const gLoad = ctx.createGain();
  gIdle.gain.value = 1;
  gLoad.gain.value = 0;
  const pulse = ctx.createGain();
  pulse.gain.value = 0.9;
  oscIdle.connect(gIdle).connect(pulse);
  oscLoad.connect(gLoad).connect(pulse);

  // --- cycle-to-cycle irregularity: a slow zero-mean walk on detune, strongest at idle.
  const jitter = ctx.createBufferSource();
  jitter.buffer = noiseBuffer(ctx, 6, true);
  jitter.loop = true;
  const jitterLp = ctx.createBiquadFilter();
  jitterLp.type = 'lowpass';
  jitterLp.frequency.value = 75;
  const jitterGain = ctx.createGain();
  jitterGain.gain.value = p.irregularity.idle * 900;
  jitter.connect(jitterLp).connect(jitterGain);
  jitterGain.connect(oscIdle.detune);
  jitterGain.connect(oscLoad.detune);
  jitter.start();

  // --- exhaust resonators. FIXED formants: they never move with rpm.
  let chain: AudioNode = pulse;
  const modeFilters: BiquadFilterNode[] = [];
  for (const f of p.modes) {
    const bq = ctx.createBiquadFilter();
    bq.type = 'peaking';
    bq.frequency.value = f;
    bq.Q.value = 7;
    bq.gain.value = 7;
    chain = chain.connect(bq);
    modeFilters.push(bq);
  }
  // The Helmholtz band, where a real four-cylinder exhaust resonator is tuned and the drone lives.
  const drone = ctx.createBiquadFilter();
  drone.type = 'peaking';
  drone.frequency.value = p.dronePeak.freq;
  drone.Q.value = p.dronePeak.q;
  drone.gain.value = p.dronePeak.gainDb;
  chain = chain.connect(drone);

  const damping = ctx.createBiquadFilter();
  damping.type = 'lowpass';
  damping.frequency.value = p.dampingHz;
  damping.Q.value = 0.7;
  chain = chain.connect(damping);

  // Growl under load.
  const shaper = ctx.createWaveShaper();
  shaper.curve = softClipCurve(0);
  chain = chain.connect(shaper);

  // Tailpipe radiation: an open pipe end radiates the derivative of volume velocity, so the
  // radiated path is highpass. Skipping this is what makes a naive model sound boxy.
  const radiate = ctx.createBiquadFilter();
  radiate.type = 'highpass';
  radiate.frequency.value = 80;
  radiate.Q.value = 0.5;
  const dcBlock = ctx.createBiquadFilter();
  dcBlock.type = 'highpass';
  dcBlock.frequency.value = 20;
  chain.connect(radiate).connect(dcBlock).connect(out);

  // --- the cycle-locked modulator that gates the noise layers.
  const window = ctx.createOscillator();
  const winTable = buildOrderTable({ ...p, cylinderSpread: 0, asymmetryDeg: 0 }, 0.22);
  window.setPeriodicWave(ctx.createPeriodicWave(winTable.real, winTable.imag));
  const rect = ctx.createWaveShaper();
  rect.curve = rectifierCurve();
  window.connect(rect);

  const gateNoise = (freq: number, q: number, type: BiquadFilterType, depth: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 4, false);
    src.loop = true;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.value = freq;
    bq.Q.value = q;
    const gate = ctx.createGain();
    gate.gain.value = 0;
    const depthGain = ctx.createGain();
    depthGain.gain.value = depth;
    rect.connect(depthGain).connect(gate.gain);
    src.connect(bq).connect(gate).connect(out);
    src.start();
    nodes.push(src, bq, gate, depthGain);
    return { gate, depthGain };
  };

  // Intake roar, gated by the cycle and scaled hard by load: this is what makes Focus sound
  // loaded rather than merely faster.
  const intake = gateNoise(p.intake.freq, 0.8, 'bandpass', p.intake.idle);
  // Valve and injector tick. At idle this is what says "petrol engine" rather than "hum".
  gateNoise(p.tick.freq, 3, 'bandpass', p.tick.gain);
  // Block / knock band — most of what makes a diesel sound like a diesel.
  if (p.knock.gain > 0.001) gateNoise(p.knock.freq, p.knock.q, 'bandpass', p.knock.gain);

  oscIdle.start();
  oscLoad.start();
  window.start();
  nodes.push(oscIdle, oscLoad, gIdle, gLoad, pulse, drone, damping, shaper, radiate, dcBlock, window, rect, jitter, jitterLp, jitterGain, ...modeFilters);

  let lastDrive = -1;
  return {
    output: out,
    set(rpm, load) {
      const t = ctx.currentTime;
      const f = Math.max(0.5, cycleHz(rpm));
      // One rate for the whole engine: the oscillator follows the tachometer exactly.
      oscIdle.frequency.setTargetAtTime(f, t, 0.05);
      oscLoad.frequency.setTargetAtTime(f, t, 0.05);
      window.frequency.setTargetAtTime(f, t, 0.05);
      const k = Math.min(1, Math.max(0, load));
      gIdle.gain.setTargetAtTime(1 - k, t, 0.08);
      gLoad.gain.setTargetAtTime(k, t, 0.08);
      intake.depthGain.gain.setTargetAtTime(p.intake.idle + (p.intake.loaded - p.intake.idle) * k, t, 0.1);
      // Engines are least stable at idle, so irregularity falls as load rises.
      jitterGain.gain.setTargetAtTime((p.irregularity.idle + (p.irregularity.loaded - p.irregularity.idle) * k) * 900, t, 0.2);
      const drive = Math.round(k * 8) / 8;
      if (drive !== lastDrive) {
        lastDrive = drive;
        shaper.curve = softClipCurve(drive);
      }
    },
    dispose() {
      for (const n of nodes) {
        try {
          (n as OscillatorNode).stop?.();
        } catch {
          /* already stopped */
        }
        n.disconnect();
      }
      out.disconnect();
    },
  };
}
