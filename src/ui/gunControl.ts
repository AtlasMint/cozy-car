import { engineOn } from '../core/mode';
import type { Store } from '../core/store';
import type { Registry } from '../interaction/interactables';
import type { Hotkeys } from './hotkeys';
import type { Vehicle } from '../scene/car/car';

/**
 * The triggers for a vehicle that has a gun: the space bar, and the barrel itself.
 *
 * The barrel is registered as an *action* rather than a place — it has no `focus`, so clicking
 * it fires and the camera stays where it is, instead of pushing in the way the radio does.
 *
 * Both triggers are no-ops on a vehicle without a gun, which is all of them but one, so this
 * costs nothing when it is not the tank's turn.
 */
export interface GunControl {
  /** Point it at the vehicle that just arrived, releasing whatever the last one had. */
  setVehicle(car: Vehicle): void;
  dispose(): void;
}

export function createGunControl(store: Store, registry: Registry, hotkeys: Hotkeys, report: () => void): GunControl {
  let car: Vehicle | null = null;
  let release: (() => void) | null = null;

  const pull = (): boolean => {
    const gun = car?.body.gun;
    if (!gun) return false;
    // Nothing fires from a parked vehicle.
    if (!engineOn(store.get().mode)) return false;
    const fired = car!.fire();
    if (fired) report();
    return fired;
  };

  // No label: the vehicle this key belongs to is not on the picker either, and a shortcut list
  // that gives away the one thing you have to find out about would be giving it away.
  //
  // The registry already withholds space from a focused button and from anything being typed
  // into, which is the browser's own rule rather than ours. What it cannot know is that three
  // vehicles out of four have nothing to fire, and on those the key was never ours to take.
  const unbind = hotkeys.register({
    key: 'space',
    onDown() {
      // Matches the click path, which stops casting entirely while something is focused: with
      // the camera pushed in on the radio the gun is off screen, and firing what you cannot see
      // is just a noise from nowhere.
      if (store.get().focusedObject) return false;
      if (!car?.body.gun) return false;
      pull();
      return true;
    },
  });

  return {
    setVehicle(next) {
      const previous = car?.body.gun;
      release?.();
      release = null;
      if (previous) delete previous.hitbox.userData.interactableId;
      car = next;
      const gun = next.body.gun;
      if (!gun) return;
      release = registry.register({
        id: 'mainGun',
        hitbox: gun.hitbox,
        label: 'Main gun',
        onSelect: pull,
      });
    },
    dispose() {
      unbind();
      release?.();
    },
  };
}
