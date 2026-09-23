# PLAN-ui — v0.5

v0.5 is about the controls and what comes out of the speakers. No new vehicle, no new scene
geometry. Two things change shape: the overlay gets two **More** menus so the bottom-right
cluster stops being a row of everything at once, and the audio stops being one master fader over
five layers that all shout at each other.

Written for whoever implements this, which is probably a later session of me.

---

## 1. What is actually wrong today

Measured, not guessed.

| Symptom | The cause, in the code |
|---|---|
| Weather is too loud | `AUDIO.LEVELS.rain` is **0.55** against `engine` **0.5**, and rain is broadband while the engine is harmonic — equal gain is nowhere near equal loudness. In `heavyRain`, `WEATHER_FX.INTENSITY.heavyRain` is **1.0**, so rain runs at full 0.55 forever. `thunder` peaks at **0.9**, the loudest thing in the app. |
| You cannot turn weather down without turning everything down | Every layer connects straight to `mixer.master` ([layers.ts](../src/audio/layers.ts) `start()`). There is exactly one fader. |
| Weather sounds inorganic | `rain` is white noise → highpass 900 → bandpass 3200. That is television static. Real rain is thousands of discrete impacts over a broadband bed. `wind` is one bandpass at 420 Hz with a single 0.13 Hz LFO, so it breathes on a metronome. |
| The bottom-right row is full | Five controls side by side — Low quality, Reduce motion, volume, vehicle, mode — and it already wraps to two rows at 640 px. |
| "Ambience" in the radio panel | It is wired to `masterVolume` ([spotifyPanel.ts](../src/ui/spotifyPanel.ts)). It is the master fader wearing a different label, which is why it feels wrong. |
| Pasting a song "doesn't work" | It does. `parseSpotify` already accepts `track`, `album`, `playlist`, `episode`, `artist`, bare URIs, `intl-xx/` prefixes and `?si=` suffixes — all eleven cases pass. What fails is **`spotify.link/…`**, the short link the mobile Share button produces, and nothing in the UI says a single song is allowed. |

---

## 2. The audio graph

### 2.1 Today

```
engine ┐
road   │
rain   ├─→ master(gain) ─→ duck(gain) ─→ destination
wind   │
ambience ┘
```

One `setVolume`, one `duck`. The Spotify iframe is outside the graph entirely.

### 2.2 v0.5

```
engine, crank ──→ engineBus ──┐
road ─────────────────────────┤
rain, thunder ──→ weatherBus ─┼─→ master ─→ duck ─→ destination
wind ─────────────────────────┤
ambience ─────→ ambienceBus ──┘

live radio  ──→ HTMLAudioElement.volume        (cannot join the graph — see §2.3)
Spotify     ──→ cross-origin iframe            (cannot be controlled at all — see §7.4)
```

Buses: `engine`, `weather`, `ambience`, `music`. `road` rides the engine bus (it is the
vehicle's noise, and nobody wants a separate tyre fader). Thunder and crank are one-shots and
must connect to their bus, not to `master`, or they will ignore the slider — this is the one
easy bug in the whole phase.

### 2.3 Why the live radio cannot join the graph

Routing an `<audio>` element through Web Audio needs `createMediaElementSource`. For a
cross-origin stream that yields **silence** unless the element sets `crossOrigin="anonymous"`
*and* the stream server sends CORS headers. Most shoutcast/icecast servers do not. Plain
`<audio src>` playback has no such requirement.

So: the tuner plays through a bare `HTMLAudioElement`, and its gain is
`element.volume = musicLevel × masterLevel`, recomputed whenever either changes, plus muted when
`masterVolume === 0`. It is the one thing outside the mixer and the code should say so where it
happens.

---

## 3. Levels

`AUDIO.LEVELS` becomes per-bus defaults plus within-bus weights. Proposed starting numbers,
to be tuned by ear against heavy rain at night in Focus:

| | today | v0.5 | why |
|---|---|---|---|
| bus: engine | — | 1.0 | reference |
| bus: weather | — | **0.55** | the headline fix: weather as a group sits under the vehicle |
| bus: ambience | — | 0.8 | |
| bus: music | — | 0.9 | |
| rain | 0.55 | 0.42 | × 0.55 bus ≈ 0.23 effective, less than half of today |
| wind | 0.3 | 0.26 | |
| thunder | 0.9 | 0.55 | still the loudest event, no longer startling |
| engine | 0.5 | 0.5 | unchanged |
| roadNoise | 0.45 | 0.45 | unchanged |
| ambience | 0.18 | 0.22 | it was inaudible once rain came down |

User bus levels persist (`Prefs`), default to 1.0, and multiply the constants above. Store keys:
`volumeEngine`, `volumeWeather`, `volumeAmbience`, `volumeMusic`, all `0..1`.

---

## 4. The More menu

One component, `src/ui/menu.ts`, two instances. It is the [locationPicker](../src/ui/locationPicker.ts)
pattern generalised: an absolutely-positioned popover, `bottom: calc(100% + 8px)` so it opens
upward, `display:none` until `.is-open`, flipping to `top:` under the 640 px media query where
the controls sit at the bottom of a tall screen.

```ts
export interface Menu {
  open(): void; close(): void; toggle(): void; isOpen(): boolean;
  body: HTMLElement;          // callers append their own rows
  dispose(): void;
}
export function createMenu(host: HTMLElement, opts: { label: string; align: 'left' | 'right' }): Menu;
```

Requirements, all of which the location picker already solves and should be copied from rather
than reinvented: Escape closes and returns focus to the trigger; a pointerdown outside closes;
`aria-haspopup="menu"`, `aria-expanded` maintained on the trigger; focus moves into the popover
on open. Only one menu open at a time — opening one closes the other.

The trigger is a three-dot button reusing the `.ui-icon` class added in v0.4.

**Instance A — sound.** Trigger sits immediately right of the volume slider, inside the same
`.ui-range` pill. Contents: four labelled sliders (Engine, Weather, Ambience, Music), each a row
of `<label>` + `<input type=range>` showing a percentage.

**Instance B — settings.** Trigger is its own round button at the end of the controls row.
Contents: Reduce motion, Low quality (both moved out of [startScreen.ts](../src/ui/startScreen.ts),
where they have no business living anyway), and the keyboard-shortcut hints for **V** and **F**.

The bottom-right row afterwards: `[weather badge] … [🔊 ▭ ⋯] [Hatchback|Camper|Sports] [Chill|Focus] [⋯]`.

---

## 5. Tooltips

`title` is used on three controls today and is inconsistent: no touch support, ~1 s delay, and it
cannot be styled. Replace with `src/ui/tooltip.ts`:

```ts
export function tip(el: HTMLElement, text: string): () => void;
```

- One shared bubble element reused by every caller, positioned on show.
- Shows on `pointerenter` (after 350 ms) and on `focus-visible` (immediately — keyboard users
  should not wait), hides on leave/blur/Escape/scroll.
- Sets `aria-describedby` to the bubble's id while shown; removes `title` so the native one
  never double-renders.
- No animation when `prefers-reduced-motion: reduce`.
- Skipped entirely on coarse pointers, where there is no hover and a tooltip is just a popup.

Everything interactive gets one: both More triggers, mute, the volume slider, every bus slider,
the three vehicle buttons, Chill/Focus, the weather badge, the radio's presets, the tuner
controls, and Back to the car.

---

## 6. Weather sound

The brief is "free, organic, maybe recorded". Three routes were considered.

### 6.1 The options

**A. Better synthesis, no files.** Keeps the repo text-only, which is a stated property in the
README and in `public/audio/README.md`.

**B. Bundle CC0 recordings.** Genuinely organic, because it *is* organic. Costs ~1–2 MB of
binary in a repo that advertises having none.

**C. Both.** [layers.ts](../src/audio/layers.ts) `loadOrSynth` **already** tries `/audio/<name>.ogg`
first and falls back to a synth. The seam exists and is documented. Nothing architectural is
needed to support files; only the files themselves are missing.

**Recommendation: C, implemented as A now.** Ship a rewritten synthesis in v0.5 — it is testable,
reviewable and costs nothing — and land the recordings as a separate opt-in commit the user
approves, because committing binaries is a repo-identity decision and not mine to make. See §12.

### 6.2 Rain, properly

Real rain is two things: a broadband bed from far-field drops, and near-field **discrete
impacts**. The current synth has only the bed, which is why it sounds like static.

Build the impact texture by hand into an `AudioBuffer`, the same way `noiseBuffer()` already
writes samples in a loop — no `OfflineAudioContext`, no worklet, and pure enough to unit-test:

```
rainBuffer(sampleRate, seconds, density, seed):
  bed:     pink-ish noise, two poles, low amplitude
  impacts: N ≈ density × seconds drops, placed by a seeded PRNG
           each drop = exp(-t/τ) × sin/noise burst, τ ∈ 1.5–6 ms,
           centre frequency 1.2–8 kHz drawn log-uniform,
           amplitude ∝ 1/f so small fast drops sit behind big slow ones
  normalise to a fixed RMS so `density` changes texture, not level
```

Then play **three** copies of the buffer at different `playbackRate` (0.94 / 1.0 / 1.07) with
random start offsets, panned slightly apart. Decorrelated copies of one 4-second buffer stop the
loop being audible, which a single looping buffer never manages.

Intensity drives: the crossfade between a light buffer and a heavy buffer, a lowpass that opens
from 4 kHz to 11 kHz, and — above `INTENSITY.rain` — a 120–300 Hz rumble bed.

Why this is worth it: `mulberry32` already exists in [math.ts](../src/util/math.ts), so the whole
generator is deterministic and a test can assert its statistics (RMS within a band, spectral
centroid rising with density, no DC offset, endpoints matched for a clickless loop).

### 6.3 Wind, properly

Three resonant bandpasses at roughly 180 / 420 / 1100 Hz, each with an **independent** LFO at
an incommensurate rate (0.07 / 0.11 / 0.19 Hz) so nothing beats against anything, plus a gust
envelope: a slow random walk driven from `windKmh` that moves overall gain and the top band's Q
together. Gusts are what make wind read as weather rather than as a filter.

### 6.4 If recordings are approved

- Source from **CC0 only** so no attribution obligation follows the repo:
  [Freesound's CC0 tag](https://freesound.org/browse/tags/cc0/), and CC0 sets at
  [99Sounds](https://99sounds.org/rain-and-thunder/) and [Selekt](https://selektaudio.com/sound-lab/textures/wind).
  Pixabay's licence permits commercial use without attribution but is a bespoke licence, not
  CC0 — prefer CC0 where a choice exists.
- Four files, `.ogg` ~96 kbps mono, loop-matched: `rain-loop.ogg`, `rain-heavy.ogg`, `wind.ogg`,
  `outdoor-tone.ogg`. Budget 2 MB total.
- Record provenance and licence per file in `public/audio/CREDITS.md` even where CC0 asks for
  nothing. A repo that cannot say where its bytes came from has a problem later.
- `FILES` in layers.ts gains `rain-heavy`; everything else already works.

---

## 7. The radio

### 7.1 Size

The panel is `min(380px, 100vw - 32px)` with a 152 px embed. Adding a tuner needs more: go to
`min(440px, 100vw - 32px)` and let the embed stay 152. The panel is anchored to the radio's
projected position and already clamps to the viewport, so widening is safe. Re-check at 390 px.

### 7.2 Music slider

Rename `Ambience` → `Music` and point it at the new `music` bus instead of `masterVolume`. It is
the same control as the Music row in the sound menu; both write `store.volumeMusic`.

### 7.3 Presets

Drop **Lo-fi beats**. Add **Saxophone jazz**. Final four:

| slot | label | note |
|---|---|---|
| 1 | Saxophone jazz | new |
| 2 | Peaceful piano | unchanged |
| 3 | Jazz in the background | unchanged |
| 4 | Night drive | unchanged |

Spotify's editorial playlist IDs are not stable forever and are not all available in every
market. Verify each ID returns a playing embed before committing, and prefer a playlist that
resolves in MY as well as US.

### 7.4 Spotify links — what is actually needed

Single tracks already work (§1). The work is:

1. **`spotify.link/…` short links.** Verified: that host answers with `200` and
   `Access-Control-Allow-Origin: <origin>`, so a client-side `fetch` is *permitted* — but the
   body is an interstitial, and whether the canonical URL can be scraped from it was **not**
   verified against a live short link. Implement as: try the fetch, pull an
   `open.spotify.com/(track|album|playlist)/…` match out of the response text, and on any failure
   fall back to a clear message — "short links can't be opened from here; open it once and paste
   the `open.spotify.com` address". Never hang the UI on it: 2 s timeout, `AbortController`.
2. **Say that songs are allowed.** Placeholder becomes `Paste a song, album or playlist link`,
   the empty state likewise. This is most of the fix.
3. Change `input.type` from `url` to `text`, because `spotify:track:…` is not a URL and the type
   only buys a mobile keyboard we do not want.
4. `parseSpotify` gains cases and tests for short links and for `/embed/` URLs pasted back in.

### 7.5 Live radio

A third source alongside the presets and the paste box, and the one genuinely new subsystem.

**API: [Radio Browser](https://api.radio-browser.info/).** Verified working today:

- `https://all.api.radio-browser.info/json/stations/search?…` returns `200` over HTTPS, and
  responds with **`access-control-allow-origin: *`** — usable straight from the browser.
- No key, no account.
- For Malaysia, `countrycode=MY&hidebroken=true&is_https=true` returns **53** stations, of which
  **44** are MP3/AAC and directly playable in an `<audio>` element.

**Constraints, each of which has to be handled or the feature is flaky:**

- **Force `is_https=true`.** An `http://` stream on an `https://` page is blocked as mixed
  content, silently.
- **Reject HLS.** Nine of those 53 are `.m3u8`, which only Safari plays natively. Filter on
  `codec ∈ {MP3, AAC, AAC+}` *and* reject `.m3u8` / `.pls` / `.m3u` suffixes.
- **The API asks for a descriptive `User-Agent`.** A browser will not let `fetch` set that
  header. We cannot comply; note it in the code rather than pretending. Call the
  `/json/url/{stationuuid}` click endpoint when a station is played, which is the API's other
  request and one we *can* honour.
- **Do not hardcode a server.** Use `all.api.radio-browser.info`; the project explicitly asks
  for this.
- Stations die. Any `error` event on the element demotes that station and moves to the next.

**Location.** Reuse what already exists — the weather source's resolved location, including the
user's choice from the location picker. Map its country to `countrycode`, and pass
`geo_lat`/`geo_long`/`geo_distance` where coordinates are known so "local" means local rather
than national. When location is the Kuala Lumpur fallback, say so in the panel.

**"I can tune it."** A tuner, not a list: the fetched stations are sorted by `clickcount` into a
band, with `‹` and `›` stepping through them, the station name in a small LCD-ish readout, and
the physical radio's dial in the scene turning with it. Keyboard: left/right arrows while the
tuner has focus. The station choice persists under `shotgun.radio.v1`.

**Exclusivity.** Spotify and the tuner cannot both play: starting one stops the other. The
Spotify iframe can only be stopped by clearing `src`, which loses its state — acceptable, and
state was never recoverable anyway.

---

## 8. Phases

Each is one commit, per [COMMITS.md](COMMITS.md). Phases 0–3 are invisible or nearly so;
4 onward change what you hear.

| # | Commit | What |
|---|---|---|
| 0 | `refactor(audio): route layers through named buses` | The four buses, one-shots re-pointed, no level changes. Verify null: measure RMS before/after, must match. |
| 1 | `feat(audio): per-bus levels the user can set` | Store keys, persistence, mixer API `setBusVolume`. No UI yet. |
| 2 | `feat(ui): a menu that opens upwards` | `menu.ts` + CSS. No callers yet. |
| 3 | `feat(ui): tooltips on the controls` | `tooltip.ts`, applied to today's controls. |
| 4 | `feat(ui): put the extra controls behind More` | Both menus wired; Reduce motion and Low quality move out of startScreen. |
| 5 | `fix(audio): weather no longer shouts over the car` | The §3 numbers. |
| 6 | `feat(audio): rain as impacts over a bed` | §6.2, with the generator tests. |
| 7 | `feat(audio): wind that gusts` | §6.3. |
| 8 | `feat(radio): the music slider controls music` | §7.2 + panel width §7.1. |
| 9 | `feat(radio): saxophone jazz replaces lo-fi` | §7.3, IDs verified in-browser. |
| 10 | `feat(radio): accept any Spotify link` | §7.4. |
| 11 | `feat(radio): tune in a local station` | §7.5. The big one; split if it grows past ~300 lines. |
| 12 | `docs: log v0.5` | README, `docs/archive/v0.5-*.md`, version bump, tag. |

Optional, gated on §12: `feat(audio): recorded weather loops` + `public/audio/CREDITS.md`.

---

## 9. Where the numbers live

New group in [constants.ts](../src/core/constants.ts):

```ts
export const AUDIO = {
  ...,
  BUSES: { engine: 1.0, weather: 0.55, ambience: 0.8, music: 0.9 },
  RAIN_SYNTH: { seconds: 4, density: { light: 900, heavy: 5200 }, tau: [0.0015, 0.006],
                freq: [1200, 8000], copies: 3, rates: [0.94, 1.0, 1.07] },
  WIND_SYNTH: { bands: [180, 420, 1100], lfo: [0.07, 0.11, 0.19], gust: { lambda: 0.25, depth: 0.45 } },
};
export const RADIO = {
  API: 'https://all.api.radio-browser.info',
  LIMIT: 60, CODECS: ['MP3', 'AAC', 'AAC+'], GEO_DISTANCE_M: 200000,
  STORAGE_KEY: 'shotgun.radio.v1', TIMEOUT_MS: 6000,
};
```

## 10. Tests

Pure, in `src/util/tests/`, following the existing pattern:

- `rainBuffer` — RMS within a band at both densities, spectral centroid rises with density, no DC
  offset, first and last samples match closely enough to loop without a click, and the same seed
  gives the same buffer twice.
- `radio.ts` — station filtering: drops non-HTTPS, drops `.m3u8`/`.pls`, drops unknown codecs,
  keeps order by clickcount; and the URL builder against a fixed location.
- `parseSpotify` — the eleven cases that pass today, locked in, plus short-link handling.
- `menu.ts` — the open/close state machine, if it is extracted as a pure reducer; otherwise skip
  rather than write a DOM test that asserts nothing.
- A guard that every bus level in `AUDIO.BUSES` is in `(0, 1]` and that every layer names a bus
  that exists.

## 11. Verification

Beyond the suite: the [headless harness](archive/) used through v0.3 and v0.4 — screenshot
the controls row at 1440 and at 390, open both menus, and confirm the radio panel at 440 px
still clears the viewport at phone width. For audio, eval an `AnalyserNode` in the page and
assert the weather bus actually falls when its slider moves, since that is the whole point.

## 12. Decisions to overrule

1. **Binary audio in the repo.** Recommended as a separate, opt-in commit after the synthesis
   lands. Say the word and it goes in v0.5 proper instead.
2. **The Music slider cannot touch Spotify.** The embed is a cross-origin iframe; its volume is
   not reachable from our code, ever. The slider will control the live radio, and the panel will
   say where Spotify's own volume lives. The alternative — having "Music" secretly duck the
   world instead — is rejected as a control that lies about what it does.
3. **Road noise has no fader of its own**, it rides the engine bus.
4. **The tuner is a tuner, not a list.** If a searchable list of stations is wanted instead, that
   is a different and larger design.
5. **`thunder` drops to 0.55.** It is a deliberate loss of drama for a gain in not making people
   jump at 2 a.m.

## 13. Deferred

- Spotify OAuth / Web Playback SDK for full tracks. Still out of scope; still the reason the
  embed plays 30-second previews.
- Station search by name or genre.
- A proper EQ or per-vehicle mix memory.
- Stereo positioning of rain relative to the camera.
