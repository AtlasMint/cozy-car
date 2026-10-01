import { createRenderer } from './core/renderer';
import { createLoop } from './core/loop';
import { createStore, defaultState, type Mode, type VehicleId } from './core/store';
import { engineOn, parseModeHash } from './core/mode';
import { bindPersistence, loadPrefs } from './core/persist';
import { createDebugStats } from './ui/debugStats';
import { createIsoCamera } from './core/isoCamera';
import { createStage } from './scene/stage';
import { createRoadWorld } from './scene/world/world';
import { createLot } from './scene/world/lot';
import { createWorlds } from './scene/world/worlds';
import { createLighting } from './scene/lighting';
import { createVehicle, type Vehicle } from './scene/car/car';
import { VEHICLES, type VehicleSpec } from './core/vehicles';
import { createSpring } from './motion/spring';
import { AUDIO, INTERACTION, MOTION, QUALITY, RENDER, SPEED } from './core/constants';
import { createOverlay } from './ui/overlay';
import { createCurtain } from './ui/curtain';
import { createSettingsMenu } from './ui/settingsMenu';
import { createModeToggle } from './ui/modeToggle';
import { createVehiclePicker, parseVehicleHash } from './ui/vehiclePicker';
import { createWeatherBadge } from './ui/weatherBadge';
import { createWeatherSource } from './weather/openMeteo';
import { createWeatherDirector } from './weather/director';
import { BUS_NAMES, BUS_STORE_KEY, createMixer } from './audio/mixer';
import { createLayers } from './audio/layers';
import { createVolumeControl } from './ui/volume';
import { createRegistry } from './interaction/interactables';
import { createRaycast } from './interaction/raycast';
import { createFocusCamera } from './interaction/focusCamera';
import { createGunControl } from './ui/gunControl';
import { createHornControl } from './ui/hornControl';
import { createHotkeys } from './ui/hotkeys';
import { createSpotifyPanel } from './ui/spotifyPanel';
import { createRotatePrompt } from './ui/rotatePrompt';
import { createFullscreen } from './ui/fullscreen';
import { kindLabel } from './weather/wmo';
import * as THREE from 'three';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const rig = createRenderer(canvas);
const loop = createLoop();
// Preferences persist under one namespaced key; system hints seed anything unset.
const prefs = loadPrefs();
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
const store = createStore({
  ...defaultState,
  reducedMotion: prefs.reducedMotion ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  // Parked, always. `#mode=` is for screenshots and is the only thing that says otherwise.
  mode: parseModeHash(location.hash) ?? defaultState.mode,
  masterVolume: prefs.masterVolume ?? defaultState.masterVolume,
  volumeEngine: prefs.volumeEngine ?? defaultState.volumeEngine,
  volumeWeather: prefs.volumeWeather ?? defaultState.volumeWeather,
  volumeAmbience: prefs.volumeAmbience ?? defaultState.volumeAmbience,
  volumeMusic: prefs.volumeMusic ?? defaultState.volumeMusic,
  quality: prefs.quality ?? (coarsePointer ? 'low' : 'high'),
});
bindPersistence(store);
const qualityWasChosen = prefs.quality !== undefined;
const stage = createStage();
const iso = createIsoCamera();

// The places the vehicle can stand in, behind one face; see world/world.ts and worlds.ts.
// Parked is the lot, anything else is the roadside.
const aniso = rig.renderer.capabilities.getMaxAnisotropy();
const world = createWorlds(createRoadWorld(aniso), createLot(aniso));
stage.slab.add(world.group);
world.show(engineOn(store.get().mode) ? 'road' : 'lot');

const lighting = createLighting();
stage.scene.add(lighting.group);

// Boot precedence: #vehicle= beats the stored preference, which beats the hatchback.
const bootId = parseVehicleHash(location.hash) ?? prefs.vehicle ?? defaultState.vehicle;
store.set({ vehicle: bootId });
const bootSpec = VEHICLES[bootId];
let car = createVehicle(stage, bootSpec);
world.setVehicle(bootId);
iso.setFraming({
  target: new THREE.Vector3(...bootSpec.camera.target),
  viewSize: bootSpec.camera.viewSize,
  minViewWidth: bootSpec.camera.minViewWidth,
});
lighting.setVehicle(bootSpec);

const overlay = createOverlay(store);
const curtain = createCurtain(overlay);
// One keyboard for the whole app: every control binds its key here rather than bringing its own
// listener and its own copy of the guards, and the shortcut list is this read back.
const hotkeys = createHotkeys();
// The controls row is row-reverse, so the first one appended sits furthest right.
createSettingsMenu(overlay, store, hotkeys);
const modeControl = createModeToggle(overlay, store, hotkeys);
const picker = createVehiclePicker(overlay, store, hotkeys);
createVolumeControl(overlay, store, hotkeys);
const weather = createWeatherSource(store);
createWeatherBadge(overlay, store, weather);
// A phone on its side is offered full screen once a visit, with a way back out.
const fullscreen = createFullscreen(overlay);
const director = createWeatherDirector({ store, stage, lighting, world, car });
weather.start();

// Sound: one context, unlocked by the first gesture; layers follow the same drivers as the scene.
const mixer = createMixer();
const layers = createLayers(mixer, bootSpec.audio);
mixer.setVolume(store.get().masterVolume);
store.subscribe('masterVolume', (v) => mixer.setVolume(v));
// Group levels. The buses do not exist until the first gesture creates the context, so the
// mixer holds these until then rather than dropping a preference restored at boot.
for (const b of BUS_NAMES) {
  const key = BUS_STORE_KEY[b];
  mixer.setBusVolume(b, store.get()[key]);
  store.subscribe(key, (v) => mixer.setBusVolume(b, v));
}
director.onThunder((strength) => layers.thunder(strength));

// Web Audio needs a user gesture, and the start screen that used to supply one is gone: the app
// opens parked, which is the still, silent diorama that screen was standing in front of. Any
// first press or click will do — resume() is idempotent, and pulling out calls it again.
const unlock = () => void mixer.resume();
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

// Interaction: the registry proves the seam; v1 registers exactly one thing.
const registry = createRegistry();
// Same id on every vehicle, so the Spotify panel's literal test and the README's
// "how to add an interactable" guide stay true.
const registerRadio = (c: Vehicle, spec: VehicleSpec): (() => void) =>
  registry.register({
    id: 'radio',
    hitbox: c.radio.hitbox,
    label: 'Radio',
    focus: {
      target: c.radio.face.clone().add(new THREE.Vector3(...spec.anchors.radioFocusOffset)),
      // radioZoom is a multiplier against viewSize, so it scales with the framing.
      zoom: spec.camera.radioZoom,
      azimuthOffset: 0,
    },
    onFocus() {
      car.radio.setHover(false);
    },
    onBlur() {},
  });
let unregisterRadio = registerRadio(car, bootSpec);
const raycast = createRaycast(canvas, iso, registry, store, overlay.panels, (id) => car.radio.setHover(id === 'radio'));
createFocusCamera(iso, registry, store);
// Only one vehicle has a gun; on the other three this registers nothing and listens for a key
// that will never do anything.
const gunControl = createGunControl(store, registry, hotkeys, () => layers.gunshot());
gunControl.setVehicle(car);
// Every vehicle has a horn, so unlike the gun this always has something to point at.
const hornControl = createHornControl(registry, hotkeys, (on) => layers.horn(on));
hornControl.setVehicle(car);
// R is the radio the same way clicking it is: it sets the focus the panel watches, and pressing
// it again is the way back out, which is what Escape already does from the focus camera. The
// radio has accessory power, so this works parked.
hotkeys.register({
  key: 'r',
  label: 'R',
  hint: 'Open the radio',
  onDown: () => store.set({ focusedObject: store.get().focusedObject === 'radio' ? null : 'radio' }),
});
// One stable vector the panel keeps forever; a swap copies the new anchor into it.
const radioAnchor = new THREE.Vector3().copy(car.radio.face);
const spotify = createSpotifyPanel(overlay, store, iso, radioAnchor, canvas, weather);
store.subscribe('focusedObject', (id) => mixer.duck(id ? AUDIO.DUCK : 1, 400));

// The radio LCD shows the time and the outside temperature. It has accessory power, so in
// every mode.
let lcdTimer = 0;
const updateLcd = () => {
  const st = store.get();
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const w = st.weather;
  car.radio.setLcd(`${hh}:${mm}`, w ? `${Math.round(w.temperatureC)}°C  ${kindLabel(w.kind, w.isDay)}` : 'finding weather');
};

rig.onResize((w, h) => iso.resize(w, h));
// Parallax follows the pointer on desktops; on touch devices it stays off.
if (!coarsePointer) {
  window.addEventListener('pointermove', (e) => {
    iso.setPointer((e.clientX / rig.width) * 2 - 1, -(e.clientY / rig.height) * 2 + 1);
  });
}

// Quality: derived from a startup frame-time probe unless the user has chosen; low quality
// drops the pixel ratio, shrinks the shadow map and thins precipitation (see director).
const applyQuality = (q: 'low' | 'high') => {
  car.setQuality(q);
  rig.renderer.setPixelRatio(q === 'low' ? 1 : Math.min(window.devicePixelRatio, RENDER.MAX_PIXEL_RATIO));
  const size = q === 'low' ? QUALITY.SHADOW_MAP_LOW : QUALITY.SHADOW_MAP_HIGH;
  if (lighting.key.shadow.mapSize.x !== size) {
    lighting.key.shadow.mapSize.set(size, size);
    lighting.key.shadow.map?.dispose();
    lighting.key.shadow.map = null;
  }
};
applyQuality(store.get().quality);
store.subscribe('quality', applyQuality);
// The mode on screen. It lags the store's by a curtain when the world has to change under
// the vehicle, the way `car` lags `store.vehicle` during a swap; everything the tick reads
// comes from here, and the store's value is the request.
let shownMode: Mode = store.get().mode;

// The probe measures the treadmill, and parked there is none: it would grade the lot and then
// be surprised by the road. So it starts armed only if the app booted moving, and is armed
// again on the first pull-out and on every vehicle swap, unless the user has pinned quality.
let probeT = 0;
let probeAcc = 0;
let probeN = 0;
let probeDone = true;
const armProbe = () => {
  if (qualityWasChosen || coarsePointer) return;
  probeDone = false;
  probeT = 0;
  probeAcc = 0;
  probeN = 0;
};
if (engineOn(shownMode)) armProbe();

const debug = createDebugStats(overlay);

/**
 * Switching vehicles, behind a curtain. The screen fades to black and only then does anything
 * move: the camera jumps to the new framing, the body is built or revealed, its programs are
 * linked, and one frame is drawn. What the fade back reveals is therefore always a finished
 * vehicle. The full crank is still reserved for the first ignition of a session.
 *
 * Built vehicles are cached, hidden, for the rest of the session: three hidden subtrees cost
 * one visibility test each in projectObject and keep their shader programs alive, so every
 * swap after the first has nothing left to link.
 */
const cache = new Map<VehicleId, Vehicle>([[bootId, car]]);
// Tracked separately from car.id: until every vehicle has its own spec, two ids can share one.
let currentVehicleId: VehicleId = bootId;
// One flag for both things that hold the curtain — a vehicle swap and a mode change across
// Park — so neither can start while the other has the screen black.
let transitioning = false;
let pendingVehicle: VehicleId | null = null;
let lastLights = 0;

/**
 * Resolves once the scene has actually reached the screen: one frame to render it, a second to
 * be sure that frame was presented. The timeout is there because a hidden tab stops
 * requestAnimationFrame entirely, and a swap must not be able to strand the curtain.
 */
const drawn = () =>
  new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, 1000);
  });

/** Whatever was asked for while the curtain was down, now that it is up. */
const drain = () => {
  if (pendingVehicle !== null) {
    const p = pendingVehicle;
    pendingVehicle = null;
    void swapVehicle(p);
    return;
  }
  if (store.get().mode !== shownMode) void changeMode(store.get().mode);
};

async function swapVehicle(id: VehicleId): Promise<void> {
  if (currentVehicleId === id) return;
  if (transitioning) {
    pendingVehicle = id; // coalesce, do not queue
    return;
  }
  transitioning = true;
  picker.setBusy(true);
  const spec = VEHICLES[id];
  const st = store.get();
  const fade = st.reducedMotion ? INTERACTION.SWAP_FADE_MS / 2 : INTERACTION.SWAP_FADE_MS;

  try {
    // Let go of everything that holds the outgoing vehicle.
    store.set({ focusedObject: null });
    unregisterRadio();
    delete car.radio.hitbox.userData.interactableId;
    raycast.clearHover();

    await curtain.cover(fade);

    // Nothing below this line is on screen, so the camera jumps instead of sliding.
    iso.setFraming({
      target: new THREE.Vector3(...spec.camera.target),
      viewSize: spec.camera.viewSize,
      minViewWidth: spec.camera.minViewWidth,
    });
    void iso.reset(0);

    let next = cache.get(id);
    if (!next) {
      next = createVehicle(stage, spec);
      cache.set(id, next);
    }
    next.setQuality(st.quality);
    next.seedLights(lastLights);

    // The exchange.
    car.setVisible(false);
    next.setVisible(true);
    car = next;
    currentVehicleId = id;
    unregisterRadio = registerRadio(car, spec);
    gunControl.setVehicle(car);
    hornControl.setVehicle(car);
    radioAnchor.copy(car.radio.face);
    director.setVehicle(spec, car);
    lighting.setVehicle(spec);
    world.setVehicle(id);
    // Must precede any mode change: the store notifies synchronously, so the new vehicle
    // would otherwise crank with the old one's starter.
    layers.setEngineProfile(spec.audio);
    if (engineOn(shownMode)) car.ignite(); // needle sweep and the dip, without the crank
    updateLcd();
    // The hitbox is raycast before the next render, so give it a world matrix now.
    stage.bodyRig.updateMatrixWorld(true);
    (window as unknown as { shotgun: { car: Vehicle } }).shotgun.car = car;
    // Let the probe re-measure for the new body.
    if (engineOn(shownMode)) armProbe();

    // "Loaded" means linked and drawn. compile() walks the scene with traverseVisible, so this
    // has to follow the exchange rather than precede it — warming the programs of the body that
    // is on its way out warms nothing at all.
    await rig.renderer.compileAsync(stage.scene, iso.camera);
    await drawn();
  } catch (err) {
    // A swap that throws must not strand the app behind a black screen with the picker
    // permanently busy. Whatever went wrong, the curtain comes up and the controls come back.
    //
    // The teardown above already released the radio and the gun, so whichever vehicle we are
    // left standing on has to get them back — otherwise the failure costs the session every
    // interactable it had, silently, and only the curtain would look recovered.
    console.error('[swap] failed', err);
    unregisterRadio();
    unregisterRadio = registerRadio(car, VEHICLES[currentVehicleId]);
    gunControl.setVehicle(car);
    hornControl.setVehicle(car);
  } finally {
    await curtain.reveal(fade);
    transitioning = false;
    picker.setBusy(false);
  }
  drain();
}

store.subscribe('vehicle', (id) => void swapVehicle(id));

const modeSpring = createSpring(0);
const engineSpring = createSpring(0);
const speedSpring = createSpring(0);

/**
 * Changing mode. Chill ⇄ Focus is what it always was: the springs get new targets and the
 * world speeds up or coasts. Into or out of Park the world under the vehicle changes, and that
 * happens behind the same curtain a vehicle swap uses — the engine cranks in the dark, and the
 * fade back reveals the roadside with it already running; or the treadmill is simply gone,
 * the speed reset rather than sprung down, and the note dies as the lot comes up.
 */
async function changeMode(target: Mode): Promise<void> {
  if (target === shownMode) return;
  if (transitioning) return; // drain() picks the latest request up when the curtain is back
  if (engineOn(target) === engineOn(shownMode)) {
    shownMode = target;
    return;
  }
  transitioning = true;
  modeControl.setBusy(true);
  // A long fade out — leaving somewhere — and the swap's fade back in.
  const calm = store.get().reducedMotion;
  const out = calm ? INTERACTION.MODE_FADE_MS / 2 : INTERACTION.MODE_FADE_MS;
  const fade = calm ? INTERACTION.SWAP_FADE_MS / 2 : INTERACTION.SWAP_FADE_MS;
  try {
    store.set({ focusedObject: null });
    raycast.clearHover();
    await curtain.cover(out);

    const pullingOut = shownMode === 'park';
    shownMode = target;
    world.show(pullingOut ? 'road' : 'lot');
    if (pullingOut) {
      // The first gesture already resumed the context; this is for a boot that had none.
      void mixer.resume().then(() => layers.crank());
      car.ignite();
      armProbe();
    } else {
      // Park must not inherit a rolling treadmill or a body still settling out of Focus.
      speedSpring.reset(0);
      modeSpring.reset(0);
    }
    updateLcd();
    // The first time a world is shown its programs have never linked; the same reasoning as a
    // vehicle swap, and the same call.
    await rig.renderer.compileAsync(stage.scene, iso.camera);
    await drawn();
  } catch (err) {
    console.error('[mode] failed', err);
  } finally {
    await curtain.reveal(fade);
    transitioning = false;
    modeControl.setBusy(false);
  }
  drain();
}

store.subscribe('mode', (m) => void changeMode(m));
const stats = { calls: 0, triangles: 0, fps: 0 };
let fpsAcc = 0;
let fpsN = 0;

loop.onTick((dt, elapsed) => {
  const st = store.get();
  const running = engineOn(shownMode);
  const blend = modeSpring.step(shownMode === 'focus' ? 1 : 0, dt, MOTION.MODE_OMEGA);
  // The engine catches slower than it dies.
  const engine = engineSpring.step(running ? 1 : 0, dt, running ? MOTION.ENGINE_OMEGA : MOTION.ENGINE_OFF_OMEGA);
  const ampScale = (st.reducedMotion ? MOTION.REDUCED_SCALE : 1) * (st.focusedObject ? MOTION.FOCUSED_OBJECT_SCALE : 1);

  // One damped speed value feeds road scroll, scenery, wheel spin, motion and (later) audio.
  const speed = speedSpring.step(shownMode === 'focus' ? SPEED.FOCUS : 0, dt, SPEED.OMEGA);
  const speedAccel = speedSpring.v;
  world.update(dt, speed);
  const look = director.update(dt, speed, engine);
  rig.setNightExposure(look.night);

  const lights = car.update({
    dt,
    elapsed,
    blend,
    engine,
    accessory: 1,
    speed,
    speedAccel,
    ampScale,
    bumpsEnabled: !st.reducedMotion,
    mode: shownMode,
    reducedMotion: st.reducedMotion,
    coldBoost: look.coldBoost,
  });
  lastLights = lights;
  // Accessory power is always on once the app is up; the dash and the headlights follow the engine.
  lighting.setPower({ accessory: 1, ignition: lights });

  layers.update(dt, {
    engine,
    blend,
    speed,
    rain: look.rain,
    windKmh: st.weather?.windSpeedKmh ?? 8,
    night: look.night,
    rpm: car.rig.output.rpm,
  });

  raycast.update();
  spotify.update();
  lcdTimer += dt;
  if (lcdTimer > 1) {
    lcdTimer = 0;
    updateLcd();
  }

  iso.setParallaxEnabled(!st.reducedMotion && !st.focusedObject && !coarsePointer);
  iso.update(dt);
  rig.renderer.render(stage.scene, iso.camera);

  if (!probeDone && running) {
    probeT += dt;
    if (probeT > QUALITY.PROBE_SKIP_S) {
      probeAcc += dt;
      probeN++;
    }
    if (probeT > QUALITY.PROBE_SKIP_S + QUALITY.PROBE_SECONDS) {
      probeDone = true;
      const avgMs = (probeAcc / Math.max(1, probeN)) * 1000;
      if (avgMs > QUALITY.LOW_ABOVE_MS) store.set({ quality: 'low' });
    }
  }
  debug?.update(dt, rig.renderer, st.quality);

  stats.calls = rig.renderer.info.render.calls;
  stats.triangles = rig.renderer.info.render.triangles;
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc >= 1) {
    stats.fps = Math.round(fpsN / fpsAcc);
    fpsAcc = 0;
    fpsN = 0;
  }
});
loop.start();

// A phone held upright gets the rotate prompt, and behind it the app stops as a hidden tab does:
// no frames, no sound. A resize clears the canvas, so while stopped one still is drawn after
// each, and the dimmed screen goes on showing where it stopped.
let upright = false;
const still = () => {
  if (upright) rig.renderer.render(stage.scene, iso.camera);
};
rig.onResize(still);
const rotatePrompt = createRotatePrompt(overlay, store, (u) => {
  upright = u;
  mixer.hold(u);
  if (u) loop.stop();
  else loop.start();
  still();
});

// Hot reload: tear the vehicle down the same way a swap will, closing a working agreement
// the repo has been violating since v0.1.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    loop.stop();
    rotatePrompt.dispose();
    fullscreen.dispose();
    hotkeys.dispose();
    car.dispose();
    mixer.dispose();
    rig.dispose();
  });
}

(window as unknown as { shotgun: unknown }).shotgun = { store, loop, stage, iso, car, lighting, world, weather, director, shownMode: () => shownMode, renderer: rig.renderer, mixer, layers, registry, raycast, createVehicle, VEHICLES };
(window as unknown as { __shotgunStats: unknown }).__shotgunStats = stats;
