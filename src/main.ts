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
import { MOTION, SPEED } from './core/constants';
import { createOverlay } from './ui/overlay';
import { createStartScreen } from './ui/startScreen';
import { createModeToggle } from './ui/modeToggle';
import { createWeatherBadge } from './ui/weatherBadge';
import { createWeatherSource } from './weather/openMeteo';

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
stage.sky.setColors('#7FA3B8', '#C6B49A');
stage.setFog(stage.sky.fogColor, 0.02);
stage.scene.background = stage.sky.fogColor;

const car = createCar(stage);

const overlay = createOverlay(store);
createModeToggle(overlay, store);
createStartScreen(overlay, store);
const weather = createWeatherSource(store);
createWeatherBadge(overlay, store, () => void weather.refresh(true));
weather.start();

store.subscribe('engineOn', (on) => {
  if (on) car.ignite();
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
    coldBoost: 1,
  });
  lighting.setIgnition(lights);

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

(window as unknown as { shotgun: unknown }).shotgun = { store, loop, stage, iso, car, lighting, scenery, road, weather };
(window as unknown as { __shotgunStats: unknown }).__shotgunStats = stats;
