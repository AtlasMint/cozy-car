import { AUDIO, MOTION, SPEED } from '../core/constants';
import { HATCHBACK, type EngineProfile } from '../core/vehicles';
import { createEngineVoice, type EngineVoice } from './engineVoice';
import { damp } from '../util/math';
import type { Mixer } from './mixer';

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
  dispose(): void;
}

interface Layer {
  gain: GainNode;
  source: AudioBufferSourceNode | null;
  synth: { nodes: AudioNode[]; setRate?: (r: number) => void; setEngine?: (rpm: number, load: number) => void; dispose?: () => void } | null;
  level: number;
}

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
    const master = mixer.master;
    if (!ctx || !master || started) return;
    started = true;
    for (const name of Object.keys(FILES) as LayerName[]) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(master);
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
        const src = loopNoise(ctx, false);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3200;
        bp.Q.value = 0.5;
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 900;
        const g = ctx.createGain();
        g.gain.value = 0.35;
        src.connect(hp).connect(bp).connect(g).connect(out);
        src.start();
        nodes.push(src, bp, hp, g);
        return { nodes };
      }
      case 'wind': {
        const src = loopNoise(ctx, false);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 420;
        bp.Q.value = 1.2;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.13;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 220;
        lfo.connect(lfoGain).connect(bp.frequency);
        lfo.start();
        const g = ctx.createGain();
        g.gain.value = 0.5;
        src.connect(bp).connect(g).connect(out);
        src.start();
        nodes.push(src, bp, lfo, lfoGain, g);
        return { nodes };
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
      const master = mixer.master;
      if (!ctx || !master || ctx.state !== 'running') return;
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
      src.connect(lp).connect(g).connect(master);
      src.start();
      src.stop(ctx.currentTime + 3.5);
    },
    crank() {
      const ctx = mixer.context;
      const master = mixer.master;
      if (!ctx || !master) return;
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
      osc.connect(lp).connect(g).connect(master);
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
      clicks.connect(hp).connect(cg).connect(master);
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
