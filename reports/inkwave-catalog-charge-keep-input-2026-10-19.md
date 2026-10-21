# Catalog charge-keep input admission (2026-10-19)

Baseline: `fbed2d4ef5a2708307036c167d0a9df0461e8597`. Its three Spinner HUD changes are retained. The gameplay diagnosis was made on `b07bf92be2a977f705e4cefdb35194d8c016148e`; the relevant catalog/Actor owners are identical in fbed.

## Confirmed defect and bounded correction

The actual production-composed Actor rejected a later Squid press while Fire remained held on a fully charged catalog Squiffer/E-liter/Goo Tuber. It stayed humanoid with `busy=true`, `charge=1`, and no stored charge. The mature Splat Charger accepted the same sequence. The source-backed catalog keep owner existed but normal held-button input could not reach it.

The fix shares the existing keep-capability condition between catalog `busy()` and `cancel(keep)`. Supported full charge and source-enabled partial/stream retention can reach the existing transition. Pending shots, melee, rolls and lunges remain action owners; scoped and no-keep weapons do not acquire storage. Actor retains newer-input precedence. No lifetime, damage, ink payment/rate, projectile physics, stored-release delay or network message is changed. Empty remaining streams still cannot create a stored zero charge.

Pinned raw source: [1130, commit7280ff9](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon). Directly read WeaponChargerQuick/Long/Keeper and WeaponSpinnerSerein: keep75/75/300/200F respectively. Existing LACT keep capability and its sparse source-flag exception are retained, based on the [Nintendo weapon guide](https://www.nintendo.com/jp/character/splatoon/fashion/index.html). No undocumented curve was invented.

## Verification

- Focused source tests exercise seven eligible full/partial configurations and eight negative configurations at30/60/120Hz FixedClock cadence, 75/300F expiration, one-shot release, redive, no duplicated ink debit, newer-input priority, partial discard and unrelated pending-action ownership.
- Original five focused tests passed; untouched b07 failed four and passed the unchanged-boundary control. Related11-file source suite passed122 tests.
- A sixth focused test executes the exact added browser probe block and its actual Actor factory. The probe uses Fire→later Squid→emerge→release inputs, without assigning squid form or invoking the runner instead of Actor. Three supported chargers release exactly one shot; the E-liter scope rejects storage. Real Level/Physics run on a controlled own-ink flat floor; display is the existing lightweight browser fixture.
- The existing catalog Chromium/WebKit job runs the focused test before build and against the emitted site after build, then records `chargeKeepChecks` alongside its unchanged catalog tests. Build artifact hashes, existing assertions, timeouts and browser engines remain unchanged.
- Browser and exact-head CI results are pending publication. Executing the extracted browser code locally is not a browser pass or Nintendo hardware measurement. The raw pre-delay/laser interpretation and other catalog calibration questions remain outside this fix.

## Ownership

[PR1603](https://github.com/rhgrive3/actions/pull/1603), inspected at `13f57387a0b579a1d894f0bc6c8db7f02f4abd88`, edits charger optics/paint/flight and older tests but not the catalog runtime changed here. This test has a new filename. Any later Clam sub-lock correction in the same runtime must be merged by separate hunks, retaining both owners.


## Original central comparison record (byte-preserved)

## 2026-10-19：追加主武器のチャージ保持入力

基底fbed2d4ef5a2708307036c167d0a9df0461e8597。通常Fireを保持したまま後からSquidを押すと、catalogのスクイックリン/リッター/ソイチューバーがbusyで潜伏できず、既存保持ownerへ届かないことを実Actorで再現した。保持可能なcharge状態だけ既存cancel(keep)へ接続し、保持clock・威力・インク支払を変更しない。保持不可scope/不十分charge等の負対照、30/60/120Hz、失効/再潜伏/releaseを検証した。専用5件・関連122件成功、元runtimeでは4件失敗/対照1件成功。

実browser向けには通常Actor入力で3武器の保持→復帰→1発releaseとscope拒否を追加し、同block/factoryを第6専用testとして確認する。既存Chromium/WebKit catalog jobでsource/emitted専用testと実browserを実行し、exact-headの結果は別途記録する。現時点でnative成功・実機一致を主張しない。詳細は[専用報告](inkwave-catalog-charge-keep-input-2026-10-19.md)。既存報告本文を保持した末尾追記。
