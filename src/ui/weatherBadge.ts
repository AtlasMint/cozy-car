import type { Store, WeatherState } from '../core/store';
import type { WeatherSource } from '../weather/openMeteo';
import { kindLabel } from '../weather/wmo';
import { createLocationPicker } from './locationPicker';
import { el, type Overlay } from './overlay';

/**
 * Bottom-left badge: temperature, condition, location and whether the location is a fallback.
 * Clicking it opens the location picker. Failure copy carries direction, not apology, and
 * offers a retry.
 */
export function createWeatherBadge(overlay: Overlay, store: Store, source: WeatherSource): { dispose(): void } {
  const wrap = el('div', 'weather-wrap');
  wrap.style.position = 'relative';
  const card = el('button', 'ui-card weather');
  card.type = 'button';
  card.setAttribute('aria-haspopup', 'dialog');
  card.setAttribute('aria-expanded', 'false');
  card.title = 'Change location';
  card.style.textAlign = 'left';
  card.style.borderRadius = 'var(--ui-radius)';
  const live = el('div');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const line1 = el('div', 'weather-main');
  const line2 = el('div', 'ui-hint');
  const line3 = el('div', 'ui-hint', 'Change location');
  line3.style.marginTop = '4px';
  live.append(line1, line2);
  card.append(live, line3);
  const retryBtn = el('button', undefined, 'Retry');
  retryBtn.type = 'button';
  retryBtn.hidden = true;
  retryBtn.addEventListener('click', () => void source.refresh(true));
  wrap.append(card, retryBtn);
  overlay.badge.appendChild(wrap);

  const picker = createLocationPicker(wrap, source, () => card.focus({ preventScroll: true }));
  card.addEventListener('click', () => {
    picker.toggle();
    card.setAttribute('aria-expanded', String(picker.isOpen()));
  });
  picker.onClose(() => card.setAttribute('aria-expanded', 'false'));

  const render = () => {
    const { weather, weatherStatus } = store.get();
    retryBtn.hidden = weatherStatus !== 'error';
    if (weatherStatus === 'error' && !weather) {
      line1.textContent = 'Weather unavailable';
      line2.textContent = 'Showing a clear evening';
      return;
    }
    if (!weather) {
      line1.textContent = 'Finding your weather';
      line2.textContent = 'Overcast until it arrives';
      return;
    }
    const w: WeatherState = weather;
    const t = Math.round(w.temperatureC);
    line1.textContent = `${t}° · ${kindLabel(w.kind, w.isDay)}`;
    const where = w.isFallbackLocation ? `${w.locationLabel} (location not shared)` : w.locationLabel;
    line2.textContent = weatherStatus === 'error' ? `${where} · last known` : where;
  };
  render();
  const u1 = store.subscribe('weather', render);
  const u2 = store.subscribe('weatherStatus', render);

  return {
    dispose() {
      u1();
      u2();
      picker.dispose();
      wrap.remove();
    },
  };
}
