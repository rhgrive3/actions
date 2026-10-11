# Charger keep-entry resource ordering

Baseline: `e9bb7d91c800a2379dae623f6fffb57ea6a205cb`.

## New counterexample

While preparing a kept charge for a death/respawn review, a separate transition hole was observed: a full paid Charger hold entering squid keep receives one swim-refill tick before `s3Stored` is created. With 100 initial tank units, 18 paid units leave approximately 82; the keep-entry tick raises that to approximately 82.5555555556. The pre-existing full-held low-tank exception fix does not cover this branch.

Actor form admission runs before resources, and weapons run after resources. `busy()` permits a later ZL press to enter squid form. Resources incorrectly interpret this form permission as permission to refill, while `charging=true`, full charge is still present, and the keep record has not yet been created.

The narrow fix excludes a live full Charger charge from the ordinary refill branch independently of `busy()`. It does not change form admission, charge cost, partial-low-ink behavior, keep duration or cancellation timing. The strict existing full-charge predicate is reused.

## Sources and limits

- The existing Drive part02 parameter snapshot, Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`, `parameter/1130/weapon/WeaponChargerNormal.game__GameParameterTable.json`, supplies the unchanged full-cost ratio `.18` (18 project tank units) and keep duration. It does not specify the resource-phase predicate, and no recovered C++ consumer is claimed.
- [The community Charger specification](https://wikiwiki.jp/splatoon3mix/ブキ/チャージャー属#charge) states that full-charge holding does not refill ink. Its keep section describes entering squid form while retaining the full charge. The fix preserves that continuous state across the existing internal phase boundary. This is community behavioral evidence plus a reproduced implementation ordering defect, not a new Switch capture or a changed 11.3.0 numerical constant.
- Ownership and duplicate check: issue #1204 comment `6098795134` records this distinct residual. The earlier full-held low-tank case is not counted again; #1070 concerns cancellation after a keep exists, rather than entering it.

## Newly reviewed lifecycle paths

Five additional real installed Actor paths were probed: partial charge → death → respawn; kept charge → death → respawn; prepaid Splatling stream → death → respawn; prepaid stream → weapon switch and back; partial charge → weapon switch and back. All five passed their lifecycle invariants: no old-state shots after 90 further ticks, no death refund, a full respawn tank, and exactly the existing unspent-stream refund on an alive weapon switch. These are controls, not five new fixes.

The new regression reaches full charge through real input, tests both 18 and 100 initial tank units at 30/60/120Hz fixed-step rendering, then crosses the real keep/death/respawn path. All seven new cases fail on the baseline and pass with the guard. Adjacent partial-cancel / kept-cancel regressions also pass (25/25 focused run). The broader final set passes 34/34, including full bootstrap continuity and production charge-store regressions; the quick compatibility/numeric check also passes.

No shared checkout edits, raw source dump, browser/GPU verification, physical-controller exercise or retail-device equivalence claim.
