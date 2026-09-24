import { AUDIO, MOTION, SPEED } from '../core/constants';
import { HATCHBACK, type EngineProfile } from '../core/vehicles';
import { createEngineVoice, type EngineVoice } from './engineVoice';
import { clamp01, damp } from '../util/math';
import { rainBuffer } from './rain';
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
  synth: { nodes: AudioNode[]; setRate?: (r: number) => void; setEngine?: (rpm: number, load: number) => void; setRain?: (intensity: number) => void; setWind?: (kmh: number, dt: number) => void; dispose?: () => void } | null;
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
        const src = loopNoise(ctx, true);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 160;
        src.connect(lp).connect(out);
        src.start();
        nodes.push(src, lp);
        return { nodes };
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

  const setLevel = (name: LayerName, target: number, dt: number) => {
    const l = layers.get(name);
    const ctx = mixer.context;
    if (!l || !ctx) return;
    l.level = damp(l.level, target, AUDIO.LEVEL_LAMBDA, dt);
    l.gain.gain.setTargetAtTime(l.level, ctx.currentTime, 0.05);
  };

  return {
    setEngineProfile(p) {
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
      // Three layers land within 25 ms of each other, so their peaks add. Measured at the
      // master tap: at the old level the sum reached 1.35 with the volume slider all the way
      // up, which is a clipped gun rather than a loud one. This leaves headroom.
      const peak = AUDIO.LEVELS.gun;

      // The crack. A few milliseconds of bright noise is the whole difference between a gun and
      // a thunderclap, which is otherwise the same falling rumble.
      const crack = ctx.createBufferSource();
      crack.buffer = noiseBuffer(ctx, 0.3, false);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.setValueAtTime(900, t);
      hp.frequency.exponentialRampToValueAtTime(220, t + 0.18);
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(peak, t + 0.004);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
      crack.connect(hp).connect(cg).connect(out);
      crack.start(t);
      crack.stop(t + 0.32);

      // The body of it, falling away over a second and a half.
      const blast = ctx.createBufferSource();
      blast.buffer = noiseBuffer(ctx, 2.2, true);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(700, t);
      lp.frequency.exponentialRampToValueAtTime(70, t + 1.6);
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0001, t);
      bg.gain.exponentialRampToValueAtTime(peak * 0.8, t + 0.025);
      bg.gain.exponentialRampToValueAtTime(peak * 0.25, t + 0.5);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      blast.connect(lp).connect(bg).connect(out);
      blast.start(t);
      blast.stop(t + 2.2);

      // And a sub thump, because 120 mm moves air that a hatchback never will.
      const sub = ctx.createOscillator();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(90, t);
      sub.frequency.exponentialRampToValueAtTime(34, t + 0.5);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(peak * 0.6, t + 0.015);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      sub.connect(sg).connect(out);
      sub.start(t);
      sub.stop(t + 1.0);
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
        l.synth?.dispose?.();
        for (const n of l.synth?.nodes ?? []) {
          try {
            (n as OscillatorNode).stop?.();
          } catch {
            /* already stopped */
          }
          n.disconnect();
        }
        l.gain.disconnect();
      }
      layers.clear();
    },
  };
}
