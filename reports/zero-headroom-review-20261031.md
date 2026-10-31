# Zero-headroom 提案の実装監査・統合検証（2026-10-31）

## 1. 結論と記録時点

指定された Drive のアダプターとレビュー文書を読み、公開版 `inkwave-public/` とその実際のビルド合成経路に照合した。基準は [main `df8a4b8f8c29bf68a3480e8be14624c82f6d5190`](https://github.com/rhgrive3/actions/commit/df8a4b8f8c29bf68a3480e8be14624c82f6d5190)。提案の基準 `90448d3a` より新しいコードを対象とし、既存の最適化・修正を維持した。

OPT-01〜08 は現在の所有者に合わせて採用または部分採用した。OPT-09 の時計置換、ボス履歴の閾値削除、注意値の毎フレーム減衰など、ゲームの結果を変える部分は採用しなかった。提供された単体アダプターを、現在の所有者に重ねて動かす第二の上書き層にはしていない。

ゲームプレイに関わる判定・所有権・時間進行では既存結果の維持を優先した。利用者が許可した「ほぼ見た目が変わらない」差分は、VFX の鏡面反射の計算に限定した。この部分はビット一致ではなく、実際の WebGL 描画で表示色差を測定した。

この記録は統合候補のローカル検証結果をまとめる。**本書単独では main へのマージ、ホスト CI 成功、公開サイトの更新を完了済みと主張しない。** その状態は、統合時のコミット・PR・CI 記録で別途確認する。

## 2. 入力資料と参照の優先順位

| 資料 | 出所・識別子 | この監査での扱い |
|---|---|---|
| `zero-headroom-optimization-adapter.mjs` | [Drive 原本](https://drive.google.com/file/d/1rpz5lHPXzF-qLeh4pCN5b68nkYCYoU6e/view?usp=drivesdk)、24,019 bytes、SHA-256 `e2a752de77b77d0489a1854fe47530f7c2294de332ffae7f46eb963a8518b238` | OPT-01〜09 の提案コード。現行実装へそのまま適用できるとは扱わず、演算順序・状態所有者・資源寿命を検査した。 |
| `INKWAVE-main-b1f571da-20261031-all-behaviors-individual-specs-review.md` | [Google Doc 原本](https://docs.google.com/document/d/1gdc5gbAP-TapnAi_Ml2HlxYw1eSpGjz2zhEXLXA0dXI/edit)、取得テキスト 71,107 bytes、SHA-256 `19e909b333813137b9efa6b54ff78b6c51971fd3afe697ceaec29fcf77f2f49a` | 歴史的な最適化の説明と追加提案。ファイル名の「all behaviors」を、全挙動の個別仕様適合証明とは解釈しない。 |
| INKWAVE の現行ソース・既存 fixture | 上記の固定 main、[profile](../patches/splatoon3/profile.json)、[既存挙動比較](inkwave-splatoon3-behavior-2026-10-02.md) | 実行経路・演算順序・既存回帰の基準。Splatoon 3 の参照版 `11.3.0`、基準 60 Hz を維持する。 |
| 提供 PDF と資料 ZIP | `02-splatoon3_research_v3_audited.pdf`、`01-splatoon3_research_v3_sources.zip` | 過去のモデル再構成・調査資料。11.3.0 の全パラメーターを網羅した公式または抽出済みの仕様ダンプとしては扱わない。未確認の図版・挙動があるという既存の留保も維持する。 |

添付 PDF の SHA-256 は `851a32a5e9527081183121ee05e69c0dee848f0aa21d733aa91656cef90fac4d`、資料 ZIP は `8eafdb93ab432ea4bec5b6f119f000874273afd2eb2a6c9ef178c85fa33b2ad8`。古い再構成の推定値で、現行の 11.3.0 参照値を上書きしていない。塗り半径と衝突半径、射撃方向の各軸、初弾の更新順序、固定 tick と描画の役割を混同しない。

元レビューの「改善余地が残らない」「全経路でビット完全一致」「GC スパイクが発生しない」「初見ストール完全排除」といった全称的な結論は、その文書に記載された数字だけでは成立しない。今回の実装・測定条件が直接支える範囲に限って、以下に結果を記す。元レビューの大きな改善率を今回の再測定値として転記しない。

## 3. OPT-01〜09 の採否

| ID | 実装した内容・主な経路 | 修正した点、採用しなかった部分 |
|---|---|---|
| OPT-01a | [`native-render.mjs`](../patches/native-stages/runtime/native-render.mjs)：可視状態が変わる前の連続区間を区間単位で読み飛ばし、変更した末尾も絞る。既存のタイル横断連結を維持。 | 描画順、描画数、遅延中の複数カメラの GPU 更新範囲を維持する。既存の未消費範囲を上書きして消す処理にはしない。断片化したメッシュの従来経路を残す。 |
| OPT-01b | `native-render.mjs` と [`native-ink-chunks.mjs`](../patches/native-stages/runtime/native-ink-chunks.mjs)：適用可能な属性を配列から直接読み、範囲内タイルには 30-bit 整数キーを使う。 | `(a+b+c)/3/tileSize` の順序を維持する。提案の逆数乗算への変更は境界の丸めを変え得る。正規化、half-float、独自 getter では従来の属性読取を使い、整数キー範囲外は文字列に戻す。「全経路で文字列生成ゼロ」とはしない。 |
| OPT-02 | `native-ink-chunks.mjs`：チャート全体が単一タイルに入る場合の `_faceSingleTile` を作り、実際の可視選択で利用する。 | 表を作るだけで終えず、参照する実行経路を検査。混在タイル・ヒントなし・ライフサイクル再生成でも元のソース順と塗装チャートの選択を維持する。 |
| OPT-03 | [`native-paint-detail.mjs`](../patches/native-stages/runtime/native-paint-detail.mjs)：静的投影の再利用、seed 等の不変量の引上げ、アイドル時の FBO 操作回避、保存用オブジェクトとコールバックの再利用、投影前の法線・距離除外。 | 投影配列を **2 MiB、最大 64 面**に制限。上限超過は従来同等のスクラッチ経路へ戻す。アイドル時にも uniform を発行し、例外時にも render target・cube face・mip・viewport・scissor・clear 状態を復旧する。微分は非一様分岐の外に残し、NaN の元の棄却動作を保つ。提案の全壁ピクセルで一律ループ消滅という主張は採らない。 |
| OPT-04a | [`paint-ownership.mjs`](../patches/splatoon3/runtime/paint-ownership.mjs)：前行と x 範囲が同じ所有矩形を縦に連結する。 | 直前行の整列済み区間を線形走査する。出力全体を逆向きに探す提案は、終了した兄弟矩形が継続矩形を隠す例があり、そのまま使わない。所有セル、塗り順、turf、クリップ・atlas padding の領域を維持する。 |
| OPT-04b | `paint-ownership.mjs`：同じ方向ストレッチ除算の共有、セル証拠判定における前後スケール・楕円係数の引上げ。 | **部分採用。** 現行の境界判定に沿って安全な不変量だけを移す。元レビューの旧形式に合わせたフィールド一括注入や、符号付き距離を二乗式へ変える変更は行わない。 |
| OPT-05 | [`special-vfx-kit.mjs`](../patches/splatoon3/runtime/special-vfx-kit.mjs)：フレーム時間条件と ribbon オプションの引上げ、鏡面反射 `pow` の乗算列化と `rl > 0.65` の裾切り。 | **部分採用・鏡面反射のみ近似。** 粒子の `Math.hypot`、`Object.is`、既存の境界球・パディング・乱数・時間進行を提案どおり一括置換しない。NaN、符号付きゼロ、極端な値と既存更新規則を保つ。既存の強いハイライト境界は維持する。 |
| OPT-06 | [`native-level.mjs`](../patches/native-stages/runtime/native-level.mjs)：三角形内判定を展開済み頂点からスカラー計算する。 | vendored Three の実際の `first = 1-u-v`、`first >= 0 && v >= 0 && first+v <= 1` の順序を維持。数学的には同じでも浮動小数点の共有辺で変わる `u >= 0` 形式には置き換えない。 |
| OPT-07 | [`bossBrain.js`](../inkwave-public/src/boss/bossBrain.js)：空でない `dmgBy` について `Math.exp(-dt/8)` をフレーム当たり一度計算する。 | 閾値 `< 1e-4` による削除は不採用。小さい履歴・subnormal を残す。`attn` は毎フレームの指数減衰対象ではなく、元どおりターゲット選択時に 0.8 倍する。選択結果を変えるヘルパーを適用しない。 |
| OPT-08 | 実際の [`flow-motion.mjs`](../patches/splatoon3/runtime/flow-motion.mjs)、[`special-presentation.mjs`](../patches/splatoon3/runtime/special-presentation.mjs)、[`swim-surface.mjs`](../patches/local-quality/swim-surface.mjs) と [`swim-splash-adapter.mjs`](../patches/local-quality/swim-splash-adapter.mjs) に prewarm を接続する。 | 一般的な平面ダミーは skinning・instancing・専用属性を代用できない。既存の special VFX keeper は重複追加せず、DOM/SVG のチャージャー照準を Three shader として扱わない。全 GPU ストールの排除とは主張しない。 |
| OPT-09 | [`clock.mjs`](../patches/splatoon3/runtime/clock.mjs) の現行実装を維持し、既存回帰を確認した。 | **提案ヘルパーは不採用。** `finalTick`、`advancing`、tick counter、ゲーム用 RNG、入力・回復の所有者を落としている。wall-clock 予算と最低実行数だけでは、1 tick の計算時間が進むゲーム時間を超える場合の負債を解消しない。ネットワークの権威・回復方針を別途設計せずに置換しない。 |

## 4. 境界・所有者・資源寿命の検証

### 描画インデックスと幾何判定

変更前 fixture と比較し、可視区間の先頭・末尾変化、全非表示、再表示、断片化、複数カメラ、遅延した GPU 転送を検査した。単一タイルのヒントを使う経路と、同じヒントを外した経路でも選択インデックスが一致する。

属性読取では通常配列、interleaved、正規化整数、half-float、独自 getter、整数キー範囲外を含めた。三角形内判定は退化三角形、共有辺とその近傍を含む **20,000 点**を vendored Three と比較した。物理結果を許容誤差で丸めて通す変更ではない。

### detail cache

投影配列の上限は 2 MiB、保持面数は 64。管理用オブジェクト等の小さな付随領域は別に存在する。元からある detail 用 GPU render target の 4 MiB と、今回の CPU 投影配列の上限を混同しない。原データ配列・triangle ID 配列・基底が置き換わった場合は再計算し、clear/dispose で解放する。

このキャッシュは現行 native stage の静的な三角形データ契約に依存する。三角形配列を同一インスタンスのまま任意に書き換える一般的な動的メッシュキャッシュではない。大きすぎる面はキャッシュしない。アイドル時の uniform 公開と、能動更新・失敗時の描画状態復旧を個別に確認した。

### 所有矩形

縦連結では矩形の数・配列順が意図的に変わる。したがって旧テストの「矩形列そのものの同一性」は適切な最終条件ではない。被覆領域、所有セル、turf、境界の保存と、GPU の最終 RGBA バイトを確認する条件に整理した。終了した兄弟の後ろに継続矩形があるケース、空行、fractional cell、切り詰めた領域、atlas 外周も対象とした。

### prewarm

Flow は実際の instanced glints、ribbon、squid の変形用 mesh、3 LOD の skinned shell を、既存 Character の HDR compile より前に構築する。初期状態の Flow を発動させたり、可視化・時間進行したりはしない。

Zipcaster は実際の native geometry と skeleton を借りる coat を保持する。非使用時には scene から外し、次の発動で再利用する。geometry の元の所有者は維持し、coat 専用 material は Character の寿命で解放する。元の tier/skeleton が替われば再構築する。

Film は FX が保持する実際の `filmData` geometry と `MeshPhysicalMaterial` を同じ HDR target で compile し、最初の泳ぎに同一 slot を渡す。レビュー中に次の二点を修正した。

1. キャラクターごとに作る renderer facade ではなく、同じ実 GL context をキーにして重複 prewarm を共有する。
2. FX と scene がステージをまたいで残るため、`FX.clear()` でも warm promise を無効化する。これにより、scene の同一性だけで新ステージのライト構成を古い shader と取り違えない。

context loss/restoration、target・material の世代変化、compile 失敗の再試行、render target の復旧、FX dispose 時の listener と fallback target 解放も検査した。

## 5. 今回の CPU 測定

以下は今回の Node CPU microbenchmark。変更前は固定 main の実装、変更後は今回の実装である。測定順を交互に入れ替え、2 回の warmup 後、7 サンプルの中央値を採った。比較対象は局所処理であり、対戦全体、端末 FPS、GPU 時間、GC 時間の測定ではない。

| 条件 | 変更前中央値 | 変更後中央値 | 処理時間の減少 |
|---|---:|---:|---:|
| 描画選択：12,000 三角形、800 回のカメラ選択、後方のタイル境界が変化 | 2.440135 ms | 1.936887 ms | **20.6%** |
| native partition 初期化：60,000 三角形 | 6.364305 ms | 3.447612 ms | **45.8%** |
| native detail replay：500 三角形 × 1,000 呼出し、cache 初回構築を含む | 38.944925 ms | 22.250769 ms | **42.9%** |

証拠は監査パッケージの `adapter-review/native-benchmark.json`、再実行コードは `adapter-review/benchmark-native.mjs`。fixture・実行環境に依存する局所値である。元レビューの -89.96%、-75.51% 等とは測定対象・条件が違うため、同じ測定の再現成功とも性能退行とも判定しない。未測定の OPT 項目に改善率を補完しない。

## 6. WebGL の表示差と塗り

### VFX の鏡面反射

Chromium `151.0.7922.34` / WebGL 2 / ANGLE SwiftShader で、変更前後の実際の `sxInk` GLSL を描画した。sphere normal、view 4 方向、light 4 方向、光強度 1/4/10、2 hemisphere の **96 条件**。色と gloss の変化を含む 512 × 512 の画面を比較し、vendored Three の `NeutralToneMapping` と sRGB 変換を適用した。

| 指標 | 実測値 |
|---|---:|
| 比較した総ピクセル | 25,165,824 |
| 表示 RGB の最大チャンネル差 | **1 / 255** |
| 変化したピクセル | 3,636、**0.014448%** |
| 平均絶対チャンネル差（0〜255 の byte 単位） | 0.0000484917 |
| HDR 線形値の最大チャンネル差 | 0.0011749268（光強度 10 の条件） |
| 非有限値、WebGL エラー、ブラウザエラー | 0 |

CPU の理想的な `pow` 値と GPU の実際の `pow` は同一ではない。裾切りの数学的上限だけを、GPU の全演算誤差の上限として使っていない。表示差の受入根拠は上記の実描画であり、線形 HDR 値までビット一致したという意味ではない。ユーザーの小さな見た目差の許可に対応する測定結果である。

証拠：`adapter-review/vfx-webgl-verification.json`、`adapter-review/verify-vfx-webgl.mjs`。比較スクリーンショットも内部の目視検査に用いたが、配布パッケージには含めない。これは controlled component render であり、全ゲーム画面・全カメラ・実機の網羅比較ではない。

### 塗り所有矩形の縦連結

実際に合成した PaintSystem と GLSL を使い、床・壁 × line/shot/roller の 6 条件を、変更前後で比較した。所有 grid・owner・turf の一致を維持し、512 × 512 の最終 RGBA8 は全 6 条件で **不一致 0、最大差 0** だった。

| 面・条件 | 変更前 quad 数 | 変更後 quad 数 | RGBA 不一致 |
|---|---:|---:|---:|
| 床・line | 1,692 | 1,391 | 0 |
| 床・shot | 1,899 | 1,509 | 0 |
| 床・roller | 828 | 792 | 0 |
| 壁・line | 4,294 | 3,004 | 0 |
| 壁・shot | 4,755 | 2,961 | 0 |
| 壁・roller | 828 | 792 | 0 |

証拠：`adapter-review/paint-coalescing-webgl.json`、`adapter-review/verify-paint-coalescing-webgl.mjs`。quad の減少をそのまま同率の FPS 向上とは扱わない。

## 7. 配信物の実 shader linking と再利用

通常の最適化ビルドで生成した minified module を Chromium に配信し、source motion が `ready` になった実 native Character と、実際の scene lighting・HDR render target を使った。VM の記録用 renderer に渡した引数だけを調べる unit test とは別の確認である。

| 項目 | 結果 |
|---|---|
| Flow instanced glints と専用属性 | 実 shader の link 成功 |
| Flow skinned shell | 9 mesh、実 skeleton を使用 |
| Zipcaster coat | 9 skinned mesh、実 skeleton を使用 |
| Film | 実 `filmData` geometry・Physical material、同じ HDR target |
| 対象 material | 8 個とも初回利用前に program を保持 |
| 制御した初回 Flow / Zipcaster / film 発動で追加された対象 program variant | **0** |
| Zipcaster 2 回の発動 | 同一 coat を再利用、借用 geometry の dispose 0 |
| 最初の泳ぎ | prewarm 済み film slot 1 個をそのまま再利用 |
| FX.clear 後、同じ scene に light を追加 | 新しい film program variant を実際に link |
| Character 廃棄 | 所有する coat material を一度だけ dispose |
| ブラウザエラー、欠落リソース、GL エラー、context loss | 0 |

証拠：`independent-audit/emitted-prewarm-result.json`、`independent-audit/verify-emitted-prewarm.mjs`。制御した presentation 発動による検証であり、全対戦の入力・通信・GPU latency を測ったという主張ではない。「対象 8 material で初回追加 variant 0」と「どの GPU でも全同期ストール 0」は異なる。

## 8. 回帰テストと重複の扱い

以下は今回の変更に関連して選択したローカルテスト群。リポジトリの全テスト数ではない。各担当の再実行を別テストとして加算していない。

| 分野 | Pass | Skip | 内容 |
|---|---:|---:|---|
| root：paint / VFX の直接回帰 | 54 | 0 | 新規 run coalescing 3、glint 1、single-piece 3、ancillary 4、sprite eviction 5、pool capacity 6、visual batch231 8、ribbon 群 16、sprite drag 3、ribbon tail 5 |
| behavior：boss / clock / Flow / swim / special / prewarm | 48 | 0 | boss 5、clock 17、remaining prewarm 4、Flow 13、swim FPS 1、special holds 7、program keepers 1 |
| CI 契約・登録のローカル回帰 | 14 | 0 | `inkwave-test-suites.test.mjs` 7、`inkwave-test-shards.test.mjs` 7。ホストされた CI run の成功と同一視しない。 |
| native 既存回帰 | 32 | 5 | display/detail 10、chart 等 19、遅延 index transfer 3。5 件は stage payload がないため skip。 |
| native 新規回帰 | 6 | 0 | prefix/dirty suffix、属性復号、single-tile hint、barycentric、bounded cache、FBO 状態復旧 |
| 既存 owned-run scan 回帰 | 2 | 0 | 旧矩形列一致条件を、領域保存と矩形数非増加へ更新した 1,200 + 160 grid ケース |
| CI で判明した復旧ゲートの観測修正 | 78 | 0 | context recovery 28、streamed-music diagnostics 47、既存 media admission 3。正常な旧メニュー中断の証拠、欠落した証拠・重複中断・復旧後の追加失敗の棄却を確認。 |

この表の重複除外済み小計は **234 pass、5 skip、0 fail**（最適化本体等の初期 156 と、その後の復旧ゲート関連 78）。独立担当の初期集計「54 pass」は native 32 と boss/clock 22 から成るため、上表の 48 に含まれる boss/clock を再加算していない。glint の確認再実行も 1 テストのまま数える。skip は成功に振り替えない。

新規 native 回帰は `scripts/ci/inkwave-test-suites.json` の `quality` に一度登録し、main push の品質ゲートと既存 native stage PR 検出経路で実行される。Splatoon の新規 3 ファイルは既存の必須 source shard にそれぞれ一度割り当てられることを契約テストで確認した。別の実行スイートに重複追加していない。

手動測定用の `scripts/measure-owned-run-scan.mjs` にも古い矩形列一致条件が残っていたため、厳密な被覆・重複回数、所有権配列の一致、矩形数非増加へ更新した。`--verify-only` で 1,200 ケースが成功し、対象の矩形合計は 215,607 → 184,084。長時間の測定ループはこの確認では実行していない。この 1,200 はケース数であり、上表へ 1,200 個の独立した test として足していない。

実行環境では `node --test` の子プロセス出力がファイル単位の要約だけになる場合があった。名前付き subtest を確認するため直接実行も用いた。意図的に失敗する一時プローブでは終了コード 1 が保たれており、出力制限を「失敗まで成功扱いする」とは判断していない。VM fixture を使うテストには `--experimental-vm-modules` が必要である。

主な再実行コマンド（リポジトリ root）：

```sh
node patches/native-stages/tests/native-zero-headroom.test.mjs
node patches/native-stages/tests/native-ink-index-transfer.test.mjs
node --experimental-vm-modules patches/native-stages/tests/native-display-coalesce.test.mjs
node --experimental-vm-modules patches/native-stages/tests/native-display-runs.test.mjs
node --experimental-vm-modules patches/native-stages/tests/native-paint-detail.test.mjs
node --experimental-vm-modules patches/native-stages/tests/ink-chunks.test.mjs
node --experimental-vm-modules patches/native-stages/tests/ink-offscreen-chart.test.mjs
node --experimental-vm-modules patches/native-stages/tests/ink-empty-lifecycle.test.mjs
node scripts/tests/inkwave-boss-processing.test.mjs
node patches/splatoon3/tests/clock.test.mjs
node patches/splatoon3/tests/paint-run-coalescing.test.mjs
node patches/splatoon3/tests/paint-owned-run-scan.test.mjs
node patches/splatoon3/tests/special-ink-glint.test.mjs
node --experimental-vm-modules patches/splatoon3/tests/remaining-combat-prewarm.test.mjs
node --experimental-vm-modules patches/splatoon3/tests/flow-motion.test.mjs
node --experimental-vm-modules patches/local-quality/tests/swim-surface-fps.test.mjs
node --experimental-vm-modules patches/splatoon3/tests/special-holds-quality.test.mjs
node --experimental-vm-modules patches/splatoon3/tests/special-program-keepers.test.mjs
node scripts/tests/inkwave-test-suites.test.mjs
node scripts/tests/inkwave-test-shards.test.mjs
node scripts/measure-owned-run-scan.mjs --verify-only
node scripts/tests/inkwave-context-recovery-browser.test.mjs
node scripts/tests/inkwave-streamed-music-diagnostics.test.mjs
node scripts/tests/inkwave-browser-media-admission.test.mjs
```

VM fixture の source-motion fallback 警告を、実際の asset 読込成功とは数えていない。source-loaded Character を使う配信物側の確認は前節の独立した WebGL probe で行った。

## 9. ビルド・配信物・起動予算

次のゲートが成功した。

```sh
node scripts/ci/check-composition-preflight.mjs
node scripts/check-inkwave-patches.mjs --quick
node scripts/inkwave-source-migration-audit.mjs
node scripts/build-inkwave.mjs inkwave-public ../independent-audit/site
node scripts/check-inkwave-startup-budget.mjs ../independent-audit/site
```

composition preflight は 119 source files / 75 adapted。migration audit は failure 0 / direct owner 18。互換性チェックは reference `11.3.0` で成功した。起動ゲートは artifact hash、静的 import、precache、worker と byte budget を検査している。

| 配信物識別・予算 | 値 |
|---|---|
| Content hash | `9f4f5f403173e82d19570d6b423af6d65e1dd36dfd153189eae0a94432e2b5d5` |
| Revision | `def8f02e1b11d5e31ed3f137308157b54faa657c2413f8cd14f56883297024c8` |
| 初期 JS | 1,855,508 bytes / 146 requests |
| Module preload | 145（core 131、practice range 14） |
| Precache | 8,042,116 bytes / 599 assets |
| Service worker | 98,954 bytes |
| Critical HTML | 24,043 bytes |
| Declared revision payload | 16,816,302 bytes |

この content hash は今回の検査対象ビルドを識別する。後続の変更やホスト CI の生成物が同じかは、その生成物自身の manifest で確認する。

ソースの復元時に欠けていた `patches/local-quality/ink-volume/assets/roller/volumes.bin.gz` は、固定 main の Git blob `8ca0aef83654603e079a7e1e88dba2afc2dcb464`、17,636,846 bytes と一致する原データを復元した。別素材で代用したり、packaging の一致検査を無効化したりしていない。これは最適化の機能変更ではない。

証拠：`independent-audit/production-build.log`、`independent-audit/startup-budget.json`、`independent-audit/composition-preflight.log`、`independent-audit/patch-quick.log`、`independent-audit/source-migration.log`、`independent-audit/summary.json`。上記の `adapter-review/` と `independent-audit/` は監査作業パッケージでの位置を示し、標準のゲーム配信物には含めない。

## 10. 挙動比較の条件と未確認範囲

比較の本家参照版は既存と同じ Splatoon 3 `11.3.0`。この変更では特定ブキの威力・塗り半径・衝突半径・発射間隔・インク消費・ギア倍率を新しく校正していない。native 幾何、所有セル、VFX、ボス処理と prewarm の実装経路を対象とした。clock 回帰は 20〜144 Hz の外側更新、catch-up、停止・入力・結果状態を含むが、その成功を全操作の本家実機一致と呼ばない。

| 範囲 | 確認状態 |
|---|---|
| 対象 CPU 処理の旧結果保存 | 選択した fixture と境界回帰で確認 |
| Paint の被覆・所有・turf と 6 条件の実描画 | 確認。RGBA8 の差 0 |
| VFX 鏡面反射の小さい表示差 | 96 条件の実 WebGL で確認。最大 1/255 |
| 実際の配信 module における Flow/Zipcaster/film prewarm | 対象 8 material、制御した発動で確認 |
| native stage 全アセット・全ステージの描画 | 今回は未確認。ローカルに prebuilt payload がない 23 stage は build の browser conversion fallback を使用 |
| iPad mini 6、Safari、実 GPU の FPS・温度・長時間 GC | 未測定 |
| 4 倍 CPU throttling の対戦全体・ネットワーク復旧 | この変更の完了根拠として未測定。OPT-09 を採用していない |
| Nintendo 実機との全挙動・全フレームの比較 | 未確認。既存報告の未確認事項を継承 |

今回の局所短縮と小さい表示差から、「今後の最適化余地がない」「全端末でフリーズしない」「完全再現」とは結論しない。採用した最適化の具体的な結果、意図的に維持した挙動、未測定の境界を上記のとおり残す。

## 11. 統合 CI で判明した復旧ゲートの観測不足と修正

[PR #1977](https://github.com/rhgrive3/actions/pull/1977) の最初の候補 `52fcb0a500b0789d2f2dda87014ed6bdc4a8a747` で、[terminal recovery の初回実行](https://github.com/rhgrive3/actions/actions/runs/41162027773) が失敗した。失敗位置は実際の WebGL context loss より前の音声ネットワーク確認で、旧メニュー録音 `menu_the_ika_swing_aoi_kenban.mp3` の `net::ERR_ABORTED` が 1 件あった。HTTP エラーやページエラーはなく、battle 録音 `Jet_Arrow.mp3` の受信完了後に起きていた。

初回 artifact は battle 録音の受信を証明するが、実再生の状態は記録していない。そのため初回の失敗を事後的に成功扱いにはしていない。既存の一般ブラウザゲートが持つ厳密な旧メニュー中断の判定を、復旧ゲートにも接続した。変更は [`check-inkwave-context-recovery-browser.mjs`](../scripts/check-inkwave-context-recovery-browser.mjs)、[`inkwave-streamed-music-diagnostics.mjs`](../scripts/lib/inkwave-streamed-music-diagnostics.mjs) と関連する 2 テストである。

判定には、現在の revision の正確なメニュー URL、単発の `ERR_ABORTED`、battle 録音の HTTP 200 と同じ request ID の完了、実 `RG` の `battle` 所有者・非廃棄・非失敗・`readyState >= 3`・再生中・エラーなし・正確な `currentSrc` が必要となる。欠落した証拠、別の通信中断、重複、HTTP・ページ・ライフサイクル異常は棄却する。元の失敗記録はすべて残す。context loss 前に許可した記録を変更不能なコピーで固定し、復旧後の新しい失敗が古い再生証拠で受け入れられることも防いだ。観測ヘルパー自体も checkout のハッシュ照合対象に含めた。

関連する 78 個の名前付きテストが成功した。元からある子プロセスの未処理 rejection テストは、制限付き実行時に stdout が空になったため、同じ直接実行コマンドを子プロセス実行可能な環境でも確認した。アサーションは変更せず、28 / 47 / 3 の全件が成功している。

実ブラウザの再検証に必要な旧メニュー音源は、固定 main の Git blob `35a7e223071cb551db12f0b0327d6a38a8cc1df3`、7,016,626 bytes と一致する原本を復元した。これを含む検証ビルドは content hash `0137de77cfb0b4b151918438c82fbf1017e79697983aad6e1c4c85a8355c8efb`、revision `c804280a7b0ecc30e4105cb66bc4520633731e03f22222af645e0aceda3d5cca`。後者は初回 CI artifact と同じ revision である。第9節の先行ビルドを使った測定記録も、その識別子のまま保持する。

修正後の Chromium 151 / SwiftShader では、同じメニュー中断 1 件を残したまま、battle が `readyState = 4`、非停止、エラーなし、再生位置 4.260862 秒であることと実ネットワークの完了を確認できた。未確認の中断、HTTP・ページ・ライフサイクルエラーは 0。実ブラウザが発行した trusted context lost / restored、120 回の RAF、60 回の直接更新を通して、match・paint・grid・counts・overlay の所有者と全 grid byte が保存された。通常 pause / resume と terminal 状態での再開拒否も成功した。

証拠：監査パッケージの `independent-audit/recovery-context/result.json` と `independent-audit/recovery-production-build.log`。この追加確認はローカルの実配信ビルドによるものであり、修正後 head のホスト CI 成功は PR の実行結果で別途確認する。
