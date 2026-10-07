# Clothing gear: Respawn Punisher and Splatfest Tee AP

## Scope and current evidence

Published INKWAVE, Splatoon3 reference11.3.0. This work is based on main
`17602ab094da6efb663d872934458e818ae3c93e`. The local source inputs come from
`0859bf4fab08edc74c25fcb790e662a748a91ec9`: intervening main changes are the modeler
and CI workflows, not gameplay. Both the CXX filter and the newer parallel
validation workflow are retained. The latter and its exact test were reread;
all11 verifier cases pass against that latest-main pair.

The related candidates were #116/#348/#351/#352. Only #116 and #352 are implemented
here. #348/#351 tracking/rendering remain reserved research: a verified S3
near-distance to INKWAVE-world calibration and victim-confirmed main-hit outcome
path are still needed. No guessed distance is published and neither is claimed
resolved. No other Draft's gameplay is copied into this standalone tree.

## #116: corrected interpretation and death ownership

The source issue's broad description is useful, but two details conflict with its
own references. The S3 measurement and the Wiki's explicit formula operate on AP,
not an already-computed time reduction. The victim's eligible Quick Respawn uses
`ceil(AP * .15)` before its curves, while Special Saver uses fractional `AP * .7`.
The latter is not rounded as though it were the QR integer. A wearer does not
suppress their own abilities merely by wearing RP.

RP is a clothing-main ability. A qualifying final killer supplies45 extra frames
and .15 extra loss fraction; the victim wearer's own contribution is68 frames
and .225. Both contributions sum to113/.375. Gauge loss is a fraction of the
pre-death amount, not fixed points or a percentage of maximum capacity.
Water/fall, missing attacker, self and ally deaths add neither contribution.
This corrects the old issue text's claim that a water death still receives the
wearer's extra SP loss. Assist contributors are not treated as the final killer.

The existing gear death wrapper still owns the final special amount and timer.
The new helper computes the fixed-ability inputs once, before the splat event.
It never rewrites shared curves or temporarily replaces another actor's modifiers.
Repeated splat calls on an already-dead actor cannot apply another penalty.

Standalone main still has the separately reported base death-time and normal QR
phase/eligibility gaps. The new modifier does not silently claim to fix #91,
#205, #260 or #277. When PR323's own-camera curve is present, the helper consumes
it and preserves independent phase flooring. Reviewed composition uses PR323's
actual enemy-death history and PR330's final-gauge preservation. For example,
incoming RP maps QR30 to5AP, reducing the two camera phases by39F, before adding45F.
This is relative to the installed base timer, not a new assertion that the current
standalone base5.5s matches the S3 full respawn sequence.

The current game has no Tacticooler implementation. Nintendo's post2.1.0 drink
exception is recorded, not simulated with an invented status flag. A future drink
producer must keep its protected QR/Special Saver effects outside this equipment
AP suppression while retaining the fixed penalties; this branch does not claim
complete drink interaction or new Switch timing measurements.

### Online equipment

The original standalone source used bit24. This adopted composition uses bit25
for RP equipment, reserving bit24 for Roller vertical state; tuple columns remain
unchanged. Only an accepted, newer snapshot from the actor owner installs it.
Ownership change and reset cannot reuse another owner's flag. The hit packet also
carries an attack-local boolean so the first hit does not depend on an earlier
visual snapshot. Incoming sender identity must match the attacker owner; the
override and applying-hit guard are restored even if hit processing throws.

This is equipment attribution, not a full replacement of PR182's replication,
replay or packet-validation work. Older builds cannot implement a penalty that
they do not know; mixed-build parity and latency-injected real-peer trials remain
unverified. The new wrapper preserves the actual applyHit statement so PR321's
final-damage grouping hook composes rather than being silently skipped.

## #352: explicit Tee identity and permanent AP

The clothing-main selector offers a Splatfest Tee configuration, persisted as
`item: splatfestTee` with `main: abilityDoubler`. An arbitrary saved main without
that item identity is rejected. Hat, shoes and extra slots reject both fixed
clothing abilities. This does not add festival scheduling, inventory or cosmetics.

Only that Tee's three extra slots change3 to6AP. Three different abilities give
6+6+6; one repeated ability gives18. Empty slots give0. The doubler main supplies
no extra10AP and no final modifier is multiplied by2. Other pieces stay10/3.
The UI's per-slot numbers and battle modifiers both follow this AP model, including
save/reopen, re-equipment, reset and independent actors.

In reviewed Flow/conditional composition the equipment subtotal is doubled first;
temporary AP is then added once. Tee18 plus Last Ditch18 is36, not54; Tee18 plus
Comeback10 is28, restoring18 on expiry. Existing caps, weapon identity and cost
consumers remain in their respective owners.

## Sources checked on2026-10-04

- [Nintendo current version](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/):11.3.0, released2026-08-19.
- [Nintendo update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/~/splatoon-3-update-history):2.1.0 Tacticooler exception;7.2.0 fixed an old RP state leaking into a later environmental death.
- [Nintendo's Splatfest Tee explanation](https://www.nintendo.com/us/whatsnew/what-is-your-favorite-chocolate-get-ready-for-a-sweet-splatfest-in-splatoon-3/): the supplied Tee has Ability Doubler for the other abilities on that gear.
- [Pinned11.3.0 gear traits](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/spl__GearSkillTraitsParam.spl__GearSkillTraitsParam.json): Exorcist and ExSkillDouble are Clothes-only. ConsistsOfChip is exchange material, not an effect list.
- [Pinned ability descriptions](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/ability.html): identifies those internal names; it does not provide new timing defaults.
- [S3 original measurement](https://macarongamemo.com/entry/splatoon3-respawn_time),2024-01-02: asymmetric frame/loss penalties, environment exclusion and AP suppression example.
- [S3 Wiki exact calculation](https://wikiwiki.jp/splatoon3mix/システム詳細仕様#q39e2d53): QR-only AP ceiling, fractional Special Saver AP; QR10 becomes2AP, the two camera phases are86/258F, with45F added to the own-camera segment.
- [S3 clothing ability notes](https://wikiwiki.jp/splatoon3mix/ギア/ギアパワー/分割3#respawn_punisher): final-killer gating, own-only suppression exclusion, environmental exception; Ability Doubler's18AP model is in the same page.

The Wiki example prints a conflicting chase coefficient (180) while its stated
258F result agrees with pinned Dying_ChaseFrm [90,180,270]. This implementation
uses the existing pinned curve, not that coefficient typo.

The fixed scalars are community measurement/formula evidence, not falsely labeled
as extracted defaults from the pinned parameter JSON. Existing numeric bindings
remain unchanged; the numeric-status inventory includes the additional scalars.

## Verification record

- Original main actual-module negative control: RP normalizes to none, an80-point
  victim retains40, no extra timer; Tee normalizes to none and three run subs use9AP
  (1.137565), not18AP (1.25326).
- Final dedicated source11/11 and emitted/minified11/11 passed, including the
  fixed30/60/120Hz countdown/gauge trace. Full gameplay/reliability754/754 passed
  at bounded concurrency2; local-quality8/8 and verifier11/11 passed.
  Standalone content digest is `a91c5c4a0490`. Exact-head browser CI follows publication.
- Reviewed manual multi-PR composition:20/20 source and20/20 minified, including
  the existing six conditional/Flow cross-feature cases and the actual NetMatch
  bit24/armor-bit23/SP-counter22 composition. Existing fields stay at their indices. This is not an automatic
  conflict-free merge claim or a new physical-device comparison.
- Native Chromium/WebKit checks exercise legal options, Tee item persistence,
  AP labels, reopening and normal closure before weapon selection. They await
  exact-head Actions; local Chromium remains blocked by the host's socket policy.

No merge, deployment, direct main update or issue closure is performed by this batch.

Reviewed runtime heads: PR315 ab951ea408797f54c03c41ff8d5112bd1531217c; PR323 07e6ee0b46be88aa7095fd305f273acb9ba9ca1d; PR327 c6e386fa5c02ff16a3d12ececb3d0191e020c14f; PR321 83925b327c649eb8904232cfdd7f811885481f84; PR330 ddb98f8d912fec1d7085d87aaee2344af2ba2a8f; PR340 062f0a1954377a7b4fffbbeb06b09f67ca90408f; PR341 f81652b6fb478241a54c3676d33d3c030a186133; PR353 runtime unchanged from1ab7c599 throughf6e856fc. PR317 contributes its assist method only, PR318 c6b13fde its rollInk cost/payment changes only, and PR328 2907e5cf its NetMatch adapter only. Combined UI rendering is not claimed.
