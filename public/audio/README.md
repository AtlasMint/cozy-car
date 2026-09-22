# Audio loops

Drop CC0 loops here and the app picks them up automatically. Anything missing (or anything
that fails to decode) is replaced at runtime by a small Web Audio synth stand-in, so the app
never breaks and has sound out of the box. The repo stays text-only.

| File | Layer | Suggested length | Notes |
|---|---|---|---|
| `engine-idle.ogg` | engine | 6–12 s seamless loop | Small four-cylinder idling, recorded outside the car. Playback rate is raised to 1.35× in Focus, so avoid loops with an audible pulse. |
| `road-hum.ogg` | roadNoise | 8–15 s loop | Tyre roar on tarmac at ~80 km/h, exterior. Gain follows speed. |
| `rain-loop.ogg` | rain | 10–20 s loop | Steady rain on pavement, no drips on metal — the listener is outside. |
| `wind.ogg` | wind | 15–30 s loop | Soft wind, no whistling. Gain follows wind speed and mode. |
| `outdoor-tone.ogg` | ambience | 20–40 s loop | Very quiet outdoor room tone; distant road, birds at most. Ducked at night. |
| `thunder-*.ogg` | thunder | 3–6 s one-shots | Optional. Not loaded yet — thunder is synthesized. |

Sources: search [freesound.org](https://freesound.org) with the licence filter set to
**Creative Commons 0**, or [pixabay.com/sound-effects](https://pixabay.com/sound-effects/).
Export as Ogg Vorbis, mono, 44.1 kHz, normalised to about −18 dBFS RMS so the mix levels in
`src/core/constants.ts` (`AUDIO.LEVELS`) sit right without retuning.

The mix is an exterior perspective: engine and road forward, cabin sounds distant, and there
is deliberately no rain-on-the-roof layer.
