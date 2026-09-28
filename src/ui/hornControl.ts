import { AUDIO } from '../core/constants';
import type { Registry } from '../interaction/interactables';
import type { Hotkeys } from './hotkeys';
import type { Vehicle } from '../scene/car/car';

/**
 * The two ways to sound the horn: hold H, or press the middle of the steering wheel.
 *
 * The wheel is registered as an *action* rather than a place — clicking it honks and the camera
 * stays where it is, instead of pushing in the way the radio does.
 *
 * A key is held and a click is an instant, so they are not the same sound: holding H holds the
 * horn for as long as you hold it, and a click is a tap of HORN_MIX.tapS. Beep, or honk.
 *
 * Unlike the gun, every vehicle has one — so this always has something to point at. And it
 * works with the engine off: a horn is on a permanent circuit, which is also the one thing you
 * want a parked car to be able to do.
 */
export interface HornControl {
  /** Point it at the vehicle that just arrived, releasing whatever the last one had. */
  setVehicle(car: Vehicle): void;
  dispose(): void;
}

export function createHornControl(registry: Registry, hotkeys: Hotkeys, sound: (on: boolean) => void): HornControl {
  let car: Vehicle | null = null;
  let release: (() => void) | null = null;
  let tap: ReturnType<typeof setTimeout> | null = null;

  const press = (on: boolean) => sound(on);

  const beep = () => {
    if (tap !== null) clearTimeout(tap);
    press(true);
    tap = setTimeout(() => {
      tap = null;
      press(false);
    }, AUDIO.HORN_MIX.tapS * 1000);
  };

  const unbind = hotkeys.register({
    key: 'h',
    label: 'H',
    hint: 'Horn — hold it',
    onDown: () => press(true),
    onUp: () => press(false),
  });

  return {
    setVehicle(next) {
      const previous = car?.horn;
      release?.();
      release = null;
      if (previous) delete previous.hitbox.userData.interactableId;
      car = next;
      release = registry.register({
        id: 'horn',
        hitbox: next.horn.hitbox,
        label: 'Horn',
        onSelect: beep,
      });
    },
    dispose() {
      if (tap !== null) clearTimeout(tap);
      press(false);
      unbind();
      release?.();
    },
  };
}
