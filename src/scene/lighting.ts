import * as THREE from 'three';
import { CAR, WEATHER_FX } from '../core/constants';

/**
 * Lighting rig driven by the weather director. Exactly one light casts shadows (the key),
 * with a tight frustum around the car. Night drops the key toward a dim moon and lets the
 * amber cabin pocket dominate; headlights are additive cone meshes, tail-lights emissive,
 * and two point lights track the streetlight heads so Focus sweeps a sodium wash over the
 * roof every ~35 m.
 */
export interface LightLook {
  keyColor: THREE.Color;
  keyIntensity: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  night: number;
  flash: number;
}

export interface LightingRig {
  group: THREE.Group;
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  cabin: THREE.PointLight;
  dash: THREE.PointLight;
  setLook(look: LightLook): void;
  /** 0..1: dash glow and the warm cabin pocket come up with the engine. */
  setIgnition(k: number): void;
  /** 0..1 headlight cones and ground pool (night × ignition). */
  setHeadlights(k: number): void;
  updateStreetlights(heads: THREE.Vector3[], count: number, night: number): void;
  dispose(): void;
}

function poolTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 64, 4, 128, 64, 120);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 128);
  return new THREE.CanvasTexture(c);
}

export function createLighting(): LightingRig {
  const group = new THREE.Group();
  group.name = 'lighting';

  const hemi = new THREE.HemisphereLight('#dfe8ee', '#8a7a68', 1.1);
  group.add(hemi);

  const key = new THREE.DirectionalLight('#fff0d8', 2.4);
  // Front-left-above: daylight pours in through the cut and the shadow falls to screen-right.
  key.position.set(5, 8, -5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4.5;
  key.shadow.camera.right = 4.5;
  key.shadow.camera.top = 4.5;
  key.shadow.camera.bottom = -4.5;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 3;
  group.add(key, key.target);

  // The warm pocket: a cabin light and the amber dash glow. Neither casts shadows.
  const cabin = new THREE.PointLight('#FFB86B', 0.7, 3.5, 1.6);
  cabin.position.set(0.15, 1.15, 0.15);
  cabin.name = 'cabinLight';
  const dash = new THREE.PointLight('#C9884A', 0, 1.6, 1.8);
  dash.position.set(0.5, 0.92, 0.1);
  dash.name = 'dashLight';
  const bay = new THREE.PointLight('#FFE2B8', 0.9, 1.6, 1.8);
  bay.position.set(1.3, 0.95, -0.45);
  bay.name = 'bayLight';
  group.add(cabin, dash, bay);

  // Headlight cones: additive, unlit, faded along their length. Both headlights throw a
  // cone even though the near one is not drawn — the car is whole.
  const H = WEATHER_FX.HEADLIGHT;
  const coneGeom = new THREE.ConeGeometry(H.radius, H.length, 18, 1, true);
  coneGeom.rotateZ(Math.PI / 2 - 0.06);
  const coneUniforms = { uK: { value: 0 }, uColor: { value: new THREE.Color(H.color) }, uAlpha: { value: H.alpha } };
  const coneMat = new THREE.ShaderMaterial({
    uniforms: coneUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying float vT;
      varying float vFacing;
      void main() {
        vT = uv.y; // 1 at the apex, 0 at the open base
        vec3 n = normalize(normalMatrix * normal);
        vFacing = abs(n.z); // 1 where the beam's surface faces the camera, 0 at its silhouette
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uK, uAlpha;
      uniform vec3 uColor;
      varying float vT;
      varying float vFacing;
      void main() {
        float along = pow(vT, 1.4);
        float soft = pow(vFacing, 1.6);
        gl_FragColor = vec4(uColor * uK * uAlpha * along * soft, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const cones: THREE.Mesh[] = [];
  for (const z of [-0.56, 0.56]) {
    const m = new THREE.Mesh(coneGeom, coneMat);
    m.position.set(1.92 + H.length / 2 - 0.1, 0.72 - Math.sin(0.06) * H.length * 0.5, z);
    m.visible = false;
    m.name = 'headlightCone';
    cones.push(m);
    group.add(m);
  }
  const poolTex = poolTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: H.color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolGeom = new THREE.PlaneGeometry(7.5, 3.6);
  poolGeom.rotateX(-Math.PI / 2);
  const pool = new THREE.Mesh(poolGeom, poolMat);
  pool.position.set(1.92 + 3.6, 0.02, 0);
  pool.renderOrder = 4;
  pool.visible = false;
  group.add(pool);

  // Streetlight sweep: two point lights parked on the nearest lamp heads.
  const SL = WEATHER_FX.STREETLIGHT;
  const street = [0, 1].map(() => {
    const l = new THREE.PointLight(SL.color, 0, SL.distance, 2);
    l.name = 'streetlight';
    group.add(l);
    return l;
  });

  let ignition = 0;
  let night = 0;
  const applyCabin = () => {
    cabin.intensity = 0.7 + 2.3 * ignition + 1.6 * ignition * night;
    dash.intensity = (1.3 + 0.8 * night) * ignition;
    bay.intensity = 0.9 * (1 - night * 0.7);
  };
  void CAR;

  return {
    group,
    hemi,
    key,
    cabin,
    dash,
    setLook(look) {
      night = look.night;
      key.color.copy(look.keyColor);
      key.intensity = look.keyIntensity + look.flash * 3.0;
      hemi.color.copy(look.hemiSky);
      hemi.groundColor.copy(look.hemiGround);
      hemi.intensity = look.hemiIntensity + look.flash * 2.2;
      applyCabin();
    },
    setIgnition(k) {
      ignition = k;
      applyCabin();
    },
    setHeadlights(k) {
      coneUniforms.uK.value = k;
      poolMat.opacity = k * H.poolAlpha;
      const on = k > 0.01;
      for (const c of cones) c.visible = on;
      pool.visible = on;
    },
    updateStreetlights(heads, count, nightK) {
      for (let i = 0; i < street.length; i++) {
        const l = street[i]!;
        if (i < count) {
          l.position.copy(heads[i]!);
          l.intensity = SL.intensity * nightK;
        } else {
          l.intensity = 0;
        }
      }
    },
    dispose() {
      key.shadow.dispose();
      coneGeom.dispose();
      coneMat.dispose();
      poolGeom.dispose();
      poolMat.dispose();
      poolTex.dispose();
    },
  };
}
