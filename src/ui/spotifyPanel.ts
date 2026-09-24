import * as THREE from 'three';
import type { Store } from '../core/store';
import type { IsoCamera } from '../core/isoCamera';
import { SPOTIFY, WEATHER } from '../core/constants';
import { createTuner } from '../audio/tuner';
import type { WeatherSource } from '../weather/openMeteo';
import { el, type Overlay } from './overlay';
import { tip } from './tooltip';

/**
 * The radio's panel: a Spotify embed anchored over the radio's screen-space projection,
 * preset buttons mapped to the radio's physical presets, an input for any Spotify link and a
 * music slider. Shown while focusedObject is 'radio'; exits on Back, Escape or a click outside.
 *
 * The slider used to say Ambience and was wired to the master volume — the master fader wearing
 * a different label, which is why it never felt like it belonged here. It is the music bus now.
 *
 * Two limitations, both stated in the panel rather than hidden. The embed plays 30-second
 * previews for logged-out users; full playback needs OAuth and the Web Playback SDK. And the
 * embed is a cross-origin iframe, so its volume is not reachable from this code at all — the
 * slider moves what we own, and the panel says where Spotify's own volume lives.
 */
export interface SpotifyPanel {
  update(): void;
  dispose(): void;
}

export interface SpotifyRef {
  type: string;
  id: string;
}

export function parseSpotify(input: string): SpotifyRef | null {
  const s = input.trim();
  const uri = /^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]{10,})$/.exec(s);
  if (uri) return { type: uri[1]!, id: uri[2]! };
  const url = /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?(?:embed\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]{10,})/.exec(s);
  if (url) return { type: url[1]!, id: url[2]! };
  return null;
}

/** The link the mobile Share button hands you. It is not an open.spotify.com URL. */
export function isShortLink(input: string): boolean {
  return /^https?:\/\/(spotify\.link|spotify\.app\.link)\/[A-Za-z0-9]+/.test(input.trim());
}

/**
 * Resolve a short link to something embeddable.
 *
 * It does not answer with a redirect — it answers 200 with an interstitial — so the canonical
 * URL has to be read out of the response. spotify.link does send CORS headers, so the fetch is
 * allowed; whether the target is findable in the body is not something this can promise, which
 * is why every failure path returns null and the caller says so plainly instead of hanging.
 */
export async function resolveShortLink(url: string, timeoutMs = 2000, doFetch: typeof fetch = fetch): Promise<SpotifyRef | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { signal: ctl.signal, redirect: 'follow' });
    // If it did redirect after all, the final URL is the answer.
    const viaUrl = parseSpotify(res.url ?? '');
    if (viaUrl) return viaUrl;
    // parseSpotify's URL pattern is unanchored, so it finds a link inside a page of markup.
    return parseSpotify(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function embedSrc(ref: SpotifyRef): string {
  return `https://open.spotify.com/embed/${ref.type}/${ref.id}?utm_source=generator&theme=0`;
}

const PANEL_CSS = /* css */ `
#overlay .radio-panel { position: absolute; width: min(440px, calc(100vw - 32px)); padding: 12px; border-radius: 16px; background: var(--ui-bg-strong); border: 1px solid var(--ui-line); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); display: flex; flex-direction: column; gap: 10px; opacity: 0; transition: opacity 220ms ease; pointer-events: none; }
#overlay .radio-panel.is-open { opacity: 1; pointer-events: auto; }
#overlay .radio-panel header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
#overlay .radio-panel h2 { margin: 0; font-size: 16px; font-weight: 600; }
#overlay .radio-panel .presets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }
#overlay .radio-panel .presets button { padding: 8px 10px; border-radius: 10px; font-size: 13px; text-align: left; }
#overlay .radio-panel .paste { display: flex; gap: 6px; }
#overlay .radio-panel .paste input { flex: 1; min-width: 0; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--ui-line); background: rgba(255,255,255,0.06); color: var(--ui-ink); }
#overlay .radio-panel iframe { width: 100%; height: 152px; border: 0; border-radius: 12px; background: #121212; }
#overlay .radio-panel .empty { height: 152px; border-radius: 12px; border: 1px dashed var(--ui-line); display: grid; place-items: center; text-align: center; padding: 12px; }
#overlay .radio-panel .music { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; }
#overlay .radio-panel .music input { width: 100%; accent-color: var(--ui-accent); margin: 0; }
#overlay .radio-panel .music .ui-hint { font-variant-numeric: tabular-nums; }
#overlay .radio-panel .note { font-size: 12px; }
#overlay .radio-panel .tuner { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 8px; padding: 8px; border-radius: 12px; border: 1px solid var(--ui-line); background: rgba(255,255,255,0.04); }
#overlay .radio-panel .dial { min-width: 0; text-align: center; }
#overlay .radio-panel .dial .name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#overlay .radio-panel .dial .band { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#overlay .radio-panel .tuner button.step { width: 30px; height: 30px; padding: 0; font-size: 17px; line-height: 1; border-radius: 999px; }
#overlay .radio-panel .tuner button.listen { padding: 7px 12px; font-size: 13px; white-space: nowrap; }
#overlay .radio-panel .status { font-size: 12px; min-height: 0; }
#overlay .radio-panel .status[hidden] { display: none; }
`;

let cssInjected = false;

export function createSpotifyPanel(
  overlay: Overlay,
  store: Store,
  iso: IsoCamera,
  anchor: THREE.Vector3,
  canvas: HTMLCanvasElement,
  weather: WeatherSource,
): SpotifyPanel {
  if (!cssInjected) {
    const style = document.createElement('style');
    style.textContent = PANEL_CSS;
    document.head.appendChild(style);
    cssInjected = true;
  }
  const panel = el('div', 'radio-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Radio');
  panel.tabIndex = -1;

  const header = el('header');
  const title = el('h2', undefined, 'Radio');
  const back = el('button', undefined, 'Back to the car');
  back.type = 'button';
  header.append(title, back);

  const player = el('div');
  const empty = el('div', 'empty ui-hint');
  empty.textContent = 'Pick a preset, or paste a link to any song, album or playlist. Spotify plays 30-second previews unless you are signed in with Premium in this browser.';
  let iframe: HTMLIFrameElement | null = null;
  player.appendChild(empty);

  const presets = el('div', 'presets');
  for (const p of SPOTIFY.PRESETS) {
    const b = el('button', undefined, p.label);
    b.type = 'button';
    b.addEventListener('click', () => play({ type: p.type, id: p.id }));
    presets.appendChild(b);
  }

  const paste = el('div', 'paste');
  const input = el('input');
  // Not type=url: `spotify:track:...` is a perfectly good thing to paste and is not a URL, and
  // the type only buys a mobile keyboard nobody wanted.
  input.type = 'text';
  input.placeholder = 'Paste a song, album or playlist link';
  input.setAttribute('aria-label', 'Spotify link');
  input.autocomplete = 'off';
  const go = el('button', undefined, 'Play');
  go.type = 'button';
  const status = el('div', 'status ui-hint');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const say = (text: string) => {
    status.textContent = text;
    status.hidden = text.length === 0;
  };
  const submit = async () => {
    const raw = input.value.trim();
    if (!raw) return;
    let ref = parseSpotify(raw);
    if (!ref && isShortLink(raw)) {
      say('Opening that short link…');
      go.disabled = true;
      ref = await resolveShortLink(raw);
      go.disabled = false;
      if (!ref) {
        say('Short links cannot be opened from here. Open it once in a browser and paste the open.spotify.com address instead.');
        return;
      }
    }
    if (!ref) {
      say('That does not look like a Spotify link.');
      return;
    }
    say('');
    play(ref);
  };
  go.addEventListener('click', () => void submit());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submit();
  });
  input.addEventListener('input', () => say(''));
  paste.append(input, go);

  const musicRow = el('label', 'music');
  const musicLabel = el('span', 'ui-hint', 'Music');
  const music = el('input');
  music.type = 'range';
  music.min = '0';
  music.max = '1';
  music.step = '0.01';
  music.setAttribute('aria-label', 'Music volume');
  const musicValue = el('span', 'ui-hint');
  const paintMusic = (v: number) => {
    music.value = String(v);
    musicValue.textContent = `${Math.round(v * 100)}%`;
  };
  paintMusic(store.get().volumeMusic);
  music.addEventListener('input', () => store.set({ volumeMusic: Number(music.value) }));
  musicRow.append(musicLabel, music, musicValue);
  const untipMusic = tip(music, "The station. Spotify's own volume is inside its player.");

  const note = el('div', 'ui-hint note', "Spotify's volume is inside the player above; this slider moves everything else the radio plays.");

  // ------------------------------------------------------------------ live radio
  const tuner = createTuner();
  const tunerRow = el('div', 'tuner');
  const prev = el('button', 'step', '\u2039');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Previous station');
  const next = el('button', 'step', '\u203a');
  next.type = 'button';
  next.setAttribute('aria-label', 'Next station');
  const dial = el('div', 'dial');
  const dialName = el('div', 'name', 'Live radio');
  const dialBand = el('div', 'band ui-hint', 'Stations near you');
  dial.append(dialName, dialBand);
  const listen = el('button', 'listen', 'Listen');
  listen.type = 'button';
  tunerRow.append(prev, dial, next, listen);
  // Arrow keys move the dial while any of it has focus, which is what a dial is for.
  tunerRow.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    tuner.step(e.key === 'ArrowRight' ? 1 : -1);
  });

  const paintTuner = () => {
    const t = tuner.state();
    const s = tuner.current();
    dialName.textContent = t.status === 'loading' ? 'Tuning…' : (s?.name ?? 'Live radio');
    dialBand.textContent = t.message || (s ? `${s.codec}${s.bitrate ? ` ${s.bitrate}k` : ''}` : 'Stations near you');
    listen.textContent = t.playing ? 'Stop' : 'Listen';
    listen.setAttribute('aria-pressed', String(t.playing));
    const idle = t.status !== 'ready';
    prev.disabled = idle;
    next.disabled = idle;
    listen.disabled = idle;
  };
  tuner.onChange(paintTuner);
  paintTuner();

  prev.addEventListener('click', () => {
    tuner.step(-1);
    if (tuner.state().playing) void tuner.play();
  });
  next.addEventListener('click', () => {
    tuner.step(1);
    if (tuner.state().playing) void tuner.play();
  });
  listen.addEventListener('click', () => {
    if (tuner.state().playing) {
      tuner.stop();
      return;
    }
    // One source at a time. The embed can only be stopped by clearing its src, which loses its
    // state — but that state was never recoverable anyway.
    if (iframe) iframe.src = 'about:blank';
    void tuner.play();
  });

  const applyRadioVolume = () => tuner.setVolume(store.get().masterVolume, store.get().volumeMusic);
  applyRadioVolume();

  const untips = [
    untipMusic,
    tip(prev, 'Previous station'),
    tip(next, 'Next station — or use the arrow keys'),
    tip(listen, 'Play this station. Stops Spotify, which cannot play at the same time.'),
  ];

  panel.append(header, player, presets, paste, status, tunerRow, musicRow, note);
  overlay.panels.appendChild(panel);

  const play = (ref: SpotifyRef) => {
    tuner.stop(); // one source at a time
    if (!iframe) {
      iframe = el('iframe');
      iframe.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      iframe.loading = 'lazy';
      iframe.title = 'Spotify player';
      empty.replaceWith(iframe);
    }
    iframe.src = embedSrc(ref);
    try {
      localStorage.setItem(SPOTIFY.STORAGE_KEY, `spotify:${ref.type}:${ref.id}`);
    } catch {
      /* ignore */
    }
  };

  const close = () => store.set({ focusedObject: null });
  back.addEventListener('click', close);

  let open = false;
  const setOpen = (v: boolean) => {
    if (v === open) return;
    open = v;
    panel.classList.toggle('is-open', v);
    if (v) {
      let last: string | null = null;
      try {
        last = localStorage.getItem(SPOTIFY.STORAGE_KEY);
      } catch {
        /* ignore */
      }
      const ref = last ? parseSpotify(last) : null;
      if (ref && !iframe) play(ref);
      // Only ask for stations once someone opens the radio: nobody pays for a list they never
      // see. The fallback matters — a forced #weather= override never resolves coordinates, and
      // a tuner with no band is worse than one pointed at the default city.
      const here = weather.getCoords() ?? WEATHER.FALLBACK_LOCATION;
      void tuner.load(here.lat, here.lon);
      setTimeout(() => back.focus({ preventScroll: true }), 950);
    }
  };
  const unsubFocus = store.subscribe('focusedObject', (id) => setOpen(id === 'radio'));
  const unsubs = [
    store.subscribe('volumeMusic', (v) => {
      paintMusic(v);
      applyRadioVolume();
    }),
    // The stream lives outside the mixer, so the master fader has to be applied to it by hand.
    store.subscribe('masterVolume', applyRadioVolume),
  ];

  // Click outside exits; the canvas is outside.
  const onCanvasDown = () => {
    if (open) close();
  };
  canvas.addEventListener('pointerdown', onCanvasDown);

  // When the embed takes keyboard focus, key events stop reaching us. Give the click a moment
  // to land inside the iframe, then hand focus back to the panel so Escape keeps working.
  const onBlur = () => {
    if (!open) return;
    setTimeout(() => {
      if (open && document.activeElement === iframe) panel.focus({ preventScroll: true });
    }, 1200);
  };
  window.addEventListener('blur', onBlur);

  const ndc = new THREE.Vector2();
  return {
    update() {
      if (!open) return;
      iso.project(anchor, ndc);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const px = ((ndc.x + 1) / 2) * w;
      const py = ((1 - ndc.y) / 2) * h;
      const pw = panel.offsetWidth || 380;
      const ph = panel.offsetHeight || 420;
      // Sit to the right of the radio when there is room, otherwise to the left; keep on screen.
      let left = px + 40;
      if (left + pw > w - 16) left = px - pw - 40;
      left = Math.max(16, Math.min(w - pw - 16, left));
      const top = Math.max(16, Math.min(h - ph - 16, py - ph / 2));
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    },
    dispose() {
      unsubFocus();
      for (const u of unsubs) u();
      for (const u of untips) u();
      tuner.dispose();
      canvas.removeEventListener('pointerdown', onCanvasDown);
      window.removeEventListener('blur', onBlur);
      panel.remove();
    },
  };
}
