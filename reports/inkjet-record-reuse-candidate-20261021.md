# Inkjet record-reuse candidate

Runtime base is fixed PR1744 head 9c4ca8e60699ce786a96b351fdfc4c7ab3750fa1. This separate candidate changes only the admission helper's reusable participant array from actor references to the already-obtained quota records. It removes one WeakMap lookup per participant per frame, with unchanged membership, ordering, quotas, cursor, RNG, clocks, particles and gameplay.

Valid seed-boundary three-block run 39648530068, job 119390437377 succeeded as a diagnostic, NOT a budget gate. FX CPU A/B means ms: .1350/.1472, .09722/.13167, .10111/.11194; block deltas .01222/.03444/.01083 ms. B/A median 1.10714, range1.09053–1.35429. Render-submit A/B means1.55528/1.55, .8875/1.50222, .98806/1.18139; median ratio1.19567, range .99661–1.69264. Do not attribute the unstable render-submit difference to WeakMap or to physical GPU slowdown. No hardware GPU/whole-game acceptance. Artifact12369717002 SHA256 a4ee0d9584be5a978a2c215d48dad3b5efeeeae1ef49c9a04f5c3890c4da0075 retains all twelve raw captures. phase/seed and repeated burden gates passed. Log-retrievable blocks1/2 have every A-B puff/spark/draw/triangle delta zero; block0 large JSON line was interleaved with a later subprocess line, so its raw burden requires artifact readback.

Candidate exact Float32 pool/source-recipe tests21 passed under V8 with fs/URL/assert adapters, not Node/browser. Old/new helper comparison over30/60/120Hz ×1/2/4owners ×5seconds, varying cap/free slots, preserved every quota and admission. With actor plus round admission calls, WeakMapgets fall20% (for60Hz4owners6000→4800), not a claim of20% totalCPU savings. New regression asserts the precise lookup count and same record/participant-array reuse. Dead/stale/duplicate-owner, cap reduction, bounded density and fairness tests remain.

A/B/O same-scenario browser comparison and genuine Node/source/emitted regression are required before deciding whether this micro-optimization is materially useful. No merge or visual-completion claim.

## Executed three-block ABOOBA diagnostic

Run [39654017357](https://github.com/rhgrive3/actions/actions/runs/39654017357), job119409403656, exact diagnostic head358936a29a9bef8d95e6173386bb0afa99c220fb succeeded. Runtime optimization is f9e6b2d6d57a32888867da2ef4866565eb3493e9, overlaid on the unchanged verified9c4 build. Source Node tests26/26 and emitted helper equivalence14700 admissions passed. Three blocks,18 fresh browser observations, all phase/seed and repeated/exact B-O burden assertions passed.

Both previous valid3ABBA39648530068 and newABOOBA use60Hz,1actor,near,quality0.35,puffCap182,warmup2seconds/sample3seconds (180frames),camera[12,10,15],viewport960x720. Gameplay is frozen and projectile locations are stationary. The separately generated video is30Hz/4actors and is NOT this timing case. Seed and clock receipt fields are exactly equal across old/new runs. Prior log-retrievable blocks1/2 full frame arrays also equal the new A/B arrays; old block0 burden remains in its artifact because its large log line interleaved.

Per-block A/B/O CPU means in milliseconds:
- Block0 FX0.094722/0.086389/0.080833; render-submit1.199444/1.225278/1.153333.
- Block1 FX0.083333/0.088056/0.082500; render-submit1.221111/1.171111/1.105556.
- Block2 FX0.078611/0.089444/0.076944; render-submit1.340000/1.179444/1.139167.

O-B absolute differences: FX-0.005556/-0.005556/-0.012500ms; render-submit-0.071944/-0.065556/-0.040278ms.
O-A absolute differences: FX-0.013889/-0.000833/-0.001667ms; render-submit-0.046111/-0.115556/-0.200833ms.

Block-ratio medians and observed min/max:
- Optimized/current FX0.935691, range0.860248–0.936909.
- Optimized/current render-submit0.944023, range0.941283–0.965850.
- Optimized/baseline FX0.978799, range0.853372–0.990000.
- Optimized/baseline render-submit0.905369, range0.850124–0.961556.
- Current/baseline FX1.056667, range0.912023–1.137809.
- Current/baseline render-submit0.959054, range0.880182–1.021538.

Every observation: gameplay seed1967335286, accepted1134, evictions0, puffs137–166, sparks4,drawcalls24. All540 aligned A-B frame differences are zero; B-O frame arrays and repeated A/A,B/B,O/O arrays pass exact equality. Runtime shape/density/clock/RNG/fairness unchanged by record reuse.

Interpretation: this bounded pilot observes lower optimized CPU costs, especially a small FX reduction of0.0056–0.0125ms against current. It does NOT establish physical GPU improvement, whole-game frame budget, causal render-submit savings, visual fidelity, or all rates/actor counts. The differing current/baseline ratios across runs demonstrate substantial benchmark variability. No averaging away the earlier noisy result. No additional micro-tweaks or main merge authorized by these results.

Artifact [12374046821](https://github.com/rhgrive3/actions/actions/runs/39654017357/artifacts/12374046821),830809bytes,SHA2562189e2d7eaddd597ded605e7477bfe2feac9ca3c16bb52ce58f9c3069640ca6f. Artifact images remain unviewed and not delivered. Optimized emitted helperSHA2566060fc47c1c6673dedfa8ce654bf285370ebd69345db255cc524f7b6f1346c05. Production build contentHash3505a563c929bbe1627c087ab3a4df61d56830f9144e1e8f36ed4863ec5744a1 remains exact.
