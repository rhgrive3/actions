# 原典由来5ステージ本体統合 — 検証・続行記録

開始 main: `b078c37907351f1bbc13d0e7d4b5cbeb0a330009`。作業ブランチ: `codex/stage5-native-integration`。main にはマージしていない。

ユーザー添付の README-CODEX-JA.md / CODEX-TASK.md、R6 のパーサー、BVH、塗り、移動、射出、生成スクリプト、過去の検証を分析した。独立デモを公開する方式ではなく、現在の main のビルド composition と本体のシステムに接続した。以下は INKWAVE の実装・検証結果であり、Nintendo 実機との完全一致を示すものではない。

## 実装

- 固定 KiTrix commit `0611f51b35c9736ee986fb2218461e2585b7875e` の5 OBJ/MTL/PNGをローカル取得。通常の LFS smudge は `Resource not accessible by integration`。公開 GitHub LFS media 配信で取得し、5ファイルすべて LFS pointer の SHA-256 と一致した。proxy と TLS 検証は維持した。
- OBJ の float32 頂点・法線・UV・インデックスを保持。描画と衝突を近似の箱に置換しない。スケール・原点を推測で変更しない。
- 表示三角形から BVH、同一平面/ソースオブジェクト/8単位領域ごとの塗りチャート、三角形領域の CPU マスクを生成。塗りの矩形は collider として使わない。
- 既存 Actor、移動/カメラ/弾の Physics API、CPU/GPU PaintSystem、塗り順序/owner、BotBrain/A*、ライブミニマップ、ランクルールに接続した。動的ヤグラは既存 collider と source BVH を組み合わせる。
- 原典を含めない通常ビルドと、`INKWAVE_NATIVE_STAGE_ASSETS` を明示したローカルビルドを分ける。大容量アセットは通常 PWA revision/precache の外で取得し、integrity manifest をビルド/実行時に検証する。Service Worker 予算を拡大しない。
- オンライン開始時にモデル/チャートと native runtime の fingerprint を確認。同じステージIDでもデータ/実装が異なるクライアントを拒否する。
- 品質変更でも CPU グリッド、物理、ナビ、三角形を保持。画質別に GPU テクスチャを縮小し、スマートフォン相当では atlas を2048に制限する。

## 確認したこと

再現手順は [README](../patches/native-stages/README.md)。数値要約は [verification JSON](inkwave-native-stage5-verification-2026-10-12.json)。原典/画像/詳細ログは公開Gitから除外したワークスペース内に保存。

| 検証 | 結果 | 範囲 |
|---|---|---|
| 最適化ビルド | 通常・原典用とも成功 | 通常ビルドへの原典同梱なし、既存PWA上限内 |
| 原典比較 | 5ステージ成功 | OBJ数値行を別に読み float32頂点/法線/UVを照合。三角形数、1471枚のPNG、MTL/PNGの固定Git treeを検査 |
| native 統合・幾何・塗りテスト | 9成功 | 全5ステージ、30/60/120Hz Actor、壁泳ぎ/敵インク解除、射出/着地、金網、矩形外マスク、動的 collider、ナビ/推定配置、塗り最適化の比較 |
| 既存ランク/復活/ネット塗り回帰 | 262件中261成功・1skip・失敗0 | 元の回帰セット、owner/clock/paint admission、ルール/復活 |
| 既存ステージ/メニュー回帰 | 17成功 | 既存配置・移動・アセット |
| 通常ビルドの本体UIブラウザ | 成功 | 386レスポンスのハッシュ、HUD/入力、エラーなし |
| 原典5ステージ本体ブラウザ | 25ケース成功 | 各8人・7bot、Turf、Zones塗りカウント、Towerの実 collider 支持/制御、Rainmaker拾得、Clams拾得、snapshot復元 |
| 実リレーオンライン | 25ケース成功 | 2ブラウザ、実WebSocket、production RoomDurableObject、各8人。TurfのCPUグリッドSHA-256とcoverage、ガチ4ルール状態が一致 |
| 品質・失敗復旧 | 成功 | High→LowでCPU/三角形/物理/ナビ保持、破損モデル拒否で旧地形保持、競合ロードのキャンセル、native groupが1つだけ |
| ステージ変更 | 成功 | source→既存→source→既存、旧 native group除去とGPU資源の処分 |
| タッチ画面相当 | 5ステージ成功 | 844×390、8人、2048atlas、起動/描画/射出/着地。実モバイルGPUは未測定 |

ブラウザは Chromium + SwiftShader。ロジックのHz試験と実機の操作比較を混同しない。ガチ4ルールの検証は既存ルールエンジンと推定配置の機能検証であり、原作配置の正しさの検証ではない。

## 最新mainとの統合確認

作業中に更新された main `bca45e7cb55f3331a58459ea0219e42b44762712` を作業ブランチ側へ取り込んだ。main へのマージではない。競合は `scripts/inkwave-source-composition.mjs` の処理順だけで、カメラ補正を最終処理として維持するよう解決した。

- 通常・原典用の最適化ビルドを再実行し、両方成功。native統合9件、通常アセット除外1件も成功。
- 最新mainの衝突/塗り最適化、通信、カメラ、ランク、復活を含む拡張回帰707件を実行。初回は705成功・1skip・カメラ最終処理順チェック1失敗。順序を修正し、影響するカメラ16件を再実行して全件成功。
- 順序修正前後の composition を404ファイルで比較し、生成コードの全バイト一致を確認。処理を入れ替えた2アダプターは異なるファイルを変更する。
- 最新mainを含む本体ブラウザ25ケースを再実行し、全件成功・ブラウザエラーなし。
- 通常ビルドのUIブラウザを再実行し、387レスポンスを検証・エラーなし。
- オンライン検証の固定30フレーム比較で一時的な差を検出。診断時にはゲストに塗り7件を含む25イベントが未再生で、受信済みpaint sequence 278に対し再生済みは253だった。手動で速く進めたシミュレーションと実時間の再生キューを混同した比較時点の問題として、実再生watermarkと両側の塗り成長/送受信キューの完了を待つよう検証スクリプトを修正。同期処理を迂回せず、全セルSHA-256の一致判定は維持する。
- 修正したオンライン検証を全25ケースで再実行し、全件成功・エラーなし。5ステージのTurfは塗り成長/待機キューが空になった状態で全グリッドSHA-256とcoverageが一致。手動で進めた完了待ちフレーム数を通信遅延や実機性能の値とは扱わない。

この再検証の詳細ログは `.ci-scratch/native-latest-main-*.log`、画像とJSONは `.browser-evidence/native-latest-main/` にある。上の262件と707件は重複する回帰セットで、件数を合算しない。
最終オンライン記録は `.browser-evidence/native-online-settled/online.json`、ログは `.ci-scratch/native-online-settled.log`。GitHub CIのrunはこの確認時点では取得できず、ここで示した成功はローカル実行の結果。PRのmergeability APIは `dirty` を返しているが、GitHub compareは最新baseをmerge baseとしてbehind=0、ローカルでもbaseの包含を確認した。mainへのマージ操作は行っていない。

## 発見・修正・再検証

- worker manifest サイズ超過を検出。native runtimeを1モジュールにまとめ、予算を変えずにビルドを再実行。
- `decor.update` 接続漏れをブラウザで検出し修正。
- 下り経路を上り可能と扱うルール配置生成の誤りを修正。相互到達する集合で推定配置を作る。
- 塗れない中央の足場にエリアを置き、zone cellが0になる不具合を修正。ライブ塗りマスクのある支持点を選び、実塗りでカウント変化を再検証。
- ユノハナの初期射出が着地点なしで待ち続けるケースを修正。既存の支持点判定で再検査したナビ候補を fallback にする。これはローカル方針で原作座標ではない。
- クサヤの4botが到達不可能な目標を繰り返し選んで停止するケースを検出。表示地形の大きい安全な下りを扱い、目標候補を現在位置からの有向到達集合に制限。再検証で7botすべて移動。
- 品質切り替えで箱用のジオメトリ再生成が source 面に適用される問題を修正。source 三角形の UV 再生成を行い、CPUグリッド/位置配列が変わらないことをブラウザで確認。
- 塗り計算を測定し、同一平面の補助形状計算を共有。所有権 margin を超えられない形状/矩形外セルを数学的上限で除外。比較テストで全ライブセル/owner順序/scoreの一致を確認。
- 初回の塗り/乾燥シェーダーコンパイルをロード中に行う。新たなゲーム内の大きい初回待ちを避けるための処置で、すべてのGPUで改善を保証する値ではない。

## 原典・忠実度の境界

KiTrix の Swift StageLoader の英語名対応表には添付資料・1130の内部ID対応と食い違う項目があり、その表を座標/ステージ名の正当性の根拠にはしなかった。OBJファイルと内部IDを照合する。

Leanny `data/mush/1130/VersusSceneInfo.json` の取得 SHA-256 は `205532c39ebe91f5c704b5a3e674652ed644361b656f7d42e8580c89290a8c62`。調査時 HEAD は `7280ff9cde8bb1c5dcef46c700c326471584d2e6`。5つの内部IDを確認できたが、座標・配置は含まれない。

以下は未確認を維持する:

- OBJの抽出元が11.3.0であること。公表された表示エクスポートと実機データの版の一致。
- ネイティブ collision / paint mask / climbable / grates / playable extent。現状は表示三角形と名前からの推定。
- 元のスポーン位置・射出軌道、OBJ単位と実機の単位の関係。R6の支持点と本体のSquid Spawn処理を使う。
- 5ルール別 geometry / scene / placement。現状はPntメッシュを共有し、ランク4ルールは到達可能な地形上でローカル調整する。Var/Vlf/Vgl/Vcl等の表示層を全ルールの正しい配置と断定しない。
- 元シェーダー、光源、空、チームカラー、material flags。MTLのpacked map誤割当は中立色に修復し、法線はPNGの統計からRGB/UNORM RG/signed-byte RGを推定する。
- 実機と同じ操作の速度/加速/段差/壁泳ぎ/射線/武器を原作で計測した比較。今回の本体機能試験は代用ではない。

## 性能の限界

ブラウザ計測の生データを verification JSON に残す。タッチ画面相当のCPUフレーム p50 はケースにより約10～36ms、p95は約21～76msで、初回処理に秒単位のスパイクも観測した。処理時間には8人の本体処理を含み、一部の計測は回帰プロセスと同じホストで実行した。入力/ブキ構成や初回準備にもばらつきがある。これを端末FPSや固定の性能値として扱わない。

原典モデルは20～40万三角形級で、既存キャラクター等を含む描画はさらに大きい。実モバイルGPUの継続FPS、熱、消費電力、メモリ上限、低メモリ端末の安定性は未保証。現時点を完全な11.3.0再現や本番配布完了とは呼べない。

## 権利と再開

KiTrix の MIT 表記だけでは Nintendo 由来アセットの再配布許諾を確認できない。OBJ/MTL/PNG/変換バイナリ/モデルが映る画像は ignored ローカル領域にのみ保存し、公開GitHubへ追加していない。公開ビルドは原典モデルを含めない。デプロイしていない。

原典: `.codex-stage-sources/KiTrix/stages/`。変換: `.codex-stage-sources/generated/`。画像/詳細JSON: `.browser-evidence/native-stage5-final/`, `native-online-final/`, `native-lifecycle/`。ログ: `.ci-scratch/native-*.log`。必要ならREADMEの取得/変換/検証手順から再開できる。
