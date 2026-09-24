import type { Store } from '../core/store';
import type { Registry } from '../interaction/interactables';
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

/** Controls that do something with space themselves. It belongs to them while they have focus. */
const TAKES_SPACE = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'];

export function createGunControl(store: Store, registry: Registry, report: () => void): GunControl {
  let car: Vehicle | null = null;
  let release: (() => void) | null = null;

  const pull = (): boolean => {
    const gun = car?.body.gun;
    if (!gun) return false;
    // Nothing fires before the engine does — the start screen is still up until then.
    if (!store.get().engineOn) return false;
    const fired = car!.fire();
    if (fired) report();
    return fired;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    // Space activates whatever control has focus; that is the browser's rule, not ours, and
    // taking it away would break every button on the overlay for keyboard users.
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.isContentEditable || TAKES_SPACE.includes(active.tagName))) return;
    // Matches the click path, which stops casting entirely while something is focused: with the
    // camera pushed in on the radio the gun is off screen, and firing what you cannot see is
    // just a noise from nowhere.
    if (store.get().focusedObject) return;
    if (!car?.body.gun) return;
    // Only once we know we are handling it: otherwise this would eat the page's own space.
    e.preventDefault();
    pull();
  };
  window.addEventListener('keydown', onKey);

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
      window.removeEventListener('keydown', onKey);
      release?.();
    },
  };
}
