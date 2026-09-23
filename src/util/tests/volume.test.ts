import { describe, expect, test } from 'bun:test';
import { isMuted, toggleMute } from '../../ui/volume';
import { AUDIO } from '../../core/constants';

describe('mute', () => {
  test('muted is zero, and nothing else', () => {
    expect(isMuted(0)).toBe(true);
    expect(isMuted(0.01)).toBe(false);
    expect(isMuted(1)).toBe(false);
  });

  test('pressing the speaker drops to zero and remembers where it was', () => {
    expect(toggleMute(0.42, 0.7)).toEqual({ volume: 0, restore: 0.42 });
  });

  test('pressing it again returns to that level', () => {
    const down = toggleMute(0.42, 0.7);
    expect(toggleMute(down.volume, down.restore)).toEqual({ volume: 0.42, restore: 0.42 });
  });

  test('a round trip is the identity, whatever the level', () => {
    for (const v of [0.01, 0.25, 0.5, 0.99, 1]) {
      const down = toggleMute(v, 0);
      expect(toggleMute(down.volume, down.restore).volume).toBe(v);
    }
  });

  test('un-muting with nothing remembered lands somewhere audible', () => {
    // Dragging the slider to zero on a fresh page, then pressing the speaker.
    expect(toggleMute(0, 0)).toEqual({ volume: AUDIO.DEFAULT_VOLUME, restore: 0 });
  });

  test('dragging to zero does not overwrite what un-mute returns to', () => {
    // The control only writes `restore` from a non-zero slider value, so a drag to zero
    // leaves the remembered level alone — this is the case that made mute-as-zero safe.
    let restore = 0.3;
    const dragged = 0;
    if (dragged > 0) restore = dragged;
    expect(toggleMute(dragged, restore).volume).toBe(0.3);
  });
});
