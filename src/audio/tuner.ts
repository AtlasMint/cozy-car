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
  /**
   * Between pressing Listen and hearing anything: the stream is opening, or a playing one has
   * run out of buffer. `status` cannot say this — it is about the band, not about the audio —
   * and `playing` is deliberately still false, because nothing is audible yet.
   */
  connecting: boolean;
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

  let state: TunerState = { status: 'idle', stations: [], index: 0, playing: false, connecting: false, message: '' };
  const listeners = new Set<(s: TunerState) => void>();
  let loadedFor = '';
  let master = 1;
  let music = 1;
  let skips = 0;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;

  const stopWaiting = () => {
    if (connectTimer === null) return;
    clearTimeout(connectTimer);
    connectTimer = null;
  };

  const emit = (patch: Partial<TunerState>) => {
    state = { ...state, ...patch };
    for (const fn of listeners) fn(state);
  };
  const current = () => state.stations[state.index] ?? null;

  // Stations die between one check and the next. Move along rather than sitting on silence.
  const moveOn = () => {
    if (skips >= RADIO.SKIP_LIMIT || state.stations.length < 2) {
      stop();
      emit({ message: 'That station would not play. Try another.' });
      return;
    }
    skips++;
    step(1);
    void play();
  };
  // An error counts while connecting as much as while playing: a stream that fails on the way
  // up never settles its play() promise in some browsers, and without this the dial would spin
  // on a station that has already given up.
  const onError = () => {
    if (!state.playing && !state.connecting) return;
    moveOn();
  };
  // Stalling is not. It only means nothing has arrived for a few seconds, which is ordinary
  // while a slow stream fills its first buffer — skipping there would walk past every station
  // that merely takes a moment. While connecting, CONNECT_TIMEOUT_MS is the judge instead.
  const onStalled = () => {
    if (!state.playing) return;
    moveOn();
  };
  // What the element says about the audio itself. `playing` is the only honest answer to "can
  // you hear it yet" — play() resolving means the element accepted the request, not that a byte
  // of it has arrived — and `waiting` is that same answer turning back into no mid-stream.
  const onPlaying = () => {
    stopWaiting();
    if (state.playing && !state.connecting) return;
    emit({ playing: true, connecting: false, message: '' });
  };
  const onWaiting = () => {
    if (!state.playing || state.connecting) return;
    emit({ connecting: true });
  };
  audio.addEventListener('error', onError);
  audio.addEventListener('stalled', onStalled);
  audio.addEventListener('playing', onPlaying);
  audio.addEventListener('waiting', onWaiting);

  const stop = () => {
    stopWaiting();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    emit({ playing: false, connecting: false });
  };

  const play = async () => {
    const s = current();
    if (!s) return;
    audio.src = s.url;
    audio.volume = clamp01(master * music);
    // Said before anything is awaited, so the press has an answer in the same frame as the
    // click. Everything below can only end this state, never begin it.
    stopWaiting();
    emit({ connecting: true, playing: false, message: `Tuning in to ${s.name}…` });
    connectTimer = setTimeout(() => {
      connectTimer = null;
      if (!state.connecting) return;
      stop();
      emit({ message: 'That station did not start. Try another.' });
    }, RADIO.CONNECT_TIMEOUT_MS);
    try {
      await audio.play();
      skips = 0;
      remember(s.id);
      // Not `playing: true` — that is the element's own `playing` event to declare, and on a
      // slow stream it arrives well after this resolves. The message goes now because the
      // station it named is the one that was accepted.
      emit({ message: '' });
      // The API asks to be told when a station is played. This is the one of its two requests
      // a browser can actually honour; the User-Agent one it cannot.
      void doFetch(`${RADIO.API}/json/url/${s.id}`).catch(() => {});
    } catch {
      stopWaiting();
      emit({ playing: false, connecting: false, message: 'That station would not play. Try another.' });
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
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('waiting', onWaiting);
      stop();
      listeners.clear();
    },
  };
}
