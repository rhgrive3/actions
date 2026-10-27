# Library残件のローカル反映・検証記録

## 結果

利用可能な3サブエージェントをすべて使用し、Library対象フォルダ直下の693項目を照合した。内訳は690件のキュー・修正記録と、説明資料2件・Archiveコンテナ1件。加えてArchive配下51件も本文・基準PR・現在の実装から再監査し、計741件の実装・判断記録を確認した。現在の実装へ247件を新規反映し、2件を安全に反映できる範囲まで実装した。アプリの実装と主要な回帰テストはローカルコミット `2a185b0` に保存済み。最後のブラウザ試験補修と検証資料は後続のローカルコミットへまとめ、引き継ぎパッケージの `manifest.json` に最終HEADを記録した。リモートへのpush、PR作成、merge、CI起動、deploy、Libraryのキュー更新は行っていない。

作業ブランチは `local/queue-remaining-20261026`。Driveのバックアップ情報と資料を照合したうえで、コードの基準には許可されたPR #1878のhead `dd90aa241aabd5f0b972cc3471386ba3d4da86dc` を使用した。作業中の読み取り確認では、このPRは外部でmain `f6d9fb06f86a5affb963d1ee5ae199e907f30961` にmergeされており、mainのtreeは基準PRと完全に同じだった。今回こちらからmergeしたものではない。

根拠: [取得元と基準の記録](queue-local-provenance-20261026.json)、[全690件の対応表](queue-local-complete-scope-20261026.json)、[検証結果](queue-local-validation-20261026.json)。

## 件数と数え方

| 記録の範囲 | 新規反映 | 部分反映 | 基準時点で対応済み | 不採用 | 追加証拠が必要 | 既定の対象外 | 計 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Active `[QUEUE]` | 236 | 2 | 216 | 94 | 2 | 2 | 552 |
| 旧PR1870ラベル | 11 | 0 | 95 | 1 | 0 | 0 | 107 |
| `[FIXED]` | 0 | 0 | 31 | 0 | 0 | 0 | 31 |
| **合計** | **247** | **2** | **342** | **95** | **2** | **2** | **690** |

件数はLibraryの記録単位であり、ファイル数やコミット数ではない。担当者間で重なったActiveの3件は各1件として数えている。未分類は0件。対応済み342件には、以前から安全な部分だけを採用していたnative colliderの1件を含む。その記録の危険なdescriptor共有まで実装済みとは扱っていない。

旧PRの完了ラベルだけでは判定せず、107件を実コードと照合した結果、10件の欠落を発見した。そのうち9件を復元した。また、途中のローカル実装にはすでに存在した旧ラベル2件も、変更前のPR1878には存在しなかったため、今回の反映として正しく計上した。FIXEDの31件も本文と基準PR1878の実装を照合し、全件が基準時点から残っていることを確認した。詳細は[過去ラベルの範囲監査](queue-local-historical-scope-20261026.json)に記録した。

### Archiveの51件も別途照合

Archiveの名前や古い完了ラベルだけでは除外しなかった。全51件の本文を読み、30件の既存対応、5件の重複対応、1件の既存の安全な部分対応、1件の現productionでの反証、14件の不採用という判断を確認した。直下690件とは別の記録であり、上表の件数へ混ぜていない。未分類・判断保留は0件で、この追加監査から新たに採用した実装はない。

例えば、古いmural再描画の不採用記録は、同じfont setのときだけ再描画し、条件が変われば元のcopyへ戻る後継実装で、すでに基準PRから対応済みだった。画像縮小の追加案は、単一byte差だけを理由とした旧判断を撤回し、今回の微小誤差の許可を踏まえて再審査した。実テクスチャ・alpha判定・normal処理・browser間の誤差範囲とRAM/CPU効果が未確認のため、今回は採用しなかった。

根拠: [Archive全51件の追加監査](queue-local-archive-audit-20261026.json)。

## 主な変更と判断

### ゲーム進行・塗り・武器

Rainmakerのチェックポイント判定で、booleanの結果を選択結果のように扱っていた箇所を修正した。バリア、アサリ、ヤグラの処理では、寿命と所有者を保ったまま一時オブジェクトや重複探索を減らした。ヤグラ内部の一時配列を再利用する場合も、公開するスナップショットは独立した値として維持している。

射撃・塗り・サブ・スペシャルは、乱数消費順、権威側の塗り、既存の弾の経過時間、scene clear後の寿命を保つ範囲で整理した。途中のgetter、衝突callback、再入呼出しが値を変える経路も確認した。例えば外側Actorや半径を先に保持するsoft push案は、callbackによってActorが差し替わる反例があったため採用していない。

根拠: [gameplay](queue-local-gameplay-20261026.json)、[独立レビュー](queue-local-gameplay-review-20261026.json)、[paint](queue-local-paint-20261026.json)、[subs](queue-local-subs-20261026.json)、[flight/specials](queue-local-flight-specials-20261026.json)。

### モーションと形状生成

髪の弧長写像、左右の耳断面、眼球のリング計算、6成分の姿勢減衰、服の四肢中心線・タンク傾き・ストラップ近傍計算から重複処理を減らした。形状パラメータ、細分化、画質の選択は変えていない。

四肢のキャッシュは最大4個の内部サンプル表だけを持ち、呼出し元に返すpathと可変hintは共有しない。眼球のリング表は眼ごとに用意し、最初の眼をBuilderへ渡した後に公開corneaパラメータが変わっても、次の眼で元の動作を維持する。ストラップの省略対象は内部で所有する不変polylineに限定し、0.03以内の距離と実際の服の変位を保存する。

source motionでは、action選択の配列と`find`を削除しつつ候補ごとのlive Map参照を保持した。6種類の応答係数は正確なdtで再利用し、dtの量子化はしない。Math関数が差し替えられている場合は元の呼出しへ戻る。

Crabの姿勢計算では、検証した8,336姿勢で行列要素の最大差が約`7.46e-13`だった。これは許可された微小誤差の範囲として採用した。その他の上記比較では、検証対象の生成バイト列・姿勢を完全一致で確認した。

根拠: [追加キャラクター7件](queue-local-historical-character-20261026.json)、[その独立レビュー](queue-local-historical-character-review-20261026.json)、[追加source motion](queue-local-historical-motion-20261026.json)、[Crabと旧対応済み項目の再照合](queue-local-gameplay-already-20261026.json)。

### ステージの変換と読み込み

元入力5,633ファイルを検証して、通常のnative生成経路で23ステージを再生成した。変換器の更新後に古いfingerprintだけを付け替えることはしていない。新しい変換器と実際の出力を使って、通常のadmissionが23ステージすべてを受理することを確認した。

比較した322配列、計913,151,369 bytesは旧版と同一。事前計算した境界球3,474件は旧Three.js実装の結果と一致し、その他のmetadataも維持した。Git LFSで変更したのは23個の`stage.json`、計6,407,780 bytesで、既存のバイナリ配列・packは変更していない。

根拠: [native再生成](queue-local-native-regeneration-20261026.json)、[world](queue-local-world-20261026.json)、[DIRECT所有の維持](queue-local-world-direct-migration-20261026.json)。

### 音声・UI・ネットワーク・ビルド

音声の重複計算、起動準備、保持参照を整理し、音声workerも再生成して確認した。5種類のgrain・4サンプルレートを含む比較でPCMのSHA-256が一致した。UIの停止状態は複数のpause所有者を保持し、最後の所有者が解除されるまで不要なRAFを再開しない。

ネットワークの入力検証・所有権・送信時刻の条件を保持したまま重複処理を減らした。ビルドでは独立変換の実行と必要な入力の取り込みを整理し、CI定義では未使用のBlender/docs入力をcheckout対象から外した。元のsource/artifact検証条件やブラウザの合格条件は維持した。

根拠: [audio](queue-local-audio-20261026.json)、[UI/network/build](queue-local-ui-network-20261026.json)、[UI補足](queue-local-ui-supplemental-20261026.json)、[special presentation](queue-local-special-presentation-20261026.json)。

## 検証

| 検証 | 結果 |
|---|---|
| `npm test` | 全段階PASS。direct source 20、quality 21＋個別3検査、relay 29、account 24、backup 13、queue recovery 40、memory 77 |
| 所有権・合成 | DIRECT所有18件PASS。書式整理前後の公開117モジュールのSHA・バイト数も完全一致 |
| 新しいキャラクター/服の差分検証 | 8/8 PASS。24髪曲面、12顔LOD/画質、77,242顔頂点、3,600ストラップ境界点、600服変位、288実Character姿勢 |
| 新しいsource motionの差分検証 | 7/7 PASS。17,920 action条件、243実Character姿勢、getter・例外・Math差し替えを含む |
| Native実出力 | 23/23受理、約913MBの配列一致、3,474境界球一致、関連89件PASS |
| 最終build・起動予算 | PASS。初期JS 1,998,104 bytes、precache 7,664,408 bytes |
| 最終オフライン・ブラウザ | 4/4 PASS |
| 最終オンライン・ブラウザ | 4/4 PASS。接地・音声・ギア同期10段階、nativeスライド開始と完了もPASS。ページエラー0 |
| ブラウザ試験の入力・観測 | 28/28 PASS。実FixedClockの開始状態取り逃しと、誤合格を防ぐnegative controlsを含む |
| 証拠の参照監査 | 1,783参照・680判定箇所に加え、最後の試験側2ファイルを13参照・20条件で再確認。参照欠落・現在のSHA不一致0 |

最終buildのcontent hashは`f0dd5d4fe821ffb70fb4f93fe87153e5e86691f04ccac2422bc1c8453eee3dee`、input hashは`fa9f96ad24b2ed2a24f7c273ade3d73328f993d633e49f67699b984cccccbc05`。

ブラウザはLinux上のChromium 153とSwiftShader。ローラーの正音量試験では、以前の試験位置が実際の壁へ5cm侵入しており、基準PRでも同じ停止を再現した。実衝突判定`bodyFits`を開始位置と9点の移動廊下に追加し、250ms入力、30秒制限、2m上限、実音源の正音量・登録・再生条件を維持した。最終buildでも接地・浮遊・再接地・解除・ギア切替等10段階とオンライン4ルールを通過した。

さらに、250msの移動入力が次のnative frameより前に終わる環境条件を観測したため、試験の入力開始を次の実frameの入口に合わせた。スライド開始は実際の入力で受理されることを専用の観測で確認し、短いlive状態を見逃さないよう、同一actor・runner・live状態・新しいtokenを満たす同期イベントだけを記録する。元の失敗runには開始時の観測がなかったため、その原因を一つに断定していない。スライド完了と通信先のギア判定は独立した必須条件として残した。これらは試験側のみの補修で、ゲーム側の挙動は変更していない。

途中の環境準備失敗、再利用stagingへの古いasset衝突、指示による中断は保存し、成功件数には含めていない。証拠indexは242ファイル、30,504,619 bytesで、参照欠落・SHA/サイズ不一致は0件。過去の失敗ログ23件もそのまま保全した。古いPython形式の任意参照データに依存する23テストはskip扱いだが、実際の本番23ステージの比較は全件実行した。ヘッドレス試験や数式・バイト列の一致を、実機iPad/SafariのFPSや本家実機との同一性の証明には使用していない。

詳細: [最終検証JSON](queue-local-validation-20261026.json)、[ブラウザ検証記録](queue-local-browser-validation-20261026.json)、[最終監査](queue-local-final-audit-20261026.json)、[証拠index](queue-local-evidence-index-20261026.json)。

## 部分反映・追加証拠・対象外

| 項目 | 判断と残した範囲 |
|---|---|
| Headgear QAの重複ビルド | 不要な大容量入力をcheckoutから除外。6ビルドを1つの共有artifactへまとめる部分は、再実行時のsource/artifact整合契約が未確定のため維持 |
| Inkjet排気の一時確保 | 内部の一時関数を削減。callbackが保持できる中心点cloneと外へ渡る関数は寿命を維持 |
| Fizzy Bombの未到達flight paint | 正しい飛行条件・着地塗り・オンライン再生段階の根拠がないため有効化せず、追加証拠待ち |
| 過去Pages配信の503 | 既存の即時失敗診断と成果物ID記録を保持。過去の配信障害の原因をローカル作業だけで解決済みとはしない |
| イカ画質別の形状キャッシュ変更 | 表示されるジオメトリが変わるため、既定の形状作成停止の対象として除外 |
| 録音音源の権利確認・配信分離 | 既存の明示的な対象外指示に従い、今回の変更対象にしない |

不採用95件にも個別の根拠を残した。例えば、旧danceのfallback scan省略は、native Mapに非文字列keyがある場合に元の`TypeError`を消す。同じbank/familyの選択はすでにキャッシュされているため、初回処理のために追跡機構を増やす案も採用しなかった。単に「古いPRで完了と書かれている」「高速そう」という理由では戻していない。

## ローカルでの再確認

リポジトリのREADMEに記載されたNode・依存関係と、基準のLFSデータを用意したcheckoutで実行する。今回の作業ディレクトリには必要な基準データと更新23件が揃っている。

```sh
npm test
INKWAVE_REVIEW_OUT=$(mktemp -d -t inkwave-review-XXXXXX)
node scripts/build-inkwave.mjs inkwave-public "$INKWAVE_REVIEW_OUT"
node scripts/check-inkwave-startup-budget.mjs "$INKWAVE_REVIEW_OUT"
```

追加の差分検証・native再生成の追試方法は[証拠と追試のREADME](queue-local-evidence-20261026/README.md)を参照。直下690件の対応表は保存済みの入力と13担当レポートから再生成でき、Archive51件の別監査にもハッシュ付きで接続する。引き継ぎパッケージには、ローカルGit差分、更新した23個のLFS実体、ハッシュ一覧と取り込み手順を含める。
