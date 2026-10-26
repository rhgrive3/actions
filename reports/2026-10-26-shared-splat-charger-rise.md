# INKWAVE: One Splat Charger rise for every Charger (pitch preserved)

## Scope and user intent

Use **only** the user-provided Splat Charger ascending phrase from
`inkwave-public/assets/audio/charger-first-splatune2-reference.mp3`
(`startSeconds: 0.4591`, `playSeconds: 1.215`) as the **charge-up rise** of
every Charger-family weapon, including R-PEN/5H and alternate kits.

Earlier experiments stretched each weapon's short `Wp_Charger_HoldNoise*.mp3`
attack. **Those are not the requested source** and are no longer used as the
charge-up rise. The original HoldNoise is retained only for the separate
stored-charge re-emergence click, not the start of a fresh charge.

## Timing

Reference Splat Charger full-charge clock: 60 frames at 60 Hz (1.0 seconds).
The selected reference phrase is stretched by
`targetChargeTime / 1.0s`, quantized to 60 Hz. Playback of both original and
preprocessed `AudioBufferSourceNode` buffers stays at `playbackRate = 1`.
The phrase's selected *duration* is therefore
`1.215s * targetChargeTime / 1.0s`. The native game owner, **not** the phrase,
determines the full-charge ready cue and shot timing.

Examples from the pinned S3 11.3.0 gameplay catalog:

| Base model | Full charge frames | Full charge time | Resulting Splat phrase duration |
| --- | ---: | ---: | ---: |
| Charger Quick (Squiffer) | 45 | 0.750s | ~0.911s |
| Charger Normal (Splat) | 60* | 1.000s | 1.215s unchanged |
| Charger Long (E-liter) | 92 | 1.533s | ~1.863s |
| Charger Light (Bamboo) | 20 | 0.333s | ~0.405s |
| Charger Keeper (Goo Tuber) | 71 | 1.183s | ~1.438s |
| Charger Pencil (R-PEN) | 72 | 1.200s | ~1.458s |

*Normal uses the source adapter's default 60-frame charge fallback and the
native `charger.chargeTime=1.0`. Charge modifiers from low ink / airborne
conditions may change the game's actual completion time beyond this nominal
clock. There is no claim that Splatune 2 source audio is retail S3 audio.

## Implementation

- `charger-charge-rise.mjs` retains the verified MP3 and unchanged 1x Splat
  path; it slices the *same source phrase* once per AudioContext for WSOLA.
- `pitch-preserving-charge.mjs`: constrained time-domain WSOLA, shared
  cross-channel offset matching, 60 Hz quantization, three-MiB decoded PCM LRU.
- `pitch-preserving-charge-worker.mjs`: all search/overlap work happens
  asynchronously off-thread. No sample-time processing occurs on a game tick.
- Local native/catalog and network replica charge edges use the shared phrase
  once; release, death, range exit and weapon swap stop the active handle.
- READY, FIRE, stored-charge re-emergence click and gameplay/paint/network
  timings are deliberately unchanged.
- Worker module is included in offline asset graph; no new eager startup fetch.
- Worker failure or cold cache uses the unchanged **Splat Charger** recording
  at 1x. A missing source stays silent rather than playing an unrelated weapon
  recording. This does not block gameplay.

## Verification and integration

Branch created **from main `e0072a749df0ec8c2d368e383bdf337baa7b44ad`**
after PR #1878 was merged. No PR was created and `main` was not modified.

- `node --test patches/splatoon3/tests/pitch-preserving-charge.test.mjs`
  exercises WSOLA duration, 440Hz pitch preservation for 20-, 45-, and 92-frame
  ratios, coherent stereo, input validation, LRU and cancellation. Seven local
  standalone cases passed.
- `node --test patches/splatoon3/tests/shared-splat-rise.test.mjs`
  contains end-to-end simulated decoded-buffer, worker, voice routing and
  source-integrity coverage; this and the full repository suite require a
  checkout and remain unexecuted in the current tool environment.
- `reported-audio-fidelity.test.mjs`, `catalog-charger-remote-audio.test.mjs`
  and `weapon-audio.test.mjs` now assert the new shared-source behavior.

Remaining acceptance checks: real MP3 listening for WSOLA artifacts, matching
S3 actual charge perceptual timings, first-cold-load iPad test, offline
navigation, and full project test/build suite. Do not claim those passed.
