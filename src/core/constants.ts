/**
 * ALL tunable numbers live here, grouped by system. A bare number inside a scene or motion
 * file is a bug. Units: metres, seconds, radians unless a name says otherwise.
 *
 * World axes: the car faces +X (its travel direction), Y is up, the car's right-hand side is
 * +Z. The camera sits on the rear-left quarter, i.e. at −X, +Y, −Z from the car, so the near
 * side of the car is the −Z side.
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
  HOODIE: '#4F8F5B',
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
  /** The van's wider frame shows the plinth's rear edge at −8, so the slab runs further back. */
  SLAB_BACK: -12,
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
    RECYCLE_BEHIND: -13,
    FIELD_LENGTH: 44,
    STREETLIGHTS: 2,
    /** count × spacing must equal FIELD_LENGTH, or the lamps strobe as the field wraps. */
    STREETLIGHT_SPACING: 22,
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
  /** Overall length, bumper centre to bumper centre. Consumed by chassis.ts. */
  LENGTH: 3.84,
  WIDTH: 1.68,
  /** Inner face of each side wall (doors, glass, pillars); the near wall mirrors at −FAR_WALL_Z. */
  FAR_WALL_Z: 0.79,
  FAR_WALL_THICKNESS: 0.05,
  FLOOR_Y: 0.28,
  FLOOR_TOP_Y: 0.32,
  SILL_Y: 0.46,
  /** Window sill line — the bottom edge of the side glass. Consumed by shell.ts. */
  BELT_Y: 1.02,
  /** Top of the window frames. There is no roof panel: the cabin is open. Consumed by shell.ts. */
  ROOF_Y: 1.415,
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
  /** Full-scale deflection of the two dials. Consumed by interior.ts. */
  GAUGE: { rpmFull: 8000, kmhFull: 180 },
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
  /** A location the user picked in the badge; overrides geolocation until cleared. */
  LOCATION_KEY: 'shotgun.location.v1',
  GEOCODE_URL: 'https://geocoding-api.open-meteo.com/v1/search',
  GEOCODE_COUNT: 6,
  GEOCODE_DEBOUNCE_MS: 300,
  GEOCODE_MIN_CHARS: 2,
} as const;

export const WEATHER_FX = {
  /** Cross-fade rate for effect intensities and looks (λ); ≈ 3 s to settle. */
  CROSSFADE_LAMBDA: 1.3,
  NIGHT_LAMBDA: 0.9,
  /** FogExp2 density per kind — tuned for the small slab and the 3.5 m camera distance. */
  FOG: { clear: 0.02, cloudy: 0.035, overcast: 0.04, fog: 0.14, drizzle: 0.05, rain: 0.06, heavyRain: 0.08, snow: 0.07, thunder: 0.07 },
  /** Precipitation intensity per kind (0..1). */
  INTENSITY: { drizzle: 0.35, rain: 0.7, heavyRain: 1.0, thunder: 0.85, snow: 0.8 },
  RAIN: {
    count: 4200,
    countLow: 2000,
    fall: 8,
    length: 0.36,
    width: 0.03,
    height: 9,
    field: { x0: -9, x1: 14, z0: -5.6, z1: 5.6 },
    shearMax: 1.6,
    color: '#E4EEF4',
    alpha: 0.6,
  },
  SNOW: { count: 1600, countLow: 700, fall: 1.1, size: 0.075, height: 8, drift: 0.35, shear: 0.22, field: { x0: -9, x1: 14, z0: -5.6, z1: 5.6 } },
  SPLASH: {
    count: 360,
    ring: 0.11,
    life: 0.55,
    field: { x0: -8, x1: 12, z0: -2.7, z1: 2.7 },
    spray: { perWheel: 56, life: 0.45, back: 1.6, up: 0.55, spread: 0.3, size: 0.1, minSpeed: 3 },
  },
  GLASS: { cell: 0.055, dropAlpha: 0.55, condenseBelowC: 12, condenseFullC: 2 },
  LIGHTNING: { minGap: 8, maxGap: 25, thunderMin: 1, thunderMax: 6 },
  HEADLIGHT: { length: 4.5, radius: 0.7, alpha: 0.09, color: '#FFE9C2', poolAlpha: 0.28 },
  STREETLIGHT: { intensity: 18, distance: 9, color: '#FFAA5E' },
  /** Rain/snow exclusion: the whole car including the roof volume, so the open cabin stays dry. */
  CAR_BOX: { min: [-1.98, 0, -0.86] as const, max: [1.98, 1.46, 0.86] as const },
  COLD_BOOST: { coldC: 8, coolC: 16, cold: 2.0, cool: 1.4 },
  /** Day looks per kind: sky top (also fog colour), sky bottom, key colour/intensity, hemisphere. */
  LOOKS: {
    clear: { top: '#7FA3B8', bottom: '#C6B49A', key: '#FFE7C4', keyI: 2.6, hemiSky: '#CFE0EA', hemiGround: '#8A7A68', hemiI: 1.0 },
    cloudy: { top: '#93A9B6', bottom: '#BDB4A4', key: '#FFF1E0', keyI: 1.8, hemiSky: '#C9D4DA', hemiGround: '#857A6C', hemiI: 1.05 },
    overcast: { top: '#9AA2A6', bottom: '#A9ABA7', key: '#E8ECEE', keyI: 0.9, hemiSky: '#BFC5C8', hemiGround: '#7E7A74', hemiI: 1.25 },
    fog: { top: '#B9BDBF', bottom: '#B0B2B0', key: '#E8ECEE', keyI: 0.5, hemiSky: '#C8CBCC', hemiGround: '#8A8A86', hemiI: 1.3 },
    drizzle: { top: '#8F9BA3', bottom: '#A2A6A3', key: '#DDE4E8', keyI: 0.8, hemiSky: '#B5BEC4', hemiGround: '#757570', hemiI: 1.2 },
    rain: { top: '#7E8B95', bottom: '#8E9294', key: '#D5DCE2', keyI: 0.6, hemiSky: '#A6B0B8', hemiGround: '#6B6B68', hemiI: 1.15 },
    heavyRain: { top: '#66727C', bottom: '#767B7F', key: '#C9D0D6', keyI: 0.4, hemiSky: '#8F9AA3', hemiGround: '#5E5E5B', hemiI: 1.1 },
    snow: { top: '#B8C2CA', bottom: '#D2D6D6', key: '#EEF3FF', keyI: 1.2, hemiSky: '#D6DEE4', hemiGround: '#9A9C9C', hemiI: 1.3 },
    thunder: { top: '#4F5863', bottom: '#5E636A', key: '#B9C2CC', keyI: 0.35, hemiSky: '#7A8590', hemiGround: '#4E4E4C', hemiI: 1.0 },
  },
  NIGHT: { top: '#0D1620', bottom: '#1A2430', key: '#8FA5C8', keyI: 0.25, hemiSky: '#2A3644', hemiGround: '#141210', hemiI: 0.4 },
  /** The failure state: "showing a clear evening" — clear, half-way to night. */
  EVENING_NIGHT: 0.55,
} as const;

export const QUALITY = {
  /** Frame-time probe: skip the first seconds (shader compiles), then average. */
  PROBE_SKIP_S: 1.5,
  PROBE_SECONDS: 3,
  /** Average frame time above which quality drops to low (≈ 45 fps). */
  LOW_ABOVE_MS: 22,
  SHADOW_MAP_HIGH: 1024,
  SHADOW_MAP_LOW: 512,
  /** Precipitation density multiplier on low quality. */
  PRECIP_SCALE_LOW: 0.5,
} as const;

export const AUDIO = {
  DEFAULT_VOLUME: 0.7,
  /** Layer gain smoothing (λ). */
  LEVEL_LAMBDA: 1.5,
  /** Engine loop playback rate in Focus. */
  FOCUS_RATE: 1.35,
  /** Duck factor while the radio panel is open. */
  DUCK: 0.35,
  /**
   * How loud a layer is against its neighbours on the same bus. Weather used to be set here
   * against the engine, which is why it shouted: rain at 0.55 beside an engine at 0.5 is not
   * equal loudness, because rain is broadband and an engine is harmonic.
   */
  LEVELS: { engine: 0.5, roadNoise: 0.45, rain: 0.42, wind: 0.26, ambience: 0.22, thunder: 0.55, crank: 0.4, gun: 0.62 },
  /**
   * NOTE ON HEADROOM. There is no limiter between the master fader and the destination, so the
   * sum of the buses is what reaches the output. Measured at the master tap, the camper in Focus
   * under thunder peaks at 0.92 with the volume at its default 0.7 — and therefore around 1.3
   * with the slider all the way up, which clips. That predates the levels below and is not
   * something they can fix; a DynamicsCompressorNode on the master would be the honest answer.
   * Until then, nothing new should be allowed to raise that peak.
   *
   * How loud each group sits in the scene, between its layers and the master fader. Weather at
   * 0.55 is the headline: the sky is no longer allowed to be as loud as the car you are in.
   */
  BUSES: { engine: 1, weather: 0.55, ambience: 0.8, music: 0.9 },
  /** The rain texture. `density` is drops per second — the drizzle/downpour axis. */
  RAIN_SYNTH: {
    seconds: 4,
    density: { light: 900, heavy: 5200 },
    /** Impact decay time, seconds: how long one drop rings. */
    tau: [0.0015, 0.006] as const,
    /** Impact resonance, Hz, drawn log-uniform across it. */
    freq: [1200, 8000] as const,
    /** Normalised level of the generated buffer. */
    rms: 0.18,
    /** The far-field bed: `dry` is how much stays unfiltered above `cutoff`. */
    bed: { cutoff: 900, dry: 0.22, gain: 0.35 },
    /** Two decorrelated copies per texture; one alone lets you hear the loop. */
    rates: [0.96, 1.05] as const,
    /**
     * Trim on the whole rain layer. Two uncorrelated copies sum to √2 of one, and the texture
     * is normalised rather than trimmed the way the old filtered-noise chain was, so without
     * this the rewrite arrives 6 dB hotter and quietly undoes the level fix above. Set by
     * measuring the 2–8 kHz band against the previous build.
     */
    gain: 0.5,
    /** The lowpass opens with intensity, so a downpour is brighter as well as louder. */
    tone: { from: 3800, to: 11000 },
    /** Heavy rain gains a low bed no amount of hiss can stand in for. */
    rumble: { freq: 180, gain: 0.5, from: 0.55 },
  },
  /**
   * Wind. Three resonances rather than one, each swept at a rate that shares no common factor
   * with the others — one bandpass on one LFO breathes on a metronome, and the ear finds the
   * period within seconds.
   */
  WIND_SYNTH: {
    bands: [180, 420, 1100] as const,
    q: [1.6, 1.2, 0.9] as const,
    gains: [0.55, 0.75, 0.32] as const,
    lfo: [0.07, 0.11, 0.19] as const,
    /** How far each LFO sweeps its band, as a fraction of that band's centre. */
    sweep: 0.32,
    /**
     * Gusts: a damped random walk, which is what makes wind read as weather rather than as a
     * filter. `lambda` pulls it back to nothing, `kick` is how hard it is shoved, `depth` how
     * much of the level it owns, `qLift` how much the top band tightens at the peak of one.
     */
    gust: { lambda: 0.22, kick: 3.2, depth: 0.55, qLift: 0.7 },
    /**
     * Trim on the whole layer. Three summed bands with a brown source under the lowest one
     * arrive about 6 dB above the single white-noise bandpass they replace; measured against
     * the previous build the same way rain was.
     */
    gain: 0.48,
  },
} as const;

export const INTERACTION = {
  HOVER_HZ: 20,
  CLICK_SLOP_PX: 6,
  PUSH_IN_MS: 900,
  /** Half a vehicle swap: the screen fades to black over this, and back over it again. */
  SWAP_FADE_MS: 280,
  RADIO_ZOOM: 3.2,
  /** Emissive lift on hover. */
  HOVER_EMISSIVE: 0.35,
} as const;

/**
 * Live radio, from Radio Browser: free, no key, and it answers with
 * `access-control-allow-origin: *` so a browser can call it directly.
 */
export const RADIO = {
  /**
   * The project asks that no single server be hardcoded; this name round-robins across them.
   * It also asks for a descriptive User-Agent, which a browser will not let fetch set — so we
   * cannot comply with that one, and say so rather than pretending.
   */
  API: 'https://all.api.radio-browser.info',
  /** Codecs an <audio> element decodes without help. */
  CODECS: ['MP3', 'AAC', 'AAC+', 'AACP', 'OGG', 'FLAC'] as const,
  /** How far out "nearby" reaches when working out which country you are in. */
  GEO_DISTANCE_M: 250_000,
  /** Nearby stations fetched to derive the country, then the national list, then the tuner. */
  GEO_LIMIT: 40,
  COUNTRY_LIMIT: 100,
  BAND_LIMIT: 60,
  TIMEOUT_MS: 7000,
  /** A dead stream is skipped rather than dwelt on; give up after this many in a row. */
  SKIP_LIMIT: 4,
  STORAGE_KEY: 'shotgun.radio.v1',
} as const;

/**
 * The tank's main gun. Recoil and the hull kick are each one damped spring, shoved once a shot;
 * the peak of a spring given an initial velocity v is about v/omega, which is how these were set:
 * ~0.42 m of barrel travel, ~4 cm of heave and ~2.6 degrees of nose-up pitch.
 */
export const TANK_GUN = {
  /** A round every few seconds, which is about what a loader manages. */
  reloadS: 3.2,
  recoilSpeed: 5.2,
  barrelOmega: 12,
  barrelZeta: 0.55,
  hullHeave: 0.36,
  hullPitch: 0.42,
  hullOmega: 9,
  hullZeta: 0.42,
  /** Long enough to survive a frame or two at 60 fps; a 90 ms flash is often simply missed. */
  flashS: 0.14,
  smokeS: 1.6,
} as const;

export const SPOTIFY = {
  /**
   * Built-in playlists mapped to the radio's six preset buttons (first four used).
   *
   * Every id here was fetched and its name read back, because an embed answers 200 with an
   * error page for a dead one — a real playlist comes back around 150 kB, a dead one about 6.
   * That check is also what found "Night drive" pointing at a playlist called Chill Pop.
   */
  PRESETS: [
    { label: 'Saxophone jazz', type: 'playlist', id: '6HhLjsFt1JywDYIbnN7ghQ' },
    { label: 'Peaceful piano', type: 'playlist', id: '37i9dQZF1DX4sWSpwq3LiO' },
    { label: 'Jazz in the background', type: 'playlist', id: '37i9dQZF1DWV7EzJMK2FUI' },
    { label: 'Chill pop', type: 'playlist', id: '37i9dQZF1DX0MLFaUdXnjA' },
  ],
  STORAGE_KEY: 'shotgun.spotify.v1',
} as const;
