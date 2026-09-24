/**
 * The vehicle contract. One spec per vehicle, holding every number another system reads:
 * dimensions, cabin geometry, anchors, camera framing, the weather shelter box, the motion
 * profile, the engine voice and the driver's pose. A number that only draws one body stays a
 * literal inside that body's file.
 *
 * The spec is data. `build()` is its only function, and it may not reach into the scene graph,
 * the store or the renderer.
 *
 * `VEHICLES.hatchback` holds today's shipped numbers verbatim — it is the regression proof for
 * the extraction phases.
 */
import { LISTED_VEHICLES, type VehicleId } from './store';
import { buildHatchback } from '../scene/car/bodies/hatchback';
import { buildSports } from '../scene/car/bodies/sports';
import { buildVan } from '../scene/car/bodies/van';
import { buildTank } from '../scene/car/bodies/tank';
import { AUDIO, CAMERA, CAR, INTERACTION, MOTION, PALETTE, SPEED, WEATHER_FX } from './constants';
import { clamp01, DEG } from '../util/math';
import type { Builder, CarMaterials, PaintSpec } from '../scene/car/parts';
import type { GlassPane } from '../scene/car/shell';
import type * as THREE from 'three';

export type Vec3 = readonly [number, number, number];

/**
 * What a body hands back to the assembler. Every vehicle exports one `build` of this shape;
 * nothing else about a body is visible to the rest of the app.
 */
/**
 * A vehicle that can do something on command. Exactly one of them can.
 *
 * `update` returns the recoil to add on top of whatever the engine rig produced, rather than
 * writing to the scene graph itself — a body may not reach into the scene graph, and the hull's
 * position is the rig's to own.
 */
export interface Ordnance {
  /** Oversized invisible proxy on the barrel, for the raycaster. */
  hitbox: THREE.Mesh;
  /** Fire, if it has finished reloading. Returns whether it actually fired. */
  fire(): boolean;
  /** Per-frame. Returns the kick to add to the hull: metres of heave, radians of pitch. */
  update(dt: number): { heave: number; pitch: number };
  /** 0 while reloading, 1 when ready. */
  readonly ready: number;
}

export interface BodyKit {
  panes: GlassPane[];
  setLights(head: number, tail: number): void;
  /** The live steering wheel node; the driver's grips parent to it. */
  wheelNode: THREE.Group;
  setTacho(rpm: number): void;
  setSpeedo(kmh: number): void;
  setDashGlow(k: number): void;
  exhaustTip: THREE.Vector3;
  /** The hanging thing on its damped pendulum: freshener, mobile, keyring. */
  swing: THREE.Group;
  /** Only a vehicle that carries a weapon has one. */
  gun?: Ordnance;
  /** Free anything the body allocated that the Builder does not own — its own materials. */
  dispose?(): void;
}

export interface VehicleDims {
  /** Overall length, bumper centre to bumper centre. */
  length: number;
  width: number;
  /** Inner face of each side wall; the near wall mirrors at −wallZ. */
  wallZ: number;
  wallThickness: number;
  floorY: number;
  floorTopY: number;
  sillY: number;
  /** Window sill line — the bottom edge of the side glass. */
  beltY: number;
  /** Top of the window frames. There is no roof panel on any vehicle. */
  wallTopY: number;
  wheelbase: number;
  track: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Rear tyres are scaled on Z by this much — a twin-wheel or staggered look for free. */
  rearWidthScale: number;
  archRadius: number;
  spokes: number;
  contactShadow: readonly [number, number];
}

export interface VehicleCabin {
  driverZ: number;
  passengerZ: number;
  seatWidth: number;
  /** Steering wheel hub centre, and the column direction it faces (toward the driver). */
  wheelCentre: Vec3;
  wheelNormal: Vec3;
  steeringRadius: number;
}

export interface VehicleAnchors {
  /** Rear face of the radio faceplate; the camera push-in centres on this. */
  radioFace: Vec3;
  /** Size of the invisible hitbox around the radio, as a box. */
  radioHitbox: Vec3;
  /** Nudge from the faceplate to the framed centre of the push-in. */
  radioFocusOffset: Vec3;
  exhaustTip: Vec3;
  /** Where the hanging thing hangs from, and how long its thread is. */
  swingPivot: Vec3;
  swingLength: number;
  /** Headlight lamp position; cones and the ground pool are placed from it. */
  headlight: { x: number; y: number; z: number };
  coneLength: number;
  coneRadius: number;
  pool: { w: number; d: number; x: number };
  cabinLight: Vec3;
  cabinDistance: number;
  /** A second interior light for a long cabin. null keeps the light allocated at intensity 0. */
  livingLight: Vec3 | null;
  livingDistance: number;
  dashLight: Vec3;
  dashDistance: number;
  shadowOrtho: number;
  shadowRadius: number;
  shadowNormalBias: number;
}

export interface VehicleCamera {
  viewSize: number;
  minViewWidth: number;
  target: Vec3;
  radioZoom: number;
}

export interface MotionProfile {
  idleHz: number;
  idle: { chill: { y: number; roll: number }; focus: { y: number; roll: number } };
  sway: { hz: number; chill: { y: number; pitch: number }; focus: { y: number; pitch: number } };
  road: { hz: number; y: number; roll: number; fullAt: number };
  bump: { impulse: number; rearDelay: number; omega: number };
  bodySpringOmega: number;
  ignitionKick: number;
  wheelToBody: number;
  wheelToPitch: number;
  rpm: { idle: number; idleJitter: number; cruise: number; wander: number; sweepMs: number; sweepPeak: number };
  exhaust: { chillRate: number; focusRate: number; life: number; rise: number; drift: number; size: number; grow: number };
}

/**
 * The engine voice. Orders are of crank rotation, so a four-stroke's own cycle is order 0.5
 * and the firing order of an N-cylinder engine is N/2. See PLAN-cars.md §11.
 */
export interface EngineProfile {
  cylinders: number;
  /** Harmonic rolloff of the combustion pulse: higher is darker. */
  rolloff: { idle: number; loaded: number };
  /** Fixed per-cylinder gain spread. This is what puts energy at the half-orders. */
  cylinderSpread: number;
  /** Fixed firing asymmetry, in crank degrees. */
  asymmetryDeg: number;
  /** Cycle-to-cycle irregularity, idle → loaded. */
  irregularity: { idle: number; loaded: number };
  /** Exhaust quarter-wave modes, Hz. Fixed — they never move with rpm. */
  modes: readonly number[];
  /** The Helmholtz drone peak: where a real exhaust resonator is tuned. */
  dronePeak: { freq: number; q: number; gainDb: number };
  /** One-pole damping on the resonator bank. */
  dampingHz: number;
  /** Block / knock band — most of what makes a diesel sound like a diesel. */
  knock: { gain: number; freq: number; q: number };
  /** Valve and injector tick: what says "petrol engine idling" rather than "hum". */
  tick: { gain: number; freq: number };
  intake: { idle: number; loaded: number; freq: number };
  crank: { from: number; to: number; ms: number };
  /**
   * A turbocharger: a whine whose pitch and level follow boost — which is to say load, far more
   * than crank speed — and which lags the throttle by `spoolS`. Absent on anything without one.
   */
  turbo?: {
    freq: { idle: number; loaded: number };
    gain: { idle: number; loaded: number };
    spoolS: number;
  };
  /**
   * Tracked running gear in place of tyres. The road layer becomes link clatter that quickens
   * with speed, under a squeal from the sprockets. Absent on anything with wheels.
   */
  tracks?: {
    /** Impacts per second in the texture at playback rate 1; speed scales the rate from here. */
    clatterRate: number;
    /** Speed, m/s, at which the clatter plays at rate 1. */
    speedForRate1: number;
    /** Level of the link clatter. 0 silences it and skips generating the texture entirely. */
    clatterGain: number;
    squeal: { freq: number; q: number; gain: number };
  };
  /** Multipliers on the shared AUDIO.LEVELS. */
  gain: { engine: number; road: number; wind: number };
  /** Legacy: playbackRate for a recorded loop, if one is ever added. */
  focusRate: number;
}

export interface DriverPose {
  hips: Vec3;
  torsoLean: number;
  legSplay: number;
  knee: readonly [number, number];
  foot: readonly [number, number];
  gripAngles: readonly [number, number];
  headTurnYaw: number;
  slumpScale: number;
  cup: Vec3;
  /** null drops the reach-for-the-gear-lever gesture from the pool. */
  gearKnob: Vec3 | null;
}

export interface VehicleSpec {
  id: VehicleId;
  label: string;
  paint: PaintSpec;
  dims: VehicleDims;
  cabin: VehicleCabin;
  anchors: VehicleAnchors;
  camera: VehicleCamera;
  /** Rain/snow/splash exclusion AABB: halfLength + 0.06, wallTop + 0.045, halfWidth + 0.02. */
  shelter: { min: Vec3; max: Vec3 };
  motion: MotionProfile;
  audio: EngineProfile;
  pose: DriverPose;
  gauges: { rpmFull: number; kmhFull: number };
  speed: { focus: number };
  build(b: Builder, m: CarMaterials, v: VehicleSpec): BodyKit;
}

/**
 * How much of the cabin floor this camera can see past the near wall. A point in the cabin
 * clears that wall only when `y + z + wallZ > wallTopY`, so the visible strip of floor starts
 * at `z = wallTopY − floorTopY − wallZ`.
 *
 * This single number decides how tall a body is allowed to be. The hatchback shows 0.31 of its
 * floor and the roadster 0.42.
 */
export function floorExposure(d: Pick<VehicleDims, 'wallZ' | 'floorTopY' | 'wallTopY'>): number {
  return clamp01((2 * d.wallZ + d.floorTopY - d.wallTopY) / (2 * d.wallZ));
}

/** Below this, a body is a box you cannot see into, and solid walls stop being an option. */
export const SEE_THROUGH_BELOW = 0.2;

/**
 * Whether a body must draw its two camera-facing walls — the near one at −z and the rear one
 * at −x — see-through rather than solid. Derived from the geometry rather than declared on the
 * spec, so no vehicle can claim a roof height its own interior does not survive.
 */
export function seeThrough(v: VehicleSpec): boolean {
  return floorExposure(v.dims) < SEE_THROUGH_BELOW;
}

/**
 * The hatchback. Every number here is today's shipped value, moved rather than retyped, so a
 * visual difference after the extraction phases is a bug.
 */
export const HATCHBACK: VehicleSpec = {
  id: 'hatchback',
  label: 'Hatchback',
  paint: {
    body: PALETTE.BODY,
    trim: PALETTE.BODY_TRIM,
    hub: PALETTE.HUB,
    vinyl: PALETTE.VINYL,
    fabric: PALETTE.FABRIC,
    fabricDark: '#4E4138',
  },
  dims: {
    length: CAR.LENGTH,
    width: CAR.WIDTH,
    wallZ: CAR.FAR_WALL_Z,
    wallThickness: CAR.FAR_WALL_THICKNESS,
    floorY: CAR.FLOOR_Y,
    floorTopY: CAR.FLOOR_TOP_Y,
    sillY: CAR.SILL_Y,
    beltY: CAR.BELT_Y,
    wallTopY: CAR.ROOF_Y,
    wheelbase: CAR.WHEELBASE,
    track: CAR.TRACK,
    wheelRadius: CAR.WHEEL_RADIUS,
    wheelWidth: CAR.WHEEL_WIDTH,
    rearWidthScale: 1,
    archRadius: CAR.ARCH_RADIUS,
    spokes: 5,
    contactShadow: [0.8, 0.5],
  },
  cabin: {
    driverZ: CAR.DRIVER_Z,
    passengerZ: CAR.PASSENGER_Z,
    seatWidth: CAR.SEAT_WIDTH,
    wheelCentre: CAR.WHEEL_CENTRE,
    wheelNormal: CAR.WHEEL_NORMAL,
    steeringRadius: CAR.STEERING_RADIUS,
  },
  anchors: {
    radioFace: CAR.RADIO_FACE,
    radioHitbox: [0.14, 0.2, 0.38],
    radioFocusOffset: [0.02, 0, 0.06],
    exhaustTip: CAR.EXHAUST_TIP,
    swingPivot: CAR.MIRROR_PIVOT,
    swingLength: MOTION.FRESHENER.length,
    headlight: { x: 1.92, y: 0.72, z: 0.56 },
    coneLength: WEATHER_FX.HEADLIGHT.length,
    coneRadius: WEATHER_FX.HEADLIGHT.radius,
    pool: { w: 7.5, d: 3.6, x: 5.52 },
    cabinLight: [0.15, 1.15, 0.15],
    cabinDistance: 3.5,
    livingLight: null,
    livingDistance: 4,
    dashLight: [0.5, 0.92, 0.1],
    dashDistance: 1.6,
    shadowOrtho: 4.5,
    shadowRadius: 3,
    shadowNormalBias: 0.02,
  },
  camera: {
    viewSize: CAMERA.VIEW_SIZE,
    minViewWidth: CAMERA.MIN_VIEW_WIDTH,
    target: CAMERA.TARGET,
    radioZoom: INTERACTION.RADIO_ZOOM,
  },
  shelter: { min: WEATHER_FX.CAR_BOX.min, max: WEATHER_FX.CAR_BOX.max },
  motion: {
    idleHz: MOTION.IDLE_HZ,
    idle: { chill: { ...MOTION.IDLE.chill }, focus: { ...MOTION.IDLE.focus } },
    sway: { hz: MOTION.SWAY.hz, chill: { ...MOTION.SWAY.chill }, focus: { ...MOTION.SWAY.focus } },
    road: { ...MOTION.ROAD },
    // rearDelay is wheelbase / cruising speed = 2.4 / 22; the old 0.12 was that value rounded.
    bump: { impulse: MOTION.BUMP.impulse, rearDelay: CAR.WHEELBASE / SPEED.FOCUS, omega: MOTION.BUMP.omega },
    bodySpringOmega: MOTION.BODY_SPRING_OMEGA,
    ignitionKick: MOTION.IGNITION_KICK,
    wheelToBody: MOTION.WHEEL_TO_BODY,
    wheelToPitch: MOTION.WHEEL_TO_PITCH,
    rpm: { ...MOTION.RPM },
    exhaust: { ...MOTION.EXHAUST },
  },
  audio: {
    cylinders: 4,
    rolloff: { idle: 0.38, loaded: 0.24 },
    cylinderSpread: 0.06,
    asymmetryDeg: 4,
    irregularity: { idle: 0.12, loaded: 0.04 },
    modes: [33, 100, 167],
    dronePeak: { freq: 82, q: 6, gainDb: 6 },
    dampingHz: 2500,
    knock: { gain: 0.05, freq: 3200, q: 1.2 },
    tick: { gain: 0.1, freq: 4200 },
    intake: { idle: 0.08, loaded: 0.3, freq: 700 },
    crank: { from: 28, to: 62, ms: 700 },
    gain: { engine: 1, road: 1, wind: 1 },
    focusRate: AUDIO.FOCUS_RATE,
  },
  pose: {
    hips: [0.16, 0.6, CAR.DRIVER_Z],
    torsoLean: 0.15,
    legSplay: 0.09,
    knee: [0.52, 0.64],
    foot: [0.7, 0.42],
    gripAngles: [120, 60],
    headTurnYaw: -0.85,
    slumpScale: 1,
    cup: [0.14, 0.6, -0.08],
    gearKnob: [0.3, 0.66, 0],
  },
  gauges: { ...CAR.GAUGE },
  speed: { focus: SPEED.FOCUS },
  build: buildHatchback,
};


/**
 * The yellow sports car. A cheap 1970s roadster: low, wide and short, with a deep yellow that
 * separates from the plinth — a bright lemon sits at 1.05:1 against the slab and dissolves
 * into the shelf the car stands on.
 */
export const SPORTS: VehicleSpec = {
  id: 'sports',
  label: 'Sports',
  paint: {
    body: '#C08A22',
    trim: '#211F1E',
    hub: '#3A3632',
    vinyl: '#1E1B19',
    fabric: '#6B3A32',
    fabricDark: '#4E2A25',
  },
  dims: {
    length: 3.56,
    width: 1.86,
    wallZ: 0.88,
    wallThickness: 0.05,
    floorY: 0.16,
    floorTopY: 0.2,
    sillY: 0.5,
    beltY: 0.95,
    wallTopY: 1.22,
    wheelbase: 2.3,
    track: 1.56,
    wheelRadius: 0.32,
    wheelWidth: 0.24,
    rearWidthScale: 1.25,
    archRadius: 0.37,
    spokes: 7,
    contactShadow: [0.88, 0.66],
  },
  cabin: {
    driverZ: 0.4,
    passengerZ: -0.4,
    seatWidth: 0.48,
    wheelCentre: [0.44, 0.84, 0.4],
    wheelNormal: [-0.9659, 0.2588, 0],
    steeringRadius: 0.15,
  },
  anchors: {
    radioFace: [0.5, 0.6, 0],
    radioHitbox: [0.22, 0.24, 0.32],
    radioFocusOffset: [0.04, 0.08, -0.05],
    exhaustTip: [-1.76, 0.3, -0.13],
    swingPivot: [0.46, 0.66, 0.24],
    swingLength: 0.09,
    headlight: { x: 1.7, y: 0.56, z: 0.5 },
    coneLength: 4.2,
    coneRadius: 0.6,
    pool: { w: 7, d: 3.4, x: 5.2 },
    cabinLight: [0.05, 0.92, 0.16],
    cabinDistance: 2.6,
    livingLight: null,
    livingDistance: 4,
    dashLight: [0.42, 0.72, 0.1],
    dashDistance: 1.3,
    shadowOrtho: 4.6,
    shadowRadius: 3,
    shadowNormalBias: 0.02,
  },
  camera: { viewSize: 4.9, minViewWidth: 5.25, target: [-0.42, 0.46, -0.72], radioZoom: 3.02 },
  shelter: { min: [-1.84, 0, -1.01], max: [1.84, 1.26, 1.01] },
  motion: {
    idleHz: 14,
    idle: { chill: { y: 0.004, roll: 0.16 * DEG }, focus: { y: 0.003, roll: 0.1 * DEG } },
    sway: { hz: 0.75, chill: { y: 0.005, pitch: 0.18 * DEG }, focus: { y: 0.012, pitch: 0.55 * DEG } },
    road: { hz: 4.4, y: 0.016, roll: 0.45 * DEG, fullAt: 17 },
    bump: { impulse: 0.032, rearDelay: 2.3 / 24, omega: 22 },
    bodySpringOmega: 13,
    ignitionKick: -0.42,
    wheelToBody: 0.72,
    wheelToPitch: 0.22,
    rpm: { idle: 980, idleJitter: 30, cruise: 3400, wander: 320, sweepMs: 900, sweepPeak: 6800 },
    exhaust: { chillRate: 1.0, focusRate: 3.6, life: 1.2, rise: 0.24, drift: 0.8, size: 0.1, grow: 0.4 },
  },
  audio: {
    cylinders: 4,
    rolloff: { idle: 0.26, loaded: 0.16 },
    cylinderSpread: 0.04,
    asymmetryDeg: 3,
    irregularity: { idle: 0.08, loaded: 0.03 },
    modes: [55, 164, 273],
    dronePeak: { freq: 110, q: 7, gainDb: 6 },
    dampingHz: 3500,
    knock: { gain: 0.08, freq: 3400, q: 1.4 },
    tick: { gain: 0.14, freq: 4600 },
    intake: { idle: 0.1, loaded: 0.45, freq: 820 },
    crank: { from: 34, to: 80, ms: 520 },
    gain: { engine: 1.16, road: 1.1, wind: 1.45 },
    focusRate: 1.55,
  },
  pose: {
    // Reclined, but a driver rather than a sunbather: the first pass at 0.34 rad over a 0.40 m
    // hip height read as lying in a bath from this camera.
    hips: [0.12, 0.46, 0.4],
    torsoLean: 0.22,
    legSplay: 0.085,
    knee: [0.55, 0.5],
    foot: [0.8, 0.34],
    gripAngles: [118, 62],
    headTurnYaw: -0.95,
    slumpScale: 0.55,
    cup: [0.02, 0.58, -0.1],
    gearKnob: [0.26, 0.5, 0],
  },
  gauges: { rpmFull: 7000, kmhFull: 160 },
  speed: { focus: 24 },
  build: buildSports,
};


/**
 * The camper van, at the height a 5.6 m panel van actually is. Its roof no longer trades scale
 * for an interior you can see: `floorExposure` is zero here, so the near and rear walls are
 * drawn see-through instead (see bodies/van.ts). Nothing is cut away — the walls are all still
 * there, they just stop being opaque.
 */
export const VAN: VehicleSpec = {
  id: 'van',
  label: 'Camper',
  paint: {
    // Pale dusty blue, period-correct for a 1970s camper and 153 degrees from the slab's hue.
    // Cream was tested and rejected: a warm neutral body flanked by white road markings cannot
    // separate from a warm neutral plinth at any lightness.
    body: '#A9BFC4',
    trim: '#3A3C38',
    hub: '#B9B4A8',
    vinyl: '#2F2A24',
    fabric: '#6E7F63',
    fabricDark: '#55634C',
  },
  dims: {
    length: 5.6,
    width: 2.1,
    wallZ: 1.0,
    wallThickness: 0.05,
    floorY: 0.5,
    floorTopY: 0.56,
    sillY: 0.62,
    // Window sill: above the worktop at floor + 1.04, so the kitchen window clears its own tap.
    beltY: 1.62,
    // A high-top van, measured rather than composed down: 5.6 m long and 2.58 m to the deck.
    wallTopY: 2.58,
    wheelbase: 3.2,
    track: 1.62,
    wheelRadius: 0.36,
    wheelWidth: 0.22,
    rearWidthScale: 1.25,
    archRadius: 0.46,
    spokes: 0,
    contactShadow: [1.0, 0.62],
  },
  cabin: {
    driverZ: 0.42,
    passengerZ: -0.42,
    seatWidth: 0.56,
    // A van wheel sits high and flat, but 1.52 raised the arms to shoulder height from this
    // camera; 1.44 keeps the same hand-above-shoulder rise as the hatchback.
    wheelCentre: [1.8, 1.44, 0.42],
    wheelNormal: [-0.7071, 0.7071, 0],
    steeringRadius: 0.19,
  },
  anchors: {
    radioFace: [1.33, 1.33, 0.7],
    radioHitbox: [0.18, 0.24, 0.46],
    radioFocusOffset: [0.03, 0.02, -0.06],
    exhaustTip: [-2.6, 0.42, -0.72],
    // Hung off the front cross-rail of the high top. At 1.66 it hung from nothing: the cab
    // roofline is 1.64 there, so the mobile floated above the windscreen.
    swingPivot: [1.28, 2.54, -0.22],
    swingLength: 0.26,
    headlight: { x: 2.78, y: 0.86, z: 0.74 },
    coneLength: 5.2,
    coneRadius: 0.85,
    pool: { w: 8.6, d: 4.4, x: 6.8 },
    cabinLight: [1.55, 1.55, 0.1],
    cabinDistance: 2.8,
    livingLight: [-1.2, 2.38, 0.1],
    livingDistance: 4.5,
    dashLight: [1.95, 1.34, 0.1],
    dashDistance: 1.8,
    shadowOrtho: 5.4,
    shadowRadius: 2,
    shadowNormalBias: 0.03,
  },
  // Verified by screenshot: 7.0 cropped the nose and the rail. 8.0 restores the hatchback's
  // top margin and bottom void, and radioZoom scales with it so the push-in frames the same
  // height. The target rises by half the roof's growth so the taller body stays centred.
  camera: { viewSize: 8.0, minViewWidth: 8.6, target: [-0.3, 1.36, -0.9], radioZoom: 4.92 },
  shelter: { min: [-2.86, 0, -1.07], max: [2.86, 2.63, 1.07] },
  motion: {
    // A tall heavy body wallows slowly on soft springs, and shakes lower and harder.
    idleHz: 8,
    idle: { chill: { y: 0.011, roll: 0.4 * DEG }, focus: { y: 0.008, roll: 0.28 * DEG } },
    sway: { hz: 0.34, chill: { y: 0.012, pitch: 0.32 * DEG }, focus: { y: 0.03, pitch: 1.1 * DEG } },
    road: { hz: 2.3, y: 0.038, roll: 0.85 * DEG, fullAt: 13 },
    bump: { impulse: 0.078, rearDelay: 3.2 / 19, omega: 11 },
    bodySpringOmega: 5.5,
    ignitionKick: -0.85,
    wheelToBody: 0.48,
    // A 3.2 m wheelbase geometrically produces less pitch per metre than a 2.4 m one.
    wheelToPitch: 0.3,
    rpm: { idle: 620, idleJitter: 55, cruise: 1850, wander: 180, sweepMs: 1600, sweepPeak: 4200 },
    exhaust: { chillRate: 1.4, focusRate: 2.6, life: 2.2, rise: 0.16, drift: 0.6, size: 0.2, grow: 0.45 },
  },
  audio: {
    cylinders: 4,
    rolloff: { idle: 0.52, loaded: 0.34 },
    cylinderSpread: 0.12,
    asymmetryDeg: 7,
    irregularity: { idle: 0.2, loaded: 0.06 },
    modes: [20, 61, 102],
    dronePeak: { freq: 64, q: 5, gainDb: 7 },
    dampingHz: 1500,
    knock: { gain: 0.18, freq: 3200, q: 1.1 },
    tick: { gain: 0.06, freq: 3600 },
    intake: { idle: 0.06, loaded: 0.26, freq: 520 },
    crank: { from: 18, to: 44, ms: 1150 },
    gain: { engine: 1.22, road: 1.14, wind: 1.1 },
    focusRate: 1.18,
  },
  pose: {
    hips: [1.55, 1.14, 0.42],
    torsoLean: 0.06,
    legSplay: 0.11,
    knee: [1.95, 1.14],
    foot: [2.2, 0.78],
    gripAngles: [125, 55],
    headTurnYaw: -0.7,
    slumpScale: 0.8,
    cup: [1.38, 1.06, -0.14],
    // No gear lever within reach of this seat, so that gesture drops from the pool.
    gearKnob: null,
  },
  gauges: { rpmFull: 4500, kmhFull: 140 },
  speed: { focus: 19 },
  build: buildVan,
};

/**
 * A modern main battle tank. It is a whole vehicle by the same rules as the other three — its
 * own spec, its own body file, the same material set — and it is deliberately absent from
 * VEHICLE_ORDER, from the #vehicle= hash and from the stored preference. Press T.
 */
export const TANK: VehicleSpec = {
  id: 'tank',
  label: 'Tank',
  paint: {
    // Olive drab. It has to separate from a warm neutral plinth like everything else here, and
    // dark and cool against light and warm is the easiest separation there is.
    body: '#5C6350',
    trim: '#3A3F35',
    hub: '#4A5042',
    vinyl: '#23211E',
    fabric: '#6B6A52',
    fabricDark: '#4E4D3C',
  },
  dims: {
    length: 7.0,
    width: 3.5,
    wallZ: 1.62,
    wallThickness: 0.08,
    floorY: 0.42,
    floorTopY: 0.48,
    sillY: 0.95,
    // Hull roof — the turret ring sits on this.
    beltY: 1.55,
    // Turret roof. The hole in it is the open thing on this vehicle.
    wallTopY: 2.42,
    // Sprocket to idler.
    wheelbase: 5.0,
    track: 2.7,
    // The sprocket and idler; the five road wheels between them are the body's own.
    wheelRadius: 0.42,
    wheelWidth: 0.42,
    rearWidthScale: 1,
    // No wheel arches on a tank, but the number still has to be sane for the shared invariant.
    archRadius: 0.5,
    spokes: 0,
    contactShadow: [1.35, 0.95],
  },
  cabin: {
    // The commander, on the right, which is the far side from this camera — so what you see of
    // them is head and shoulders over the turret roof, which is the whole picture anyway.
    driverZ: 0.46,
    passengerZ: -0.5,
    seatWidth: 0.5,
    // A grab bar across the front of the hatch. wheelNormal must NOT be vertical: the figure
    // builds its grip plane as up × normal, and worldUp projected off a vertical normal is the
    // zero vector — three's normalize() then leaves it zero and both hands land on the hub, with
    // no error and no NaN to notice. Facing back at the commander keeps the plane upright.
    wheelCentre: [0.42, 2.46, 0.46],
    wheelNormal: [-1, 0, 0],
    steeringRadius: 0.2,
  },
  anchors: {
    radioFace: [-0.62, 2.52, -0.3],
    radioHitbox: [0.3, 0.26, 0.4],
    radioFocusOffset: [0.02, 0.02, -0.04],
    // Outboard of the near side skirt, whose outer face is at -1.745; inboard of that the
    // plume spawns behind a solid plate and is never seen.
    exhaustTip: [-2.62, 1.37, -1.86],
    // Hung from the pintle mount beside the commander. Over the turret roof it hung through
    // solid plate: the roof covers the whole turret plan, and the cupola is 0.42 m of it.
    swingPivot: [0.62, 2.69, 0.76],
    swingLength: 0.16,
    headlight: { x: 3.42, y: 1.3, z: 1.3 },
    coneLength: 6.5,
    coneRadius: 1.1,
    pool: { w: 9.5, d: 5.2, x: 7.2 },
    cabinLight: [0.1, 2.0, 0.46],
    cabinDistance: 2.4,
    livingLight: null,
    livingDistance: 4,
    dashLight: [-0.5, 2.45, -0.3],
    dashDistance: 1.5,
    shadowOrtho: 7,
    shadowRadius: 2.5,
    shadowNormalBias: 0.03,
  },
  // Wide enough for the hull and long enough for the gun to stay in frame.
  // Wide enough for the hull, and shifted forward so the muzzle — and the metre of flash past
  // it — stay inside the frame rather than going off the corner.
  camera: { viewSize: 10.0, minViewWidth: 10.7, target: [0.35, 1.2, -1.0], radioZoom: 6.154 },
  // The gun is left out of the shelter box on purpose: a 15 cm barrel with rain drawn over it
  // reads as nothing at all, and including it would carve a rain-free wedge across the frame.
  shelter: { min: [-3.9, 0, -1.8], max: [3.9, 3.05, 1.8] },
  motion: {
    // Sixty tonnes on torsion bars: slow, deep and not very interested in the road surface.
    //
    // The amplitudes are small for a reason beyond realism. The track run and the road wheels
    // are the body's own geometry and ride bodyRig, while the sprocket and idler are the shared
    // wheels under stage.wheels and stay planted — so every millimetre of heave shears the track
    // against its own sprockets. Holding the travel near a centimetre keeps that invisible at
    // this scale, and a vehicle this heavy should barely move anyway.
    idleHz: 7,
    idle: { chill: { y: 0.005, roll: 0.34 * DEG }, focus: { y: 0.004, roll: 0.24 * DEG } },
    sway: { hz: 0.28, chill: { y: 0.008, pitch: 0.22 * DEG }, focus: { y: 0.018, pitch: 0.7 * DEG } },
    road: { hz: 2.0, y: 0.016, roll: 0.5 * DEG, fullAt: 11 },
    bump: { impulse: 0.032, rearDelay: 5.0 / 16, omega: 9 },
    bodySpringOmega: 4.5,
    ignitionKick: -1.1,
    wheelToBody: 0.4,
    wheelToPitch: 0.22,
    rpm: { idle: 560, idleJitter: 40, cruise: 1900, wander: 140, sweepMs: 1900, sweepPeak: 2900 },
    exhaust: { chillRate: 1.6, focusRate: 3.0, life: 2.6, rise: 0.14, drift: 0.5, size: 0.26, grow: 0.5 },
  },
  audio: {
    // A twin-turbo V12 diesel, idling low enough that you can count the firings.
    cylinders: 12,
    rolloff: { idle: 0.56, loaded: 0.36 },
    cylinderSpread: 0.14,
    asymmetryDeg: 8,
    irregularity: { idle: 0.22, loaded: 0.07 },
    modes: [16, 48, 80],
    dronePeak: { freq: 52, q: 5, gainDb: 8 },
    dampingHz: 1100,
    knock: { gain: 0.26, freq: 2800, q: 1.0 },
    tick: { gain: 0.05, freq: 3200 },
    intake: { idle: 0.07, loaded: 0.34, freq: 420 },
    crank: { from: 12, to: 34, ms: 1700 },
    // Two big turbos. The whine is what a modern tank is recognised by from a distance — an
    // Abrams is a turbine and is nothing but whine — and it is the one thing the pulse train
    // cannot produce on its own. Pitch and level follow load; the spool lag is why it swells
    // after the throttle rather than with it.
    turbo: { freq: { idle: 1150, loaded: 2600 }, gain: { idle: 0.035, loaded: 0.16 }, spoolS: 0.6 },
    // Steel links over steel sprockets. A 160 Hz hum is a tyre on tarmac, and this has neither.
    // clatterGain is 0: the modal strike in textures.ts measures like steel — bright partials,
    // a long ring, the higher ones dying first — and still lands on the ear as something hollow
    // and wooden. Until that is solved the sprocket squeal carries the layer on its own. The
    // generator and its tests stand; this is the one number that brings the clatter back.
    tracks: { clatterRate: 28, speedForRate1: 8, clatterGain: 0, squeal: { freq: 1750, q: 14, gain: 0.42 } },
    // The tracks are the loudest thing about it, but only by a little. Measured at the master
    // tap, 1.3/1.4 made the tank in Focus under thunder the loudest thing the app can produce,
    // and the mix has no limiter to catch it — see the note in constants.AUDIO.
    gain: { engine: 1.12, road: 1.16, wind: 0.85 },
    focusRate: 1.1,
  },
  pose: {
    // The figure is rigid above the hips — head is always hips.y + 0.60 and shoulders + 0.36 —
    // so riding with the head and shoulders out of a 2.42 m hatch is entirely a matter of how
    // high the hips are. 2.28 clears the cupola ring, not just the roof — at 2.15 the shoulders
    // sat inside the ring and only the top of the head came out.
    hips: [-0.05, 2.28, 0.46],
    torsoLean: 0.04,
    legSplay: 0.1,
    // Seated on the commander's stand, legs dropping into the turret where they are not seen.
    knee: [0.24, 2.13],
    foot: [0.34, 1.85],
    // Element 0 is the near hand and must have cos < 0 to land on the camera side; 180 and 0
    // put one hand at each end of the bar.
    gripAngles: [180, 0],
    headTurnYaw: -0.5,
    slumpScale: 0.15,
    // `sip` cannot be dropped from the gesture pool, so this has to be somewhere a hand really
    // reaches — about 0.4 m from the near shoulder, which is the roof just beside the hatch.
    cup: [-0.3, 2.48, -0.05],
    gearKnob: null,
  },
  gauges: { rpmFull: 3000, kmhFull: 80 },
  speed: { focus: 16 },
  build: buildTank,
};

export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  hatchback: HATCHBACK,
  van: VAN,
  sports: SPORTS,
  tank: TANK,
};

/** What the picker offers and what a preference may hold. Not every spec in VEHICLES. */
export const VEHICLE_ORDER: readonly VehicleId[] = LISTED_VEHICLES;
