import * as THREE from 'three';
import { createRenderer } from './core/renderer';
import { createLoop } from './core/loop';
import { createStore, defaultState } from './core/store';

// Phase 0: scaffold check — a spinning reference cube. Replaced by the stage in Phase 1.
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const rig = createRenderer(canvas);
const loop = createLoop();
const store = createStore(defaultState);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9aa2a6');
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(3, 2.5, 3);
camera.lookAt(0, 0, 0);
rig.onResize((w, h) => {
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: '#7a9e9f', roughness: 0.7 }),
);
cube.castShadow = true;
scene.add(cube);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 6),
  new THREE.MeshStandardMaterial({ color: '#c6b49a', roughness: 0.9 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.5;
ground.receiveShadow = true;
scene.add(ground);

scene.add(new THREE.HemisphereLight('#dfe8ee', '#5a4e44', 0.8));
const sun = new THREE.DirectionalLight('#fff1dc', 2.2);
sun.position.set(4, 6, 2);
sun.castShadow = true;
scene.add(sun);

loop.onTick((dt) => {
  cube.rotation.y += dt * 0.8;
  cube.rotation.x += dt * 0.3;
  rig.renderer.render(scene, camera);
});
loop.start();

// Expose for debugging in the console.
(window as unknown as { shotgun: unknown }).shotgun = { store, loop };
