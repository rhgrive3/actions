# Source motion: eliminate unused FK evaluations

Base: `fbdcacb690ec5c9abd10e14d6b623a6f4206aab0` (public INKWAVE).

The build-only `motion-fk-hotpath-adapter.mjs` removes two intermediate full-skeleton evaluations whose world transforms have no readers before the mandatory pre-balance evaluation. The final evaluation remains whenever a state crossfade changes local transforms. Foot/hair trajectory sampling, the rest-gait world pose, body-balance input and all retarget consumers retain their existing evaluations. Segment-scale compensation uses the same nine multiplications in the same order without creating three index arrays per compensated bone. No cache, resampling, frame skipping or new runtime dependency is introduced. `inkwave-public/` stays unchanged.

## Evidence

| Check | Result |
| --- | --- |
| Real loaded Character, Player00/Player01, 30/60/120 Hz, zero/100 ms/144 Hz ticks | 1,164 before/after frames exactly match: local TRS, source/body world matrices, skeleton matrices, gait targets, contacts, debug state and muzzle |
| Loaded source packs | All 548 human/squid clips match at three frames each, including clamped and fractional frames; zero, tiny and negative parent scales also match |
| Controller scenarios | 31 clips; idle, weak input, run, forward/back/side movement, firing, pivots, jumping/landing, weapon changes, native roller ownership, form transitions and manual seeking |
| Warm steady forward walk, 3 m/s, 600 updates | 4,200 → 3,000 complete FK evaluations (−28.57%) |
| Same controller, Node v24.19.0, 1,200 updates/window, six windows per version, alternating ABBA | Median 683.452 → 565.950 ms (−17.19%); excludes loading, warmup, rendering and whole-game FPS |
| Minified production modules in Chromium 153 / ANGLE SwiftShader | 180 source/skeleton/contact/muzzle frames exactly match; all pixels in six rendered image pairs exactly match; 301 candidate files verified against the build manifest; no page/network errors |
| Browser sample FK calls, including profile generation | 2,345 → 2,086 |

Candidate production build content hash: `74d0c4fb87e396c1c66ba23ef974f19fe47228283de8995ac28f47af0fec4955`.

CPU windows (ms, baseline): 677.847, 693.707, 715.889, 649.851, 659.970, 689.056.
CPU windows (ms, candidate): 580.466, 596.946, 568.687, 563.213, 561.482, 559.134.
The median is the average of the middle two sorted observations. Timing is diagnostic evidence, not a test threshold or a device-FPS claim.

Regression command:

```sh
node --experimental-vm-modules --test patches/local-quality/tests/motion-fk-hotpath.test.mjs
```

Related source checks: retarget branch updates, offscreen/offline visual budgets, source pack integrity, source posture, controller ownership and build packaging. The five source-mode packaging checks that require an emitted site are run separately against the minified output.

An A* heuristic-cache prototype was rejected: fewer distance calculations did not produce a repeatable speed improvement. Pending normal-map readback, lobby-DOM and model-density PRs are outside this change.

## Splatoon 3 comparison boundary

This changes when INKWAVE computes an existing pose, with no change to movement, acceleration, stopping, turning, firing speed, ink rules, contact trajectories, animation coefficients or retarget gains. The imported coefficients are Wii U source data; they are not evidence of Splatoon 3 executable parity. No console version, weapon/gear calibration or real-device measurement is newly asserted. The existing unverified comparisons in `inkwave-splatoon3-behavior-2026-10-02.md` remain unverified. Browser and isolated CPU checks above are explicitly separate from console/device testing.
