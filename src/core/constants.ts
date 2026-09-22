/**
 * ALL tunable numbers live here, grouped by system. A bare number inside a scene or motion
 * file is a bug. Units: metres, seconds, radians unless a name says otherwise.
 */

export const RENDER = {
  MAX_PIXEL_RATIO: 2,
  EXPOSURE_DAY: 1.0,
  EXPOSURE_NIGHT: 1.2,
} as const;
