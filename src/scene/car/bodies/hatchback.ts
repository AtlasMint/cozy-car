import type { Builder, CarMaterials } from '../parts';
import type { BodyKit, VehicleSpec } from '../../../core/vehicles';
import { createChassis } from '../chassis';
import { createShell } from '../shell';
import { createInterior } from '../interior';
import { createDressing } from '../dressing';

/**
 * The hatchback body: the original car, assembled from the four modules that used to be
 * called directly by the assembler. Every new vehicle exports one function of this shape.
 */
export function buildHatchback(b: Builder, m: CarMaterials, v: VehicleSpec): BodyKit {
  const chassis = createChassis(b, m, v);
  const shell = createShell(b, m, v);
  const interior = createInterior(b, m, v);
  const dressing = createDressing(b, m, v);
  return {
    panes: shell.panes,
    setLights: shell.setLights,
    wheelNode: interior.wheelNode,
    setTacho: interior.setTacho,
    setSpeedo: interior.setSpeedo,
    setDashGlow: interior.setDashGlow,
    exhaustTip: chassis.exhaustTip,
    swing: dressing.freshener,
  };
}
