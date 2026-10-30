# 支援系Botスペシャル 2026-10-30

対象基準: `5d6480b2e2c1a8afa789bcc1415bae586e3156cb`の作業用worktree。変更はBotの入力判断のみ。威力・効果・飛翔物理・消費ゲージ・本家参照値を変更しない。AIの距離閾値、照準許容値、待機時間はINKWAVE用調整で、本家の確定値ではない。

## 実際に閲覧したWikiと用途

2026-10-30に各ページの概要・仕様・運用を閲覧した。ページの表は項目別の参照バージョンを持つため、全体を最新版の実機測定とみなさない。

| 対象 / 参照 | 理解した用途と入力 | 今回の判断 |
| --- | --- | --- |
| [グレートバリア](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/グレートバリア) | 地面設置、外からの攻撃を防ぐが敵の侵入は防げない。味方保護・足場維持 | 近すぎる敵、崖・壁越し、不用な同位置重複を避ける。近い味方と既存目標も利用 |
| [アメフラシ](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/アメフラシ) | Rで装置を投げ、接地して進行方向へ雨。塗り・継続圧力・味方回復 | 実際の押下とrelease、床へ着地する低軌道照準、既存雨と重複抑止 |
| [トリプルトルネード](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/トリプルトルネード) | 3つのガイド装置を投げ、範囲圧力・退路制限・対物 | `shots`、`nextMarkerStart`、`throwAt`に追従して3投。標的周囲に横方向の間隔を取る |
| [エナジースタンド](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/エナジースタンド) | 投擲後、味方がヒト状態で近づき機動力・復帰力を得る。攻撃はしない | 敵の有無ではなく近い未強化の味方で起動。近距離戦中・利用可能な既設スタンド付近を避ける |
| [デコイチラシ](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/デコイチラシ) | 地点指定、広い楕円へデコイを置いて注意を引き塗る | 既知の前線・塗り目標へ照準し、実際に照準が合って接地してからFire |
| [スミナガシート](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/スミナガシート) | R投擲、前進する視界妨害。弾を防ぐ壁ではない | 進みたい既存目標・見えている脅威の手前へrelease。保護アーマー扱いにしない |
| [ホップソナー](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ホップソナー) | 地面設置、波が探知・ダメージ。装置は破壊可能で上下到達幅に制限 | 敵の足元へ直投げせず自陣側へ設置。大きい高低差・重複を避ける |

## 実装事実と変更

従来の `canonical-kits.mjs` はトリプルトルネード・スミナガシート・ソナーにFireパルスを送り、`all-specials.mjs` が必要とする `edges.subUp` を一度も作らなかった。新しい `driveSupportSpecial(ctx)` は共通Bot contextから呼ぶ入力driverであり、`intent.sub=true`を実際に保持してからfalseにする。三連投は放出確認まで同じ照準を維持し、その後次の装置を構える。Stormの独立した強制sub adapterは共通core側の削除と組み合わせる。

投擲照準は現行の `specialDeviceFlight` / `fidelityThrowVelocity` と現行gravityを読み、目標床へ到達する低い角度を予測する。実弾の運動・当たり判定は元のActor/Projectilesが担当する。地形確認は少数の経路segment、味方は近傍roster、既設支援は準備時にのみ読む。見えなくなった敵の現在位置を追跡せず、既存の塗り・目的地を利用する。

## 検証

- `node --check patches/splatoon3/runtime/bot-special-support.mjs`: 成功。
- `node --experimental-vm-modules --test patches/splatoon3/tests/bot-special-support.test.mjs`: 12/12成功（約20秒）。実際の合成済みActor / Projectiles / Level / Physicsを使用。
- 7種の起動→放出→設置完了、3投の30/60/120Hz、敵がいない味方支援、既設支援付近の再起動抑止、不可視の敵のみ・床なし・近すぎる侵入敵・壁による抑止。
- テストのdriver contextは照準の結果をActorへ適用する。共通BotBrainのspringとadapterの最終統合はcore/親作業の検証範囲。

実機比較やNintendo Botの再現を確認したものではない。低軌道予測は動く足場・空中慣性・dragを含む完全な命中保証ではなく、現行物理に渡す入力を安全側に選ぶための近似。グローバル比較記録へのリンク追加と統合SHA記録は統合担当が行う。

## 追加改善: 実BotBrainからの支援完了 (2026-10-30)

基準 `3715e29d1656a00b853f73e12a89624b17985b7c`。実BotBrain / aim spring / native移動 / Actor / Projectiles / Level / Physicsを使い、エナジースタンドで味方rosterを除いた前線対面を実行したところ、180F待っても一度も使用しないことを再現した。キャスター自身にもドリンクの価値があるため、現在ドリンクがなく、見えている前線または既存の前進目標がある場合は自己支援の設置も許可する。空の短距離塗りルート・スポーン待機・近距離戦への無条件発動は加えない。

追加テスト `real solo BotBrain deploys Tacticooler for its own frontline push and receives a drink` は変更前失敗、変更後成功。入力の意図だけでなく、現行物理で着地したスタンドからnativeのdrinkが実際に取得できるところまで確認した。
