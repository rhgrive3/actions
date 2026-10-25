# INKWAVE: verified low-risk optimizations

Baseline: integration PR #1878 head `dd90aa241aabd5f0b972cc3471386ba3d4da86dc`.
The optimization portion changes CI checkout, build-only PNG processing, a local
scratch object used when preparing prop bounds, and empty projectile-defense
queries. These optimizations preserve gameplay, draw/culling decisions, shader
deformation, pixels and the existing comparison limits against Splatoon 3.
The later catalogue behavior corrections are described separately below.
No motion, character shape, frequency or quality setting is changed.

## Adopted changes

| Area | Change | Verified result |
|---|---|---|
| Object presentation QA | Exclude the offline modeler from checkout; fetch immutable baseline trees without unrelated blobs | 496 unused tracked files, totaling 203,526,761 uncompressed source bytes, need not be materialized. Sparse/full production manifests match exactly. Actual network/time savings are not measured. |
| Lossless lightmaps | Reuse two filter rows, stop candidates whose nonnegative score cannot win, specialize PNG None/Up decoding | All 5 shipped plus 120 synthetic PNG outputs are byte-identical to baseline. Scratch allocations 40,960 → 10. Nine alternating local samples: median 1526.68 → 1338.04 ms, about 12.36% shorter for the 5-image workload. |
| Prop instance bounds | Copy local bounds into one function-local transform box rather than cloning every record | Halyard envelope preparation removes 47 Box3 and 94 Vector3 temporary allocations. Long-run elapsed time is effectively equal. Exact spheres and 40 Chromium frames match. |
| Empty fist defenses | Return the preceding defense candidate when no Triple Splashdown fists exist | 120 real Shooter simulation ticks retain every recorded projectile state/order and all 80 RNG calls. The 436 defense queries remove exactly 436 clones (488 → 52 total in this scenario). Nine local query samples have medians 219.95 → 133.95 ms; this is a query workload, not a game-FPS result. |

The CI change retains every production, test and evidence input, immutable SHA,
verification command and threshold. An actual partial-clone fixture confirms
that unrelated baseline blobs remain absent while required `git show` bytes
match the ordinary fetch. Baseline blob reads can perform delayed network
fetches; they remain verified by the same immutable Git objects.

PNG decoding and scoring keep all PNG validation and the smaller-output rule.
The mixed-filter test independently evaluates every complete predictor and
compares the filtered stream, including ties and first-row Up. Fresh Node
process comparisons also confirm that the decoder paths do not merely benefit
a warmed JIT. See [lightmap measurements](lossless-lightmap-20261025/README.md).

The prop scratch remains local to a call. Three's copy/union methods copy
coordinates and do not retain the scratch. Existing geometry, margins,
animation, record order, RNG and the malformed-cloth fallback stay intact.
See [prop measurements](prop-envelope-scratch-20261025/README.md).

## Optimization-only local verification, before incorporating #1879

- Focused PNG, materialization and real prop-bound tests: 20 pass, 0 fail/skip.
- Exact emitted packaging and direct-source ownership: 24 pass, 0 fail/skip.
- Dedicated old/new PropKit Chromium comparison: 40 frames, every RGBA byte,
  draw count and triangle count equal, including offscreen culling.
- Production build and startup budget pass. All 1,475 canonical inputs bind to
  the committed Git blobs; all 2,170 artifact entries are verified. Combined
  contentHash: `426d7c4e11a0595523e283cd5bd07cc23026579190d29e113e4b356f57d895fc`.
- The only changed canonical production inputs are
  `upstream/src/world/render-bounds.js` and
  `build-script/lib/inkwave-lossless-lightmap.mjs`. The latter changes no
  emitted artifact bytes. CI checkout configuration is not a production input.
- The CI-only candidate separately passed 85 contract/object-QA tests. Its
  full and sparse checkouts generated identical complete manifests.

These scopes overlap and are not added into a global test count. Hosted checks
must validate the eventual published head; local evidence is not substituted
for that acceptance.

The optional pre-existing static-scenery counterfactual browser test fails at
the same view/byte/value on baseline and candidate before its prop section.
It is unchanged and is not counted as passing. The dedicated prop test avoids
that unrelated counterfactual and compares the exact old/new prop functions.

## Rejected candidate

Sharing guided-audio FFT amplitudes preserved 696 old PCM byte comparisons and
reduced square-root calls, but isolated timing measured 345.39 → 375.08 ms.
That implementation, its generated Worker and its audio fixtures are excluded
from this follow-up. An operation-count reduction alone was not accepted as a
speed improvement.

Source and fixture equivalence were independently reviewed. No device FPS,
retail-audio equivalence, or native asset qualification is inferred from these
local measurements. Existing deferred changes in the #1878 adoption record
remain deferred; source branches are preserved when their superseded PRs close.

## Later #1879 incorporation and review correction

During this work, #1879 arrived with the additional catalogue Mist/Blaster/Brush
fixes at `7ee2625d2f3bcf5bd6270572167b94047de2f7a4`. Its original commits
are retained as ancestors of this follow-up rather than replacing its branch.
The PR now targets main. #1878 was merged at
`f6d9fb06f86a5affb963d1ee5ae199e907f30961` only after its exact head completed
37 successful workflows, one conditional skip and zero pending/failed runs.
The old #1867–#1877 PRs are resolved with their source branches preserved.

Independent review of #1879 found a real collision-phase gap: pushing Inkbrush
into a wall clips horizontal velocity to zero before resource sampling, which
incorrectly re-enabled enemy-floor damage despite continued roll input.
The correction admits zero velocity only with a current wall contact, finite
horizontal normal and input directed into that wall. Neutral, away/tangent,
airborne, empty-tank, sub/swing and other-Brush cases retain their exclusions.
Mist still slows the actor, and weapon damage remains effective.

The new regression restores the real Actor integration and Level/Physics wall
at 30/60/120 Hz. Restoring only the old helper makes that regression fail.
The corrected #1879 test group passes 28 source and 28 freshly emitted cases;
the contributor's related six-file group passes 77 cases. Independent review
also reran the four Inkbrush tests successfully. These overlapping groups are
not a global count, and the earlier 72-condition browser receipt remains tied
to its original inputs rather than relabeled as a new-head result.

The reconciled production build has 1,477 canonical inputs, 2,174 artifacts,
contentHash `4a44e52dae4bfaf0af02f05df711f9a3127ebfec8a9d38dd596ea61f4ee8d911`
and inputHash `70f6ad9b542befb461a936d3d4241c22ebe4888c6d64b1d7a20dca56aeb799e2`.
Its emitted packaging/ownership and startup-budget checks must pass before
publication; hosted acceptance is recorded on the eventual PR's exact head.

## Final empty-defense hot path

The last candidate adds one empty-array return after the existing native
defense-owner query and invalid/ghost guards. Active fists retain the same
calculations, tie-breaking and callbacks. The existing live list controls
activation, retirement and clearing; no cache or retained flag is introduced.
Independent review found no correctness issue. Source tests include the full
existing six-file kit/fist group plus new empty/native-priority/active/retirement
and actual-projectile regressions. See the fixed-parent comparison and raw
measurements in [the defense report](empty-fist-defense-20261026/README.md).

This updates the final production contentHash to
`83772a6fa910e158b9f1b139d6c187a840b73ec24cd7be043a7bf556530ed898`
and inputHash to
`e914736b30b38f77d6cd1e8986289d7b16791de7432c0dca23976944e82058b9`,
still with 1,477 canonical inputs and 2,174 artifacts. The earlier `7e4c2e00b`
PR run is intermediate evidence; final hosted acceptance belongs to the updated
published head. The earlier fresh 72-condition Brush Chromium receipt is bound
to contentHash `4a44e52d…`, and is not relabeled as a fresh test of this build.

The final physical source files pass the full six-file legacy kit/fist group
plus the new three cases: 46/46, zero failures or skips. The combined new
behavior/empty-defense group passes 31/31 in source and 31/31 in the fresh
minified build. Exact packaging/ownership passes 24/24, and the startup budget
passes. The canonical-input and artifact counts/hashes above belong to that
verified build. These scopes overlap and remain separate evidence.

## External upstream acquisition failure

After #1878 merged, the push-only [upstream acquisition run
40224728505](https://github.com/rhgrive3/actions/actions/runs/40224728505)
failed on `https://inkwave-six.vercel.app/` with HTTP 402. Its saved manifest
records `HTTP Error 402: Payment Required`; a separate read at 19:33 UTC also
returned `DEPLOYMENT_DISABLED`. This is the external upstream deployment's
availability, not a production test result. The acquisition retains failure
status and its diagnostic artifacts; committed game source remains intact.
Production builds use the committed source and pass without that acquisition.
No acquisition guard or status is weakened to conceal the external failure.

## Main-push idle verifier transport correction

PR #1880's exact head completed all 13 applicable workflows successfully before
merging as `8fe088bd7`. Pages deployment and its deployed-ranked verification
also passed. The subsequent main-push active browser job
[121283295430](https://github.com/rhgrive3/actions/actions/runs/40231206631/job/121283295430)
correctly failed on a cold-boot `route.fetch: read ECONNRESET` for the local
versioned `src/fx/fxHooks.js`, plus the corresponding browser console error.
The PR and main receipts use identical contentHash `83772a6f…`, Chromium
151.0.7922.34 and ANGLE SwiftShader. Both completed all 240 native frames,
15 GPU completion checkpoints per state and every cold-allocation condition.
The reset's lower-level socket cause is unconfirmed; this was a real boot
request failure, not evidence of a GPU failure or teardown cancellation.

The idle verifier now follows the existing motion-detail verifier's transport:
manifest-listed GETs read the real immutable artifact, check its SHA256 again,
and fulfill those same bytes with the original MIME type. This removes the
synthetic second HTTP hop. Unlisted URLs and other methods retain the actual
HTTP response. Missing, altered or escaping artifacts still fail; browser and
route errors remain fatal. Cold-main observation completes before releasing
unchanged main-module bytes, and pending-request bounds and original-error
selection remain intact. No game inputs, GPU thresholds, frame counts or
operation deadlines change. A separate stale test assertion was aligned with
the existing async generator, retaining explicit playing/results, 120-frame,
fixed-dt, timeout and browser-error checks.

New transport regressions cover real binary/module/index bytes, query and
encoded paths, missing/modified artifacts, path/symlink escape, real-server
fallback, observer ordering and observer failure. Hosted acceptance of this
correction must belong to its eventual exact PR head; the historical main
failure remains recorded rather than relabeled as passing.
