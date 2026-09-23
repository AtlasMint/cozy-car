import * as THREE from 'three';
import type { Stage } from '../stage';
import { createChassis, type ChassisRig } from './chassis';
import { createShell, type ShellRig } from './shell';
import { createInterior, type InteriorRig } from './interior';
import { createRadio, type RadioRig } from './radio';
import { createWheels, type WheelsRig } from './wheels';
import { createDressing, type DressingRig } from './dressing';
import { Builder, createMaterials, type CarMaterials, type PaintSpec } from './parts';
import { createDriverFigure, type DriverFigure } from '../driver/figure';
import { createDriverIdle, type DriverIdle } from '../driver/idle';
import { createExhaust, type ExhaustRig } from './exhaust';
import { createEngineRig, type EngineRig } from '../../motion/engineRig';
import { MOTION, PALETTE } from '../../core/constants';
import type { Mode } from '../../core/store';
import { damp } from '../../util/math';

export interface CarInputs {
  dt: number;
  elapsed: number;
  /** 0 = Chill, 1 = Focus (smoothed). */
  blend: number;
  /** 0 = engine off, 1 = running (smoothed). */
  engine: number;
  speed: number;
  speedAccel: number;
  ampScale: number;
  bumpsEnabled: boolean;
  mode: Mode;
  reducedMotion: boolean;
  /** Multiplier on exhaust density (cold weather). */
  coldBoost: number;
}

/**
 * Assembles the cutaway car onto the stage's bodyRig / wheels nodes. All static parts from
 * every module go through one Builder so the car is one merged mesh per material.
 */
export interface Car {
  group: THREE.Group;
  chassis: ChassisRig;
  shell: ShellRig;
  interior: InteriorRig;
  radio: RadioRig;
  wheels: WheelsRig;
  dressing: DressingRig;
  driverRoot: THREE.Group;
  driver: DriverFigure;
  idle: DriverIdle;
  exhaust: ExhaustRig;
  rig: EngineRig;
  materials: CarMaterials;
  /** Per-frame choreography. Returns the 0..1 ignition light level for the lighting rig. */
  update(inputs: CarInputs): number;
  /** Crank: body dip, exhaust cough, needle sweep. Lights ramp on their own from `engine`. */
  ignite(): void;
  dispose(): void;
}

/** Today's hatchback colours. Phase 2 moves this onto the vehicle spec. */
const HATCHBACK_PAINT: PaintSpec = {
  body: PALETTE.BODY,
  trim: PALETTE.BODY_TRIM,
  hub: PALETTE.HUB,
  vinyl: PALETTE.VINYL,
  fabric: PALETTE.FABRIC,
  fabricDark: '#4E4138',
};

export function createCar(stage: Stage, paint: PaintSpec = HATCHBACK_PAINT): Car {
  const materials: CarMaterials = createMaterials(paint);
  const b = new Builder(materials);
  const chassis = createChassis(b, materials);
  const shell = createShell(b, materials);
  const interior = createInterior(b, materials);
  const radio = createRadio(b, materials);
  const dressing = createDressing(b, materials);
  const built = b.finish('car');
  const wheels = createWheels(materials);
  const driverRoot = new THREE.Group();
  driverRoot.name = 'driverRoot';

  stage.bodyRig.add(built.group, driverRoot);
  stage.wheels.add(wheels.group);
  const driver = createDriverFigure(interior.wheelNode, driverRoot);
  const idle = createDriverIdle(driver);
  const exhaust = createExhaust(chassis.exhaustTip);
  stage.carRoot.add(exhaust.group);
  const rig = createEngineRig();

  // Air freshener: a damped pendulum forced by the body's accelerations.
  const pend = { a: 0, av: 0, b: 0, bv: 0 };
  const g = 9.81 / MOTION.FRESHENER.length;
  let lights = 0;

  const wheelOrder = [0, 1, 2, 3].map((i) => {
    // rig order: frontNear, frontFar, rearNear, rearFar
    const isFront = i < 2;
    const isNear = i % 2 === 0;
    return wheels.wheels.findIndex((w) => w.isFront === isFront && w.isNear === isNear);
  });

  return {
    update(inp) {
      const out = rig.update({
        dt: inp.dt,
        elapsed: inp.elapsed,
        blend: inp.blend,
        engine: inp.engine,
        speed: inp.speed,
        ampScale: inp.ampScale,
        bumpsEnabled: inp.bumpsEnabled,
      });
      stage.bodyRig.position.y = out.y;
      stage.bodyRig.rotation.z = out.pitch;
      stage.bodyRig.rotation.x = out.roll;
      for (let i = 0; i < 4; i++) wheels.wheels[wheelOrder[i]!]!.springOffset = out.wheels[i]!;
      wheels.roll(inp.speed * inp.dt);
      wheels.apply();

      // Pendulum (a: fore/aft swing about Z, b: lateral about X).
      const F = MOTION.FRESHENER;
      const dt = Math.min(inp.dt, 0.033);
      const forceA = out.pitchAccel * F.pitchGain + out.yAccel * F.yGain * 0.3 + inp.speedAccel * F.accelGain;
      pend.av += (-g * pend.a - F.damping * pend.av + forceA) * dt;
      pend.a += pend.av * dt;
      const forceB = out.yAccel * F.yGain * 0.15;
      pend.bv += (-g * pend.b - F.damping * pend.bv + forceB) * dt;
      pend.b += pend.bv * dt;
      dressing.freshener.rotation.z = pend.a;
      dressing.freshener.rotation.x = pend.b;

      interior.setTacho(out.rpm);
      interior.setSpeedo(inp.speed * 3.6);

      const rate = inp.engine * (MOTION.EXHAUST.chillRate + (MOTION.EXHAUST.focusRate - MOTION.EXHAUST.chillRate) * inp.blend) * inp.coldBoost;
      exhaust.update(inp.dt, rate, inp.speed);

      lights = damp(lights, inp.engine > 0.02 ? 1 : 0, MOTION.IGNITION_LIGHTS_LAMBDA, inp.dt);
      shell.setLights(lights, lights);
      interior.setDashGlow(lights);
      radio.setPower(lights);

      idle.update(inp.dt, inp.elapsed, out.y, inp.mode, inp.reducedMotion);
      return lights;
    },
    ignite() {
      rig.ignite();
      exhaust.cough();
    },
    group: built.group,
    chassis,
    shell,
    interior,
    radio,
    wheels,
    dressing,
    driverRoot,
    driver,
    idle,
    exhaust,
    rig,
    materials,
    dispose() {
      exhaust.dispose();
      driver.dispose();
      built.dispose();
      radio.dispose();
      wheels.dispose();
      materials.dispose();
    },
  };
}
