# Area special motion/VFX review, 2026-10-23

## Result and limit
A bounded INKWAVE presentation-continuity candidate is ready for Tenta Missiles exhaust and Killer Wail 5.1 charge sparks. It removes render-refresh-dependent emission opportunity counts while keeping the existing 60 Hz probability, particle parameters, motion and gameplay unchanged. This is NOT a retail frame-matched animation improvement or visual acceptance.

Frozen source: 354536b365ae54bac71c9ce2970a5c5f322c1304. Original special-vfx.mjs SHA256: 69edbe6ea3cee441b072bf6ef799466bc540fb5029ae4df1cffdab883e5cb065. Original preserved with sparse hardlink followed by atomic copy-before-write. No shared ink/material primitives or character/hair models touched.

## Ownership and composition
Only special-vfx.mjs import list, ROUND_FX.tentaMissiles.frame and DIRECTORS.killerWail.frame changed. New independent helper: runtime/area-special-vfx-clock.mjs. New test: tests/area-special-vfx-clock.test.mjs.
Production scripts/inkwave-source-composition.mjs adaptBuildSource was executed against both candidate runtime files: both are byte-identical after composition. scripts/build-inkwave.mjs lines144–147 transform these modules with esbuild then compact ESM. Our minified-method test runs esbuild0.28.2 on full special-vfx source plus the helper with synthetic external dependencies. It does not exercise final compactEsm, site manifest, WebGL, or a browser. One new runtime import requires the parent's final build/startup-budget checks.

## Independent evidence
Full runtime module loaded in Node22 VM with isolated dependency stubs. A deterministic RNG below both admission probabilities counts emitted particles, thus exposing the actual emission opportunities in the production frame functions.

Missile exhaust, 1 second:
- Frozen source at30/60/144 Hz:30/60/144 opportunities.
- Candidate at30/60/120/144/240 Hz:60 at every rate.

Wail charge sparks, six speaker anchors over0.5 second:
- Frozen source at30/60/144 Hz:90/180/432 opportunities.
- Candidate at30/60/120/144/240 Hz:180 at every rate.

The existing probability0.8 for missiles and0.5 per Wail speaker is unchanged. Particle parameters and current source phase gates are unchanged. At most2 opportunities per render callback are admitted; backlog after stalls is discarded. Below30 Hz the cap intentionally reduces density rather than creating a burst. Wail's existing strict age<0.6 gate still quantizes the terminal charge boundary; the test intentionally stays inside that window and does not claim identical total emissions across the boundary. Carry is record-local, preserves fractions, and rejects nonfinite/nonpositive dt without corruption. Tests freeze actor/projectile objects to catch accidental authority writes.

Ink Storm KIT_FX.cloud.frame already accumulates dt for rain/drips. Splattercolor Screen WORLD_FX.screen.frame already accumulates dt for edge drips. Neither is changed: without actual visual frames, new growth, dissolve, rain-density or animation-curve calibration would be speculative.

## Retail-reference gap
Existing source cites Zephiel810, Splatoon3 – All Special Weapons (DLC Included): https://www.youtube.com/watch?v=PLxqXn_E898 . Web search confirmed creator, publication2024-03-06 and chapters Ink Storm00:34, Wail01:14, Screen01:54, Tenta02:53. Direct web open failed fetching the page. Search metadata is not inspected video frames. Game build, recording FPS, exact frame indices, camera/action alignment and frame-level timing remain UNKNOWN.

Official primary-source discovery: Nintendo's Choosing the right weapons article https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-choosing-the-right-weapons/ . Direct web open returned502. It supplies no accessible frame sequence in this task. Nintendo's2017 special demo result is Splatoon2, not a valid Splatoon3 timing reference, and was not substituted.

No readable local matching retail video or frame sequence was located in the bounded media lookup. The cited reference/special-vfx.md is absent in the available sparse frozen source. Existing ~2second storyboard sampling cannot resolve individual frames and was not treated as timing evidence. No browser was launched, no denied Library artifact retried, no copyrighted footage copied into the candidate.

Needed to close the original visual request: authorized matching retail capture with native FPS/timebase, game version, weapon/gear, continuous activation→attack→end windows for all four specials, plus current-head INKWAVE frames under aligned camera/action conditions. Required landmarks: Tenta raise/lock/salvo/exhaust/impact; Storm hold/release/cloud formation/rain/end; Wail speaker deployment/charge/pair activation/beam persistence/end; Screen throw/land/unfurl/travel/dissolve. Neither sequence currently exists here, so actual image comparison remains unperformed.

## Verification
10/10 tests pass:5 fixed-rate clock cases, invalid-dt/stall, record isolation, source runtime method parity, minified runtime+helper method parity, frozen-source negative control. See tests.tap.
Command (from candidate root):
AREA_VFX_BASELINE=/tmp/core-public-354536-0537/source/patches/splatoon3/runtime/special-vfx.mjs AREA_VFX_ESBUILD=/tmp/inkwave-build-tools/node_modules/esbuild/lib/main.js /workspace/shared/portable-rainmaker-peer-20261022/node22/node_modules/node/bin/node --experimental-vm-modules --test patches/splatoon3/tests/area-special-vfx-clock.test.mjs

No full build, browser, screenshot/frame comparison, publication, or gameplay acceptance performed. Parent owns integration and final acceptance. Apply area-special-vfx.patch and add the helper/test, not a wholesale replacement of the common special-vfx.mjs after other lane edits.
