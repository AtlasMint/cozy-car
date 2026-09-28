import type { Mode } from './store';

/**
 * The mode machine, pure. Three places to be, and the whole rule about moving between them:
 *
 *               F                 F
 *    Park ───────────→ Chill ⇄──────── Focus
 *      ↑                 │               │
 *      └────── P ────────┴────── P ──────┘
 *
 * Park is where the app opens and where the engine is off. F pulls out onto the roadside and
 * never straight into Focus; P parks from anywhere. Stated once here, so the key, the control
 * and the store cannot disagree about it — the same reason `nextVehicle` exists.
 */
export const MODES: readonly Mode[] = ['park', 'chill', 'focus'];

export function isMode(v: unknown): v is Mode {
  return typeof v === 'string' && (MODES as readonly string[]).includes(v);
}

/** Which mode a key press asks for, or null for nothing. */
export function nextMode(key: 'p' | 'f', current: Mode): Mode | null {
  if (key === 'p') return current === 'park' ? null : 'park';
  if (current === 'park') return 'chill';
  return current === 'chill' ? 'focus' : 'chill';
}

/** Whether a click on the mode control may go there directly. */
export function canEnter(current: Mode, target: Mode): boolean {
  if (target === current) return false;
  return !(current === 'park' && target === 'focus');
}

/**
 * The engine runs exactly when the vehicle is not parked. This used to be a second field in
 * the store, set once by a start screen; a derived fact must not be a field that can disagree
 * with the one it derives from.
 */
export function engineOn(mode: Mode): boolean {
  return mode !== 'park';
}

/**
 * `#mode=chill` boots straight into a mode, for screenshots — the way `#weather=` forces the
 * sky. Never written by the app and never remembered: the app opens in Park.
 */
export function parseModeHash(hash: string): Mode | null {
  const m = /(^|[#&])mode=([a-zA-Z]+)/.exec(hash);
  const v = m?.[2];
  return isMode(v) ? v : null;
}
