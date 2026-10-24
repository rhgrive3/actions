# Safe complete-position fallback candidate

Separate candidate based on `07a9792142564756189342a2e86d0bc3afe275ed`; the original branch and PR #1860 are preserved. Scope is the independently reproduced invalid final capsule position, not the separately reviewed correction-segment/wall-sweep question. No stage mesh, protection radius, collision capsule setting, dt cap, weapon, landing presentation, main or other PR is changed.

## Confirmed before

Real production-composed Actor, Physics, Actor.update and `_finishFrame`; Character update/paint/audio are stubs. Enemy pad `[20,0,0]`, radius 4.2, floor and ordinary box `[13,0,-2]..[15.1,2.2,2]`. From airborne `[15.39,20,0]`, zero velocity, right intent and native 1/60 updates, 07a fails at zero-based index 66 (67th update): `[15.4,1.5891632460844727,0]`, `vy=-32.98166666666667`. Both the actual terrain-capsule check and the old helper's legacy-radius check fail. 114 of the 180 endpoints are invalid; the last is `[15.4,0,0]`. Both teams reproduce this. The shortened run-speed/max-fall cases fail at 1/60, 1/30 and 1/24. The earlier injected 40/-20, .1-second box case is retained as a secondary robustness case.

The no-exclusion control's original movement endpoint and 101 sampled segment points are clear. This confirms that the bad final position is introduced by mixing previous X/Z with the newly resolved Y; it is not evidence that a separate arbitrary correction segment tunnels through a wall.

## Minimal runtime repair

Only `constrainSpawnPosition()` in `patches/splatoon3/runtime/spawn-exclusion.mjs` changes:

- Keep all three components of the native endpoint for failure recovery.
- When the proposed horizontal correction overlaps the world, test it at the previous height. If clear, retain the greatest tested vertical progress with eight `Physics.bodyFits` bisections. This preserves legal tangent movement instead of rolling all X/Z back each time and pinning the actor.
- If that location is blocked, test the previous X/Z at current Y, then its complete previous position with the same bounded vertical recovery. Every selected fallback endpoint is actually tested. Stop only a vertical velocity component that this world contact rejected; free gravity and upward launch retain their original Y/velocity histories.
- Retain the existing eight ring recovery candidates. If none fits and no safe origin was available, restore the complete native endpoint and return false. The enclosure regression supplies a clear native endpoint with no clear outside sample: repeated calls remain at exactly that endpoint, at at most nine capsule checks per call. This prioritizes existing world collision rather than forcing a point into solid geometry. It does not claim universal exclusion when no legal outside point was found, nor global path feasibility.

### Capsule parameter distinction

The old correction guard used `PLAYER.radius` (0.38). Production Actor._resolve already uses `s3HumanoidTerrainRadiusRaw * s3TerrainDistanceScale` (0.35) and the corresponding squid radius (0.675), as connected by `local-batch-01-adapter.mjs` #525. The candidate passes those **existing** form-specific values to the unchanged Physics.bodyFits; no Actor radius, collider, margin, protection distance or stage geometry is resized. This also prevents an artificial mismatch when native movement resumes from a corrected contact. `PLAYER.radius` still contributes exactly as before to the 4.6 spawn boundary.

The candidate's natural-fall endpoint after 180 ticks is `[15.4,1.6600056205371203,0]`, velocity zero, native terrain `bodyFits=true`. The separate **legacy 0.38 diagnostic is false** there; it is not the capsule used by composed Actor._resolve. Both diagnostics are retained in the JSON rather than presenting them as equivalent. Both actual human and squid terrain capsules are checked in the tests. Independent review should use the unchanged composed Actor's actual form-specific capsule parameters and its existing default margin.

## Verification at code freeze

```
INKWAVE_BUILT_SITE=<original-07a-site> node --experimental-vm-modules --test patches/splatoon3/tests/spawn-exclusion-fallback.test.mjs
node --experimental-vm-modules --test patches/splatoon3/tests/spawn-exclusion-fallback.test.mjs patches/splatoon3/tests/spawn-exclusion.test.mjs
INKWAVE_BUILT_SITE=<candidate-site> node --experimental-vm-modules --test patches/splatoon3/tests/spawn-exclusion-fallback.test.mjs patches/splatoon3/tests/spawn-exclusion.test.mjs patches/network-replication/tests/owner-clock-opening-adoption.test.mjs patches/reliability/tests/relay-compatibility.test.mjs
```

Original emitted 07a: new focused suite **8 fail / 4 pass**. Candidate composed source: **37/37 pass**; candidate real minified modules plus compatibility: **56/56 pass**. These include both teams, 180 natural updates, following native collision/completion, legal side-route/retreat, human/squid bodies, three dt cases, original .1 robustness, the clear negative control, unchanged vertical falling/launch both away from and against the spawn boundary, bounded no-candidate behavior, and the original 25 intrusion/allied-exit/stage tests. No native Switch, full browser rerun, deployed relay or new exact-head CI acceptance is claimed by these source/emitted tests.

The complete original runtime is preserved in Git at 07a and `.ci-scratch/respawn-fallback-safe/spawn-exclusion-before.mjs`. Before/after logs and numeric endpoints are retained here with lossless gzip for raw failure whitespace. Earlier failed candidate attempts remain in `.ci-scratch/respawn-fallback-safe/`. The final commit hash, committed-input build/readback and handoff evidence are recorded separately for the parent's independent review.

This remains an INKWAVE local exclusion repair, not new retail Splatoon 3 parity. The established 11.3.0 comparison/version limitations and the deferred sweep question remain unresolved. Original report: [respawn exclusion](../respawn-exclusion-20261023/README.md).
