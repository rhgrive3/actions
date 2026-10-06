# #845 — Frustum-culled actors keep Character pose, foot-IK raycasts and hair simulation running

- 対象 Issue: rhgrive3/actions#845 `[INKWAVE][Perf] Frustum-culled actors keep Character pose, foot-IK raycasts and hair simulation running every tick`
- Base main: `f31f5da439134fe49bb89018dad5557671a49c67`
- 作業: branch `inkwave/c-add100-fb4-offscreen845-handoff-r58`（worktree `/mnt/workspace/.dev-state/agent-work/checkouts/inkwave-batch-c-add100/fb4-resume-r11`）
- 担当: C/cl6 の既存 claim（timestamp `2026-10-06T17:00:47.548486+00:00`）を**保持したまま** handoff。C/fb4 の handoff コメント id `6022123893`（2026-10-06T17:49:39Z）を**編集前に**投稿し GET readback 済み。再 claim・上書きはしていない。
- 本家参照版: スプラトゥーン3 Ver.11.3.0（Issue 記載の受け入れ基準。本作業は表示のみで本家の数値を一切主張しない）

## handoff 状態（前ランナー）

`EV/C845-cl6-parent-handoff.json` は `status = "unvalidated helper only, no completed runtime wiring/tests"`、残存は `patches/local-quality/offscreen-visual-budget.mjs` のみ、source `9f0cbb14797b6d295000038940986869106642e0`（親 = 上記 main）。

**helper は未検証・未配線であり、修正済みではない。** 実機・レンダラの前提を実装前に検証したところ、そのままでは機能しない 2 点が確定した。

1. `currentFrame()` が読む `ch._rendererInfo.render.frame` は native `Character` に存在しない（実際のカウンタは `G.renderer.info.render.frame`）。結果として `isOffscreenBudgeted()` が常に `false` を返し、budget が一度も入らない。
2. `_qualityOffscreenSkip` は `_qualityOffscreenBudget` を内側に持つ 2 段ラッパだが、`_qualityOffscreenActive` を立てるのは内側側のため、外側の `if (!this._qualityOffscreenActive)` が常に真 → skip 分岐が到達不能（デッドコード）。
3. `ch.isLocal` は native に存在した（`constructor(opts)` の `this.isLocal`）一方、`Character.update(dt, s)` の `s` が Actor 本体であることは `Actor._finishFrame` の実装で確認した。owner 判定は両方を見る形にした。

前提として native 実装から次を確認した。

- `_camHook` は各 LOD tier set の `S.list[0]` に載る `onBeforeRender` で、`this._camFrame = renderer.info.render.frame` を**実際に描画されたときだけ**書き込む。
- `Character.update(dt, s)` の `shown` は `root.visible` のみで frustum を見ない（Issue の root そのまま）。
- `_ground(x, z, n)` は `this.phys` が無いとき `root.position.y` を返す native fallback を持つ。
- native の not-drawn 分岐が無効化するのは `feetValid / headInit / _headSet`。
- `main.js::_frame` は `match.update(dt)` の**後**に `rig.update(dt)` を呼ぶ（カメラは 1 フレーム遅れで確定する）。

## 本家参照（Issue 記載）

- frustum culling に入った actor の **visual-only** な Character 処理（pose / hair / foot-IK の physics raycast）を止めたい。
- authoritative な Actor の移動・武器・当たり判定・通信・damage・AI は止めない。
- 見え直した最初のフレームで pose / foot teleport / hair の暴れが出ないこと。
- 30/60/120 Hz で同じ状態タイミング。
- 中間の Nintendo timing 数値は発明しない（本 Issue は timing 数値を要求していない）。

## 変更内容（owned: `patches/local-quality/` の helper / wiring / test / report のみ）

native `inkwave-public/` は byte-lock、`patches/splatoon3/profile.json` も変更していない。

1. `patches/local-quality/offscreen-visual-budget.mjs`（上書き再実装）
   - `installOffscreenVisualBudget({Character}, G)` が `Symbol.for(...)` ガード付きで prototype を 1 回だけ wrap（同 layer の `installRollerMotionQuality` と同じ流儀）。
   - 判定 `offscreenBudgeted(ch, s, G)` は次を**すべて**満たすときだけ budget。
     1. `s.isLocal` / `ch.isLocal` / `G.match.local` ではない（owner・local actor は常時 full rate）。
     2. `G.match.opts.range` でない（Practice Range は隔離）。
     3. `ch.inWorld`（live match scene 内）で、`ch.lod.force < 0`（lab / portrait の強制 LOD は除外）。
     4. `ch._camFrame >= 0`（native の描画シグナルが 1 回以上発火している。未初回描画は判定不能なので full rate）。
     5. `G.renderer.info.render.frame - ch._camFrame >= 2`（**renderer frame 単位**の grace。gameplay frame 数値ではない）。
     6. game camera に対する保守的な view volume 判定が `outside`。判定不能（camera 無し / parented camera / offset view / 非 perspective）は常に full rate。
     7. 連続 2 回 `outside`（`rig.update` が `match.update` の後という実行順に対応）。
   - budget 中の tick:
     - `proto._ground` が native の no-physics fallback（`root.position.y` + 上向き normal）を返し、`phys.raycast` を呼ばない → Issue の「foot-IK `_ground()` raycasts を止める」を満たす。高さを捏造しない。
     - `proto._buildPose` / `proto._applyPose` は no-op（pose + hair の本体）。**`_updateFeet` と `_updateSquid` は native どおり回し続ける**ので、gait 時計・footstep イベント・form モーフは offscreen でも進む。
     - native `update()` の残り（clocks / `_trackRoot` / `_updateStates` / `_updateFormScales` / `_updateMaterials` / `_updateLod`）はそのまま走る。**Actor には一切書かない。**
   - view へ戻った最初の tick のみ、native の not-drawn 分岐と同じ `feetValid / headInit / _headSet` を native 呼び出し**前に**無効化し、その 1 tick で foot replant と head/hair 再初期化を行わせる（`tests` の return-to-view ケースで確認）。
   - skip cadence の定数は無い（offscreen 中は全面 defer）。中間の Nintendo 数値は使用していない。
2. `patches/local-quality/install.mjs` — `installQuality(profile)` から `installOffscreenVisualBudget(api, G)` を呼ぶ（`bootstrap.mjs` → `installQuality` の既存配線に乗る。build の import graph は `patches/splatoon3/bootstrap.mjs` から辿られるため新しいファイルも同梱される）。
3. `patches/local-quality/adapter.mjs` — `IDENTITY_FILES` に `offscreen-visual-budget.mjs` を追加（shipped file の build identity）。
4. `patches/local-quality/tests/offscreen-visual-budget.test.mjs`（新規、focused）。
5. `reports/inkwave-offscreen-visual-budget-845-2026-10-07.md`（本ファイル）と `reports/inkwave-splatoon3-behavior-2026-10-02.md` への追記。

## 検証（before / after）

実装は **actual installed** で検証している: `patches/splatoon3/tests/real-character-fixture.mjs` が byte-locked の `inkwave-public/src/game/character.js` を build adapter 経由でロードし、`_camHook`（native の `onBeforeRender`）を実呼び出しで使っている。stub は renderer と physics raycast のみ。

### focused test

`node --experimental-vm-modules --test patches/local-quality/tests/offscreen-visual-budget.test.mjs`

| 実行 | 結果 |
|---|---|
| after | **8 tests / 8 pass / 0 fail**（exit 0, 80.5 s：うち大部分は Character 生成 1 回分） |
| 既存 local-quality control `turf-lead.test.mjs` | **15 pass / 0 fail** |
| 既存 local-quality control `score-reticle.test.mjs`（`qualityIdentity()` を検査） | **8 pass / 0 fail** |

before/after は**同一プロセス内**で比較している（in view / just drawn = 従来どおりの native 経路 ↔ frustum-culled = budget）。テストが確認する内容:

- baseline: in view かつ直前 renderer frame で描画済み → 30 tick 中 `_buildPose`/`_applyPose` が毎回 2 回走り、foot-IK physics raycast が発生、budgeted は 0。
- frustum-culled: grace 2 renderer frame + 連続 2 回 outside の後、59 tick 中 **pose pass 0 / physics raycast 0 / budgeted 59/59**。`_ovbRaycastsSkipped > 0` で native `_ground` が bypass ではなく interception されていることを確認。
- clocks: 同 59 tick で `ch.t` がちょうど `59 * (1/60)`、`ch.tr[0]` も前進（offscreen でも native 時計が止まらない）。
- Actor 非改変: budgeted tick の前後で Actor オブジェクトの JSON が byte-equal。
- return-to-view: その場で full rate、`feetValid === true`（replant）、両 pose pass、real physics raycast が戻る、`_ovbBudget` と `_ovbOutsideStreak` が残らない。
- controls（いずれも budget されない）: local actor / local Character / Practice Range / camera 不在 / 未描画 character / 直前 renderer frame で描画済み / live match scene 外 / 強制 LOD。pause・unrendered（renderer frame が止まっていても視野外なら defer は継続、camera が actor を向いた最初の tick で full rate に戻る）。
- 30/60/120 Hz: 4 秒ぶんの tick で budget 対象数が `4*hz - 1` で**全て一致**（判定が step size ではなく renderer frame 依存）。`ch.t` の進行は 4 秒ちょうど。
- wiring: import と `installOffscreenVisualBudget(api,G)` の接続、2 回目の install が `false`（冪等）、`qualityIdentity()['offscreen-visual-budget.mjs']` が sha256。

### 同一 harness での実測（`measure.mjs`、単一の非 profile Node プロセス）

| window | ticks | pose pass | pose CPU | foot-IK ground query | physics raycast | harness |
|---|---|---|---|---|---|---|
| in view / just drawn（従来どおり） | 60 | 120 | **77.355 ms** | 61 | 61 | 88.04 ms |
| frustum-culled（budget 後） | 59 | **0** | **0 ms** | **0** | **0** | 62.81 ms |

この harness では pose/hair が harness 時間の大部分（77.4 / 88.0 ms ≒ 88 %）を占めており、budget はそれを丸ごと消している。**ただしこれは単一の非 profile Node 実行の harness 時間であり、ブラウザ・端末の FPS/frame-time 測定ではない。** mobile Performance trace による CPU 減少量は**未確認**で、FPS 向上は主張しない。

## 影響

- authoritative な Actor 移動・武器・当たり判定・ink・damage・network・bot AI は不変（`Character.update` が Actor を書かないこと、および test の JSON equal で確認）。
- offscreen 中も gait 時計・footstep イベント・form モーフは進む（`_updateFeet` / `_updateSquid` は止めない）ので、見え直したときのリズム断絶が生じない。
- foot-IK の physics raycast は視野外でゼロ。高さは native の no-physics fallback（`root.position.y`）を使うため数値を創作していない。
- owner/local actor・Practice Range・lab/portrait・camera 不在の経路は一切変化しない。

## 制限・未確認

- **ロジックと単一 harness 計測のみ。ブラウザ実行・端末の Performance trace・実機比較は未確認。FPS/frame-time の改善は主張しない。**
- Issue の regression 項目「Mobile Performance traces show lower CPU time」は本環境では検証できない（未確認のまま残す）。
- 1 フレーム遅れのカメラ順序（`rig.update` が `match.update` 後）に対し、view volume 判定は `REACH = 3.0 m` の保守球と連続 2 回 outside で緩和しているが、**極端な 1 フレーム旋回**で budget 中の pose が 1 フレーム描画される残存リスクを 0 とは言わない。
- view volume 判定は perspective camera・無 parent・非 offset view に限る。判定不能は常に full rate。
- `_ground` の interception は budget 中の tick 内でしか効かないので、budget 中に呼ぶのは foot 用の可視 query のみ。authoritative collision には触れない。
- `scripts/check-inkwave-patches.mjs --quick` の "Numeric status is stale" は main 時点からの既存差分で、`profile.json` は main と byte 一致。本タスクでは対象外。
- 中間の Nintendo timing 数値は使用も主張もしていない（Issue が要求していないため）。

## 補正 (fb6 r68, 2026-10-07): 初回可視フレームのカメラ旋回競合・far 面・投影の安全側

上記の初版（供与コミット `18c45890963a3477ac1bdad7ae8ed88b23b79f09`、**未受理**）には 3 件の具体的欠陥があり、本補正で直した。いずれも表示層のみ、`inkwave-public/` はバイトロックのまま。

1. **初回可視フレームのカメラ旋回競合。** `inkwave-public/src/main.js::_frame` は `m.update(dt)`（〜L1037）を **先に**、`this.rig.update(dt)`（〜L1058）を **後に** 呼ぶ。したがって `inViewVolume()` の判定は**前フレームのカメラ**を使い、続く render は**旋回後のカメラ**を見る。判定時点で budget された登場人物は、その 1 フレーム目を `_buildPose`/`_applyPose` 省略のまま描画されうる。修正は、native `_camHook` と同じ `S.list[0].onBeforeRender` に連鎖する `catchUpBeforeVisible()` を追加したもので、**描画投入の直前**（＝フレーム最終のカメラが確定した唯一の地点）で、native の not-drawn 分岐と同一の invalidation を再生してから、抑えていた `_updateFeet` / `_buildPose` / `_applyPose` を実行する。`_ovbWasBudgeted` を消費するため同一フレーム内で 2 回は走らない。判定側で確立できない場合は常に full rate（`null` → 試験なし）。
2. **far 面の判定がコメントの中に埋まっていた。** `if (d > far + REACH) return false;` が near 面の行コメントに連結されており未実行だった（放置すると「遠方＝inside」と誤判定）。2 行に分離して実行。
3. **投影の安全側ガード。** three.js は `zoom` で frustum を拡縮し、`filmOffset` で横へずらす。特に `zoom < 1` は実 frustum を**広く**するため、無視すると「実際に描画される人物を provably outside と誤認する」＝**unsafe culling** になる。`zoom !== 1` / `filmOffset !== 0` / `near <= 0` / `near >= far` は `null`（＝full rate）に落とし、`cam.view.enabled`・`cam.parent`・非 perspective は従来どおり `null`。

回帰（すべて `node --experimental-vm-modules --test patches/local-quality/tests/offscreen-visual-budget.test.mjs`）:

- **after: 11 pass / 0 fail (exit 0)。**
- **before（helper のみ `18c45890` に戻し、テストは保持）: 8 pass / 3 fail (exit 1)** — 追加した 3 件（順序競合・far 面・投影ガード）だけが失敗し、既存 8 件は通る。
- 隣接控制: `turf-lead` 15/0、`score-reticle` 8/0（計 23、exit 0）。
- 順序競合テストは**静的カメラ証明ではない**: update 時は `turnAway()`、`rig.update` 相当で `turnTo()` と向きを実際に変え、そのうえで実際の投入フック `mesh.onBeforeRender(...)` を呼ぶ。旋回後に `Character.update` を挟まない点が本件の核心（next tick に逃げない）。

制限は前節のとおり変わらない。**ブラウザ実行・端末 Performance trace・実機比較は未確認、FPS/frame-time の改善は主張しない。** 補正の正当性は「投入前に遅延分が回収される」「未モデル投影を full rate に落とす」という論理検証と呼び出し回数に限る。オフスクリーン時の通常 tick は従来どおり抑止されており、回収は「budgeted のまま実際に描画される」少数フレームでのみ発生する。

## 2026-10-07 SOLE845 corrective handoff — authoritative muzzle guard

この節は上記の「live Actor の武器・権威状態に影響しない」「Issue #845 の live actor workload を抑制できた」という結論を訂正する。`Actor._finishFrame(dt)` は `ch.update(dt, actor.anim)` を呼ぶ一方、Actor は `actor.character === ch` で Character を所有し、active roster は `G.match.actors` / `G.actors` に保持される。native `Projectiles._muzzle()` は `Character.getMuzzle()` の weapon world transform を読み、Dualies の `_muzzleHand()` は右手と左手の各 muzzle world transform を読む。`getAimMuzzle()` の blend/fallback があっても実 muzzle が使われる経路を排除しない。Offline bot もこの Actor 経路を通り、`isLocal === false` のため local-only guard では不足する。Pose を省略すれば projectile origin/direction が変わり得る。

修正は `offscreenBudgeted()` で state の owner link または active roster 所属 `actor.character === ch` を検出したら必ず streak を reset し、native Character update を full rate に保つ。これは local player、remote player、offline bot すべてに適用する。Detached presentation-only Character に対する frustum/grace/camera-return 経路は引き続きテストするが、**通常 gameplay Actor の offscreen pose/IK/hair は最適化しない**。したがって Issue #845 は **PARTIAL / fixed=false**。以前の 0 pose/0 raycast の単一 Node 測定は detached harness のみを表し、live Actor や gameplay performance の改善根拠として取り消す。Actor JSON equality は muzzle parity の代用にしない。

Focused native regression は byte-locked `inkwave-public/src/game/character.js` の Character と `inkwave-public/src/game/weapons.js` の Projectiles を使い、実 `Actor._finishFrame` → `Actor.anim` → Character ordering で Shooter と Dualies 右/左 hand を slope・near-vertical aim・offscreen camera から native `fireShooter`/`fireDualies` に通し、unwrapped baseline と installed wrapper の projectile origin/velocity を比較する。camera return の実 native `_camHook` も確認する。これは renderer/raycast stub を使う logic-level check で、実ブラウザ・端末 Performance trace・Nintendo Switch Ver.11.3.0 実機比較ではない。Focused suite は **13/13 pass**。実機の射撃 parity と CPU 利得は引き続き **未確認**。
