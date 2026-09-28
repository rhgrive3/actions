# INKWAVE スマホ向け処理改善調査

- 調査日: 2026-09-29 JST
- 対象: rhgrive3/actions / main / inkwave-public/
- 基準コミット: `bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d`
- 状態: 中間報告。コード確認済み、端末実測は未実施。
- 依頼範囲: 調査とレポート保存。ゲームコードは変更しない。

## 現時点の主要所見

| 優先 | 改善候補 | コード上の根拠 | 確認範囲 |
|---|---|---|---|
| 高 | 動的解像度の回復条件・下限を修正 | src/main.js:938–954 は低下条件40fps未満、回復条件75fps超、最大2回の回復。src/core/renderer.js はタッチ端末下限0.6だが呼出側は0.75付近で停止 | 60Hzの通常描画間隔では回復条件を満たさない。関数の再現確認予定 |
| 高 | モバイル品質設定を一元化 | src/main.js:127,225 はbloom:false、src/core/renderer.js:128,156–158,189 は元のQUALITYを再使用しiOSだけBloomを抑制 | Androidのmedium以上かつ設定ONではBloomが有効になり得る |
| 高 | Composer再構築時に旧Passを解放 | src/core/renderer.js:135 は2個の主renderTargetだけをdispose。Bloom/GTAO/ShaderPassの解放がない | GPU使用後の品質変更を繰り返す場合の資源残存リスク。実メモリ増加量は未測定 |
| 中 | 高リフレッシュレート端末の描画上限 | src/main.js:926–936 はrequestAnimationFrameごとに全フレーム実行 | 90/120Hzで実行可能な環境では60Hzより多く更新され得る |
| 中 | インク乾燥完了後の不要描画を止める | src/world/paint.js:603–650 は乾燥タイマーで定期描画し、全体が乾いたことを判定しない | 無塗装・乾燥後にも定期的なatlas描画が残る |

## 既存の軽量化として維持するもの

DPR上限（iOS 1.2、他のタッチ端末1.35）、モバイルMSAA/GTAO無効、paint atlas 2048上限、粒子上限、ShadowCache、キャラクターLOD、インク描画のバッチ化と部分属性更新、ミニマップの更新制御、ビルド時minifyとThree.js tree-shaking、タッチ・ジャイロ・Safe Area。

既存の最適化を「未実装」として提案しない。FPS改善率・発熱低減率はスマホ実測が終わるまで断定しない。

## 次の調査

動的解像度の再現、旧Passの所有権確認、HUDとロビー背景処理、初回読み込みの依存グラフ、改善順序と検証手順を追記する。
