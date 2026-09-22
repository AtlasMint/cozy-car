import * as THREE from 'three';
import { CAMERA } from './constants';
import { damp, easeInOutCubic, lerp } from '../util/math';

interface Tween {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromZoom: number;
  toZoom: number;
  t: number;
  duration: number;
  resolve: () => void;
}

export interface IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  /** Current visible world height at zoom 1. */
  readonly viewSize: number;
  /** Pointer in normalized device coords (−1..1). Drives the parallax nudge. */
  setPointer(nx: number, ny: number): void;
  setParallaxEnabled(on: boolean): void;
  /** Slide the look-at point and zoom over `ms`. Phase 9's push-in and the return both use this. */
  frame(target: THREE.Vector3, zoom: number, ms: number): Promise<void>;
  /** Return to the default pose. */
  reset(ms: number): Promise<void>;
  resize(width: number, height: number): void;
  update(dt: number): void;
  /** World point → normalized device coords. */
  project(p: THREE.Vector3, out: THREE.Vector2): THREE.Vector2;
}

export function createIsoCamera(): IsoCamera {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, CAMERA.NEAR, CAMERA.FAR);
  const home = new THREE.Vector3(...CAMERA.TARGET);
  const target = home.clone();
  const dir = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  let viewSize: number = CAMERA.VIEW_SIZE;
  let aspect = 16 / 9;
  let zoom = 1;
  let pointerX = 0;
  let pointerY = 0;
  let azOff = 0;
  let elOff = 0;
  let parallaxOn = true;
  let tween: Tween | null = null;

  const applyFrustum = () => {
    viewSize = Math.max(CAMERA.VIEW_SIZE, CAMERA.MIN_VIEW_WIDTH / aspect);
    const halfH = viewSize / 2;
    const halfW = halfH * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  };

  const place = () => {
    const az = CAMERA.AZIMUTH + azOff;
    const el = CAMERA.ELEVATION + elOff;
    dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    camera.position.copy(target).addScaledVector(dir, CAMERA.DISTANCE);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };

  const startTween = (to: THREE.Vector3, toZoom: number, ms: number) =>
    new Promise<void>((resolve) => {
      if (tween) tween.resolve();
      if (ms <= 0) {
        target.copy(to);
        zoom = toZoom;
        applyFrustum();
        tween = null;
        resolve();
        return;
      }
      tween = {
        fromTarget: target.clone(),
        toTarget: to.clone(),
        fromZoom: zoom,
        toZoom,
        t: 0,
        duration: ms / 1000,
        resolve,
      };
    });

  applyFrustum();
  place();

  return {
    camera,
    get viewSize() {
      return viewSize;
    },
    setPointer(nx, ny) {
      pointerX = THREE.MathUtils.clamp(nx, -1, 1);
      pointerY = THREE.MathUtils.clamp(ny, -1, 1);
    },
    setParallaxEnabled(on) {
      parallaxOn = on;
    },
    frame: startTween,
    reset(ms) {
      return startTween(home, 1, ms);
    },
    resize(width, height) {
      aspect = Math.max(0.2, width / Math.max(1, height));
      applyFrustum();
    },
    update(dt) {
      const wantAz = parallaxOn ? pointerX * CAMERA.PARALLAX_AZ : 0;
      const wantEl = parallaxOn ? -pointerY * CAMERA.PARALLAX_EL : 0;
      azOff = damp(azOff, wantAz, CAMERA.PARALLAX_LAMBDA, dt);
      elOff = damp(elOff, wantEl, CAMERA.PARALLAX_LAMBDA, dt);

      if (tween) {
        tween.t += dt;
        const k = easeInOutCubic(tween.t / tween.duration);
        target.lerpVectors(tween.fromTarget, tween.toTarget, k);
        zoom = lerp(tween.fromZoom, tween.toZoom, k);
        applyFrustum();
        if (tween.t >= tween.duration) {
          target.copy(tween.toTarget);
          zoom = tween.toZoom;
          applyFrustum();
          tween.resolve();
          tween = null;
        }
      }
      place();
    },
    project(p, out) {
      tmp.copy(p).project(camera);
      return out.set(tmp.x, tmp.y);
    },
  };
}
