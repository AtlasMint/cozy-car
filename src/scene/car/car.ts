import * as THREE from 'three';
import type { Stage } from '../stage';
import { createChassis, type ChassisRig } from './chassis';
import { createShell, type ShellRig } from './shell';
import { createInterior, type InteriorRig } from './interior';
import { createRadio, type RadioRig } from './radio';
import { createWheels, type WheelsRig } from './wheels';
import { createDressing, type DressingRig } from './dressing';
import { Builder, disposeMaterials } from './parts';
import { createDriverFigure, type DriverFigure } from '../driver/figure';
import { createDriverIdle, type DriverIdle } from '../driver/idle';

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
  dispose(): void;
}

export function createCar(stage: Stage): Car {
  const b = new Builder();
  const chassis = createChassis(b);
  const shell = createShell(b);
  const interior = createInterior(b);
  const radio = createRadio(b);
  const dressing = createDressing(b);
  const built = b.finish('car');
  const wheels = createWheels();
  const driverRoot = new THREE.Group();
  driverRoot.name = 'driverRoot';

  stage.bodyRig.add(built.group, driverRoot);
  stage.wheels.add(wheels.group);
  const driver = createDriverFigure(interior.wheelNode, driverRoot);
  const idle = createDriverIdle(driver);

  return {
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
    dispose() {
      driver.dispose();
      built.dispose();
      radio.dispose();
      wheels.dispose();
      disposeMaterials();
    },
  };
}
