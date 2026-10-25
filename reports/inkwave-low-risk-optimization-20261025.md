# INKWAVE: verified low-risk optimizations

Baseline: integration PR #1878 head `dd90aa241aabd5f0b972cc3471386ba3d4da86dc`.
This follow-up changes CI checkout, build-only PNG processing, and a local
scratch object used when preparing prop instance bounds. It preserves gameplay,
draw/culling decisions, shader deformation, pixels and the existing comparison
limits against Splatoon 3. No motion, character shape, frequency or quality
setting is changed.

## Adopted changes

| Area | Change | Verified result |
|---|---|---|
| Object presentation QA | Exclude the offline modeler from checkout; fetch immutable baseline trees without unrelated blobs | 496 unused tracked files, totaling 203,526,761 uncompressed source bytes, need not be materialized. Sparse/full production manifests match exactly. Actual network/time savings are not measured. |
| Lossless lightmaps | Reuse two filter rows, stop candidates whose nonnegative score cannot win, specialize PNG None/Up decoding | All 5 shipped plus 120 synthetic PNG outputs are byte-identical to baseline. Scratch allocations 40,960 → 10. Nine alternating local samples: median 1526.68 → 1338.04 ms, about 12.36% shorter for the 5-image workload. |
| Prop instance bounds | Copy local bounds into one function-local transform box rather than cloning every record | Halyard envelope preparation removes 47 Box3 and 94 Vector3 temporary allocations. Long-run elapsed time is effectively equal. Exact spheres and 40 Chromium frames match. |

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

## Combined local verification

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
