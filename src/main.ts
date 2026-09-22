import * as THREE from 'three';
import { createRenderer } from './core/renderer';
import { createLoop } from './core/loop';
import { createStore, defaultState } from './core/store';
import { createIsoCamera } from './core/isoCamera';
import { createStage } from './scene/stage';
import { createRoad } from './scene/world/road';
import { createLighting } from './scene/lighting';
import { createCar } from './scene/car/car';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const rig = createRenderer(canvas);
const loop = createLoop();
const store = createStore(defaultState);
const stage = createStage();
const iso = createIsoCamera();

const road = createRoad(rig.renderer.capabilities.getMaxAnisotropy());
stage.slab.add(road.mesh);

const lighting = createLighting();
stage.scene.add(lighting.group);

stage.sky.setColors('#7FA3B8', '#C6B49A');
stage.setFog(stage.sky.fogColor, 0.02);
stage.scene.background = stage.sky.fogColor;

const car = createCar(stage);

rig.onResize((w, h) => iso.resize(w, h));

window.addEventListener('pointermove', (e) => {
  iso.setPointer((e.clientX / rig.width) * 2 - 1, -(e.clientY / rig.height) * 2 + 1);
});

const stats = { calls: 0, triangles: 0, fps: 0 };
let fpsAcc = 0;
let fpsN = 0;
loop.onTick((dt, elapsed) => {
  const state = store.get();
  iso.update(dt);
  car.idle.update(dt, elapsed, stage.bodyRig.position.y, state.mode, state.reducedMotion);
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

(window as unknown as { shotgun: unknown }).shotgun = { store, loop, stage, iso, car };
(window as unknown as { __shotgunStats: unknown }).__shotgunStats = stats;
