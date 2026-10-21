# Inkjet diagnostic result, 2026-10-21

## Exact scope
Candidate PR1744 remains 9c4ca8e60699ce786a96b351fdfc4c7ab3750fa1. Baseline is main c72dd6da46f53f3ea931e0263885685172bb12e9. This is an unaccepted continuous-VFX candidate, not completed retail Splatoon 3 fidelity work.

Dedicated diagnostic workflow https://github.com/rhgrive3/actions/actions/runs/39632580161 succeeded, using diagnostic head ec30aca1ee4b2ac2b72193f503364ceafe7d4383 and pinned scripts df639f80ec5aad069cc393758bdb9aceb1865fea.

The single full-source candidate rebuild exactly reproduced the prior tested emitted contentHash:
3505a563c929bbe1627c087ab3a4df61d56830f9144e1e8f36ed4863ec5744a1

The baseline overlay independently compiled only old special-vfx.mjs through the production pipeline. Candidate recompilation exactly matched its emitted bytes. Baseline emitted SHA256 is 0ef78d6a7a00b01aa883f0664554ceee1126264ad7f96ad36b7f532e8da5b0cd; candidate module SHA256 is 08f4a864308142507351be915dd3897e3593a6b2a3b6b2525f9a3675152d11ce.

## Browser result and performance limit
The current candidate's earlier workflow 39625383788 passed 25 new source tests, one new emitted integration test, all 18 fixed-rate/actor/distance browser cases and the existing Splashdown default cases and emitted suite.

The new one-case ABBA feasibility run (60 simulated Hz, one actor, near, two-second warm-up plus three-second sample) passed all four observations. Reported B/A ratios:
- FX-update CPU mean: 0.9966666666650128 (about -0.33%).
- CPU render submission mean: 1.087435035157259 (about +8.74%).

These are one-block pilot results, not an uncertainty bound. No claim that the few-percent performance budget passes is justified. Renderer is SwiftShader; GPU timing, allocation rate and whole-game frame performance are not measured. Raw observations and frame data are preserved in paired-result.json and case result.json files in the artifact. Artifact contents have not yet been independently opened because the normal retrieval path is blocked; the ratios above are from the successful job's official logs.

## Video generated, not yet visually accepted
Artifact https://github.com/rhgrive3/actions/actions/runs/39632580161/artifacts/12361224426
- Artifact ID 12361224426, 8,781,482 bytes.
- ZIP SHA256 87ba392a656b88b407c8745c9f2e3ac7873c9286b8018c98c96dc5819dbce96b.
- Relative file: inkjet-video/inkjet-before-after-candidate.mp4.
- MP4 SHA256 0450fe103a622e634c73231926c4bd0a618536e552543fc24b1e9220d0d68aaa.
- 1920 x 810, 30 fps, exactly 2.000000 seconds and 60 decoded frames.
- Every frame came from a new rendered simulation step; zero interpolation. ffprobe frame count and decoded framemd5 checks passed.
- Old-main and candidate sides share four actors, fixed camera [12,10,15], each viewport 960 x 720, deterministic initial seeds and simulation interval 1 to 3 seconds.
- Labels explicitly state candidate is NOT ACCEPTED, continuous VFX only, frozen gameplay and not Switch footage.

The video is generated but has not been independently watched or delivered as a native attachment. It must not be presented as a completed-fix, actual-play or retail-reference comparison.

## Independent clock / seed audit
Pure V8 evaluation of the actual old and candidate recipe methods with their actual presentation PRNG, two-second warm-up and three-second sample, reproduced A1=A2 and B1=B2 in A-B-B-A at 30/60/120 Hz for all counts, random-call counts and lifetime sets.
Glow births A/B were 180/180 at 30 Hz, 360/360 at 60 Hz, 720/360 at 120 Hz. Candidate 120 Hz exactly reproduced its 60 Hz recipe counts and 9031 total PRNG calls in the five-second run. Maximum accumulated five-second clock error was 3.82e-14.
This uses an unsaturated one-actor recipe harness; it is not a renderer or performance measurement. Gameplay phase stays deliberately frozen in both variants. The movie runner explicitly cross-checks seed/camera/clock receipts. The pilot runner fixes identical CLI inputs and preserves these fields but lacks the equivalent cross-assert, so independent raw-receipt cross-check remains required.

## Remaining acceptance
Retail continuous-frame comparison, visual inspection, native video delivery, multi-case repeated performance evidence and hardware/full-engine measurements remain open. Full Validate CI also has separate shared Roller C1 and combat-contact failures; specialty Inkjet passes do not replace exact-head full-CI acceptance. No merge.


## Seed-confounded follow-up, not a valid performance estimate
Run 39638250556 (job 119354647474, diagnostic head 031410d763cefb0929fb552d2cebb9ff07c9e93d) reproduced emitted contentHash 3505a563c929bbe1627c087ab3a4df61d56830f9144e1e8f36ed4863ec5744a1 and the verified old-main overlay. Its first four A-B-B-A captures completed, but the first block's cross-validation failed: phaseBefore gameplaySeed 502290086 versus 2767366790. Other displayed phase fields were active/inkjet and gameplayTime 0. Valid completed blocks: zero; remaining two blocks did not run. Artifact 12368047166, 185409 bytes, SHA256 91f2edc461578bf0a80656a46d05fdedc10efa7d82d1748c36b529925149c7cb, retains the failed receipts. They are not erased or promoted to valid observations.

The earlier one-block render-submit +8.74% and FX CPU -0.33% are uncontrolled diagnostics, not accepted regression estimates. Same declared page-initial RNG seed did not guarantee equal activation seeds after asynchronous imports, renderer and Actor/source-motion setup consumed randomness. The normal all-specials makeState takes its activation seed from Math.random.

The QA-only correction finishes all Actor/source-motion setup before a synchronous activation loop, resets the existing QA LCG to 0x12345678 immediately before that loop, and records startup RNG consumption separately from activation before/after state. The paired gate retains phase/seed comparisons and adds exact rngBoundary comparison. It prints explicitly unaccepted raw timing/phase observations before validation, so failures remain diagnosable without promoting them. Production source, private VFX RNG and runtime head 9c4ca8e60699ce786a96b351fdfc4c7ab3750fa1 remain unchanged. Independent source review found no new blocker. Exact QA initializer V8 test with 37 versus 115 setup draws produced equal four activation seed draws after reset; omitting reset produced different values. This is not a native browser result.

Remaining boundary: reset does not retroactively normalize randomized setup objects; phase/seed and repeated per-frame burden checks remain necessary. A valid three-block result and hardware/whole-game budget acceptance are still pending.
