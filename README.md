# Shotgun

Three open-top vehicles on a shelf, parked in your weather.

The view is a fixed isometric shot from the rear-left quarter — you look down into the cabin
and sit behind the driver. Pick a **hatchback**, a **camper van** or a **yellow sports car**;
each has its own shake, engine note, cruising speed, framing and interior. The body trembles on
its springs, the air freshener swings, and the weather outside is fetched from Open-Meteo for
wherever you are. Three modes: **Park** (an empty lot, engine off — where it opens), **Chill**
(the roadside, idling) and **Focus** (the world scrolls past a stationary car). Two things to
click: the radio, which pushes the camera in and opens Spotify, and the horn.

Built with Bun and three.js, no framework, no backend, no binary assets — the car, driver and
scenery are all primitives built in code.

## Run

```sh
bun install
bun dev          # http://localhost:5555, hot reloading
bun run dev --host   # the same, open to your network — prints the address for a phone
bun run build    # static bundle in dist/
bun run typecheck
bun test
```

`dev.ts` wraps Bun's HTML entrypoint bundler in `Bun.serve` so files fetched at runtime from
`public/` (the audio loops) are served too. `build` bundles `index.html` and copies `public/`
into `dist/`; serve `dist/` from any static host.

The dev server listens on this machine only unless given `--host`. Opened from another device
it is plain http on a LAN address, which browsers do not treat as a secure context, so they
refuse geolocation and the weather falls back to Kuala Lumpur; pick a town from the badge.

Useful hashes: `#vehicle=van` picks a vehicle (`hatchback`, `van`, `sports`);
`#weather=thunder&night=1&temp=4` forces a weather state (kinds: clear, cloudy, overcast, fog,
drizzle, rain, heavyRain, snow, thunder); `#debug` shows a stats panel.

## Vehicles

The picker sits in the bottom-right cluster and **V** cycles through the three. The choice is
remembered. Switching happens behind a fade to black: the camera jumps to the new framing, the
body is built or revealed and its shader programs are linked, and the fade back always reveals
a vehicle that has already been drawn once. Each vehicle is built once and then kept hidden for
the session, so every switch after the first has nothing left to link.

Everything a vehicle changes lives in one spec in [src/core/vehicles.ts](src/core/vehicles.ts):
dimensions, cabin geometry, anchors, camera framing, the weather shelter box, the motion
profile, the engine voice and the driver's pose. Bodies are one file each under
[src/scene/car/bodies/](src/scene/car/bodies/), exporting a single `build()`.

## Weather and location

Conditions come from Open-Meteo for the browser's location, falling back to Kuala Lumpur when
location is not shared. Click the weather badge to search for any town through Open-Meteo's
geocoding API; the pick is remembered and used until you choose "Use my location".

## Controls

The bottom-right cluster is three controls and two **More** menus. The dots beside the volume
slider open the balance — one fader per group, Engine, Weather, Ambience and Music — while the
slider itself stays the output level and the speaker mutes everything. The dots at the end of the
row hold Reduce motion, Low quality and the keyboard shortcuts. Everything interactive carries a
tooltip, on hover after a moment and on keyboard focus immediately.

Keys go through one registry ([src/ui/hotkeys.ts](src/ui/hotkeys.ts)) rather than a listener per
control: the guards — no modifiers, not while typing, and never the space bar belonging to a
focused button — are written once, and the shortcut list in the More menu is that registry read
back, so a key cannot be advertised without being bound or bound without being advertised.

| Key | |
|---|---|
| **P** | Park |
| **F** | Pull out, or Chill ⇄ Focus |
| **V** | Change vehicle |
| **M** | Mute everything |
| **H** | Horn — hold it |
| **R** | Open the radio |
| **Esc** | Back out of whatever the camera is pushed in on |

A key with no label is deliberately absent from that list and from the table above. Registering
one without a label is how something stays worth finding out about.

## On a phone

Run `bun run dev --host` and open the address it prints. A phone is played on its side.

**Held upright**, the screen dims and asks to be turned, and behind that the app stops as it
does in a hidden tab: no frames, no engine or weather sound, nothing under the dim takes a tap.
The radio stream and Spotify carry on, as they would in a background tab, because neither is in
the audio graph. Turn it and everything picks up where it stopped.

**On its side** it gets the narrow layout: the weather badge top-left, the controls in one row
along the bottom, clear of the notch. Opening the radio clears both corners so the panel has the
screen; Back to the car brings them back. The keyboard shortcuts leave the settings menu, the
Park hint says Tap rather than Press, and a touch screen starts on Low quality with the pointer
parallax off.

**Full screen** is offered the first time the phone is on its side ([src/ui/fullscreen.ts](src/ui/fullscreen.ts)):
the screen dims and asks, and while full screen a button in the top-right corner leaves it. It
asks once a visit, whatever the answer. An iPhone's browser cannot put a page full screen, so
there it never asks.

"A phone" is a touch screen whose short side is at most 600 px. Both queries are strings in
[src/ui/overlay.ts](src/ui/overlay.ts) that the CSS and `matchMedia` share. A tablet keeps the
desktop layout, and a narrow desktop window keeps the narrow layout with no prompt.

## Park, Chill, Focus

The app opens **parked**: an empty lot on the same plinth, engine off, accessory power on — the
cabin light and the radio work, the horn works, the driver's hands are in their lap. **P**
parks from anywhere. **F** pulls out onto the roadside and starts the engine, and from there
toggles Chill and Focus; it never jumps straight from Park to Focus, and the Focus button is
disabled while parked rather than quietly routed through Chill. Mode is not remembered between
sessions — the vehicle is.

Into or out of Park the world under the vehicle changes, so that crosses the same fade a
vehicle swap uses: the engine cranks in the dark and the fade back reveals the roadside with it
running, or the lot comes up silent. There is no start screen; Park is what it used to stand
in front of, and any first click or key press is the gesture Web Audio needs.

The lot ([src/scene/world/lot.ts](src/scene/world/lot.ts)) is the vehicle nose-in to a kerb in
the middle bay of a row of three, the aisle behind it, a low wall along the far edge, and
beyond the kerb a park — grass running forward with trees at every depth and one lamp just
past the kerb; nobody else. Nose-in is the camera's choice: from the rear-left quarter a prop
can stand in front of the cabin only if both its x and z are smaller, so anything ahead of the
nose or beyond the far wall is clear however tall and the near-rear quadrant may hold nothing
but paint. `clearOfCabin` is that inequality and a test runs it over every standing thing in
the lot for every vehicle. The camper, parked, has a table set out on the grass in front of it
— a white top on black stands, a chair either side, a lantern with a pool of its own at night —
and a moka pot steaming on the hob inside, which is where the swivelled passenger seat has been
looking since v0.4. Every vehicle is framed at the camper's width so the lot reads the same
from all three.

The road and the scenery, and the lot, are each a `World`
([src/scene/world/world.ts](src/scene/world/world.ts)); both stand behind one face
([worlds.ts](src/scene/world/worlds.ts)) so the tick and the weather director never know which
is under the wheels.

## The horn

Every vehicle has one, and it is two things: hold **H**, or press the middle of the steering
wheel. Holding sounds it for as long as you hold; a click is a tap. Beep, or honk.

A car horn is a steel diaphragm driven past its own resonance, chopping the air rather than
swinging it, so the voice ([src/audio/layers.ts](src/audio/layers.ts)) is a sawtooth through a
peak at the flare's mode and not a sine — a pair of sines is a doorbell. Each vehicle carries
its own two tones on its spec, roughly a minor third apart so they beat against each other, and
that beat is what the ear hears as a car: 400/500 Hz on the hatchback, where the standard disc
pair sits, down to 185/232 on something that is really sounding a klaxon. Both ends are the
diaphragm reaching speed and losing it, which is the pitch sagging below on the way in and again
on the way out. A press whose release never arrives — a lost keyup, a window that lost focus —
runs out on its own rather than sounding for the rest of the session.

The press is the middle of the steering wheel on every vehicle because every spec already says
where that is: `cabin.wheelCentre` and `cabin.steeringRadius`, the same numbers the driver's
grips are built from. It works on a vehicle whose wheel is a grab bar across a hatch without
knowing that is what it is.

## Audio

Nothing ships under `public/audio/`, so the synthesized layers **are** the product rather than
a fallback; a file dropped in there replaces its layer instead.

Everything audible runs through one of four buses — engine, weather, ambience, music — between
the layers and the master fader, including the one-shots: a thunderclap wired straight to the
master would ignore the weather fader. Two things cannot join the graph. The Spotify embed is a
cross-origin iframe, so its volume is unreachable from our code at all; the live radio stream
would be silenced by `createMediaElementSource` without CORS on the stream server, so it carries
its own gain instead.

Rain is generated rather than filtered ([src/audio/rain.ts](src/audio/rain.ts)). Real rain is a
broadband bed from the drops too far off to resolve plus thousands of discrete impacts near
enough to hear one at a time, and only the bed is reachable with a noise generator and two
filters. The texture is written out sample by sample with one decaying resonant burst per drop
from a seeded PRNG, so it is deterministic and testable; drops wrap past the end with a modulo
and the bed is cross-faded into itself, so it loops with nothing to click on. Density lives in
the buffer and brightness in a lowpass — past a few hundred drops a second the spectrum stops
moving, because the texture has become the impacts, and what keeps changing is peakiness. Wind is
three resonances swept at rates sharing no common factor, under a damped random walk for gusts.

The engine is a combustion pulse train through fixed resonators
([src/audio/engineVoice.ts](src/audio/engineVoice.ts)). A four-stroke's cycle is two crank
revolutions, so one oscillator running at `rpm / 120` puts harmonic *k* on engine order *k/2*
and the half-orders come free; the per-cylinder gain spread and firing asymmetry that make an
engine lumpy are periodic over that cycle and bake into the wave. Downstream is fixed and never
moves with rpm — peaking filters on each vehicle's exhaust modes, the Helmholtz drone peak, a
damping lowpass and a tailpipe highpass. Cycle-gated noise carries intake roar, valve tick and
the diesel knock band. Load is separate from rpm, so Chill and Focus differ in timbre.

The other layers are road hum, rain, wind and an outdoor room tone, plus thunder, the starter
crank and the horn — which is not a one-shot but a held note, and the only thing here with a
release as well as an attack. See [public/audio/README.md](public/audio/README.md) for the optional files.

## The radio

Clicking the radio opens a panel with three ways to fill the cabin.

**Spotify.** Four preset playlists, or paste a link to any song, album or playlist — full URLs,
`intl-` prefixes, `?si=` suffixes and bare `spotify:` URIs all work. `spotify.link` short links
are resolved where possible and explained where not. **Known limitation:** the embed plays
30-second previews for logged-out users; full playback needs OAuth and the Web Playback SDK,
which is out of scope. Its volume lives inside the player and cannot be reached from here.

**A live station**, from [Radio Browser](https://api.radio-browser.info/) — free, no key. One geo
query returns the stations near you and, through the countries they report, says which country
you are in; the national list fills out the band behind them. Stations that a browser cannot play
are filtered out before you ever hear the silence: http is blocked as mixed content, `.m3u8`
needs Media Source Extensions outside Safari, `.pls` and `.m3u` are text files listing streams.
Arrow keys or the chevrons move the dial, and the station is remembered.

Opening a stream takes as long as somebody else's server takes, so Listen has three states
rather than two: it says Tuning… with the ring turning until you can actually hear something,
and only then becomes Stop. "Hearing something" is the element's own `playing` event and not
`play()` resolving, which only means the request was accepted. Pressing it again during that
gives up on the stream, and a station that neither plays nor errors is abandoned at
`RADIO.CONNECT_TIMEOUT_MS` — a dial that spins forever is the failure the spinner exists to
prevent, not a smaller version of it.

**The Music slider**, which is the music bus, shared with the sound menu. Spotify and the tuner
cannot both play; starting one stops the other.

## Where the numbers live

Every tunable is in [src/core/constants.ts](src/core/constants.ts), grouped by system:

| Group | What it controls |
|---|---|
| `CAMERA` | View size, isometric angles, camera distance, parallax amounts |
| `WORLD` | Slab and road dimensions, scenery counts and treadmill field |
| `VEHICLES` (in `vehicles.ts`) | Everything per vehicle: dimensions, cabin, anchors, camera, shelter box, motion profile, engine voice, driver pose |
| `DRIVER` | Breathing, head lag, gesture cadence, posture |
| `MOTION` | Globals only: mode and ignition springs, reduced-motion scale, bump rate |
| `SPEED` | Focus cruising speed and its spring |
| `WEATHER` | Fallback location, timeouts, cache TTL |
| `WEATHER_FX` | Fog per kind, precipitation counts/shape, glass, lightning, headlights, streetlights, per-kind sky and light looks, the car exclusion box |
| `AUDIO` | Per-layer levels, the four bus levels, the duck factor, the rain and wind synths and the shape of the gun and the horn; per-vehicle gains and tones live on the spec |
| `RADIO` | Radio Browser endpoint, playable codecs, search radius, band size and the two timeouts |
| `INTERACTION`, `SPOTIFY` | Hover rate, push-in and swap-fade timing, zoom, preset playlists |
| `PALETTE` | Every colour |

## Layout

```
src/
  core/        store, loop, renderer, isoCamera, constants, persist, mode (the three modes
               and the rule for moving between them), vehicles (the three specs)
  scene/       stage (node hierarchy), lighting, driver/, world/ (the World interface, the
               road + scenery treadmill, the lot, and the face both stand behind)
    car/       the machinery that builds any vehicle: parts (Builder + materials), car,
               wheels, radio, exhaust; bodies/ has one file per vehicle
  motion/      engineRig (vibration model, driven by a per-vehicle profile), spring
  weather/     openMeteo, wmo (pure mapping), director, effects/
  interaction/ interactables registry, raycast, focusCamera
  audio/       mixer (four buses), layers, engineVoice (the pulse-train engine),
               rain (the generated texture), stations + tuner (live radio)
  ui/          overlay, curtain (the swap fade), menu (the More popovers), tooltip, hotkeys
               (every key binding, and the list the settings menu shows), modeToggle,
               vehiclePicker, weatherBadge, volume (mute, slider and the balance menu),
               settingsMenu, locationPicker, spotifyPanel, gunControl, hornControl, debugStats,
               rotatePrompt (a phone held upright), fullscreen (offered on a phone)
  util/        math, tests/
```

Scene node hierarchy (every system hangs off it; `carRoot` is never translated):

```
stageRoot
 ├─ slab            road, scenery (treadmill)
 ├─ carRoot         never translated: the world moves past the vehicle, not the other way
 │   ├─ bodyRig     engineRig writes y / pitch / roll here; body, radio, driverRoot
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

## Adding a vehicle

1. Write a body under [src/scene/car/bodies/](src/scene/car/bodies/) exporting one
   `build(b, m, v): BodyKit`. It gets the Builder, the vehicle's own material set and its spec,
   and hands back glass panes, the steering wheel node, the gauge and lamp setters, the exhaust
   tip and whatever hangs and swings.
2. Add a `VehicleSpec` in [src/core/vehicles.ts](src/core/vehicles.ts) and a `VehicleId` in
   `store.ts`. Everything else — camera framing, shelter box, motion, engine voice, driver pose,
   lighting, audio — is data on that spec.
3. Measure the vehicle honestly, then check what the camera can still see. A point in the cabin
   clears the near wall only when `y + z + wallZ > wallTopY`; `floorExposure()` turns that into
   the fraction of cabin floor on show. The hatchback is 0.31 and the roadster 0.42. Below
   `SEE_THROUGH_BELOW` the body is a box you cannot look into, `seeThrough(v)` returns true, and
   the build must leave out its two camera-facing walls — near (−z) and rear (−x) — exactly as
   every vehicle leaves out its roof. Leave the frame: rails, posts, pillars, a wheel arch over
   each wheel on that side, and anything that was only mounted on the panel goes with it.
4. Do not add a material key, a light or a material feature flag. The point-light count and the
   material set are fixed at boot; changing either recompiles every lit program on a swap.

## Swapping in real models later

Vehicles and the driver are code-built so the repo stays text-only. To replace any of them
with glTF:

- Keep the node names: `bodyRig`, `wheels` (with `wheel:frontNear` … children), `driverRoot`,
  and the driver chain `hips → torso → neck → head` plus `shoulderL/R`. The engine rig, idle
  system and interaction code only ever address these.
- Keep the hitbox proxies (`hitbox:radio`) and the steering wheel node (`steeringWheel`), which
  the driver's hands are parented to. The interactable id stays `radio` on every vehicle.
- Keep the cabin open — no roof panel — so the camera can see in, and keep that vehicle's
  `shelter` box on its spec enclosing the whole body including the roof volume. A body tall
  enough that `seeThrough()` is true needs its near and rear walls left out too, or the open
  roof alone will not be enough to see inside.

Nothing else needs to change.

## Design notes

- The camera sits on the rear-left quarter at true isometric angles and looks down into the
  open cabin over the near door. Window frames and header rails stay so the silhouette reads.
- The three vehicles are one toy line: lamps, glass, rubber and chrome are the same colours on
  all of them, and every body is measured to separate from the plinth it stands on. That is why
  the sports car is a deep yellow rather than a lemon, and the camper a dusty blue rather than
  cream — a warm neutral body cannot separate from a warm neutral slab at any lightness.
- The car never moves. In Focus the world moves past it on a treadmill: one damped speed value
  feeds road scroll, scenery, wheel spin, motion amplitudes and the audio mix.
- The missing roof is a viewing conceit, and on a tall body so are the two walls the camera
  looks through. What is left out is always a *panel*, never a slice: the frame stays, the way
  the hatchback keeps its window frames and header rails with no roof between them. The camper
  keeps its rails, posts, rear pillars and a wheel arch over each near wheel — which it needs,
  because a wheel's top stands above the cabin floor and without an arch it would rise into the
  room. Rain and snow are dropped by a ray/box test against the whole car including the roof
  volume, so nothing falls into the open cabin and the car reads as sheltered.

See [docs/PLAN-car-init.md](docs/PLAN-car-init.md) for the original implementation plan and
[docs/archive/](docs/archive/) for the version logs (`v0.1` cutaway, `v0.2` open roof, `v0.3`
three vehicles, `v0.4` full-height camper, `v0.5` controls and mix, `v0.6` park, horn and
keys, `v0.7` on a phone), and [docs/PLAN-cars.md](docs/PLAN-cars.md), [docs/PLAN-ui.md](docs/PLAN-ui.md) and
[docs/PLAN-park.md](docs/PLAN-park.md) for the plans v0.3, v0.5 and v0.6 followed.
