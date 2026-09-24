import { RADIO } from '../core/constants';

/**
 * Talking to Radio Browser, and deciding which of what comes back a browser can actually play.
 *
 * Everything here is pure: URL building and list filtering, so the rules can be tested without
 * a network. The rules matter more than they look — most of what the API returns will not play
 * in an `<audio>` element, and each exclusion below is a stream that silently does nothing.
 */
export interface RawStation {
  stationuuid?: string;
  name?: string;
  url_resolved?: string;
  codec?: string;
  bitrate?: number;
  tags?: string;
  countrycode?: string;
  lastcheckok?: number;
}

export interface Station {
  id: string;
  name: string;
  url: string;
  codec: string;
  bitrate: number;
  tags: string;
  countryCode: string;
}

/** Stream containers an `<audio>` element will not open on its own. */
const PLAYLIST_SUFFIX = ['.m3u8', '.pls', '.m3u', '.asx', '.xspf'];

/**
 * Can a browser play this?
 *
 * - **https only.** An http stream on an https page is blocked as mixed content, silently.
 * - **A codec browsers decode.** UNKNOWN is exactly that, and it is usually a container.
 * - **Not a playlist or HLS.** `.m3u8` needs Media Source Extensions everywhere except Safari;
 *   `.pls` and `.m3u` are text files listing streams, not streams.
 * - **Last check passed**, because the API keeps dead stations around.
 */
export function isPlayable(s: RawStation): boolean {
  const url = (s.url_resolved ?? '').trim();
  if (!url.toLowerCase().startsWith('https://')) return false;
  if (!s.stationuuid || !s.name?.trim()) return false;
  if (s.lastcheckok !== 1) return false;
  if (!RADIO.CODECS.includes((s.codec ?? '').toUpperCase() as (typeof RADIO.CODECS)[number])) return false;
  const path = url.split('?')[0]!.toLowerCase();
  return !PLAYLIST_SUFFIX.some((ext) => path.endsWith(ext));
}

/** Keep the playable ones, in the order given, one per station name. */
export function toStations(raw: readonly RawStation[]): Station[] {
  const seen = new Set<string>();
  const out: Station[] = [];
  for (const s of raw) {
    if (!isPlayable(s)) continue;
    const name = s.name!.trim();
    const key = name.toLowerCase();
    // The same network is listed once per transmitter; a tuner wants one of each.
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: s.stationuuid!,
      name,
      url: s.url_resolved!.trim(),
      codec: (s.codec ?? '').toUpperCase(),
      bitrate: s.bitrate ?? 0,
      tags: s.tags ?? '',
      countryCode: (s.countrycode ?? '').toUpperCase(),
    });
  }
  return out;
}

const COMMON = 'hidebroken=true&is_https=true&order=clickcount&reverse=true';

/** Stations within `metres` of a point, most-played first. */
export function geoSearchUrl(lat: number, lon: number, metres: number, limit: number): string {
  return `${RADIO.API}/json/stations/search?${COMMON}&geo_lat=${lat.toFixed(4)}&geo_long=${lon.toFixed(4)}&geo_distance=${Math.round(metres)}&limit=${Math.round(limit)}`;
}

/** Every station in a country, most-played first. */
export function countrySearchUrl(code: string, limit: number): string {
  return `${RADIO.API}/json/stations/search?${COMMON}&countrycode=${encodeURIComponent(code.toUpperCase())}&limit=${Math.round(limit)}`;
}

/**
 * Which country these coordinates are in, according to the stations around them.
 *
 * Radio Browser has no reverse geocoder and the app has no country code — only a latitude and a
 * longitude. But a geo search answers with stations that each carry a country, so the country
 * you are in is simply the commonest one nearby. No second service, no extra key.
 */
export function dominantCountry(raw: readonly RawStation[]): string | null {
  const counts = new Map<string, number>();
  for (const s of raw) {
    const cc = (s.countrycode ?? '').trim().toUpperCase();
    if (cc.length !== 2) continue;
    counts.set(cc, (counts.get(cc) ?? 0) + 1);
  }
  let best: string | null = null;
  let most = 0;
  for (const [cc, n] of counts) {
    if (n > most) {
      most = n;
      best = cc;
    }
  }
  return best;
}

/** Nearby first, then the rest of the country, without repeats. */
export function mergeStations(near: readonly Station[], national: readonly Station[], limit: number): Station[] {
  const out: Station[] = [];
  const seen = new Set<string>();
  for (const s of [...near, ...national]) {
    const key = s.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= limit) break;
  }
  return out;
}

/** Where a station id sits in a list, or 0 when it is not there any more. */
export function indexOfStation(stations: readonly Station[], id: string | null): number {
  if (!id) return 0;
  const i = stations.findIndex((s) => s.id === id);
  return i >= 0 ? i : 0;
}
