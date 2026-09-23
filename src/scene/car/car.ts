import * as THREE from 'three';
import type { Stage } from '../stage';
import { createRadio, type RadioRig } from './radio';
import { createWheels, type WheelsRig } from './wheels';
import { Builder, createMaterials, type CarMaterials } from './parts';
import { HATCHBACK, type BodyKit, type VehicleSpec } from '../../core/vehicles';
import type { VehicleId } from '../../core/store';
import { createDriverFigure, type DriverFigure } from '../driver/figure';
import { createDriverIdle, type DriverIdle } from '../driver/idle';
import { createExhaust, type ExhaustRig } from './exhaust';
import { createEngineRig, type EngineRig } from '../../motion/engineRig';
import { MOTION } from '../../core/constants';
import type { Mode } from '../../core/store';
import { damp } from '../../util/math';

export interface VehicleInputs {
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
export interface Vehicle {
  id: VehicleId;
  spec: VehicleSpec;
  group: THREE.Group;
  body: BodyKit;
  radio: RadioRig;
  wheels: WheelsRig;
  driverRoot: THREE.Group;
  driver: DriverFigure;
  idle: DriverIdle;
  exhaust: ExhaustRig;
  rig: EngineRig;
  materials: CarMaterials;
  /** Per-frame choreography. Returns the 0..1 ignition light level for the lighting rig. */
  update(inputs: VehicleInputs): number;
  /** Crank: body dip, exhaust cough, needle sweep. Lights ramp on their own from `engine`. */
  ignite(): void;
  /** Low quality hides the body's detail group: free at runtime and reversible. */
  setQuality(q: 'low' | 'high'): void;
  dispose(): void;
}

export function createVehicle(stage: Stage, v: VehicleSpec = HATCHBACK): Vehicle {
  const materials: CarMaterials = createMaterials(v.paint);
  const b = new Builder(materials);
  const body = v.build(b, materials, v);
  const radio = createRadio(b, materials, v);
  const built = b.finish('car');
  const wheels = createWheels(materials, v);
  const driverRoot = new THREE.Group();
  driverRoot.name = 'driverRoot';

  stage.bodyRig.add(built.group, driverRoot);
  stage.wheels.add(wheels.group);
  const driver = createDriverFigure(body.wheelNode, driverRoot, v);
  const idle = createDriverIdle(driver);
  const exhaust = createExhaust(body.exhaustTip, v.motion);
  stage.carRoot.add(exhaust.group);
  const rig = createEngineRig(v.motion);

  // Air freshener: a damped pendulum forced by the body's accelerations.
  const pend = { a: 0, av: 0, b: 0, bv: 0 };
  const g = 9.81 / v.anchors.swingLength;
  let lights = 0;

  const wheelOrder = [0, 1, 2, 3].map((i) => {
    // rig order: frontNear, frontFar, rearNear, rearFar
    const isFront = i < 2;
    const isNear = i % 2 === 0;
    return wheels.wheels.findIndex((w) => w.isFront === isFront && w.isNear === isNear);
  });

  return {
    id: v.id,
    spec: v,
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
      body.swing.rotation.z = pend.a;
      body.swing.rotation.x = pend.b;

      body.setTacho(out.rpm);
      body.setSpeedo(inp.speed * 3.6);

      const rate = inp.engine * (v.motion.exhaust.chillRate + (v.motion.exhaust.focusRate - v.motion.exhaust.chillRate) * inp.blend) * inp.coldBoost;
      exhaust.update(inp.dt, rate, inp.speed);

      lights = damp(lights, inp.engine > 0.02 ? 1 : 0, MOTION.IGNITION_LIGHTS_LAMBDA, inp.dt);
      body.setLights(lights, lights);
      body.setDashGlow(lights);
      radio.setPower(lights);

      idle.update(inp.dt, inp.elapsed, out.y, inp.mode, inp.reducedMotion);
      return lights;
    },
    ignite() {
      rig.ignite();
      exhaust.cough();
    },
    setQuality(q) {
      built.detailGroup.visible = q !== 'low';
    },
    group: built.group,
    body,
    radio,
    wheels,
    driverRoot,
    driver,
    idle,
    exhaust,
    rig,
    materials,
    dispose() {
      // Teardown is the exact inverse of build: detach every node createVehicle attached,
      // then free the GPU resources this vehicle owns. Nothing here is shared with the next
      // vehicle except the driver's own materials, which outlive every body.
      stage.bodyRig.remove(built.group, driverRoot);
      stage.wheels.remove(wheels.group);
      stage.carRoot.remove(exhaust.group);
      exhaust.dispose();
      driver.dispose();
      built.dispose();
      radio.dispose();
      wheels.dispose();
      materials.dispose();
    },
  };
}
