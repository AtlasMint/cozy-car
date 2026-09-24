import * as THREE from 'three';
import type { Store } from '../core/store';
import type { IsoCamera } from '../core/isoCamera';
import { INTERACT_LAYER, type Registry } from './interactables';
import { INTERACTION } from '../core/constants';

/**
 * Hover and click over the Interactable registry. Raycasts on pointermove, throttled, against
 * hitboxes only — via THREE.Layers, so glass and structure never intercept the ray. Hover
 * shows a small DOM label near the cursor and the pointer cursor; click sets focusedObject.
 */
export interface Raycast {
  /** Currently hovered id, or null. */
  readonly hovered: string | null;
  /** Screen position of the last pointer, CSS px. */
  readonly pointer: { x: number; y: number };
  update(): void;
  /** Drop the hover latch. A swap performed while the pointer rests on the radio would
   *  otherwise leave the new radio's glow dead, because `hovered` never changed. */
  clearHover(): void;
  dispose(): void;
}

export function createRaycast(
  canvas: HTMLCanvasElement,
  iso: IsoCamera,
  registry: Registry,
  store: Store,
  labelHost: HTMLElement,
  onHover: (id: string | null) => void,
): Raycast {
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(INTERACT_LAYER);
  const ndc = new THREE.Vector2();
  const pointer = { x: -1, y: -1 };
  let dirty = false;
  let lastCast = 0;
  let hovered: string | null = null;
  let pointerDownAt: { x: number; y: number; t: number } | null = null;

  const label = document.createElement('div');
  label.className = 'label';
  label.hidden = true;
  labelHost.appendChild(label);

  const setHover = (id: string | null) => {
    if (id === hovered) return;
    hovered = id;
    canvas.style.cursor = id ? 'pointer' : '';
    label.hidden = !id;
    if (id) label.textContent = registry.get(id)?.label ?? '';
    onHover(id);
  };

  const cast = () => {
    if (store.get().focusedObject) {
      setHover(null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    ndc.set(((pointer.x - rect.left) / rect.width) * 2 - 1, -((pointer.y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, iso.camera);
    const hits = raycaster.intersectObjects(
      registry.all().map((i) => i.hitbox),
      false,
    );
    const hit = hits[0]?.object.userData.interactableId as string | undefined;
    setHover(hit ?? null);
    if (hit) {
      label.style.left = `${pointer.x - rect.left}px`;
      label.style.top = `${pointer.y - rect.top}px`;
    }
  };

  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    dirty = true;
  };
  const onDown = (e: PointerEvent) => {
    pointerDownAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: PointerEvent) => {
    if (!pointerDownAt) return;
    const moved = Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y);
    const quick = performance.now() - pointerDownAt.t < 600;
    pointerDownAt = null;
    if (!quick || moved > INTERACTION.CLICK_SLOP_PX) return;
    if (store.get().focusedObject) return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    cast();
    if (!hovered) return;
    const item = registry.get(hovered);
    // A place is somewhere to go; an action is something to do, and the camera stays put.
    if (item?.focus) store.set({ focusedObject: hovered });
    else item?.onSelect?.();
  };
  const onLeave = () => setHover(null);

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointerleave', onLeave);

  return {
    get hovered() {
      return hovered;
    },
    pointer,
    clearHover() {
      setHover(null);
    },
    update() {
      const now = performance.now();
      if (!dirty || now - lastCast < 1000 / INTERACTION.HOVER_HZ) return;
      dirty = false;
      lastCast = now;
      cast();
    },
    dispose() {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      label.remove();
      canvas.style.cursor = '';
    },
  };
}
