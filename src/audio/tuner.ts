import { RADIO } from '../core/constants';
import { clamp01 } from '../util/math';
import { countrySearchUrl, dominantCountry, geoSearchUrl, indexOfStation, mergeStations, toStations, type RawStation, type Station } from './stations';

/**
 * Live radio: a band of real stations near you, and a dial.
 *
 * It plays through a bare `HTMLAudioElement` and not through the mixer, which is the one place
 * in this app where something audible sits outside the graph. Routing it in would need
 * `createMediaElementSource`, and for a cross-origin stream that returns silence unless the
 * element sets `crossOrigin="anonymous"` *and* the stream server sends CORS headers — which
 * shoutcast and icecast servers overwhelmingly do not. So `crossOrigin` is deliberately left
 * alone and the element carries its own gain, master × music, applied by hand.
 */
export type TunerStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TunerState {
  status: TunerStatus;
  stations: Station[];
  index: number;
  playing: boolean;
  /** Something to show the user: a failure, or where the band came from. */
  message: string;
}

export interface Tuner {
  state(): TunerState;
  onChange(cb: (s: TunerState) => void): () => void;
  /** Fetch the band around a point. Repeat calls for the same point are ignored. */
  load(lat: number, lon: number): Promise<void>;
  current(): Station | null;
  step(delta: number): void;
  tuneTo(index: number): void;
  play(): Promise<void>;
  stop(): void;
  setVolume(master: number, music: number): void;
  dispose(): void;
}

async function getJson(url: string, timeoutMs: number, doFetch: typeof fetch): Promise<RawStation[]> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(String(res.status));
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as RawStation[]) : [];
  } finally {
    clearTimeout(timer);
  }
}

function remember(id: string | null): void {
  try {
    if (id) localStorage.setItem(RADIO.STORAGE_KEY, id);
  } catch {
    /* private mode */
  }
}

function recall(): string | null {
  try {
    return localStorage.getItem(RADIO.STORAGE_KEY);
  } catch {
    return null;
  }
}

export function createTuner(doFetch: typeof fetch = fetch.bind(globalThis)): Tuner {
  const audio = new Audio();
  audio.preload = 'none';
  // Deliberately not 'anonymous' — see the note at the top of this file.
  audio.volume = 0;

  let state: TunerState = { status: 'idle', stations: [], index: 0, playing: false, message: '' };
  const listeners = new Set<(s: TunerState) => void>();
  let loadedFor = '';
  let master = 1;
  let music = 1;
  let skips = 0;

  const emit = (patch: Partial<TunerState>) => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };
  const current = () => state.stations[state.index] ?? null;

  const onError = () => {
    // Stations die between one check and the next. Move along rather than sitting on silence.
    if (!state.playing) return;
    if (skips >= RADIO.SKIP_LIMIT || state.stations.length < 2) {
      stop();
      emit({ message: 'That station would not play. Try another.' });
      return;
    }
    skips++;
    step(1);
    void play();
  };
  audio.addEventListener('error', onError);
  audio.addEventListener('stalled', onError);

  const stop = () => {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    emit({ playing: false });
  };

  const play = async () => {
    const s = current();
    if (!s) return;
    audio.src = s.url;
    audio.volume = clamp01(master * music);
    try {
      await audio.play();
      skips = 0;
      remember(s.id);
      emit({ playing: true, message: '' });
      // The API asks to be told when a station is played. This is the one of its two requests
      // a browser can actually honour; the User-Agent one it cannot.
      void doFetch(`${RADIO.API}/json/url/${s.id}`).catch(() => {});
    } catch {
      emit({ playing: false, message: 'That station would not play. Try another.' });
    }
  };

  const step = (delta: number) => {
    if (state.stations.length === 0) return;
    const n = state.stations.length;
    emit({ index: (((state.index + delta) % n) + n) % n });
    remember(current()?.id ?? null);
  };

  return {
    state: () => state,
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    current,
    step,
    tuneTo(index) {
      if (state.stations.length === 0) return;
      emit({ index: Math.max(0, Math.min(state.stations.length - 1, index)) });
      remember(current()?.id ?? null);
    },
    async load(lat, lon) {
      const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
      if (key === loadedFor && state.stations.length > 0) return;
      emit({ status: 'loading', message: 'Finding stations near you…' });
      try {
        // One geo query does two jobs: the stations genuinely nearby, and — through the
        // countries they report — which country to ask for the rest of the band.
        const near = await getJson(geoSearchUrl(lat, lon, RADIO.GEO_DISTANCE_M, RADIO.GEO_LIMIT), RADIO.TIMEOUT_MS, doFetch);
        const code = dominantCountry(near);
        const national = code ? await getJson(countrySearchUrl(code, RADIO.COUNTRY_LIMIT), RADIO.TIMEOUT_MS, doFetch) : [];
        const band = mergeStations(toStations(near), toStations(national), RADIO.BAND_LIMIT);
        if (band.length === 0) {
          emit({ status: 'error', stations: [], message: 'No stations here that this browser can play.' });
          return;
        }
        loadedFor = key;
        emit({
          status: 'ready',
          stations: band,
          index: indexOfStation(band, recall()),
          message: `${band.length} stations${code ? ` in ${code}` : ''}`,
        });
      } catch {
        emit({ status: 'error', message: 'Could not reach the station list.' });
      }
    },
    play,
    stop,
    setVolume(m, mu) {
      master = m;
      music = mu;
      audio.volume = clamp01(master * music);
    },
    dispose() {
      audio.removeEventListener('error', onError);
      audio.removeEventListener('stalled', onError);
      stop();
      listeners.clear();
    },
  };
}
