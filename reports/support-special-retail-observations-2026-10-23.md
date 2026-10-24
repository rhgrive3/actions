# Support special reference observations, 2026-10-23

This supplements (and supersedes the missing-reference portion of) support-special-frame-cadence-2026-10-23.md. The earlier code candidate is unchanged. Actual public GameWith video frames have now been inspected. There is still no matching rendered candidate capture and therefore no two-sided visual parity claim.

## Provenance and recording limits

Source index: https://gamewith.jp/splatoon3/362075. These are third-party gameplay demonstrations, NOT Nintendo primary recordings. All three encode 1280x720 at constant 30/1 frames per second. Version, capture date, native simulation FPS, gear and input timestamps are unverified. Frame indices below are zero-based decoded recording indices, with time = index/30, NOT game-frame counts. A 30fps recording cannot resolve every 60Hz simulation frame.

- Big Bubbler: https://img.gamewith.jp/common_movies/14e410ae7c0400d746ebb8b748da6e16.mp4. 144 frames, 4.8s. SHA256 7a7f0cf3a5f312903473c63a0d3c9fbf72d5609cca8525d79ccbb9896c2c2e43.
- Wave Breaker: https://img.gamewith.jp/common_movies/aa6c819a6fa60a7cb4dd2c9a6b94d40f.mp4. 327 frames, 10.9s. SHA256 3b0fcb8430adc878ac2d0b2d4dd6191af3acf2ab715e00e1e2a3fc1daa118891.
- Tacticooler: https://img.gamewith.jp/common_movies/982a3a258ed10d8292abcc98e930f47d.mp4. 243 frames, 8.1s. SHA256 cacb23cd364e1c566e7db87a1076d285c00262b2d9aa2aed6941dea2435577da.

Decoded full-frame hashes show zero adjacent exactly identical frames in each clip. This does not exclude interpolation, near-duplicates or capture conversion. A scene-score >0.3 scan found no cut candidates; visual overview inspection likewise found no obvious hard cut. This is not proof that the clips are unedited. Camera movement, projectile/target effects and activation flashes must not be mistaken for edits or special-only effects.

## Big Bubbler: observed frames versus source

Inspected every recording frame 0–57 plus a full-clip 2Hz overview. Camera starts behind the player in a training area with an orange target ahead, then moves. No candidate camera alignment is available.

- f13 (0.433s): turquoise ground splash visible at deployment.
- f24–27 (0.800–0.900s): emitter/propeller assembly rises above the player and exits the upper view.
- f34–37 (1.133–1.233s): planted launcher is visible; the tall turquoise beam and surrounding field latitude lines are not yet visible.
- f38 (1.267s): tall turquoise beam and thin field latitude lines appear together; they persist through the subsequent inspected sequence.
- f48–57 (1.600–1.900s): orange incoming-target explosion overlays the field. This is not evidence that the turquoise shield changes into an orange blast, nor a clean shield-destruction sequence.

Source comparison: kit-big-bubbler.mjs already separates emitter ascent, radius and ignited state. special-motion.mjs creates a mostly-clear hemisphere with latitude lines, consistent at a feature level with the visible reference. However KIT_FX.bubbler.start immediately creates fully visible tall pillar/halo VFX, and its follow callbacks do not check d.ignited. This fails to preserve the observed staged base/ascent-before-beam presentation. The separate Bubbler ignition incremental candidate gates both initial and followed retained-beam alphas on that existing ignition state, without inventing a new timing or changing gameplay. Beam length, exact onset correspondence and canopy size remain uncalibrated without candidate frames and matched perspective.

## Wave Breaker: observed frames versus source

Inspected every recording frame 80–113 and full-clip 2Hz overview. The character throws toward a device near a crate/ramp; camera then mostly settles. Landing itself is outside the dense window, so no activation-to-pulse duration is asserted.

- f80–83 (2.667–2.767s): device near the crate is armed before a bright pulse event.
- f84–88 (2.800–2.933s): compact bright yellow/white flash expands at the device and becomes orange.
- f92–103 (3.067–3.433s): device remains visible, with a thin orange ground-projected ring growing outward.
- f104–113 (3.467–3.767s): ring expands past the nearby target; the target shows 45.0. Fine wire/marker lines and the ring, rather than an opaque filled cylinder, carry the effect.

Source comparison: OBJECT_FX.wave reads pulse transitions to emit a flash and stars; waveFront reads object.age/maxWaveFrame for expansion and uses retained bands plus a floor ring. This is structurally compatible with a flash followed by an expanding ring. The calibrated 1.6-world-unit band height, shader opacity and target-disc rotation cannot be validated quantitatively from this camera without candidate footage. The earlier rotation-cadence correction remains an independent source bug fix, not a retail angular-speed measurement. Do not change gameplay pulse spacing from these clip offsets.

## Tacticooler: observed frames versus source

Inspected every recording frame 105–162 and full-clip 2Hz overview. Character faces downhill in a training room. The camera follows the player, so apparent device scale combines actual unfolding and perspective changes.

- f105–114 (3.500–3.800s): compact circular device is held above/in front of the player.
- f115–129 (3.833–4.300s): compact device travels away/downward.
- f134–147 (4.467–4.900s): narrow upright cooler is visible ahead.
- f148–150 (4.933–5.000s): sides/can presentation widens and brightens; white cold mist appears around the lower stand.
- f151–162 (5.033–5.400s): open stand remains with continuing white mist. The clip does not show a full expiry sequence.

Source comparison: kit-support.throwCooler creates the deployed model at scale .35; landing disposes that model and immediately deploys a full-scale model. createTacticooler has static body and four can children; stepSupport only updates taken-can visibility and platform position. There is no explicit landed-to-open animation state in these paths. KIT_FX.cooler.start fires an ink blast immediately on stand creation and its frame callback emits cold mist, so the staged narrow-to-open visual seen here is not represented in the source. A future presentation-only unfolding phase should be attached to the stand record, preserving collision/eligibility timing and not guessed from these 30fps frames alone. The existing mist-cadence fix remains useful but does not solve unfolding.

## Remaining acceptance work

Keep current source cadence candidate provisional. Prioritize the evidenced Bubbler ignition visibility discrepancy before richer geometry work. Do not change shared materials, characters or gameplay constants. Candidate GPU frames, camera/action alignment and original-versus-candidate pairs are still blocked by the existing browser/artifact constraints. No denied route was retried. Reference media and analysis sheets remain local review inputs and must not be bundled into the game/PR.

## Separate ignition candidate verification

The incremental patch is against the initial support cadence candidate, not directly against the frozen parent. Only KIT_FX.bubbler.start and regression tests change. Pillar and halo remain allocated once, initially invisible before ignition; existing ignited replays appear immediately, active records follow position, and the existing end flag retires both callbacks. Base hardware, canopy radius, colors, beam dimensions, pulsing intensity after ignition and all gameplay fields remain unchanged. Eight source-method and eight bounded minified-transform tests pass. Running the same eight tests against the initial cadence candidate fails the pre-ignition visibility test (seven pass), demonstrating the new regression catches the original discrepancy. These remain synthetic-renderer method tests, not candidate image acceptance.
