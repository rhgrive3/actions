# 原典ステージの負荷削減（2026-10-25）

基準は `7f863ea2d65671abd1453fdae1b61de00f1d10e2`。描画、地形判定、インク、読み込み、テクスチャ、独立検証の6担当で調査した。画質設定やゲームの計算結果を維持できる削減を採用した。

## 変更

| 所有ファイル（`patches/native-stages/runtime/`） | 変更と維持する条件 |
| --- | --- |
| `source-convert.mjs` | OBJのバイト入力を64KiB単位でUTF-8 decodeする。分断された文字と未完了行を持ち越し、全文の文字列は作らない。保持量はdecode単位と最長の未完了行に依存する。BOM、不正UTF-8、CRLF、終端、部分ビューと解析結果を維持。 |
| `native-load.mjs` | blueの累積和だけでRGB法線と確定できた時点で画像走査を終了。RG法線の内側では不要な `Math.hypot` を省く。境界の既存計算、出力バイト、解像度、フィルタ、色変換を維持。 |
| `native-gpu-budget.mjs` | 自身が生成する描画上限を凍結し、凍結済みcapsの正規キーを再利用。可変capsは従来どおり値を再評価する。品質値、コンテキストロスト後の段階、設定変更の反映は維持。 |
| `native-render.mjs` | 座標を頂点へ焼き込んだ静的source meshのローカル行列再計算を停止。親groupの移動・回転・拡大とworld matrix更新は維持。 |
| `native-physics.mjs` | `bodyFits` の不変なcapsule境界を最初の有効な候補で一度だけ求める。空・grateのみの問い合わせでは計算しない。候補順、浮動小数点演算、margin、距離判定を維持。 |
| `native-ink-chunks.mjs` | 未塗装・clear後の空atlasで不要な行列更新と全chunk走査を省く。最初の塗りでは現在のcameraを再評価。再接続・geometry交換・disposeでface/chunkキャッシュと大型配列への参照を解放。 |

インク描画のrun交差による別案は、小さな面で遅くなり追加metadataも必要だったため採用しなかった。テクスチャ解像度、材質、表示三角形、地形、塗り、武器、ナビの品質を下げる変更はない。

## 測定

Node.js 24.19.0、Linux x64、AMD EPYCの同じ環境で比較した。以下は異なる処理の測定であり、削減率を合算したりゲーム全体のFPSへ換算したりしない。他担当のビルド・テストとの競合はあり得る。

| 対象と条件 | 基準 → 変更後 | 範囲 |
| --- | ---: | --- |
| 実Scorch OBJ解析、通常 | 1057.72 → 845.17ms（20.1%減） | bytesを事前読込、各版warmup 2回、順序交互7ペアのwall中央値 |
| 同、compact表示配列 | 1042.22 → 871.04ms（16.4%減） | 同条件。process CPUも各19.8%／15.4%減 |
| 合成地形 `bodyFits`、25,000問い合わせ | 405.84 → 279.43ms（31.1%減） | component CPU。空問い合わせ18.65 → 18.54ms |
| 品質参照100万回 | 281.0 → 19.1ms | getter/key生成のmicrobenchmark |
| 1024² RG法線再構築 | 423.7 → 376.4ms（約11%減） | PNG/Canvasを模擬したloader、順序交互6ペア |
| 1024² RGB法線のreadback | 4,194,304 → 262,144 bytes（93.75%減） | 合成画像。確定する位置は画像によって異なる |
| 空atlas・4096tile・移動cameraの選択 | 0.007711 → 0.00000814ms/回 | 合成component。塗装後の処理は別 |
| 静的400meshの行列更新 | 0.01140 → 0.00864ms/frame | 絶対差は約0.003msと小さい |

実OBJは固定KiTrix commit `0611f51b35c9736ee986fb2218461e2585b7875e` の `Vss_Yunohana.obj`（40,126,181 bytes、SHA-256 `c8d0e21345ff9f4eb528e699de2ad9c478af78d7284f347399cc59ab94eb4cd8`）。319,113頂点、837,897 indices、100オブジェクトの全bufferとdescriptorは基準と完全一致し、通常・compact各7ペアすべてで変更後が速かった。外部データと変換物はignoredの私的ディレクトリに保持する。

`bodyFits` の全候補grateという極端な合成条件では25,000問い合わせ22.07 → 24.47ms、約0.096µs/問い合わせの増加があった。静的表示meshを将来個別に動かす際は `updateMatrix()` または自動更新の再有効化が必要。現行runtimeに個別transformの変更先はない。

## 一致の確認

- ネイティブ全テストは658件、530成功・128skip・失敗0。skipは各ステージの実アセット未配置によるもの。通常minifiedビルド、quick compatibility、startup budget、`git diff --check` も成功。
- 実ScorchのMTLとtreeも固定値を照合し、合成rendererを使う実Actor/BotBrain/物理/弾/paintの8人CPU replayを30Hzと60Hzで実行。各2秒、warmup 1秒。最終版と基準のactor、grid、ownership order、quad commands、upload argumentsの全5trace・最終状態・countが完全一致。ray／triangle検査数も30Hzで134,307／6,581,740、60Hzで136,136／6,898,454と同じ。
- UTF-8の境界、不正入力、BOM、CRLF、末尾行、offset viewを回帰検査し、独立した追加540条件も旧行decoderと一致。
- RGの65,536組合せ×3形式で旧法線処理と全出力バイトが一致。RGB分類の閾値直前・一致・稀なblue値も検査。
- 空atlasから最初の塗り、camera移動、AO override、clear、再塗装、geometry交換と二重disposeを検査。
- 実Three.jsで親のposition／rotation／scaleを変えて静的表示のworld matrixと全頂点が一致。
- 通常minified生成物をChromium 154で読み、ray 3,000件・bodyFits 3,000件の厳密一致、nested queryと例外後の回復を確認。この既存browser checkerのoracleは過去の凍結版であり、callback削減数を今回の性能改善量に数えない。

主要な再実行コマンド:

```sh
node --experimental-vm-modules --test --test-concurrency=2 patches/native-stages/tests/*.test.mjs
node scripts/check-inkwave-patches.mjs --quick
node scripts/build-inkwave.mjs inkwave-public _site
node scripts/check-inkwave-startup-budget.mjs _site
node --experimental-vm-modules scripts/measure-inkwave-native-ground.mjs \
  --root "$PWD" --source-dir .codex-stage-sources/scorch-source \
  --hz 60 --seconds 2 --warmup 1 --actors 8 --record
```

実OBJ取得済みの私的ディレクトリと開発ガイドの依存が必要。CPU replayの基準は今回の開始commitを別checkoutして同じ条件で実行する。`--baseline` は別の過去最適化用なので今回の基準比較には使わない。

ローカル再現資料は `/workspace/scratch/loading/`（実OBJの各測定・hash）、`/workspace/scratch/collision/`、`/workspace/scratch/textures/`、`/workspace/scratch/native-final-replay-parity.json`、`/workspace/scratch/native-browser-final/` に保存した。これらの私的入力や大きなログはGitへ追加しない。

## 確認範囲

本家比較の参照版は既存のSplatoon 3 Ver.11.3.0のまま。今回、独自のフレーム値や原作の地形・配置を追加していない。上記は出力一致とcomponent CPU／生成物の検証であり、SwitchやiPadの実機FPS、全ステージの動的映像、実ScorchのGPU画像一致、peak memory、通信対戦の新規受入を証明しない。既存の本家との差分・未確認項目は残す。
