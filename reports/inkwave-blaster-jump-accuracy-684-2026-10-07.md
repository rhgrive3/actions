# #684 Blaster のジャンプ精度 25F→70F 回復と 50% outer-reticle bias

- 対象 Issue: rhgrive3/actions#684 `[INKWAVE][Aim] Blaster jump accuracy ignores S3's 25F→70F recovery and 50% outer-reticle bias`
- Base main: `f31f5da439134fe49bb89018dad5557671a49c67`
- 作業: branch `inkwave/c-add100-fb6-current-residual-r47`（専用 worktree `/mnt/workspace/.dev-state/agent-work/checkouts/inkwave-batch-c-add100/fb6-resume-r11`）
- 担当: C/fb6（Issue へ担当コメント + readback 済み。編集前に投稿）
- 本家参照版: スプラトゥーン3 Ver.11.3.0

## 本家の挙動と根拠

- 標準ブラスターの空中拡散は最大 10.0°、地上は内側レティクルからぶれない（＝0°）。
- ジャンプ直後は外側レティクルへ寄る確率（bias）が 0.5。
- その bias の回復は 25 フレーム後に始まり、70 フレームで回復端点に達する。
- 根拠: 任天堂 Ver.11.3.0 更新履歴（NA 2026-08-19）および Issue 記載の pinned 抽出値。INKWAVE の `patches/splatoon3/profile.json` `weaponsFidelityCompletion.weapons.blaster.WeaponParam` が同じ入力を保持する:
  `Jump_DegBiasDecreaseStartFrame = 25`, `Jump_DegBiasEndFrame = 70`, `Jump_DegBiasMax = 0.5`, `Jump_DegSwerve = 10`, `Stand_DegSwerve = 0`。
- 25F↔70F の中間補間則は公開資料に無い。**Nintendo 値として断定しない**（Issue の条件）。

## INKWAVE の実装箇所（変更前）

- `patches/splatoon3/runtime/weapons.mjs` の `WeaponRunner.prototype._spreadDeg` が blaster を `this.a.grounded ? w.spreadGround : w.spreadAir` の二値に縮退させていた。時間状態は無く、pinned の `Jump_DegBias*` に runtime 消費者は無かった（リポジトリ全体を検索）。
- `inkwave-public/src/game/weapons.js` の `Projectiles.prototype.fireBlaster` は `_spread(dir, spreadDeg)` を一度呼ぶだけで、内外レティクルの確率分岐が無かった。

## 変更内容（owned: installed runtime / test / report のみ）

`patches/splatoon3/runtime/weapons.mjs`:

1. pinned profile の blaster `WeaponParam` から 25F/70F/0.5 を `referenceHz` で秒へ変換して読み込む（数値の再定義なし）。
2. 固定シミュレーションクロック上のジャンプ精度状態 `WeaponRunner.prototype.s3BlasterJumpState(w)` を追加。離地エッジで状態開始、着地後も 70F まで保持し、70F 到達かつ地上で解除。
3. bias は 25F まで `Jump_DegBiasMax`、70F で 0。25F→70F の中間は**置換可能な1関数**（`blasterJumpBias`）に限定した placeholder。ソースが得られればこの関数のみ差し替える。
4. `_spreadDeg` は状態が有効なとき bias 重み付きの期待円錐 `ground + (air - ground) * bias` を返す。状態が無いときは従来どおり `grounded ? spreadGround : spreadAir`（既存 #556 挙動を保持）。
5. `Projectiles.prototype.fireBlaster` は bias を確率として内外レティクルを選ぶ（`Math.random() < bias` で空中包絡、それ以外は地上端点）。単一の一様円錐で両方を近似しない。
6. `WeaponRunner.prototype.reset` に `s3BlasterJumpT` / `s3WasGrounded` の初期化を追加。

HUD は `inkwave-public/src/main.js` が `a.weaponRunner.spread` を読み、`hud.js` がそれを描画するため、**byte-locked `inkwave-public/` を変更せずに**同じ権威状態を消費する。

## 検証（before / after）

focused test: `patches/splatoon3/tests/blaster-jump-accuracy.test.mjs`

| 実行 | 結果 |
|---|---|
| before（runtime 変更のみ stash、テストは同梱） | **1 pass / 8 fail**（唯一 pass は profile 値の読み取りテスト） |
| after | **9 pass / 0 fail** |

- before の復元検証: `patches/splatoon3/runtime/weapons.mjs` の sha256 が after と一致（`0f2be10bbddbf503a588a19a8966cce6a0e5ee2d2659302e2467a3979a2279a3`）。
- 既存回帰: `wall-drop-dualies-guards.test.mjs` の #556 ケース 1/1 pass（この環境では boot が約 95 秒かかる）。
- `weapons.test.mjs` 3/3 pass、`integration.test.mjs` 19/19 pass。
- run 例: `node --experimental-vm-modules --test patches/splatoon3/tests/blaster-jump-accuracy.test.mjs`

テストが検証する範囲（出典のある端点のみ）:

- 地上端点 0° / 空中包絡 10.0°、ジャンプ直後の bias 0.5。
- 25F まで bias 不変（24F・25F で 0.5）。25F 直後から回復開始。
- 70F で bias 0（回復端点）。25F→70F は単調非増加のみを検証し、**中間値を主張しない**。
- 70F 前の着地で残状態が消えない（着地後も bias > 0、円錐 > 0）。
- 25F 以降の滞空が単一の full-air 状態に留まらない。
- HUD（`weaponRunner.spread`）とサンプラ（bias による内外選択）が同じ状態を消費する。
- Intensify Action（`gear.mjs` が scale する `spreadAir`）は 25F/70F の時間状態を消さない。
- 30Hz / 60Hz で同一シミュレーション経過時間なら bias が一致（描画 cadence 非依存）。

## 影響

- 25F 以降も full 拡散に固定される問題を解消。着地時の即時リセットも解消。
- HUD が 25F→70F の回復を表示できるようになる（同じ権威値）。
- ダメージ・弾道・射程・他ブキは不変。

## 制限・未確認

- **ロジックのみ確認**。ブラウザ実表示・Switch 実機でのレティクル遷移比較は**未確認**。
- 25F→70F の中間曲線は placeholder。本家資料で確定するまで Nintendo 値として扱わない。
- 離地エッジは崖落下でも立つ。崖落下時の本家挙動は未確認。
- 別 root として保持: #98（Shooter scope の同種機構は PR #868 が `kind==='shooter'` のみ実装）、#556（grounded spreadGround）、#674（ローラー入射角深度）、#498（age decay）、0.55 垂直圧縮。
- 参考（本変更とは無関係の既存差分）: `scripts/check-inkwave-patches.mjs --quick` は main 時点で `Numeric status is stale` を返す。`profile.json` と `reference/numeric-status.json` は main と byte 一致（差分ゼロ）で、欠落 4 キー（`weapons.blaster.shotGuideFrame`, `weapons.slosher.shotGuide.*`）は本変更の影響ではない。本タスクでは対象外のため修正しない。
