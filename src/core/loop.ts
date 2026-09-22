/**
 * requestAnimationFrame loop with delta clamping and visibility pause.
 * `dt` is clamped to MAX_DT so an alt-tab does not teleport the world.
 */
export type TickFn = (dt: number, elapsed: number) => void;

const MAX_DT = 0.05;

export interface Loop {
  onTick(fn: TickFn): () => void;
  start(): void;
  stop(): void;
  /** True while the RAF loop is running (not paused by visibility). */
  readonly running: boolean;
  readonly elapsed: number;
  onVisibility(fn: (visible: boolean) => void): () => void;
}

export function createLoop(): Loop {
  const ticks = new Set<TickFn>();
  const visListeners = new Set<(visible: boolean) => void>();
  let raf = 0;
  let running = false;
  let wanted = false;
  let last = 0;
  let elapsed = 0;

  const frame = (now: number) => {
    if (!running) return;
    const t = now / 1000;
    let dt = last === 0 ? 1 / 60 : t - last;
    last = t;
    if (dt > MAX_DT) dt = MAX_DT;
    if (dt < 0) dt = 0;
    elapsed += dt;
    for (const fn of ticks) fn(dt, elapsed);
    raf = requestAnimationFrame(frame);
  };

  const resume = () => {
    if (running || !wanted) return;
    running = true;
    last = 0;
    raf = requestAnimationFrame(frame);
  };
  const pause = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
  };

  document.addEventListener('visibilitychange', () => {
    const visible = !document.hidden;
    if (visible) resume();
    else pause();
    for (const fn of visListeners) fn(visible);
  });

  return {
    onTick(fn) {
      ticks.add(fn);
      return () => ticks.delete(fn);
    },
    start() {
      wanted = true;
      if (!document.hidden) resume();
    },
    stop() {
      wanted = false;
      pause();
    },
    get running() {
      return running;
    },
    get elapsed() {
      return elapsed;
    },
    onVisibility(fn) {
      visListeners.add(fn);
      return () => visListeners.delete(fn);
    },
  };
}
