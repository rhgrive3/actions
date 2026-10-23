# Respawn landing weapon state — review checkpoint, 2026-10-23

> Historical pre-coordination checkpoint. The parent subsequently assigned these shared paths and authorized applying the candidate. See [the applied candidate and normal-build results](integration/README.md). The exact original checkpoint is preserved in `integration/checkpoint-README.md`; the pending wording below describes that earlier stage.

**Pending parent coordination; runtime patch is unapplied.** Branch `fix/respawn-weapon-state-20261023` is based on official main `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51` (tree `965c98442df0c42cd092f7a6eb9b0535f51b8b38`, includes #1858). The four production files remain byte-identical to that base. There is no published candidate, PR, merge or force push from this task.

The delegation explicitly requires: “Coordinate specific shared actor/roller state paths with the parent before editing overlapping areas.” A coordination question for the narrow spawn gates was sent during work and remains **pending**, not denied. The patch below is concrete and reviewable, but has not been applied to those shared runtime paths. Enemy exclusion/collision and #1856's recovery curve/helper/grip are outside this task and unchanged.

## Cause reproduced

Native Actor death → real respawn countdown → Turf Squid Spawn aim → fresh launch press → release → flight/descent → supported landing was reproduced with the full emitted Game in Chromium, as well as the production Actor/Character with the real source animation bank.

With no attack held at landing, `WeaponRunner.rolling=false`, `flick=-1`, firing/charge/ink consumption/projectile births/paint are all idle. This report does **not** reproduce unintended native rolling or paint in that no-input case. Instead, the Character uses the low legacy Roller carry pose after landing: `roller.mjs::_poseWeapon` excludes the normal ready pose until `T_SPAWN >= 1.4`. The modern `spawn-pose-motion.mjs` owner already retired on land, leaving the obsolete timer gate to select the wrong underlying carry for roughly another 1.2 seconds. `roller-detail-motion.mjs` also suppresses a valid fresh flick using that obsolete spawn gate.

There are two related lifecycle findings:

- Character `wRoll` survives Actor.reset, even though native runner state resets on death/respawn. A real pre-death roll leaves a small residual blend after flight. The candidate clears this presentation-only blend at the life reset.
- `respawnRearm` release observation runs only after the Squid Spawn early returns. A genuine release and fresh launch press during aim/flight can therefore remain classified as a stale pre-death hold at landing. The candidate observes genuine physical releases during spawn without calling the weapon runner or producing an airborne launch shot. Physical input remains authoritative over filtered intent (for example, map input filtering).

Read paths: repository `AGENTS.md`; `scripts/build-inkwave.mjs`; `scripts/inkwave-source-composition.mjs`; `inkwave-public/src/main.js`; `src/game/{actor,weapons,player,character}.js`; `src/game/motion/source-controller.js`; `patches/splatoon3/{adapter,respawn-lifecycle-adapter}.mjs`; runtime `{install,respawn-lifecycle,spawn-pose-motion,hit-spawn-motion,roller,roller-detail-motion,source-weapon-owner,action-admission}.mjs`; local input adapter and existing source/respawn/roller/remote fixtures. Paths starting `src/` above are under `inkwave-public/`, not the separate `game/` prototype.

Official reads: GitHub `branches/main`, `pulls?state=open&per_page=30`, `pulls/1856/files`, then `branches/main` and `pulls/1856` again. #1854 `2e8d90b8afb6aac057edfbb988fae789ef36cfd3`, #1855 `7b80097836e96baee170a6da8584750c9c0c1c56`, #1856 `cf9c9d8956accac7ca6e9e9678860c1a8910c7f2`, #1857 `d7cc9dd3aecc9dcc70cf38372fc045f03a6aa68d` were preserved. Final official read still shows main `7e027ac2f` and open #1856 at that same head. No native subagents were launched.

## Reserved narrow patch

[`candidate-unapplied.patch`](candidate-unapplied.patch) passes `git apply --check` against the base and changes only:

1. `patches/splatoon3/runtime/spawn-pose-motion.mjs`: read-only spawn-action eligibility from the existing presentation owner, with the legacy timer fallback for unsupported/disabled presentation; reset `wRoll` at Actor.reset.
2. `patches/splatoon3/runtime/roller.mjs`: replace only the `_poseWeapon` spawn eligibility conjunction, plus its helper import. No recovery curve or grip edits.
3. `patches/splatoon3/runtime/roller-detail-motion.mjs`: replace only the corresponding spawn interruption test, plus its helper import.
4. `patches/splatoon3/runtime/respawn-lifecycle.mjs`: observe actual physical releases during spawn aim/flight. No collision, target validation, landing movement, armor, authority, packet or weapon clock edits. The loop adds no per-frame arrays/objects.

[`candidate-transform.mjs`](candidate-transform.mjs) is a **review-only VM source transform**, not installed production code. `review-originals/*.mjs.gz` preserve the exact original bodies; `candidate-emitted-manifest.json` records original, candidate source, and minified module SHA256 values. The normal builder was used for the baseline; candidate modules were composed and minified separately with the same esbuild options, then tested as explicit overlays. This is not a normal candidate build identity.

## Verification and evidence boundaries

- Baseline normal build succeeded, content hash `ac27ae5f27169f2267a85d4bed904677d26f5e0aab10910c7181e4459f453f30`. Startup budget and quick patch checks passed. These logs describe the unchanged base, not a completed patched build.
- New regression on the actual baseline minified modules: **1 pass, 7 fail** (`regression-emitted-before.tap`). The earlier 6-case source suite and intermediate verifier failures are preserved separately.
- Review candidate: source **8/8** and actual minified module overlay **8/8**. Cases cover 30/60/120 Hz actor updates, no input, real pre-death rolling then release, fresh post-land flick and exact native release delay/curve, fresh launch press held through landing, Shooter/Charger/Splatling/Slosher/Dualies idle and intentional attack, repeated life/reset/weapon change/dispose, direct accepted remote trigger plus sampled landing representation, physical-versus-filtered release, and disabled presentation fallback.
- `regression-source-final.tap` and `regression-emitted-final.tap` each pass **8/8**, extending the earlier 8-case result to use the actual native `superJump()` charge/flight/landing rather than a synthetic owner-presence check. See their recorded result; no test/assertion from the existing repository was weakened.
- Existing unchanged-base respawn/remote/spawn-pose/post-release/startup contracts: **60/60**. These are baseline contracts, not a claim that the unapplied patch has passed every existing suite.
- Full native browser: Playwright menu pointer clicks → normal Turf match → normal opening spawn → native death/countdown/respawn. Public debug input feeds the real controller, and `_frame` advances fixed 60 Hz simulation. No forced respawn phase, runner state or landing support. This is offline fixed simulation, not display FPS or network transport.
- [`matched-native.json`](matched-native.json) confirms identical setup and 11 matched checkpoints: same palette, native avatar seed `477166624`, existing hair/gear, camera, input timing, positions/velocities, support, actual runner state, ink, shot/paint counts and original spawn timer. Eight PNGs per side are preserved in `browser-before-controlled/` and `browser-candidate-versioned/`.
- At flight capture 61 (first post-touchdown update), baseline weapon rotation is `[0.8,0.1,0]`; candidate is the existing ready rotation `[-2.5,0.04,1]`. Both match the normal ready stance at capture 145. Both keep no-input shots/paint at zero. The actual airborne state and physical landing stay equal.
- The browser candidate is a **diagnostic minified versioned-module overlay** on the normal base Game. `browser-candidate-versioned/receipt.json` records the exact four `/_versions/cb7ef24.../patches/...` URLs served. It proves this narrow native presentation transition; it does not certify a normal patched build or final visual acceptance.

Preserved unsuccessful/intermediate runs: `browser-before-initial` failed the menu animation stability wait; `browser-before-pointer` established native baseline; `browser-candidate-overlay` failed to cover the actual versioned runtime and therefore still showed the old pose, and is **not** counted as a fixed browser result. Source candidate intermediates include an overly strict residual blend check and incomplete remote fixture setup; the resulting failures and exact scripts are retained in `intermediate-scripts/`. The final regression keeps exact 1e-6 pose comparisons and native attack-curve/delay assertions.

All original/intermediate PNGs, normal baseline build, emitted overlays and executable proof scripts remain in `/workspace/scratch/respawn-weapon-20261023/`. The repository report copies the matched images and raw results needed for review. The baseline `inkwave-build.json.gz` preserves input/output identities.

## Comparison with Splatoon 3 and remaining work

Reference parameter epoch is the repository's pinned **Splatoon 3 11.3.0**. Conditions here are standard Roller, empty/default abilities, native existing avatar, no attack at landing, plus deliberate new attack conditions. The official Nintendo [Splatoon 3 page](https://www.nintendo.com/jp/switch/av5ja/index.html) was reachable; it does not publish a measured joint/timing curve for this transition. Existing [spawn calibration provenance](../../patches/splatoon3/reference/spawn-pose-calibration.md) explicitly distinguishes original rig calibration from retail motion. No same-condition retail/console recording, exact retail-frame matching or retail visual approval is claimed.

**Pending:** parent coordination for the four reserved runtime paths, especially the shared Roller spawn gate and respawn input state. After that, apply the patch on this branch; run the new test without transforms against source and a fresh normal candidate build; run the existing contracts against that candidate; rerun matched native browser without an overlay; update the canonical behavior report and CI registration as appropriate; then package a scoped candidate commit/PR and perform official ref/tree/blob readback. No GitHub write was attempted, so this is neither a denied write nor an uncertain write outcome.
