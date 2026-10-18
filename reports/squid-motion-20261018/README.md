# Squid source-motion binding correction

Baseline: `da97926a21e0e7c6170d76864f896123d979f915`.

This bounded presentation patch repairs four reproduced integration defects. It does not change the squid model, material, movement physics, aim, collisions, source animation assets, clip clocks or clip selection.

- Production swim composition overwrote the source rig's zero shader wiggle with a second procedural deformation. Source-active squid now retains zero shader wiggle; fallback retains its existing motion.
- Existing S3-look geometry places long feelers at k0/k9, while source retarget weights still treated k4/k6 as long arms. Binding now follows the actual composed geometry.
- Source mesh replacement discarded the existing authored half-turn shared by body and eyes. The source skeleton root now retains the original body transform, keeping skeleton deformation and facial geometry in the same authored frame.
- Native LOD geometry already has placeholder skin attributes, so the previous attribute-presence check skipped source rebinding. A WeakSet now distinguishes genuinely source-bound geometry from native placeholders.

Per-rig scratch vectors/Euler replace the existing swim/climb temporary allocations. No extra render batches, materials, textures or vertices are introduced. Existing shared geometry caches/disposal ownership remain unchanged.

## Evidence and limits

The existing production source-motion bank is Wii U-derived; it is not an S3 keyframe dataset. No new extracted assets are introduced. Official S3 visual reference (Nintendo gameplay pages and `ikahito_pc.mp4`, collected by the companion shape review) supports mantle-first glide and compact transformation qualitatively, not guessed numerical oscillation tuning. These changes repair alignment and ownership rather than claiming a complete S3 animation match.

`patches/local-quality/tests/squid-source-presentation.test.mjs` loads actual fully composed Actor/Character and awaits the real source bank. It covers three LODs and 30/60/120 Hz, long/short skin chain ownership, source-only deformation, finite pose during turns/stops, emergence and preserved native fallback. Result: 2/2 tests, 2,625 driven Actor frames, 1,260 source deformation checks, no skips. Existing swim-motion, motion-five-regression and source-motion-assets suites: 16/16 pass, including native physics/gameplay clocks/pose channels and existing action-pose boundaries.

The fixture drives Actor presentation on an isolated own-ink floor; this is not full-match parity. Browser before/after capture with exact emitted artifact receipts is required before visual acceptance. Local Chromium execution is blocked by the environment, so native captures are delegated to the dedicated CI workflow. No browser result is claimed here.
