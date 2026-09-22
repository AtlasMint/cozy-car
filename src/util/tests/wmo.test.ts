import { describe, expect, test } from 'bun:test';
import { wmoToKind, isWeatherKind, kindLabel, WEATHER_KINDS } from '../../weather/wmo';
import type { WeatherKind } from '../../core/store';

describe('WMO code mapping', () => {
  const table: [number[], WeatherKind][] = [
    [[0], 'clear'],
    [[1, 2], 'cloudy'],
    [[3], 'overcast'],
    [[45, 48], 'fog'],
    [[51, 53, 55, 56, 57], 'drizzle'],
    [[61, 63, 80, 81], 'rain'],
    [[65, 66, 67, 82], 'heavyRain'],
    [[71, 73, 75, 77, 85, 86], 'snow'],
    [[95, 96, 99], 'thunder'],
  ];
  for (const [codes, kind] of table) {
    test(`${codes.join(', ')} → ${kind}`, () => {
      for (const c of codes) expect(wmoToKind(c)).toBe(kind);
    });
  }

  test('unknown codes fall back to cloudy', () => {
    for (const c of [4, 10, 42, 60, 70, 90, 100, -1, NaN]) expect(wmoToKind(c)).toBe('cloudy');
  });

  test('every kind has a label and validates', () => {
    for (const k of WEATHER_KINDS) {
      expect(kindLabel(k, true).length).toBeGreaterThan(0);
      expect(kindLabel(k, false).length).toBeGreaterThan(0);
      expect(isWeatherKind(k)).toBe(true);
    }
    expect(isWeatherKind('hail')).toBe(false);
  });
});
