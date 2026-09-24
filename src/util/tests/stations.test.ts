import { describe, expect, test } from 'bun:test';
import { countrySearchUrl, dominantCountry, geoSearchUrl, indexOfStation, isPlayable, mergeStations, toStations, type RawStation } from '../../audio/stations';
import { RADIO } from '../../core/constants';

const ok = (over: Partial<RawStation> = {}): RawStation => ({
  stationuuid: 'u1',
  name: 'Station One',
  url_resolved: 'https://stream.example.com/live.mp3',
  codec: 'MP3',
  bitrate: 128,
  tags: 'jazz',
  countrycode: 'MY',
  lastcheckok: 1,
  ...over,
});

describe('which stations a browser can play', () => {
  test('a good one passes', () => {
    expect(isPlayable(ok())).toBe(true);
  });

  test('http is out: mixed content is blocked silently on an https page', () => {
    expect(isPlayable(ok({ url_resolved: 'http://stream.example.com/live.mp3' }))).toBe(false);
  });

  test('HLS and playlists are out: they are not streams an audio element opens', () => {
    for (const url of [
      'https://s.example.com/x.m3u8',
      'https://s.example.com/x.pls',
      'https://s.example.com/x.m3u',
      'https://s.example.com/x.m3u8?token=abc',
    ]) {
      expect(isPlayable(ok({ url_resolved: url }))).toBe(false);
    }
  });

  test('unknown codecs are out, known ones are in whatever their case', () => {
    expect(isPlayable(ok({ codec: 'UNKNOWN' }))).toBe(false);
    expect(isPlayable(ok({ codec: '' }))).toBe(false);
    expect(isPlayable(ok({ codec: 'aac+' }))).toBe(true);
    for (const c of RADIO.CODECS) expect(isPlayable(ok({ codec: c }))).toBe(true);
  });

  test('a station the API knows is dead is out', () => {
    expect(isPlayable(ok({ lastcheckok: 0 }))).toBe(false);
  });

  test('nameless or idless rows are out', () => {
    expect(isPlayable(ok({ name: '   ' }))).toBe(false);
    expect(isPlayable(ok({ stationuuid: undefined }))).toBe(false);
  });
});

describe('building the band', () => {
  test('order is kept and repeats are dropped', () => {
    // The same network appears once per transmitter; a tuner wants one of each.
    const list = toStations([
      ok({ stationuuid: 'a', name: 'HITZ' }),
      ok({ stationuuid: 'b', name: 'Fly FM' }),
      ok({ stationuuid: 'c', name: 'hitz' }),
      ok({ stationuuid: 'd', name: 'Nope', codec: 'UNKNOWN' }),
    ]);
    expect(list.map((s) => s.name)).toEqual(['HITZ', 'Fly FM']);
  });

  test('nearby comes before national, and nothing twice', () => {
    const near = toStations([ok({ stationuuid: 'n1', name: 'Local FM' })]);
    const national = toStations([ok({ stationuuid: 'x1', name: 'Local FM' }), ok({ stationuuid: 'x2', name: 'Big FM' })]);
    const merged = mergeStations(near, national, 10);
    expect(merged.map((s) => s.name)).toEqual(['Local FM', 'Big FM']);
    expect(merged[0]!.id).toBe('n1');
  });

  test('the band is capped', () => {
    const many = toStations(Array.from({ length: 30 }, (_, i) => ok({ stationuuid: `s${i}`, name: `S${i}` })));
    expect(mergeStations(many, [], 8).length).toBe(8);
  });
});

describe('working out which country you are in', () => {
  test('the commonest country among nearby stations wins', () => {
    expect(dominantCountry([ok({ countrycode: 'MY' }), ok({ countrycode: 'SG' }), ok({ countrycode: 'MY' })])).toBe('MY');
  });

  test('junk country codes are ignored, and nothing usable gives null', () => {
    expect(dominantCountry([ok({ countrycode: '' }), ok({ countrycode: 'XYZ' })])).toBeNull();
    expect(dominantCountry([])).toBeNull();
  });
});

describe('the query URLs', () => {
  test('geo search pins the point, the radius and the ordering', () => {
    const u = geoSearchUrl(3.139, 101.687, 250000, 40);
    expect(u.startsWith(`${RADIO.API}/json/stations/search?`)).toBe(true);
    expect(u).toContain('geo_lat=3.1390');
    expect(u).toContain('geo_long=101.6870');
    expect(u).toContain('geo_distance=250000');
    expect(u).toContain('limit=40');
    // Both of these keep unplayable rows out before they are ever downloaded.
    expect(u).toContain('is_https=true');
    expect(u).toContain('hidebroken=true');
  });

  test('country search upper-cases and escapes its code', () => {
    expect(countrySearchUrl('my', 100)).toContain('countrycode=MY');
    expect(countrySearchUrl('a b', 10)).toContain('countrycode=A%20B');
  });
});

describe('remembering where the dial was', () => {
  const list = toStations([ok({ stationuuid: 'a', name: 'A' }), ok({ stationuuid: 'b', name: 'B' })]);
  test('a known station is found', () => {
    expect(indexOfStation(list, 'b')).toBe(1);
  });
  test('a station that has gone falls back to the top of the band', () => {
    expect(indexOfStation(list, 'vanished')).toBe(0);
    expect(indexOfStation(list, null)).toBe(0);
  });
});
