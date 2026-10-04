# Conditional gear and sub-defense: #342 / #343 / #344 / #345

Public baseline: main `404c66c858cfea14e81225fb6364febcf2c9c528`, rechecked
2026-10-04. Public inputs are identical to the available `0859bf4f` source;
intervening main changes are confined to the modeler. Upstream files are unchanged.

## References and what is actually established

- [Nintendo update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/~/splatoon-3-update-history):
  v5.0.0 reduces Last-Ditch Effort's maximum from2.4 to1.8 primary abilities;
  v1.2.0 excludes new Comeback activation after water/fall deaths; v3.1.0 adds
  30AP Intensify Action to Opening Gambit and changes extensions to15 seconds.
- [Pinned ability calculator](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/ability.html):
  EndAllUp uses18AP after v5; ComeBack adds10AP to six abilities; StartAllUp lists
  30AP run/swim/resistance. Its omission of Opening Gambit's fourth ability is
  explicitly corrected by the later official v3.1.0 rule, not silently treated
  as a complete current list. The descriptions specify opening/final30 seconds.
- [Pinned gear traits](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/spl__GearSkillTraitsParam.spl__GearSkillTraitsParam.json):
  EndAllUp/ComeBack/StartAllUp are head-only. ConsistsOfChip is an exchange recipe,
  not a list of combat effects.
- [S3 verification wiki](https://wikiwiki.jp/splatoon3mix/%E3%82%AE%E3%82%A2/%E3%82%AE%E3%82%A2%E3%83%91%E3%83%AF%E3%83%BC/%E5%88%86%E5%89%B23)
  and [Comeback mechanics](https://splatoonwiki.org/wiki/Comeback#Mechanics)
  corroborate the windows and six10AP effects. Comeback20 seconds is community
  specification, not a newly extracted timer constant or new physical measurement.
- [Nintendo Sub Resistance description](https://splatoon.nintendo.com/ca/news/squid-research-lab-dives-deep-into-the-splatlands/)
  describes mitigation of enemy sub effects. Pinned11.3.0
  [params.json](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json)
  gives DamageRt_BombH=[0.5,0.75,1] High/Mid/Low. The existing pinned source hash
  and three profile bindings are retained/added in the numeric reference.
- The [Splat Bomb verification table](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B5%E3%83%96%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E3%83%9C%E3%83%A0)
  specifies far30→28.5/25.4/15 at3/10/57AP, with lethal near180 unaffected.
  The numerical curve is not applied to the near band merely because its name
  contains BombH. World-distance calibration is unchanged.

## Public implementation

The actual build adapter and runtime installers, not raw upstream alone, own
these changes. Three abilities are head-main only; Sub Resistance is stackable.
Native selects use the same normalization rules and persist to the existing
loadout storage. Permanent AP are never edited by a temporary bonus.

`conditional-gear.mjs` owns independent conditional windows:

- Last Ditch: final30 seconds of the actual90/180-second Turf match; three ink
  abilities+18AP. No Anarchy count/overtime subsystem is invented.
- Comeback: successful enemy-caused respawn starts20 seconds; six abilities+10AP.
  Initial spawn, no attacker, allies, water/fall do not start it. Pause does not
  consume the window. Each legitimate subsequent enemy respawn starts a new one.
- Opening Gambit: four abilities+30AP from actual play start, with each distinct
  legitimate splat/assist adding15 seconds while active. Expired windows cannot
  restart. Intro/countdown/attract do not consume it. Respawn preserves its
  match-relative deadline; a new match resets it.

Assists reuse Flow's existing victim credit history via a notification; no second
assist-history tracker is created. The existing5-second credit window is retained,
not reasserted as newly measured. Per-victim-life receipts prevent duplicate
Gambit extensions. Later PR317 composition uses its authoritative helper list.

Transient refresh reuses weapon identity and action clocks, restores cost fields
from pristine data, then evaluates effective AP once. Filled special-gauge fraction
is preserved across a temporary charge-rate change. The optional rollInk reset
slot allows PR318's separate main-efficiency consumer to compose without repeated
discounts; the standalone branch does not duplicate #346's cost implementation.

Sub Resistance classifies the current native far band before armor/networking,
transports the internal `splat-bomb-far` tag, and applies the defender's AP only in
the authoritative Actor damage path. Native damage/death events retain `bomb`.
Near180, main/special/ink damage, allies, cover and invulnerability are unchanged.
No gear is applied at the sending proxy, avoiding sender/victim double reduction.
An old build that never sends the new band tag cannot convey that new information;
mixed-build/latency-injected real-peer acceptance is not claimed.

The standalone final sub-HP boundary rounds to0.1 only after defensive modifiers
and armor. If PR321's final-damage owner is installed, this narrow fallback is an
identity and that existing global owner alone quantizes the result.

## Explicit unresolved Comeback boundary

There is no verified reference for an already-active Comeback followed by an
environmental death and another respawn before the original20-second expiry.
This implementation conservatively clears the old-life buff on death and grants
another20 seconds only for a qualifying enemy death. That safe state choice is
tested but **is not asserted to match Splatoon at this rare residual boundary**.
The exact launchpad-animation frame at which the20 seconds begins is also not
physically calibrated. The selected integration starts after native respawn returns.
Do not describe #343 as completely identical or all its edge conditions resolved.

## Reviewed composition, not an automatic clean merge claim

Actual production files were read and combined from:

- PR315 `ab951ea408797f54c03c41ff8d5112bd1531217c`
- PR323 `07e6ee0b46be88aa7095fd305f273acb9ba9ca1d`
- PR327 `b32201c7a4387b0b8a2fd4bf71aff5a34bfecabb`
- PR321 `83925b327c649eb8904232cfdd7f811885481f84`
- PR330 `ddb98f8d912fec1d7085d87aaee2344af2ba2a8f`
- PR340 `1212486effa1b6421f6564971ba14fea31d08113`
- PR341 `f81652b6fb478241a54c3676d33d3c030a186133`

PR317 `5960bac2` contributes its exact shared-assist Flow method only, not a full
all-files merge. PR318 `c6b13fde64486d21d7209cebee91a26671cbb516` contributes the
#346 rollInk cost-list entry and its two native payment-boundary changes only.

Manual resolutions preserve all independent installer hooks/reset bookkeeping,
union profile bindings and primary numeric fields, keep PR315 action-speed/grace,
PR323's sole Ninja multiplier, PR327 actor-local sub cost/power and PR340's Roller
refill mode. Flow AP are added before conditional AP in the single effective-AP
refresh path; both cap at57. The old speed multipliers are identity. Flow's
separate cached refresher is not allowed to overwrite conditional AP afterward.

The composed NetMatch adapter must continue past PR321's network block into
PR323's visibility block; retaining an early return silently omits visibility bits.
The composed HUD test setup uses PR323's actual enemy-death eligibility/history
instead of the obsolete previousLifeNoSplat field. No production check is weakened.

Cross tests demonstrate Flow+Gambit57AP; Comeback+Flow40AP run/swim with10AP ink;
independent clocks; real PR330 retained gauge and finite armor; PR321 rounding;
PR327 per-sub cost; PR340 refill-state preservation; and PR318 rollInk repricing.
No other PR's production feature is copied into this standalone branch.

## Verification and remaining visual limits

- Standalone dedicated16/16 source and16/16 emitted/minified public graph.
- Complete gameplay/reliability758/758; no failures/skips, from persistent cwd.
- Reviewed combined regression group110/110; final cross-feature group21/21.
- Added native Chromium/WebKit menu checks for all four options, illegal slots,
  storage persistence and reopen. These await exact-head Actions, not a local GPU claim.
- 30/60/120Hz fixed schedules agree on window expiry and restoration.
- Node/CPU composition is distinct from browser rendering and physical Switch
  comparisons. Public browser evidence is supplied by exact-head CI after publication.

90-second matches, Flow death/lifetime rules, world scales and unimplemented game
modes remain unchanged. No merge, deployment or issue closure is performed.
