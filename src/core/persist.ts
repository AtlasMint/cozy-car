import type { AppState, Mode, Store, VehicleId } from './store';

/**
 * Persists the handful of user preferences under one namespaced localStorage key and
 * restores them at boot. Weather has its own cache; the Spotify URI has its own key.
 */
export const PERSIST_KEY = 'shotgun.prefs.v1';

export interface Prefs {
  mode?: Mode;
  vehicle?: VehicleId;
  masterVolume?: number;
  reducedMotion?: boolean;
  quality?: 'low' | 'high';
}

const KEYS: (keyof Prefs)[] = ['mode', 'vehicle', 'masterVolume', 'reducedMotion', 'quality'];

/** Validate a parsed JSON value into Prefs, dropping anything malformed. Pure. */
export function sanitizePrefs(raw: unknown): Prefs {
  const out: Prefs = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (r.mode === 'chill' || r.mode === 'focus') out.mode = r.mode;
  if (r.vehicle === 'hatchback' || r.vehicle === 'van' || r.vehicle === 'sports') out.vehicle = r.vehicle;
  if (typeof r.masterVolume === 'number' && Number.isFinite(r.masterVolume)) out.masterVolume = Math.min(1, Math.max(0, r.masterVolume));
  if (typeof r.reducedMotion === 'boolean') out.reducedMotion = r.reducedMotion;
  if (r.quality === 'low' || r.quality === 'high') out.quality = r.quality;
  return out;
}

export function loadPrefs(storage: Pick<Storage, 'getItem'> | null = safeStorage()): Prefs {
  if (!storage) return {};
  try {
    const raw = storage.getItem(PERSIST_KEY);
    return raw ? sanitizePrefs(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function savePrefs(state: Pick<AppState, keyof Prefs>, storage: Pick<Storage, 'setItem'> | null = safeStorage()): void {
  if (!storage) return;
  const prefs: Prefs = { mode: state.mode, vehicle: state.vehicle, masterVolume: state.masterVolume, reducedMotion: state.reducedMotion, quality: state.quality };
  try {
    storage.setItem(PERSIST_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

/** Subscribe to the store and write prefs whenever one changes. Returns an unsubscribe. */
export function bindPersistence(store: Store): () => void {
  const unsubs = KEYS.map((k) => store.subscribe(k, () => savePrefs(store.get())));
  return () => unsubs.forEach((u) => u());
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
