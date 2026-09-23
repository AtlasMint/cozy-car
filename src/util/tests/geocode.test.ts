import { describe, expect, test } from 'bun:test';
import { formatPlace, parseGeocode } from '../../weather/openMeteo';

describe('geocoding', () => {
  test('formatPlace drops a region that repeats the name and skips blanks', () => {
    expect(formatPlace({ name: 'Berlin', admin1: 'Berlin', country: 'Germany' })).toBe('Berlin, Germany');
    expect(formatPlace({ name: 'Ipoh', admin1: 'Perak', country: 'Malaysia' })).toBe('Ipoh, Perak, Malaysia');
    expect(formatPlace({ name: 'Nowhere', admin1: ' ', country: undefined })).toBe('Nowhere');
  });

  test('parseGeocode keeps rows with coordinates and dedupes labels', () => {
    const data = {
      results: [
        { name: 'Paris', admin1: 'Île-de-France', country: 'France', latitude: 48.85, longitude: 2.35 },
        { name: 'Paris', admin1: 'Île-de-France', country: 'France', latitude: 48.86, longitude: 2.36 },
        { name: 'Paris', admin1: 'Texas', country: 'United States', latitude: 33.66, longitude: -95.55 },
        { name: 'Broken', latitude: 'x' },
      ],
    };
    const out = parseGeocode(data);
    expect(out.map((r) => r.label)).toEqual(['Paris, Île-de-France, France', 'Paris, Texas, United States']);
    expect(out[0]!.lat).toBe(48.85);
  });

  test('parseGeocode tolerates empty or malformed responses', () => {
    expect(parseGeocode({})).toEqual([]);
    expect(parseGeocode(null)).toEqual([]);
    expect(parseGeocode({ results: 'nope' })).toEqual([]);
  });
});
