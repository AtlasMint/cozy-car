import { expect, test } from 'bun:test';
import { createMixer } from '../../audio/mixer';

// Held (a phone upright) must stay silent through the two things that otherwise resume the
// context: a gesture, and the tab coming back into view. Only releasing it lets the sound out.
test('a held mixer stays suspended until released', async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  const saved = { window: g.window, document: g.document };
  let onVisibility = () => {};
  const doc = { hidden: false, addEventListener: (_: string, f: () => void) => (onVisibility = f), removeEventListener() {} };
  const node = () => ({ gain: { value: 1 }, threshold: {}, knee: {}, ratio: {}, attack: {}, release: {}, connect: (n: unknown) => n });
  class FakeContext {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    createGain = node;
    createDynamicsCompressor = node;
    async resume() {
      this.state = 'running';
    }
    async suspend() {
      this.state = 'suspended';
    }
    async close() {}
  }
  g.document = doc;
  g.window = { AudioContext: FakeContext };
  try {
    const mixer = createMixer();
    const state = () => (mixer.context as unknown as FakeContext).state;
    await mixer.resume();
    expect(state()).toBe('running');

    mixer.hold(true);
    await mixer.resume(); // the gesture
    expect(state()).toBe('suspended');
    doc.hidden = true;
    onVisibility();
    doc.hidden = false;
    onVisibility(); // back in view
    await Promise.resolve();
    expect(state()).toBe('suspended');

    mixer.hold(false);
    await Promise.resolve();
    expect(state()).toBe('running');
    mixer.dispose();
  } finally {
    g.window = saved.window;
    g.document = saved.document;
  }
});
