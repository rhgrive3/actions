# Material same-base QA preparation

This preparation is not a full-game performance pass or a retail-fidelity verdict. No workflow is added. The original failed 429/b9 observations and PR1755/1766/1770 heads are unchanged.

## Fixed provenance

- COMMON runtime: `cc0c90afe8031643e6a890974f8f44a40a30509e`.
- COMMON tree: `de64f6d82cdf518b9acbc4ce3ae7c897509b406c`.
- A: exact common production inkShading.
- B: only the two approved micro-normal amplitude reductions to75%, with the existing production4mm film and all other source/compiler inputs unchanged.
- The preparation script requires exact COMMON git HEAD/tree, unchanged tracked source, full build-manifest verification, matching esbuild version and exact emitted-A byte reproduction. It writes B outside COMMON and SITE only after those checks.
- Runtime and QA checkouts must be separate. Do not build the preparation branch as the game, or reuse the old429 inverse compiler.

## Commands and checkout separation

These are future commands, not a record of browser execution. Browser/measurement execution requires the separately reviewed common build and permission to run that exact bundle.

Start in the QA preparation checkout:

```sh
QA="$PWD"
COMMON="$(realpath ../common-runtime)"
SITE="$(realpath ../common-site)"
OUT="$(realpath -m ../material-common-artifacts)"
test "$(git -C "$COMMON" rev-parse HEAD)" = cc0c90afe8031643e6a890974f8f44a40a30509e
test "$QA" != "$COMMON"
export INKWAVE_MATERIAL_COMMON_SOURCE="$COMMON"
node --test scripts/tests/material-native-common/*.test.mjs
```

The test fixture explicitly uses COMMON's source rather than a scratch path. A read-only thin tree made of symlinks needs Node's `--preserve-symlinks` during local source tests; a normal complete git checkout does not. These tests execute source/fixture code, not a browser.

With an already verified common build at SITE:

```sh
cd "$QA"
node scripts/prepare-inkwave-material-common.mjs "$COMMON" "$SITE" "$OUT/overlay"
node scripts/check-inkwave-material-native-paired.mjs "$SITE" "$COMMON" "$OUT/overlay/inkShading.js" "$OUT/settled" --settled-replay-diagnostic
```

The paired script's child path is intentionally repository-relative, so retain QA as the working directory. It launches the QA frame script while verifying the separately built COMMON runtime. A receives unchanged site bytes; B overlays only the exact versioned material URL. Every other loaded resource remains strict.

The original three-frame diagnostic remains `--replay-diagnostic`. The normal3ABBA path uses the same paired command with no mode argument. Neither is permission to launch a new job. Normal120-frame timing/statistics and original three-frame observer are preserved, except for explicit common-source bindings. The preserved baseline fragments are bound to official b9 source blobs in the test fixture.

## Admission and remaining limits

The settled diagnostic uses exactly28 normal native frames, one beyond the observed27-frame camera-blend boundary, not a claimed minimum. Already-started portrait callbacks must complete naturally. No extra imported jobs, adaptive frame counts, pose/clock/seed corrections or actor masking are permitted.

Bounded identity observation compares stable owners, CPU contents, provenance and bidirectional aliases while retaining raw UUID evidence and raw equality results. Unknown references, incomplete readiness or evidence integrity stop subsequent lanes. Loaded resources, gameplay RNG, whole-frame A/A and the original sequential-repeat gate remain strict. B1 is not a B/B validation.

CPU texture hashes and render-target ownership do not measure GPU texture contents. Observation is diagnostic-only, not timing-neutral. The few-percent budget still needs valid native practice-range and imported/object-stage measurements; custom Tidewater does not substitute for inkblot/nativeSource. Absolute paired CPU/frame statistics and their spread must be reported. SwiftShader is software rendering, not physical GPU or target-iPad evidence. Live FPS and allocation rates remain unmeasured.

Current spawn-floor images overlap the barrier and cannot establish retail parity. A separately reviewed unobstructed normal-UI case is needed. Preserve whole frames; do not mask away discrepancies, recolour, relight, sharpen or disable postprocessing. Official Nintendo footage supplies qualitative floor/highlight references, not recoverable shader constants or numerically matched illumination. No Nintendo images/assets are included here.
