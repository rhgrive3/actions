# Tenacity owner-side passive gauge

Refs #392. Baseline main 83d6b088246f760a34d0921c118482bca7cde777;
public runtime is inkwave-public, modified only by the production build adapters.
No raw source, hair/model assets, existing CI gates or match duration changes.

## Sources and scope

Reference target: Splatoon 3 11.3.0. The pinned primary extraction
[GearSkillTraitsParam](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/spl__GearSkillTraitsParam.spl__GearSkillTraitsParam.json)
confirms MinorityUp is Head-restricted. Its ConsistsOfChip list is crafting
material, not three granted abilities. No implicit stat buffs are added.
[Issue #392](https://github.com/rhgrive3/actions/issues/392) specifies rates
0/3.26/5.44/7.59 baseline special points/second at active-player deficit 0/1/2/3.
The cited [Tenacity mechanics](https://splatoonwiki.org/wiki/Tenacity) describe
alive/colored team icons and Special Charge Up independence. These numerical
rates are the issue's documented target, not newly measured Nintendo frames.
The extracted traits do not independently prove the rate table. Physical timing,
special/super-jump edge cases and latency-injected peers are not newly measured.

## Root and correction

The registry and normalizer reject Tenacity and Match has no team-imbalance
charge source. The adapter adds one non-stackable head-main selection using the
existing saved-gear handler. A normalization wrapper sanitizes Tenacity before
calling the original rules, then restores only valid head-main placement. This
preserves other abilities, including clothing constraints/item metadata.

The native Match update calls a passive helper once after all actor updates.
That coherent alive-count snapshot avoids actor-order dependence when an actor
dies or respawns in its own update. It operates only during live, unpaused Turf,
with time remaining, and never in attract/Boss mode. Remote proxies are skipped;
only owners grant charge. Dead/active-special actors cannot receive charge.
There is no timer or per-match retained state to leak across reset/re-entry.

INKWAVE implements Special Charge Up by discounting specialCost. Adding the same
absolute points to that smaller cap would indirectly accelerate passive fill.
The helper therefore converts baseline points using effectiveCost/baseCost. A
3.26p one-second award fills exactly 3.26/baseCost of the gauge regardless of SCU.
The base cost is recorded at equip before discount and refreshed on weapon/reset.
Ordinary turf gain is unchanged. The helper caps at effectiveCost and emits the
normal special:ready event only on a not-ready → ready crossing. It does not
award turf, stats, Flow, damage, or a second ability.

## Verification and limits

Focused tests cover deficits at 30/60/120Hz, equal/advantaged teams, SCU coordinate
conversion, invalid dt, intro/finish/paused/attract/Boss gates, remote/dead/special
exclusion, clamp and event count, native normalization/equip/reset, native Match
update with raw negative control and a teammate dying during update, and actual
gear panel selection/storage. The full emitted Match module is exercised too.

Complete source aggregate and local-quality suites are run separately. Runtime
build identity includes both new adapter/helper files. Exact-head GitHub CI and
fresh browser visual acceptance are pending at PR creation; no browser/phone
or Switch acceptance is implied by the native-module tests.

Individual PR353 and PR400 full gear files accept this adapter without weakening
their existing rules, but the final multi-PR gear composition still needs its
own combined acceptance. Remote ready-display correction is separately PR495/
Issue484; this change does not claim to repair that existing protocol mismatch.
Issue392 remains non-closing until broader acceptance is satisfied.
