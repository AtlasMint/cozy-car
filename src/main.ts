import { createRenderer } from './core/renderer';
import { createLoop } from './core/loop';
import { createStore, defaultState, type VehicleId } from './core/store';
import { bindPersistence, loadPrefs } from './core/persist';
import { createDebugStats } from './ui/debugStats';
import { createIsoCamera } from './core/isoCamera';
import { createStage } from './scene/stage';
import { createRoad } from './scene/world/road';
import { createScenery } from './scene/world/scenery';
import { createLighting } from './scene/lighting';
import { createVehicle, type Vehicle } from './scene/car/car';
import { VEHICLES, type VehicleSpec } from './core/vehicles';
import { createSpring } from './motion/spring';
import { AUDIO, INTERACTION, MOTION, QUALITY, RENDER, SPEED } from './core/constants';
import { createOverlay } from './ui/overlay';
import { createCurtain } from './ui/curtain';
import { createStartScreen } from './ui/startScreen';
import { createModeToggle } from './ui/modeToggle';
import { createVehiclePicker, parseVehicleHash } from './ui/vehiclePicker';
import { createWeatherBadge } from './ui/weatherBadge';
import { createWeatherSource } from './weather/openMeteo';
import { createWeatherDirector } from './weather/director';
import { createMixer } from './audio/mixer';
import { createLayers } from './audio/layers';
import { createVolumeControl } from './ui/volume';
import { createRegistry } from './interaction/interactables';
import { createRaycast } from './interaction/raycast';
import { createFocusCamera } from './interaction/focusCamera';
import { createSpotifyPanel } from './ui/spotifyPanel';
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
  mode: prefs.mode ?? defaultState.mode,
  masterVolume: prefs.masterVolume ?? defaultState.masterVolume,
  quality: prefs.quality ?? (coarsePointer ? 'low' : 'high'),
});
bindPersistence(store);
const qualityWasChosen = prefs.quality !== undefined;
const stage = createStage();
const iso = createIsoCamera();

const road = createRoad(rig.renderer.capabilities.getMaxAnisotropy());
stage.slab.add(road.mesh);
const scenery = createScenery();
stage.slab.add(scenery.group);

const lighting = createLighting();
stage.scene.add(lighting.group);

// Boot precedence: #vehicle= beats the stored preference, which beats the hatchback.
const bootId = parseVehicleHash(location.hash) ?? prefs.vehicle ?? defaultState.vehicle;
store.set({ vehicle: bootId });
const bootSpec = VEHICLES[bootId];
let car = createVehicle(stage, bootSpec);
iso.setFraming({
  target: new THREE.Vector3(...bootSpec.camera.target),
  viewSize: bootSpec.camera.viewSize,
  minViewWidth: bootSpec.camera.minViewWidth,
});
lighting.setVehicle(bootSpec);

const overlay = createOverlay(store);
const curtain = createCurtain(overlay);
createModeToggle(overlay, store);
const picker = createVehiclePicker(overlay, store);
createVolumeControl(overlay, store);
createStartScreen(overlay, store);
const weather = createWeatherSource(store);
createWeatherBadge(overlay, store, weather);
const director = createWeatherDirector({ store, stage, lighting, road, scenery, car });
weather.start();

// Sound: one context, unlocked by the start gesture; layers follow the same drivers as the scene.
const mixer = createMixer();
const layers = createLayers(mixer, bootSpec.audio);
mixer.setVolume(store.get().masterVolume);
store.subscribe('masterVolume', (v) => mixer.setVolume(v));
director.onThunder((strength) => layers.thunder(strength));

store.subscribe('engineOn', (on) => {
  if (!on) return;
  void mixer.resume().then(() => layers.crank());
  car.ignite();
});

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
// One stable vector the panel keeps forever; a swap copies the new anchor into it.
const radioAnchor = new THREE.Vector3().copy(car.radio.face);
const spotify = createSpotifyPanel(overlay, store, iso, radioAnchor, canvas);
store.subscribe('focusedObject', (id) => mixer.duck(id ? AUDIO.DUCK : 1, 400));

// The radio LCD shows the time and the outside temperature while idle.
let lcdTimer = 0;
const updateLcd = () => {
  const st = store.get();
  if (!st.engineOn) {
    car.radio.setLcd('SHOTGUN FM', 'engine off');
    return;
  }
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
let probeT = 0;
let probeAcc = 0;
let probeN = 0;
let probeDone = qualityWasChosen || coarsePointer;

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
let swapping = false;
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

async function swapVehicle(id: VehicleId): Promise<void> {
  if (currentVehicleId === id) return;
  if (swapping) {
    pendingVehicle = id; // coalesce, do not queue
    return;
  }
  swapping = true;
  picker.setBusy(true);
  const spec = VEHICLES[id];
  const st = store.get();
  const fade = st.reducedMotion ? INTERACTION.SWAP_FADE_MS / 2 : INTERACTION.SWAP_FADE_MS;

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
  radioAnchor.copy(car.radio.face);
  director.setVehicle(spec, car);
  lighting.setVehicle(spec);
  // Must precede any engineOn change: the store notifies synchronously, so the new vehicle
  // would otherwise crank with the old one's starter.
  layers.setEngineProfile(spec.audio);
  if (store.get().engineOn) car.ignite(); // needle sweep and the dip, without the crank
  updateLcd();
  // The hitbox is raycast before the next render, so give it a world matrix now.
  stage.bodyRig.updateMatrixWorld(true);
  (window as unknown as { shotgun: { car: Vehicle } }).shotgun.car = car;
  // Let the probe re-measure for the new body unless the user pinned quality.
  if (!qualityWasChosen && !coarsePointer) {
    probeDone = false;
    probeT = 0;
    probeAcc = 0;
    probeN = 0;
  }

  // "Loaded" means linked and drawn. compile() walks the scene with traverseVisible, so this
  // has to follow the exchange rather than precede it — warming the programs of the body that
  // is on its way out warms nothing at all.
  await rig.renderer.compileAsync(stage.scene, iso.camera);
  await drawn();

  await curtain.reveal(fade);
  swapping = false;
  picker.setBusy(false);
  if (pendingVehicle) {
    const p = pendingVehicle;
    pendingVehicle = null;
    void swapVehicle(p);
  }
}
store.subscribe('vehicle', (id) => void swapVehicle(id));

const modeSpring = createSpring(0);
const engineSpring = createSpring(0);
const speedSpring = createSpring(0);
const stats = { calls: 0, triangles: 0, fps: 0 };
let fpsAcc = 0;
let fpsN = 0;

loop.onTick((dt, elapsed) => {
  const st = store.get();
  const blend = modeSpring.step(st.mode === 'focus' ? 1 : 0, dt, MOTION.MODE_OMEGA);
  const engine = engineSpring.step(st.engineOn ? 1 : 0, dt, MOTION.ENGINE_OMEGA);
  const ampScale = (st.reducedMotion ? MOTION.REDUCED_SCALE : 1) * (st.focusedObject ? MOTION.FOCUSED_OBJECT_SCALE : 1);

  // One damped speed value feeds road scroll, scenery, wheel spin, motion and (later) audio.
  const speed = speedSpring.step(st.mode === 'focus' && st.engineOn ? SPEED.FOCUS : 0, dt, SPEED.OMEGA);
  const speedAccel = speedSpring.v;
  road.scroll(speed * dt);
  scenery.update(dt, speed);
  const look = director.update(dt, speed, engine);
  rig.setNightExposure(look.night);

  const lights = car.update({
    dt,
    elapsed,
    blend,
    engine,
    speed,
    speedAccel,
    ampScale,
    bumpsEnabled: !st.reducedMotion,
    mode: st.mode,
    reducedMotion: st.reducedMotion,
    coldBoost: look.coldBoost,
  });
  lastLights = lights;
  lighting.setIgnition(lights);

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

  if (!probeDone && st.engineOn) {
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

// Hot reload: tear the vehicle down the same way a swap will, closing a working agreement
// the repo has been violating since v0.1.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    loop.stop();
    car.dispose();
    mixer.dispose();
    rig.dispose();
  });
}

(window as unknown as { shotgun: unknown }).shotgun = { store, loop, stage, iso, car, lighting, scenery, road, weather, director, renderer: rig.renderer, mixer, layers, registry, raycast, createVehicle, VEHICLES };
(window as unknown as { __shotgunStats: unknown }).__shotgunStats = stats;
