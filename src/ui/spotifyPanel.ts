import * as THREE from 'three';
import type { Store } from '../core/store';
import type { IsoCamera } from '../core/isoCamera';
import { SPOTIFY } from '../core/constants';
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
`;

let cssInjected = false;

export function createSpotifyPanel(
  overlay: Overlay,
  store: Store,
  iso: IsoCamera,
  anchor: THREE.Vector3,
  canvas: HTMLCanvasElement,
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
  empty.textContent = 'Pick a preset or paste a Spotify link. Spotify plays 30-second previews unless you are signed in with Premium in this browser.';
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
  input.type = 'url';
  input.placeholder = 'Paste a Spotify link';
  input.setAttribute('aria-label', 'Spotify link');
  const go = el('button', undefined, 'Play');
  go.type = 'button';
  const submit = () => {
    const ref = parseSpotify(input.value);
    if (!ref) {
      input.setCustomValidity('That does not look like a Spotify link');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    play(ref);
  };
  go.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
  });
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

  panel.append(header, player, presets, paste, musicRow, note);
  overlay.panels.appendChild(panel);

  const play = (ref: SpotifyRef) => {
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
      setTimeout(() => back.focus({ preventScroll: true }), 950);
    }
  };
  const unsubFocus = store.subscribe('focusedObject', (id) => setOpen(id === 'radio'));
  const unsubVol = store.subscribe('volumeMusic', paintMusic);

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
      unsubVol();
      untipMusic();
      canvas.removeEventListener('pointerdown', onCanvasDown);
      window.removeEventListener('blur', onBlur);
      panel.remove();
    },
  };
}
