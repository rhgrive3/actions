# Additional queue: CI and build work

Five queue records are implemented locally. These changes do not report remote CI completion or alter required gate identities, immutable checkout checks, acceptance commands, or Validate's mandatory `always()` failure fan-in.

## Changes

- A+ uses a stable PR/main concurrency group with `cancel-in-progress: false`. Pending obsolete runs coalesce while running evidence completes. Manual dispatches remain independent. No canceled required check is converted to success by a skip condition.
- Main-weapon push and PR filters include all eleven missing executed test entrypoints. A contract checks every declared test path and removes each missing route as a negative control.
- The three unconditional current main-weapon checkouts and all seven Validate checkout definitions use `blob:none` and a conservative sparse projection retaining all runtime, patch, source, test, build, docs, and report roots. Only the unrelated modeler subtree is excluded inside tools. The conditional pinned historical baseline remains a full checkout: its missing historical promisor blobs were not fetched or used as unverified evidence.
- Normal production skips only the first-pass transforms for two Three inputs that the mandatory later bundler replaces. Both source compositions still run. Unminified and `INKWAVE_NO_THREE_SHAKE=1` preserve their standalone paths. The diagnostic counter excludes skipped inputs.

## Verification

`node --test scripts/tests/inkwave-added-ci-contracts.test.mjs scripts/tests/inkwave-queued-workflow-policy.test.mjs`: 18 pass, zero failures/skips. Final revised new contract: 5 pass. Integration workflow, source admission and Three composition batch: 47 pass, one emitted-site-only skip subsequently covered by the actual emitted-site run below.

`INKWAVE_BUILT_SITE=.../site-after node --experimental-vm-modules --test scripts/tests/inkwave-build-packaging.test.mjs scripts/tests/inkwave-three-composition.test.mjs`: 12 pass, zero failures/skips. Production startup budget passes. Normal, no-shake and unminified builds complete.

All 2,090 manifest artifacts were independently SHA256 checked against the existing exact-base build: every runtime artifact byte and every input digest matches. Only the build recipe script digest changes. Trace instrumentation observes 547 async transforms, versus 549 in no-shake mode; the avoided composed Three inputs total 2,121,127 bytes. This is removed build work, not shipped-byte savings.

The actual current sparse checkout materializes all 5,364 selected files. Its full production build has an identical manifest and independently verified bytes for all 2,090 artifacts. Of known cached blobs, at least 203,526,761 bytes are excluded; 17 excluded blob sizes are unavailable. These are local projection measurements, not cold network/timing claims. The full historical baseline is intentionally retained.

Evidence is retained in the three adjacent JSON receipts. Complete local logs and transform traces are in `/workspace/scratch/1dcd5205fbb6/added-ci-evidence/`. No device/FPS claims or broad historical blob fetch were made.
