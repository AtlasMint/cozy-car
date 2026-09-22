import * as THREE from 'three';
import type { Stage } from '../stage';
import { createChassis, type ChassisRig } from './chassis';
import { createShell, type ShellRig } from './shell';
import { createInterior, type InteriorRig } from './interior';
import { createRadio, type RadioRig } from './radio';
import { createWheels, type WheelsRig } from './wheels';
import { createDressing, type DressingRig } from './dressing';
import { disposeMaterials } from './parts';

/** Assembles the cutaway car onto the stage's bodyRig / wheels nodes. */
export interface Car {
  chassis: ChassisRig;
  shell: ShellRig;
  interior: InteriorRig;
  radio: RadioRig;
  wheels: WheelsRig;
  dressing: DressingRig;
  driverRoot: THREE.Group;
  dispose(): void;
}

export function createCar(stage: Stage): Car {
  const chassis = createChassis();
  const shell = createShell();
  const interior = createInterior();
  const radio = createRadio();
  const wheels = createWheels();
  const dressing = createDressing();
  const driverRoot = new THREE.Group();
  driverRoot.name = 'driverRoot';

  stage.bodyRig.add(chassis.group, shell.group, interior.group, radio.group, dressing.group, driverRoot);
  stage.wheels.add(wheels.group);

  return {
    chassis,
    shell,
    interior,
    radio,
    wheels,
    dressing,
    driverRoot,
    dispose() {
      chassis.dispose();
      shell.dispose();
      interior.dispose();
      radio.dispose();
      wheels.dispose();
      dressing.dispose();
      disposeMaterials();
    },
  };
}
