# Ink Storm / アメフラシ：一時的な雨域境界の候補

基準は `inkwave/special-frame-comparison-20261023` の **a4e81347906c0d60ceef76a69f476261bf8d3f86**、tree **34236683e6776aac9d8b1d4ae0b8a1b31d3f2df2**。取得後に両方を照合し、専用ローカルブランチ `inkwave/ink-storm-boundary-20261023` で作業した。初期の既存 work は clean。main、比較ブランチ、PR1844 の head は更新していない。PR作成・pushもしていない。

## 比較根拠と確認状態

親の観察：encoded 30fps の参照 f140–205 のうち **f173–183** で、雨域の細い境界が壁から床へ続き、雨域と移動する。これは親から受け取った観察であり、この担当が参照画像を見た証拠ではない。参照のゲーム版、ブキ、ギア、入力時刻、native FPS は不明。本担当は当該映像を取得・閲覧していない。既知の GameWith HTTPS 403 を別経路や MP4 URL で回避していない。

INKWAVE 元版では `weapons.js::_updateClouds` が雲、雨粒、雨の通常塗りを更新し、`fxHooks.js::_clouds` は水滴・短い開始リングなどを補う。生存する雲の壁・床面に追随する境界はなかった。元版の通常起動・実入力・実画面でも線の欠落を確認した。

本候補は、**壁→床の一時境界という構造的差を改善した検証済み候補**。本家との画素・タイミング一致の認定ではない。親に **参照録画 f170–186** の壁上端・床接点・線幅・明度、**f185–205** の雨域との移動関係を補完比較してほしい。開始・終端の正確な参照フレームも未確認。

## 変更と所有範囲

- `patches/splatoon3/runtime/special-motion.mjs`：既存 `installSpecialPresentation` 内の **Projectiles._updateClouds / _releaseCloud** の接続だけ。import と SPECIALS の受け取りを追加。既存 `_spawnCloud`、throwStorm、キャラクターの処理は変更しない。親の共有ファイル統合時には、この2フックだけが所有範囲。
- `patches/splatoon3/runtime/storm-boundary.mjs`：専用の一時 Mesh / ShaderMaterial。既存の近傍面検索を利用し、雲の水平半径に沿う細線を壁・床面上へ描く。radius と中心は既存の雲に従う。独自の塗り、当たり、攻撃、通信、操作ロックを作らない。
- 通常の矩形面は面の三角形、原典ステージのチャートは **元の三角形** を使う。チャート外接矩形で穴を埋めない。天井・非塗布面・hiddenな移動ハードウェア（ヤグラ等）は対象外。動くヤグラへ古い床メッシュを残すのを避けるため、その面の境界は描かない。
- 近傍面は0.75WUの移動ごとに再収集し、その間はuniformだけを更新。雨の終了とともに非表示になり、雲のexpiry / clear / 明示releaseでgeometryとmaterialを一度だけ破棄する。死亡しても既存の雲が続く仕様に従う。
- 境界は深度テストあり、深度書込なし。既存の `excludeFromOverridePasses` を利用してAO/深度のoverrideに不透明な面を出さない。**共通シェーダー／材質の編集なし**。

幅、明度、開始・終端フェードはINKWAVE内の暫定描画値で、本家の実測値ではない。モデル、髪、他スペシャル、攻撃値、物理、当たり、通信、発動・操作ロック時刻、元の通常塗り処理は変更していない。`paint.splat` を境界の代わりに使っていない。

`inkwave-public/` の直接接続も検討したが、既存 compatibility lock が変更を検出したため、その試行3行をすべて戻し、既存パッチ層へ接続した。lockは変更していない。これはビルド互換性ガードであり、ブラウザや承認の拒否ではない。

## 検証

関連ロジック **38/38**：`storm-boundary`、`storm-effects`、`special-presentation`、`storm-throwlock-resources`、`storm-lifetime`。床＋壁の実座標、原典三角形の穴、hidden移動面の除外、override描画の復帰、expiry / clear / 二重releaseで一度だけ破棄、死亡時の雲の継続を確認した。source所有権・Pages identity検査 **16/16**、production buildとstartup budgetも成功。

通常ゲームのブラウザ検証：`/usr/bin/chromium`、headless、WebGL2、SwiftShader、960×640、quality low、shadows/bloom/minimap off。標準の試し撃ちを起動し、実Characterのロードを待った。`charger_scope`（Stormを持つ実キット）、座標 `[-28,0,39]`、yaw 0 / pitch -0.35、初期ゲージを制御し、**通常のQ発動→E押下→E解放**で実Stormを投げた。投擲メソッドや物理は置換していない。通常カメラのfollowを使用した。

ローカル画像の **simf15/45/90/120/180/300/600** は、E解放後から数えたINKWAVE simulation ticks。参照録画の f173–183 や native FPS との対応値ではない。simf90の雲はt=1.4秒、simf120はt=1.9秒で、線が壁から床へ続いて移動する。simf600は雲も境界も消えている。

- **元実装 negative control**：元版 special-motion のbytesを基準commitと照合して別ビルド。境界必須の検査は元版をrejectし、候補をacceptした。
- **source / emitted**：両ビルドの全artifact hashを検証。ビルド入力の差はspecial-motionと新規storm-boundaryの2モジュールだけ。最終候補source hashもmanifestと一致。
- **30/60/120Hz**：各描画スケジュールで123回の固定60Hz actor tick。各Hzで元版と候補の状態trace hash、塗りグリッドhashが一致。Hz間でも最終状態と塗りhashが一致。死亡後の雲継続→clear→次の独立発動を3回確認。これはrender delivery差の検査であり、native simulation FPSの変更ではない。
- **描画対照**：simulationを進めず同じ `R.render()` で境界のvisibleだけを切り替え、4,246画素の差を確認。通常画面には追加 **1 draw / 52 triangles / 156 vertices**。雨域の移動や塗りを変更していない。
- **負荷**：同じ凍結画面をon/off交互12回。warm render + gl.finish の中央値はon 0.8ms / off 1.0ms、p90はon 1.0ms / off 2.2ms。ソフトウェア描画・少数回のばらつきであり、高速化や無負荷を意味しない。CPUの面再収集時間、複数雲、大規模原典ステージ、実機GPU/mobile/Safariは未測定。

照合結果とhashは [JSON](inkwave-ink-storm-boundary-2026-10-23.json)。physics.raycast総数は表示側の問い合わせも含むため、等負荷の性能指標として使っていない。

## 実画面と検査表示（ローカル保存）

通常ゲーム画面：

- 元版：`/workspace/actions/.ci-scratch/storm-evidence/base-final/normal-throw-simf90.png`
- 候補：`/workspace/actions/.ci-scratch/storm-evidence/candidate-final2/normal-throw-simf90.png`
- 移動後：同ディレクトリの `normal-throw-simf120.png`
- 終了：同ディレクトリの `normal-throw-simf600.png`

検査表示：

- 境界だけを一時的に隠した同一ゲーム画面：`candidate-final2/inspection-boundary-hidden-simf90.png`
- 壁＋床だけの描画fixture：`inspection-final/inspection.png`（通常ゲーム画面ではない）。3,263画素差、追加1 draw / 20 triangles、GL error 0。

いずれも上記 `.ci-scratch/storm-evidence/` 配下。任天堂の映像や画像は同梱していない。

## 再現コマンド

```sh
node scripts/build-inkwave.mjs inkwave-public .ci-scratch/storm-final2-site
node --experimental-vm-modules --test patches/splatoon3/tests/storm-boundary.test.mjs patches/splatoon3/tests/storm-effects.test.mjs patches/splatoon3/tests/special-presentation.test.mjs patches/splatoon3/tests/storm-throwlock-resources.test.mjs patches/splatoon3/tests/storm-lifetime.test.mjs
node scripts/check-inkwave-storm-boundary-browser.mjs .ci-scratch/storm-final2-site .ci-scratch/storm-evidence/candidate-final2
node scripts/check-inkwave-storm-boundary-inspection.mjs .ci-scratch/storm-final2-site .ci-scratch/storm-evidence/inspection-final
node scripts/check-inkwave-storm-boundary-evidence.mjs .ci-scratch/storm-base-site .ci-scratch/storm-final2-site .ci-scratch/storm-evidence/base-final .ci-scratch/storm-evidence/candidate-final2 reports/inkwave-ink-storm-boundary-2026-10-23.json
```

元版サイトは基準commitを別checkoutで通常buildしたもの。検証に使用したビルド・元版／候補画像・ログはworkspace内に保持。これらのコマンドは通信・PR・公開操作をしない。

残件：親による参照録画との最終比較。境界は静的な露出面への近似で、屋根による雨の遮蔽を別途レイ検査しない。非塗布面、移動ハードウェアには境界を描かない。原典ステージは三角形単体の形状テストまでで、原典実ゲーム画面の受入は未実施。これらを解消済み・本家比較完了とは扱わない。
