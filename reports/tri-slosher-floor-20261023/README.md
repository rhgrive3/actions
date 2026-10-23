# ヒッセン床滴の表示修正候補 — 2026-10-23

状態: **INKWAVE の回帰・本番生成物・制御ブラウザA/Bは成功。本家の同条件映像による最終見た目承認は未完了。マージしない。**

追記: このフォルダの `native-before/after` は色と外観が異なり、完全同条件の見た目A/Bではない。物理記録と区別する。訂正済み18Fペアとmain7eの新しい制御replayは [main7e候補記録](../tri-slosher-floor-main7e-20261023/README.md) に原画像を残して保存した。以下の旧結果は当時の履歴であり、新候補のexact-head CIや本家一致の承認ではない。

## 対象・本番経路

基点は公式 main `726e338ac256ba9609086ce65e25a68ddd99df85`、新枝は `codex/tri-slosher-floor-droplets-20261023`。開始時に公式 open PR #1852 / #1853 / #1854 を読み、同件の修正がないことを確認した。#1854 の head `2e8d90b8afb6aac057edfbb988fae789ef36cfd3`、ローラー担当、シューター／スピナー担当は変更していない。

読み取り: ルート `AGENTS.md`、`scripts/inkwave-source-composition.mjs` / `build-inkwave.mjs`、`patches/splatoon3/adapter.mjs` / `weapons-adapter.mjs` / `projectile-visual-adapter.mjs`、runtime の `main-weapon-catalog.mjs` / `blaster-flight-paint.mjs` / `projectile-presentation.mjs` / `projectile-visuals.mjs`、既存Slosher/共有Bucket/塗り試験。

本番の追加ブキRunner → `main-weapon-catalog.mjs` の距離スケジューラ → `spawnSplashDrop` → `_s3SplashDrops` の固定60Hz落下・着地塗り → composed `Projectiles._drawLegacy` → `appendSourcedSplashVisuals` → 既存instanced blob shader、という経路で再現した。生成後の `src/game/weapons.js` と runtime を実Chromiumで読み、既存blobの実instance行列を取得した。未使用のleafだけを修正したものではない。

## 再現・変更

旧表示は床用paint dropの `drawRadius=.2/.3` を無補正で使い、初速ゼロから重力が加わった最初のstepで向きを真下に90度反転していた。親の主弾は水平照準で上向き速度成分を持つ。制御ブラウザの主弾初速は例として `vy=7.3374, vz=73.374`（INKWAVE単位／秒）であり、主弾の下向き発射を確認したという意味ではない。

runtimeの変更は `projectile-presentation.mjs` の `appendSourcedSplashVisuals()` と既存importだけ。

- `sourceActor === 'WeaponSlosherDiffusion'` の床滴だけ、既存の `VISUAL_WIDTH_CALIBRATION.bucket=.5` を適用する。実instanceの半径は `.2→.1`、`.3→.15`。
- 同じ床滴だけ、すでにpaintのため保存している水平heading `dirX/dirZ` で表示を向ける。新しい飛行や粒子は生成しない。
- 表示位置は物理dropの `pos` のまま。滴が実際に落下する運動自体は維持する。**これは外観の軸修正であり、物理発射角の変更ではない。**
- 半径 `.5` は既存INKWAVEの見た目補正であり、任天堂の新しい半径値・実測メートル換算ではない。3方向の主弾、Bucket共有アート、アニメーション、他ブキ、generic粒子、重力は変更しない。

## 本家資料と未確認事項

[固定パラメータ原典](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherDiffusion.game__GameParameterTable.json) は読取可能。版はSplatoon 3 **11.3.0**、actor `WeaponSlosherDiffusion`。床滴の `DrawRadius` はunit1が `.2`、unit2/3が `.3`、player collision radiusは0。これらの値だけで任天堂の表示メッシュ・実際の発射角・省略既定値を回復できるとは言わない。

映像取得の阻害: `curl -fsSL https://www.nintendo.com/jp/character/splatoon/fashion/index.html` が **HTTP 403（アクセス拒否、取得未実行）**。別のweb読取ではページ説明文だけが読めたが、同条件ヒッセンの映像・フレームは得られなかった。拒否された取得の再試行、認証追加、迂回はしていない。参照映像の実ゲーム版、ギア、actor運動、照準角、FOV、ZR入力tickは未確認。Nintendoの映像・画像はrepoへ追加していない。

したがって「本家と全然違う」という訴えのうち、太い球と真下向きの表示機構には修正を入れたが、**本家と一致する飛沫形状・発射角・native frame timingの最終確認は残る**。同条件の合法的にアクセス可能な映像が必要。

## タイミング・画像

`before/` / `after/` は同じカメラ位置 `[-11,5,5]`、垂直FOV42度、960×640、固定照明、同一actor・motion bank、同一seed条件。静止・pitch0と、横移動・pitch -20/0/+20度 × 30/60/120Hzの10条件。表示は通常のlow予算。

全traceのtickは **INKWAVE 60Hz simulation frame**。スクリーンショットはtick30/42/44/48/54/60/72/90/120を抽出。fireはtick30で1step入力、最初のmainはtick43に現れる。この番号を原作入力後フレームや動画のencoded frameとして扱わない。WebGLは9つの共通tickで撮影し、全render cadence連続動画の合格とは区別する。

| simulation frame | 修正前 | 修正後 |
| --- | --- | --- |
| 48 | [before](before/60hz-pitch0-still-sim48.png) | [after](after/60hz-pitch0-still-sim48.png) |
| 54 | [before](before/60hz-pitch0-still-sim54.png) | [after](after/60hz-pitch0-still-sim54.png) |

PNGは目視確認した。床は診断用無地のplaneで、CPU塗りを画面上のpaint textureとして描いてはいない。球の大きさと向きは実instance行列でも測定した。pixel径からメートルを算出していない。

## 検証結果

- 新回帰のサイズと向きの2件は旧minify生成物で両方失敗し、物理不変の対照1件は旧版でも成功（`logs/tri-slosher-old-emitted-negative-v2.log`）。
- focused source **29/29**、同じ本番minify出力 **26/26**。他のSlosher、Shooter、Charger、共有Bucket、VFX無塗りを含む。
- 追加のbirth-speed/塗りoracle source **8pass、1skip**。skipはemitted専用。emitted塗りgoldenを別実行し **3/3成功**。
- before/after本番buildが成功。canonical input差分は **`patch/runtime/projectile-presentation.mjs` のみ**。hashは [build-proof.json](build-proof.json)。2本のbuildと各初期・中間ログを保持する。
- 制御Chromium A/B **10/10条件・80描画行列**。120 simulation ticks × 10条件 × before/after。全trace・paint stamps・CPU grid hashが同一。damage、位置、速度、ink、塗り半径、seed、着地frameを含む。各照準の30/60/120Hz traceも同一。[独立比較receipt](comparison.json)。
- peak main **9→9**、peak queued floor drops **5→5**（下向きpitchでは早く着地しpeak4）。blobの描画数・48capは維持。新規mesh/material/draw callやdrop poolは追加していない。
- 実測update CPU medianはbefore **0.4–0.8ms**、after **0.5–0.8ms**。120samples/条件、SwiftShader/共有cloud CPUのwarmup・量子化雑音を含み、性能同等や高速化は断言しない。詳細は各receipt。物理デバイスGPU性能は未確認。

通常のメニュー→mode→練習場へtrusted clickで入った native `_frame` のbefore/afterも **両方成功**。入力後1/12/14/16/18/22/28/36 simulation framesを撮影し、actor位置・照準・主弾数・床滴数・CPU paint cellsが8点すべて一致、最終1315 cells。半径と向きの変化は実instance行列で再確認した。[native比較](native-comparison.json)、[before18F](native-before/sim18.png)、[after18F](native-after/sim18.png)。startup file/dependency budgetも成功。最終のCIは候補PRのexact HEADで読取し、pending・未実行を成功扱いしない。

## 再実行

```sh
node scripts/build-inkwave.mjs inkwave-public /tmp/tri-slosher-after
node --experimental-vm-modules --test patches/splatoon3/tests/tri-slosher-floor-visual.test.mjs
INKWAVE_BUILT_SITE=/tmp/tri-slosher-after node --experimental-vm-modules --test patches/splatoon3/tests/tri-slosher-floor-visual.test.mjs
node scripts/check-inkwave-trislosher-floor-browser.mjs /tmp/tri-slosher-after /tmp/tri-slosher-after-browser --full
node scripts/compare-inkwave-trislosher-floor-browser.mjs /tmp/tri-slosher-before-browser-v3 /tmp/tri-slosher-after-browser /tmp/tri-slosher-browser-comparison.json
node scripts/check-inkwave-trislosher-floor-native-browser.mjs /tmp/tri-slosher-after /tmp/tri-slosher-native-after
```

最初のbrowser試作はslim Threeに未収録のGridHelperで停止した。削除して再実行した。次の中間撮影はactorが左端に切れたため採用せず、カメラを揃えたv3を正式なA/Bにした。旧ログ・旧PNGは `intermediate/` に別保存し、新結果に偽装しない。
