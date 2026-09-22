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
  TAIL_LIGHT: '#D8382A',
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
  VIEW_SIZE: 7.4,
  /** Narrow viewports widen the view so the car (≈3.9 m on screen) still fits. */
  MIN_VIEW_WIDTH: 5.4,
  /** Straight-line distance from target to camera along the view axis. Kept short so the
   *  scene's FogExp2 densities are tuned around the car rather than around a far camera. */
  DISTANCE: 3.5,
  NEAR: -40,
  FAR: 80,
  /** Look-at point: roughly the driver's hip height, not the ground. */
  TARGET: [0.15, 0.78, 0.05] as const,
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
  SLAB_WIDTH: 12,
  SLAB_FAR_WIDTH: 9,
  SLAB_THICKNESS: 0.7,
  SLAB_CORNER: 1.4,
  ROAD_WIDTH: 6.2,
  /** Metres of road covered by one texture repeat. */
  ROAD_TILE_LENGTH: 8,
  ROAD_Y: 0.012,
  ROAD_TEXTURE_PX: 512,
} as const;
