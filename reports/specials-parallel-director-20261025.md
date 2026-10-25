# Parallel specials optimization: presentation director

Base: PR #1876 head `6dacd47095352cfd600f9c83012c71a2f298a460` (main ancestor `7f863ea2d65671abd1453fdae1b61de00f1d10e2`). Worktree: `/workspace/actions-director`. All validation was local. No Actions, deployment or remote writes were performed by this lane.

## Result

Only `patches/splatoon3/runtime/special-vfx.mjs` changes at runtime:

1. **Killer Wail 5.1 repeated laser rows:** an existing beam already owns its `from` and `to` vectors. Refresh them directly after snapshotting both input coordinates, rather than cloning two temporary vectors and copying them into those same objects. First birth, the 140-unit existing visual clamp, interpolation, expiry, RGB reads, particle births and actor/activation/index keys are unchanged. Reading both inputs before writes also preserves direct callers that alias the previous endpoints. The old owned endpoint/draw-to handles retain identity.
2. **Triple Inkstrike spray:** each sample uses the same azimuth for the position and three tangential particle velocities. Reuse its sine and cosine within that sample, retaining the original multiplication order and random draws.

These are additional to open PR #1870 at `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`, whose supplied file patch was inspected. That PR changes different director paths, including Wail smoothing alpha and speaker-array reuse, shape scalar births, Ink Vac basis construction and Kraken filament math. None of those changes was imported or duplicated here.

## Proven work reduction

The new tests execute the actual composed director and actual pool implementation, then compare their entire particle Float32 storage, uploaded attributes, retained shape records, beam endpoints, marks and presentation RNG state with frozen baseline recipes.

| Controlled source scenario | Baseline | Candidate |
| --- | ---: | ---: |
| Six Wail rays for 2 s at 60Hz, including a 0.2 s expiry gap and restart: transient `Vector3.clone()` calls | 1308 | 36 |
| Same Wail run: live ray refreshes | 636 | 636 |
| Three Inkstrike columns for 1 s at 60Hz: combined sine/cosine calls | 792 | 198 |

Each live Wail refresh removes exactly two clones; birth clones remain. Each Inkstrike spray changes eight trig calls to two. Particle count, shape/colour/lifetime, random sequence, beam timing and damage/paint/network logic are unchanged. This is deterministic allocation/math evidence, not a claim that full-game frame time decreases by the same percentages.

No wall-clock speedup is claimed from this parallel environment. A serial-only alternating benchmark is available for integration:

```sh
SPECIAL_DIRECTOR_BENCH=1 node --test \
  --test-name-pattern='serial-only diagnostic' \
  patches/splatoon3/tests/special-director-hotpaths.test.mjs
```

It measures the real event observer in two isolated VM contexts, 300 warm-up iterations then 5000×6 accepted laser rows per repetition, eleven alternating repetitions. It prints raw samples and medians without a fragile timing assertion. Run without concurrent workloads; it is neither WebGL nor full-game timing.

## Validation

**38 tests passed, zero failed or skipped** in the corrected final command:

```sh
SPECIAL_VFX_ESBUILD=/workspace/actions/node_modules/esbuild/lib/main.js \
AREA_VFX_ESBUILD=/workspace/actions/node_modules/esbuild/lib/main.js \
SUPPORT_VFX_ESBUILD=/workspace/actions/node_modules/esbuild/lib/main.js \
node --experimental-vm-modules --test --test-concurrency=1 \
  patches/splatoon3/tests/special-director-hotpaths.test.mjs \
  patches/splatoon3/tests/projectile-special-vfx-clock.test.mjs \
  patches/splatoon3/tests/area-special-vfx-clock.test.mjs \
  patches/splatoon3/tests/support-special-vfx-cadence.test.mjs \
  patches/splatoon3/tests/special-vfx-recipes-parity.test.mjs
```

The 13 new cases cover source plus esbuild-minified production transformations at 30/60/120Hz, moving/clamped beam origins/targets, beam expiry/rebirth, three simultaneous Inkstrike columns, complete state equality and an aliased-endpoint ownership case. These are actual module/pool CPU checks with external gameplay/DOM dependencies as sinks; a minified transform is **not** a claim to have tested a whole emitted site. The parent integration owns the full build and emitted/browser gates.

Initial focused batch: 36 passed, one setup failure because the command omitted `--experimental-vm-modules`, making `vm.SourceTextModule` unavailable in the existing area-clock fixture. No runtime assertion was suppressed; the corrected command above enables its source and minified cases and passes all 38. `node --check` and `git diff --check` pass.

Local raw log: `/workspace/scratch/special-director-regressions-final.log`. Frozen recipe evidence is `patches/splatoon3/tests/fixtures/special-director-before-6dacd47.json`; it records the base commit and original whole-director SHA-256.

## Behavior comparison and limits

Comparison version remains the existing Splatoon 3 Ver.11.3.0 evidence in `patches/splatoon3/reference/special-vfx.md` and the common behavior report. Reproduction: activate Killer Wail and continuously track changing targets; separately throw three Triple Inkstrike markers and observe the simultaneous columns and base spray. This lane preserves INKWAVE's existing effect results and does not establish new retail timings, exact Nintendo particle curves, damage/paint equivalence or device FPS parity. No retail recording, actual GPU, Safari/iPad, live-network or pixel acceptance was performed in this lane. The common comparison report is intentionally left to the coordinating integration to avoid overlapping edits.
