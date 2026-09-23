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
import type { VehicleId } from './store';
import { buildHatchback } from '../scene/car/bodies/hatchback';
import { buildSports } from '../scene/car/bodies/sports';
import { AUDIO, CAMERA, CAR, INTERACTION, MOTION, PALETTE, SPEED, WEATHER_FX } from './constants';
import { DEG } from '../util/math';
import type { Builder, CarMaterials, PaintSpec } from '../scene/car/parts';
import type { GlassPane } from '../scene/car/shell';
import type * as THREE from 'three';

export type Vec3 = readonly [number, number, number];

/**
 * What a body hands back to the assembler. Every vehicle exports one `build` of this shape;
 * nothing else about a body is visible to the rest of the app.
 */
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
  /** Half-extents of the invisible hitbox around the radio. */
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

export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  hatchback: HATCHBACK,
  // the van lands in its own phase
  van: HATCHBACK,
  sports: SPORTS,
};

export const VEHICLE_ORDER: readonly VehicleId[] = ['hatchback', 'van', 'sports'];
