/**
 * Critically damped spring, integrated implicitly so it is stable for any dt. Used for every
 * blend that should settle without overshoot: mode transitions, speed, posture, zoom.
 */
export interface Spring {
  x: number;
  v: number;
  /** Advance toward `target` by `dt` seconds with angular frequency `omega` (rad/s). */
  step(target: number, dt: number, omega: number): number;
  /** Add an instantaneous velocity kick (bumps, the ignition dip). */
  kick(dv: number): void;
  reset(x: number): void;
}

export function createSpring(initial = 0): Spring {
  return {
    x: initial,
    v: 0,
    step(target, dt, omega) {
      if (dt <= 0) return this.x;
      const f = 1 + 2 * dt * omega;
      const oo = omega * omega;
      const hoo = dt * oo;
      const hhoo = dt * hoo;
      const detInv = 1 / (f + hhoo);
      const detX = f * this.x + dt * this.v + hhoo * target;
      const detV = this.v + hoo * (target - this.x);
      this.x = detX * detInv;
      this.v = detV * detInv;
      return this.x;
    },
    kick(dv) {
      this.v += dv;
    },
    reset(x) {
      this.x = x;
      this.v = 0;
    },
  };
}

/** Pure single step, for tests and for callers that keep their own state. */
export function springStep(x: number, v: number, target: number, dt: number, omega: number): [number, number] {
  const s = createSpring(x);
  s.v = v;
  s.step(target, dt, omega);
  return [s.x, s.v];
}
