import { describe, expect, test } from 'bun:test';
import { parseSpotify, embedSrc, isShortLink, resolveShortLink } from '../../ui/spotifyPanel';

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
  test('a single song is as valid as a playlist', () => {
    // The thing people actually paste. This already worked; the tests lock it in, because the
    // reported bug was the UI never saying so.
    for (const link of [
      'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=8a9f0c1d2e3f4a5b',
      'https://open.spotify.com/intl-pt/track/4cOdK2wGLETKBW3PvgPWqT?si=x',
      '  spotify:track:4cOdK2wGLETKBW3PvgPWqT  ',
    ]) {
      expect(parseSpotify(link)).toEqual({ type: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' });
    }
  });

  test('short links are recognised as such', () => {
    expect(isShortLink('https://spotify.link/aBcD1234')).toBe(true);
    expect(isShortLink('https://spotify.app.link/aBcD1234')).toBe(true);
    expect(isShortLink('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')).toBe(false);
    // ...and are not parseable on their own, which is the whole problem with them.
    expect(parseSpotify('https://spotify.link/aBcD1234')).toBeNull();
  });

  describe('resolving a short link', () => {
    const res = (over: Partial<{ url: string; body: string }>) =>
      ({ url: '', text: async () => over.body ?? '', ...over }) as unknown as Response;

    test('takes the final URL when the fetch did redirect', async () => {
      const f = (async () => res({ url: 'https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3' })) as unknown as typeof fetch;
      expect(await resolveShortLink('https://spotify.link/x', 50, f)).toEqual({ type: 'album', id: '1DFixLWuPkv3KT3TnV35m3' });
    });

    test('digs the link out of an interstitial body', async () => {
      const body = '<html><meta content="https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT"></html>';
      const f = (async () => res({ body })) as unknown as typeof fetch;
      expect(await resolveShortLink('https://spotify.link/x', 50, f)).toEqual({ type: 'track', id: '4cOdK2wGLETKBW3PvgPWqT' });
    });

    test('a failure is null, never a throw', async () => {
      const boom = (async () => {
        throw new Error('CORS');
      }) as unknown as typeof fetch;
      expect(await resolveShortLink('https://spotify.link/x', 50, boom)).toBeNull();
      const empty = (async () => res({ body: 'nothing useful here' })) as unknown as typeof fetch;
      expect(await resolveShortLink('https://spotify.link/x', 50, empty)).toBeNull();
    });

    test('it gives up rather than hanging', async () => {
      const never = (async (_u: string, init?: RequestInit) =>
        new Promise<Response>((_r, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })) as unknown as typeof fetch;
      const t0 = Date.now();
      expect(await resolveShortLink('https://spotify.link/x', 60, never)).toBeNull();
      expect(Date.now() - t0).toBeLessThan(1000);
    });
  });

  test('embed src', () => {
    expect(embedSrc({ type: 'playlist', id: 'abc1234567' })).toBe('https://open.spotify.com/embed/playlist/abc1234567?utm_source=generator&theme=0');
  });
});
