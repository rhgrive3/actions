# Issue #1813: sourced Dynamo secondary unit and concurrent authority

Source under test: `/workspace/wt-agent5` clean HEAD `39c2060fe5d27ea1d8182861a07e79da99e8915e`. This is a controlled, production-composed source fixture and a public-source analysis; it is not a captured Switch 11.3.0 comparison. No product source is changed by this packet.

## What the original issue requires

The issue asks to isolate the two Dynamo horizontal unit-1 shots and compare player damage, object hit, collision/ink, and a native Splat Roller control against applicable S3 behavior. It warns that `UnitDamageRate=0` could be a multiplier or sentinel and must not be inferred from the number alone. The warning is about determining the behavior; the acceptance list does not separately require decompiling Nintendo's internal formula. A device test is waived, but unknown source accuracy is not.

## Public evidence and limits

- レイルーム, [Splatoon 3 Ver. 11.2.0 main weapon bullet sizes](https://note.com/reiroom/n/nb37a3bfbd48a), Roller section, says of Dynamo horizontal: 「他に塗り専用の弾が2発飛びます」 (two additional paint-only bullets). The article identifies overseas analyzed data and the Leanny parameter database as its basis; it does **not** establish an independently captured hit experiment or decode the field's native consumer. Its statement supports the intended paint-only behavior for the two secondary bullets in 11.2.0.
- Immutable public Leanny source at `7280ff9cde8bb1c5dcef46c700c326471584d2e6`: [11.2.0 row](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1120/weapon/WeaponRollerHeavy.game__GameParameterTable.json), [11.3.0 row](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerHeavy.game__GameParameterTable.json). Downloaded raw files are byte-identical: 17,556 bytes each, SHA-256 `7206012122ec2faf48713f313ed58002bd77fe4f7e9923aee667bc518102a37a`; unit 1 has `BulletNum: 2` and `UnitDamageRate: 0`. Equality corroborates applicability of the article's field-level description across versions; it does not establish that Nintendo's engine behavior is byte-identical.
- [Nintendo official update history](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/p/1076), 11.3.0 section, does not list a Dynamo adjustment. This is corroboration only, not proof that no relevant undocumented engine behavior changed.

Together these strengthen the evidence behind the existing zero-authority policy and make a conditional source-based behavioral assessment possible without settling the internal sentinel/multiplier implementation. They do not establish actual 11.3 collision, object, shield, or dome behavior for each target; no independent device trace or native consumer is claimed.

## Actual implementation and bounded tests

`patches/splatoon3/runtime/catalog-flick-damage.mjs:5` excludes source `PaintOnly` and finite `UnitDamageRate <= 0` from damage. `patches/splatoon3/runtime/main-weapon-catalog.mjs:1128` applies that decision to impact damage and `:1357` applies it to actor and defense candidates, while field collision and paint continue. This is the current INKWAVE policy; article/data do not prove its exact Nintendo internal mechanism.

The existing `patches/splatoon3/tests/issue-1813-dynamo-unit-authority-live.test.mjs` checks admitted unit 1 against player, beakon, canopy and dome, unit 0 and native Splat as positive controls, and both secondary units reaching real floor collision and CPU turf paint. On this checkout it passed **3/3, 0 skipped** with Node v22.23.4 and `--experimental-vm-modules`: `authority-source-vm.tap`. Existing `issue-1814-native-weapon-matrix-20261029.test.mjs` additionally contains an actual deployed Splash Wall geometric-hit / no-damage / continued-projectile check; this packet does not claim a fresh matrix run.

`issue-1813-dynamo-crossfire-source.test.mjs` is a proposed source-only regression: two distinct actual admitted Dynamo owners each retain one source-selected projectile while independently aimed at separate controlled targets. The zero-unit-present and zero-unit-removed runs both give `zeroLoss=0`, `mainLoss=180`. A per-projectile copied-descriptor counterfactual changes only unit 1's rate to 1 and gives `zeroLoss=180`, `mainLoss=180`; this proves the secondary target is reachable and another owner's central damage stays intact. It passed **1/1** in `crossfire-source.tap`. It does not prove same-target or retail crossfire. An earlier same-volley setup was nondiscriminating: forced rate 1 also yielded 180; its failed negative control is retained as `same-volley-nondiscriminating-negative.tap`, not counted as proof.

Install the candidate as `patches/splatoon3/tests/issue-1813-dynamo-crossfire-source.test.mjs`. Its `./source-fixture.mjs` import is relative to that owning directory; for this scratch execution only, a symlink resolved that exact fixture to the checkout. Run from the repository root:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/issue-1813-dynamo-crossfire-source.test.mjs
```

The test deliberately rejects `INKWAVE_BUILT_SITE` or `INKWAVE_BUILT_ROOT`; the expected emitted-scope rejection is retained in `reject-emitted.tap`. It modifies a copied descriptor in memory as a counterfactual and must not be represented as an emitted or native-retail test.

A first attempt to run the existing authority suite omitted `--experimental-vm-modules`; all three failed before exercising the behavior with `vm.SourceTextModule is not a constructor` (`authority-missing-vm-flag.tap`). The corrected run above is separate and passed. No failure is hidden or reclassified.

This supports a conditional software completion candidate for #1813, with the source and retail limits above. It neither proves all #1814 tracker requirements nor justifies additional product behavior changes by itself.
