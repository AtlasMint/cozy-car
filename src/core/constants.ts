/**
 * ALL tunable numbers live here, grouped by system. A bare number inside a scene or motion
 * file is a bug. Units: metres, seconds, radians unless a name says otherwise.
 *
 * World axes: the car faces +X (its travel direction), Y is up, the car's right-hand side is
 * +Z. The camera sits on the rear-left quarter, i.e. at −X, +Y, −Z from the car, so the near
 * (cut-away) side of the car is the −Z side.
 */
import { DEG } from '../util/math';

export const RENDER = {
  MAX_PIXEL_RATIO: 2,
  EXPOSURE_DAY: 1.0,
  EXPOSURE_NIGHT: 1.2,
} as const;

export const PALETTE = {
  BODY: '#7A9E9F',
  BODY_TRIM: '#2B2E30',
  CUT: '#F2E3C9',
  VINYL: '#2A211C',
  FABRIC: '#6B5B4E',
  FABRIC_LIGHT: '#8A786A',
  DASH_GLOW: '#C9884A',
  LCD: '#E8D7B9',
  TYRE: '#23201F',
  HUB: '#B9B4A8',
  GLASS: '#8FB3C2',
  CHROME: '#D8D6CF',
  TAIL_LIGHT: '#C8281E',
  HEAD_LIGHT: '#FFF3D6',
  HOODIE: '#D4573F',
  SKIN: '#C8967A',
  HAIR: '#2B2320',
  SLAB_TOP: '#C9BFAE',
  SLAB_SIDE: '#B1A695',
  ASPHALT: '#4B4B4E',
  MARKING: '#DCD6C5',
  SODIUM: '#FFAA5E',
} as const;

export const CAMERA = {
  /** Metres of world height visible at zoom 1. */
  VIEW_SIZE: 5.2,
  /** Narrow viewports widen the view so the car (≈3.9 m on screen) still fits. */
  MIN_VIEW_WIDTH: 5.4,
  /** Straight-line distance from target to camera along the view axis. Kept short so the
   *  scene's FogExp2 densities are tuned around the car rather than around a far camera. */
  DISTANCE: 3.5,
  NEAR: -40,
  FAR: 80,
  /** Look-at point. Offset behind and to the near side of the car so the car sits in the
   *  upper-middle of the frame with the slab's near edge and the void showing beneath it. */
  TARGET: [-0.5, 0.55, -0.75] as const,
  /** True isometric elevation, atan(1/√2) ≈ 35.264°. */
  ELEVATION: Math.atan(1 / Math.SQRT2),
  /** Rear-left quarter: camera direction (−1, 0, −1) in the XZ plane. */
  AZIMUTH: (-3 * Math.PI) / 4,
  PARALLAX_AZ: 3 * DEG,
  PARALLAX_EL: 2 * DEG,
  PARALLAX_LAMBDA: 3,
} as const;

export const WORLD = {
  SLAB_BACK: -8,
  SLAB_FRONT: 30,
  SLAB_WIDTH: 10,
  SLAB_FAR_WIDTH: 8,
  SLAB_THICKNESS: 0.7,
  SLAB_CORNER: 1.4,
  ROAD_WIDTH: 5.6,
  /** Metres of road covered by one texture repeat. */
  ROAD_TILE_LENGTH: 8,
  ROAD_Y: 0.012,
  ROAD_TEXTURE_PX: 512,
  SCENERY: {
    /** Instances wrap forward by FIELD_LENGTH once they pass RECYCLE_BEHIND. */
    RECYCLE_BEHIND: -9,
    FIELD_LENGTH: 40,
    STREETLIGHTS: 2,
    STREETLIGHT_SPACING: 35,
    STREETLIGHT_PHASE: 6,
    PINES: 26,
    BUSHES: 40,
    GUARDRAILS: 10,
    SIGNS: 4,
    MARKERS: 12,
    BUILDINGS: 3,
  },
} as const;

export const CAR = {
  /**
   * Lateral position of the cut plane on the car's lateral axis (world Z). Everything above
   * the sills that lies nearer the camera than this plane is simply not built; parts that
   * cross it are capped in the cut material. Named per PLAN.md so the glTF seam can keep it.
   */
  CUT_PLANE_X: -0.36,
  /**
   * The roof is sheared on its own, further toward the far side. From the rear-left at
   * isometric elevation, a roof cut on the main plane would sit directly between the camera
   * and the driver's head and shoulders; staggering this one cut (a common cutaway-drawing
   * device) keeps the driver, wheel and far door card in view.
   */
  ROOF_CUT_X: 0.42,
  LENGTH: 3.8,
  WIDTH: 1.68,
  /** Inner face of the far-side body wall (doors, glass, pillars). */
  FAR_WALL_Z: 0.79,
  FAR_WALL_THICKNESS: 0.05,
  FLOOR_Y: 0.28,
  FLOOR_TOP_Y: 0.32,
  SILL_Y: 0.46,
  BELT_Y: 1.0,
  ROOF_Y: 1.42,
  WHEELBASE: 2.4,
  TRACK: 1.38,
  WHEEL_RADIUS: 0.29,
  WHEEL_WIDTH: 0.18,
  ARCH_RADIUS: 0.35,
  DRIVER_Z: 0.38,
  PASSENGER_Z: -0.38,
  SEAT_WIDTH: 0.5,
  /** Steering wheel hub centre and the column direction it faces (toward the driver). */
  WHEEL_CENTRE: [0.4, 0.94, 0.38] as const,
  WHEEL_NORMAL: [-0.928, 0.371, 0] as const,
  STEERING_RADIUS: 0.17,
  EXHAUST_TIP: [-2.0, 0.24, -0.52] as const,
  /** Rear face of the radio faceplate; the camera push-in centres on this. */
  RADIO_FACE: [0.552, 0.845, 0] as const,
  MIRROR_PIVOT: [0.22, 1.19, 0.0] as const,
} as const;

export const DRIVER = {
  BREATH_HZ: 0.22,
  BREATH_SCALE: 0.015,
  /** Head lags the body's vertical motion by this many seconds and undershoots it. */
  HEAD_LAG: 0.09,
  HEAD_UNDERSHOOT: 0.65,
  GESTURE_GAP_MIN: 12,
  GESTURE_GAP_MAX: 30,
  /** Extra backward lean in Chill, radians. */
  CHILL_SLUMP: 0.1,
  POSTURE_OMEGA: 2.2,
  REDUCED_MOTION_SCALE: 0.25,
  CUP_POSITION: [0.14, 0.6, -0.08] as const,
  GEAR_KNOB: [0.3, 0.66, 0] as const,
} as const;

export const MOTION = {
  /** Mode blend and ignition ramp spring frequencies (rad/s). */
  MODE_OMEGA: 2.2,
  ENGINE_OMEGA: 3.0,
  IDLE_HZ: 11,
  IDLE: {
    chill: { y: 0.006, roll: 0.25 * DEG },
    focus: { y: 0.004, roll: 0.15 * DEG },
  },
  SWAY: {
    hz: 0.5,
    chill: { y: 0.008, pitch: 0.3 * DEG },
    focus: { y: 0.02, pitch: 0.9 * DEG },
  },
  /** Road noise reaches full amplitude at `fullAt` m/s. */
  ROAD: { hz: 3.2, y: 0.025, roll: 0.7 * DEG, fullAt: 15 },
  /** Poisson bumps: `rate` per second at full speed; impulse metres into a spring of `omega`. */
  BUMP: { rate: 0.12, impulse: 0.05, rearDelay: 0.12, omega: 16 },
  BODY_SPRING_OMEGA: 9,
  /** Velocity kick (m/s) into the body spring at ignition — the dip and rebound. */
  IGNITION_KICK: -0.55,
  /** Fraction of wheel travel transmitted to the body, and pitch per metre of front−rear difference. */
  WHEEL_TO_BODY: 0.55,
  WHEEL_TO_PITCH: 0.35,
  REDUCED_SCALE: 0.25,
  /** A car shakes; a UI you are reading should not. */
  FOCUSED_OBJECT_SCALE: 0.4,
  RPM: { idle: 750, idleJitter: 40, cruise: 2200, wander: 220, sweepMs: 1200, sweepPeak: 6500 },
  FRESHENER: { length: 0.17, damping: 1.1, pitchGain: 0.9, yGain: 0.5, accelGain: 0.06 },
  EXHAUST: { chillRate: 1.4, focusRate: 3.0, life: 1.7, rise: 0.22, drift: 0.7, size: 0.14, grow: 0.4, coldBoost: 1.2 },
  /** Dash and headlights fade up over this long at ignition. */
  IGNITION_LIGHTS_LAMBDA: 7,
} as const;

export const SPEED = {
  /** Focus cruising speed, m/s (≈ 80 km/h). */
  FOCUS: 22,
  /** Same spring as the mode blend so everything accelerates and coasts together. */
  OMEGA: 2.2,
} as const;

export const WEATHER = {
  FALLBACK_LOCATION: { lat: 3.139, lon: 101.687, label: 'Kuala Lumpur' },
  GEO_TIMEOUT_MS: 6000,
  FETCH_TIMEOUT_MS: 8000,
  CACHE_KEY: 'shotgun.weather.v1',
  CACHE_TTL_MS: 10 * 60 * 1000,
  REFRESH_MS: 15 * 60 * 1000,
} as const;
