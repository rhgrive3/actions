# Applied respawn landing weapon candidate — 2026-10-23

The parent resolved shared-path coordination and assigned this narrow change. This is the applied candidate on `fix/respawn-weapon-state-20261023`, based on official main `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51`. Main and other PRs are not integrated or modified. The original pending checkpoint, unapplied patch, component overlays, failed/intermediate verifiers and images remain preserved in the parent report and `checkpoint-README.md`.

## Behavior and scope

After a native death, respawn countdown, Squid Spawn launch/descent and landing with attack released, the runner correctly has rolling=false, flick=-1 and no firing/paint. The bug was the Character's old `T_SPAWN < 1.4` eligibility checks: the current spawn presentation had already ended, but these checks still excluded the existing raised Roller ready pose and a legitimate fresh flick. Actor.reset also retained a small old wRoll display blend.

`spawnMotionAllowsAction` reads the existing presentation owner instead of rewriting any timer. Disabled/unsupported spawn presentation retains the native caller's gate. Actor.reset clears wRoll only. Roller `_poseWeapon` and detail `interrupted` replace only their obsolete spawn predicate.

The existing respawn input rearm filter now observes genuine physical releases during aim/flight. This intentionally fixes stale-hold classification for a release and fresh launch press held through landing. It does not invoke the weapon runner while spawn owns the body, manufacture an airborne flick, change weapon admission functions, windup/cooldown/emerge delays, ink costs, projectiles, paint, physical movement, invulnerability, network packets or authority. Filtered false intent cannot rearm a physically held trigger.

Production scope is exactly four files and five function bodies, listed with Git blob and SHA256 hashes in [`runtime-change-manifest.json`](runtime-change-manifest.json). The precise applied runtime diff is [`runtime-applied.patch`](runtime-applied.patch), SHA256 `63e3edf7ba951b6e469f899838af309f7e86b5b4aad46bda30640f1cb3b46dd8`.

- `spawn-pose-motion.mjs`: existing Actor.reset wrapper; new read-only spawnMotionAllowsAction.
- `roller.mjs`: Character._poseWeapon spawn conjunction plus import.
- `roller-detail-motion.mjs`: interrupted spawn conjunction plus import.
- `respawn-lifecycle.mjs`: existing Actor.update wrapper, physical release observation before spawn early returns.

All Roller runner/curve code before `_poseWeapon` (69,101 bytes, SHA256 `91de06b13de33ce6b35b9f1b95d6446f8353200e7eea97f79ba35f996d331d48`) and the setWeapon/grip/flick tail (2,874 bytes, SHA256 `50cae42006314cbfcc11c5ddf4b088beb0f19e0d9ddbd08d1fc4e5ad3818793b`) are byte-identical to main. No #1856 recovery/Hermite helper/grip change is incorporated. See [`protected-sections.json`](protected-sections.json).

Current official main/open PR metadata and changed paths were reread before applying. #1854/#1855/#1857/#1859 use other runtime paths. #1860's spawn exclusion, collision/team adapter, transport and network work is untouched. #1856 shares roller.mjs but its recovery changes are outside this candidate's predicate. Main's #1858 static-menu adapter/test remain byte-identical; [`preserved-static-menu.json`](preserved-static-menu.json) records their hashes.

## Normal production build and verification

The earlier checkpoint used review-only VM/minified-module overlays. **The applied candidate below uses the ordinary production builder and independent full versioned site, without overlays.** Local runtime is Node 24.19.0, installed esbuild 0.28.2 and Chromium/SwiftShader. Hosted CI uses the repository's existing Node 22 setup and is a separate result.

- `node scripts/build-inkwave.mjs inkwave-public /workspace/scratch/respawn-weapon-20261023/integration-site`: success. Input hash `18f8d3566ffd8285705333d621392687402ce51b378add1eae7722ad087d60c5`; content hash `f4e8d88d57e6d32b1de97d204628680d39b36ec23a2e586d0b73e9482cf67ac2`.
- All **1,420 input identity entries** and **2,110 emitted artifact entries** are retained in `normal-inkwave-build.json.gz`; all 2,110 emitted artifact bodies were reread and SHA256 checked against the manifest (`build-identity.json`).
- Startup budget and quick patch checks pass (`budget.log`, `patch-check.log`). No native timing/FPS claim follows from these deterministic file gates.
- New regression, direct source with no transform: **8/8 pass** (`source.tap`). Same new test against this normal minified emitted site: **8/8 pass** (`emitted.tap`).
- Existing respawn/remote/spawn-pose/Roller post-release, startup, detail, vertical, grip, folding and movement suites: **101/101 pass**, no fail/skip/cancel (`focused-source.tap`).
- Exact current new test against the original normal minified baseline fails **7/8** as the failing-before control (`old-emitted-failure-control.tap`). Historical component controls remain separate in the checkpoint.
- Direct-source/build identity/object QA/workflow admission contracts pass **72/72**, no fail/skip/cancel (`contracts.tap`).

The eight new regressions cover 30/60/120 Hz actor updates; no input; actual held pre-death Roller then release; fresh post-land flick and exact native attack curve/release delay; deliberate fresh launch press held through landing; Shooter/Charger/Splatling/Slosher/Dualies idle and intentional firing/charging; ordinary jump and actual superJump charge/flight/landing; repeated death/reset/weapon change/dispose; direct accepted remote spawn/land representation; physical-versus-filtered release and disabled addon fallback. The remote representation check is a native direct event/sample test, **not real transport**.

The source/emitted regressions are registered as separate steps in the existing object presentation workflow. Existing gates, assertions, timeouts and unrelated workflows remain intact.

## Matched normal native browser

`check-inkwave-respawn-weapon-browser.mjs` enters a normal Turf match using menu pointer input, completes the real opening spawn, invokes native splat, lets the ordinary countdown respawn the player, and drives a launch tap through public debug input and the real controller. There are no forced respawn phases, runner states, position/support flags or animator replays. Fixed 60 Hz Game._frame stepping is explicitly distinguished from display FPS.

Two independently built sites were captured without module overlays. [`matched-native-normal.json`](matched-native-normal.json) passes **11 checkpoints / 16 PNGs**. Palette, existing avatar/gear and seed `477166624`, native camera, simulation/input timing, positions/velocities, support, runner state, original spawn clock and native shot/paint/ink values match exactly. Both sides have native projectile/shot/paint counts **0**, rolling=false, flick=-1 and ink=100.

The first post-touchdown update (capture 61) changes only the intended weapon carry: baseline rotation `[0.8,0.1,0]` → existing ready rotation `[-2.5,0.04,1]`, while the real spawn timer stays young. The airborne samples and physical touchdown remain equal. Both are in the same normal ready stance by capture 145. Images are in `native-before/` and `native-after/`; their SHA256 values are included in the comparison.

The native browser recorded the exact four `/_versions/.../patches/splatoon3/runtime/...` responses per site plus root diagnostic imports. All **14 response bodies** match their respective normal build manifests (`native-runtime-byte-identity.json`). This avoids the historical checkpoint's root-only overlay mistake.

Reproduce the normal candidate capture and comparison with a fresh output directory:

```sh
node scripts/check-inkwave-respawn-weapon-browser.mjs /workspace/scratch/respawn-weapon-20261023/integration-site /workspace/scratch/respawn-weapon-20261023/repeat-native-after
node scripts/compare-inkwave-respawn-weapon-browser.mjs reports/respawn-weapon-state-20261023/integration/native-before /workspace/scratch/respawn-weapon-20261023/repeat-native-after /workspace/scratch/respawn-weapon-20261023/repeat-matched-native.json
```

## Remaining acceptance

This confirms the reported INKWAVE lifecycle defect and matched native no-input transition. It is not complete retail visual acceptance. Parameter reference remains the repository's pinned Splatoon 3 **11.3.0**; the official Nintendo page and existing spawn calibration provenance do not publish this joint/time curve. Same-condition retail footage and exact retail trajectory/frame comparison remain unmeasured. No blocked Nintendo photo/video route was bypassed.

The scoped candidate is prepared for a Draft PR. Official branch/ref/commit/tree and selected changed blob bytes are checked after publication; the immutable commit results and exact-head CI status are returned in the PR body and to the parent. Hosted CI is separate from the local source/emitted/browser results above. No main merge, force push or unrelated PR edit is authorized or performed.
