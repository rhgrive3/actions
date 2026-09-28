# INKWAVE 追加処理改善調査（第2回）

- 日付: 2026-09-29 JST
- 対象: rhgrive3/actions / inkwave-public/
- 基準: `b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd`
- 状態: 中間保存。ゲーム変更なし。実機性能は未測定。

## 前回修正の再確認

前回プローブを再実行し、60Hzで解像度回復、下限0.6、無塗装の乾燥描画0、タッチ60fps上限、Boss preload除外（92モジュール・Boss 0）を確認。資源解放については配線の確認であり実GPUメモリの測定ではない。

## 追加候補

1. **ボム/雲の寿命管理**: weapons.jsは個別materialを生成するが、消滅/clearでscene.removeするだけ。clearでは雲のloop.stopも呼ばない。自然消滅は音を止めるがmaterialを解放しない。
2. **投擲予測の再計算**: updateArcは照準固定でも毎フレーム最大126回segment照会し、computeLineDistancesを呼ぶ。入力/位置が同じ場合の結果再利用を検討。
3. **弾インスタンスの全量更新**: _drawは空のlistでも3属性をneedsUpdateにし、live範囲の指定がない。700個分のmatrix/color/shapeを対象とする。
4. **水面反射の別シーン描画**: marinaで毎フレーム反射シーンを描画。端末別の反射更新頻度や実効品質は別途検討可能。
5. **品質変更の伝達先**: Renderer/ScreenFX以外の影サイズ・既存FXは起動時設定を保持する経路がある。lowへ切り替えた際の期待効果を確認する。
6. **ミニマップの終了時再描画**: animatedがtrueからfalseになる瞬間にdirtyを立てていない。最後のボムが水没した場合やflash終了時の表示残りを再現確認中。

最終報告にコードの固定リンク、再現結果、優先度と検証手順を追記する。
