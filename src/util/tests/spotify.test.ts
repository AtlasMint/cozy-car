import { describe, expect, test } from 'bun:test';
import { parseSpotify, embedSrc } from '../../ui/spotifyPanel';

describe('spotify link parsing', () => {
  test('open.spotify.com URLs', () => {
    expect(parseSpotify('https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn?si=abc')).toEqual({ type: 'playlist', id: '37i9dQZF1DWWQRwui0ExPn' });
    expect(parseSpotify('https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC')).toEqual({ type: 'track', id: '4uLU6hMCjMI75M1A2tKUQC' });
    expect(parseSpotify('https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3')).toEqual({ type: 'album', id: '1DFixLWuPkv3KT3TnV35m3' });
  });
  test('spotify: URIs', () => {
    expect(parseSpotify('spotify:track:4uLU6hMCjMI75M1A2tKUQC')).toEqual({ type: 'track', id: '4uLU6hMCjMI75M1A2tKUQC' });
  });
  test('rejects junk', () => {
    expect(parseSpotify('https://example.com/playlist/123')).toBeNull();
    expect(parseSpotify('hello')).toBeNull();
    expect(parseSpotify('')).toBeNull();
  });
  test('embed src', () => {
    expect(embedSrc({ type: 'playlist', id: 'abc1234567' })).toBe('https://open.spotify.com/embed/playlist/abc1234567?utm_source=generator&theme=0');
  });
});
