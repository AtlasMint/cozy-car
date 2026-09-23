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
import { AUDIO, CAMERA, CAR, INTERACTION, MOTION, PALETTE, SPEED, WEATHER_FX } from './constants';
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

export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  hatchback: HATCHBACK,
  // van and sports land in their own phases
  van: HATCHBACK,
  sports: HATCHBACK,
};

export const VEHICLE_ORDER: readonly VehicleId[] = ['hatchback', 'van', 'sports'];
