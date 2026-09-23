import { WEATHER } from '../core/constants';
import { geocode, type GeoResult, type WeatherSource } from '../weather/openMeteo';
import { el } from './overlay';

/**
 * Popover above the weather badge: type a place, pick a match from Open-Meteo's geocoding
 * API, and the weather follows it. "Use my location" clears the choice and asks the browser
 * again. Closes on Escape, on a pick, or on a click outside.
 */
export interface LocationPicker {
  open(): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  onClose(cb: () => void): void;
  dispose(): void;
}

const CSS = /* css */ `
#overlay .locpick { position: absolute; left: 0; bottom: calc(100% + 8px); width: min(320px, calc(100vw - 32px)); padding: 12px; border-radius: 16px; background: var(--ui-bg-strong); border: 1px solid var(--ui-line); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: none; flex-direction: column; gap: 10px; }
#overlay .locpick.is-open { display: flex; }
#overlay .locpick header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#overlay .locpick h2 { margin: 0; font-size: 15px; font-weight: 600; }
#overlay .locpick input[type=search] { width: 100%; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--ui-line); background: rgba(255,255,255,0.06); color: var(--ui-ink); }
#overlay .locpick input[type=search]::placeholder { color: var(--ui-ink-dim); }
#overlay .locpick ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow: auto; }
#overlay .locpick li button { width: 100%; text-align: left; border-radius: 10px; padding: 8px 10px; font-size: 14px; }
#overlay .locpick .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#overlay .locpick .row button { white-space: nowrap; flex: none; }
#overlay .locpick .row .ui-hint { flex: 1; text-align: right; font-size: 12px; }
@media (max-width: 640px) { #overlay .locpick { bottom: auto; top: calc(100% + 8px); } }
`;

let cssInjected = false;

export function createLocationPicker(host: HTMLElement, source: WeatherSource, returnFocus: () => void): LocationPicker {
  if (!cssInjected) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    cssInjected = true;
  }
  const root = el('div', 'locpick');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Change location');

  const header = el('header');
  const title = el('h2', undefined, 'Location');
  const closeBtn = el('button', undefined, 'Close');
  closeBtn.type = 'button';
  header.append(title, closeBtn);

  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Search for a town or city';
  input.setAttribute('aria-label', 'Search for a town or city');
  input.autocomplete = 'off';

  const list = el('ul');
  list.setAttribute('role', 'listbox');
  const status = el('div', 'ui-hint');

  const row = el('div', 'row');
  const mine = el('button', undefined, 'Use my location');
  mine.type = 'button';
  const credit = el('span', 'ui-hint', 'Places and weather by Open-Meteo');
  row.append(mine, credit);

  root.append(header, input, list, status, row);
  host.appendChild(root);

  let open = false;
  let timer = 0;
  let controller: AbortController | null = null;
  const closeListeners = new Set<() => void>();

  const setStatus = (text: string) => {
    status.textContent = text;
    status.hidden = text.length === 0;
  };
  setStatus('');

  const render = (results: GeoResult[]) => {
    list.innerHTML = '';
    for (const r of results) {
      const li = el('li');
      li.setAttribute('role', 'option');
      const b = el('button', undefined, r.label);
      b.type = 'button';
      b.addEventListener('click', () => {
        setStatus(`Fetching weather for ${r.label}`);
        void source.setLocation({ lat: r.lat, lon: r.lon, label: r.label }).finally(() => setStatus(''));
        close();
      });
      li.appendChild(b);
      list.appendChild(li);
    }
  };

  const search = async (q: string) => {
    controller?.abort();
    if (q.trim().length < WEATHER.GEOCODE_MIN_CHARS) {
      render([]);
      setStatus('');
      return;
    }
    controller = new AbortController();
    setStatus('Searching');
    try {
      const results = await geocode(q, undefined, controller.signal);
      render(results);
      setStatus(results.length ? '' : 'No places found with that name');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      render([]);
      setStatus('Search unavailable right now');
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void search(input.value), WEATHER.GEOCODE_DEBOUNCE_MS);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      void search(input.value);
    }
  });
  mine.addEventListener('click', () => {
    setStatus('Asking the browser for your location');
    void source.setLocation(null).finally(() => setStatus(''));
    close();
  });
  closeBtn.addEventListener('click', () => close());

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.stopPropagation();
      close();
    }
  };
  const onDocDown = (e: PointerEvent) => {
    if (open && !host.contains(e.target as Node)) close();
  };

  const openIt = () => {
    if (open) return;
    open = true;
    root.classList.add('is-open');
    const current = source.getLocation();
    mine.disabled = current === null;
    input.value = '';
    render([]);
    setStatus(current ? `Showing ${current.label}` : '');
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDocDown, true);
    setTimeout(() => input.focus({ preventScroll: true }), 0);
  };
  const close = () => {
    if (!open) return;
    open = false;
    root.classList.remove('is-open');
    controller?.abort();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDocDown, true);
    for (const cb of closeListeners) cb();
    returnFocus();
  };

  return {
    open: openIt,
    close,
    toggle() {
      if (open) close();
      else openIt();
    },
    isOpen: () => open,
    onClose(cb) {
      closeListeners.add(cb);
    },
    dispose() {
      close();
      root.remove();
    },
  };
}
