import * as THREE from 'three';
import { createRenderer } from './core/renderer';
import { createLoop } from './core/loop';
import { createStore, defaultState } from './core/store';
import { createIsoCamera } from './core/isoCamera';
import { createStage } from './scene/stage';
import { createRoad } from './scene/world/road';
import { createLighting } from './scene/lighting';
import { PALETTE } from './core/constants';

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

// Phase 1 placeholder: a car-sized box on the body rig, replaced by the cutaway in Phase 2.
const placeholder = new THREE.Mesh(
  new THREE.BoxGeometry(3.8, 1.45, 1.65),
  new THREE.MeshStandardMaterial({ color: PALETTE.BODY, roughness: 0.7 }),
);
placeholder.position.set(0, 0.25 + 1.45 / 2, 0);
placeholder.castShadow = true;
placeholder.receiveShadow = true;
stage.bodyRig.add(placeholder);

rig.onResize((w, h) => iso.resize(w, h));

window.addEventListener('pointermove', (e) => {
  iso.setPointer((e.clientX / rig.width) * 2 - 1, -(e.clientY / rig.height) * 2 + 1);
});

loop.onTick((dt) => {
  iso.update(dt);
  rig.renderer.render(stage.scene, iso.camera);
});
loop.start();

(window as unknown as { shotgun: unknown }).shotgun = { store, loop, stage, iso };
