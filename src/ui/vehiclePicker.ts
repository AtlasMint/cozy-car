import { isListedVehicle, LISTED_VEHICLES, type ListedVehicleId, type Store, type VehicleId } from '../core/store';
import { VEHICLES, VEHICLE_ORDER } from '../core/vehicles';
import { el, type Overlay } from './overlay';
import { tip } from './tooltip';

/**
 * The three-way vehicle control, mirroring modeToggle: a `ui-seg` group styled purely off
 * `aria-pressed`, bound to V, which cycles.
 *
 * While a swap runs the group is marked `aria-busy` rather than `disabled`: a disabled button
 * loses its focus ring and blurs the user out of the control mid-interaction.
 */
export interface VehiclePicker {
  setBusy(on: boolean): void;
  /** Focus the button for a vehicle — where focus returns after a swap closes a panel. */
  focus(id: VehicleId): void;
  dispose(): void;
}

export function createVehiclePicker(overlay: Overlay, store: Store): VehiclePicker {
  const seg = el('div', 'ui-seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Vehicle');

  // The swap is about a second and mostly visual, so announce it. weatherBadge uses
  // role="status" for the same reason.
  const status = el('span');
  status.setAttribute('role', 'status');
  status.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';

  const buttons = new Map<VehicleId, HTMLButtonElement>();
  const untips: (() => void)[] = [];
  for (const id of VEHICLE_ORDER) {
    const b = el('button', undefined, VEHICLES[id].label);
    b.type = 'button';
    untips.push(tip(b, `${VEHICLES[id].label}. Press V to cycle.`));
    b.addEventListener('click', () => {
      if (seg.getAttribute('aria-busy') === 'true') return;
      store.set({ vehicle: id });
      status.textContent = `Switching to the ${VEHICLES[id].label}`;
    });
    buttons.set(id, b);
    seg.appendChild(b);
  }

  const render = (v: VehicleId) => {
    for (const [id, b] of buttons) b.setAttribute('aria-pressed', String(id === v));
  };
  render(store.get().vehicle);
  const unsub = store.subscribe('vehicle', render);

  seg.appendChild(status);
  overlay.controls.appendChild(seg);

  // Where V comes back to from a vehicle that has no button.
  const booted = store.get().vehicle;
  let lastListed: ListedVehicleId = isListedVehicle(booted) ? booted : LISTED_VEHICLES[0]!;

  // V cycles. Same guards as the mode toggle, plus e.repeat — holding the key would otherwise
  // queue a swap per keydown, and a swap is a scene teardown, not a boolean flip.
  //
  // T does not cycle. It reaches a vehicle the picker does not offer and the hash will not
  // accept, and V brings you back to the one you left rather than to the top of the list.
  const onKey = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if ((key !== 'v' && key !== 't') || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (seg.getAttribute('aria-busy') === 'true') return;
    // Read from the store, not from a cache, so a vehicle picked by clicking a button is
    // remembered exactly as one picked by pressing a key.
    const current = store.get().vehicle;
    if (isListedVehicle(current)) lastListed = current;
    const next = nextVehicle(key, current, lastListed);
    if (!next) return;
    store.set({ vehicle: next });
    status.textContent = `Switching to the ${VEHICLES[next].label}`;
  };
  window.addEventListener('keydown', onKey);

  return {
    setBusy(on) {
      seg.setAttribute('aria-busy', String(on));
      for (const b of buttons.values()) b.setAttribute('aria-disabled', String(on));
      if (!on) status.textContent = '';
    },
    focus(id) {
      buttons.get(id)?.focus({ preventScroll: true });
    },
    dispose() {
      unsub();
      for (const u of untips) u();
      window.removeEventListener('keydown', onKey);
      seg.remove();
    },
  };
}

/**
 * Which vehicle a key press should switch to, or null to do nothing. Pure, because this is the
 * whole rule and it is worth being able to state it in one place and check it.
 *
 * V cycles the listed vehicles. From a vehicle with no button it does not cycle — it returns
 * you to the last listed one you were on, which is what "back to the list" has to mean when the
 * thing you are leaving is not in it. T reaches the unlisted vehicle and is a no-op once there.
 */
export function nextVehicle(key: 'v' | 't', current: VehicleId, lastListed: ListedVehicleId): VehicleId | null {
  if (key === 't') return current === 'tank' ? null : 'tank';
  if (!isListedVehicle(current)) return lastListed;
  return VEHICLE_ORDER[(VEHICLE_ORDER.indexOf(current) + 1) % VEHICLE_ORDER.length]!;
}

/**
 * Boot precedence: #vehicle= beats the stored preference, which beats the hatchback. Pure.
 * Only listed vehicles, so the one that is not listed cannot be linked to.
 */
export function parseVehicleHash(hash: string): ListedVehicleId | null {
  const m = /(^|[#&])vehicle=([a-zA-Z]+)/.exec(hash);
  const v = m?.[2];
  return isListedVehicle(v) ? v : null;
}
