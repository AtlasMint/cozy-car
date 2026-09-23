# Audio

**Nothing here is required.** The app synthesizes every layer, and that is what ships: the
engine is a pulse-train model in [src/audio/engineVoice.ts](../../src/audio/engineVoice.ts) and
the rest are small procedural beds. A file dropped in this folder *replaces* its layer, rather
than the other way round.

| File | Layer | Suggested length | Notes |
|---|---|---|---|
| `engine-idle.ogg` | engine | 6–12 s seamless loop | Replaces the synthesized engine entirely, including its per-vehicle voice. Recorded outside the car. |
| `road-hum.ogg` | roadNoise | 8–15 s loop | Tyre roar on tarmac, exterior. Gain follows speed. |
| `rain-loop.ogg` | rain | 10–20 s loop | Steady rain on pavement, no drips on metal — the listener is outside. |
| `wind.ogg` | wind | 15–30 s loop | Soft wind, no whistling. Gain follows wind speed, mode and vehicle. |
| `outdoor-tone.ogg` | ambience | 20–40 s loop | Very quiet outdoor room tone. Ducked at night. |

Sources: search [freesound.org](https://freesound.org) with the licence filter set to
**Creative Commons 0**, or [pixabay.com/sound-effects](https://pixabay.com/sound-effects/).
Export as Ogg Vorbis, mono, 44.1 kHz, normalised to about −18 dBFS RMS so the mix levels in
`src/core/constants.ts` (`AUDIO.LEVELS`) sit right without retuning.

## Per-vehicle voices

Each vehicle carries its own `EngineProfile` on its spec in `src/core/vehicles.ts`: cylinder
count, harmonic rolloff, per-cylinder spread, firing asymmetry, irregularity, exhaust modes,
drone peak, knock and tick bands, intake gain, crank sweep and layer gains. Those drive the
synthesized engine directly.

A single `engine-idle.ogg` would flatten all three to one recording played at different rates,
which is why none ships. If you add per-vehicle recordings later, give the layer loader a
per-vehicle filename and keep the synth as the fallback for whichever vehicle has no file —
the fallback must stay honest per vehicle, not fall back to the hatchback.

The mix is an exterior perspective: engine and road forward, cabin sounds distant, and there is
deliberately no rain-on-the-roof layer.
