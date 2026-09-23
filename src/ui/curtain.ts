import { el, type Overlay } from './overlay';

/**
 * A full-bleed black cover for scene transitions.
 *
 * Swapping a vehicle hides one subtree, builds or reveals another and re-frames the camera,
 * and the first frame of a body the session has never drawn stalls on shader compilation.
 * None of that is worth watching. So the screen goes black, the work happens unseen, and it
 * comes back on a vehicle that is already built, already compiled and already drawn once.
 *
 * It sits *below* the corner controls on purpose: the picker stays visible and marked busy,
 * so the black reads as the scene loading rather than as the app having died.
 */
export interface Curtain {
  /** Fade to black. Resolves once the scene is fully covered. */
  cover(ms: number): Promise<void>;
  /** Fade back. Resolves once the scene is fully visible again. */
  reveal(ms: number): Promise<void>;
  readonly isUp: boolean;
  dispose(): void;
}

export function createCurtain(overlay: Overlay): Curtain {
  const node = el('div', 'ui-curtain');
  node.setAttribute('aria-hidden', 'true');
  // First child. The corner controls are later siblings, so they paint over the black and go
  // on receiving clicks while it blocks the canvas underneath.
  overlay.root.prepend(node);
  let up = false;

  const fade = (to: number, ms: number) =>
    new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        node.removeEventListener('transitionend', onEnd);
        resolve();
      };
      // Wait for the transition, not for a timer of the same length. A transition only starts
      // at the next style flush, so on a busy main thread a timer expires while the screen is
      // still a few percent short of black — and those percent are where the swap shows.
      const onEnd = (e: TransitionEvent) => {
        if (e.target === node && e.propertyName === 'opacity') finish();
      };
      node.addEventListener('transitionend', onEnd);
      node.style.transitionDuration = `${ms}ms`;
      // Read a layout property back so that changing the duration and the opacity in one task
      // is not coalesced into a single untransitioned jump.
      void node.offsetWidth;
      node.style.opacity = String(to);
      // Covered means covered: the canvas underneath must not take clicks it cannot show.
      node.style.pointerEvents = to > 0 ? 'auto' : 'none';
      up = to > 0;
      // transitionend never arrives if the opacity did not actually change, or if the tab is
      // hidden. The timer is the floor under that case, not the mechanism.
      setTimeout(finish, ms + 150);
    });

  return {
    cover: (ms) => fade(1, ms),
    reveal: (ms) => fade(0, ms),
    get isUp() {
      return up;
    },
    dispose() {
      node.remove();
    },
  };
}
