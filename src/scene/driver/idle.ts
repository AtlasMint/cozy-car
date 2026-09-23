import * as THREE from 'three';
import type { Mode } from '../../core/store';
import { DRIVER } from '../../core/constants';
import { createSpring } from '../../motion/spring';
import { damp, lerp, randRange } from '../../util/math';
import type { DriverFigure } from './figure';

/**
 * Layered idle: breathing, a head that lags and undershoots the car's bounce, occasional
 * micro-gestures legible from behind, and a posture that straightens in Focus. Gestures never
 * overlap; they are queued. All amplitudes scale with the reduced-motion flag.
 */
export interface DriverIdle {
  update(dt: number, elapsed: number, bodyY: number, mode: Mode, reducedMotion: boolean): void;
  /** Force a named gesture now (debugging). */
  trigger(name: string): void;
}

interface Pose {
  headYaw: number;
  headPitch: number;
  headRoll: number;
  torsoRoll: number;
  torsoLean: number;
  shoulderLift: number;
  /** null → hand stays on its wheel grip. */
  handL: THREE.Vector3 | null;
  handR: THREE.Vector3 | null;
}

type GestureFn = (k: number, pose: Pose, out: { cupLift: number }) => void;

interface Gesture {
  name: string;
  weight: number;
  duration: number;
  apply: GestureFn;
  focusOnly?: boolean;
  chillOnly?: boolean;
}

const pulse = (k: number, a: number, b: number) => {
  // 0→1 over [a, b] with smooth ease, 1 in the middle, back to 0 by 1.
  if (k < a) return smooth(k / a);
  if (k > b) return smooth((1 - k) / (1 - b));
  return 1;
};
const smooth = (t: number) => {
  t = Math.min(1, Math.max(0, t));
  return t * t * (3 - 2 * t);
};

export function createDriverIdle(figure: DriverFigure): DriverIdle {
  const P = figure.pose;
  const cup = new THREE.Vector3(...P.cup);
  const mouth = new THREE.Vector3();
  const gearKnob = new THREE.Vector3(...(P.gearKnob ?? [0, 0, 0]));
  const neckBack = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const gestures: Gesture[] = [
    {
      name: 'headTurnWindow',
      weight: 3,
      duration: 4.5,
      apply(k, pose) {
        pose.headYaw += P.headTurnYaw * pulse(k, 0.25, 0.7);
        pose.headPitch += 0.06 * pulse(k, 0.25, 0.7);
      },
    },
    {
      name: 'shoulderRoll',
      weight: 2,
      duration: 2.6,
      apply(k, pose) {
        pose.shoulderLift += 0.03 * Math.sin(k * Math.PI);
        pose.torsoRoll += 0.06 * Math.sin(k * Math.PI * 2);
      },
    },
    {
      name: 'sip',
      weight: 2,
      duration: 5.5,
      chillOnly: true,
      apply(k, pose) {
        // reach → lift to mouth → hold → back to holder → return to wheel
        const reach = pulse(k, 0.22, 0.82);
        figure.head.getWorldPosition(mouth);
        mouth.x += 0.13;
        mouth.y -= 0.03;
        mouth.z -= 0.02;
        const lift = pulse(k, 0.42, 0.62);
        tmp.lerpVectors(cup, mouth, lift);
        pose.handL = tmp.clone();
        pose.headPitch += 0.12 * lift;
        void reach;
      },
    },
    {
      name: 'handToGear',
      weight: 2,
      duration: 9,
      chillOnly: true,
      apply(k, pose) {
        const on = pulse(k, 0.12, 0.9);
        tmp.copy(gearKnob);
        tmp.y += 0.03;
        pose.handL = tmp.clone();
        void on;
      },
    },
    {
      name: 'neckScratch',
      weight: 1.5,
      duration: 3.2,
      apply(k, pose) {
        figure.neck.getWorldPosition(neckBack);
        neckBack.x -= 0.1;
        neckBack.y += 0.06;
        neckBack.z -= 0.02;
        const wiggle = 0.015 * Math.sin(k * Math.PI * 9) * pulse(k, 0.35, 0.65);
        neckBack.y += wiggle;
        pose.handL = neckBack.clone();
        pose.headPitch += 0.1 * pulse(k, 0.3, 0.7);
      },
    },
    {
      name: 'nod',
      weight: 2,
      duration: 1.4,
      apply(k, pose) {
        pose.headPitch += 0.12 * Math.max(0, Math.sin(k * Math.PI * 2)) * pulse(k, 0.1, 0.9);
      },
    },
  ];

  let current: Gesture | null = null;
  let gestureT = 0;
  let nextGestureIn = randRange(DRIVER.GESTURE_GAP_MIN * 0.4, DRIVER.GESTURE_GAP_MIN);

  const pickGesture = (mode: Mode): Gesture => {
    const pool = gestures.filter(
      (g) => !(g.chillOnly && mode === 'focus') && !(g.focusOnly && mode === 'chill') && !(g.name === 'handToGear' && !P.gearKnob),
    );
    const total = pool.reduce((s, g) => s + g.weight, 0);
    let r = Math.random() * total;
    for (const g of pool) {
      r -= g.weight;
      if (r <= 0) return g;
    }
    return pool[pool.length - 1]!;
  };

  // Smoothed pose state.
  const s = { headYaw: 0, headPitch: 0, headRoll: 0, torsoRoll: 0, torsoLean: 0, shoulderLift: 0 };
  const handL = new THREE.Vector3();
  const handR = new THREE.Vector3();
  let handsInit = false;
  const posture = createSpring(0); // 0 = chill slump, 1 = focus upright

  // Ring buffer for the head's delayed counter-bob.
  const HISTORY = 32;
  const yHist = new Float32Array(HISTORY);
  const tHist = new Float32Array(HISTORY);
  let histIdx = 0;
  const sampleDelayed = (now: number, delay: number): number => {
    const want = now - delay;
    let best = yHist[histIdx]!;
    for (let i = 0; i < HISTORY; i++) {
      const j = (histIdx - i + HISTORY) % HISTORY;
      if (tHist[j]! <= want) {
        best = yHist[j]!;
        break;
      }
    }
    return best;
  };

  const baseTorsoLean = figure.torso.rotation.z;
  const baseHeadY = figure.head.position.y;

  return {
    trigger(name) {
      const g = gestures.find((x) => x.name === name);
      if (!g) return;
      current = g;
      gestureT = 0;
    },
    update(dt, elapsed, bodyY, mode, reducedMotion) {
      const amp = reducedMotion ? DRIVER.REDUCED_MOTION_SCALE : 1;

      // Record the body's vertical motion for the delayed head.
      histIdx = (histIdx + 1) % HISTORY;
      yHist[histIdx] = bodyY;
      tHist[histIdx] = elapsed;

      // Gesture scheduling.
      const pose: Pose = { headYaw: 0, headPitch: 0, headRoll: 0, torsoRoll: 0, torsoLean: 0, shoulderLift: 0, handL: null, handR: null };
      if (current) {
        gestureT += dt;
        const k = Math.min(1, gestureT / current.duration);
        current.apply(k, pose, { cupLift: 0 });
        if (k >= 1) {
          current = null;
          nextGestureIn = randRange(DRIVER.GESTURE_GAP_MIN, DRIVER.GESTURE_GAP_MAX);
        }
      } else {
        nextGestureIn -= dt;
        if (nextGestureIn <= 0 && !reducedMotion) {
          current = pickGesture(mode);
          gestureT = 0;
        }
      }

      // Posture: chill slumps back and drifts toward the window; focus sits up and faces forward.
      const p = posture.step(mode === 'focus' ? 1 : 0, dt, DRIVER.POSTURE_OMEGA);
      const slump = (1 - p) * DRIVER.CHILL_SLUMP * P.slumpScale;
      const chillDrift = (1 - p) * -0.12 * (0.5 + 0.5 * Math.sin(elapsed * 0.11));
      pose.torsoLean += slump;
      pose.headYaw += chillDrift;

      // Smooth everything so gestures never snap.
      const L = 6;
      s.headYaw = damp(s.headYaw, pose.headYaw, L, dt);
      s.headPitch = damp(s.headPitch, pose.headPitch, L, dt);
      s.headRoll = damp(s.headRoll, pose.headRoll, L, dt);
      s.torsoRoll = damp(s.torsoRoll, pose.torsoRoll, L, dt);
      s.torsoLean = damp(s.torsoLean, pose.torsoLean, L, dt);
      s.shoulderLift = damp(s.shoulderLift, pose.shoulderLift, L, dt);

      // Breathing: always on.
      const breath = Math.sin(elapsed * Math.PI * 2 * DRIVER.BREATH_HZ);
      figure.torso.scale.y = 1 + DRIVER.BREATH_SCALE * breath * Math.max(amp, 0.6);
      figure.torso.position.x = 0.004 * breath;
      figure.torso.rotation.z = baseTorsoLean + s.torsoLean;
      figure.torso.rotation.x = s.torsoRoll * amp;
      figure.torso.position.y = s.shoulderLift * amp;

      // Head: counter-bob against the car, plus gesture/posture rotations. The figure inherits
      // the body's motion, so a lagging, undershooting head means a negative local offset.
      const delayed = sampleDelayed(elapsed, DRIVER.HEAD_LAG);
      const counter = (DRIVER.HEAD_UNDERSHOOT * delayed - bodyY) * amp;
      figure.head.position.y = baseHeadY + counter;
      figure.head.rotation.y = s.headYaw * amp;
      figure.head.rotation.z = -s.headPitch * amp;
      figure.head.rotation.x = s.headRoll * amp;

      // Hands: default to the wheel grips; gestures override the left hand.
      figure.gripTargets[0].getWorldPosition(tmp);
      if (!handsInit) {
        handL.copy(tmp);
        figure.gripTargets[1].getWorldPosition(handR);
        handsInit = true;
      }
      const wantL = pose.handL ?? tmp;
      handL.x = damp(handL.x, wantL.x, 5, dt);
      handL.y = damp(handL.y, wantL.y, 5, dt);
      handL.z = damp(handL.z, wantL.z, 5, dt);
      figure.gripTargets[1].getWorldPosition(tmp);
      const wantR = pose.handR ?? tmp;
      handR.x = damp(handR.x, wantR.x, 5, dt);
      handR.y = damp(handR.y, wantR.y, 5, dt);
      handR.z = damp(handR.z, wantR.z, 5, dt);
      figure.handTargets[0].copy(handL);
      figure.handTargets[1].copy(handR);
      figure.update();
      void lerp;
    },
  };
}
