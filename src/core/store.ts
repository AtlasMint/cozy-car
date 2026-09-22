export type Mode = 'chill' | 'focus';
export type WeatherKind =
  | 'clear'
  | 'cloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavyRain'
  | 'snow'
  | 'thunder';

export interface WeatherState {
  kind: WeatherKind;
  temperatureC: number;
  windSpeedKmh: number;
  isDay: boolean;
  precipitationMm: number;
  locationLabel: string;
  isFallbackLocation: boolean;
  fetchedAt: number;
}

export interface AppState {
  engineOn: boolean; // false until the user's first gesture
  mode: Mode;
  weather: WeatherState | null;
  weatherStatus: 'idle' | 'loading' | 'ready' | 'error';
  focusedObject: string | null; // Interactable id, e.g. 'radio'
  masterVolume: number; // 0..1
  reducedMotion: boolean;
  quality: 'low' | 'high';
}

export interface Store {
  get(): Readonly<AppState>;
  set(patch: Partial<AppState>): void;
  subscribe<K extends keyof AppState>(key: K, fn: (v: AppState[K]) => void): () => void;
}

type Listener = (v: unknown) => void;

export function createStore(initial: AppState): Store {
  let state: AppState = { ...initial };
  const listeners = new Map<keyof AppState, Set<Listener>>();

  return {
    get: () => state,
    set(patch) {
      const changed: (keyof AppState)[] = [];
      const next: AppState = { ...state };
      for (const key of Object.keys(patch) as (keyof AppState)[]) {
        const value = patch[key];
        if (value === undefined && !(key in patch)) continue;
        if (!Object.is(state[key], value)) {
          (next as unknown as Record<string, unknown>)[key] = value;
          changed.push(key);
        }
      }
      if (changed.length === 0) return;
      state = next;
      for (const key of changed) {
        const set = listeners.get(key);
        if (!set) continue;
        for (const fn of set) fn(state[key]);
      }
    },
    subscribe(key, fn) {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(fn as Listener);
      return () => set!.delete(fn as Listener);
    },
  };
}

export const defaultState: AppState = {
  engineOn: false,
  mode: 'chill',
  weather: null,
  weatherStatus: 'idle',
  focusedObject: null,
  masterVolume: 0.7,
  reducedMotion: false,
  quality: 'high',
};
