# Active Squid Spawn predicate follow-up candidate

This separate candidate starts at immutable `702ce3d146043928fd4b783241105871515f9d92`. The original PR1862 and its branch, images, tests and intermediate evidence are preserved. Per the parent's instruction, **PR1862/main/other PRs are not updated and no new PR is created**. The new branch is `fix/respawn-spawn-owner-predicate-20261023`, saved for independent parent review.

## Reproduction and minimal correction

A real production-adapted Actor selects and launches toward supported y=0. During flight the support is replaced by a genuine native dry floor at y=-8. The native flight endpoint misses support and hands movement to its existing `squidSpawn.phase='landing'` branch. No position, grounding, phase or collision result is forced. The lower floor also remains safe under the native water/death predicate.

702's calibrated spawn display expires before actual support. At `y=-5.917921178423665`, `T_SPAWN=.5333334803581238`, phase=landing and grounded=false, the old helper returns true and the Roller selects ready in the air. This reproduces the parent's point. There are **6 premature ready ticks** before the lower floor.

The correction adds only two executable lines to `spawnMotionAllowsAction`:

```js
const owner = ch?.actor;
if (owner && owner.character === ch && owner.s3?.squidSpawn) return false;
```

This reads the existing cached, identity-validated Actor binding without calling `_owner()` or writing its lookup cache. Any active Squid Spawn owns the body, including aim/flight/unsupported landing, even if the calibrated overlay has expired or is disabled/absent. When the actual lifecycle finishes, the existing retired-pose/fallback behavior resumes. Standalone/ordinary air/hold and disabled presentation without a lifecycle retain their existing fallback. Null/undefined characters remain valid fallback inputs. No timer, input, native attack gate, physics, armor, actor state, network, rig, geometry, curve, grip or IK changes are made.

The complete runtime delta including its corrected explanatory comment is losslessly archived as [`runtime.patch.gz`](runtime.patch.gz), uncompressed SHA256 **`06e4b42d43c8e3b5dbaf4af9fc586c51572049b8a90fa9738bced34fa128d157`**. New runtime SHA256 is **`1756151408ac7e6a27ae97b4ce62044bea04d9782924928b96b7a30112663dde`**. `change-manifest.json` records scope. The Roller, Roller detail and respawn lifecycle files remain byte-identical to 702.

## Results

- New regression against 702 source: **1 pass / 3 fail**. Same test file against the real normal 702 emitted build: **1 pass / 3 fail**. Lossless original Node outputs are `before-source.tap.gz` and `before-emitted.tap.gz`.
- Final source: new **4/4** plus existing **8/8**, **12/12 pass** (`source-final.tap`). Final normal production minified site: **12/12 pass** (`emitted-final.tap`). No fail/skip/cancel.
- Existing lifecycle/remote/spawn-pose and source/CI admission focus: **76/76 pass** (`lifecycle-contracts.tap`). Existing assertions are unchanged; new tests are added to both source and emitted steps in the existing workflow.
- The new native dry-floor case runs at **30/60/120 Hz Actor updates** and waits for actual supported touchdown. The normal supported landing remains a positive control: ready is available on the first post-touchdown update while the native spawn clock is still young.
- New local/remote-bound predicate checks cover aim/flight/landing, missing/disabled overlay state, wrong/stale Actor binding, reuse/reset and unchanged ownership lookup cache. Existing eight cases retain genuine death/respawn, physical-held versus filtered-false release, fresh/held post-land attack, actual superjump, weapon change/reset/dispose and direct remote presentation coverage. This does **not** claim real transport.

[`physics-and-predicate-trace.json`](physics-and-predicate-trace.json) contains the frozen 702-source versus candidate source replay. **All 88 complete serialized input, physics, timer, armor, spawn/pose lifecycle and action records match exactly**; only the expected eligible/anchor/rotation presentation fields are excluded from that equality comparison. New premature ready ticks: **0**. The first supported post-land record is y=-8, native spawn lifecycle absent and ready=true at `T_SPAWN=.6500000357627869`, preserving immediate readiness without restoring the old 1.4s wait. Ink=100, projectile/paint/turf=0, rolling=false and flick=-1 throughout.

The first replay harness invocation omitted Node's VM flag, and the next compared Array prototypes from two separate VM realms. Those unsuccessful harness outputs and the exact earlier script are retained as gzip files. The final verifier compares every serialized value, including pose lifecycle data, and preserves both full inputs. No physics difference or passing result is inferred from those failed harnesses.

## Actual normal build

The earlier `source.tap`/`source-final-focused.tap` and intermediate helper files are retained separately; final acceptance uses the current final source, `source-final.tap`, and the actual normal site below. These are **not minified-component overlays**.

```sh
node scripts/build-inkwave.mjs inkwave-public /workspace/scratch/respawn-spawn-owner-20261023/site-final
INKWAVE_BUILT_SITE=/workspace/scratch/respawn-spawn-owner-20261023/site-final node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/respawn-spawn-owner.test.mjs patches/splatoon3/tests/respawn-weapon-state.test.mjs
node --experimental-vm-modules scripts/check-inkwave-spawn-owner-replay.mjs /workspace/scratch/respawn-spawn-owner-20261023/new-replay-output
```

Normal build input hash: `fedfdd0c90001397b7a905d4ce4892d472c3d208f428f72a847b4c3fbcd9c8b1`; content hash: `d06bdd157e91f91b87c2e55cb6394ffdb0e85188ec81e68a875a73c7286be557`. All **2,110 emitted artifact bodies** were reread against the manifest; **1,420 input identities** are retained in `normal-build-manifest.json.gz`. Final helper source hash matches that actual build input. Build, startup budget and quick patch checks pass. Local Node is 24.19.0; existing CI remains Node22. Full build and intermediate files remain at `/workspace/scratch/respawn-spawn-owner-20261023/`.

## Deferred image question and acceptance

The parent's image comparison question remains separate. Existing 702 before/after145 images show the same large existing ready silhouette and match each other. Initial settled ready, candidate61 and both145 records use the same specified anchor/rotation. Spawn pose retires at the land event after frame60's pose calculation; candidate61 therefore applies ready directly. Frame61's camera is still in landing follow, whereas145 is settled. This establishes the stage where the channel values change, **not the final world-pivot/projection contribution or absence of a pose pop**. No new scale/geometry enlargement, pure-perspective explanation or full visual acceptance is claimed. The final pivot/body/camera isolation is deferred in favor of the parent's explicit premature-airborne blocker. No model, hair, character, grip/IK or recovery-curve change is attempted.

The reference parameter epoch stays Splatoon3 11.3.0. No new retail motion/trajectory measurement is inferred from these controlled source cases, and no blocked media route is bypassed. New candidate hosted CI and the parent's independent review remain separate from these local source/normal-emitted results. Official candidate ref/tree and changed blob body readback are returned with the saved branch; there is no PR1862 update or merge.

The exact unified diff contains a blank context line emitted by Git. It is preserved byte-for-byte in `runtime.patch.gz` rather than editing the patch to remove whitespace; decompress to obtain `runtime.patch`. No code, test assertion or trace was changed for this archive step.
