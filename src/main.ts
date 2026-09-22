import { createRenderer } from './core/renderer';
import { createLoop } from './core/loop';
import { createStore, defaultState } from './core/store';
import { createIsoCamera } from './core/isoCamera';
import { createStage } from './scene/stage';
import { createRoad } from './scene/world/road';
import { createScenery } from './scene/world/scenery';
import { createLighting } from './scene/lighting';
import { createCar } from './scene/car/car';
import { createSpring } from './motion/spring';
import { AUDIO, MOTION, SPEED } from './core/constants';
import { createOverlay } from './ui/overlay';
import { createStartScreen } from './ui/startScreen';
import { createModeToggle } from './ui/modeToggle';
import { createWeatherBadge } from './ui/weatherBadge';
import { createWeatherSource } from './weather/openMeteo';
import { createWeatherDirector } from './weather/director';
import { createMixer } from './audio/mixer';
import { createLayers } from './audio/layers';
import { createVolumeControl } from './ui/volume';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const rig = createRenderer(canvas);
const loop = createLoop();
const store = createStore({
  ...defaultState,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
});
const stage = createStage();
const iso = createIsoCamera();

const road = createRoad(rig.renderer.capabilities.getMaxAnisotropy());
stage.slab.add(road.mesh);
const scenery = createScenery();
stage.slab.add(scenery.group);

const lighting = createLighting();
stage.scene.add(lighting.group);

const car = createCar(stage);

const overlay = createOverlay(store);
createModeToggle(overlay, store);
createVolumeControl(overlay, store);
createStartScreen(overlay, store);
const weather = createWeatherSource(store);
createWeatherBadge(overlay, store, () => void weather.refresh(true));
const director = createWeatherDirector({ store, stage, lighting, road, scenery, car });
weather.start();

// Sound: one context, unlocked by the start gesture; layers follow the same drivers as the scene.
const mixer = createMixer();
const layers = createLayers(mixer);
mixer.setVolume(store.get().masterVolume);
store.subscribe('masterVolume', (v) => mixer.setVolume(v));
director.onThunder((strength) => layers.thunder(strength));

store.subscribe('engineOn', (on) => {
  if (!on) return;
  void mixer.resume().then(() => layers.crank());
  car.ignite();
});

rig.onResize((w, h) => iso.resize(w, h));
window.addEventListener('pointermove', (e) => {
  iso.setPointer((e.clientX / rig.width) * 2 - 1, -(e.clientY / rig.height) * 2 + 1);
});

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

  iso.setParallaxEnabled(!st.reducedMotion && !st.focusedObject);
  iso.update(dt);
  rig.renderer.render(stage.scene, iso.camera);

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

(window as unknown as { shotgun: unknown }).shotgun = { store, loop, stage, iso, car, lighting, scenery, road, weather, director, renderer: rig.renderer, mixer, layers };
(window as unknown as { __shotgunStats: unknown }).__shotgunStats = stats;
