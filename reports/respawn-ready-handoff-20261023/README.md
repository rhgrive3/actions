# Respawn landing: bounded return to the existing ready pose

This candidate preserves `70814c6dfcc20868f2c5c0eb483ccdcb9b950446`'s active Squid Spawn predicate and all original main/702/708 evidence. It starts from evidence commit `71b5d59e53889ec712015464ae5cd30446e75565`. Original PR1862 stays at702; main and other PRs are not updated. The candidate branch is `fix/respawn-ready-display-arc-20261023`.

## Production scope

The only new production file is `patches/splatoon3/runtime/weapon-handoff-motion.mjs`. The existing handoff already saves the last displayed upper body, fades quaternion transforms and evaluates gameplay muzzle queries on the unfaded native pose. Its new spawn-return condition reads the identity-bound Actor's existing lifecycle. At genuine supported landing it reuses **HANDOFF_FADE=.2s** and the existing smooth weight, arm history and left support refit. Native torso/neck motion is retained. Ready pose channels and action eligibility are evaluated immediately; no native input, spawn timer, attack gate, physics, paint or network state is delayed or written.

A fresh/held main attack, sub/special/jump/form action, active flick/charge/roll or another owner cancels this idle display return immediately. It does not seed source body/action history. Existing reset/gap/weapon-change/dispose invalidation remains in place. Three booleans in the existing WeakMap record track spawning, this display return and its chosen arc. There are no new history arrays, per-frame allocations, solvers or geometry.

The failed shortest-path prototypes rotated the drum through the floor. The final spawn-only hand display chooses the higher drum-center midpoint between the two quaternion great-circle routes to the **same native endpoint**. Only the wrist's display interpolation uses the alternate route when it raises the drum. Existing scratch values and the same saved quaternion are reused. `spawnReturnArc` is not called by ordinary source/native handoffs or attack/grip/recovery curves. Native IK/grip code, gameplay muzzle transactions, Roller runtime/detail/respawn lifecycle and708 helper remain byte-identical. Exact changed functions are `installWeaponHandoffMotion/handoff`, its `_applyPose` forwarding call, and the new private `spawnReturnArc`; see `final/change-manifest.json` and its lossless exact runtime patch.

## Rejected intermediates and measurement correction

- `521b6e497` preserves the rejected.1s prototype and its original images/tests. First landing rotation improved, but later pivot/projection jumps failed the planned half-peak check. The first comparison also mistakenly included unchanged59→60 physical travel; its script is retained. The final comparison starts at60→61 and does not lower the continuity bounds.
- `0fe71e8d1` preserves the rejected.2s shortest-path prototype. Its source30/30, actual emitted17/17 and numerical continuity checks passed, but actual image inspection exposed floor clipping to y=-1.176467. It is explicitly rejected. Its mathematical arc probe is a counterfactual, not image acceptance.
- The new source floor check initially used transformed bounding-box corners. At the native settled endpoint, a conservative box corner reached y=-.0317 while the actual round drum's lowest visible vertex was+.0559. That failed measurement and exact test are preserved. Final floor checks use actual visible vertices in both source and browser, with the same floor≥-1e-6 criterion. The old.2s normal emitted build still fails this corrected check at30Hz, actual vertex y=-.135867822. No existing regression assertion or acceptance bound is weakened.
- Early added-test harness failures handled absent disabled-handoff state and circular paint owner references. The final attack comparison includes90 updates per scenario: stationary landing/attack first, then moving contact after45 updates. This obtains real native projectile updates and paint calls rather than requiring a new stationary roller stripe. Original failed scripts/logs and the intentionally stopped rejected-prototype neighbor run remain retained; partial runs are not counted as passing suites.

## Validation and limits

Final source: **17/17**, normal emitted: **17/17**, existing weapon-hold/source-native handoff checks: **13/13**. No skips/cancels/failures. Frozen708's normal emitted build fails all five new display-return cases. The failed.2s floor case reproduces with actual vertices in both source composition (only its immutable handoff source restored; all other production inputs unchanged) and its actual normal emitted build, both at y=-.135867822. See lossless `before-vertices-*` records; the source substitution is not presented as an emitted build.

The matched native browser passes15 common normal records exactly for canonical pose channels, input/physics/spawn state, gameplay muzzle, torso/kid/root transforms, seed/palette and camera. Full final pivot/hand/drum/projection output matches the old ready at72 and145. Actual visible drum clearance is at least **+.138840WU** throughout the14 recorded return steps. The first60→61 step starts moving immediately; there is no held carry delay.

|Per-update display change|Frozen708|Final candidate|
|---|---:|---:|
|60→61 pivot rotation|174.881°|6.041°|
|Maximum return rotation|174.881°|21.530°|
|Maximum pivot translation|.253189WU|.093484WU|
|Maximum projected width change|53.145px|15.061px|
|Maximum projected height change|217.532px|66.004px|

The original half-peak bounds for rotation/translation/projected height remain enforced, with a stronger actual-vertex floor criterion added. Old peak is over60→68, final return peak over60→74; unchanged59→60 physical flight is excluded from both. The final camera and initial/145 ready are not modified to obtain these results. Unsupported ready=0 across25 unsupported native samples; the first post-touchdown canonical ready is eligible at T_SPAWN=.616666734. All no-input browser shot/paint/projectile/turf counters are0, ink100, rolling=false, flick=-1.

Normal build input hash: `88cf436138d42e7d60f2bf269f8c51d2cd809cd5d1999a7be75bb5b3039db47c`; content hash: `9ad08ece7447b3c9549a1b1566f2618b833c236d57f868434232a9bf7baad26e`. All2,110 artifact bodies were reread; actual browser runtime response bodies match that manifest. Runtime source SHA256: `40bb8177375e0a9af9acf836de474773703bf8a76dad2cf8ad21ab4ab7ec0af0`; uncompressed exact runtime patch SHA256: `deada60cab6c9a16240436b6b0e31a6293536500a844477a2f49a6ccf21b37f2`. Local Node24.19.0 versus existing CI Node22 remains recorded rather than inferred equivalent.

Final evidence is under `final/`. The native source and actual normal emitted regressions cover30/60/120Hz, immediate canonical ready/action, actual visible drum floor clearance, no-input shot/paint0, held-before-death release, fresh input during the display return, deliberately held landing attacks, exact canonical channels/gameplay muzzle/projectile/paint equality against the existing disabled-display control, unsupported landing, direct remote representation, ordinary jump/superjump, weapon/life reuse and disposal. The five new cases supplement the existing twelve; original tests remain unchanged. Direct remote representation is not real transport.

The normal build uses the standard versioned/minified production pipeline, not a minified component overlay. Its1,420 inputs and2,110 emitted bodies are bound in the manifest/readback. Only the handoff runtime input differs from the frozen708 build. Existing geometry, avatar, palette, stage and camera are retained. The small browser uses the same existing flags/timeouts,1000×760 viewport, low/ja, Player/Roller style0/0/2/0/0, seeded native death/countdown/launch/release and fixed60Hz input stepping. This is not a display-FPS measurement.

The controlled support-loss browser uses actual emitted Level/Physics with dry support at y=-8 and the original visual stage retained. It does not force grounding or lifecycle results and is not an ordinary Tidewater floor. Ready remains blocked throughout unsupported landing and is canonically available on the first post-touchdown update while its display return has started.

The previous eleven-location native evidence and original large ready diagnosis remain in `respawn-weapon-state-20261023/integration/` and `respawn-ready-pivot-20261023/`. Final settled145 retains that same existing ready; this change does not resize it. Retail Splatoon3 parameter epoch remains11.3.0, and retail motion/geometry/hardware acceptance is unverified. No blocked media or PNG403 route is retried or bypassed. Hosted CI and parent independent/visual review remain separate from these local source/build/browser results. No PR/main integration is performed.

Reproduce with a fresh output directory (the browser preserves existing evidence):

```sh
node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/respawn-ready-handoff.test.mjs patches/splatoon3/tests/respawn-weapon-state.test.mjs patches/splatoon3/tests/respawn-spawn-owner.test.mjs
node scripts/build-inkwave.mjs inkwave-public SITE
INKWAVE_BUILT_SITE=SITE node --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/respawn-ready-handoff.test.mjs patches/splatoon3/tests/respawn-weapon-state.test.mjs patches/splatoon3/tests/respawn-spawn-owner.test.mjs
node scripts/check-inkwave-respawn-ready-handoff-browser.mjs SITE OUT/browser-after
node scripts/compare-inkwave-respawn-ready-handoff-browser.mjs OUT OUT/comparison.json
```

Use the retained frozen708 `final/browser-before` for the unchanged baseline inputs. Its exact capture script is archived with rejected010; the final script adds69→74 samples without changing any native input timing. All PNGs are original captures. Matching recorded native conditions does not claim pixel-identical asynchronous full-scene particles/HUD.
