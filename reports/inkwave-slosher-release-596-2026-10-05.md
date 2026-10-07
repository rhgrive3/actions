# Slosher release presentation, Issue #596

Baseline: main fc057af9baac421ec707504f4637e2ed8824a444 (PR #587). No source PR is required for this independent local handoff; integration publication is coordinated separately.

## Root and change

`weapon-motion.mjs` previously mapped actual windup completion to native curve age .13. Native Character has bucket Y/Z = -.22/-.34 and pitch -.55 at that key; its heave envelope has barely started. The existing .25 key has Y/Z = .24/.04, pitch 1.5 and full heave weight. Map the same 12F release to .25 and compress existing recovery into the unchanged 29F interval. Existing detail translation scaling remains .45 in Y/.6 in Z. These are project-native rig curves, not extracted Nintendo joint values.

The existing accepted weapon:fire event now marks an active Slosher presentation released. Native remote NetMatch replays that event, while its snapshot slosh flag can still be zero. The released track and bucket drain continue forward rather than rewinding to stale windup. Duplicate events cannot restart an active released track. Reset, weapon change, death, squid form, admitted sub and active special do not revive canceled presentation. A fire event without an active trigger track does not invent a new animation; missing/reordered trigger delivery is outside this narrow correction.

## Gameplay and launch geometry

No weapon parameter, network packet, hair source, damage or input admission code is edited. A narrow Slosher-only muzzle obstruction guard is added as described below. Real local Actor -> Runner -> Projectiles still emits nine units at input-relative simulation frames 12, 41 and 70. Display partitions 30/60/120/144 Hz give the same results. PR #493 owns the separate swim-to-human admission correction and is not duplicated here.

However, native Projectiles obtains its muzzle from the actual Character rig before the current frame's final pose update. Retiming a rig changes that pose-derived launch origin. With this fixture's identical actor/aim, the first birth position changes from [-0.0745599373, 0.6722599806, 0.2112486289] at the old .13 mapping to [-0.1094454837, 0.7135593413, 0.4803789067] at .25 (about .2745 world units). The counterfactual changes only the mapping constant over the same production installer. This is not absolute physical calibration. The native emitter and distance fallback are retained in free space; the additional full-segment guard below closes a wall-sliver regression exposed by this retiming. Browser outcome equivalence has not been measured. Do not describe this as geometry-neutral.

## Validation

- Existing actual Character weapon motion + detail regression: 23/23.
- Dedicated actual production source fixture: 4/4, covering 12F/29F, native raised pitch, native remote event replay with stale flag, duplicate release, six cancellation states and four display partitions.
- Actual emitted production build c7390398ebcd: dedicated 4/4. Real source modules are adapted only in source mode; emitted mode loads built bytes without reapplying adapters.
- Actual pose channels, finite skeleton/muzzle and single native heave impulse are exercised. GPU rendering, screenshot comparison and Switch recordings are not claimed. Wall-adjacent source/emitted acceptance is limited to the explicit cases below.

The public Slosher reference describes the big ink glob after the bucket lift (https://splatoonwiki.org/wiki/Slosher; https://splatoonwiki.org/wiki/Template:Slosher_data_S3). That is supporting community description, not primary engine animation data. The concrete fix is grounded in the project's own native raised key and the existing 12F release. No guessed Nintendo angle or timing coefficient is added.

## Wall regression and required guard

The first actual emitted wall test failed at wall-front z=.45: the new muzzle at z=.4804 was inside the wall. Native `Physics.los` intentionally omits the final .05 world units, so this is a real compatibility regression from the retimed pose, not a successful acceptance of the initial patch. That intermediate candidate must not be accepted alone.

The corrected candidate retains native `_muzzle` first, then for Slosher alone queries the existing full `Physics.segment` from the same native body origin to the returned muzzle (with the native grate exclusion). If blocked, it uses the existing .3-forward fallback only if that full segment is also clear; otherwise it returns the body origin. It does not fix the normal muzzle to a constant position, add an arbitrary collision epsilon, change trajectory/radius, or cancel/admit a projectile. Other weapon kinds return the native result unchanged.

Final build **3b558da2494a**: source motion/detail/release **29/29** and actual emitted release **6/6**. Front distances .31/.35/.45/.55/1.7 all birth before the wall and all nine real native projectiles impact exactly once. Thin (.002 total thickness), thick (2), angled45-degree, wall-parallel and an obstructed fallback case use a clear full segment. Free-space birth coordinates, release12/41/70, count9 each and repeat remain those reported above. The failed .45 test is preserved as a negative against the earlier build.

`Physics.raycast` explicitly ignores boxes containing its origin. If the actor body origin is itself inside solid geometry, this guard does not eject it or guarantee a safe birth. Correcting that invalid placement would require a separate movement/penetration owner change. GPU/browser wall acceptance and exact Nintendo muzzle locations remain open. This correction has a real launch-geometry effect and must not be labelled presentation-only.
