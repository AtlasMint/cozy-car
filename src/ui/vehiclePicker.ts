import type { Store, VehicleId } from '../core/store';
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

  // V cycles. Same guards as the mode toggle, plus e.repeat — holding the key would otherwise
  // queue a swap per keydown, and a swap is a scene teardown, not a boolean flip.
  const onKey = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() !== 'v' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (seg.getAttribute('aria-busy') === 'true') return;
    const i = VEHICLE_ORDER.indexOf(store.get().vehicle);
    const next = VEHICLE_ORDER[(i + 1) % VEHICLE_ORDER.length]!;
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

/** Boot precedence: #vehicle= beats the stored preference, which beats the hatchback. Pure. */
export function parseVehicleHash(hash: string): VehicleId | null {
  const m = /(^|[#&])vehicle=([a-zA-Z]+)/.exec(hash);
  const v = m?.[2];
  return v === 'hatchback' || v === 'van' || v === 'sports' ? v : null;
}
