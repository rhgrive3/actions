# 原典由来5ステージ本体統合 — 検証・続行記録

開始 main: `b078c37907351f1bbc13d0e7d4b5cbeb0a330009`。作業ブランチ: `codex/stage5-native-integration`。main へはマージしない。

ユーザー添付 `INKWAVE-Codex-Cloud-Stage5-Handoff.zip` の README-CODEX-JA.md と CODEX-TASK.md、R6 のパーサー・BVH・塗り・移動・生成・過去のテストを確認した。過去の試作の成功記録は本体の成功記録として扱っていない。

## 実装

- 固定 KiTrix commit `0611f51b35c9736ee986fb2218461e2585b7875e` の5 OBJ/MTL/PNG をローカル取得。通常の LFS smudge は GitHub integration 認証により `Resource not accessible by integration`。公開 GitHub LFS media URL で取得し、LFS pointer の SHA-256 と一致を検査した。HTTP proxy と TLS 検査は維持した。
- OBJ の float32 頂点・法線・UV・インデックスを保持。見た目の箱への置換、推測スケール変換、原点移動をしない。
- 表示三角形から衝突 BVH、同一平面・同一ソースオブジェクト・8単位領域ごとの塗りチャート、三角形領域の CPU マスクを生成する。チャート矩形は衝突床にしない。
- 現在の main と同じビルド composition に専用アダプターを追加。既存 Actor、移動/カメラ/弾の Physics API、CPU/GPU PaintSystem、塗りイベント順序、ナビ/A*、ミニマップ、ランクルールを使う。
- 動的ヤグラは既存の箱 collider を維持し、静的な三角形 BVH と組み合わせる。
- 非同期ロードは既存 worldCurrent ガードを使用。ステージ変更でキャンセルし、準備後に入れ替える。原典ファイルと変換ファイルの integrity manifest をビルド時・ブラウザ読み込み時に確認する。
- オンライン開始にステージの integrity fingerprint を加え、同じIDでも異なるモデル/チャートを持つクライアントとの対戦開始を拒否する。
- 通常ビルドでは原典アセットを含めず、ローカル原典ビルドを明示指定したときだけ5ステージを有効にする。大容量アセットは通常の PWA precache/revision 外で管理する。Service Worker 予算は拡大していない。

## 確認済み（実行ログはワークスペース内）

- 通常・原典用の最適化ビルドが成功。
- 既存ステージ・ランク world・メニューアセットの17テストが成功。
- 5ステージの統合テスト6件が成功（公開用アセット除外1件を含む）。支持面、塗り、矩形外マスク、30/60/120 Hz の Actor、ナビ、推定ランク配置を実行。
- 合成ジオメトリ2テストが成功。金網通過、壁、体の持ち上げ、動的 collider、CPU 塗りマスクを検査。
- ソース OBJ の数値行を別に読み、5ステージの float32 頂点・法線・UV の一致、三角形数、一部 UV 欠落のゼロ補完、計1471枚のコピー済みPNGハッシュの一致を確認した。これは KiTrix 表示エクスポートとの比較であり、Nintendo 実機との比較ではない。
- Chromium + SwiftShader のユノハナで実ゲーム8 Actor、7ボット、移動・塗り・ミニマップ・描画をエラーなしで確認した。起動時の `decor.update` 接続漏れを修正し再検証した。
- ランク経路が下りのみの接続を上り可能と扱う不具合を検出。中央から相互到達できる集合で推定オブジェクトを配置するよう修正し、ヤガラ・クサヤを含む統合テストを再実行した。

## 未完の検証（続行中）

残り4ステージのブラウザ対戦、5ステージ×5ルールの実動作、実際の WebSocket と relay を使う2ブラウザ同期、性能内訳・改善、ステージ切り替え/キャンセル/資源開放、原典のみと統合描画の比較画像、自己レビュー。

## 忠実度について残る未確認事項

- Leanny `data/mush/1130/VersusSceneInfo.json` は5つの内部IDを確認できるが座標・配置を含まない。OBJ 自体の版が11.3.0と一致することは確認していない。
- collision / paintable / grates / climbable は表示メッシュと名称からの推定。ネイティブ collision や塗りマスクではない。
- スポーンはR6由来の支持点推定。射出は本体の既存 Squid Spawn 処理を利用するが、元のスポーン座標・軌道との実機一致は未確認。
- 4ランクルールは Pnt 表示メッシュを共有し、地形上で到達可能なローカル調整値を使用する。11.3.0のガチエリア、ヤグラ経路、ホコ台/関門、アサリゴールやルール別形状を復元済みとは呼べない。
- MTL の一部は packed normal/roughness を albedo として割り当てており、R6の修復を参照して中立色にする。元シェーダー、光源、空、チーム色との一致は未確認。
- ソフトウェアGPUの処理時間は実端末のFPSではない。物理単独/ブラウザ/実機を区別する。実モバイルGPUはこの環境で未測定。

## 権利と成果物

KiTrix の MIT 表記だけでは Nintendo 由来アセットの再配布許諾を確認できない。OBJ・MTL・PNG・変換バイナリ・モデルが映る比較画像は ignored ローカル領域にのみ保存し、公開GitHubへ追加しない。公開用のコード・変換/比較スクリプト・数値検証結果のみをコミットする。

再開手順は `patches/native-stages/README.md`。原典は `.codex-stage-sources/KiTrix/stages/`、変換データは `.codex-stage-sources/generated/`、画像/JSON は `.browser-evidence/`、詳細ログは `.ci-scratch/native-*.log`。アップロード/デプロイは行わない。
