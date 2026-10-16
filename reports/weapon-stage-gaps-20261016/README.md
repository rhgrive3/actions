# ワイパー・飛行飛沫・ステージ再現差の修正と残件

対象ベース: `a262d8bcd2c8e95d6fef76e6081d89c33aea25de`。公開版は `inkwave-public/` にビルドアダプターを適用したもの。比較資料は Splatoon 3 **11.3.0**、Leanny/splat3 `7280ff9cde8bb1c5dcef46c700c326471584d2e6`。ギアなし、通常ヒト状態、静止射撃を基本条件とする。実機比較は未実施。

| 指摘 | 今回の結果 | 状態 |
| --- | --- | --- |
| ワイパー横斬りの生成位置 | 3種の `ShotBulletOffset_L/R` を足元基準・照準の水平回転に適用。縦斬りも同じ経路で元の専用オフセットを適用。弾・発射エフェクト・照準・ネットワーク生成位置を接続 | 実装修正・ブラウザ確認済み。実機同等性は未確認 |
| スクリュー／オーバーフロッシャー飛行中の飛沫 | 衝突前の区間で飛沫が生成されない／区間終端にまとめて生成される不具合を修正。渦38／各泡32ダメージは変更前から存在し、実際の発射経路で確認 | 生成処理を修正。独立落下飛沫の追加対人ダメージは根拠未確定・未追加 |
| 床・壁の本家塗りマスク | 11.3.0 のマスク画像・選択規則を取得できていない | 未完。数値由来の代替形状を継続 |
| ステージの専用判定 | 対象版の専用衝突・塗り・金網・壁登り属性データを取得できていない | 未完。表示メッシュ由来の推定を継続 |
| マヒマヒの可動地形 | 改修後モデルの可動物配置変換・水位状態／遷移の原典データを取得できていない | 未完。既存の `placement-unavailable` を維持 |
| エリア／ヤグラ／ホコ／アサリの地形と配置 | 原典のルール別配置・ルート・チェックポイント・ゴール・地形差分を取得できていない | 未完。ローカル調整値を原典と扱わない |

## 実装と再現操作

`patches/splatoon3/runtime/main-weapon-catalog.mjs` の `origin` / `emitSingle` / `Projectiles._step` が変更箇所。

- ワイパー3種で横斬りを出す。旧実装は表示ブキの銃口から生成していた。修正後は `ShotBulletOffset_L/R` を使用し、現在の抽出行では両側とも `(X,Y,Z)=(0,1,1.4)`。左右値が現在同一であることと、左右別フィールドに対応することを区別する。左右順序はローカルの交互選択であり、本家の初回側・中断時のリセット規則は未確認。弾が実際に生成されたときだけ側を進める。
- 横斬りの生成位置を、表示モデルのソケットから独立させた。生成点から照準点へ方向を計算し、発射通知も同じ生成点を使う。縦斬りは従来の `ShotBulletOffset_Vertical` の数値を保持する。壁が前方の生成点との間にあるときは既存の `constrainMuzzle` で手前へ制限する。この壁際補正は INKWAVE の実装で、本家エンジンの復元ではない。
- スクリュー／オーバーフロッシャーの飛沫で、1 tick 内に複数の生成距離を通過させる。旧コードは1個を終端へ出し、衝突時は先に return して直前の飛沫が欠けた。修正後は、通過した全生成距離で放出し、最初の衝突・射程・寿命で区間を切る。テスト条件「1 tick で10進む・生成間隔1・衝突2.5」では `z=1,2` のみ生成する。旧コードでは壁衝突時は0個、射程／寿命切れでは終端10へ1個出るケースがあった。
- スクリューの `UnitGroupParam.Unit[1]` は既に独立した外周判定を持ち、38ダメージ。オーバーフロッシャーは4個の泡が別々の攻撃単位で各32ダメージ。これらと `_s3SplashDrops` の落下塗り飛沫を区別する。`DrawSizeCollisionPaintParam.CollisionParam` に Player 半径があるだけでは、その飛沫の追加ダメージ量・共有上限・接触後の挙動までは確定しない。見えている全粒子へ38／32ダメージを付与する変更はしていない。

プレイへの影響: 横斬りの出始め・壁際・近距離の接触位置と照準が変わる。飛沫の落下開始点・生成漏れが変わるため、床・壁の塗り結果が変わり得る。既存の飛沫数、間隔、落下重力、塗り半径、ダメージ曲線は変更していない。落下モデルの `.016` 重力、最初の飛沫配置規則、マスク輪郭は引き続き本家と未照合。

## 資料の確認

- Drive 公開ソース集の `Splatoon-public-sources-part-01-of-19.zip` を取得し、`SOURCE_INFO.txt` と `HOW_TO_RECONSTRUCT_ALL.txt` を読んだ。説明には Splatoon 3 RomFS を含まないことが明記されている。`thick/model/PaintTexture.szs` は Splatoon 1 側の資料であり、Splatoon 3 11.3.0 の塗りマスクとして流用しない。
- Drive の `INKWAVE-stage25-f2c87085.patch` も取得して確認した。説明は「原典メッシュ・衝突・完全配置を取得していない」「全座標は authored values」「prototype placements」と明示している。マヒマヒの記述があっても、原典の可動地形配置ではない。
- Drive 検索は `Splatoon`, `Hiagari`, `phive`, `PaintTexture`, `placement`, `mask` と関連フォルダを確認。元の必要ファイルは確認できなかった。検索で見つからないことを、Drive 全体に絶対存在しない証明とは扱わない。
- [固定 Leanny/splat3](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6) の完全なGit tree（19,488 entries、`truncated=false`）を取得し、関連パスを調査。SceneInfo等のカタログとブキ数値はあるが、今回必要な原典マスク／可動物配置／専用判定は確認できなかった。ブキ5行は raw ファイルを再取得し、カタログに記録された SHA-256 と一致した（`source-verification.json`）。
- [任天堂の更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/~/splatoon-3-update-history) はスクリューの「渦」の攻撃と薄い地形の遮蔽問題、および泡のダメージを扱う。独立落下飛沫の追加ダメージ仕様を示す根拠とは扱わない。
- 公開情報も `Vss_Hiagari04` / stage placement / paint masks 等で探索したが、今回の版と照合できるデータは発見できなかった。原典データが見つかるまで、配置・マスク・判定を推測で完全再現済みとしない。

必要な追加資料は、版が分かる Splatoon 3 の塗りマスクと使い分け情報、専用衝突と塗り・金網・登攀属性、各ステージ・各ルールの配置とルート、マヒマヒ改修後の可動物変換と水位状態、独立飛沫のダメージ仕様を確定できる資料。Drive の別保存先があればそこから継続できる。

## 検証

- 新規18件（横斬り6、飛沫と既存攻撃12）: source と最終 minified build の両方で全件成功。変更前 runtime を差し戻した同一検査では13件失敗／5件成功。既存渦・泡のダメージ2件は変更前も成功。
- 新規18件＋既存 main catalog 24件: 最終 source 42/42成功。
- 関連回帰35件、既存生成距離7件、マヒマヒ等の既存ステージゲート4件: 成功。生成方向変更後に65ブキの到達可能床・塗り所有権検査も再実行し成功。
- `build-inkwave.mjs`: 成功。
- Chromiumの既存catalog検証: 58追加ブキ、887発、metadata/ghost等を確認して成功。
- 実際の production `Character` と `WeaponRunner` を使うChromium検証: ワイパー3種×4方向の12件。生成位置誤差0、発射イベント位置誤差0、生成点からの照準方向が一致。`browser-origins.json` に記録。制御した空のステージでの数値検査であり、本家実機・描画品質・実ステージの対戦検証ではない。

再実行例（Node のVM試験にはフラグが必要）:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/catalog-saber-origin.test.mjs patches/splatoon3/tests/catalog-slosher-flight-contact.test.mjs patches/splatoon3/tests/main-weapon-catalog.test.mjs
node scripts/build-inkwave.mjs inkwave-public work/site
INKWAVE_BUILT_SITE=work/site node --experimental-vm-modules --test patches/splatoon3/tests/catalog-saber-origin.test.mjs patches/splatoon3/tests/catalog-slosher-flight-contact.test.mjs
node scripts/check-inkwave-saber-origins-browser.mjs work/site work/origins-browser.json
CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node scripts/check-inkwave-catalog-browser.mjs work/site
```

## 2026-10-17: 最新mainへの追従とスクリューの地形遮蔽

PR先は `rhgrive3/actions`。最新main `9fe55aa056d6b5c31773254a4796c7db50df02f8` をベースに既存修正を移した。

スクリューの外周攻撃はField半径0なので、弾の中心が壁に触れなくても、横へ広いPlayer半径が壁の反対側の相手に届き得た。`spiralContactClear` を追加し、swept capsuleの最初の接触時刻における弾中心から、相手のhurt capsuleの最寄り表面まで地形segmentを照会する。地形に遮られた候補だけを除外し、渦を消費しない。透明でないNoPaint三角形も遮蔽し、金網は既存の弾透過規則どおり無視する。足元へのLOSではないので、接触より低い障害物によって上半身への攻撃が無効にならない。

比較根拠は任天堂の更新履歴の「薄い地形越しに渦が相手へダメージを与える問題」の修正。上記segment方式はINKWAVEの工学的な修正であり、本家の遮蔽アルゴリズムの抽出ではない。遮蔽候補へ同一tick内の後半に回り込んだ場合の厳密な再接触時刻や、本家実機の境界一致は未確認。影響は `WeaponSlosherLauncher` の外周ユニットだけに限定し、芯の76ダメージとオーバーフロッシャーは変更しない。

`catalog-machine-occlusion.test.mjs` は実際に生成した外周弾で、30/60/120Hzの薄い横壁、遮蔽なし、金網、低い障害物、ghost、native NoPaint三角形／金網を確認する。追加前は遮蔽4条件で壁越し38ダメージを再現し、追加後は9件すべて成功した。今回の回帰検査とproduction Characterのブラウザ検査を `inkwave-main-weapons.yml` に登録した。

塗れる面の追加調査では、一次資料 [ToolboxPaintFix](https://github.com/nvnprogram/ToolboxPaintFix/tree/a135901547ee854d826eb018a66b049a3ed76657) の実装がBFRESのshader option `blitz_paint_type` とvertex attributes `_pu0/_pu1/_pu2` を扱うことを確認した。一方、固定KiTrixの `Vss_Yagara.mtl` は `newmtl/Kd/map_Kd` だけで、元のshader optionを含まない。現行MTLの名称推定をこれだけで本家属性へ置き換えることはできない。固定Leanny treeの11.3.0 parameter配下も `byname/catalog/manual/misc/weapon` で、必要な可動地形配置・専用衝突・マスクは見つからない。元データが不足している塗り輪郭、マヒマヒの配置／水位、原典ルール別配置の未完状態は維持する。

公開サイトへのデプロイはしていない。

最新mainを含む最終PR検証: source 80件中79成功・失敗0・元Bluefinアセット不在によるskip1、production buildの新規27件は全件成功。Chromiumのproduction Character 12方向・生成点誤差0と、既存追加58ブキ887発の検証も成功。現在のbuild fingerprintと追加調査の照合結果は `verification-summary.json` / `browser-origins.json` に記録する。上の2026-10-16の件数は初回確認の履歴であり、JSONは最終PR検証へ更新済み。
