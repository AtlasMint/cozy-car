# PLAN.md — "Shotgun" (Virtual Cottage, but it's a car)

Implementation plan for Claude Code. Read this file top to bottom before writing any code.
Build phase by phase. Each phase ends at a **commit point** with acceptance criteria that must be
verifiable by opening the app in a browser.

---

## 0. Product summary

A single-page 3D ambient companion app. The view is a **fixed isometric shot of a cutaway car from
its rear-left quarter**, like a museum cross-section model rendered as a toy. The near side of the
body and the near half of the roof are sheared away; the viewer looks in over the boot and through
the open side at the back of the driver's seat, the back of a small stylised **driver figure**, the
steering wheel, and the radio in the centre console. The engine is running. The whole car bobs on
its springs. Weather outside matches the user's real local weather.

You are sitting behind them. That is the relationship the framing sets up, and it is worth stating
plainly because it should govern later judgement calls: this is a companion glimpsed from the back
seat, not a character facing the user.

The user watches. They do not drive. Two states:

| Mode | Car behaviour | Purpose |
|---|---|---|
| **Chill** | Parked. Engine idling, body trembling on its springs, wheels still, world static | Background ambience |
| **Focus** | Driving. Wheels spinning, road and scenery scrolling past, stronger suspension travel, exhaust haze trailing | Work / study companion |

Interaction is limited to clicking objects inside the cutaway. V1 ships with exactly one:
the **radio** in the centre console, which the camera pushes in on and which opens Spotify.

Two mental models that drive nearly every technical decision below:

1. **Doll's house.** The cutaway is a viewing conceit, not physical damage. The car is whole; we
   simply don't draw the near panels. Rain must not fall through the missing roof, the driver must
   not be rained on, and no light should leak in through the cut. Treat the cut plane as an
   invisible wall for everything except the camera.
2. **Treadmill.** The car never translates in world space. In Focus, the world moves past it — a
   rolling-road dynamometer in a workshop. This keeps precision, spawning and camera math trivial,
   and makes Chill/Focus differ by a single damped speed value rather than two code paths.

### Non-goals for v1
No multiplayer, no accounts, no backend, no pomodoro timer, no car customisation, no driving input,
no free camera orbit, no first-person view.

---

## 1. Tech stack and constraints

- **Runtime / package manager / bundler / dev server / test runner: Bun.** No Vite, no Webpack, no
  Jest. Use Bun's HTML entrypoint bundling for dev and `bun build` for production.
- **Rendering: three.js** (latest stable), WebGL2. No React, no react-three-fiber. Plain TypeScript
  modules and a small hand-rolled pub/sub store.
- **TypeScript**, `strict: true`. `bunx tsc --noEmit` must pass before every commit.
- **Zero backend.** Open-Meteo is called directly from the browser (CORS-enabled, no API key).
  Spotify is an embedded iframe. Nothing is stored server-side.
- **No 3D asset pipeline in v1.** Car, driver and scenery are built from three.js primitives in
  code — boxes, cylinders, spheres, capsules, `ExtrudeGeometry`, `LatheGeometry`. The whole repo
  stays text-only and diffable. Phase 10 documents the seam for swapping in glTF later.
- **Performance budget:** 60 fps on integrated graphics at 1440×900. < 150 draw calls,
  < 250k triangles. One shadow-casting light only (see §4).

### Dependencies (keep short; justify any addition in the commit message)
```
three
simplex-noise      # non-repeating engine and road vibration
```
Dev only: `typescript`, `@types/three`. Audio uses the native Web Audio API.

---

## 2. Directory structure

Create exactly this. Do not invent parallel folders.

```
/
├─ PLAN.md
├─ package.json
├─ tsconfig.json
├─ index.html                # single entrypoint, imports src/main.ts
├─ public/
│  └─ audio/                 # see §12 for expected filenames
└─ src/
   ├─ main.ts                # bootstrap: renderer, loop, wiring. Thin.
   ├─ core/
   │  ├─ store.ts            # app state + pub/sub
   │  ├─ loop.ts             # RAF loop, delta clamping, visibility pause
   │  ├─ renderer.ts         # WebGLRenderer, resize, tone mapping
   │  ├─ isoCamera.ts        # orthographic rig, framing, parallax, zoom tween
   │  └─ constants.ts        # ALL tunable numbers live here
   ├─ scene/
   │  ├─ stage.ts            # scene root, node hierarchy, fog, ground slab
   │  ├─ car/
   │  │  ├─ chassis.ts       # floorpan, sills, wheel arches, cut-edge faces
   │  │  ├─ shell.ts         # far-side body, roof half, glass, bonnet, boot
   │  │  ├─ interior.ts      # dash, seats, wheel, console, footwells
   │  │  ├─ wheels.ts        # 4 wheels + visible suspension travel
   │  │  ├─ radio.ts         # head unit, LCD, knobs (interactive)
   │  │  └─ dressing.ts      # mirror, air freshener, cup, rear-shelf clutter
   │  ├─ driver/
   │  │  ├─ figure.ts        # stylised body, built in code
   │  │  └─ idle.ts          # breathing, head bob, micro-gestures
   │  ├─ world/
   │  │  ├─ slab.ts          # the diorama base the car sits on
   │  │  ├─ road.ts          # scrolling road surface + markings
   │  │  ├─ scenery.ts       # instanced, pooled roadside objects
   │  │  └─ sky.ts           # gradient backdrop, sun/moon disc
   │  └─ lighting.ts         # rig driven by weather + day/night
   ├─ motion/
   │  ├─ engineRig.ts        # vibration model → body + wheel transforms
   │  └─ spring.ts           # critically damped spring helper
   ├─ weather/
   │  ├─ openMeteo.ts        # fetch + cache
   │  ├─ wmo.ts              # WMO code → WeatherKind (pure, unit tested)
   │  ├─ director.ts         # cross-fades effect intensities
   │  └─ effects/
   │     ├─ rain.ts  ├─ snow.ts  ├─ splash.ts
   │     ├─ glass.ts         # droplets on windshield + far windows
   │     └─ lightning.ts
   ├─ interaction/
   │  ├─ raycast.ts          # hover/click over the Interactable registry
   │  ├─ focusCamera.ts      # ortho push-in to an object and back
   │  └─ interactables.ts    # registry type + definitions
   ├─ audio/  ├─ mixer.ts  └─ layers.ts
   ├─ ui/
   │  ├─ overlay.ts  ├─ modeToggle.ts  ├─ weatherBadge.ts
   │  ├─ startScreen.ts      # "Start the engine" gesture gate
   │  └─ spotifyPanel.ts
   └─ util/
      ├─ math.ts             # lerp, damp, clamp, smoothstep, randRange
      └─ tests/              # *.test.ts for `bun test`
```

---

## 3. Shared contracts (write these first, in Phase 1)

`src/core/store.ts`

```ts
export type Mode = 'chill' | 'focus';
export type WeatherKind =
  | 'clear' | 'cloudy' | 'overcast' | 'fog'
  | 'drizzle' | 'rain' | 'heavyRain'
  | 'snow' | 'thunder';

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
  engineOn: boolean;              // false until the user's first gesture
  mode: Mode;
  weather: WeatherState | null;
  weatherStatus: 'idle' | 'loading' | 'ready' | 'error';
  focusedObject: string | null;   // Interactable id, e.g. 'radio'
  masterVolume: number;           // 0..1
  reducedMotion: boolean;
  quality: 'low' | 'high';
}

export interface Store {
  get(): Readonly<AppState>;
  set(patch: Partial<AppState>): void;
  subscribe<K extends keyof AppState>(key: K, fn: (v: AppState[K]) => void): () => void;
}
```

Rules:
- The store is the **only** cross-module channel. `scene/` never imports from `ui/` and vice versa.
- Subscribers fire only when a value actually changes (`Object.is`).
- No state in DOM attributes or three.js `userData` except object identity.

`src/core/loop.ts` exposes `onTick(fn: (dt: number, elapsed: number) => void)`, `dt` clamped to
`0.05s` so an alt-tab does not teleport the world.

`src/interaction/interactables.ts`

```ts
export interface Interactable {
  id: string;
  hitbox: THREE.Object3D;      // invisible oversized proxy, not the detail mesh
  label: string;               // hover label, e.g. "Radio"
  focus: {
    target: THREE.Vector3;     // world point to centre
    zoom: number;              // orthographic zoom multiplier, e.g. 3.2
    azimuthOffset?: number;    // small swing for a better read, radians
  };
  onFocus(): void;
  onBlur(): void;
}
```

---

## 4. Art direction (binding — do not substitute a generic look)

Reference feeling: **a die-cast toy car sliced in half and lit like a tabletop photograph, parked
at a lookout at dusk.** Warm cabin light spilling out of the cut, cool weather-driven light
everywhere else. The contrast between the lit interior pocket and the cool exterior is the whole
mood. Every lighting decision must preserve it.

- **Palette.** Car body `#7A9E9F` (a muted seafoam — a small, old, loved hatchback, not a
  supercar). Cut-edge faces `#F2E3C9` in flat unlit material: the sheared sections read as a
  deliberate diagram convention, like the pale core of a cut log. Interior `#2A211C` vinyl,
  `#6B5B4E` fabric, `#C9884A` dash backlight, `#E8D7B9` amber LCD. Tyres `#23201F`, never black.
- **Exterior colour is weather-driven,** not fixed. Clear day: warm horizon `#C6B49A` into
  `#7FA3B8`. Overcast: `#9AA2A6` flattening toward monochrome. Night: `#0D1620` with
  sodium-vapour `#FFAA5E` pools.
- **Materials.** `MeshStandardMaterial` throughout, roughness high (0.6–0.9), metalness at 0
  except trim. Glass is a lightly tinted transparent standard material, *not* `transmission` —
  from outside, transmission costs a render pass and buys almost nothing at this scale.
- **Tone mapping:** `ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`, exposure ~1.0 day
  / ~1.2 night.
- **Shadows:** exactly one `DirectionalLight` casts, with a tight ortho shadow frustum around the
  car only (roughly 8 × 8 m) and `mapSize` 1024. The road and scenery receive; distant scenery does
  not cast. A separate soft contact-shadow disc under each wheel sells the weight.
- **Depth of field is the toy-photography cue.** Do not add a full post-processing stack for it.
  Fake it: the backdrop and far scenery use slightly desaturated, lower-contrast materials and are
  hidden behind fog. If you later want real DOF, it goes in v2.
- **UI type:** one family. A humanist grotesque with real weight contrast (`Inter Tight` or
  `Source Sans 3`). The only other face in the project is a segment/mono face used **inside the
  radio LCD texture**, where it is diegetic. No all-caps overlay labels, no eyebrow labels, no
  `→` appended to buttons.
- **UI chrome is minimal and edge-anchored.** Bottom-left: weather badge. Bottom-right: mode
  toggle and volume. Nothing floats over the car. The diorama is the hero.
- **Motion:** the only non-user-triggered motion is the vehicle, the driver's idle, and the
  weather. No fade-up entrances on overlay elements beyond a single opacity transition at ignition.

---

## 5. Phase 0 — Scaffold

**Goal:** `bun dev` serves a canvas with a spinning reference cube at 60 fps.

1. `bun init`, `"type": "module"`. Scripts: `dev` (Bun hot-reloading HTML entrypoint — check
   `bun --version` and use the simplest form that works, noting which in a comment),
   `build` (`bun build ./index.html --outdir=dist --minify`), `typecheck`, `test`.
2. `tsconfig.json`: `strict`, `moduleResolution: "bundler"`, `types: ["bun-types"]`.
3. `index.html`: one `<canvas id="stage">`, one `<div id="overlay">`, module script.
   `margin: 0; overflow: hidden; touch-action: none;`
4. `core/renderer.ts`: antialias on, `setPixelRatio(Math.min(devicePixelRatio, 2))`, resize
   observer, tone mapping per §4, `shadowMap.enabled` with `PCFSoftShadowMap`.
5. `core/loop.ts`, `core/store.ts`, `util/math.ts` (`damp`, `lerp`, `clamp`, `smoothstep`).
6. `bun test` passes on a trivial `math.test.ts`.

**Acceptance:** cube spins, resize preserves framing, `tsc --noEmit` clean, no console errors.
**Commit:** `chore: bun + three scaffold`

---

## 6. Phase 1 — The isometric stage

**Goal:** a fixed, correctly framed isometric shot of a placeholder car-sized box on a slab.

`core/isoCamera.ts`:
- `OrthographicCamera`. Frustum derived from viewport aspect and a single `viewSize` constant
  (metres of world height visible), so resizing changes how much you see, never the projection
  angle. On narrow viewports increase `viewSize` slightly so the car still fits.
- **True isometric angles:** azimuth 45° from the car's long axis, elevation
  `atan(1/√2) ≈ 35.264°`. Place the camera at `(d, d·tan(35.264°)·√2, d)` and `lookAt` the car's
  centre of mass, roughly hip height of the driver, not the ground.
- **The camera sits on the car's rear-left quarter.** The car faces +X (its travel direction); the
  camera is behind and to the left of it, looking forward along the road. This is the framing the
  whole app is designed around, and it is chosen for what it reveals:
  - The **radio faceplate and the dashboard face rearward**, toward the occupants — and therefore
    toward this camera. From a front quarter they would be pointing away.
  - The **steering wheel** reads clearly against the lit windshield beyond it.
  - The viewer sees **the back of the driver's seat and the back of the driver's head and
    shoulders** — a companion you are sitting behind, not a face watching you. This is a warmer,
    less confrontational relationship, and it is why the figure's face barely matters (§8).
  - In Focus, **the road ahead runs away from the viewer toward the horizon**, so the sense of
    travel points into the screen rather than sliding across it.
  - The tail-lights and exhaust tip now face camera, which makes them the emissive hero at night
    and gives the exhaust puffs real presence.
- **Sightline check, do this before building anything else in Phase 2.** From the rear-left, the
  C-pillar, rear hatch glass and the near-side seat all sit between the camera and the console.
  Drop a box at the radio's position, verify it is unoccluded, and tune `CUT_PLANE_X` and the
  camera elevation until it is. If the far-half rear glass still clips the view, raise the
  elevation a few degrees rather than abandoning true isometric on the azimuth.
- **Parallax, not orbit.** Pointer position nudges the camera azimuth by ±3° and elevation by ±2°
  with heavy damping (`damp`, λ ≈ 3). It should read as the diorama breathing, not as a control.
  Disabled entirely under `reducedMotion`, and while an object is focused.
- Expose `frame(target: Vector3, zoom: number, ms: number)` returning a promise — Phase 9's radio
  push-in and the return to the default pose both go through this one function.

`scene/world/slab.ts`: the diorama base. A rounded rectangular plinth with visible thickness,
sitting in fog with nothing beyond it. The road runs along its long axis. This solves the
infinite-world problem honestly — the scene is explicitly a model on a shelf, so the world ending
at the slab edge is a design statement rather than a missing draw distance.

Because the camera looks forward over the car, the slab is **asymmetric**: roughly 8 m behind the
car and 30 m ahead of it, 14 m wide. The far end tapers and dissolves into fog at the same colour
as the backdrop, so the road appears to continue rather than stop. Most of the viewer's attention
in Focus mode lands on that forward stretch, so it gets the scenery density and the streetlight
rhythm; the short rear section only needs enough to look finished.

Node hierarchy (do not flatten; every later system hangs off it):

```
stageRoot
 ├─ slab                     (static)
 │   ├─ road                 (texture scrolls in Focus)
 │   └─ scenery              (instanced, pooled, moves in Focus)
 ├─ carRoot                  (static at origin, NEVER translated)
 │   ├─ bodyRig              (engineRig writes y / pitch / roll here)
 │   │   ├─ chassis  ├─ shell  ├─ interior  ├─ radio  ├─ dressing
 │   │   └─ driverRoot       (inherits body motion, adds its own idle)
 │   └─ wheels               (each wheel: own y offset + spin, NOT under bodyRig)
 └─ weatherRoot              (rain/snow volumes, splashes, lightning)
```

Wheels deliberately sit outside `bodyRig`: the body moves *relative to* the wheels, which is what
suspension travel looks like. If the wheels inherit the bounce, the car looks like it is hopping.

**Acceptance:** a box on a slab, framed identically at 16:9, 4:3 and a narrow window; parallax is
subtle enough that a first-time viewer does not realise the mouse is doing anything.
**Commit:** `feat: isometric camera rig and diorama slab`

---

## 7. Phase 2 — The cutaway car

**Goal:** a recognisable, charming, sliced hatchback. This is the hero asset; spend real effort.

Build from primitives, 40–70 meshes. Aim for a readable silhouette at diorama scale — the eye
completes details, so a suggested seat is better than a bad detailed one.

**The cut.** A single vertical longitudinal plane, offset ~0.25 m to the near side of the car's
centreline. Everything on the camera side of that plane is simply never built: near doors, near
sills above floor level, near half of the roof, near A/B/C pillar halves, near side glass.
Where a part is sheared, cap it with a flat face in the unlit `#F2E3C9` cut material (§4). Build
the caps as real geometry — do not use clipping planes, which leave hollow shells and cost you
control over the cut colour. Keep a `CUT_PLANE_X` constant that every part references, so the whole
cut can be moved with one number.

**The near-side (passenger) seat sits right on the cut plane, so section it too** — half a seat
with its foam and frame showing in the cut material. This is both a charming museum-diagram detail
and a practical necessity: an intact passenger seat would stand directly between the rear-left
camera and the console, hiding the radio. Anything else that lands on the plane (the near half of
the rear bench, the near sun visor) gets the same treatment rather than being deleted outright.

- `chassis.ts`: floorpan, transmission tunnel, sills, four wheel arches, front and rear bumpers,
  a suggested engine block visible under a slightly raised bonnet line (it is the thing that is
  running — let the viewer see it).
- `shell.ts`: far-side body panels, far doors with handles and a mirror, far half of the roof with
  a subtle crown, bonnet, boot, windshield and rear glass (tinted transparent), headlights as
  emissive discs. The **rear end faces the camera**, so it gets the detail budget the front would
  otherwise take: tail-light clusters with visible lenses, a number plate, a hatch seam, a badge,
  and a chrome exhaust tip. The front bumper and grille can be suggested with a few boxes.
- `interior.ts`: dashboard sweep with binnacle, two dial faces with emissive needles (live from
  Phase 4), steering wheel on the **right** (right-hand drive), centre console with gear lever and
  handbrake, the driver's bucket seat, the sectioned passenger seat, rear bench, footwells,
  headliner on the far half. The **driver's seat back is one of the three largest shapes in frame**
  — give it a headrest, a visible seam down the centre, and fabric that reads at this distance.
  The dials face rearward and are legible from the camera, so the tachometer needle in Phase 4 is
  genuinely visible rather than a detail nobody sees.
- `wheels.ts`: four wheels — tyre torus + a simple five-spoke hub. Each has an independent
  `springOffset` written by `engineRig`, and a `spin` rotation used in Focus.
- `dressing.ts`: rear-view mirror, an air freshener hanging from it (it will swing — the single
  most effective "the engine is running" tell in the entire scene), a coffee cup in the holder,
  a jacket on the rear bench, a sticker on the rear glass.

**Acceptance:** screenshot it and check against §4 — if it reads as a grey untextured mesh blob or
a generic three.js demo car, it has failed regardless of correctness. The cut faces must be
instantly legible as a diagram convention, not as a rendering bug.
**Commit:** `feat: cutaway car`

---

## 8. Phase 3 — The driver

**Goal:** someone is in there, and they are alive.

`scene/driver/figure.ts` — stylised, chunky, low-poly, built from capsules and spheres. Roughly
5.5 heads tall, slightly oversized head, a hoodie in a colour that pops against the seafoam body
(`#D4573F` or `#3E6B8A` — pick one and commit). Hands rest on the wheel at ten and two; the near
hand is visible through the cut.

**The camera is behind them, so the face is almost never in frame.** Do not spend effort on it —
two dark eye discs are enough for the rare moments a head turn brings it into view. Spend that
budget instead on the shapes that *are* always visible: the back of the head and hair silhouette,
the shoulders and the hood bunched at the neck, and the way the hoodie's colour sits against the
seat fabric. Those three shapes carry the entire character.

Skeleton is not a real skeleton — it is a shallow node chain, which is all this needs:
`driverRoot → hips → torso → neck → head` plus `shoulderL/R → forearmL/R → handL/R`. Hands are
parented to the wheel's node so they follow it rather than floating.

`scene/driver/idle.ts` — layered, all amplitude-scaled by `reducedMotion`:
- **Breathing:** torso scale-y ±1.5% and a small forward-back at ~0.22 Hz. Always on.
- **Counter-bob:** the head lags the body's vertical motion by ~90 ms and undershoots it by 35%,
  so the head damps the car's bounce the way a real neck does. This single detail is what makes
  the figure feel like a passenger rather than a decal glued to the seat.
- **Micro-gestures:** a weighted random picker fires one every 12–30 s. Every gesture must be
  legible **from behind**, which rules out blinks and expressions and rules in silhouette
  movement — a head turn toward the side window and back (briefly showing profile), a shoulder
  roll, a reach-and-sip from the coffee cup, a hand leaving the wheel to rest on the gear lever, a
  scratch at the back of the neck, a two-beat head nod in time with nothing in particular. Gestures
  never overlap; queue them.
- **Mode-reactive:** Chill posture is slumped back, head occasionally tilting toward the window.
  Focus posture straightens, both hands return to the wheel, head faces forward. Blend the pose
  over ~2 s using the same spring as the mode transition.

**Acceptance:** watch for 90 s without interacting. The figure should never appear frozen and never
appear twitchy. If any gesture reads as a glitch, cut it.
**Commit:** `feat: driver figure and idle behaviour`

---

## 9. Phase 4 — Ignition and engine idle

**Goal:** pressing "Start the engine" makes the car visibly come alive.

`motion/engineRig.ts` is a pure function of time and parameters, writing only to `bodyRig` and the
wheels' `springOffset`. Layer four independent bands like an equaliser rather than one big wobble:

| Band | Source | Chill | Focus | Frequency |
|---|---|---|---|---|
| Engine idle | two sines, 2nd harmonic at 0.5× | y ±0.006 m, roll ±0.25° | y ±0.004 m | 11 Hz + 22 Hz |
| Body sway | simplex noise | y ±0.008 m, pitch ±0.3° | y ±0.020 m, pitch ±0.9° | 0.3–0.8 Hz |
| Road noise | simplex noise | 0 | y ±0.025 m, roll ±0.7° | 2.5–4 Hz |
| Bumps | Poisson, λ ≈ 0.12/s | none | 0.05 m impulse into a spring, front wheels first, rear ~120 ms later | — |

Amplitudes are larger than they would be for an in-car view — seen from outside at diorama scale,
a 3 mm tremble is invisible. Tune by eye against the screenshot, then freeze the numbers.

Everything lives in `constants.ts` as one `MOTION` object. Mode changes blend the amplitude
multipliers through `motion/spring.ts` (critically damped, ω ≈ 2.2 rad/s) over ~2.5 s.

Also driven by the same rig:
- The air freshener swings on a damped pendulum forced by body acceleration.
- The exhaust tip emits a slow, sparse puff sprite (denser in cold weather, per §11).
- Tachometer needle: ~750 rpm with jitter in Chill; ~2200 rpm with a slow wander in Focus.

`prefers-reduced-motion: reduce` → scale all amplitudes to 0.25, disable bumps, keep breathing.
Expose a "Reduce motion" checkbox that toggles the same flag.

**Start gate** (`ui/startScreen.ts`): the app opens on a still, silent, engine-off diorama with one
control: **Start the engine**. The gesture is required to unlock Web Audio anyway, so make it
diegetic rather than apologetic. On click: crank sound, the body dips and rebounds once on its
springs, the exhaust coughs a single larger puff, dash lights and headlights fade up over 600 ms,
the tachometer needle sweeps and settles, the idle tremble springs in, the driver straightens
slightly.

**Acceptance:** with sound muted, engine-off versus engine-on is unmistakable. The body moves and
the wheels stay planted.
**Commit:** `feat: ignition and engine idle motion`

---

## 10. Phase 5 — Focus mode and the moving world

**Goal:** toggling Focus makes the world move past a stationary car.

Speed model: `targetSpeed = mode === 'focus' ? 22 : 0` m/s (≈ 80 km/h), damped by the same spring
as the motion blend, so everything accelerates and coasts together. One value feeds road scroll,
scenery velocity, wheel spin, motion amplitudes, audio pitch and wheel spray.

`scene/world/road.ts`:
- Road surface on the slab, scrolled by texture offset, never by moving geometry:
  `roadMat.map.offset.x -= speed * dt / TILE_LENGTH`. Generate asphalt + markings procedurally into
  a canvas at startup (speckled grey, dashed centre line, solid edges) so there is no binary asset.
  `RepeatWrapping`, `anisotropy = renderer.capabilities.getMaxAnisotropy()`.
- Wheel spin: `rotation.z -= speed * dt / WHEEL_RADIUS`. Wheels must visibly match road speed —
  mismatched spin reads as cheap instantly, so derive both from the same variable and never tune
  them independently.

`scene/world/scenery.ts` — the treadmill:
- 4–6 archetypes as `InstancedMesh`: streetlight, pine, low bush, guardrail segment, road sign,
  distant building block. 30–100 instances each.
- Each instance carries an `x`. Every frame `x -= speed * dt`. When `x < RECYCLE_BEHIND`, wrap to
  `x += FIELD_LENGTH` and randomise lateral offset, scale and rotation so repetition is unreadable.
- Instances fade out near the slab edges (vertex-colour alpha or a simple distance term) so nothing
  pops into existence at the boundary. With the camera behind the car, scenery **approaches from
  the fogged far end and sweeps past toward the viewer**, growing as it comes — the motion runs
  into the screen instead of across it. That means the far fade matters far more than the near one:
  an object appearing out of fog at 30 m is invisible, while one vanishing 3 m from the lens is
  obvious. Bias the fade curve accordingly, and let near objects simply exit the frustum.
- **This wrap math is pure and must be unit tested** (`scenery.test.ts`): given a start x, a speed
  and a dt sequence, positions stay inside the field and never gap.

Mode toggle UI (`ui/modeToggle.ts`): a two-state control labelled **Chill** / **Focus**. Keyboard
accessible, `aria-pressed`, visible focus ring, bound to `F`. The label names the state the user is
in, and those two words are used identically everywhere in the app.

**Acceptance:** switching ramps smoothly both directions; wheel spin visually matches the road;
watch the verge for 60 s with no visible repeat or pop; `bun test` covers the wrap math.
**Commit:** `feat: focus mode, scrolling road, pooled scenery`

---

## 11. Phase 6 — Weather data

**Goal:** real local conditions drive a `WeatherState` in the store.

`weather/openMeteo.ts`:
- Location via `navigator.geolocation.getCurrentPosition` with a 6 s timeout. On denial, timeout or
  error, fall back to `FALLBACK_LOCATION` in `constants.ts` (default Kuala Lumpur, 3.139, 101.687)
  and set `isFallbackLocation: true` so the badge can say so rather than silently lying.
- Request:
  ```
  https://api.open-meteo.com/v1/forecast
    ?latitude={lat}&longitude={lon}
    &current=temperature_2m,precipitation,weather_code,is_day,wind_speed_10m,cloud_cover
    &timezone=auto
  ```
- Cache in `localStorage` (`shotgun.weather.v1`, 10-minute TTL). Refresh every 15 minutes and on
  `visibilitychange` when stale.
- Never block first paint. The scene renders immediately at `weatherStatus: 'loading'` with a
  neutral overcast default; the real state cross-fades in.

`weather/wmo.ts` — pure, fully unit tested:

```
0            → clear
1,2          → cloudy
3            → overcast
45,48        → fog
51,53,55,56,57 → drizzle
61,63,80,81  → rain
65,66,67,82  → heavyRain
71,73,75,77,85,86 → snow
95,96,99     → thunder
default      → cloudy
```

Failure copy carries direction, not apology: "Weather unavailable — showing a clear evening", with
a retry affordance.

**Acceptance:** `bun test` covers every listed code plus an unknown one; with the network disabled
the app is still fully usable; the badge shows temperature, condition, location and fallback state.
**Commit:** `feat: open-meteo integration`

---

## 12. Phase 7 — Weather made visible

**Goal:** what the badge says is what you see around the car.

Each effect module exposes `mount(scene)`, `setIntensity(n: 0..1)`, `update(dt, speed)`,
`dispose()`. `weather/director.ts` subscribes to `weather` and cross-fades intensities over ~3 s so
conditions never pop.

**The doll's-house rule applies here more than anywhere.** Rain falls over the whole slab *except*
the car's footprint. Implement as a discard in the particle shader: if an instance's world position
is inside the car's bounding box (pass it as a uniform), skip it. The driver getting rained on
through a roof that is only missing for the viewer's benefit is the single most immersion-breaking
bug available in this project — build the exclusion in from the first commit of `rain.ts`, not as a
later fix.

- **Rain** (`rain.ts`): 3000–6000 instanced thin quads in a volume matching the slab. Motion is
  computed in the vertex shader from an instance seed and `uTime`, wrapping with `mod()`; the CPU
  does nothing per drop. Streaks shear along −X as speed rises — in Focus, rain visibly slants, and
  because that axis runs toward the camera, the slant reads as depth rather than as a sideways
  smear.
- **Splash** (`splash.ts`): tiny expanding ring sprites on the road surface, density tied to rain
  intensity. In Focus, add continuous wheel spray: two small cones of fast short-lived particles
  trailing each wheel. Spray is the clearest "it is raining *and* we are moving" signal, and the
  rear wheels throw theirs straight toward the camera, so this is the most valuable weather effect
  in the whole project for its cost. Build it before the glass droplets if time is short.
- **Glass** (`glass.ts`): a droplet shader on the windshield and far side glass — cellular-noise
  droplet placement, slow downward drift, occasional runnels. In Focus, droplets travel up and
  backward. Also drives **interior condensation**: when the outside temperature is well below a
  comfortable cabin temperature, or during rain, raise a soft fog term on the inner surface. This
  is the cosiest detail in the app; it makes the cabin read as warm and sealed against the outside.
- **Snow**: slower, larger, soft round sprites with lateral simplex drift and near-zero shear.
  At high intensity, tint the slab's shoulders and the car's far roof half toward white.
- **Fog**: `FogExp2`. Density per kind — clear `0.02`, cloudy `0.035`, rain `0.06`, heavyRain
  `0.08`, fog `0.14`, snow `0.07` (tuned for the small slab, not open world). Fog colour must
  exactly match the backdrop colour or the slab edge shows a seam.
- **Lightning** (`lightning.ts`): every 8–25 s, a two-frame ambient spike plus a random secondary
  flicker, then thunder delayed 1–6 s. `thunder` only.

`scene/lighting.ts`:
- Day: hemisphere fill plus one shadow-casting directional key, colour and intensity per `kind`
  (clear = warm and strong with crisp shadows; overcast = cool, flat, shadow strength near zero).
- Night (`isDay === false`): key drops near zero, the amber dash glow becomes the dominant light on
  the driver and the cut interior — a warm pocket in a cold scene, which is the whole point of the
  cutaway. Headlights throw two soft cones forward (additive cone meshes, not shadowed spotlights),
  tail-lights glow. In Focus, streetlights sweep past every ~35 m, washing across the roof and
  briefly lighting the driver's face. That sweep is the signature moment of night Focus mode — get
  its rhythm right.

**Acceptance:** force each `WeatherKind` via `#weather=thunder` and confirm each is distinct and
transitions cleanly; no rain inside the cabin at any intensity or speed; frame rate holds in the
worst case (night + heavyRain + Focus).
**Commit:** `feat: weather visuals and lighting director`

---

## 13. Phase 8 — Sound

`audio/mixer.ts`: one `AudioContext`, master gain, `resume()` on the start gesture, a
`duck(target, ms)` helper for when the radio panel opens. Volume persisted to `localStorage`.

Layers (`audio/layers.ts`), each a looping buffer with its own gain:

| Layer | File | Gain driver |
|---|---|---|
| engine | `engine-idle.ogg` | `engineOn`; `playbackRate` 1.0 chill → 1.35 focus, damped |
| roadNoise | `road-hum.ogg` | speed |
| rain | `rain-loop.ogg` | rain intensity |
| wind | `wind.ogg` | wind speed + mode |
| ambience | `outdoor-tone.ogg` | constant low bed, quieter at night |
| thunder | `thunder-*.ogg` | one-shots from `lightning.ts` |

Note the difference from an interior view: there is no "rain on the roof" layer, because the
listener is outside the car. The mix is an exterior perspective — engine and road forward in the
mix, cabin sounds distant.

Ship silent placeholder files plus `public/audio/README.md` listing required filenames, lengths and
a CC0 source suggestion. Wrap every `decodeAudioData` in try/catch that logs once and continues
muted, so a missing asset never breaks the app.

**Acceptance:** layers cross-fade smoothly on mode and weather change; nothing plays before the
gesture; muting the tab silences everything.
**Commit:** `feat: layered ambient audio`

---

## 14. Phase 9 — Interaction and the radio

**Goal:** click the radio → the camera pushes in → Spotify opens.

`interaction/raycast.ts`:
- Raycast on `pointermove`, throttled to ~20 Hz, against registered hitboxes only (invisible,
  slightly oversized boxes — cheaper and far more forgiving than the detail meshes).
- Hover: emissive lift on the target plus a small DOM label near the cursor; cursor `pointer`.
- Click: `store.set({ focusedObject: id })`.
- From the rear-left the radio faceplate is square-on to the camera, which makes it an easy target
  — but the ray still passes near the sectioned passenger seat and the B-pillar. Exclude glass and
  structure from the raycast layer entirely (`THREE.Layers`, not name checks) rather than relying
  on the geometry happening to miss.

`interaction/focusCamera.ts`:
- Orthographic push-in: tween `camera.zoom` from 1 to `focus.zoom` (~3.2) and slide the camera
  target to the interactable's point over ~900 ms, ease-out cubic, calling
  `updateProjectionMatrix()` each frame. The console already faces the camera from this angle, so
  little or no azimuth swing is needed — a straight push-in is cleaner, and `focus.azimuthOffset`
  can stay at 0 for the radio.
- While focused: parallax disabled, engine amplitudes scaled to 0.4 (a car shakes; a UI you are
  reading should not), audio ducked to 0.35.
- Exit on `Escape`, on clicking outside the panel, or via a **Back to the car** button. Reverse the
  tween and restore everything.

`scene/car/radio.ts`: a head unit in the centre console — faceplate, amber LCD on its own
`CanvasTexture`, volume and tuning knobs, six preset buttons. When idle, the LCD shows the time and
the outside temperature, so the radio reads as functional before anyone clicks it.

`ui/spotifyPanel.ts`:
- On focus, fade in an HTML panel anchored over the radio's screen-space projection, containing
  `<iframe src="https://open.spotify.com/embed/playlist/{id}?utm_source=generator">` with
  `allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"`.
- Three or four built-in playlist IDs mapped to the radio's physical preset buttons, plus an input
  for pasting any Spotify URL (parse to `type` and `id`, rebuild the embed `src`). Persist the last
  URI in `localStorage`.
- Include an "Ambience" volume slider inside the panel so the music and the scene can be balanced.
- **Known limitation — state it plainly in the panel's empty state and the README:** the Spotify
  embed plays 30-second previews for logged-out users; logged-in Premium users get full tracks.
  Full playback needs OAuth plus the Web Playback SDK, which is out of scope for v1. Do not attempt
  a workaround.

Register only `radio` in `interactables.ts`. The registry pattern itself proves the extension seam;
do not add "coming soon" stubs.

**Acceptance:** hover highlight works at every screen edge; push-in is reversible with no drift
after 20 cycles; `Escape` always exits even after the iframe has been clicked (test this
specifically — iframe focus stealing is the likely failure).
**Commit:** `feat: interactable registry, radio push-in, spotify panel`

---

## 15. Phase 10 — Polish, performance, handover

1. **Performance pass.** Hidden stats panel behind `#debug` (fps, draw calls, triangles, programs).
   Tune instance counts and particle density until the worst case holds 60 fps on integrated
   graphics. Derive `quality` from a 3-second startup frame-time probe; let the user override it.
2. **Visibility handling.** Pause the RAF loop and suspend the AudioContext on `document.hidden`;
   on return, clamp `dt` and resume without a lurch.
3. **Persistence.** `mode`, `masterVolume`, `reducedMotion`, `quality`, last Spotify URI, under one
   namespaced `localStorage` key.
4. **Accessibility floor.** All overlay controls keyboard-reachable with visible focus rings;
   `prefers-reduced-motion` honoured throughout; the weather badge at AA contrast against both the
   brightest and darkest scenes.
5. **Mobile.** Vertical overlay layout, larger `viewSize` so the car still fits, tap to interact,
   DPR cap 2, automatic `quality: 'low'`, parallax driven by device orientation or disabled. It
   need not be beautiful on a phone; it must not break.
6. **`README.md`:** what it is, `bun dev` / `bun build`, the audio checklist, the Spotify preview
   limitation, a tour of `constants.ts`, and a "how to add an interactable" guide.
7. **Seam for real models.** Document replacing the code-built car or driver with glTF: keep the
   node names (`bodyRig`, `wheels`, `driverRoot`, `hips/torso/neck/head`), keep the hitbox proxies,
   keep `CUT_PLANE_X` — nothing else changes.

**Commit:** `chore: polish, perf, docs`

---

## 16. Working agreements for Claude Code

- **One phase per session where possible.** `bunx tsc --noEmit` and `bun test` must pass before
  each commit. Do not start a later phase while an earlier acceptance criterion is unmet.
- **All tunables in `core/constants.ts`,** grouped as `MOTION`, `WORLD`, `WEATHER`, `CAMERA`,
  `AUDIO`, `CAR`. A bare number inside a scene or motion file is a bug.
- **Pure logic is unit tested:** WMO mapping, scenery wrapping, spring integration, the speed
  model, the rain-exclusion box test. Rendering code is not unit tested.
- **No new dependencies** without a commit-message note explaining why three.js or the stdlib
  wasn't enough.
- **Dispose properly.** Any module creating geometries, materials or textures implements
  `dispose()`, and it is actually called on hot reload.
- **Screenshot and critique after every visual phase, against §4, before committing.** The failure
  mode for this project is not broken code — it is a technically correct scene that looks like a
  default three.js demo. If a screenshot looks like that, the phase is not done.

## 17. Deferred to v2 (do not build now, do not architect them out)

Glovebox that opens into a note or task list · wipers driven by rain intensity · a passenger figure
· seasonal and time-of-day scenery sets · a pomodoro tied to Focus with the engine cutting out at
session end · rotating the diorama with a drag · swapping the driver's outfit · a second cutaway
angle · real depth of field · the fuel gauge as a session-length indicator.
