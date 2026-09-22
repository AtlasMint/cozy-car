import { createNoise2D } from 'simplex-noise';
import { MOTION } from '../core/constants';
import { createSpring, type Spring } from './spring';

/**
 * Vibration model. A pure-ish function of time and parameters that produces body y / pitch /
 * roll and per-wheel spring offsets. Four bands layered like an equaliser:
 *   engine idle (two sines), body sway (noise), road noise (noise, Focus only) and bumps
 *   (Poisson impulses into the wheel springs, front first, rear ~120 ms later).
 * Nothing here touches the scene graph; the caller writes the outputs to bodyRig and wheels.
 */
export interface RigInput {
  dt: number;
  elapsed: number;
  /** 0 = Chill amplitudes, 1 = Focus amplitudes (already smoothed by the caller). */
  blend: number;
  /** 0 = engine off (still), 1 = running (smoothed). */
  engine: number;
  /** Current road speed in m/s. */
  speed: number;
  /** Global amplitude multiplier (reduced motion, focused object). */
  ampScale: number;
  bumpsEnabled: boolean;
}

export interface RigOutput {
  y: number;
  pitch: number;
  roll: number;
  /** Order: frontNear, frontFar, rearNear, rearFar. */
  wheels: [number, number, number, number];
  rpm: number;
  /** Body accelerations for secondary motion (the air freshener). */
  pitchAccel: number;
  yAccel: number;
}

export interface EngineRig {
  update(input: RigInput): RigOutput;
  /** The ignition dip: kick the body spring and schedule the needle sweep. */
  ignite(): void;
  /** Force a bump now (debugging / tests). */
  bump(): void;
  readonly output: RigOutput;
}

export function createEngineRig(random: () => number = Math.random): EngineRig {
  const noise = createNoise2D(random);
  const body = createSpring(0);
  const wheelSprings: Spring[] = [createSpring(0), createSpring(0), createSpring(0), createSpring(0)];
  const pendingRear: number[] = []; // times at which rear wheels take their impulse
  let sweep = -1; // seconds since ignition sweep began, or -1
  let lastPitchVel = 0;
  let lastYVel = 0;
  let lastY = 0;
  let lastPitch = 0;
  const out: RigOutput = { y: 0, pitch: 0, roll: 0, wheels: [0, 0, 0, 0], rpm: 0, pitchAccel: 0, yAccel: 0 };

  const kickFront = () => {
    wheelSprings[0]!.kick(MOTION.BUMP.impulse * MOTION.BUMP.omega);
    wheelSprings[1]!.kick(MOTION.BUMP.impulse * MOTION.BUMP.omega * (0.7 + 0.6 * random()));
  };
  const kickRear = () => {
    wheelSprings[2]!.kick(MOTION.BUMP.impulse * MOTION.BUMP.omega);
    wheelSprings[3]!.kick(MOTION.BUMP.impulse * MOTION.BUMP.omega * (0.7 + 0.6 * random()));
  };

  return {
    output: out,
    ignite() {
      body.kick(MOTION.IGNITION_KICK);
      sweep = 0;
    },
    bump() {
      kickFront();
      pendingRear.push(MOTION.BUMP.rearDelay);
    },
    update(input) {
      const { dt, elapsed: t, blend, engine, speed, ampScale } = input;
      const amp = ampScale * engine;
      const mix = (chill: number, focus: number) => chill + (focus - chill) * blend;

      // Engine idle: fundamental plus second harmonic at half amplitude.
      const w = Math.PI * 2 * MOTION.IDLE_HZ * t;
      const idleWave = Math.sin(w) + 0.5 * Math.sin(2 * w + 0.7);
      const idleY = mix(MOTION.IDLE.chill.y, MOTION.IDLE.focus.y) * idleWave;
      const idleRoll = mix(MOTION.IDLE.chill.roll, MOTION.IDLE.focus.roll) * (Math.sin(w + 1.3) + 0.5 * Math.sin(2 * w));

      // Body sway: slow noise.
      const swayY = mix(MOTION.SWAY.chill.y, MOTION.SWAY.focus.y) * noise(t * MOTION.SWAY.hz, 3.1);
      const swayPitch = mix(MOTION.SWAY.chill.pitch, MOTION.SWAY.focus.pitch) * noise(t * MOTION.SWAY.hz * 0.8, 17.3);

      // Road noise: only with speed under the wheels.
      const roadK = Math.min(1, speed / MOTION.ROAD.fullAt) * blend;
      const roadY = MOTION.ROAD.y * roadK * noise(t * MOTION.ROAD.hz, 41.7);
      const roadRoll = MOTION.ROAD.roll * roadK * noise(t * MOTION.ROAD.hz * 1.15, 59.2);

      // Bumps: Poisson process while moving.
      if (input.bumpsEnabled && roadK > 0.3 && random() < MOTION.BUMP.rate * dt * roadK) {
        kickFront();
        pendingRear.push(MOTION.BUMP.rearDelay);
      }
      for (let i = pendingRear.length - 1; i >= 0; i--) {
        pendingRear[i]! -= dt;
        if (pendingRear[i]! <= 0) {
          pendingRear.splice(i, 1);
          kickRear();
        }
      }
      for (let i = 0; i < 4; i++) {
        out.wheels[i] = wheelSprings[i]!.step(0, dt, MOTION.BUMP.omega) * ampScale;
      }
      const frontAvg = (out.wheels[0] + out.wheels[1]) / 2;
      const rearAvg = (out.wheels[2] + out.wheels[3]) / 2;

      // Body spring carries the ignition dip and settles the sum of bands.
      const bodyRest = amp * (idleY + swayY + roadY) + MOTION.WHEEL_TO_BODY * (frontAvg + rearAvg) * 0.5;
      const bodyY = body.step(0, dt, MOTION.BODY_SPRING_OMEGA) * ampScale + bodyRest;
      const pitch = amp * swayPitch + (frontAvg - rearAvg) * MOTION.WHEEL_TO_PITCH;
      const roll = amp * (idleRoll + roadRoll);

      out.y = bodyY;
      out.pitch = pitch;
      out.roll = roll;

      // Accelerations by finite difference, for secondary motion.
      if (dt > 0) {
        const yVel = (bodyY - lastY) / dt;
        const pitchVel = (pitch - lastPitch) / dt;
        out.yAccel = (yVel - lastYVel) / dt;
        out.pitchAccel = (pitchVel - lastPitchVel) / dt;
        lastYVel = yVel;
        lastPitchVel = pitchVel;
      }
      lastY = bodyY;
      lastPitch = pitch;

      // Tachometer: ignition sweep, then idle jitter blending toward a cruising wander.
      const idleRpm = MOTION.RPM.idle + MOTION.RPM.idleJitter * noise(t * 3.7, 77.7);
      const cruiseRpm = MOTION.RPM.cruise + MOTION.RPM.wander * noise(t * 0.35, 91.1);
      let rpm = mix(idleRpm, cruiseRpm) * engine;
      if (sweep >= 0) {
        sweep += dt;
        const k = sweep / (MOTION.RPM.sweepMs / 1000);
        if (k >= 1) sweep = -1;
        else {
          // up fast, back slower, settle onto idle
          const up = Math.min(1, k * 2.6);
          const down = Math.max(0, (k - 0.38) / 0.62);
          const peak = MOTION.RPM.sweepPeak;
          rpm = down > 0 ? peak + (idleRpm - peak) * easeOut(down) : peak * easeOut(up);
        }
      }
      out.rpm = Math.max(0, rpm);
      return out;
    },
  };
}

function easeOut(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}
