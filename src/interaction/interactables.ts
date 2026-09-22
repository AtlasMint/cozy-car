import * as THREE from 'three';

/**
 * Registry of things you can click inside the cutaway. V1 registers exactly one: the radio.
 * The registry pattern is the extension seam; there are no "coming soon" stubs.
 */
export interface Interactable {
  id: string;
  /** Invisible oversized proxy, not the detail mesh. */
  hitbox: THREE.Object3D;
  /** Hover label, e.g. "Radio". */
  label: string;
  focus: {
    /** World point to centre. */
    target: THREE.Vector3;
    /** Orthographic zoom multiplier, e.g. 3.2. */
    zoom: number;
    /** Small swing for a better read, radians. */
    azimuthOffset?: number;
  };
  onFocus(): void;
  onBlur(): void;
}

export interface Registry {
  register(item: Interactable): () => void;
  get(id: string): Interactable | undefined;
  all(): readonly Interactable[];
  /** Layer every hitbox lives on; glass and structure are excluded from raycasts by layer. */
  readonly layer: number;
}

export const INTERACT_LAYER = 3;

export function createRegistry(): Registry {
  const items = new Map<string, Interactable>();
  return {
    layer: INTERACT_LAYER,
    register(item) {
      items.set(item.id, item);
      item.hitbox.layers.set(INTERACT_LAYER);
      item.hitbox.userData.interactableId = item.id;
      return () => items.delete(item.id);
    },
    get: (id) => items.get(id),
    all: () => [...items.values()],
  };
}
