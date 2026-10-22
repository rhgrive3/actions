# Read-only peer review: added audio4 / weapons14

Reviewer domain: ui_motion. Compared exact base `8de71b09cd7a3bc05fa4ce06b00f99687beb44ad` with root snapshot `b327804a` (full root SHA later observed: `73cabff837beae0987b9b1265d55dcc6ffb6cd06`). Confirmed no changes to the reviewed audio/weapon paths between these two review snapshots. Original reviewer worktree and commit `26990dcf` were left fixed. No production code was changed by this review.

Result: **no concrete regression found** in the reviewed diff. This is focused code/ownership and actual-source test review; root's combined emitted build/browser checks remain separate.

Reviewed production paths:

- `patches/splatoon3/audio-adapter.mjs`
- `patches/splatoon3/runtime/audio/authorized-samples.mjs`
- `patches/splatoon3/runtime/audio/engine.mjs`
- `patches/splatoon3/runtime/all-specials.mjs`
- `patches/splatoon3/runtime/all-subs.mjs`
- `patches/splatoon3/runtime/kit-big-bubbler.mjs`
- `patches/splatoon3/runtime/kit-support.mjs`
- `patches/splatoon3/runtime/kit-trizooka.mjs`
- `patches/splatoon3/runtime/main-weapon-catalog.mjs`
- `patches/splatoon3/runtime/native-sprinkler-damage.mjs`
- `patches/splatoon3/runtime/slosher-nearest-paint.mjs`
- `patches/splatoon3/runtime/storm-effects.mjs`
- `patches/splatoon3/runtime/support-cooler-collision.mjs`
- `patches/splatoon3/runtime/torpedo-splashes.mjs`
- `patches/splatoon3/runtime/trizooka-collision.mjs`
- `patches/splatoon3/runtime/weapons-fidelity.mjs`

Checks and reasons:

- Digest reuse is transaction-scoped to fetched bytes and every declaration still compares its checksum. The digest promise and decoded bytes remain live until the last borrower finishes; last-request-wins checks still follow async boundaries. Verified brush reuse is one-way raw windup to repaired roll, with matching file/SHA and no raw loop points. Repaired output remains independently owned. Reviewed cancellation, reversed order, checksum mismatch, unsigned rows, loop endpoint and cache eviction controls.
- Noise reuse happens only after the last IIR read of white input. White samples remain Float32-rounded in the final channel before normalization. The test compares the actual complete original/adapted noise functions at seven sample rates, rather than a replacement formula.
- Warm preparation keys real context/bank ownership; base init/resume is still called. New owner and pre-unlock intents retain their preparation path; dispose clears owner references.
- Slosher aim scratch is consumed into yaw/pitch before downstream callbacks. Storm LOS has nested private fallback and finally release. Tacticooler uses per-Actor nesting frames, retains independent contact normals until native resolution returns, and releases stand/axes/faces references in finally. Point Sensor resets both partial capsule output fields before every call.
- Trizooka only shares pure callbacks and per-activation predicates. Per-call presentation contexts and finally restoration remain independent. Scalar OBB expressions retain operation and root/tie order. Missing-offset lobe fast paths explicitly retain signed-zero and nonfinite fallback; explicit offsets use the original path.
- Geometry sharing counts live Torpedo/Fizzy meshes, retains independent material birth colors, and disposes/reconstructs at last removal/redeployment. The bounded cap path exercises removal through the same owner.
- Booyah caches only radius-dependent centres; terrain probes/projection/dedup and final pass stay live. Wail's finite broadphase is conservative with a scale-aware margin and retains the original exact loop for possible hits/unusual inputs. Native Sprinkler preserves accepted-owner Set identity membership, including composed bomb eviction; inspection of actual native bomb replay confirms it does not create missing actors before lookup. Mist skips only truly absent fields.
- The source-valid sparse Sloshing Machine correction uses optional chaining matching the pre-existing validator/defaults; this is a concrete baseline bug fix with mutation coverage, not weakened validation.

Executed independently in root worktree:

`node --test patches/splatoon3/tests/added-audio-sharing.test.mjs patches/splatoon3/tests/added-weapons-allocation-parity.test.mjs patches/splatoon3/tests/slosher-nearest-sparse-cache.test.mjs`

**21 passed, 0 failed, 0 skipped** (about 3.5 seconds). Log: `added-results/ui-peer-audio-weapons-tests.log` in the shared task directory.

The fresh tests execute actual runtime modules and frozen original production kernels; stubbed Physics/mixer/resource seams isolate specific contracts. They are not standalone evidence of the emitted whole game. Also inspected the existing regression entrypoints: native Sprinkler, catalog Slosher and detached Torpedo explicitly use fullRuntime + productionComposition + realProjectiles; Trizooka geometry loads adapted native Projectiles/Physics through its production installer. Author's broader 138 + 5 weapon and 77 audio passes are reported in their domain reports and were not rerun wholesale by this reviewer. Physical device, GPU rendering and retail performance remain unmeasured.
