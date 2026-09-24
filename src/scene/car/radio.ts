import * as THREE from 'three';
import type { VehicleSpec } from '../../core/vehicles';
import { PALETTE } from '../../core/constants';
import { Builder } from './parts';
import type { CarMaterials } from './parts';

/**
 * Head unit in the centre console: faceplate, amber LCD on its own canvas texture, two knobs,
 * six preset buttons. The hitbox is an invisible oversized proxy for the raycaster.
 *
 * The faceplate is a *panel*, and a panel needs something behind it. It used to be 0.30 × 0.12 —
 * nearly twice a double-DIN — floating at `radioFace`, which sits 5 to 8 cm proud of the console
 * on the hatchback and the roadster. From the push-in it read as a slab stuck to the dash with
 * nothing holding it up. It is now head-unit sized and carries a chassis back into the console,
 * so it is set into the dash rather than laid on top of it.
 */

export interface RadioRig {
  hitbox: THREE.Mesh;
  /** World point the camera centres on when the radio is focused. */
  face: THREE.Vector3;
  setLcd(top: string, bottom: string): void;
  /** 0..1 power — LCD glow. */
  setPower(k: number): void;
  /** Emissive lift while the pointer is over the radio. */
  setHover(on: boolean): void;
  dispose(): void;
}

/** Faceplate: height, and width across the car. A double-DIN is about 0.18 × 0.10. */
const FACE_H = 0.09;
const FACE_W = 0.22;
/** How far the body reaches back. Long enough to meet the console on every vehicle. */
const BODY_DEPTH = 0.12;

const LCD_W = 256;
const LCD_H = 64;

export function createRadio(b: Builder, m: CarMaterials, v: VehicleSpec): RadioRig {
  const [fx, fy, fz] = v.anchors.radioFace;

  // The body first: it reaches back from the faceplate into whatever console is behind it, so
  // the unit is mounted rather than stuck on.
  b.box(BODY_DEPTH, FACE_H - 0.012, FACE_W - 0.02, m.metalDark, { x: fx + BODY_DEPTH / 2, y: fy, z: fz });
  b.box(0.016, FACE_H, FACE_W, m.trim, { x: fx, y: fy, z: fz });
  const knobZ = FACE_W / 2 - 0.022;
  b.cylX(0.012, 0.014, m.hub, { x: fx - 0.012, y: fy - 0.012, z: fz - knobZ });
  b.cylX(0.012, 0.014, m.hub, { x: fx - 0.012, y: fy - 0.012, z: fz + knobZ });
  for (let i = 0; i < 6; i++) {
    b.box(0.006, 0.01, 0.016, m.rubber, { x: fx - 0.01, y: fy - 0.032, z: fz - 0.05 + i * 0.02 });
  }

  // LCD: canvas texture used as both colour and emissive map so it glows at night.
  const canvas = document.createElement('canvas');
  canvas.width = LCD_W;
  canvas.height = LCD_H;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const lcdMat = new THREE.MeshStandardMaterial({
    map: texture,
    emissive: '#ffffff',
    emissiveMap: texture,
    emissiveIntensity: 0,
    roughness: 0.4,
    metalness: 0,
  });
  const lcdGeom = new THREE.BoxGeometry(0.006, 0.032, FACE_W - 0.06);
  const lcd = new THREE.Mesh(lcdGeom, lcdMat);
  lcd.position.set(fx - 0.01, fy + 0.015, fz);
  lcd.name = 'radioLcd';
  b.dyn(lcd, lcdGeom);

  const draw = (top: string, bottom: string) => {
    ctx.fillStyle = PALETTE.LCD;
    ctx.fillRect(0, 0, LCD_W, LCD_H);
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let y = 0; y < LCD_H; y += 4) ctx.fillRect(0, y, LCD_W, 1);
    ctx.fillStyle = '#2A211C';
    ctx.font = '600 30px "SF Mono", Menlo, Consolas, "Courier New", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(top, 12, 22);
    ctx.font = '500 20px "SF Mono", Menlo, Consolas, "Courier New", monospace';
    ctx.fillText(bottom, 12, 48);
    texture.needsUpdate = true;
  };
  draw('SHOTGUN FM', 'engine off');

  // Hover glow: a soft additive sheet just in front of the faceplate.
  const glowGeom = new THREE.PlaneGeometry(FACE_W + 0.04, FACE_H + 0.04);
  glowGeom.rotateY(-Math.PI / 2);
  const glowMat = new THREE.MeshBasicMaterial({ color: '#E8D7B9', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.Mesh(glowGeom, glowMat);
  glow.position.set(fx - 0.014, fy, fz);
  glow.visible = false;
  glow.name = 'radioGlow';
  b.dyn(glow, glowGeom);

  // Hitbox: oversized, invisible, faces the cabin. Sized from the spec, which carried the
  // numbers for all three vehicles while this quietly used the hatchback's for every one.
  const hitGeom = new THREE.BoxGeometry(...v.anchors.radioHitbox);
  const hitbox = new THREE.Mesh(hitGeom, new THREE.MeshBasicMaterial({ color: '#ff00ff' }));
  hitbox.position.set(fx + 0.02, fy, fz);
  hitbox.visible = false;
  hitbox.name = 'hitbox:radio';
  b.dyn(hitbox, hitGeom);

  let power = 0;
  let hover = false;
  return {
    hitbox,
    face: new THREE.Vector3(fx, fy, fz),
    setLcd: draw,
    setPower(k) {
      power = k;
      lcdMat.emissiveIntensity = power * 0.8 + (hover ? 0.5 : 0);
    },
    setHover(on) {
      hover = on;
      glow.visible = on;
      glowMat.opacity = on ? 0.22 : 0;
      lcdMat.emissiveIntensity = power * 0.8 + (hover ? 0.5 : 0);
    },
    dispose() {
      texture.dispose();
      lcdMat.dispose();
      glowMat.dispose();
      (hitbox.material as THREE.Material).dispose();
    },
  };
}
