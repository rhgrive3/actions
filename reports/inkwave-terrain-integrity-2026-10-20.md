# 全ステージ地形整合性修正（2026-10-20）

開始main: `b77b51df6a4e6683ca23a213c8ba4b0bc2f0c8ae`。原典参照: KiTrix `0611f51b35c9736ee986fb2218461e2585b7875e`。カタログの23 OBJ SHA-256と23 MTL Git blob SHA-1を照合した。Driveの旧 `INKWAVE-stage25-f2c87085.patch` も確認したが、現在の原典メッシュや本家衝突データの代用にはしていない。

## 原因と修正

JS `source-convert.mjs::classify` と Python `obj_import.py::parse_obj` は、名前に `groundgrass` を含むだけで装飾と判断していた。実際には `GroundGrassMoss` 等は三角形で構成された地面である。表示側 `nativeDisplay` はactiveな原典メッシュを保持する一方、衝突と塗りからその床が除外された。

ネギトロの `[12,3,6]`、`[-12,3,-6]`、`[18,3,6]`、`[-18,3,-6]` では表示用Raycasterが高さ3の床を検出し、旧TriangleWorldの接地レイは外れた。**表示される床の衝突判定が生成されない**不具合である。旧変換器の負例で新しい中央床テストが `original central floor exists` により失敗することも確認した。

| ステージ | 復元オブジェクト | 非退化の衝突三角形 | 変換配列の増分 |
| --- | ---: | ---: | ---: |
| 海女美術大学 / inkblot | 2 | 402 | 172,580 bytes |
| カジキ空港 / airport | 3 | 538 | 43,085 bytes |
| ネギトロ炭鉱 / bluefin | 4 | 265 | 46,984 bytes |
| ゴンズイ地区 / eeltail | 1 | 46 | 36,306 bytes |
| キンメダイ美術館 / museum | 2 | 86 | 94,124 bytes |
| デカライン高架下 / urchin | 3 | 514 | 76,433 bytes |

計15オブジェクト・1,851三角形。他の17原典ステージは分類も不変。増分はcollision / BVH / chart / maskの配列バイト数で、ブラウザRSSやGPU実メモリではない。

- JS / Pythonの装飾判定から一括除外を削除。背景、無効ルール層、水、明示的な非衝突指定、`_np`等を維持した。
- 非整数・非有限OBJ索引と3頂点未満の面を拒否し、黙って頂点0や空の面にしない。
- `source-terrain-contract.mjs` をNativeLevel構築前と私的変換物のビルド取り込みに適用。有効なチェックサムを持つ旧変換物でも、構造的地面を落としていれば再変換を要求し世界切替を止める。browser-directの派生キャッシュは既存runtime SHA付きキーで失効する。
- オフライン検証は頂点・索引・オブジェクト境界、法線、原典→衝突の全三角形対応、BVHの重複・未到達・境界、chart / mask所有関係を検査。床・壁・斜面の削除・破損を注入した負例を含む。
- CIに全23固定原典の取得・静的解析・実WebGL被覆比較を追加。CI成果物は数値JSONのみで、原典・変換モデル・画像を含めない。
- 全原典CIでは、生成済みの実Bluefinを使う中央歩行・塗りの30/60/120Hz回帰も必須化した。明示的に渡した原典変換物が存在しない場合はskipせず失敗する。

全23ステージ・8,206,497表示三角形のFloat32頂点・法線・UVとUint32索引は修正前とハッシュ完全一致。新規床ポリゴン、透明床、箱コライダー、境界補間は追加していない。原典の穴・段差・境界・T-junctionを変更していない。原典自身のT-junctionが誤りかを推測して埋める検査ではない。

## 検証結果

- 全23原典: 静的解析成功。衝突三角形3,576,591枚の対応成功。
- 全23原典: Chromium / SwiftShaderで2,208接触レイと368フレームの表示対衝突被覆比較成功、画素差0。8視点×2再生成で画面外→復帰、回転・移動・縮尺、low / balanced / highの形状保持、破棄後geometry数0を確認。不透明材質による**形状のみ**の比較で、全原典テクスチャ・本家シェーダー一致の証明ではない。
- 独自4ステージ: 1,327露出面の描画・物理照合、有限属性・索引検査成功。既存の丸め形状と表示専用trimを考慮。さらに各8視点でfrustum culling有効/無効の画素差0。
- ネギトロ中央: 実NativePhysics / PaintSystem / Actorによる両側×30/60/120Hzの支持・歩行・塗り成功。旧版は失敗。
- ネギトロ実ゲーム: 実Game固定ステップ、8人・7bot、元の低画質テクスチャとインク描画で、両側×描画30/60/120Hzの制御移動、中央塗り、4視点post描画、Tidewater→Bluefin再読み込み成功。支持された初期位置と制御入力を使い、全試合の自然操作とは区別する。
- 追加継続検証: 実Gameと7botをゲーム内15分・54,000フレーム進め、中央4点の支持を3,600回検査。30回の元材質WebGL描画・塗り確認と、最後の別ステージ経由の再読み込みが成功した。ローカル入力は中立、無敵時間は制御しており、継続歩行や実機での壁時計15分の耐久保証ではない。描画リソース数はgeometry 431〜502、texture 113〜120（bot / FXの準備・活動を含む）で、RSSや修正前後の実メモリ差の測定ではない。
- 最終native群: 293 pass / 128 optional skip / 0 fail。対象群29 pass / 5 optional skip、旧変換物/build契約7 pass、本番生成物の物理回帰20 pass、配信元同一性5 pass。
- 既存Bluefinの両上岸間移動・発進・落下・実射塗り・登りの5実行と、独立OBJ全属性・索引の1実行が成功。VMには既存optional source-motion importが使えない警告がある。
- 本番ビルドとquick互換性検査成功。PRは [#1709](https://github.com/rhgrive3/actions/pull/1709)。初回の地形CIは全3ジョブ成功し、数値成果物の23原典ハッシュ・形状・衝突・chart数もローカルと一致。最終CI / 統合結果はPRのチェックと完了記録を参照。

標準CIで既存mainのテスト設定不備も検出した。別worktreeの `b77b51d` で、critical-queueの2件とmain-ink-footprints / weapon-edgecasesの3件に同じ失敗を再現。現在の本番paint-authority関数・所有Actor・認証付き行をテストへ渡すよう直した。セキュリティ検証を無効化せず、認証欠落・別Actor・古い世代の負例も維持/追加した。

同じmainでDynamoの3件、武器保持の1件、opening-cueの1件、paint pool比較の1件も失敗を再現した。既に導入済みの原典幅スケールと保持距離にテスト座標系を合わせ、data URLで評価する音声fixtureの相対import / import.meta.urlに元ファイルの基準URLを与えた。pool比較は現在の同一塗り計算で再利用の有無だけを変える対照とし、塗り計算の異なる古いadapterとの比較を除いた。武器形状・保持処理・音声・塗り計算の本番コードは変更していない。

さらに旧mainでsource-shotの認証fixture、847の2件、Sprinklerの再生比較、Stormの集計に同じ失敗を再現。847は実接地probeと最終姿勢で確定する塗り段階を実行し、古いroller guardだけでは後から導入された共通の塗りguardを巻き戻せない点を明記した。Sprinklerは送受信側で最後のインクの成長時間を揃え、Stormはsplatの即時戻り値だけでなく、既存の遅延成長が取得したセルも別に集計する。完全なgrid一致・全Hzの決定性・実際の認証処理を維持して検証する。

次の標準CIではnetwork-replication 551件中1件が、既に追加済みの `resetMatch?.paused` ガードを含まない古い文字列一致で失敗した。この1件も旧mainで再現し、テストを所有権とpause両方のガードを要求する形へ更新した。後続の実際の非同期attract callbackテストを含む7件は成功した。

初回activeブラウザCIは機能検査自体のerrorがなく、Jet_Arrow音声の `ERR_ABORTED` 3件だけで失敗していた。全応答のハッシュ検証後にクライアントが中断した、版固定audio MP3だけを別に記録するよう観測器を修正した。未検証の中断、JS/モデルの中断、実際の通信失敗は引き続き失敗になる。これらはテスト基盤の修正で、出荷側の塗り認証・音声処理は変更していない。

続くCIで、中断通知が同じ応答のハッシュ検証より先に届く順序も確認した。観測器は進行中の応答検証を待ってから判定する。同じURLでも別リクエストの検証結果を流用しない負例を追加した。

この順序を実Chromiumのfetch中断でも強制再現し、検証前には失敗、同一応答の検証後には中断記録となることを確認した。修正後の実ブラウザ操作・移動・塗り・65キット切り替えも成功。停止していた標準CIの後続はローカルで、本番ビルド、全pin数値資料、ビルド後の物理・武器・通信・UI・Sub/Special検証まで成功した。CI用のsudoディレクトリ準備だけはローカル環境にsudoがないため実行不可で、GitHub Ubuntu上の最終CIで確認する。

機械可読要約: [verification.json](inkwave-terrain-integrity-2026-10-20/verification.json)。画像・モデルを含む証跡はignoredな `.browser-evidence/terrain-*` と `.codex-stage-sources/terrain-*` に保持する。

## 再実行

```sh
python3 scripts/fetch-inkwave-terrain-sources.py .codex-stage-sources/terrain-ci
node scripts/check-inkwave-terrain.mjs .codex-stage-sources/terrain-ci .browser-evidence/terrain/audit.json .codex-stage-sources/terrain-ci-derived
node scripts/build-inkwave.mjs inkwave-public _site
node scripts/check-inkwave-terrain-browser.mjs _site .codex-stage-sources/terrain-ci-derived .browser-evidence/terrain/browser
node --experimental-vm-modules --test patches/native-stages/tests/terrain-integrity.test.mjs patches/native-stages/tests/legacy-terrain-integrity.test.mjs
INKWAVE_TERRAIN_ASSETS="$PWD/.codex-stage-sources/terrain-ci-derived" node --experimental-vm-modules --test patches/native-stages/tests/bluefin-terrain-source.test.mjs
```

元テクスチャを含む私的Bluefin変換物は既存native-stages READMEの手順で作る。そのビルドを `node scripts/check-inkwave-terrain-game.mjs <private-site> <ignored-evidence-dir>` に渡す。私的配信物はデプロイしない。

## 未確認・残存リスク

見た目だけ床が消えてその上を歩けるという別症状は、今回の対象条件では再現していない。alpha / depth / AO、インクoverlay、物理を分けて調べたが、全材質・全GPU・全カメラを網羅したとはしない。

表示地形にLODやocclusion削除はなく、品質変更は主にテクスチャ。インクには既存chart / frustum選択があり、その回帰も通過した。実機GPUの長時間プレイ、モバイルRSS/FPS、WebKit/iPad、全ステージの元テクスチャを使う試合、Nintendo本来の11.3.0 collision / paint mask / 可動床配置は未確認。利用不可のlemuria / mahiのゲートは維持した。原典自体の欠落や、名前規則では判別できない未知の材質の意味まで解決済みとは主張しない。
