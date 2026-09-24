import { AUDIO } from '../core/constants';
import type { VolumeKey } from '../core/store';

/**
 * One AudioContext, four group buses, a master gain, resume() on the start gesture, and a
 * duck() helper for when the radio panel opens. Suspends while the tab is hidden so muting the
 * tab or leaving it silences everything.
 *
 * Everything audible goes through a bus, including the one-shots — a thunderclap wired straight
 * to the master would ignore the weather fader, which is the one mistake this layout invites.
 * A limiter sits last, because the buses can and do sum past 1 in heavy weather.
 * Two things cannot join the graph at all: the Spotify embed, which is a cross-origin iframe,
 * and the live radio stream, whose element would be silenced by createMediaElementSource
 * without CORS on the stream server. The radio carries its own gain instead; see ui/tuner.ts.
 */
export type Bus = 'engine' | 'weather' | 'ambience' | 'music';

export const BUS_NAMES: readonly Bus[] = ['engine', 'weather', 'ambience', 'music'];

/** Where each bus's user level lives in the store, and what to call it on screen. */
export const BUS_STORE_KEY: Readonly<Record<Bus, VolumeKey>> = {
  engine: 'volumeEngine',
  weather: 'volumeWeather',
  ambience: 'volumeAmbience',
  music: 'volumeMusic',
};

export const BUS_LABEL: Readonly<Record<Bus, string>> = {
  engine: 'Engine',
  weather: 'Weather',
  ambience: 'Ambience',
  music: 'Music',
};

export interface Mixer {
  readonly context: AudioContext | null;
  readonly master: GainNode | null;
  /** Last in the chain. Exposed like `master` is, so its gain reduction can be measured. */
  readonly limiter: DynamicsCompressorNode | null;
  /** Where a layer or a one-shot connects. Null until the context exists. */
  bus(name: Bus): GainNode | null;
  /** The user's 0..1 setting for a group, multiplied by that bus's constant. */
  setBusVolume(name: Bus, v: number): void;
  /** The user's setting alone, for anything that has to apply it outside the graph. */
  busVolume(name: Bus): number;
  /** Create/resume the context. Must be called from a user gesture. */
  resume(): Promise<void>;
  suspend(): Promise<void>;
  setVolume(v: number): void;
  /** Multiply the master by `target` (0..1) over `ms`. */
  duck(target: number, ms: number): void;
  now(): number;
  dispose(): void;
}

export function createMixer(): Mixer {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let duckGain: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let volume: number = AUDIO.DEFAULT_VOLUME;
  let disposed = false;
  const buses = new Map<Bus, GainNode>();
  // Seeded before the context exists, so a preference restored at boot is not lost waiting for
  // the start gesture.
  const busLevels: Record<Bus, number> = { engine: 1, weather: 1, ambience: 1, music: 1 };

  const ensure = () => {
    if (context) return;
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = volume;
    duckGain = context.createGain();
    duckGain.gain.value = 1;
    // A limiter, because nothing else stops the buses summing past 1. Measured at the master
    // tap, the camper in Focus under thunder reaches 0.92 at the default volume and about 1.3
    // with the slider up, and a tank firing takes it further — all of which was clipping at the
    // destination. A hard knee at -3 dB with a fast attack only engages on those peaks and
    // leaves everything quieter than them untouched.
    limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    master.connect(duckGain).connect(limiter).connect(context.destination);
    for (const name of BUS_NAMES) {
      const g = context.createGain();
      g.gain.value = AUDIO.BUSES[name] * busLevels[name];
      g.connect(master);
      buses.set(name, g);
    }
  };

  const onVisibility = () => {
    if (!context) return;
    if (document.hidden) void context.suspend();
    else void context.resume();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return {
    get context() {
      return context;
    },
    get master() {
      return master;
    },
    get limiter() {
      return limiter;
    },
    bus(name) {
      ensure();
      return buses.get(name) ?? null;
    },
    setBusVolume(name, v) {
      busLevels[name] = Math.max(0, Math.min(1, v));
      const g = buses.get(name);
      if (g && context) {
        g.gain.cancelScheduledValues(context.currentTime);
        g.gain.setTargetAtTime(AUDIO.BUSES[name] * busLevels[name], context.currentTime, 0.05);
      }
    },
    busVolume(name) {
      return busLevels[name];
    },
    async resume() {
      if (disposed) return;
      ensure();
      if (context && context.state !== 'running') {
        try {
          await context.resume();
        } catch (err) {
          console.warn('[audio] resume failed', err);
        }
      }
    },
    async suspend() {
      if (context && context.state === 'running') await context.suspend();
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (master && context) {
        master.gain.cancelScheduledValues(context.currentTime);
        master.gain.setTargetAtTime(volume, context.currentTime, 0.05);
      }
    },
    duck(target, ms) {
      if (!duckGain || !context) return;
      duckGain.gain.cancelScheduledValues(context.currentTime);
      duckGain.gain.setTargetAtTime(target, context.currentTime, Math.max(0.01, ms / 1000 / 3));
    },
    now() {
      return context?.currentTime ?? 0;
    },
    dispose() {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void context?.close();
      context = null;
      master = null;
      limiter = null;
      buses.clear();
    },
  };
}
