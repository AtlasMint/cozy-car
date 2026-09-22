import * as THREE from 'three';

/**
 * Gradient backdrop drawn behind everything in NDC. The top colour doubles as the fog colour
 * so the far end of the slab dissolves without a seam. A sun/moon disc lives here too.
 */
export interface Sky {
  mesh: THREE.Mesh;
  fogColor: THREE.Color;
  setColors(top: THREE.ColorRepresentation, bottom: THREE.ColorRepresentation): void;
  /** Disc position in NDC (−1..1), radius in NDC height units, colour, 0..1 strength. */
  setDisc(x: number, y: number, radius: number, color: THREE.ColorRepresentation, strength: number): void;
  /** Lightning: 0..1 brightens the whole backdrop. */
  setFlash(k: number): void;
  dispose(): void;
}

export function createSky(): Sky {
  const fogColor = new THREE.Color('#9aa2a6');
  const uniforms = {
    uTop: { value: new THREE.Color('#9aa2a6') },
    uBottom: { value: new THREE.Color('#8e9497') },
    uDisc: { value: new THREE.Vector4(0.55, 0.62, 0.06, 0) },
    uDiscColor: { value: new THREE.Color('#fff2d0') },
    uAspect: { value: 16 / 9 },
    uFlash: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uTop;
      uniform vec3 uBottom;
      uniform vec4 uDisc;      // x, y (ndc), radius, strength
      uniform vec3 uDiscColor;
      uniform float uAspect;
      uniform float uFlash;
      varying vec2 vUv;
      void main() {
        float t = smoothstep(0.0, 1.0, vUv.y);
        vec3 col = mix(uBottom, uTop, t);
        // soft vignette so the corners recede
        vec2 c = vUv - 0.5;
        col *= 1.0 - 0.18 * dot(c, c) * 2.0;
        // sun / moon disc
        vec2 p = (vUv * 2.0 - 1.0);
        vec2 d = vec2((p.x - uDisc.x) * uAspect, p.y - uDisc.y);
        float r = length(d);
        float disc = 1.0 - smoothstep(uDisc.z * 0.85, uDisc.z, r);
        float halo = exp(-r * r / (uDisc.z * uDisc.z * 6.0)) * 0.35;
        col = mix(col, uDiscColor, (disc + halo) * uDisc.w);
        col = mix(col, vec3(0.85, 0.88, 0.95), uFlash * 0.8);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';

  return {
    mesh,
    fogColor,
    setColors(top, bottom) {
      uniforms.uTop.value.set(top);
      uniforms.uBottom.value.set(bottom);
      fogColor.copy(uniforms.uTop.value);
    },
    setDisc(x, y, radius, color, strength) {
      uniforms.uDisc.value.set(x, y, radius, strength);
      uniforms.uDiscColor.value.set(color);
    },
    setFlash(k) {
      uniforms.uFlash.value = k;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
