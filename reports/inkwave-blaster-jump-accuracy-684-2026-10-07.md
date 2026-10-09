# #684 Blaster のジャンプ精度 25F→70F 回復と 50% outer-reticle bias

- 対象 Issue: rhgrive3/actions#684 `[INKWAVE][Aim] Blaster jump accuracy ignores S3's 25F→70F recovery and 50% outer-reticle bias`
- Base main: `f31f5da439134fe49bb89018dad5557671a49c67`
- 作業: branch `inkwave/c-add100-fb6-current-residual-r47`（専用 worktree `/mnt/workspace/.dev-state/agent-work/checkouts/inkwave-batch-c-add100/fb6-resume-r11`）
- 担当: C/fb6（Issue へ担当コメント + readback 済み。編集前に投稿）
- Codex4 correction: source base `bdd94fc47e3fc04b2e90c4b500c05821170549eb`, branch `inkwave/c-add100-codex4-blaster684-correction-r56`; this follow-up fixes the HUD envelope and Shooter-state isolation gaps below.
- 本家参照版: スプラトゥーン3 Ver.11.3.0

## 本家の挙動と根拠

- 標準ブラスターの空中拡散は最大 10.0°、地上は内側レティクルからぶれない（＝0°）。
- ジャンプ直後は外側レティクルへ寄る確率（bias）が 0.5。
- その bias の回復は 25 フレーム後に始まり、70 フレームで回復端点に達する。
- 根拠: 任天堂 Ver.11.3.0 更新履歴（NA 2026-08-19）および Issue 記載の pinned 抽出値。INKWAVE の `patches/splatoon3/profile.json` `weaponsFidelityCompletion.weapons.blaster.WeaponParam` が同じ入力を保持する:
  `Jump_DegBiasDecreaseStartFrame = 25`, `Jump_DegBiasEndFrame = 70`, `Jump_DegBiasMax = 0.5`, `Jump_DegSwerve = 10`, `Stand_DegSwerve = 0`。
- 25F↔70F の中間補間則は公開資料に無い。**Nintendo 値として断定しない**（Issue の条件）。

## 判定条件と確認状態

- 対象は Splatoon 3 Ver.11.3.0 の標準 Blaster。照準デバイスには依存しない。基準ケースは地上から離れた直後、通常ギア、60Hz の fixed simulation tick。
- ロジック回帰は実 Actor / WeaponRunner / Projectiles source fixture で実施。30Hz・60Hz・120Hz の同一経過時間、Intensify Action 装備、local/remote projectile owner、Practice Range source adapter composition も別 assertion で確認した。
- ブラウザ描画と Switch 実機は未確認。射撃分布の実機再現、崖落下の着地/離地判定も未確認。

## INKWAVE の実装箇所（変更前）

- `patches/splatoon3/runtime/weapons.mjs` の `WeaponRunner.prototype._spreadDeg` が blaster を `this.a.grounded ? w.spreadGround : w.spreadAir` の二値に縮退させていた。時間状態は無く、pinned の `Jump_DegBias*` に runtime 消費者は無かった（リポジトリ全体を検索）。
- `inkwave-public/src/game/weapons.js` の `Projectiles.prototype.fireBlaster` は `_spread(dir, spreadDeg)` を一度呼ぶだけで、内外レティクルの確率分岐が無かった。

## 変更内容（owned: installed runtime / test / report のみ）

`patches/splatoon3/runtime/weapons.mjs`:

1. pinned profile の blaster `WeaponParam` から 25F/70F/0.5 を `referenceHz` で秒へ変換して読み込む（数値の再定義なし）。
2. 固定シミュレーションクロック上のジャンプ精度状態 `WeaponRunner.prototype.s3BlasterJumpState(w)` を追加。離地エッジで状態開始、着地後も 70F まで保持し、70F 到達かつ地上で解除。
3. bias は 25F まで `Jump_DegBiasMax`、70F で 0。25F→70F の中間は**置換可能な1関数**（`blasterJumpBias`）に限定した placeholder。ソースが得られればこの関数のみ差し替える。
4. `_spreadDeg` は状態が有効なとき実際の outer envelope（`spreadAir`、gear scaling 後）を返す。bias 重み付きの期待値 5° を HUD の最大境界として使わない。状態が無いときは従来どおり `grounded ? spreadGround : spreadAir`（既存 #556 挙動を保持）。
5. `Projectiles.prototype.fireBlaster` は bias を確率として内外レティクルを選ぶ（`Math.random() < bias` で空中包絡、それ以外は地上端点）。単一の一様円錐で両方を近似しない。
6. Blaster 専用 `s3BlasterWasGrounded` を reset/update し、update wrapper を `blasterRunnerUpdate` と命名。Shooter #98 の `s3WasGrounded` / `s3JumpSpreadAge` を非 Blaster 分岐や Blaster reset が消さない。

HUD は `inkwave-public/src/main.js` が `a.weaponRunner.spread`（10°の gear-scaled outer envelope）をピクセル射影し、`hud.js` が外周リングを描画する。owned HUD adapter は同じ `s3BlasterJumpState` から hold 中の `OUTER 50%` と recovery 中の `RECOVERING` を別表示する。中間 bias 値は表示せず、未確認の補間則を Nintendo 値のように見せない。**byte-locked `inkwave-public/` は変更していない**。

## 検証（before / after）

focused test: `patches/splatoon3/tests/blaster-jump-accuracy.test.mjs`

| 実行 | 結果 |
|---|---|
| original FB6 implementation run | **9 pass / 0 fail**（当時の実装。HUD 側の outer-envelope 検証と Shooter-state 分離は未カバー） |
| Codex4 correction baseline on `bdd94fc` (initial 10-test set) | **5 pass / 5 fail**（HUD に 5° expected spread が渡る、phase cue と namespaced state が無い、gear-scaled HUD も半分） |
| Codex4 correction focused run | **11 pass / 0 fail** (`blaster-jump-accuracy.test.mjs`) |

- Earlier FB6 checks (not rerun for this correction): `wall-drop-dualies-guards.test.mjs` #556 1/1, `weapons.test.mjs` 3/3, `integration.test.mjs` 19/19. The wall-drop fixture took about 95 seconds in that run.
- The correction test exercises local and remote projectile owners, equipped Intensify Action, hold/recovery boundaries, reset/update isolation, the native main/HUD handoff, and the Practice Range source-adapter composition.
- run 例: `node --experimental-vm-modules --test patches/splatoon3/tests/blaster-jump-accuracy.test.mjs`

テストが検証する範囲（出典のある端点のみ）:

- 地上端点 0° / 空中包絡 10.0°、ジャンプ直後の bias 0.5。
- 25F まで bias 不変（24F・25F で 0.5）。25F 直後から回復開始。
- 70F で bias 0（回復端点）。25F→70F は単調非増加のみを検証し、**中間値を主張しない**。
- 70F 前の着地で残状態が消えない（着地後も bias > 0、外周リングは 10° envelope のまま）。
- 25F 以降に bias の回復 phase を提示しつつ、outer envelope は bias 期待値へ縮めない。
- HUD 外周リングは `runner.spread` を通して最大 envelope を表示し、別 cue が同じ state の初期 bias / hold / recovery phase を表示する。サンプラはその bias で内外端点を分ける。中間確率は UI で数値化しない。
- Intensify Action の gear-scaled `spreadAir` は HUD とサンプラの outer endpoint に反映され、25F/70F の timing は変えない。
- 30Hz / 60Hz / 120Hz で同じ simulation elapsed time なら bias が一致（render cadence 非依存）。

## 影響

- 25F 以降も full 拡散に固定される問題を解消。着地時の即時リセットも解消。
- HUD が 10° outer envelope と、初期 outer probability / recovery phase を別々に表示する。
- ダメージ・弾道・射程・他ブキは不変。

## 制限・未確認

- **ロジックのみ確認**。ブラウザ実表示・Switch 実機でのレティクル遷移比較は**未確認**。
- 25F→70F の中間曲線は placeholder。本家資料で確定するまで Nintendo 値として扱わない。
- Practice Range adapter を通した source-fixture は focused test 済み。重い `practice-range/tests/isolation.test.mjs` 全体は 80 秒超の初回実行で停止したため、全 suite の判定は無し。
- 離地エッジは崖落下でも立つ。崖落下時の本家挙動は未確認。
- 別 root として保持: #98（Shooter scope の同種機構は PR #868 が `kind==='shooter'` のみ実装）、#556（grounded spreadGround）、#674（ローラー入射角深度）、#498（age decay）、0.55 垂直圧縮。編集前の GitHub GET で PR #868 は base `f31f5da439134fe49bb89018dad5557671a49c67` / head `aa094850fdd60b3b70adfdaad54b3e3837cb1402`、open・non-draft。最新 diff の Shooter wrapper は `runnerUpdate` と `s3WasGrounded` を使うため、Blaster 側を別名・別 marker に分離した。同じ adapter/runtime ファイルが touched でも root は統合重複しない。既存 #684 comment `6020991230`（2026-10-06T16:43:28Z）は保持し、投稿・編集していない。
- 参考（本変更とは無関係の既存差分）: `scripts/check-inkwave-patches.mjs --quick` は main 時点で `Numeric status is stale` を返す。`profile.json` と `reference/numeric-status.json` は main と byte 一致（差分ゼロ）で、欠落 4 キー（`weapons.blaster.shotGuideFrame`, `weapons.slosher.shotGuide.*`）は本変更の影響ではない。本タスクでは対象外のため修正しない。
