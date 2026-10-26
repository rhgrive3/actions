# INKWAVE Library残キュー: 2026-10-26 時点の統合追記

この記録は、元ローカル統合パッチが既存の `reports/inkwave-splatoon3-behavior-2026-10-02.md` に追記していた内容を、最新main `e0072a749df0ec8c2d368e383bdf337baa7b44ad` の後着記録と競合しない独立ファイルに移したもの。事実関係は元のローカル検証時点のまま保持する。


## 2026-10-26: Library残キューのPR1878基準ローカル統合

基準は現在の集約PR1878 `dd90aa241aabd5f0b972cc3471386ba3d4da86dc`。Driveの自動バックアップ最終SHA `7f863ea2d65671abd1453fdae1b61de00f1d10e2` とmainの一致も確認した。Library直下の現行QUEUE 552件を全件取得し、以前のPR1870の「対応済み」表記をそのまま信用せず、現在のdirect/composedコードへ照合した。判定一覧、採用範囲、不採用理由、個別検証は `reports/queue-local-*-20261026.*` を参照。push・PR化・merge・remote CI起動はしていない。

今回の確定的な表示修正はガチホコの通過済みチェックポイント。`passed[team]` はbooleanであるため、選択地点 `choice[team]` と併せて3Dリングへ反映する。得点・通過条件・武器数値は変更しない。Crabの新生飛沫catch-upは実際のowner queueの新生suffixだけを進め、既存飛沫の時刻を変えず、終了した飛沫のpool返却とclear時の取消を失わないようにした。

射撃・塗り・音声・表示では、現在PRから欠落していた安全なscratch再利用を復元し、固定入力の重複計算と空一覧の走査を減らした。再入時はdepthごとに領域を分け、finallyでactor等の参照を解除する。外へ逃げるpaint点・公開スナップショット・callbackが保持できるrecordは新規生成を残す。LOS/paint/spawn等のcallbackが値を変えた場合は再計算へ戻す。乱数の順序とゲーム判定の閾値を性能目的で変えない。

VFXの60Hz基準cadenceは30/60/120Hzと休止・再開・品質切替を試験し、60Hzの出生・乱数消費を保持する。音声は同一PCM、塗りはgrid/ownership/counts/dirty rows/GPU属性、characterは実source motionの姿勢・骨・mesh identityをそれぞれ比較した。未使用UVの省略は既知のunmapped組み込みmaterialと標準shader callbackに限定し、未知shaderやtextureを使うmaterialにはUVを残す。hair/body/outfitの新規形状制作は再開していない。

検証中に見つかった既存テストの古い前提は、assertionの削除ではなく実際の契約に合わせて修正した。例: boolean checkpoint fixture、DIRECT ownerの本体移行、8-slot paint growthと旧7-slot互換consumer、HUDの二重pauseと最終resume、未使用UV以外のattribute/index/material一致。source ownership、prebuilt converter fingerprint、LFS実体検証、通信認可のgateは維持した。

これらはローカルの差分試験とheadless browser検証の範囲であり、iPad/Safari実機のFPS・発熱・音の聴取、Nintendo原典との画面同一性を測定したという意味ではない。研究PDF/ZIPには2024年の条件モデルと未取得原画像が含まれるため、Splatoon 3 Ver.11.3.0全武器の確定係数として流用していない。

### 同日追記: 変換データの正規更新と独立レビュー

変換処理に関わる残10件は、固定入力5,633ファイル（2,014,095,805 bytes）を個別認証し、通常generatorとBasis Universal v1.16.4の環境で全23ステージを別出力先へ再生成してから採用した。322配列・913,151,369 bytesの型/長さ/chunkハッシュ、sphere以外のmetadataは旧版と一致、新sphere3,474個も旧Three関数と完全一致。23件のstage.jsonだけを正規出力で更新し、配列と画像packは同一内容のため保持。変更していないadmission gateも23/23、stale/missingなし。converter fingerprintは `cdd78fca40a96c15f303dc7f7fb87c8f06a3a4be3bed7f42b5796108ad5da3d5`。

独立レビューでは、Slosherの速度引数を評価する途中のgetterによるyaw変更、FX再入による共有normal変更、custom distanceを使うAim Assistの反例を修正した。元の各評価位置でlive値を確認し、必要時は従来計算へ戻す。soft-pushの外側Actor/radius一括取得はbodyFitsの同期callbackで意味が変わるため全面撤回した。新規review4件・192シナリオと、rootゲーム処理およびCrab描画を合わせた最終24テストが通過。

終盤のGitHub読取ではPR1878は2026-10-25 19:10:04 UTCにmainへ統合済みだったが、main `f6d9fb06f86a5affb963d1ee5ae199e907f30961` のtreeは基準headと同じ `7df23a99a243a0df16dab38389a8f515d92a3a8b`。この作業からリモートのmerge操作は行っていない。

### 2026-10-26 — 完了ラベル付き旧キューの追加照合

active552件に加えてPR1870の107件とFIXED31件を現行コードへ照合し、旧motion最適化10件の欠落を確認。9件を現在の合成順序とDIRECT所有に合わせて復元した。髪の弧長写像、耳断面、眼球リング、6成分の姿勢減衰、服の四肢中心線・タンク傾き・ストラップ近傍、source action選択・dt応答係数が対象。形状、細分化、入力の丸め、本家の未確認数値は変更していない。

実関数比較では24髪曲面、12顔LOD/画質（77,242頂点）、3,600ストラップ境界点、600 tee変位が一致。実Characterは30/60/120Hzで288姿勢、source motionは別に243姿勢が完全一致し、両比較のRNG回数も一致。四肢キャッシュは4個の内部サンプル表だけを保持し、呼出し元のpathや可変hintを共有しない。眼は各眼の間のcornea変更とaccessorを保持。dance fallbackの先行scan省略は、native Mapにも追加できる非文字列keyのTypeErrorを消す反例があり不採用とした。

ブラウザ試験のローラー開始位置は実際の半径0.35に対して壁へ0.05侵入し、基準PRと候補で同じ位置に停止していた。実bodyFitsで開始位置と移動廊下を検査するようfixtureを修正し、元の250ms入力・30秒制限・2m上限・実音源の正音量条件を維持。実機Safari/iPadのFPS、本家の実機比較、過去Pages 503の原因究明は別の未確認項目として残る。詳細はqueue-local-complete-scope-20261026.jsonと最終検証レポートを参照。
