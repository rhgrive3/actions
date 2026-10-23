# Read-only peer review: UI/motion and ranked/paint

Reviewed integration range `8de71b09cd7a3bc05fa4ce06b00f99687beb44ad..34df12458bf2ac0b815f25db33fec2eaa95114e3` in `actions`. Scope: thirteen UI/motion and ten ranked/paint findings. No production/test edits or broad suite repeats. One concrete regression was reported to root before writing this report.

## Finding: P2 — objective snapshot visits sparse slots skipped by existing renderer

`patches/splatoon3/runtime/ranked/minimap-cache.mjs`, `snapshot()`:

- Zones: indexed traversal reads `z.center` even when an array index is absent.
- Tower checkpoints: `for...of` reads `cp.progress` for an absent checkpoint slot.
- Clams: `for...of` reads `c.pos` for an absent live-clam slot.

The existing `drawObjectives` implementation uses `Array.prototype.forEach` for these arrays, so absent slots are skipped. The new snapshot runs before native `Minimap.update`; a hole now throws and prevents the map update. This is an in-place mutation regression, independent of ink dirty state or objective content changing identity.

Confirmed with actual composed recording-Minimap harness `patches/splatoon3/tests/fixtures/added-minimap-harness.mjs`, loading the SHA-pinned base UI source from `ranked-added-before-8de71b09.json` and the current production `installRankedUi`. Each engine had ordinary valid coordinates and a one-entry objective/checkpoint array; `delete array[0]` created the hole, then `m.update(0,true)` exercised the same original/current composed update path.

| Deleted slot | Base | Current |
| --- | --- | --- |
| `stage.zones[0]` | Pass | TypeError reading `center` |
| `stage.tower.checkpoints[0][0]` | Pass | TypeError reading `progress` |
| `rule.state.clams[0]` | Pass | TypeError reading `pos` |

Suggested correction: preserve the renderer's sparse iteration behavior for these three arrays, retaining the length and present index/content information needed to invalidate when holes are filled, deleted or moved. A focused recording-Canvas differential should cover hole creation/filling and same-length sparse relocation. Explicit present undefined/null entries need not become accepted if the old renderer rejects them. No assertion/authentication relaxation is needed.

## Other review results

No further concrete blocking defect found in this review:

- Final UI adapter runs after current HUD snapshot/lifetime/queue/camera adapters and fails duplicate/missing anchors. Direct marker metadata preserves the current projected weapon/readiness precedence; fallback still binds and disposes Actor caches.
- Timer/turf/map/squad caches remain owned by the existing presentation-key state; raw-key comparisons also check the rendered key owner. Map self position and following beacon update remain outside dot early-continue work.
- Camera fallback preserves overridden-forward calls; late flight refresh remains later in the original follow path. Gyro scalar expression order and fresh output ownership agree with the original quaternion multiplication.
- Sparse gait/balance storage is per-instance, with independent vector/quaternion objects, unchanged lengths and dense fallback for invalid construction indices. Current production consumers address the same six gait/two upper-leg targets; no runtime bone-index remapping writer was found. This does not assert support for arbitrary post-construction skeleton topology changes.
- Results reveal cursor, frozen bomb schedule and muted preview early exit retain the original timing/RNG and smoothing paths by source inspection and supplied focused differential evidence.
- Tower projection cache includes native `toCanvas` inputs (bounds, scale, dimensions, flip), projection function, level/stage/path identities and every route coordinate. It replays the current path's Canvas commands; unusual route points use the existing fallback. Objective snapshots cover all ordinary visible scalar inputs for the four modes; native update remains responsible for its 30 Hz budget, hidden updates, ink and forced refreshes.
- Barrier private `flushAfterPrune` has only the two entry calls that already prune at the identical supplied `now`, plus public flush which still prunes. Original active checks remain at the original second-flush boundary; owner/loadout/path/caps, replay watermark and trusted forwarded kind remain unchanged. Fresh receipt/pending timestamps are the same supplied time.
- Non-Tower disposal retains only the captured spatial owner identities/count/buffer and monotonic safe stamp. Native query increments the stamp before comparing IDs; old recorded stamps cannot match the next valid epoch. Tower removal and uncertain/wrapped ownership still reset. No new numerical/collision order change identified.
- Stage mode plumbing avoids non-Tower route reads while preserving legacy/Tower eager order and per-stage lazy writable materialization. Footprint constant hoists and impact finite checks preserve selection and primitive arithmetic.

The existing supplied suites were read as supporting evidence; they were not rerun. Review-specific execution was limited to the three concrete sparse-array base/current counterexamples above. Root owns the correction, targeted regression, combined build/browser verification and final publication. Clock issue #1767 and retail/device timing remain outside scope.


## Integration closure

The sparse-array P2 is corrected in root commit5a081ae0 (author8470da3a): captured lengths and `in` checks preserve native forEach traversal for Zones, checkpoint teams/entries and field Clams, including inherited indices. Present indices remain invalidation keys. Root independently reran the actual-composed Minimap suite after integration:11 passed,0 failed,0 skipped; holes, hole relocation, inherited entries/mutations, explicit null/undefined and numbering/team-color cases are covered.
