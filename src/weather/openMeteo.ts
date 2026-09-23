import type { Store, WeatherKind, WeatherState } from '../core/store';
import { WEATHER } from '../core/constants';
import { isWeatherKind, wmoToKind } from './wmo';

/**
 * Open-Meteo, called directly from the browser (CORS-enabled, no key). Location from
 * geolocation with a timeout, falling back to a fixed city and saying so. Cached in
 * localStorage with a short TTL, refreshed on a timer and when the tab becomes visible again.
 * Never blocks first paint: the scene renders at `weatherStatus: 'loading'` and the real
 * state cross-fades in.
 *
 * The user can pick a place in the badge; it is resolved through Open-Meteo's geocoding API,
 * stored under its own key and used instead of geolocation until cleared.
 *
 * Debug override: `#weather=<kind>[&night=1][&temp=-3]` forces a state without a request.
 */
export interface WeatherSource {
  start(): void;
  refresh(force?: boolean): Promise<void>;
  /** Use a chosen place (or `null` to go back to geolocation), then refetch. */
  setLocation(loc: ChosenLocation | null): Promise<void>;
  getLocation(): ChosenLocation | null;
  stop(): void;
}

export interface ChosenLocation {
  lat: number;
  lon: number;
  label: string;
}

export interface GeoResult {
  label: string;
  lat: number;
  lon: number;
}

interface GeocodeRow {
  name?: string;
  admin1?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

/** "Berlin, Berlin, Germany" reads badly; drop the region when it repeats the name. Pure. */
export function formatPlace(r: { name?: string; admin1?: string; country?: string }): string {
  const parts = [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : undefined, r.country].filter((x): x is string => !!x && x.trim().length > 0);
  return parts.join(', ');
}

/** Parse a geocoding response into results with usable coordinates. Pure. */
export function parseGeocode(data: unknown): GeoResult[] {
  const rows = (data as { results?: GeocodeRow[] } | null)?.results;
  if (!Array.isArray(rows)) return [];
  const out: GeoResult[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (typeof r.latitude !== 'number' || typeof r.longitude !== 'number' || !r.name) continue;
    const label = formatPlace(r);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, lat: r.latitude, lon: r.longitude });
  }
  return out;
}

export async function geocode(query: string, fetchFn: typeof fetch = fetch.bind(globalThis), signal?: AbortSignal): Promise<GeoResult[]> {
  const q = query.trim();
  if (q.length < WEATHER.GEOCODE_MIN_CHARS) return [];
  const url = `${WEATHER.GEOCODE_URL}?name=${encodeURIComponent(q)}&count=${WEATHER.GEOCODE_COUNT}&language=en&format=json`;
  const res = await fetchFn(url, { signal: signal ?? AbortSignal.timeout(WEATHER.FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`geocoding ${res.status}`);
  return parseGeocode(await res.json());
}

interface Cached {
  state: WeatherState;
  lat: number;
  lon: number;
}

interface OpenMeteoCurrent {
  temperature_2m: number;
  precipitation: number;
  weather_code: number;
  is_day: number;
  wind_speed_10m: number;
  cloud_cover: number;
}

interface OpenMeteoResponse {
  timezone?: string;
  current?: OpenMeteoCurrent;
}

export function parseDebugOverride(hash: string): Partial<WeatherState> | null {
  const m = /weather=([a-zA-Z]+)/.exec(hash);
  if (!m || !isWeatherKind(m[1]!)) return null;
  const kind: WeatherKind = m[1] as WeatherKind;
  const night = /night=1/.test(hash);
  const temp = /temp=(-?\d+(\.\d+)?)/.exec(hash);
  return {
    kind,
    isDay: !night,
    temperatureC: temp ? Number(temp[1]) : kind === 'snow' ? -2 : 24,
    precipitationMm: kind === 'heavyRain' ? 6 : kind === 'rain' ? 2 : kind === 'drizzle' ? 0.4 : kind === 'snow' ? 1.5 : kind === 'thunder' ? 4 : 0,
    windSpeedKmh: kind === 'thunder' ? 32 : 10,
    locationLabel: 'Forced weather',
    isFallbackLocation: false,
  };
}

function labelFromTimezone(tz: string | undefined, fallback: string): string {
  if (!tz) return fallback;
  const last = tz.split('/').pop();
  return last ? last.replace(/_/g, ' ') : fallback;
}

export function toWeatherState(data: OpenMeteoResponse, isFallbackLocation: boolean, now = Date.now(), label?: string): WeatherState | null {
  const c = data.current;
  if (!c) return null;
  return {
    kind: wmoToKind(c.weather_code),
    temperatureC: c.temperature_2m,
    windSpeedKmh: c.wind_speed_10m,
    isDay: c.is_day === 1,
    precipitationMm: c.precipitation,
    locationLabel: label ?? labelFromTimezone(data.timezone, isFallbackLocation ? WEATHER.FALLBACK_LOCATION.label : 'Your location'),
    isFallbackLocation,
    fetchedAt: now,
  };
}

export function createWeatherSource(store: Store, fetchFn: typeof fetch = fetch.bind(globalThis)): WeatherSource {
  let timer = 0;
  let inflight: Promise<void> | null = null;
  let stopped = false;

  const readCache = (): Cached | null => {
    try {
      const raw = localStorage.getItem(WEATHER.CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Cached;
      if (!parsed.state || typeof parsed.state.fetchedAt !== 'number') return null;
      return parsed;
    } catch {
      return null;
    }
  };
  const writeCache = (c: Cached) => {
    try {
      localStorage.setItem(WEATHER.CACHE_KEY, JSON.stringify(c));
    } catch {
      /* private mode etc. */
    }
  };
  const readChosen = (): ChosenLocation | null => {
    try {
      const raw = localStorage.getItem(WEATHER.LOCATION_KEY);
      if (!raw) return null;
      const c = JSON.parse(raw) as ChosenLocation;
      return typeof c.lat === 'number' && typeof c.lon === 'number' && typeof c.label === 'string' ? c : null;
    } catch {
      return null;
    }
  };
  const writeChosen = (c: ChosenLocation | null) => {
    try {
      if (c) localStorage.setItem(WEATHER.LOCATION_KEY, JSON.stringify(c));
      else localStorage.removeItem(WEATHER.LOCATION_KEY);
    } catch {
      /* ignore */
    }
  };
  let chosen = readChosen();

  const locate = (): Promise<{ lat: number; lon: number; fallback: boolean }> =>
    new Promise((resolve) => {
      const fb = { lat: WEATHER.FALLBACK_LOCATION.lat, lon: WEATHER.FALLBACK_LOCATION.lon, fallback: true };
      if (!('geolocation' in navigator)) return resolve(fb);
      let done = false;
      const finish = (v: { lat: number; lon: number; fallback: boolean }) => {
        if (done) return;
        done = true;
        resolve(v);
      };
      const t = setTimeout(() => finish(fb), WEATHER.GEO_TIMEOUT_MS);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(t);
          finish({ lat: pos.coords.latitude, lon: pos.coords.longitude, fallback: false });
        },
        () => {
          clearTimeout(t);
          finish(fb);
        },
        { timeout: WEATHER.GEO_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
      );
    });

  const fetchWeather = async (lat: number, lon: number, fallback: boolean, label?: string): Promise<WeatherState> => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
      `&current=temperature_2m,precipitation,weather_code,is_day,wind_speed_10m,cloud_cover&timezone=auto`;
    const res = await fetchFn(url, { signal: AbortSignal.timeout(WEATHER.FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const data = (await res.json()) as OpenMeteoResponse;
    const state = toWeatherState(data, fallback, Date.now(), label);
    if (!state) throw new Error('open-meteo: no current block');
    return state;
  };

  const applyOverride = (): boolean => {
    const o = parseDebugOverride(location.hash);
    if (!o) return false;
    const base: WeatherState = {
      kind: 'clear',
      temperatureC: 24,
      windSpeedKmh: 10,
      isDay: true,
      precipitationMm: 0,
      locationLabel: 'Forced weather',
      isFallbackLocation: false,
      fetchedAt: Date.now(),
    };
    store.set({ weather: { ...base, ...o }, weatherStatus: 'ready' });
    return true;
  };

  const refresh = async (force = false) => {
    if (stopped) return;
    if (applyOverride()) return;
    if (inflight) return inflight;
    inflight = (async () => {
      const cached = readCache();
      const cacheMatches = !!cached && (!chosen || (Math.abs(cached.lat - chosen.lat) < 1e-6 && Math.abs(cached.lon - chosen.lon) < 1e-6));
      const fresh = cacheMatches && cached && Date.now() - cached.state.fetchedAt < WEATHER.CACHE_TTL_MS;
      if (cached && cacheMatches && !force) {
        // Show whatever we have immediately; refresh behind it if stale.
        store.set({ weather: cached.state, weatherStatus: fresh ? 'ready' : 'loading' });
        if (fresh) return;
      } else {
        store.set({ weatherStatus: 'loading' });
      }
      try {
        const loc = chosen
          ? { lat: chosen.lat, lon: chosen.lon, fallback: false, label: chosen.label }
          : cached && cacheMatches && !force
            ? { lat: cached.lat, lon: cached.lon, fallback: cached.state.isFallbackLocation, label: undefined }
            : { ...(await locate()), label: undefined };
        const state = await fetchWeather(loc.lat, loc.lon, loc.fallback, loc.label);
        writeCache({ state, lat: loc.lat, lon: loc.lon });
        store.set({ weather: state, weatherStatus: 'ready' });
      } catch (err) {
        console.warn('[weather]', err);
        store.set({ weatherStatus: 'error' });
      }
    })().finally(() => {
      inflight = null;
    });
    return inflight;
  };

  const onVisibility = () => {
    if (document.hidden) return;
    const w = store.get().weather;
    if (!w || Date.now() - w.fetchedAt > WEATHER.CACHE_TTL_MS) void refresh();
  };
  const onHash = () => {
    if (!applyOverride()) void refresh(true);
  };

  return {
    start() {
      stopped = false;
      void refresh();
      timer = window.setInterval(() => void refresh(), WEATHER.REFRESH_MS);
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('hashchange', onHash);
    },
    refresh,
    async setLocation(loc) {
      chosen = loc;
      writeChosen(loc);
      await refresh(true);
    },
    getLocation: () => chosen,
    stop() {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('hashchange', onHash);
    },
  };
}
