import type { Store, WeatherState } from '../core/store';
import { kindLabel } from '../weather/wmo';
import { el, type Overlay } from './overlay';

/**
 * Bottom-left badge: temperature, condition, location and whether the location is a fallback.
 * Failure copy carries direction, not apology, and offers a retry.
 */
export function createWeatherBadge(overlay: Overlay, store: Store, retry: () => void): { dispose(): void } {
  const card = el('div', 'ui-card weather');
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  const line1 = el('div', 'weather-main');
  const line2 = el('div', 'ui-hint');
  const retryBtn = el('button', undefined, 'Retry');
  retryBtn.type = 'button';
  retryBtn.style.marginTop = '8px';
  retryBtn.hidden = true;
  retryBtn.addEventListener('click', retry);
  card.append(line1, line2, retryBtn);
  overlay.badge.appendChild(card);

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
      card.remove();
    },
  };
}
