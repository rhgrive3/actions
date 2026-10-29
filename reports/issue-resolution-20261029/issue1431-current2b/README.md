# #1431 original acceptance adjudication and current software images

**Verdict:** the original software requirements are implemented and the current immutable build passes the affected software image checks. No additional runtime defect was reproduced. Closure remains conditional on current required CI; no issue/comment state was changed. This commit contains evidence only.

## Governing request and correction

The [live issue body](https://github.com/rhgrive3/actions/issues/1431), retrieved for this review, specifies:

1. 「実 Actor 発射の first/steady両相、30/60/120 Hz、上下照準と壁前 OBB を比較し、world muzzle/velocity/FX/render born を記録。」
2. 「native aimReady/full-aim/LOS fallback に対する影響を検証し、照準収束・壁際の命中判定を回帰させない。」
3. 「ダメージ、弾速、インク、射撃間隔、ネットワーク所有権/再現を崩さない。」
4. 「現行mainと #1277 の完成した外形変更の両方で評価する。」

The governing [human diagnosis](https://github.com/rhgrive3/actions/issues/1431#issuecomment-6271816092) states: “Remaining work is to assess a display-only pose-order connection while preserving physical birth and intentionally detached trails, then validate any candidate in native images.” Thus the physical projectile must retain its emission-time authority; a demand to move it to a later rendered pose would add a different requirement. Explosher's separate authored-lip physical-origin correction is already present and tested. No criterion explicitly requires an authentic Nintendo Quad aperture or device certification. The user's hardware waiver remains applicable.

Root explicitly confirmed that [comment6489904468](https://github.com/rhgrive3/actions/issues/1431#issuecomment-6489904468) was **its own AI-authored status summary in this session**, not a new human requirement. It repeated a historical limitation as if current. The older `issue-1431-acceptance.md` and `weapon-only-final-acceptance.json` correctly describe their named931e4c/public8783eb8 runtime, where the first predicted right shot lacked an offset. Current code subsequently recognizes that exact native full-aim interpolation; the current test explicitly checks its display connection while preserving physical prediction. The old files are retained untouched. The later #1794 aiming fix alone did not close this issue; the additional origin/display fixes and current evidence below address the remaining criteria.

## Acceptance mapping

| Original criterion | Current evidence | Scope and conclusion |
| --- | --- | --- |
| Actual first/steady,30/60/120,up/down and OBB | Current36case browser matrix: both actual catalogue weapons, pitches−45/0/+40, open/wall on published Tidewater;72first/steady PNGs plus3first-prediction images;288births/4320fixed ticks/147real WebGL draws. Each raw birth records physical origin, world sockets, velocity, FX and posed render connection. | Actual source-loaded Actor, Character, Runner, Projectiles, source-motion bank, Physics, FX and native-volume submissions. No synthetic weapon/model overlay. |
| Native aimReady/full-aim/fallback; no aim/wall regression | At all3rates, the actual first right prediction has preAimReady0.88919684, physical/socket difference0.02915485WU, **displayed endpoint error0**. Its actual one-tick native head/back/rod submission is visible; the physical birth in that submission exactly matches the corresponding recorded birth. Existing source/emitted OBB, gameplay-origin and full-cover-segment controls remain. | Preserving native physical prediction is consistent with the human diagnosis. A legitimate obstructed or immediately retired round is not forced into a connection. |
| Damage/speed/ink/cadence/network retained | Existing source9case affected group and required212case emitted gate include the hit-pose and full-segment controls. The hit-pose matrix compares physical birth/start/previous/velocity/damage/RNG/ink/serializer and authoritative paint with only the optional display connector disabled. Existing authored Explosher A/B retains camera velocity,damage,ink,shot ticks and metadata while intentionally correcting the earlier physical lip origin. | CPU/emitted logic and serializer evidence is distinct from these new images. Warm two-browser Shooter ceiling QA is transport/HP evidence; it does not prove these weapons' aperture or image alignment. |
| Main and completed #1277 geometry | Existing `model-1277-lineage.json` compares actual standard-variant geometry,muzzle,grip,channels,bounds and counts against merged#1277; geometry contracts agree. Current2b Quad/Explosher builder files have **no byte diff** from the historical public equivalent8783eb8 used by the retained accepted geometry/lip evidence. | Quad's optional later rear-shell argument changes the function text, but not the compared standard variant. The existing Explosher authored-lip correction is explicit. This does not certify a retail aperture. |

## Immutable build and software images

Source **2b01cd7efbca260a611165b1e3887ff48062ccd5**; clean `/workspace/wt-agent6` before/after. `verifyRuntimeBuild` checked all1530 source inputs against that immutable Git tree and all2241 emitted artifact hashes before and after the run. Content hash `381c3c5777dbe72752b778aa2df9a211f59b22021e81d4f0e5910ed16185314f`; input hash `d9778b1754ebdade71298935f2707e3ad8b8d47c0c3d9336e9ef275d6901036e`. Full manifest, source-binding receipt, primary discussion snapshot, exact commands and all raw JSON/log hashes are retained. The shipped browser harness was not edited.

Both invocations exited0:12horizontal cases with the additional first-prediction draw, then24up/down cases with ordinary first/steady draws. There were no page errors, failed requests or accepted-draw GL errors.120actual native back/rod connections were checked; maximum checked back and rod errors were below1e−6WU. The native head remains at the physical projectile. No every-frame GPU cadence or FPS claim is made.

Representative images actually inspected:

- [Quad first native birth](quad-first.png): the source-loaded held weapon, flash and native rod are present.
- [Quad first predicted right-hand birth](quad-first-right-prediction.png): native flash and volume connection are visible at the predicted birth's first fixed tick; the raw instance matrices bind it to the correct birth, rather than merely matching the deterministic shared seed.
- [Explosher first birth](explosher-first.png): the authored burner/flash and advancing native sphere are visible.

The Quad steady, down45wall first, and Explosher up40steady images were also inspected locally. `images-index.json` contains all75original PNG paths/hashes. The complete image archive remains local at `/workspace/scratch/issue1431-current2b-all-images.tar.gz`; it is deliberately not duplicated into Git. Its hash is recorded in `summary.json`.

The initial all-angle `--capture-prediction` attempt is retained as a **non-pass**. At down45, the actual round retires on real floor before that extra first-tick volume-visibility request, leaving no native submission to inspect. Its birth/FX endpoint error was0. The unchanged harness was then invoked with that additional visibility request only for horizontal prediction; ordinary first/steady checks still covered all36conditions. No assertion or source was removed to accept the attempt.

## Limits and disposition

These are software Chromium/SwiftShader diagnostic images with the real application owners, a published collision/layout stage, controlled plain material/lighting and paint sinks. They do not claim a complete native Game match, Nintendo stage/material/animation fidelity, physical-device equivalence, or performance. Draws are sparse diagnostic captures over the actual fixed simulation; the run does not prove every rendered frame. No artificial hit reactions were added to this image run; the separate212case emitted gate covers the repeated native hit-pose matrix. The75images are new current-build evidence, not relabeled historical pictures.

The authentic retail aperture remains an honest provenance limit, not an extra completion barrier. The first-right *display* omission described by the older report is implemented and now has current native software images; the native physical prediction remains intentionally authoritative. Root may transparently correct its own stale status comment using [correction-draft.md](correction-draft.md), then close only after current required CI succeeds. MOV08b and isolated Character QA holds remain; this issue-specific probe releases neither. No main merge;#401excluded.
