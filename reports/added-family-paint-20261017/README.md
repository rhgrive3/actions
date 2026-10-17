# 弓・ワイパー・シェルター・マニューバーの床塗りと飛沫

対象: `rhgrive3/actions`、公開版 `inkwave-public/` に production adapters を適用した実装。ベースは `f75aefae5c7e08cf23a8369cc606a1080a826b5c`。比較基準は既存カタログと同じ Splatoon 3 **11.3.0**、ギアなし、通常ヒト状態、静止射撃（別記したスライド・パージを除く）。本家実機比較は未実施。

初代になかった武器種として、ストリンガー3種、ワイパー3種、シェルター4種、マニューバー6種を監査。マニューバーの既存スプラマニューバーは native owner を維持し、追加5種を修正した。バケットスロッシャー・スピナーは初代に存在したので「初代になかった武器種」には含めない。別キットは同じベースメインの修正を継承する。

## 修正と再現

| 対象 | 旧実装の問題 | 変更箇所・再現操作・影響 | 確認状態 |
| --- | --- | --- | --- |
| 弓の拡散と生成点 | `ArrowAngleMin/Max` をダメージと同じ向きで補間。LACTがタップ0.5°、フル10.5°になっていた。`ArrowMargin` も未使用 | `main-weapon-catalog.mjs: emitArrow`。タップ・1周・フルを撃ち、10.5°→5°→0.5°と矢間隔0.2を確認。ジャンプの弓傾きに沿って発射位置も回転。離れた生成点にも地形ガードを適用 | 明示された角度・間隔の接続を修正。疎なトライの省略値は下記の未確認事項 |
| 弓の中間飛沫 | LACTの省略された個数を0扱いし、塗り飛沫が一切なかった。弓の `SplitNum` 未使用 | `added-family-paint.mjs` と `emitArrow`。高所から射撃し、距離単位の放出→60Hz落下→面への着地→床所有・得点の順序を確認 | 動作確認済み。省略個数と位相・落下モデルは本家未確認 |
| 弓の着弾塗り | 爆裂矢は地形へ刺さる分岐で即returnし、チャージ別の着弾塗りを消していた | `finishContact`。フルチャージの中央矢を地形へ当てる。着弾で幅3、45Fの待機中は追加塗りなし、起爆で別の塗りを1回発生 | ローカル射撃経路・minified buildで確認。マスク輪郭の一致は未確認 |
| ワイパーの横斬り・足元 | 波の明示重力0に引きずられ、飛沫は床へ即座に投影。`FootSplashPaintParam` と `NearestLen` を未使用 | `emitSingle` と距離スケジューラー。地上で足元を塗り、高所からは近接床がなければ塗らない。横/縦別の受理済み射撃位相、距離間隔、個数、重力0の波から独立した落下飛沫を使用 | 3種で確認。foot接地ガードと位相はINKWAVE側の実装 |
| ワイパーの終端飛沫 | `BurstParam.SplashPaintRadius/DrawRadius` 未使用で寿命切れの波がそのまま消える | 寿命切れに明示半径の独立した塗り用飛沫を生成。描画半径も明示値を使用。ダメージは追加しない。着地まで塗らず、既存のsource-shotマスクを1回使用 | 終端半径・落下・ghost抑止を検証。本家の終端分裂方向と接触半径は未再現 |
| シェルターの中間塗り | `spl__BulletShelterShotgunParam.SplashParam` 全体が未使用 | `emitPellets` と `collectBrellaSplashes`。各散弾が通過した生成距離を集計し、1射につき距離ごとに1個放出。生存散弾数から塗り幅・深さを補間。中央散弾が壁に消えても残りから生成し、全散弾が手前で消えた距離には生成しない | 4種で確認。活性率の線形補間と重心位置はモデルであり本家コードではない |
| シェルターの散弾配置 | `HorizontalOffset/VerticalOffset/AddDegree` 未使用。スパイの省略速度を汎用1 DU/F扱い | 射撃軸の右/上方向へ生成点を分離し、AddDegreeを適用。省略速度は中央散弾から継承。壁際は同じ生成点ガードを適用 | 実際の生成経路で有限性・塗りを確認。InitVelRandomの厳密な分布は未再現 |
| シェルターのパージ塗り | 描画更新ごとに塗り、傘が固い壁を通り抜けて塗り続けた | `canopyTrail / P.update`。距離間隔で床をサンプル。近くに床がない場合は塗らず、移動segmentの最初の地形で停止。壁の先に塗り中心を移動させない | 30/60/120Hzで地上・高所・壁を確認。本家の傘の斜面・段差・重力は未再現 |
| 追加マニューバー | native専用のスライド塗りをcatalog ownerが通らず、`SplashSlideParam.PaintWidthHalf` が未使用 | `dualies / tryDodge`。既存の距離サンプル・CPU/GPU共通roll footprintへ接続。5種の1.8/2.0の半幅を使用。空中では塗らない。終了時の最後の区間も処理 | 5種・所有権・得点・空中抑止を確認。MoveLength等を含む本家のスライド全体の完全再現ではない |

## 根拠とモデルの区別

- 一次数値資料: [Leanny/splat3固定コミット](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6) の `data/parameter/1130/weapon/Weapon{Stringer,Saber,Shelter}*.game__GameParameterTable.json`。10ファイルを再取得し、カタログに記録済みのSHA-256との一致を確認。URLと照合結果は `source-verification.json`。
- 公式挙動の補助資料: [任天堂の更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/)。Ver.5.0.0のLACT未チャージ・1周の拡散縮小、Ver.3.1.0のチャージに応じた集弾改善を確認。公式文章だけから省略されたフレーム値やエンジンの処理順を確定していない。
- `DropInterval / NearestLen / SplashNumMax / SplitNum / WidthHalf / DepthScale* / FootSplashPaintParam / ArrowMargin / ArrowAngle* / CreateSplashLength / CreateSplashNum / SplashPaint*Active / SplashSlideParam.PaintWidthHalf` は明示値がある場合その値を使用。
- `ADDED_PAINT_MODEL` は**本家の抽出済みデフォルトではない**。省略されたLACT個数5、パラシェルターの個数6、パラ/キャンプの間隔3、横斬りとシェルターの落下重力0.016 DU/F²を明示的なINKWAVE代替値として分離した。これらは要実機測定。共通飛沫の既存空気抵抗0.02、深さ補間、乱数速度も既存の解釈モデルを継続。
- 弓・ワイパーのSplitNumへの距離位相割当、初回の位相、中断時の扱い、各矢の個数上限共有、疎なトライのフルチャージ角度0、活性散弾率からの線形補間・重心も未確定のモデル。明示された数値の接続と、本家エンジンの復元は区別する。
- 今回も本家11.3.0の床/壁マスク画像と使い分け規則は得られていない。既存のパラメータ包絡形状を使用する。傘の完全な地形追従、壁滴り、飛沫の追加対人ダメージは完全再現済みとしない。

## 検証

結果は `verification.json` と `browser.json` に記録する。

- 追加28件: 実際のproduction compositionの Actor→WeaponRunner→Projectiles→Physics→CPU Paint を使用。接地・高所・壁・寿命・起爆待ち・ghost・owner死亡後・clear・スライド幅を検査。
- 同じ追加検査のうち21件を変更前mainへ適用すると19件失敗・2件成功。成功した2件は従来から落下飛沫があったトライ/フルイドであり、今回の成果に数え直していない。
- 既存のcatalog/paint reachability/slide検査を含む437件: 436成功・失敗0・skip1（元Bluefinアセット不在）。65メインすべてで到達可能な床の塗り・得点の一致も確認。
- minified production buildでも追加28件を検査する。
- Chromium: 実際のproduction Character・Physics・CPU Paintで15種×30/60/120Hzの45ケース。床の所有配列がフレームレート間で一致し、得点は床セル数×面積と一致。既存ワイパー生成点12方向の誤差0も確認。
- このブラウザ検査は制御床上のロジック検査で、GPU描画品質の画像比較、スマホ実機FPS、本家Switchとの塗りポイント・フレーム比較ではない。
- 既存総合 `check-inkwave-catalog-browser.mjs` は `Mist native deployment` で停止した。今回の対象15メインを専用検査で検証し、この総合probeの停止を成功扱いしていない。変更前mainの独立production buildでも同じ `Mist native deployment` を再現し、今回の変更による新規失敗ではないことを確認した。

再実行:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/catalog-added-family-paint.test.mjs
node scripts/build-inkwave.mjs inkwave-public work/release
INKWAVE_BUILT_SITE=work/release node --experimental-vm-modules --test patches/splatoon3/tests/catalog-added-family-paint.test.mjs
node scripts/check-inkwave-added-family-paint-browser.mjs work/release work/added-family-paint.json
```

新規のsource / minified / Chromium検証は `inkwave-main-weapons.yml` に登録した。
