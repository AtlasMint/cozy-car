# PLAN-park — v0.6

v0.6 is about where the vehicle *is*. Today it is always on the roadside: Chill is that
roadside with the engine idling, Focus is the same roadside scrolling past. v0.6 adds a third
place, an empty parking lot, and makes it the place the app opens in. A third mode — **Park** —
sits in front of the two that exist, the start screen goes because Park is what it was showing,
and the camper, which has been sitting with its passenger seat swivelled to face the table
since v0.4, finally gets somewhere to have stopped.

The first half of v0.6 — the horn, the keyboard registry and the radio's loading state — has
shipped and is logged in [archive/v0.6-park-horn-and-keys.md](archive/v0.6-park-horn-and-keys.md).
This document is the second half. Written for whoever implements it, which is probably a later
session of me.

---

## 0. Product summary

| Mode | Where | Engine | How you get there |
|---|---|---|---|
| **Park** | An empty parking lot | Off. Accessory power: cabin light, radio | **P**, from anywhere. Also where the app boots |
| **Chill** | The roadside | Idling | **F** from Park; **F** from Focus |
| **Focus** | The road, moving | Under load | **F** from Chill only |

Four rules, all from the brief:

1. **The app boots into Park.** Every time. Mode is not remembered any more; the vehicle still is.
2. **F never jumps to Focus.** From Park it pulls out onto the roadside. From there it is the
   toggle it is today.
3. **P always parks**, from Chill and from Focus alike.
4. **Leaving Park starts the engine; returning stops it.** There is no other way to start it, so
   the "Start the engine" screen has nothing left to do and is removed. Park *is* the still,
   silent diorama the gate used to stand in front of, and the first F — or the first click on
   Chill — is the user gesture Web Audio needed the gate for.

And one from the camper: in Park it is **stationed like a camper**, with a picnic table and two
chairs set out beside it.

### The rules that still hold

- **`carRoot` is never translated.** The lot is a second world on the same plinth, not a place
  the vehicle drives to. Every world coordinate in the app stays valid.
- **Nothing tall between the lens and the cabin.** The treadmill already puts its tall
  archetypes only on the far verge, for this reason. The lot's furniture obeys the same rule,
  and §5.3 turns it into an inequality a test can check.
- **No new material key, no new light.** The lot uses the scenery's vertex-colour material and
  a lamp material of its own kind; the lantern on the camper's table borrows a point light the
  lot is not using. The point-light count stays what it was at boot.
- **Doll's house.** Rain and snow do not fall into the cabin in the lot either; the shelter box
  is the vehicle's and does not move.

### Non-goals

No other cars in the lot — it is empty, that is the point. No driving into or out of it: the
transition is the curtain, the same one a vehicle swap uses (§2.3, and a decision in §12). No
second driver figure outside the vehicle. No day/night control; the weather still decides.

---

## 1. What has to move

Everything Park touches, and why.

| Today | Where | What Park does to it |
|---|---|---|
| `engineOn: boolean` in the store, set once by the start screen | [store.ts](../src/core/store.ts), read in seven places | Goes. The engine is on exactly when `mode !== 'park'`. A derived fact must not be a second field that can disagree with the first. |
| The start screen: a button, the gesture that resumes the AudioContext, and the moment the quality probe begins | [startScreen.ts](../src/ui/startScreen.ts), [main.ts](../src/main.ts) | Deleted. The gesture is any first pointerdown or keydown; the probe arms on the first departure from Park (§3). |
| `Mode = 'chill' \| 'focus'`, persisted | store, [persist.ts](../src/core/persist.ts) | Gains `'park'`. Dropped from `Prefs`; a stored `mode` from v0.5 is ignored, not honoured. |
| Two-state mode control bound to F | [modeToggle.ts](../src/ui/modeToggle.ts) | Three states, P and F, with Focus unreachable from Park (§7). |
| The road and the scenery are two objects that `main.ts` and the director each talk to separately | [road.ts](../src/scene/world/road.ts), [scenery.ts](../src/scene/world/scenery.ts), [director.ts](../src/weather/director.ts) | Behind one `World` interface, so a lot can stand in for both (§4). |
| Lighting couples the cabin light and the dash glow to one `ignition` number | [lighting.ts](../src/scene/lighting.ts) | Two numbers: `accessory` (cabin light) and `ignition` (dash, headlights). Park has the first without the second. |
| The LCD says "engine off" until the engine is on | main.ts `updateLcd` | The radio has accessory power in Park; the LCD shows the time and the weather in every mode. |
| The speed spring's target is `mode === 'focus' && engineOn` | main.ts | `mode === 'focus'`. |
| The gun fires only with the engine on; the horn sounds only with the engine on | [gunControl.ts](../src/ui/gunControl.ts), [hornControl.ts](../src/ui/hornControl.ts) | The gun keeps its guard on the derived value. The horn loses its guard: a horn is on a permanent circuit and works with the key out, which is also the one thing you want a parked car to be able to do. |

---

## 2. The mode machine

### 2.1 Pure

Mirrors `nextVehicle` in [vehiclePicker.ts](../src/ui/vehiclePicker.ts): the whole rule in one
place, stated once, tested.

```ts
export type Mode = 'park' | 'chill' | 'focus';

/** Which mode a key press asks for, or null for nothing. */
export function nextMode(key: 'p' | 'f', current: Mode): Mode | null {
  if (key === 'p') return current === 'park' ? null : 'park';
  if (current === 'park') return 'chill';        // F pulls out; it never jumps to Focus
  return current === 'chill' ? 'focus' : 'chill';
}

/** Whether a click on the mode control may go there directly. */
export function canEnter(current: Mode, target: Mode): boolean {
  if (target === current) return false;
  return !(current === 'park' && target === 'focus');
}

/** The derived fact the store no longer carries. */
export const engineOn = (mode: Mode): boolean => mode !== 'park';
```

### 2.2 The transitions

```
              F                 F
   Park ───────────→ Chill ⇄──────── Focus
     ↑                 │               │
     └────── P ────────┴────── P ──────┘
```

| Transition | Curtain | Engine | Speed | What else |
|---|---|---|---|---|
| Park → Chill | Yes | Cranks behind the black, catches as the road comes up | 0 | `mixer.resume()`, `layers.crank()`, `car.ignite()`, `focusedObject` cleared, the quality probe arms |
| Chill → Focus | No | Load rises (today's behaviour) | → `SPEED.FOCUS` | Unchanged |
| Focus → Chill | No | Load falls | → 0 | Unchanged |
| Chill → Park, Focus → Park | Yes | Dies behind the black (§2.4) | Reset to 0, not sprung | `focusedObject` cleared, world swapped |

The curtain is only crossed on the way into or out of Park, because that is the only time the
world changes. Chill ⇄ Focus stays exactly what it is.

### 2.3 Behind the curtain

The choreography is `swapVehicle` in main.ts with the vehicle held still and the world
exchanged instead: cover, `world.show('lot' | 'road')`, reset the springs that must not carry
over, one `compileAsync` the first time the lot is shown, `drawn()`, reveal. Reuse the pieces
(`drawn`, the pending-coalesce guard) rather than the function; the two share a shape, not a
body. A mode change while a vehicle swap is running waits for it, and vice versa — one
`transitioning` flag guards both, because both hold the curtain.

The speed spring is *reset* on the way to Park rather than sprung down: nothing is visible
while it would have decelerated, and Park must not inherit a rolling treadmill.

### 2.4 The engine going off

`engineSpring` today rises at `MOTION.ENGINE_OMEGA` (3 rad/s) and would fall at the same rate —
about 1.5 s to settle, of which the curtain hides the first 0.4. A real engine stops in half a
second. Add `MOTION.ENGINE_OFF_OMEGA` (✎ 6) and use it on the way down, so the note dies just as
the lot comes up rather than trailing on into it. The rpm follows `engine`, so the needle falls
with it for free.

---

## 3. Boot, the gesture and the probe

**Boot.** `store.set({ mode: 'park' })` unconditionally; `Prefs.mode` and its `sanitizePrefs`
line go, along with the two persistence tests that assert it round-trips. A dev hash `#mode=chill`
or `#mode=focus` boots straight into that mode for screenshots, the way `#weather=` does — never
persisted, never written to the hash by the app.

**The gesture.** The AudioContext still needs one. A single `once` listener on `pointerdown` and
`keydown` at the window calls `mixer.resume()`; the Park → Chill transition calls it again, which
is idempotent. Before that first gesture the lot is silent — which it was behind the start screen
too, the difference being that it is now something to look at. A one-line hint under the mode
control (§7) says what to press.

**The probe.** The frame-time probe measures the treadmill, and in Park there is none, so it
would grade the lot and then be surprised by the road. It arms on the first departure from Park
and runs as it does today; `probeDone` starts true in Park and is cleared by that transition,
exactly as a vehicle swap clears it now.

---

## 4. One World

### 4.1 Today

`main.ts` holds `road` and `scenery` and calls `road.scroll(speed·dt)` and
`scenery.update(dt, speed)`; the director holds both and calls `road.setWetness`,
`scenery.setNight`, `scenery.streetlightHeads`. Two objects, four call sites, and the lot would
make it four objects and eight.

### 4.2 v0.6

```ts
export interface World {
  group: THREE.Group;
  /** Per frame. The treadmill scrolls; the lot ignores speed. */
  update(dt: number, speed: number): void;
  setNight(night: number): void;
  setWetness(wet: number): void;
  /** Lamp heads for the streetlight point lights, nearest first, with a level each. */
  lampHeads(out: LampHead[]): number;
  /** The vehicle just arrived; a world with per-vehicle furniture swaps it. */
  setVehicle(id: VehicleId): void;
  setVisible(on: boolean): void;
  dispose(): void;
}
```

`createRoadWorld(maxAnisotropy)` wraps today's road and scenery and changes nothing they do.
`createLot()` is new (§5). `createWorlds(stage, …)` owns both, adds both groups to `stage.slab`,
shows one, and exposes `show(which)` and the `World` currently on. `main.ts` and the director
talk to `worlds.current` and to nothing underneath it.

`lampHeads` replaces `streetlightHeads` and carries a level per head, because the lot's second
head is a lantern and a lantern is not a sodium streetlight: `LampHead = { position, intensity }`,
and `lighting.updateStreetlights` multiplies by it. On the road world every head reports 1 and
nothing changes.

**Phase 0 is a null change.** Verify it the way v0.5's bus refactor was verified: a screenshot
at 1440 × 900 before and after, pixel-identical; draw calls identical from the stats panel.

---

## 5. The lot

### 5.1 What it is

An empty lot on the same plinth, in the same light, under the same weather. The vehicle sits
nose-in to a kerb, in the middle bay of a row of three; the aisle is behind it, the verge and a
lamp post are ahead of it, and the far side of the slab dissolves into the backdrop the way the
road does. Empty: no other cars, no people. A puddle or two when it rains is deferred.

Nose-in is a choice with a reason. The camera looks from the rear-left quarter, so the near-rear
quadrant is the one place nothing tall may stand (§5.3) — and an aisle is exactly nothing tall.
Ahead of the vehicle is where the treadmill's far scenery already lives, so that is where the
lot's lamp post and trees go, and it is also where a camper's table can stand beside the kerb
without a single part of it coming between the lens and the open cabin.

### 5.2 The surface

A canvas texture, like the road's, painted at startup: asphalt with the road's speckle, and bay
lines in the marking colour at reduced alpha so they read as faded. Bays run along X (the
vehicle's axis), side by side along Z, `LOT.BAY.width` wide and `LOT.BAY.length` long, with the
vehicle's bay centred on the origin — so its lines are at `z = ±width/2` and its neighbours' at
`±3·width/2`. The head of the row is a kerb at `x = LOT.KERB_X`, ahead of every listed
vehicle's nose (the camper's is at 2.8; ✎ 3.2 clears it). Behind, the aisle, then the heads of a
second row painted in mirror so the near-rear quadrant has paint in it without anything standing
in it. A drain grate, one oil stain and a cracked-line patch, all painted, all from the seeded
PRNG the road uses.

The surface takes `setWetness` exactly as the road does — same colour lerp, same roughness drop
— so rain reads the same in both worlds.

### 5.3 The furniture, and the rule

Beyond the head kerb is a verge: a darker strip (vertex colour, no new material) with a lamp
post, two pines and a bush or two along it, and the scenery's kiosk, closed, far off and to the
far side. Along the far edge of the slab, a low wall. Bollards at the kerb ends. A wheel stop in
the vehicle's bay at `x = wheelbase/2 + wheelRadius + 0.1`, derived per vehicle, mostly under
the nose.

**The rule.** The camera looks along `d ∝ (+1, −k, +1)`. A prop at `P` can be in front of a
point `Q` of the cabin only if `Q = P + t·d` for some `t > 0`, which needs `Q.x > P.x` and
`Q.z > P.z`. So a prop of any height is guaranteed clear of the cabin when

```
P.minX ≥ length/2   or   P.minZ ≥ wallZ
```

for the vehicle in the bay — ahead of the nose, or beyond the far wall. Anything that fails both
is only allowed if it is paint (`maxY` below the kerb height). The scenery's "tall things on the
far verge only" is this rule for one of the two cases. Every prop in `lot.ts` is a row in a
table with an AABB, and a test runs the inequality over the table against every spec in
`VEHICLES` — not only `VEHICLE_ORDER`, for the same reason `vehicles.test.ts` gives.

### 5.4 Night and rain

The lamp post's head is emissive in the lot's own lamp material, driven by `setNight` like the
scenery's, and it is the first `lampHead` — so the sodium pool falls on the vehicle's nose and
far flank, which is the one thing that makes a lot at night look like a lot at night. The vehicle
throws no headlights in Park; the cabin light is on (§6). Splash rings at the wheel positions
work unchanged; spray needs speed and gets none.

### 5.5 Placing it

```
                 far wall (+z)
   ·  pine   ·      ·    pine   ·   kiosk (far, closed)
  ── verge ─────────────── lamp post ──────────────────
  ═══════════ head kerb, x = LOT.KERB_X ═══════════════
   │  bay  │ ▓ VEHICLE ▓ │  bay  │         ← z = ±1.35, ±4.05
   │       │  nose-in    │       │
  ─────────────── aisle (empty) ─────────────────────── ← near-rear quadrant: paint only
   ┐  bay  ┌     bay     ┐  bay  ┌         ← mirrored row heads
   camera ↗ (−x, −z)
```

---

## 6. What Park looks and sounds like

**Lighting.** `lighting.setPower({ accessory, ignition })`. `accessory` drives the cabin light
and the living light (the camper's second interior light) and is 1 in every mode once the app
has booted; `ignition` drives the dash glow and the headlights and is the engine ramp. Today's
`applyCabin` splits cleanly along that line. At night in Park the cabin is a warm pocket in a
dark lot with one sodium lamp — that is the picture.

**Motion.** `engine` is 0, so the rig is still: no idle, no sway, no bumps, and the exhaust's
rate is 0 so no plume. Optional, small: a parked car rocks in a gale. Scale the sway band by
`max(engine, LOT.WIND_ROCK · windK)` so wind alone moves it a little. Not in the first cut.

**Driver.** The posture spring already treats anything not Focus as the slump. Park adds a pool
flag: `parkOnly` gestures and `notInPark` ones. `sip` and `headTurnWindow` stay; `handToGear`
is `notInPark`; new and `parkOnly`: `restHands`, which lets go of the wheel — the hand targets
go to a lap point derived from the hips (`hips + (0.22, 0.08, ±0.1)`, no new spec numbers) and
stay there between gestures. Readable from the camera as "not driving", which is the whole
brief for the figure in Park. Gesture gaps stretch by `LOT.GESTURE_GAP_SCALE` (✎ 1.5).

**Sound.** The engine bus falls silent through `d.engine = 0`; road noise with it. Weather,
wind and ambience carry on; the radio has accessory power and plays. The horn works. Nothing
new is synthesised for Park in v0.6 — a distant road, a ticking engine cooling, are deferred.

**The LCD.** Time and weather in every mode. The "engine off" string goes with the flag.

---

## 7. The control and the keys

The two-state `ui-seg` becomes three: **Park · Chill · Focus**, styled entirely off
`aria-pressed` as today. In Park the Focus button carries `aria-disabled="true"` and its click
does nothing; its tooltip says why: *"Pull out first — F"*. The rule that decides is `canEnter`,
so the button and the key cannot disagree.

Both keys bind through the registry from the first half of v0.6, which means the shortcut list
updates itself:

| Key | Label | Hint |
|---|---|---|
| **P** | P | Park |
| **F** | F | Pull out, or Chill ⇄ Focus |

Tooltips: Park *"Engine off, in an empty lot. Press P."*, Chill *"Roadside, engine idling. Press
F."*, Focus *"The world scrolls past. Press F from Chill."*

Under the segment, in Park only and only until the first departure of the session, one
`ui-hint`: *"Press F to start the engine and pull out."* It carries the job the start screen's
hint had, at a tenth of the size.

The start screen's file is deleted, not emptied. `overlay.centre` keeps existing; nothing else
uses it yet.

---

## 8. The camper stops for the night

Per-vehicle furniture is the lot's, not the body's: it must not ride `bodyRig` (the rig writes
y / pitch / roll there and a table does not idle with the engine), and it is built in the lot's
materials. So the seam is `lot.setVehicle(id)`, and a table in `lot.ts` keyed by `VehicleId`
holds a builder per vehicle that wants one. In v0.6 exactly one does.

**The camper's.** On the verge beside the head kerb, near side, ahead of the nose — inside the
rule by the first inequality (`x ≥ 2.8`): a picnic table (`LOT.PICNIC`, ✎ 1.5 × 0.8 at 0.75),
two folding chairs facing the vehicle's side, a cooler under the table, and a lantern on it.
The lantern is emissive at night and is the lot's second `lampHead` at a lantern's level
(✎ 0.12 of the streetlight's), so at night the table has a warm pool of its own — and it costs
nothing, because that point light already exists and the road world only ever used it for the
second streetlight.

The near cab seat has been swivelled to face the table since v0.4, and its comment already says
"the vehicle is parked, and someone's partner turned their chair round." In Park that is finally
true.

---

## 9. Phases

Each is one commit, per [COMMITS.md](COMMITS.md). 0 is invisible; 1 and 2 change behaviour
with the road world standing in for the lot; 3 onward is the lot.

| # | Commit | What | What the user has if work stops here |
|---|---|---|---|
| 0 | `refactor(world): the road and the scenery behind one World` | §4. Null change, verified pixel-identical. | Exactly v0.6-so-far. |
| 1 | `feat(mode): Park, and the app boots into it` | §2, §3, §6 lighting and LCD. `engineOn` derived, start screen deleted, first-gesture unlock, mode not persisted, `#mode=`, probe arms on departure, curtain on the Park transitions, crank on the way out. Park shows the road world, still and silent. | A working app with no start screen: it opens silent on the roadside, F starts the engine. |
| 2 | `feat(ui): a three-way mode control, P and F` | §7. | The above with the control and the keys that say what is happening. |
| 3 | `feat(world): an empty parking lot` | §5. `lot.ts`, the surface, the kerbs and verge, the lamp, the perimeter, the occlusion test. `worlds.show` wired to the transitions. | The feature. |
| 4 | `feat(world): the camper stops for the night` | §8. | The feature, plus the picture on the tin. |
| 5 | `feat(driver): parked, hands off the wheel` | §6 driver. Optional; ship without it if it does not read from the camera. | — |
| 6 | `docs: log v0.6` | Close the archive log, README (a Park section under Controls, the mode table, "Vehicles" no longer says the app opens idling), version already 0.6.0, **tag `v0.6`**. | — |

---

## 10. Where the numbers live

New group in [constants.ts](../src/core/constants.ts), every value ✎ until measured:

```ts
export const LOT = {
  BAY: { width: 2.7, length: 5.5, line: 0.12, alpha: 0.55 },
  /** Head of the row: must clear every listed vehicle's nose. */
  KERB_X: 3.2,
  KERB: { height: 0.12, width: 0.25 },
  /** Painted surface on the slab; the plinth beyond is verge and wall. */
  SURFACE: { back: -11, front: 3.2, halfWidth: 4.6 },
  VERGE: { depth: 4.5, color: '#5F6B4A' },
  LAMP: { x: 5.2, z: 3.6 },
  PICNIC: { x: 4.2, z: -1.6, table: [1.5, 0.75, 0.8], lanternLevel: 0.12 },
  WIND_ROCK: 0.3,
  GESTURE_GAP_SCALE: 1.5,
  TEXTURE_PX: 1024,
} as const;
```

and in `MOTION`: `ENGINE_OFF_OMEGA: 6`. Nothing per vehicle changes on the spec: the wheel stop
and the picnic placement are derived from `dims`, and only the camper has furniture, keyed by id.

---

## 11. Tests

Pure, in `src/util/tests/`, following the pattern:

- `nextMode` — the whole table: P from each mode, F from each mode; F from Park is Chill and
  never Focus; P in Park is null.
- `canEnter` — Park → Focus refused; every other pair allowed except the identity.
- `engineOn(mode)` — false only for Park.
- Persistence — `mode` is not written, and a stored `mode` from v0.5 is ignored on load (extend
  the existing `sanitizePrefs` test rather than adding a file).
- The occlusion rule — over the lot's prop table against every spec in `VEHICLES`: no prop taller
  than the kerb fails both inequalities. This is the test that keeps someone from putting a bin
  beside the near door in v0.7.
- Bay geometry — `bayLines(width, count)` returns the z positions symmetric about 0.
- `advanceField` and the scenery tests — unchanged, and they must stay green through phase 0.

---

## 12. Verification

Beyond the suite, the [headless harness](archive/) as used for the horn: `shot.ts` against
`http://localhost:5555/`.

- Boot: no start screen, the lot visible, the mode control on Park, the engine bus silent
  (`AnalyserNode` on `mixer.master` after a synthetic gesture; RMS in the engine band ≈ 0).
- `key:f`: the curtain crosses, the crank is audible, the road world is on, `store.mode` is
  `chill`, `speed` 0. `key:f` again: `focus`, the treadmill scrolls. `key:p`: `park`, the lot,
  the speed spring at exactly 0, the engine band silent within 1.5 s.
- `#mode=focus`: boots moving, for screenshots.
- Night + rain in the lot (`#weather=rain&night=1`): the lamp's pool on the nose, the cabin
  pocket lit, the lot surface glossed, splash rings under the wheels, no spray.
- The camper in Park, cabin cropped as the visual-verification memory describes: the table and
  chairs beside the kerb, the lantern's pool at night, nothing over the open cabin.
- Every listed vehicle in Park, and every vehicle the picker does not list: the wheel stop under
  the nose, the bay lines clear of the tyres.
- Draw calls from `#debug`: the lot must not exceed the road world's count by more than the
  furniture — one instanced mesh per archetype, one merged mesh per vertex-colour set.
- The settings menu's shortcut list shows P.

---

## 13. Decisions to overrule

1. **Park means engine off.** With accessory power, so the cabin light and the radio are on. The
   alternative — Park as Chill in a different place, engine idling — makes the two modes the same
   thing with different scenery, and it leaves the start screen with a job. If you want the engine
   idling in the lot, say so and §2.4 and the lighting split still stand; only `engineOn` changes.
2. **The transition is the curtain, not a drive.** Driving into the lot would mean the road
   sliding away and the lot sliding in under a stationary vehicle, which is a treadmill with two
   surfaces and a join — a v0.7 amount of work for a two-second flourish. The curtain already
   exists and already covers a world change. Deferred, not rejected.
3. **Mode is not remembered.** The brief says the app boots into Park; the vehicle and the
   volumes are still remembered. If you want Park to be the default rather than the rule, that is
   one line in boot precedence and a key back in `Prefs`.
4. **Focus is unreachable from Park, by click as well as by key.** The brief says no direct way;
   a button that silently routes through Chill would be a control that lies about what it does.
   The button is disabled with a tooltip instead.
5. **The horn works in Park.** A real horn does. If you would rather nothing sounds with the
   engine off, it is one guard in `hornControl.ts`.
6. **Nose-in, aisle behind.** For the occlusion reason in §5.1. Reversing it puts the lamp and
   the table in the near-rear quadrant, where they would stand between the lens and the cabin.
7. **Only the camper gets furniture.** The brief asks for it; the other two get an empty bay,
   which for a hatchback at a lookout and a roadster about to leave is the right picture.

## 14. Deferred

- Driving in and out: the lot as a second treadmill surface, and a real pull-out on F.
- The engine ticking as it cools after P; a distant road under the lot's ambience.
- Puddles, and the lamp reflected in them.
- Hands-in-lap on the driver if phase 5 does not read; a second figure at the picnic table.
- A day/night override, so the lot can be seen at night without waiting for it.
