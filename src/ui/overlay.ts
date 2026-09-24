import type { Store } from '../core/store';

/**
 * DOM overlay: injects the UI stylesheet once and provides edge-anchored containers.
 * Bottom-left holds the weather badge; bottom-right the mode toggle and volume. Nothing
 * floats over the car. One type family; no all-caps labels; single opacity transition at
 * ignition and nothing else animates on its own.
 */
export interface Overlay {
  root: HTMLElement;
  badge: HTMLElement;
  controls: HTMLElement;
  centre: HTMLElement;
  /** Anchored panels (the Spotify panel) live here so they sit above the corners. */
  panels: HTMLElement;
}

const CSS = /* css */ `
:root {
  --ui-ink: #f2e3c9;
  --ui-ink-dim: rgba(242, 227, 201, 0.72);
  --ui-bg: rgba(22, 18, 16, 0.74);
  --ui-bg-strong: rgba(22, 18, 16, 0.9);
  --ui-line: rgba(242, 227, 201, 0.28);
  --ui-accent: #e8d7b9;
  --ui-focus: #ffd9a0;
  --ui-radius: 14px;
  --ui-font: 'Inter Tight', system-ui, -apple-system, 'Segoe UI', sans-serif;
}
#overlay { font-family: var(--ui-font); color: var(--ui-ink); font-size: 15px; line-height: 1.35; -webkit-font-smoothing: antialiased; }
#overlay * { box-sizing: border-box; }
#overlay .ui-corner { position: absolute; bottom: max(16px, env(safe-area-inset-bottom)); display: flex; gap: 10px; align-items: flex-end; pointer-events: none; }
#overlay .ui-corner > * { pointer-events: auto; }
#overlay .ui-corner.left { left: max(16px, env(safe-area-inset-left)); }
#overlay .ui-corner.right { right: max(16px, env(safe-area-inset-right)); flex-direction: row-reverse; }
#overlay .ui-centre { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; }
#overlay .ui-panels { position: absolute; inset: 0; pointer-events: none; }
#overlay .ui-panels > * { pointer-events: auto; }
/* Scene transitions. Duration is written from JS; the element is the first child of #overlay
   so every corner control paints over it. */
#overlay .ui-curtain { position: absolute; inset: 0; background: #000; opacity: 0; pointer-events: none; transition: opacity 260ms ease; }

#overlay button, #overlay input, #overlay select { font: inherit; color: inherit; }
#overlay button { cursor: pointer; border: 1px solid var(--ui-line); background: var(--ui-bg); color: var(--ui-ink); border-radius: 999px; padding: 9px 16px; font-weight: 500; letter-spacing: 0.005em; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); transition: background-color 160ms ease, border-color 160ms ease; }
#overlay button:hover { background: var(--ui-bg-strong); border-color: var(--ui-accent); }
#overlay :is(button, input, a, select, [tabindex]):focus-visible { outline: 2px solid var(--ui-focus); outline-offset: 3px; }
#overlay button[aria-pressed="true"] { background: var(--ui-accent); color: #22201f; border-color: var(--ui-accent); }

#overlay .ui-card { background: var(--ui-bg); border: 1px solid var(--ui-line); border-radius: var(--ui-radius); padding: 10px 14px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
#overlay .ui-check { display: inline-flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 999px; background: var(--ui-bg); border: 1px solid var(--ui-line); cursor: pointer; font-weight: 500; user-select: none; }
#overlay .ui-check input { accent-color: var(--ui-accent); width: 15px; height: 15px; margin: 0; }
#overlay .ui-range { display: inline-flex; align-items: center; gap: 6px; padding: 4px 14px 4px 4px; border-radius: 999px; background: var(--ui-bg); border: 1px solid var(--ui-line); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
#overlay .ui-range input[type=range] { width: 96px; accent-color: var(--ui-accent); margin: 0; }
/* A borderless round button that holds an icon instead of a word. */
#overlay .ui-icon { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 0; background: transparent; border-radius: 999px; backdrop-filter: none; -webkit-backdrop-filter: none; }
#overlay .ui-icon:hover { background: rgba(242, 227, 201, 0.12); border-color: transparent; }
/* An icon button standing on its own rather than inside a pill needs the pill's own chrome. */
#overlay .ui-icon-solo { width: 36px; height: 36px; background: var(--ui-bg); border: 1px solid var(--ui-line); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
#overlay .ui-icon-solo:hover { background: var(--ui-bg-strong); border-color: var(--ui-accent); }
#overlay .ui-icon svg { display: block; }
#overlay .ui-seg { display: inline-flex; border: 1px solid var(--ui-line); border-radius: 999px; background: var(--ui-bg); padding: 3px; gap: 2px; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }
#overlay .ui-seg button { border: 0; background: transparent; padding: 7px 14px; }
#overlay .ui-seg button:hover { background: rgba(242,227,201,0.1); }
#overlay .ui-seg button[aria-pressed="true"] { background: var(--ui-accent); color: #22201f; }
#overlay .ui-hint { color: var(--ui-ink-dim); font-size: 13px; }
#overlay .ui-kbd { display: inline-block; min-width: 1.4em; padding: 0 5px; border: 1px solid var(--ui-line); border-radius: 5px; font-size: 12px; text-align: center; color: var(--ui-ink-dim); }

#overlay .start { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: auto; background: radial-gradient(ellipse at 50% 60%, rgba(0,0,0,0.0) 30%, rgba(0,0,0,0.28) 100%); transition: opacity 600ms ease; }
#overlay .start.is-hidden { opacity: 0; pointer-events: none; }
#overlay .start-inner { display: flex; flex-direction: column; align-items: center; gap: 14px; transform: translateY(18vh); }
#overlay .start button { font-size: 19px; font-weight: 600; padding: 15px 28px; background: var(--ui-bg-strong); border-color: var(--ui-line); }
#overlay .start button:hover { border-color: var(--ui-accent); }
#overlay .start .ui-hint { text-align: center; max-width: 30ch; }

#overlay .label { position: absolute; transform: translate(-50%, -140%); padding: 5px 10px; border-radius: 999px; background: var(--ui-bg-strong); border: 1px solid var(--ui-line); font-size: 13px; font-weight: 500; white-space: nowrap; pointer-events: none; }

@media (max-width: 640px) {
  /* Narrow screens: the badge moves to the top, the controls wrap along the bottom. */
  #overlay { font-size: 13px; }
  #overlay .ui-corner.left { top: max(12px, env(safe-area-inset-top)); bottom: auto; left: 12px; align-items: flex-start; }
  #overlay .ui-corner.right { left: 12px; right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); flex-direction: row; flex-wrap: wrap-reverse; justify-content: flex-end; gap: 6px; }
  #overlay .ui-corner.right button, #overlay .ui-corner.right .ui-check { padding: 7px 10px; }
  #overlay .ui-corner.right .ui-range { padding: 3px 10px 3px 3px; }
  #overlay .ui-icon { width: 26px; height: 26px; }
  #overlay .ui-icon-solo { width: 32px; height: 32px; }
  #overlay .ui-seg button { padding: 6px 10px; }
  #overlay .ui-range input[type=range] { width: 64px; }
  #overlay .start-inner { transform: translateY(24vh); }
}
`;

let injected = false;

export function createOverlay(_store: Store): Overlay {
  const root = document.getElementById('overlay') as HTMLElement;
  if (!injected) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    injected = true;
  }
  root.innerHTML = '';
  const badge = document.createElement('div');
  badge.className = 'ui-corner left';
  const controls = document.createElement('div');
  controls.className = 'ui-corner right';
  const centre = document.createElement('div');
  centre.className = 'ui-centre';
  const panels = document.createElement('div');
  panels.className = 'ui-panels';
  root.append(panels, badge, controls, centre);
  return { root, badge, controls, centre, panels };
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
