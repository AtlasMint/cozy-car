import type { WeatherKind } from '../core/store';

/** WMO weather interpretation code → the nine kinds the scene can show. Pure. */
export function wmoToKind(code: number): WeatherKind {
  switch (code) {
    case 0:
      return 'clear';
    case 1:
    case 2:
      return 'cloudy';
    case 3:
      return 'overcast';
    case 45:
    case 48:
      return 'fog';
    case 51:
    case 53:
    case 55:
    case 56:
    case 57:
      return 'drizzle';
    case 61:
    case 63:
    case 80:
    case 81:
      return 'rain';
    case 65:
    case 66:
    case 67:
    case 82:
      return 'heavyRain';
    case 71:
    case 73:
    case 75:
    case 77:
    case 85:
    case 86:
      return 'snow';
    case 95:
    case 96:
    case 99:
      return 'thunder';
    default:
      return 'cloudy';
  }
}

export const WEATHER_KINDS: readonly WeatherKind[] = [
  'clear',
  'cloudy',
  'overcast',
  'fog',
  'drizzle',
  'rain',
  'heavyRain',
  'snow',
  'thunder',
];

export function isWeatherKind(v: string): v is WeatherKind {
  return (WEATHER_KINDS as readonly string[]).includes(v);
}

/** Human label for the badge. */
export function kindLabel(kind: WeatherKind, isDay: boolean): string {
  switch (kind) {
    case 'clear':
      return isDay ? 'Clear' : 'Clear night';
    case 'cloudy':
      return 'Partly cloudy';
    case 'overcast':
      return 'Overcast';
    case 'fog':
      return 'Fog';
    case 'drizzle':
      return 'Drizzle';
    case 'rain':
      return 'Rain';
    case 'heavyRain':
      return 'Heavy rain';
    case 'snow':
      return 'Snow';
    case 'thunder':
      return 'Thunderstorm';
  }
}
