import { AUDIO } from '../core/constants';

/**
 * One AudioContext, a master gain, resume() on the start gesture, and a duck() helper for
 * when the radio panel opens. Suspends while the tab is hidden so muting the tab or leaving
 * it silences everything.
 */
export interface Mixer {
  readonly context: AudioContext | null;
  readonly master: GainNode | null;
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
  let volume: number = AUDIO.DEFAULT_VOLUME;
  let disposed = false;

  const ensure = () => {
    if (context) return;
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as typeof AudioContext | undefined;
    if (!Ctor) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = volume;
    duckGain = context.createGain();
    duckGain.gain.value = 1;
    master.connect(duckGain).connect(context.destination);
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
    },
  };
}
