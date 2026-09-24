import { AUDIO, MOTION, SPEED } from '../core/constants';
import { HATCHBACK, type EngineProfile } from '../core/vehicles';
import { createEngineVoice, type EngineVoice } from './engineVoice';
import { clamp01, damp } from '../util/math';
import { rainBuffer } from './rain';
import { blastImpulse, trackBuffer } from './textures';
import type { Bus, Mixer } from './mixer';

/**
 * Looping ambience layers, each with its own gain. Every layer first tries its file under
 * /audio; if the file is missing or will not decode, a small procedural synth stands in so a
 * missing asset never breaks the app and the scene has sound out of the box. Exterior
 * perspective: engine and road forward in the mix, no rain-on-roof layer.
 */
export type LayerName = 'engine' | 'roadNoise' | 'rain' | 'wind' | 'ambience';

export interface LayerDrivers {
  engine: number; // 0..1 (ignition ramp)
  blend: number; // 0 chill → 1 focus
  speed: number; // m/s
  rain: number; // 0..1
  windKmh: number;
  night: number; // 0..1
  rpm: number;
}

export interface Layers {
  update(dt: number, d: LayerDrivers): void;
  /** Point the engine at a different vehicle's voice. Must be called BEFORE engineOn flips,
   *  or the new vehicle cranks with the old one's starter: the store notifies synchronously. */
  setEngineProfile(p: EngineProfile): void;
  thunder(strength: number): void;
  crank(): void;
  /** A main gun going off. Louder than anything else here, and asked for rather than imposed. */
  gunshot(): void;
  dispose(): void;
}

interface Layer {
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  synth: { nodes: AudioNode[]; setRate?: (r: number) => void; setEngine?: (rpm: number, load: number) => void; setRain?: (intensity: number) => void; setWind?: (kmh: number, dt: number) => void; setRoad?: (speed: number) => void; dispose?: () => void } | null;
  level: number;
}

/**
 * Which group each layer sits in. Road noise rides the engine bus on purpose: it is the
 * vehicle's own noise, and nobody wants a separate fader for tyres.
 */
const BUS_OF: Record<LayerName, Bus> = {
  engine: 'engine',
  roadNoise: 'engine',
  rain: 'weather',
  wind: 'weather',
  ambience: 'ambience',
};

const FILES: Record<LayerName, string> = {
  engine: 'engine-idle.ogg',
  roadNoise: 'road-hum.ogg',
  rain: 'rain-loop.ogg',
  wind: 'wind.ogg',
  ambience: 'outdoor-tone.ogg',
};

let warnedOnce = false;

function noiseBuffer(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer {
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

function loopNoise(ctx: AudioContext, brown: boolean): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 4, brown);
  src.loop = true;
  return src;
}

export function createLayers(mixer: Mixer, initialProfile: EngineProfile = HATCHBACK.audio): Layers {
  let profile = initialProfile;
  let engineVoice: EngineVoice | null = null;
  const layers = new Map<LayerName, Layer>();
  let started = false;
  let rate = 1;

  const start = () => {
    const ctx = mixer.context;
    if (!ctx || !mixer.master || started) return;
    started = true;
    for (const name of Object.keys(FILES) as LayerName[]) {
      const bus = mixer.bus(BUS_OF[name]);
      if (!bus) continue;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(bus);
      const layer: Layer = { gain, source: null, synth: null, level: 0 };
      layers.set(name, layer);
      void loadOrSynth(ctx, name, layer);
    }
  };

  const loadOrSynth = async (ctx: AudioContext, name: LayerName, layer: Layer) => {
    try {
      const res = await fetch(`/audio/${FILES[name]}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(layer.gain);
      src.start();
      layer.source = src;
    } catch (err) {
      if (!warnedOnce) {
        warnedOnce = true;
        console.info('[audio] no loops under /audio — running the synthesized layers, which is the shipped default. Drop files there to replace them. See public/audio/README.md.', err);
      }
      layer.synth = synthFor(ctx, name, layer.gain);
    }
  };

  const synthFor = (ctx: AudioContext, name: LayerName, out: GainNode): Layer['synth'] => {
    const nodes: AudioNode[] = [];
    switch (name) {
      case 'engine': {
        // The engine is a pulse train through fixed resonators; see audio/engineVoice.ts.
        const voice = createEngineVoice(ctx, profile);
        voice.output.connect(out);
        engineVoice = voice;
        return {
          nodes,
          setEngine: (rpm, load) => voice.set(rpm, load),
          dispose: () => voice.dispose(),
        };
      }
      case 'roadNoise': {
        const tr = profile.tracks;
        if (!tr) {
          // Tyres on tarmac: a hum.
          const src = loopNoise(ctx, true);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 160;
          src.connect(lp).connect(out);
          src.start();
          nodes.push(src, lp);
          return { nodes };
        }
        // Tracks: link clatter whose rate follows speed, and a sprocket squeal over it. The
        // clatter is a generated impact texture (textures.ts) played faster as the tank moves,
        // which also pitches the ring up a little — steel under strain does the same.
        const data = trackBuffer(ctx.sampleRate, 4, tr.clatterRate, 0x7a11);
        const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
        buffer.copyToChannel(data, 0);
        const clatter = ctx.createBufferSource();
        clatter.buffer = buffer;
        clatter.loop = true;
        clatter.playbackRate.value = 0.2;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1400;
        band.Q.value = 0.5;
        clatter.connect(band).connect(out);
        clatter.start(ctx.currentTime, Math.random() * 4);

        const hiss = loopNoise(ctx, false);
        const squeal = ctx.createBiquadFilter();
        squeal.type = 'bandpass';
        squeal.frequency.value = tr.squeal.freq;
        squeal.Q.value = tr.squeal.q;
        const squealGain = ctx.createGain();
        squealGain.gain.value = 0;
        // The squeal comes and goes as links bind and release; a slow LFO on its pitch keeps it
        // from being one steady whistle.
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.37;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = tr.squeal.freq * 0.04;
        lfo.connect(lfoDepth).connect(squeal.frequency);
        lfo.start();
        hiss.connect(squeal).connect(squealGain).connect(out);
        hiss.start();
        nodes.push(clatter, band, hiss, squeal, squealGain, lfo, lfoDepth);
        return {
          nodes,
          setRoad(speed) {
            const t = ctx.currentTime;
            const rate = Math.min(2.4, Math.max(0.2, speed / tr.speedForRate1));
            clatter.playbackRate.setTargetAtTime(rate, t, 0.4);
            // Squeal needs real speed before it starts, and then grows with it.
            const k = Math.min(1, Math.max(0, (speed - 2) / 12));
            squealGain.gain.setTargetAtTime(tr.squeal.gain * k, t, 0.5);
          },
        };
      }
      case 'rain': {
        // Two textures — a drizzle and a downpour — crossfaded by intensity, because what
        // separates them is how many drops you can pick out, not how loud they are. See rain.ts.
        const R = AUDIO.RAIN_SYNTH;
        const tone = ctx.createBiquadFilter();
        tone.type = 'lowpass';
        tone.frequency.value = R.tone.from;
        tone.connect(out);

        const texture = (density: number, seed: number) => {
          const data = rainBuffer(ctx.sampleRate, R.seconds, density, seed);
          const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
          buffer.copyToChannel(data, 0);
          const g = ctx.createGain();
          g.connect(tone);
          nodes.push(g);
          // Two copies at slightly different rates, started at unrelated offsets. One alone
          // and you hear the four seconds come round.
          for (const rate of R.rates) {
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;
            src.playbackRate.value = rate;
            src.connect(g);
            src.start(ctx.currentTime, Math.random() * R.seconds);
            nodes.push(src);
          }
          return g;
        };
        const light = texture(R.density.light, 0x5ea1);
        const heavy = texture(R.density.heavy, 0x9c0d);
        light.gain.value = R.gain;
        heavy.gain.value = 0;

        // The low bed under heavy rain, which no amount of hiss stands in for.
        const rumble = loopNoise(ctx, true);
        const rumbleLp = ctx.createBiquadFilter();
        rumbleLp.type = 'lowpass';
        rumbleLp.frequency.value = R.rumble.freq;
        const rumbleGain = ctx.createGain();
        rumbleGain.gain.value = 0;
        rumble.connect(rumbleLp).connect(rumbleGain).connect(out);
        rumble.start();
        nodes.push(rumble, rumbleLp, rumbleGain, tone);

        return {
          nodes,
          setRain(k) {
            const t = ctx.currentTime;
            const mix = clamp01((k - 0.2) / 0.65);
            // Equal power, so the crossfade does not dip or bulge in the middle.
            light.gain.setTargetAtTime(Math.cos((mix * Math.PI) / 2) * R.gain, t, 0.3);
            heavy.gain.setTargetAtTime(Math.sin((mix * Math.PI) / 2) * R.gain, t, 0.3);
            tone.frequency.setTargetAtTime(R.tone.from + (R.tone.to - R.tone.from) * k, t, 0.3);
            const deep = clamp01((k - R.rumble.from) / (1 - R.rumble.from));
            rumbleGain.gain.setTargetAtTime(deep * R.rumble.gain, t, 0.4);
          },
        };
      }
      case 'wind': {
        const W = AUDIO.WIND_SYNTH;
        // Brown under, white over: a bandpass at 180 Hz finds almost nothing in white noise,
        // and the low rush is most of what a wind sounds like from inside a parked car.
        const low = loopNoise(ctx, true);
        const high = loopNoise(ctx, false);
        const sum = ctx.createGain();
        sum.gain.value = W.gain;
        sum.connect(out);
        const tops: BiquadFilterNode[] = [];
        W.bands.forEach((freq, i) => {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.value = freq;
          bp.Q.value = W.q[i]!;
          const g = ctx.createGain();
          g.gain.value = W.gains[i]!;
          (i === 0 ? low : high).connect(bp).connect(g).connect(sum);
          // Each band drifts at its own rate. Incommensurate on purpose: with one LFO, or with
          // rates that share a factor, the whole thing pulses in step and reads as a machine.
          const lfo = ctx.createOscillator();
          lfo.frequency.value = W.lfo[i]!;
          const depth = ctx.createGain();
          depth.gain.value = freq * W.sweep;
          lfo.connect(depth).connect(bp.frequency);
          lfo.start();
          nodes.push(bp, g, lfo, depth);
          if (i === W.bands.length - 1) tops.push(bp);
        });
        low.start();
        high.start();
        nodes.push(low, high, sum);

        const top = tops[0]!;
        const topQ = W.q[W.q.length - 1]!;
        let gust = 0;
        return {
          nodes,
          setWind(kmh, dt) {
            // A damped random walk: pulled back toward nothing, shoved at random. Harder wind
            // is shoved harder, so a gale gusts and a breeze only sighs.
            const strength = clamp01(kmh / 40);
            const step = Math.min(dt, 0.05);
            gust += (-gust * W.gust.lambda + (Math.random() * 2 - 1) * W.gust.kick * (0.25 + strength)) * step;
            gust = Math.max(-1, Math.min(1, gust));
            const t = ctx.currentTime;
            sum.gain.setTargetAtTime(W.gain * (1 + W.gust.depth * gust * strength), t, 0.25);
            // The top band tightens at the peak of a gust, which is the whistle.
            top.Q.setTargetAtTime(topQ * (1 + W.gust.qLift * Math.max(0, gust) * strength), t, 0.25);
          },
        };
      }
      case 'ambience': {
        const src = loopNoise(ctx, true);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 90;
        const tone = ctx.createOscillator();
        tone.type = 'sine';
        tone.frequency.value = 55;
        const tg = ctx.createGain();
        tg.gain.value = 0.05;
        src.connect(lp).connect(out);
        tone.connect(tg).connect(out);
        src.start();
        tone.start();
        nodes.push(src, lp, tone, tg);
        return { nodes };
      }
    }
  };

  const teardownSynth = (synth: NonNullable<Layer['synth']>) => {
    synth.dispose?.();
    for (const n of synth.nodes) {
      try {
        (n as OscillatorNode).stop?.();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
  };

  // The space the gun goes off in. Built once, on the first shot, and kept: a convolver's cost
  // is its impulse response, and there is no reason to pay for it while nobody is firing.
  let blastVerb: ConvolverNode | null = null;
  const verb = (ctx: AudioContext, out: AudioNode): ConvolverNode => {
    if (blastVerb) return blastVerb;
    const ir = blastImpulse(ctx.sampleRate, 2.6, 0xb1a57);
    const buffer = ctx.createBuffer(1, ir.length, ctx.sampleRate);
    buffer.copyToChannel(ir, 0);
    blastVerb = ctx.createConvolver();
    blastVerb.buffer = buffer;
    blastVerb.normalize = false;
    blastVerb.connect(out);
    return blastVerb;
  };

  const setLevel = (name: LayerName, target: number, dt: number) => {
    const l = layers.get(name);
    const ctx = mixer.context;
    if (!l || !ctx) return;
    l.level = damp(l.level, target, AUDIO.LEVEL_LAMBDA, dt);
    l.gain.gain.setTargetAtTime(l.level, ctx.currentTime, 0.05);
  };

  return {
    setEngineProfile(p) {
      const hadTracks = !!profile.tracks;
      profile = p;
      // The voice bakes its wave tables and resonators per vehicle, so it is rebuilt rather
      // than retuned. The layer's gain node survives, so the level ramp is unbroken.
      const layer = layers.get('engine');
      if (layer && engineVoice) {
        engineVoice.dispose();
        const voice = createEngineVoice(mixer.context!, p);
        voice.output.connect(layer.gain);
        engineVoice = voice;
        layer.synth = { nodes: [], setEngine: (rpm, load) => voice.set(rpm, load), dispose: () => voice.dispose() };
      }
      // The road layer is the one other thing a vehicle can change the *kind* of: tyres hum and
      // tracks clatter. Rebuild it only when that changes, and only if it is the synth — a file
      // dropped into public/audio stays whatever it is.
      const road = layers.get('roadNoise');
      if (road && road.synth && !road.source && hadTracks !== !!p.tracks) {
        teardownSynth(road.synth);
        road.synth = synthFor(mixer.context!, 'roadNoise', road.gain);
      }
    },
    update(dt, d) {
      if (!started) start();
      const ctx = mixer.context;
      if (!ctx || ctx.state !== 'running') return;
      const L = AUDIO.LEVELS;
      const speedK = Math.min(1, d.speed / SPEED.FOCUS);
      setLevel('engine', L.engine * profile.gain.engine * d.engine * (0.8 + 0.2 * d.blend), dt);
      setLevel('roadNoise', L.roadNoise * profile.gain.road * speedK * d.engine, dt);
      setLevel('rain', L.rain * d.rain, dt);
      layers.get('rain')?.synth?.setRain?.(d.rain);
      layers.get('wind')?.synth?.setWind?.(d.windKmh, dt);
      layers.get('roadNoise')?.synth?.setRoad?.(d.speed);
      setLevel('wind', L.wind * profile.gain.wind * (Math.min(1, d.windKmh / 40) * 0.6 + 0.5 * speedK), dt);
      setLevel('ambience', L.ambience * (1 - 0.5 * d.night), dt);

      const targetRate = 1 + (profile.focusRate - 1) * d.blend;
      rate = damp(rate, targetRate, 1.6, dt);
      const engine = layers.get('engine');
      if (engine?.source) engine.source.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.1);
      // rpm drives the pulse rate directly and `blend` is the load, so Chill and Focus now
      // differ in timbre rather than only in pitch.
      engine?.synth?.setEngine?.(d.rpm, d.blend);
    },
    thunder(strength) {
      const ctx = mixer.context;
      const out = mixer.bus('weather');
      if (!ctx || !out || ctx.state !== 'running') return;
      // Synthesized rumble: a noise burst through a sweeping lowpass with a long decay.
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx, 3.5, true);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(320, ctx.currentTime);
      lp.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 3);
      const g = ctx.createGain();
      const peak = AUDIO.LEVELS.thunder * strength;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(peak, ctx.currentTime + 0.12);
      g.gain.exponentialRampToValueAtTime(peak * 0.5, ctx.currentTime + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 3.4);
      src.connect(lp).connect(g).connect(out);
      src.start();
      src.stop(ctx.currentTime + 3.5);
    },
    gunshot() {
      const ctx = mixer.context;
      // The engine bus, not the weather one: this is the vehicle making the noise, so the
      // fader labelled Engine is the one that should govern it.
      const out = mixer.bus('engine');
      if (!ctx || !out || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      // Several layers land within 25 ms of each other, so their peaks add. Measured at the
      // master tap with the engine silenced and the volume all the way up, this shape peaks at
      // about 0.85 — around the limiter's threshold, so the limiter stays a backstop rather than
      // the plan. The 3 ms shock is what sets that peak; the body is what you feel.
      const peak = AUDIO.LEVELS.gun;
      const wet = verb(ctx, out);
      // What goes to the room. Not the sub — low end in a reverb is mud, and outdoors it would
      // not reflect anyway.
      const send = ctx.createGain();
      send.gain.value = 0.8;
      send.connect(wet);

      // 1. The shock. Two milliseconds of full-band impulse. A real muzzle blast starts as a
      //    step in pressure, and without this the whole thing has a soft leading edge no matter
      //    what follows.
      const shock = ctx.createBufferSource();
      shock.buffer = noiseBuffer(ctx, 0.01, false);
      const shockGain = ctx.createGain();
      shockGain.gain.setValueAtTime(peak * 0.9, t);
      shockGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.003);
      shock.connect(shockGain);
      shockGain.connect(out);
      shockGain.connect(send);
      shock.start(t);
      shock.stop(t + 0.01);

      // 2. The crack: bright, broad and gone in sixty milliseconds. A bandpass rather than the
      //    old swept highpass — that read as hiss, this reads as a snap.
      const crack = ctx.createBufferSource();
      crack.buffer = noiseBuffer(ctx, 0.2, false);
      const crackBand = ctx.createBiquadFilter();
      crackBand.type = 'bandpass';
      crackBand.frequency.value = 2000;
      crackBand.Q.value = 0.45;
      const crackGain = ctx.createGain();
      crackGain.gain.setValueAtTime(0.0001, t);
      crackGain.gain.exponentialRampToValueAtTime(peak * 0.9, t + 0.003);
      crackGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
      crack.connect(crackBand).connect(crackGain);
      crackGain.connect(out);
      crackGain.connect(send);
      crack.start(t);
      crack.stop(t + 0.1);

      // 3. The body: the pressure wave itself, chesty and fast to arrive, falling to nothing as
      //    the lowpass closes down to the rumble.
      const blast = ctx.createBufferSource();
      blast.buffer = noiseBuffer(ctx, 1.6, true);
      const blastLp = ctx.createBiquadFilter();
      blastLp.type = 'lowpass';
      blastLp.frequency.setValueAtTime(900, t);
      blastLp.frequency.exponentialRampToValueAtTime(60, t + 1.2);
      const blastGain = ctx.createGain();
      blastGain.gain.setValueAtTime(0.0001, t);
      blastGain.gain.exponentialRampToValueAtTime(peak * 1.7, t + 0.012);
      blastGain.gain.exponentialRampToValueAtTime(peak * 0.4, t + 0.3);
      blastGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      blast.connect(blastLp).connect(blastGain);
      blastGain.connect(out);
      blastGain.connect(send);
      blast.start(t);
      blast.stop(t + 1.6);

      // 4. The sub under everything. Dry only.
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(80, t);
      sub.frequency.exponentialRampToValueAtTime(30, t + 0.45);
      const subGain = ctx.createGain();
      subGain.gain.setValueAtTime(0.0001, t);
      subGain.gain.exponentialRampToValueAtTime(peak * 0.9, t + 0.012);
      subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      sub.connect(subGain).connect(out);
      sub.start(t);
      sub.stop(t + 0.75);

      // 5. The breech. Four hundred milliseconds later the gun runs back into battery and the
      //    breech opens: a steel clank, two inharmonic partials over a short click. It is the
      //    detail that says a machine fired that, not a sound effect.
      const t2 = t + 0.4;
      for (const [freq, level] of [
        [1150, 0.28],
        [2760, 0.16],
      ] as const) {
        const ring = ctx.createOscillator();
        ring.type = 'sine';
        ring.frequency.value = freq;
        const ringGain = ctx.createGain();
        ringGain.gain.setValueAtTime(0.0001, t2);
        ringGain.gain.exponentialRampToValueAtTime(peak * level, t2 + 0.002);
        ringGain.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.09);
        ring.connect(ringGain);
        ringGain.connect(out);
        ringGain.connect(send);
        ring.start(t2);
        ring.stop(t2 + 0.1);
      }
      const clank = ctx.createBufferSource();
      clank.buffer = noiseBuffer(ctx, 0.02, false);
      const clankHp = ctx.createBiquadFilter();
      clankHp.type = 'highpass';
      clankHp.frequency.value = 1500;
      const clankGain = ctx.createGain();
      clankGain.gain.setValueAtTime(peak * 0.3, t2);
      clankGain.gain.exponentialRampToValueAtTime(0.0001, t2 + 0.012);
      clank.connect(clankHp).connect(clankGain).connect(out);
      clank.start(t2);
      clank.stop(t2 + 0.02);
    },
    crank() {
      const ctx = mixer.context;
      const out = mixer.bus('engine');
      if (!ctx || !out) return;
      // Starter motor: a rising saw with a click train, 0.7 s, then the engine catches.
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(profile.crank.from, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(profile.crank.to, ctx.currentTime + profile.crank.ms / 1000);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(AUDIO.LEVELS.crank, ctx.currentTime + 0.05);
      g.gain.setValueAtTime(AUDIO.LEVELS.crank, ctx.currentTime + 0.6);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.85);
      osc.connect(lp).connect(g).connect(out);
      osc.start();
      osc.stop(ctx.currentTime + 0.9);
      const clicks = ctx.createBufferSource();
      clicks.buffer = noiseBuffer(ctx, 0.8, false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(AUDIO.LEVELS.crank * 0.35, ctx.currentTime);
      cg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.75);
      clicks.connect(hp).connect(cg).connect(out);
      clicks.start();
    },
    dispose() {
      for (const l of layers.values()) {
        l.source?.stop();
        l.source?.disconnect();
        if (l.synth) teardownSynth(l.synth);
        l.gain.disconnect();
      }
      layers.clear();
      blastVerb?.disconnect();
      blastVerb = null;
    },
  };
}
