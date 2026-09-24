import { el } from './overlay';

/**
 * A popover that hangs off a control and opens upward, because every one of these lives in the
 * bottom corners. It is the [locationPicker] pattern generalised: the picker got here first and
 * solved Escape, click-outside and focus return; this is the same solution with the contents
 * left to the caller.
 *
 * The caller owns `body` and fills it. The menu owns the trigger, the open/closed state, and
 * the rule that only one of these is open at a time.
 */
export interface Menu {
  /** The three-dot button. Exposed so callers can label it and hang a tooltip on it. */
  readonly trigger: HTMLButtonElement;
  /** Where the caller puts its rows. */
  readonly body: HTMLElement;
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  dispose(): void;
}

const DOTS = /* html */ `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
<circle cx="5" cy="12" r="1.85" fill="currentColor"/><circle cx="12" cy="12" r="1.85" fill="currentColor"/><circle cx="19" cy="12" r="1.85" fill="currentColor"/>
</svg>`;

const CSS = /* css */ `
#overlay .ui-menu-host { position: relative; display: inline-flex; }
/* Opens upward: every host sits in a bottom corner, on wide screens and narrow ones alike. */
#overlay .ui-menu { position: absolute; bottom: calc(100% + 10px); width: min(292px, calc(100vw - 32px)); max-height: min(60vh, 460px); overflow-y: auto; padding: 12px; border-radius: 16px; background: var(--ui-bg-strong); border: 1px solid var(--ui-line); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: none; flex-direction: column; gap: 12px; z-index: 2; }
#overlay .ui-menu.is-open { display: flex; }
#overlay .ui-menu.align-left { left: 0; }
#overlay .ui-menu.align-right { right: 0; }
#overlay .ui-menu h3 { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ui-ink-dim); }
#overlay .ui-menu .ui-check { width: 100%; }
#overlay .ui-menu hr { border: 0; border-top: 1px solid var(--ui-line); margin: 2px 0; }
/* label | control | readout. The readout column is fixed so the sliders line up. */
#overlay .ui-menu-row { display: grid; grid-template-columns: 74px 1fr 40px; align-items: center; gap: 10px; font-size: 14px; }
#overlay .ui-menu-row input[type=range] { width: 100%; accent-color: var(--ui-accent); margin: 0; }
#overlay .ui-menu-row .ui-hint { text-align: right; font-variant-numeric: tabular-nums; }
`;

let cssInjected = false;
/** One at a time: opening a menu closes whichever was open. */
let current: Menu | null = null;

export function createMenu(host: HTMLElement, opts: { label: string; align: 'left' | 'right' }): Menu {
  if (!cssInjected) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    cssInjected = true;
  }
  host.classList.add('ui-menu-host');

  const trigger = el('button', 'ui-icon');
  trigger.type = 'button';
  trigger.innerHTML = DOTS;
  trigger.setAttribute('aria-label', opts.label);
  trigger.setAttribute('aria-haspopup', 'menu');
  trigger.setAttribute('aria-expanded', 'false');

  const body = el('div', `ui-menu align-${opts.align}`);
  body.setAttribute('role', 'menu');
  body.setAttribute('aria-label', opts.label);
  body.tabIndex = -1;

  host.append(trigger, body);

  let open = false;
  const menu: Menu = {
    trigger,
    body,
    isOpen: () => open,
    open() {
      if (open) return;
      if (current && current !== menu) current.close();
      open = true;
      current = menu;
      body.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      // Focus the popover, not its first control: a slider that takes focus on open will also
      // take the arrow keys, and the user has not chosen a row yet.
      body.focus({ preventScroll: true });
    },
    close() {
      if (!open) return;
      open = false;
      if (current === menu) current = null;
      body.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    },
    toggle() {
      if (open) {
        menu.close();
        trigger.focus({ preventScroll: true });
      } else {
        menu.open();
      }
    },
    dispose() {
      if (current === menu) current = null;
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      trigger.remove();
      body.remove();
    },
  };

  trigger.addEventListener('click', () => menu.toggle());

  const onKey = (e: KeyboardEvent) => {
    if (!open || e.key !== 'Escape') return;
    e.stopPropagation();
    menu.close();
    trigger.focus({ preventScroll: true });
  };
  // Capture, so a control inside the menu cannot swallow the outside click that should close it.
  const onDown = (e: PointerEvent) => {
    if (!open) return;
    const t = e.target as Node | null;
    if (t && (body.contains(t) || trigger.contains(t))) return;
    menu.close();
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('pointerdown', onDown, true);

  return menu;
}

/** A labelled row holding a control, the shape every menu row takes. */
export function menuRow(labelText: string, control: HTMLElement, value?: HTMLElement): HTMLElement {
  const row = el('label', 'ui-menu-row');
  const label = el('span', undefined, labelText);
  row.append(label, control);
  if (value) row.appendChild(value);
  return row;
}
