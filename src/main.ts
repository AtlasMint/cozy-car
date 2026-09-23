import { createRenderer } from './core/renderer';
import { createLoop } from './core/loop';
import { createStore, defaultState } from './core/store';
import { bindPersistence, loadPrefs } from './core/persist';
import { createDebugStats } from './ui/debugStats';
import { createIsoCamera } from './core/isoCamera';
import { createStage } from './scene/stage';
import { createRoad } from './scene/world/road';
import { createScenery } from './scene/world/scenery';
import { createLighting } from './scene/lighting';
import { createVehicle } from './scene/car/car';
import { VEHICLES } from './core/vehicles';
import { createSpring } from './motion/spring';
import { AUDIO, INTERACTION, MOTION, QUALITY, RENDER, SPEED } from './core/constants';
import { createOverlay } from './ui/overlay';
import { createStartScreen } from './ui/startScreen';
import { createModeToggle } from './ui/modeToggle';
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

const bootSpec = VEHICLES.hatchback;
const car = createVehicle(stage, bootSpec);
iso.setFraming({
  target: new THREE.Vector3(...bootSpec.camera.target),
  viewSize: bootSpec.camera.viewSize,
  minViewWidth: bootSpec.camera.minViewWidth,
});
lighting.setVehicle(bootSpec);

const overlay = createOverlay(store);
createModeToggle(overlay, store);
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
registry.register({
  id: 'radio',
  hitbox: car.radio.hitbox,
  label: 'Radio',
  focus: { target: car.radio.face.clone().add(new THREE.Vector3(0.02, 0.0, 0.06)), zoom: INTERACTION.RADIO_ZOOM, azimuthOffset: 0 },
  onFocus() {
    car.radio.setHover(false);
  },
  onBlur() {},
});
const raycast = createRaycast(canvas, iso, registry, store, overlay.panels, (id) => car.radio.setHover(id === 'radio'));
createFocusCamera(iso, registry, store);
const spotify = createSpotifyPanel(overlay, store, iso, car.radio.face, canvas);
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
