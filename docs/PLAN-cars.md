# PLAN-cars.md — three vehicles

Implementation plan for the v0.3 feature: the user chooses between three vehicles. Read this
file top to bottom before writing any code. Build phase by phase. Each phase ends at a
**commit point** with acceptance criteria that must be verifiable by opening the app in a
browser, and each phase states what the user has if work stops there.

This supersedes [PLAN-car-init.md](PLAN-car-init.md) §0's single-vehicle framing and its
"no car customisation" non-goal. Everything else in that document still binds, especially §4
(art direction) and §16 (working agreements), both amended in §17 below.

---

## 0. Product summary

Shotgun is a diorama of one vehicle idling in your weather, watched from the rear-left
quarter. v0.3 makes the vehicle a **choice of three**, and the choice is a choice of mood,
not a configuration screen:

| Vehicle | What it is | The mood it sells |
|---|---|---|
| **Hatchback** | The small seafoam car that already exists, unchanged | The default. Somebody's first car, parked at a lookout |
| **Camper van** | A high-top van with a lived-in back: dinette, tiny kitchen, curtains | Being somewhere, not going somewhere. The van has stopped for the night |
| **Sports car** | A cheap, loved 1970s yellow roadster — not a supercar | Being about to go. Small, loud, open to the sky |

One driver, one road, one weather. Only the vehicle changes, and with it the shake, the
engine note, the cruising speed, the framing and what there is to look at inside. Three
vehicles from one toy line, three positions on the same shelf.

Switching is a small, deliberate act: pick from a three-way control at the bottom right, the
camera slides to the new framing, the vehicle is exchanged mid-move, and the new one settles
onto its springs. About a second, end to end.

### The rules that still hold

1. **The roof is the only thing missing.** Every vehicle is whole except its roof, exactly as
   v0.2 established. No cutaways, no sheared walls, no cut-material caps. When an interior
   reads poorly from above, the fix is the vehicle's own proportions — a lower wall line, a
   wider door — never a slice.
2. **Treadmill.** `carRoot` is never translated. The world moves past the vehicle. This is
   what makes every world coordinate in the app valid and it is why the swap cannot be a
   drive-off.
3. **Doll's house.** Rain and snow never fall into a cabin. The exclusion box becomes
   per-vehicle; the ray test that implements it does not change.

### Non-goals for v0.3

No fourth vehicle. No customising a chosen vehicle (colour, wheels, stickers). No
vehicle-specific interactables beyond the radio. No second occupant. Exactly **four wheel
nodes on every vehicle** — no six-wheel rigs, no per-axle wheel radius. **One vehicle visible
at a time**, so the performance budget is per vehicle, not for the set. One driver figure and
one outfit for all three.

---

## 1. Constraints

Everything in PLAN-car-init.md §1 still applies: Bun, three.js, TypeScript `strict`, no
backend, no 3D asset pipeline, no new dependencies.

Added for three vehicles:

- **Per-vehicle budget: 100 draw calls and 90k triangles.** Today's hatchback measures 96
  calls and 56k triangles. `renderer.info.render.calls` **counts the shadow pass**, so every
  merged material bucket costs two calls — a ten-material body is twenty calls, not ten.
  Budget accordingly and enforce it with a test (§13).
- **Nothing in a VehicleSpec may change program-affecting state.** Light counts, material
  feature flags (`map`, `emissiveMap`, `transparent`, `vertexColors`, `flatShading`) and
  shader defines must be identical across all three vehicles, or every swap recompiles every
  lit material in the scene. This is a hard rule, not a preference — see §17.
- **One vehicle is built at a time**, but a built vehicle is **kept**, hidden, for the rest of
  the session. Building is a swap-time cost paid once per vehicle.
- The hatchback's numbers move into a spec **verbatim**. Any visual difference after the
  extraction phases is a bug, and the screenshots prove it.

---

## 2. Directory delta

Only the delta from today's tree. Do not invent parallel folders.

```
src/
 ├─ core/
 │   ├─ vehicles.ts          NEW — VehicleSpec type + the three specs + VEHICLES registry
 │   ├─ constants.ts         CAR block retires into vehicles.ts; globals stay
 │   ├─ store.ts             + VehicleId, + AppState.vehicle
 │   └─ persist.ts           + vehicle (four coordinated edits)
 ├─ scene/
 │   ├─ car/                 stays put — it is the machinery, not one car
 │   │   ├─ parts.ts         mats singleton → createMaterials(spec)
 │   │   ├─ car.ts           createCar → createVehicle(stage, spec)
 │   │   ├─ chassis.ts       hatchback body, unchanged behaviour
 │   │   ├─ shell.ts         ⟂
 │   │   ├─ interior.ts      ⟂
 │   │   ├─ bodies/          NEW — one file per body kit
 │   │   │   ├─ hatchback.ts   re-exports today's chassis/shell/interior as one BodyKit
 │   │   │   ├─ van.ts         NEW
 │   │   │   └─ sports.ts      NEW
 │   │   └─ …                radio.ts, wheels.ts, dressing.ts, exhaust.ts stay shared
 │   └─ driver/              figure.ts + idle.ts take a pose block
 └─ ui/
     └─ vehiclePicker.ts     NEW — mirrors modeToggle.ts
```

`src/scene/car/` is **not** renamed. It holds the machinery that builds any vehicle; renaming
it is a large diff with no behaviour change and it would move the README layout block for
nothing.

---

## 3. Shared contracts (write these first, in Phase 2)

`src/core/store.ts` — `VehicleId` lives here, beside `Mode`. `store.ts` imports nothing, so
there is no cycle.

```ts
export type VehicleId = 'hatchback' | 'van' | 'sports';

export interface AppState {
  // …existing fields…
  vehicle: VehicleId;
}
```

`src/core/vehicles.ts`:

```ts
type Vec3 = readonly [number, number, number];   // every consumer spreads these into
                                                 // new THREE.Vector3(...x) — number[] breaks strict

export interface VehicleSpec {
  id: VehicleId;
  label: string;                       // picker button text

  paint: {                             // replaces the single PALETTE.BODY
    body: string; trim: string; hub: string; stripe: string | null;
    vinyl: string; fabric: string; fabricDark: string;
  };

  dims: {
    length: number; width: number;     // true extents, load-bearing (see Phase 0)
    wallZ: number; wallThickness: number;
    floorY: number; floorTopY: number; sillY: number; beltY: number; wallTopY: number;
    wheelbase: number; track: number;
    wheelRadius: number; wheelWidth: number; rearWidthScale: number;
    archRadius: number; spokes: number;
    contactShadow: readonly [number, number];
  };

  cabin: {
    driverZ: number; passengerZ: number; seatWidth: number;
    wheelCentre: Vec3; wheelNormal: Vec3; steeringRadius: number;
  };

  anchors: {
    radioFace: Vec3; radioHitbox: Vec3; radioFocusOffset: Vec3;
    exhaustTip: Vec3; swingPivot: Vec3; swingLength: number;
    headlight: { x: number; y: number; z: number };
    cabinLight: Vec3; cabinDistance: number;
    livingLight: Vec3 | null; livingDistance: number;   // null ⇒ intensity 0, light still exists
    dashLight: Vec3; dashDistance: number;
    pool: { w: number; d: number; x: number };
    shadowOrtho: number; shadowRadius: number; shadowNormalBias: number;
  };

  camera: { viewSize: number; minViewWidth: number; target: Vec3; radioZoom: number };

  shelter: { min: Vec3; max: Vec3 };   // the rain/snow/splash exclusion AABB

  motion: MotionProfile;               // every MOTION field the rig reads (see §5)
  gauges: { rpmFull: number; kmhFull: number };
  speed: { focus: number };
  audio: EngineProfile;
  pose: DriverPose;

  build(b: Builder, m: CarMaterials, spec: VehicleSpec): BodyKit;
}

export interface BodyKit {
  panes: GlassPane[];                  // glass, added via b.dyn
  setLights(head: number, tail: number): void;
  wheelNode: THREE.Group;              // steering wheel; the driver's grips parent to it
  setTacho(rpm: number): void;
  setSpeedo(kmh: number): void;
  setDashGlow(k: number): void;
}

export const VEHICLES: Record<VehicleId, VehicleSpec>;
```

Rules:

- **A number that another system reads lives on the spec.** A number that only draws the body
  stays a literal inside that body's file. Dimensions, anchors, camera, shelter, motion,
  audio and pose are read by other systems; the height of a kitchen worktop is not.
- **The spec is data.** `build()` is the only function on it, and it may not reach into the
  scene graph, the store or the renderer.
- Node names are a published contract (README "Swapping in real models later") and are
  **identical across all three vehicles**: `bodyRig`, `wheels` with children
  `wheel:frontNear` / `frontFar` / `rearNear` / `rearFar`, `driverRoot`, `hips → torso → neck
  → head`, `shoulderL/R`, `steeringWheel`, `hitbox:radio`, and merged meshes named
  `car:<materialKey>`. A spec-driven axle loop must produce exactly those four wheel names.

New setters, all of which are position or uniform writes — **none recompiles a shader**:

```ts
// weather/effects/{rain,snow,splash}.ts — uCarMin/uCarMax are already live Vector3 uniforms
setShelter(min: THREE.Vector3, max: THREE.Vector3): void;
// weather/effects/splash.ts — uEmitters is a fixed vec3[4]
setEmitters(positions: THREE.Vector3[]): void;
// weather/effects/glass.ts — unparent old overlays, build new ones on the new panes,
// REUSING the shared material and preserving uDrops/uCondense/uDrift/uTime.
// Mutate the existing array in place; visible() closes over it.
rebind(panes: GlassPane[]): void;
// weather/director.ts — rebinds the above, keeps the smoothed `cur` block and subscriptions
setVehicle(spec: VehicleSpec, car: Vehicle): void;
// core/isoCamera.ts — updates `home` too, so Escape from the radio returns to the NEW pose
setFraming(f: { target: THREE.Vector3; viewSize: number; minViewWidth: number }): void;
// scene/lighting.ts — moves lights, resizes the shadow frustum, then
// key.shadow.camera.updateProjectionMatrix()   ← silently a no-op without this
setVehicle(spec: VehicleSpec): void;
// audio/layers.ts — MUST be called before store.set({ engineOn: true }) or the new car
// cranks with the old car's starter
setEngineProfile(p: EngineProfile): void;
// interaction/raycast.ts — clears the hover latch across a swap
clearHover(): void;
// scene/car/parts.ts — replaces the module-level `mats` const and disposeMaterials()
createMaterials(spec: VehicleSpec): CarMaterials;   // carries its own dispose()
```

---

## 4. Art direction for the trio (binding)

PLAN-car-init.md §4 still binds in full: one shadow-casting light, high roughness, no
post-processing stack, one UI type family, edge-anchored chrome, nothing floating over the
vehicle.

Added, and equally binding:

- **They are one toy line.** Three models a child could line up on a shelf, made by the same
  factory in the same decade. Lamps, glass, rubber and chrome are the **same colours on all
  three** — that shared hardware is what makes them a set rather than three unrelated models.
- **Every body separates from the plinth.** The slab top is `#C9BFAE`, a warm light neutral,
  and the road markings are near-white. A body that lands in the slab's hue family at similar
  luminance dissolves into the shelf it stands on. Measured targets: at least **1.6:1**
  luminance against `SLAB_TOP` and a hue at least 30° away from it. This is why the van is
  not cream and the sports car is not lemon.
- **The trio's value spread**: seafoam mid (Yrel 0.31), van pale-cool (0.50), sports
  warm-saturated (0.30). Two cool, one warm; two mid, one pale.
- **Each vehicle names its own hero shapes.** §7 named the hatchback's: the driver's seat
  back, the roof half, the rear end. State them per vehicle and give them the detail budget:
  - **Van** — the long near flank, the open wall-top rail, the dinette table with the light
    over it.
  - **Sports** — the rear deck, the roll hoop, the front wing arches.
- **The wall top is the silhouette.** With no roof, the line where the body stops is the most
  visible edge each vehicle has. Break it deliberately: the van steps down over the rear
  third and props one vent lid; the sports car's hoop is the only thing above the belt.
- **Nothing is a supercar.** These are ordinary, loved objects at diorama scale. The sports
  car is a cheap roadster with a mismatched mirror, not a wedge.

**Acceptance for the whole feature:** screenshot all three in the same frame state, side by
side, and confirm they read as one toy line. This is the gate on the release, not a
per-vehicle check done in isolation.

---

## 5. The numbers

One table per system, all three vehicles, one place. The hatchback column is **today's value,
verbatim** — that is the regression proof for Phases 0–5.

Values marked ✎ are derived from a rule and must be **verified by screenshot** in their phase,
then frozen, exactly as PLAN-car-init.md §9 did for the motion amplitudes.

### Dimensions

| | Hatchback | Van | Sports |
|---|---|---|---|
| `length` × `width` | 3.84 × 1.68 | 5.60 × 2.10 | 3.56 × 1.86 |
| `wallZ` / `wallThickness` | 0.79 / 0.05 | 1.00 / 0.05 | 0.88 / 0.05 |
| `floorTopY` | 0.32 | 0.56 | 0.20 |
| `sillY` / `beltY` | 0.46 / 1.00 | 0.80 / 1.30 | 0.50 / 0.95 |
| `wallTopY` | 1.42 | 1.95 | 1.22 (roll hoop) |
| `wheelbase` / `track` | 2.40 / 1.38 | 3.20 / 1.62 | 2.30 / 1.56 |
| `wheelRadius` / `wheelWidth` | 0.29 / 0.18 | 0.36 / 0.22 | 0.32 / 0.24 |
| `rearWidthScale` | 1.0 | 1.25 (twin look) | 1.25 (staggered) |
| `archRadius` / `spokes` | 0.35 / 5 | 0.46 / steel disc | 0.37 / 7 |
| `contactShadow` | 0.80 × 0.50 | 1.00 × 0.62 | 0.88 × 0.66 |

**How `wallTopY` was chosen, and why it is the most important number in this document.** A
point inside the cabin is visible past the near wall iff `y + z + wallZ > wallTopY`. For the
hatchback that is `0.32 + z + 0.79 > 1.42`, so the visible floor runs from z = 0.31 to 0.79 —
**30% of the cabin floor**. A van with a realistic 2.4 m wall shows 19%, which is the
open-shoebox failure: a big box you cannot see into. Solving for parity at `floorTopY` 0.56
and `wallZ` 1.00 gives `wallTopY` 1.95 and 30.5% exposure. The van is therefore a high-top
**van**, not a coachbuilt box — and it needs no shear to be readable, which is what keeps
v0.2's "no cutouts" rule intact. Apply the same solve to any future vehicle.

### Camera

`radioZoom = 3.2 × viewSize / 5.2`, so the push-in frames the same world height on every
vehicle. One rule, three values.

| | Hatchback | Van | Sports |
|---|---|---|---|
| `viewSize` ✎ | 5.2 | 7.0 | 4.9 |
| `minViewWidth` ✎ | 5.4 | 7.6 | 5.25 |
| `target` ✎ | [−0.50, 0.55, −0.75] | [−0.45, 0.95, −0.90] | [−0.42, 0.46, −0.72] |
| `radioZoom` | 3.2 | 4.3 | 3.0 |

`viewSize` starts from `0.7071 × (length + width) × sin(35.264°) + wallTopY × cos(35.264°)`
scaled against the hatchback's, which reproduces the hatchback's 5.2 and the sports car's 4.9
exactly. The van's formula value is 7.3; 7.0 is chosen for a deliberately fuller frame. Verify
by screenshot that every vehicle keeps roughly the hatchback's **+0.25 m top margin** and
**~1.5 m bottom void**, and adjust `target.y` to hit the top margin. `CAMERA.ELEVATION`,
`AZIMUTH`, `DISTANCE`, `NEAR`, `FAR` and all `PARALLAX_*` stay global and never move.

### Motion

`MotionProfile` replaces the global `MOTION` amplitudes. `MODE_OMEGA`, `ENGINE_OMEGA`,
`REDUCED_SCALE`, `FOCUSED_OBJECT_SCALE`, `IGNITION_LIGHTS_LAMBDA` and `BUMP.rate` stay global.

| | Hatchback | Van | Sports |
|---|---|---|---|
| `idleHz` | 11 | 8 | 14 |
| `idle.chill` y / roll° | 0.006 / 0.25 | 0.011 / 0.40 | 0.004 / 0.16 |
| `sway` hz, focus y / pitch° | 0.5, 0.020 / 0.9 | 0.34, 0.030 / 1.10 | 0.75, 0.012 / 0.55 |
| `road` hz, y / roll° | 3.2, 0.025 / 0.7 | 2.3, 0.038 / 0.85 | 4.4, 0.016 / 0.45 |
| `roadFullAt` | 15 | 13 | 17 |
| `bump` impulse / omega | 0.05 / 16 | 0.078 / 11 | 0.032 / 22 |
| `bump.rearDelay` | 0.109 | 0.168 | 0.096 |
| `bodySpringOmega` | 9 | 5.5 | 13 |
| `ignitionKick` | −0.55 | −0.85 | −0.42 |
| `wheelToBody` / `wheelToPitch` | 0.55 / 0.35 | 0.48 / 0.30 | 0.72 / 0.22 |
| `rpm` idle / cruise / peak | 750 / 2200 / 6500 | 620 / 1850 / 4200 | 980 / 3400 / 6800 |
| `rpm` sweepMs | 1200 | 1600 | 900 |
| `gauges` rpmFull / kmhFull | 8000 / 180 | 4500 / 140 | 7000 / 160 |
| `speed.focus` (m/s) | 22 | 19 | 24 |
| swing pivot / length | mirror, 0.17 | mobile, 0.26 | keyring, 0.09 |

`rearDelay = wheelbase / speed.focus` — a derived quantity frozen as a constant, so it is
wrong by default on any new wheelbase. Unit-test the identity (§13). The hatchback's 0.12
becomes 0.109, which is the correct value it was rounded from; note the change in the commit.

Amplitudes are judged **on screen**, not in metres: the van lives in a 7.0 m frame instead of
5.2, so a given metre subtends 26% fewer pixels and its amplitudes are scaled up accordingly.
Pitch is a rotation and is not diminished by the wider frame, but the van is 1.5× longer, so
the same angle moves its nose 1.5× further — which is why `wheelToPitch` goes *down*.

### Audio

The synthesized fallback in `layers.ts` is the honest baseline — `engine-idle-van.ogg` and
`engine-idle-sports.ogg` are added to `public/audio/README.md` as optional files, and a
missing one falls back to that vehicle's synth profile, not the hatchback's.

| | Hatchback | Van | Sports |
|---|---|---|---|
| cylinders → firing Hz at idle | 4 → 25.0 | 4 → 20.7 | 4 → 32.7 |
| detune | 1.007 | 1.016 | 1.012 |
| lowpass base / per-rate | 180 / 480 | 120 / 300 | 300 / 820 |
| sub / mix gain | 0.50 / 0.35 | 0.80 / 0.42 | 0.32 / 0.40 |
| `focusRate` | 1.35 | 1.18 | 1.55 |
| gain engine / road / wind | 1.00 / 1.00 / 1.00 | 1.22 / 1.14 / 1.10 | 1.16 / 1.10 / **1.45** |
| crank from → to Hz / ms | 28 → 62 / 700 | 18 → 44 / 1150 | 34 → 80 / 520 |

The sports car's **wind** gain is the single change that will make Focus feel different: an
open car at 86 km/h is mostly wind. The van's crank is the cheapest "different vehicle" tell
in the app — it is the first thing heard after a switch.

### Lighting

Three cabin-area point lights (`living`, `cabin`, `dash`) are allocated **unconditionally at
boot** and vehicles that need two set the third to intensity 0. Changing the light count
changes `NUM_POINT_LIGHTS` and invalidates the program cache for every lit material in the
scene — road, slab, scenery, driver and all three bodies would recompile on every swap.

| | Hatchback | Van | Sports |
|---|---|---|---|
| `cabinLight` / distance | (0.15, 1.15, 0.15) / 3.5 | (1.55, 1.55, 0.10) / 2.8 | (0.05, 0.92, 0.12) / 2.6 |
| `livingLight` / distance | *off* | (−1.20, 1.78, 0.10) / 4.5 | *off* |
| `dashLight` / distance | (0.50, 0.92, 0.10) / 1.6 | (1.95, 1.22, 0.10) / 1.8 | (0.42, 0.72, 0.10) / 1.3 |
| `headlight` x, y, z | 1.92, 0.72, ±0.56 | 2.72, 0.86, ±0.74 | 1.70, 0.56, ±0.50 |
| cone length / radius | 4.5 / 0.7 | 5.2 / 0.85 | 4.2 / 0.60 |
| pool w × d @ x | 7.5 × 3.6 @ 5.52 | 8.6 × 4.4 @ 6.8 | 7.0 × 3.4 @ 5.2 |
| `shadowOrtho` / radius / normalBias | 4.5 / 3 / 0.02 | 5.4 / 2 / 0.03 | 4.6 / 3 / 0.02 |

`SHADOW_MAP_HIGH` stays global at 1024. Widening the frustum is free on render cost; it only
trades texel density (8.8 mm at ±4.5 to 10.6 mm at ±5.4), which the van's `radius` and
`normalBias` compensate for. If the van's shadow still reads mushy after the screenshot pass,
raising its map to 2048 is a one-line change — do it only with a measurement.

### Shelter box

Derived the same way for every vehicle: `halfLength + 0.06`, `wallTopY + 0.04`, and
`widest body skin + 0.02`. That formula reproduces the hatchback's shipped
`[−1.98, 0, −0.86] → [1.98, 1.46, 0.86]` exactly, which is the proof it is the right rule.

| | Hatchback | Van | Sports |
|---|---|---|---|
| `min` | [−1.98, 0, −0.86] | [−2.86, 0, −1.07] | [−1.84, 0, −1.01] |
| `max` | [1.98, 1.46, 0.86] | [2.86, 1.99, 1.07] | [1.84, 1.26, 1.01] |

The sports car's lateral figure comes from its arch flares at ±0.99, not its wall, because the
flares are its widest built geometry.

`shelteredByBox` (the view-ray slab test in `instanced.ts`) is used **unchanged for all
three**. No `shelterMode`, no shader branch, no recompile. Sheltered particles are killed in
the *vertex* shader, so a bigger box removes fragment work — the van is a fill win.

Door mirrors sit outside the box on every vehicle (the hatchback's reach ±0.97 against a box
at ±0.86), so a drop can render over a mirror. That is how it ships today and it is invisible
at this scale; widening the box to cover mirrors is §19 work, not part of this feature.

### Driver pose

One figure, one outfit, three poses. `DriverPose` holds every literal that is currently baked
into `figure.ts`.

| | Hatchback | Van | Sports |
|---|---|---|---|
| `hips` | [0.16, 0.60, 0.38] | [1.55, 1.10, 0.42] | [0.10, 0.40, 0.40] |
| `torsoLean` (rad) | 0.15 | 0.06 | 0.34 |
| `knee` / `foot` | [0.52, 0.64] / [0.70, 0.42] | [1.95, 1.14] / [2.20, 0.78] | [0.62, 0.44] / [0.95, 0.28] |
| `legSplay` | 0.09 | 0.11 | 0.085 |
| `gripAngles` (deg) | 120 / 60 | 125 / 55 | 118 / 62 |
| `headTurnYaw` | −0.85 | −0.70 | −0.95 |
| `slumpScale` | 1.0 | 0.8 | 0.55 |
| `cup` | [0.14, 0.60, −0.08] | [1.38, 1.06, −0.14] | [0.10, 0.44, −0.10] |
| `gearKnob` | [0.30, 0.66, 0] | null ⇒ drop the gesture | [0.26, 0.50, 0] |
| `wheelCentre` / `steeringRadius` | [0.40, 0.94, 0.38] / 0.17 | [1.80, 1.52, 0.42] / 0.21 | [0.42, 0.78, 0.40] / 0.15 |
| `wheelNormal` | [−0.928, 0.371, 0] | [−0.707, 0.707, 0] | [−0.966, 0.259, 0] |

`gearKnob: null` drops `handToGear` from the weighted gesture pool rather than reaching at
thin air. The van's near-flat steering wheel (45°) is the van driving position; the sports
car's is nearly upright. Check the arm reach in each: the sports car stretches the arm 7%
further than the hatchback, which `aim()` absorbs, and the van's wheel is close enough that
no clamp is needed either — but measure both before freezing.

---

## 6. Phase 0 — Make the existing numbers honest

**Goal:** no behaviour change, but every number a spec will carry is real and reachable.
**If work stops here:** nothing visible changed; the codebase is slightly tidier.

1. `CAR.LENGTH`, `CAR.BELT_Y` and `CAR.ROOF_Y` currently have **zero consumers** — the real
   length is the literal `±1.92` bumpers in `chassis.ts` and the real roof is the `1.415`
   apex in `sideProfile()`. Make them load-bearing: bumpers at `±(length / 2 − 0.02)`, the
   profile apex from `wallTopY`. Otherwise they are the first three fields copied into two
   new specs that change nothing on screen.
2. Kill the bare literals another vehicle would silently break: `22` in `audio/layers.ts`,
   `weather/director.ts` and `weather/effects/snow.ts` (use `SPEED.FOCUS`); `750` in
   `layers.ts`; the gauge divisors `8000` and `180` in `interior.ts`.
3. Drop the dead `fabricLight` material key.

**Acceptance:** `bunx tsc --noEmit` and `bun test` pass; a screenshot is pixel-identical to
before the change.
**Commit:** `chore(constants): make vehicle dimensions load-bearing`

---

## 7. Phase 1 — Per-vehicle materials

**Goal:** two vehicles can exist at once without sharing mutable state.
**If work stops here:** nothing visible changed. Phases 0–4 must land in one sitting.

The `mats` object in `parts.ts` is a module-level singleton of ~35 materials shared by all six
body modules *and the driver*. Three separate problems, only one of which is about dispose:

- `shell.setLights()` and `interior.setDashGlow()` write `emissiveIntensity` into shared
  materials **every frame**, so two live vehicles fight over one set of lamps.
- `dressing.ts` mutates `mats.freshener.side` and `mats.sticker.side` at build time.
- `disposeMaterials()` takes no argument and kills the global set, so one vehicle's teardown
  disposes the other's materials.

Replace it with `createMaterials(spec): CarMaterials`, carrying its own `dispose()`. Thread it
through the seven import sites (`chassis`, `shell`, `interior`, `radio`, `dressing`, `wheels`,
`driver/figure`). `Builder.finish()`'s glass identity check becomes `mat !== m.glass`.

Split the **occupant** materials (skin, hair, hoodie, denim, paper) into a separate shared set
owned for the app's lifetime — one driver, one outfit, no reason to triplicate them. Same for
the three `CanvasTexture`s that do not depend on the vehicle. The radio's LCD texture stays
per-vehicle because its content is drawn per instance.

**Acceptance:** build two vehicles simultaneously with different `paint.body`, run one frame
of each update, and assert their `body.color` and `headLight.emissiveIntensity` **differ**.
A test that only checks "the second vehicle renders" passes today and proves nothing.
**Commit:** `refactor(parts): per-vehicle material sets`

---

## 8. Phase 2 — The VehicleSpec contract

**Goal:** the hatchback is built from data, and looks identical.
**If work stops here:** nothing visible changed.

Write `src/core/vehicles.ts` with the §3 interfaces and `VEHICLES.hatchback` holding today's
numbers verbatim. Keep `CAR` exported as an alias during the phase so the diff stays readable,
then delete it at the end. Move the hatchback's `chassis`/`shell`/`interior` behind
`bodies/hatchback.ts` exporting one `build()`.

`createEngineRig` takes `(motion: MotionProfile, random = Math.random)`. This breaks
`src/util/tests/engineRig.test.ts` — eight constructor calls and three constant reads. Migrate
it in this phase: reparameterise its `run` helper over a profile and assert the hatchback
profile reproduces today's bounds **exactly**. That assertion is the regression proof for the
whole phase. Parameterise `scenery.test.ts` over the profile's cruise speed.

**Acceptance:** `bun test` passes after the mechanical edits in `engineRig.test.ts`, with
every numeric assertion unchanged. Screenshots at clear day, heavy rain in Focus and clear
night are pixel-identical to Phase 0's.
**Commit:** `refactor(vehicles): build the hatchback from a VehicleSpec`

---

## 9. Phase 3 — Symmetrical build and teardown

**Goal:** a vehicle can be removed as completely as it was added.
**If work stops here:** nothing visible changed.

`createCar` becomes `createVehicle(stage, spec)` and returns a `Vehicle` carrying its `id`.
`dispose()` currently frees geometry but **detaches nothing** — it must remove exactly what
was added: `stage.bodyRig.remove(group, driverRoot)`, `stage.wheels.remove(wheels.group)`,
`stage.carRoot.remove(exhaust.group)`, plus the driver's grips from the steering wheel node.

`Builder.finish()` must **throw** when `mergeGeometries` returns null, naming the material
key. It currently `continue`s after already disposing the sources, silently dropping a whole
material — a real hazard when two new bodies add hundreds of Builder calls. Document in the
`BodyKit` contract that every geometry handed to the Builder carries exactly position, normal
and uv.

Wire `import.meta.hot.dispose` to the same teardown path, closing a §16 working agreement the
repo currently violates.

**Acceptance:** build → dispose → build in a loop 20 times with `#debug` open; draw calls,
triangles, programs and `renderer.info.memory` return to their starting values each cycle.
**Commit:** `refactor(vehicles): make build and teardown symmetrical`

---

## 10. Phase 4 — Systems read the spec

**Goal:** every system that assumes a hatchback takes it from the spec instead.
**If work stops here:** nothing visible changed.

Add the §3 setters. The work is mechanical; the hazards are specific:

- `lighting.setVehicle()` must call `key.shadow.camera.updateProjectionMatrix()` after writing
  the ortho bounds, or the change is a silent no-op.
- `glass.rebind()` must mutate the existing `overlays` array in place — `visible()` closes
  over it — and disposes no geometry, because the panes own it.
- `splash.setEmitters()` writes into a fixed `vec3[4]` uniform; the instance count and the
  `aEmitter` attribute are baked. Four wheels, always.
- `layers.setEngineProfile()` must be called **before** `engineOn` flips, because the store's
  subscriber fires synchronously.
- `isoCamera.setFraming()` must update `home`, not just the current pose.

**Acceptance:** with one vehicle, drive every setter from the console with the hatchback's own
values and confirm nothing moves; then with deliberately wrong values and confirm everything
moves. Screenshots unchanged.
**Commit:** `refactor(scene): drive shared systems from the vehicle spec`

---

## 11. Phase 5 — Performance pass, before any new body

**Goal:** buy the budget the two new vehicles will spend.
**If work stops here:** the hatchback runs cheaper than it did.

1. **Interior detail should not cast shadows.** Roughly ten wasted shadow-pass draw calls per
   vehicle. Add `castsShadow` to the material set (default true, false for interior detail and
   decals) and have `finish()` read it. Land it with a before/after screenshot proving the
   shadow is unchanged.
2. **The exhaust becomes one InstancedMesh.** It currently clones a `SpriteMaterial` per puff:
   14–18 materials and up to 18 draw calls for one particle system. The codebase already has
   the pattern in `weather/effects/instanced.ts`. One draw call, one material, one texture.
3. **A detail group per body.** `Builder.add` takes `detail: boolean`; `finish()` returns
   `{ group, detailGroup }`. Low quality sets `detailGroup.visible = false` — free at runtime,
   reversible, and it prunes in `projectObject`. This is the only lever the quality tier has
   on a body that was merged at build time.
4. Pass explicit low segment counts for props under ~0.05 m radius.

**Acceptance:** `#debug` shows draw calls **down** from 96 with the scene visually unchanged;
`bun test` green.
**Commit:** `perf(car): stop casting shadows from interior detail` and
`perf(exhaust): one instanced puff system` (two commits — they are independent).

---

## 12. Phase 6 — The picker, persistence and the swap

**Goal:** the user can switch vehicles, with only the hatchback built.
**If work stops here:** a three-way control that always lands on the hatchback — so land
Phase 7 in the same sitting.

`AppState.vehicle: VehicleId`, persisted in the existing `shotgun.prefs.v1` blob with the four
coordinated edits `mode` needed — interface, `KEYS`, the `sanitizePrefs` branch, and the
hand-written object in `savePrefs` that silently drops a key if forgotten. **Do not bump the
key to v2**: `sanitizePrefs` already drops unknown fields, so old and new payloads interoperate
and a bump would reset everyone's mode, volume and quality for nothing. Update
`persist.test.ts` — both cases assert whole objects.

Boot precedence: `#vehicle=` → stored pref → `hatchback`.

`src/ui/vehiclePicker.ts` mirrors `modeToggle.ts`: a `ui-seg` group of three buttons, styled
purely off `aria-pressed`, appended **after** the mode toggle so that in the row-reverse
cluster the reading order right-to-left is Chill/Focus, then the vehicle group, then volume.
Bound to **V**, which cycles. Guard `e.repeat`. While a swap runs, set `aria-busy` and
early-return in the handler — do **not** use `disabled`, which drops the focus ring and blurs
the user out of the control. A visually-hidden `role="status"` announces the change.

**The transition — commit to this one.** About 1.1 s, camera-led:

| t | What happens |
|---|---|
| 0 ms | `focusedObject` cleared (drops any push-in, closes the Spotify panel, un-ducks audio); radio unregistered; `raycast.clearHover()`; one `iso.frame(newTarget, 1, 900)` issued — the same clock as `INTERACTION.PUSH_IN_MS`, so every camera move in the app runs on one timing. The new vehicle starts building, hidden. |
| ~50 ms | `renderer.compile(scene, camera)` warms its programs and uploads its buffers while it is still invisible. |
| 450 ms | Mid-move, everything already sliding: the old vehicle is hidden and the new one shown. A one-frame pop here is invisible. Engine spring, `lights` and the mode blend are **seeded from the outgoing vehicle** so nothing flashes off and on. |
| 450 ms | `ignite()` — the body dips onto its springs and the needle sweeps. The **crank sound is suppressed**; the full crank is reserved for the first ignition of a session. |
| 1100 ms | Camera settles. `aria-busy` cleared. |

Crossfade is rejected: opaque merged meshes, two vehicles alive with independent opacity, and
no diegetic story. Drive-off/drive-in is rejected for a better reason: it breaks the treadmill
invariant, which would strand the headlight cones, cabin lights, exclusion box, splash
emitters and the contact shadows baked at fixed coordinates.

**Vehicles are cached, not rebuilt.** Build on first selection, keep hidden thereafter; three
hidden subtrees cost one visibility test each and keep their programs alive, so every
subsequent swap is recompile-free. Dispose all on teardown.

The full re-wire list, in order: clear focus → unregister radio and delete its
`userData.interactableId` → `clearHover()` → `setFraming` → build + compile → exchange
visibility → re-register the radio (same id `'radio'`, so the Spotify panel's literal test and
the README guide stay true) → copy the new anchor into the **stable** `radioAnchor` vector the
panel holds → `director.setVehicle()` → `lighting.setVehicle()` → `layers.setEngineProfile()`
→ driver pose → `updateLcd()` immediately (otherwise the new LCD reads "engine off" for up to
a second) → `stage.bodyRig.updateMatrixWorld(true)` so the new hitbox is not raycast at the
origin on the next frame → `window.shotgun.car` → re-arm the quality probe if the user has not
pinned it.

Edge cases: a swap requested while one is running **coalesces** (replace the pending target,
do not queue). Re-selecting the current vehicle is a no-op the store already swallows. A swap
before ignition skips the ignite beat and leaves the engine off. Under `reducedMotion` the
camera move is instant and the exchange is immediate; prime the engine rig with one zeroed
update afterwards so its finite-difference history does not spike the air freshener. A swap
that force-closes the Spotify panel returns focus to the vehicle button that caused it.

**Acceptance:** switch 20 times in each direction with `#debug` open — no drift in the camera
pose, no growth in draw calls, triangles, programs or memory, no frame longer than 50 ms at
the exchange. Escape still exits the radio after a swap. The choice survives a reload.
**Commit:** `feat(vehicles): switch vehicles at runtime`

---

## 13. Phase 7 — The yellow sports car

**Goal:** the second body, and the cheaper one: four wheels, an open cockpit, the same
shelter test.
**If work stops here:** two real choices. This is the first shippable milestone.

A cheap, loved 1970s roadster. Low, wide and 0.28 m shorter than the hatchback, with one
unbroken 15.5° wedge line from the scuttle to the nose — break that line into segments and it
becomes a generic three.js car.

- **Paint** `#C08A22`, a deep yellow. Measured: 1.67:1 against the slab, 2.10:1 against the
  road markings, 2.85:1 against asphalt, and at 70% saturation it is the most saturated object
  in a frame whose slab sits at 20% — so it reads unmistakably yellow while still separating
  from the shelf. A bright lemon (`#E6B32E`) dissolves into the plinth; see §18 if you want it
  anyway. Trim `#211F1E` — a bright body needs ~1.8× the edge contrast or the splitter, sills
  and mirror stalks vanish. One dark deck stripe `#2E2A27` with a cream `#F0E6D0` pinstripe.
- **Interior** vinyl `#1E1B19` and oxblood `#6B3A32` fabric. With a bright warm body the lit
  pocket cannot get warmer — it gets darker, or the amber dash glow has nothing to be brighter
  than. The green hoodie reads 2.38:1 against oxblood, better than it does in the hatchback.
- **Cockpit**: two low buckets with bolsters standing 0.10 m proud (from directly above, the
  bolsters *are* the bucket-seat signal), a roll hoop at 1.22 m that haloes the driver's head
  rather than hiding it, a near-vertical wind blocker, a small wheel, a centre tunnel. Sill at
  0.50 and hips at 0.40: high sill, low seat is the real proportion and it is what gives the
  cabin light a surface to sit in.
- **Wheels** 7 spokes, dark faces with a chrome lip — the hatchback's pale hub disappears
  against yellow. Rear tyres Z-scaled 1.25.
- **Radio** low on the tunnel at [0.50, 0.60, 0], canted `rz −0.61, ry −0.44` so its normal
  sits 16° off the camera axis — squarer to camera than the hatchback's own faceplate. The
  hitbox stays axis-aligned and oversized.
- **Character**: one visible repair. A mismatched wing mirror or a strap over the bonnet.
  "Loved" is a modelling instruction, and it is the only thing that makes a yellow car belong
  beside a seafoam one.

**Acceptance:** screenshot beside the hatchback at the same frame state — they read as one toy
line. Draw calls within the 100 budget. The cabin still has a lit pocket at night. No rain in
the cockpit at any intensity or speed.
**Commit:** `feat(vehicles): the yellow sports car`

---

## 14. Phase 8 — The camper van

**Goal:** the third body, and the one that stresses the framing.
**If work stops here:** the feature is complete.

A high-top van, 5.60 m long, with a lived-in back. Wall top at 1.95 m — derived in §5 for
interior-exposure parity with the hatchback, and the reason this is a van rather than a
coachbuilt box.

- **Paint** `#A9BFC4`, a pale dusty blue, exactly period-correct for a 1970s camper and 153°
  from the slab's hue at 4.52:1 against asphalt. Cream was tested and rejected: a warm neutral
  body flanked by white road markings cannot separate from a warm neutral plinth at any
  lightness. Burnt-orange stripe `#C4643C` survives from the cream scheme unchanged. Trim
  `#3A3C38`, lifted from the hatchback's near-black — a big pale body with near-black trim at
  this scale reads as an office printer.
- **Wall-top rail** in `#B9B4A8` aluminium, capping the open wall on both sides and both ends.
  This is the part that makes a roofless box read as deliberate rather than unfinished.
- **Silhouette**: break the 5.6 m top line in three cheap places — the cab steps down at the
  nose, the rear third steps down 0.10 m (a real coachbuilt profile), and one roof-vent lid
  props at 32° near the middle. A dead-straight line across two-thirds of the frame is the
  fastest route to the generic-demo failure.
- **Interior**, all of it above the `y + z > 0.95` visibility threshold: dinette against the
  far wall with a 1.0 m aisle on the near side (centre it and the near bench's back stands
  between camera and table), a tiny kitchen with a hob and a swan-neck tap, a step between the
  cab and living floors, an entry well that gives the floor real depth, curtains built as
  three overlapping cylinders per window (far better than a flat plane at this scale), a
  festoon of eight small spheres on the far wall wired to the dash glow so it comes up with
  ignition. Sage `#6E7F63` upholstery is a cousin of the driver's hoodie, so the figure
  belongs in this vehicle rather than being dropped into it.
- **Dressing**: kettle, mug, two paperbacks and a folded map on the table, boots by the door
  with one knocked over, a tea towel, three deliberately off-square postcards. Off-square is
  the whole trick.
- **Radio** on the cab-rear bulkhead shelf at [1.35, 1.55, 0.74] — not a boombox on the
  dinette table, which would break the app's single-cluster composition and pull the push-in
  away from the driver. It lands 8% of frame height from the driver's head, tighter than the
  hatchback's own 14%.
- **The swinging thing** becomes a paper mobile hung from the cab bulkhead, 0.26 m long: same
  pendulum, `√(g/L)` drops from 7.6 to 6.1 rad/s, a visibly slower swing that matches the
  vehicle.
- **Four wheels.** Twin rears are faked with `rearWidthScale` 1.25, which every wheel part
  already supports as a Z scale. Plain steel discs with a chrome cap and no radial spokes —
  no periodic signal, no wheel-spin aliasing, and the correct wheel for a van anyway.

**Acceptance:** interior exposure measured at ~30% of the cabin floor; no shear, no cut faces;
no rain inside at any intensity; draw calls within 100 including the shadow pass; the shadow
does not clip at the body's extremes.
**Commit:** `feat(vehicles): the camper van`

---

## 15. Phase 9 — The world at three scales

**Goal:** the wider frame the van needs does not break the other two.
**If work stops here:** the feature ships with a visible plinth edge on the van.

At the van's 7.0 m frame the world shows more than it was tuned for:

1. `WORLD.SLAB_BACK` −8 → **−12**, with `SCENERY.RECYCLE_BEHIND` −13 and `FIELD_LENGTH` 44.
   The slab's rear edge and the void beyond it enter the shot otherwise. The road texture
   repeat becomes 5.25; verify the seam lands off-screen.
2. `STREETLIGHT_SPACING` 35 → **20**, so `count × spacing` equals the field length and the
   rhythm is even — the current 35/40 mismatch is a latent strobe the wider frame exposes.
   Reduce the lamp cantilever so the head sits over the verge rather than the road.
3. Cap the pine scale range at 1.05 so the treeline stays cropped as it is today.
4. Re-check `WEATHER_FX.FOG` densities, commented as tuned for the small slab and a 3.5 m
   camera distance. A 35% wider frame puts previously-cropped far-verge content in shot.

None of these is visible at the hatchback's or the sports car's framing — verify that with
before/after screenshots of both.

**Acceptance:** all three vehicles at 16:9, 4:3 and a narrow window; no plinth edge, no strobe,
no abruptly-ending treeline.
**Commit:** `fix(world): even the streetlight rhythm and extend the slab`

---

## 16. Phase 10 — Tests, polish, docs, v0.3

**Goal:** ship it.

**Pure logic to unit test** (this repo tests only pure logic):

| Test | Asserts |
|---|---|
| `vehicles.test.ts` | every spec's shelter box encloses its own declared extents including mirrors; the box formula reproduces the hatchback's shipped values; `rearDelay === wheelbase / speed.focus`; exactly four wheel nodes; `radioZoom === 3.2 × viewSize / 5.2` |
| `shelter.test.ts` | a TypeScript twin of `shelteredByBox` from the GLSL, checked against hand-worked cases per vehicle |
| `budget.test.ts` | each spec's declared `maxBuckets` is not exceeded by its material set, so a tenth decorative material fails the suite rather than review |
| `persist.test.ts` | `vehicle` round-trips; an unknown vehicle id is dropped |
| `engineRig.test.ts` | migrated to `MotionProfile`; the hatchback profile reproduces today's bounds exactly |
| `scenery.test.ts` | parameterised over cruise speed |

**Polish:** re-arm the quality probe after a swap when the user has not pinned quality;
confirm the picker wraps correctly at 640 px and that the reading order is intended at that
breakpoint; confirm the weather badge holds AA contrast against the brightest scene, which is
now the yellow car in clear day.

**Reduced motion:** `REDUCED_SCALE` clamps every vehicle to one absolute amplitude ceiling
rather than scaling each vehicle's own amplitude. Somebody who asks for less motion asked for
less motion, not for less motion than this particular vehicle would otherwise have.

**Docs:**
- `README.md` — tagline, description, the `#vehicle=` hash, the constants table (a `VEHICLES`
  row), the layout block, the design notes, the archive list, and **the glTF seam**, whose
  current text mandates the open cabin and `WEATHER_FX.CAR_BOX`. Both change: node names stay
  normative across all three vehicles, and the exclusion box moves onto the spec.
- `public/audio/README.md` — the two optional per-vehicle engine loops, the per-vehicle rate
  notes, and the vehicle-local fallback rule.
- `docs/archive/v0.3-three-vehicles.md` in the v0.2 shape: What changed from v0.2 / Unchanged /
  Notes. Bump `package.json` to 0.3.0 and tag `v0.3`.

**Commits:** `test(vehicles): pure-logic coverage for the three specs`, then
`docs(audio): per-vehicle engine loops`, then `docs: log v0.3` — kept separate per
docs/COMMITS.md's split rule.

---

## 17. Working agreements (amendments to PLAN-car-init.md §16)

Everything in §16 still holds. Added:

1. **Where a number lives.** A number another system reads lives on the `VehicleSpec`. A
   number that only draws one body stays a literal in that body's file. A bare number in a
   *shared* scene or motion file is still a bug.
2. **No spec may change program-affecting state.** Light counts, material feature flags
   (`map`, `emissiveMap`, `transparent`, `vertexColors`, `flatShading`) and shader defines are
   identical across all three vehicles. Violating this recompiles the whole scene on every
   swap.
3. **Screenshot and critique per vehicle**, against §4, before each body's commit — plus one
   three-up comparison as the release gate.
4. **Phases 0–5 are refactors, not milestones.** They produce no visible change and must land
   in one sitting; a half-migrated codebase is worse than either end state.
5. Props under ~0.05 m radius pass explicit low segment counts.
6. Every module that creates geometry, materials or textures implements `dispose()`, and it is
   called on hot reload — now actually wired, per Phase 3.

---

## 18. Decisions taken, and how to change them

Each of these is a real product call. The plan commits so it is buildable; here is the lever
if you disagree.

| Decision | Committed | The alternative, and its cost |
|---|---|---|
| **RV size and type** | A 5.60 m high-top **camper van** | A 6.2 m coachbuilt Class C is grander but shows 19% of its floor, needs `viewSize` 7.3+, and pulls the slab edge and streetlights into shot |
| **No cutaways, still** | The van's wall top is *derived* for exposure parity, so no shear is needed | Shearing the near wall to 1.98 m would show 41% and re-introduce the v0.1 cut convention — it looks good, but you retired cutouts in v0.2 |
| **Sports car character** | A cheap 1970s roadster, 7000 rpm, 4 cylinders | A supercar wedge is the thing §4 explicitly names as the negative, and it is harder to make read as "loved" |
| **The yellow** | `#C08A22`, a deep yellow that separates from the plinth | `#E6B32E` is brighter and more obviously "yellow", but sits 1.05:1 against the slab — you would need to darken `SLAB_TOP` too |
| **Transition** | ~1.1 s, camera-led, crank suppressed | A full engine-off/ignition ceremony is more diegetic but costs 3.6 s of dead time on a control people will press repeatedly |
| **Re-crank on swap** | No — the needle sweeps, the body dips, the starter stays quiet | Cranking every time is louder and more literal |
| **Van's radio** | Cab-rear bulkhead | A dinette boombox is more characterful but breaks the single-cluster composition |
| **Key binding** | `V` cycles | It is free; `1`/`2`/`3` would be direct but collide with nothing useful |
| **Driver** | One figure, one green hoodie, three poses | Per-vehicle outfits are §17-deferred and would make three cars feel like three places |
| **Version** | v0.3 | — |

---

## 19. Deferred to v0.4 (do not build now, do not architect them out)

A six-wheel rig for a real Class C · per-vehicle driver outfits · per-vehicle `SPEED.OMEGA` ·
a cross-fade swap · per-vehicle dressing sets that rotate · pop-up headlights · per-vehicle fog
density · a fourth vehicle · the glovebox and other per-vehicle interactables · a garage view
that shows all three at once.

Fixing two axles in the type now is cheap; relaxing it later is not. That is the one deferred
item the architecture must deliberately not foreclose — keep the axle loop data-driven even
though every vehicle in v0.3 has exactly two.
