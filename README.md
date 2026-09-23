# Shotgun

A small open-top hatchback on a shelf, idling in your weather.

The view is a fixed isometric shot of a small seafoam car with no roof, seen from the rear-left
quarter — you look down into the cabin and sit behind the driver. The engine runs, the body
trembles on its springs, the air freshener swings, and the weather outside is fetched from
Open-Meteo for wherever you are. Two modes: **Chill** (parked, idling) and **Focus** (the
world scrolls past a stationary car). One thing to click: the radio, which pushes the camera
in and opens Spotify.

Built with Bun and three.js, no framework, no backend, no binary assets — the car, driver and
scenery are all primitives built in code.

## Run

```sh
bun install
bun dev          # http://localhost:3000, hot reloading
bun run build    # static bundle in dist/
bun run typecheck
bun test
```

`dev.ts` wraps Bun's HTML entrypoint bundler in `Bun.serve` so files fetched at runtime from
`public/` (the audio loops) are served too. `build` bundles `index.html` and copies `public/`
into `dist/`; serve `dist/` from any static host.

Useful hashes: `#weather=thunder&night=1&temp=4` forces a weather state (kinds: clear,
cloudy, overcast, fog, drizzle, rain, heavyRain, snow, thunder); `#debug` shows a stats panel.

## Weather and location

Conditions come from Open-Meteo for the browser's location, falling back to Kuala Lumpur when
location is not shared. Click the weather badge to search for any town through Open-Meteo's
geocoding API; the pick is remembered and used until you choose "Use my location".

## Audio

Sound is layered Web Audio: engine, road hum, rain, wind and an outdoor room tone, plus
one-shot thunder and the starter crank. Each loop looks for a file in `public/audio/` and
falls back to a small synthesized stand-in when the file is missing, so the app has sound out
of the box and never breaks on a missing asset. See [public/audio/README.md](public/audio/README.md)
for the filename checklist and sourcing notes.

## Spotify

Clicking the radio opens a panel with the official Spotify embed. Four built-in playlists map
to the radio's presets; any Spotify link can be pasted. **Known limitation:** the embed plays
30-second previews for logged-out users; logged-in Premium users get full tracks. Full
playback needs OAuth and the Web Playback SDK, which is out of scope for v1.

## Where the numbers live

Every tunable is in [src/core/constants.ts](src/core/constants.ts), grouped by system:

| Group | What it controls |
|---|---|
| `CAMERA` | View size, isometric angles, camera distance, parallax amounts |
| `WORLD` | Slab and road dimensions, scenery counts and treadmill field |
| `CAR` | Dimensions, wall and frame heights, seat and wheel positions |
| `DRIVER` | Breathing, head lag, gesture cadence, posture |
| `MOTION` | The four vibration bands, bumps, ignition dip, tacho, freshener, exhaust |
| `SPEED` | Focus cruising speed and its spring |
| `WEATHER` | Fallback location, timeouts, cache TTL |
| `WEATHER_FX` | Fog per kind, precipitation counts/shape, glass, lightning, headlights, streetlights, per-kind sky and light looks, the car exclusion box |
| `AUDIO` | Mix levels, engine rate in Focus, duck factor |
| `INTERACTION`, `SPOTIFY` | Hover rate, push-in timing and zoom, preset playlists |
| `PALETTE` | Every colour |

## Layout

```
src/
  core/        store (the only cross-module channel), loop, renderer, isoCamera, constants, persist
  scene/       stage (node hierarchy), lighting, car/, driver/, world/
  motion/      engineRig (vibration model), spring
  weather/     openMeteo, wmo (pure mapping), director, effects/
  interaction/ interactables registry, raycast, focusCamera
  audio/       mixer, layers
  ui/          overlay, startScreen, modeToggle, weatherBadge, volume, spotifyPanel, debugStats
  util/        math, tests/
```

Scene node hierarchy (every system hangs off it; `carRoot` is never translated):

```
stageRoot
 ├─ slab            road, scenery (treadmill)
 ├─ carRoot
 │   ├─ bodyRig     engineRig writes y / pitch / roll here; car parts, radio, dressing, driverRoot
 │   └─ wheels      each wheel: own spring offset + spin (outside bodyRig on purpose)
 └─ weatherRoot     rain, snow, splash, spray
```

## Adding an interactable

1. Build the detail geometry wherever it belongs and add an **invisible, oversized hitbox**
   mesh for it (see `createRadio` in `src/scene/car/radio.ts`).
2. In `src/main.ts`, call `registry.register({ id, hitbox, label, focus: { target, zoom,
   azimuthOffset }, onFocus, onBlur })`. The registry puts the hitbox on the interaction layer
   so glass and structure never intercept the ray.
3. Hover, click, the push-in and Escape all work immediately. If it needs a panel, subscribe
   to `store.subscribe('focusedObject', …)` the way `src/ui/spotifyPanel.ts` does and anchor
   it with `iso.project(...)`.

## Swapping in real models later

The car and driver are code-built so the repo stays text-only. To replace either with glTF:

- Keep the node names: `bodyRig`, `wheels` (with `wheel:frontNear` … children), `driverRoot`,
  and the driver chain `hips → torso → neck → head` plus `shoulderL/R`. The engine rig, idle
  system and interaction code only ever address these.
- Keep the hitbox proxies (`hitbox:radio`) and the steering wheel node (`steeringWheel`), which
  the driver's hands are parented to.
- Keep the cabin open (no roof panel) so the camera can see in, and keep the rain exclusion
  box (`WEATHER_FX.CAR_BOX`) enclosing the whole car including the roof volume.

Nothing else needs to change.

## Design notes

- The camera sits on the rear-left quarter at true isometric angles and looks down into the
  open cabin over the near door. Window frames and header rails stay so the silhouette reads.
- The car never moves. In Focus the world moves past it on a treadmill: one damped speed value
  feeds road scroll, scenery, wheel spin, motion amplitudes and the audio mix.
- The missing roof is a viewing conceit. Rain and snow are dropped by a ray/box test against
  the whole car including the roof volume, so nothing falls into the open cabin and the car
  reads as sheltered.

See [docs/PLAN-car.md](docs/PLAN-car.md) for the original implementation plan and
[docs/archive/](docs/archive/) for the version logs (`v0.1` cutaway, `v0.2` open roof).
