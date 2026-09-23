import * as THREE from 'three';

/**
 * A unit quad instanced `count` times. Each instance carries `aSeed` (vec4 of uniform randoms)
 * and `aCull` (a random 0..1 used to thin density by intensity). All motion is computed in the
 * vertex shader from the seed and a time uniform; the CPU does nothing per particle.
 */
export function instancedQuads(count: number, rng: () => number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  const pos = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(count * 4);
  const cull = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    seed[i * 4] = rng();
    seed[i * 4 + 1] = rng();
    seed[i * 4 + 2] = rng();
    seed[i * 4 + 3] = rng();
    cull[i] = rng();
  }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.setAttribute('aCull', new THREE.InstancedBufferAttribute(cull, 1));
  g.instanceCount = count;
  return g;
}

/** Shared GLSL: camera axes from the view matrix, for billboarding under any camera. */
export const CAMERA_AXES_GLSL = /* glsl */ `
  vec3 camRight() { return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
  vec3 camUp()    { return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
  vec3 camFwd()   { return -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); }
`;

export const OFFSCREEN_GLSL = /* glsl */ `
  void discardVertex() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }
`;

/**
 * Shelter test: true when a point is inside the box, or when the view ray from that point
 * into the scene passes through the box — i.e. the particle would be drawn over the car. The
 * missing roof is an invisible roof as far as the weather is concerned, and so is the air
 * between the camera and the car.
 */
export const SHELTER_GLSL = /* glsl */ `
  bool shelteredByBox(vec3 p, vec3 d, vec3 bmin, vec3 bmax) {
    vec3 inv = 1.0 / d;
    vec3 t0 = (bmin - p) * inv;
    vec3 t1 = (bmax - p) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tn = max(max(tmin.x, tmin.y), tmin.z);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    return tf >= max(tn, 0.0);
  }
`;
