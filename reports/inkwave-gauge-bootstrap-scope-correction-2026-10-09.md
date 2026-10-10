# Gauge verification scope correction: #469 and #647

## Correction

The Storm adoption follow-up `307d15fc` (aggregate `9302b381`) and unadopted Slam landing-transfer prototype `56814527` exercised the existing native NetMatch adoption compatibility path. Their replication fixture's `fullRuntime` option installs several actor/resource wrappers, not the complete production bootstrap. In particular, it omitted `installDisconnectFidelity`.

The production `patches/splatoon3/bootstrap.mjs` installs that wrapper after the main runtime. It replaces human `onLeave` with the current dead/disconnected, no-bot policy. Consequently, those adoption tests do not establish a live production human-disconnect defect. The Storm sidecar follow-up is withdrawn, and the Slam landing-transfer prototype is not selected for publication. They must not be counted as production defect fixes. Existing older adoption compatibility behavior is not silently changed or claimed to match Nintendo.

The personal Storm HUD projection (`1a191575`, aggregate `570b5d8e`) and local pending-Slam-landing recharge/readiness correction (`31b3d3ba`, aggregate `41dd1e65`) are separate changes. They remain valid in the production wrapper composition, as independently checked below.

## Complete wrapper verification

The new `issue-469-647-bootstrap-scope.test.mjs` applies the build transform sequence to both upstream and runtime modules. It calls the real `runtime/install.mjs::install(profile)` and uses its returned API, then applies all eight additional production bootstrap installers in their actual source order. An assertion checks those calls against `bootstrap.mjs` so an ordering change is visible.

This also applies real kit composition. The older focused fixtures used the pre-kit Charger/Storm and Shooter/Slam mapping; the production test instead uses the current original INKWAVE Splatling/Storm and Dualies/Slam kits. No production kit is overridden to force the result.

Five checks pass:

1. Removing only the Storm HUD projection still produces an inactive zero HUD gauge while the real production actor has four seconds of lock remaining.
2. Removing only the pending-Slam admission guards still allows real native reactivation during landing recovery.
3. With the retained Storm fix, held/use/expiry, personal gauge and recharge follow the same real lock.
4. With the retained Slam fix, pending landing still records turf but cannot recharge or reactivate; normal recharge resumes at the existing finish.
5. With the installed production disconnect wrapper, `onLeave` invokes native `_adopt` zero times and sets the human to dead/disconnected, remote, owner-null and non-bot.

The shared source fixture now exposes the API already returned by the main runtime installer. Its default behavior is unchanged. No production runtime change is included in this correction/verification patch.

## Evidence limits

Results: **5/5 pass**, sequential native VM execution. These tests use real game classes, build transforms and runtime installers, with a flat-floor physics fixture, display substitutes and a minimal live match. They are not an end-to-end browser startup, rendered-pixel check, relay run or Nintendo hardware comparison. The Splatoon 3 comparison baseline remains 11.3.0; previously unmeasured gauge curves, segment calibration and landing timings remain unverified.

Public scope corrections were posted on [#469](https://github.com/rhgrive3/actions/issues/469#issuecomment-6080361402) and [#647](https://github.com/rhgrive3/actions/issues/647#issuecomment-6080363173).
