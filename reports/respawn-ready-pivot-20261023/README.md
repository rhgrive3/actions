# Ready Roller: size, landing handoff and active-owner browser check

This is an evidence-only follow-up on `70814c6dfcc20868f2c5c0eb483ccdcb9b950446`. No production, model, geometry, hair, character, grip, IK or recovery-curve code is changed. The separate candidate branch is retained; original `702ce3d`/PR1862, main and other PRs are not updated.

## Finding

The drum is not enlarged. Its intrinsic bounds are **2.089520216 × 0.431978524 × 0.431978524 world units**, with unit world scale throughout initial settled ready, landing60/61 and post-land145. Pivot local offset/quaternion and weapon grip offset are retained. Initial settled ready already obscures much of the character. The final ready anchor/rotation at61 and145 are the existing ready targets, `ANC=[-.08,.8,.28]`, `ANCR=[-2.5,.04,1]` (Float32 values are in the receipts).

The normal702 and708 records match **exactly at all eight recorded points**, including every recorded channel, layer input/output, final world pivot/drum/hand/chest transform and camera matrix. At61 the observed `_poseSpawn` call changes **zero** pose channels. There is no remaining additive calibrated spawn layer. Existing native air/body damping remains: `wAir=.670316674`, `vyS=-10.515225602`, source body state=`land`, sourceUpper=false. Ready's AFOLT/AFOLR are both1, so the final hand/weapon follows the existing chest and native velocity sway. At145 the source body is idle and air/vertical-velocity damping is nearly zero.

|708 normal point|World AABB dimensions (orientation dependent)|Projected visible drum vertices (px)|Camera world position|FOV|
|---|---|---|---|---|
|initial settled|1.6693 × 1.4030 × 1.4456|223.17 × 240.65|[.12350,3.95401,-31.25192]|70.24081|
|60|2.0803 × .5010 × .9163|188.19 × 68.16|[-.93641,3.80751,-33.35321]|70.21187|
|61|1.5855 × 1.7144 × 1.1314|241.33 × 285.69|[-.94733,3.65418,-33.29531]|70.21418|
|145|1.2034 × 1.7914 × 1.4392|164.39 × 275.07|[-.90792,3.95032,-33.54604]|70.24078|

The projected bounds use all vertices of the visible drum Mesh and caps, before occlusion by the character, scene or screen clipping. World AABB changes with rotation; it is not intrinsic size. No geometry is generated, removed or edited for this measurement.

A numerical cross-projection holds frozen actor-root-relative drum vertices constant and swaps the recorded actor-root-relative cameras. It does **not** move a live rig or rerender a counterfactual. Actual61 is46.81% wider and3.86% taller than145. For the frozen61 pose, camera61 versus camera145 adds10.18% width and9.94% height. Holding camera145 fixed, pose61 versus pose145 adds33.24% width and reduces height by5.53%. These factors compose; the result is not purely perspective. `comparison.json` retains all nine cross-projections and exact matrices.

**There is a real abrupt handoff:** the final world pivot rotates174.881° from60 to61 in one fixed tick, translating.25319 world units. The next tick rotates1.331°. Original main's same60→61 rotates only13.110°; its existing late timer-based ready switch at133→134 rotates153.212° in one tick. Initial settled and post-land145 full recorded output match main exactly, including final pivot and camera. Thus702 advances an existing discrete ready selection into a different landing body/camera state, producing a new abrupt change at the landing tick with a larger world rotation. It is not sufficient to dismiss this as an old pop or pure perspective.

At60 the native flight branch poses the character before `_resolve` and `finishLanding`; the calibrated spawn display is then retired. At61 the existing Roller ready selector writes its target immediately, with no carry-to-ready blend. This is a discrete pose transition, not an intermediate enlarged drum. The708 active-owner fix does not introduce or change this normal landing handoff. Whether702's earlier ready handoff is visually acceptable remains unresolved; no model or curve correction is attempted here.

## Small native browser check

Real offline Game/Actor/Character/runner/rendering from normal versioned, minified build output; no component overlay. Chromium uses the existing four flags and timeouts: `--no-sandbox --disable-dev-shm-usage --use-angle=swiftshader --enable-unsafe-swiftshader`, menu240000ms, PNG30000ms. All runs use the same1000×760 viewport, low/ja, Player/Roller, hair0/hat0/skin2/outfit0/eyes0, RNG0x52455350 reset before the native match, and the same native death/countdown/fire-launch/release timing. Observers forward native calls and snapshot only selected frames. Fixed60Hz stepping is input control, not display FPS.

The support-loss case launches natively toward y=0, then replaces only collision support with a real emitted `Level`/`Physics` dry floor at y=-8. The original stage visual is retained, so its screenshots show the underside of the stage. Positions, phase, ground probes and collision outcomes are not forced. This is a controlled missing-support fixture, not an ordinary Tidewater floor or a transport test.

- 702 versus708: **85 native trace points** match for every serialized field listed in `comparison.json` (position/velocity, grounding, lifecycle, input, spawn timer/pose, ink, turf and runner/action counters). Corresponding miss cameras also match. All three builds also match the eight normal native-state/camera records exactly.
- 702 permits premature ready for **4 updates** in this browser path.708 permits **0**. Its first unsupported retired-pose point is y=-6.687921178, phase=landing, grounded=false, T_SPAWN=.533333480; ready remains blocked.
- Actual supported touchdown is y=-8 with lifecycle absent and eligible=true at T_SPAWN=.600000083. As in normal60, the character was posed while the lifecycle still owned that update. The **first subsequent normal character update** is ready at T_SPAWN=.616666734; there is no1.4-second wait. Its full recorded output converges exactly to702's same supported frame.
- No-input snapshots and the complete miss traces in both builds: native fire calls0, paint-splat calls0, projectiles0, turf0, ink100, rolling=false, flick=-1. Native gates and physical landing are unchanged by708. Intentional fresh/held attacks and other rates/weapons/remote/reset conditions remain covered separately by708's existing source12/12, actual emitted12/12 and focused76/76; this small browser probe does not repeat or replace those tests.

The browser's85 points/four premature ticks differ from the earlier isolated Actor replay's88 points/six premature ticks because this is a complete second native respawn with a different native trajectory. Both are preserved; they are not relabeled as the same input experiment.

## Read paths and evidence

Read source paths/functions: `patches/splatoon3/runtime/roller.mjs::_poseWeapon` (available/ready assignment only), `spawn-pose-motion.mjs::_poseSpawn` and `spawnMotionAllowsAction`, `respawn-lifecycle.mjs` flight/landing/finishLanding ordering, and `inkwave-public/src/game/character.js::_pose`/`_applyPose` (source body, chest following, velocity sway, final native arm solve). Recovery curves and grip/IK implementations are not edited.

`702/`, `708/` and `main7e/` contain the raw PNGs, complete receipts and lossless normal build manifests. Each receipt records the actual four served runtime response body hashes; the comparison verifies HTTP200 and exact body hashes against that build's artifact manifest. Build identities and complete final transforms are in `comparison.json`. These are actual normal emitted sites, not source modules with a minified component substituted.

`executed-702-708-browser.mjs.gz` preserves the exact first successful capture script, including an inert redundant timer-array existence check. The committed script removes that check and adds normal-only original-main support. The first original-main attempt failed because the new observation helper does not exist in main; its exact script (verified against its recorded hash), receipt, PNG and log remain under `main7e-first*`. The read-only observer now falls back to main's existing native timer predicate. Failed data are excluded from comparisons. PNGs are originals, not edited composites. Equal recorded matrices do not assert bit-identical asynchronous full-scene screenshots.

The first comparison mistakenly required exact equality of intrinsic bounds computed by vertex→world→inverse-drum round trips under different poses. Its script/log are preserved in `compare-first*`. The measured round-trip difference is at most7.11e-15 world units; the final verifier uses1e-12 for only those derived bounds and world-scale unit checks. Native fields, cameras, corresponding702/708 normal rows, and main/candidate initial/145 full outputs still require exact equality. No existing regression, assertion or acceptance threshold is removed or changed.

Reproduce (use fresh output paths):

```sh
node scripts/check-inkwave-respawn-ready-pivot-browser.mjs SITE_702 OUT/702
node scripts/check-inkwave-respawn-ready-pivot-browser.mjs SITE_708 OUT/708
node scripts/check-inkwave-respawn-ready-pivot-browser.mjs SITE_MAIN7E OUT/main7e --normal-only
node scripts/compare-inkwave-respawn-ready-pivot-browser.mjs OUT OUT/comparison.json
```

The earlier eleven-location normal native evidence remains in `reports/respawn-weapon-state-20261023/integration/`; this smaller pose/camera diagnosis adds focused support-loss coverage. Retail Splatoon3 parameter epoch remains11.3.0; no new retail hardware pose/trajectory comparison was available, and no403 media route is bypassed. Hosted CI, parent independent review and visual acceptance remain separate from the local source/build/browser results. PR1862/main updates remain held by the parent.
