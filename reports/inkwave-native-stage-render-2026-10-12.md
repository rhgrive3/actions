# 原典ステージの描画領域選択

PR #1285のmainマージ `ed3a0465` とPagesの実選択確認後、`codex/stage5-render-performance` で継続する。原典OBJ/PNGとゲームのCPU塗り・衝突・ナビ・配置を保持し、画面外のインク用三角形のGPU送信を減らす。

## 実装

`patches/native-stages/runtime/native-ink-chunks.mjs` は元三角形の重心で16単位の描画領域を作る。境界をまたぐ三角形は分割せず、全頂点を含む球で可視判定する。16はINKWAVEの描画分割値で、本家のマップ単位・衝突セルではない。

領域を別Meshで描かず、可視領域の三角形を元の順に1つの動的indexへ集める。透明描画のソート中心、材質、元属性、三角形順を維持する。可視領域が変わらなければindexを書き直さない。品質切替は既存の `levelMesh.geometry` 契約で再構築し、切替・取消・失敗時に旧GPU資源を破棄する。

インクの追加discardは、`dFdx/fwidth`を使うシェーディングより後、色出力より前へ移動した。非一様な早期discard後の微分を避ける修正で、本家のシェーダー再現を示すものではない。

## 確認した範囲

全5原典で、領域間に三角形の欠落・重複がなく、元の位置・法線・塗りUVなど全属性を共有することを検査した。全域が見えるカメラでは全indexが元の順序と一致する。境界をまたぐ三角形、空の視界からの復帰、可視領域が同じ場合のupload抑制も確認する。

Chromium/SwiftShaderで各5ステージ×3方向、480×320 render targetの地形/塗り画素は差0。対照のA/AとB/Bも差0。キャラクター表示には同一描画間にも数画素の変化があったため、画素比較はキャラクターrootだけを非表示にして地形を検査する。負荷測定は実際の8人を含む。シミュレーションを停止して表示をウォームアップし、比較中は他Meshの描画時catch-up hookを固定する。CPU paint/physics/nav/geometryの同一性を検査する。

中央の固定比較視点でのインク用三角形数（背景・元表示モデルを含む合計ではない）:

| ステージ | 全域描画 | 領域選択 | 削減 |
| --- | ---: | ---: | ---: |
| ユノハナ | 70,179 | 35,287 | 49.72% |
| ヤガラ | 91,151 | 55,377 | 39.25% |
| 海女美 | 30,861 | 14,426 | 53.25% |
| ザトウ | 87,393 | 51,755 | 40.78% |
| クサヤ | 114,422 | 67,741 | 40.80% |

視点によって効果は異なる。全体を見下ろすとほぼ全三角形を描く。ソフトウェアGLの時間は変動し、一部比較では遅くなる。三角形数の削減率をFPSの改善率にはしない。実モバイルGPU・Switchの描画時間は未計測。

原典変換/物理/塗り/30・60・120 Hz移動/ナビ/ルール/描画領域のNode23件はskip/失敗0。品質変更と既存ステージ/ルール27件もskip/失敗0。通常ビルドはprecache 5,731,640 byte、worker 70,515 byte、131 core + 14 range hintsで既存上限内。参照アセットは通常ビルドへ含めない。

## 再現と未確認

```sh
INKWAVE_NATIVE_STAGE_SOURCE=.codex-stage-sources/KiTrix/stages \
INKWAVE_NATIVE_STAGE_ASSETS=.codex-stage-sources/generated \
node --experimental-vm-modules --test patches/native-stages/tests/*.test.mjs

INKWAVE_NATIVE_STAGE_ASSETS=.codex-stage-sources/generated \
node scripts/build-inkwave.mjs inkwave-public _site-native-perf-local
node scripts/check-inkwave-native-render.mjs _site-native-perf-local .browser-evidence/native-render
NATIVE_RENDER_MOVING=1 NATIVE_STAGE_IDS=scorch,brinewater \
node scripts/check-inkwave-native-render.mjs _site-native-perf-local .browser-evidence/native-render-moving
```

ローカルpreparedビルドは検証専用で、モデル・PNGを公開しない。証拠はignored `.browser-evidence/` と `.ci-scratch/`。通常公開ビルドはブラウザ直接取得を維持する。

モデルの11.3.0版一致、原作のスポーン/ルール別scene、ネイティブmask、照明/シェーダー、実機性能は未確認のまま。[選択・続行記録](inkwave-native-stage-selection-2026-10-12.md)と[初期統合記録](inkwave-native-stage5-2026-10-12.md)の制約を引き継ぐ。今回の変更だけで完全再現とは判定しない。

## 移動画角・本体・CIの追加確認

ユノハナ/クサヤで12個の連続した移動画角を比較し、index更新はそれぞれ11/12回・12/12回。領域選択CPU時間の中央値は0.30/0.45ms。このローカルのソフトウェア環境ではGPU drain込み中央値が4.55→3.35ms、7.00→5.60msだった。全5ステージの固定視点には逆に遅くなる比較もあり、機種全般の高速化・60fps維持とは扱わない。参照Meshは独立した属性を所有し、比較後の破棄で本体のGPU bufferを削除しない。最終Scorch対照はshader/console/WebGLエラー0、画素差0で通った。

実際のhigh→low品質切替はCPU gridと全三角形の位置、level/physics/nav/paintの同一性を保持した。破損アセット復帰、並行ロードの取消、原典→既存→原典→既存の切替を確認した。ユノハナ/クサヤのtouch viewportで8人・2048 atlas・射出後の着地・GL描画を確認。タッチ画面のエミュレーションで、モバイル実機ではない。

通常の公開ビルドを実際の選択ボタンから起動し、Scorchの外部取得、8人、塗り・着地・GLを再確認。derived cache再訪のOBJ取得0、console/pageエラー0。全5ステージの実WebSocket/本番RoomDurableObjectを使うTurf再検証では、ノヴァの半径3.84を含む全CPU grid SHA-256が一致し、各8人、エラー0。元の25ルール検証はmainマージ前の記録として保持する。

main mergeの全体CI [38254171278](https://github.com/rhgrive3/actions/actions/runs/38254171278)ではnative-stages入力を未登録だった旧verifierが停止し、旧メニューselectorに固定したテストと、importsを外した起動fixtureの未定義依存も失敗した。既知のnamespaceを各厳密検証へ登録し、元のGit blob/asset/hash/改ざん拒否を維持した。起動fixtureには実registry定数と非原典release契約を渡し、paint-mask fixtureにはnon-native Level契約を渡す。関連219件と最終build packaging9件はskip/失敗0。source空間とCIの/mnt空間の両方で永続ストレージを使い、OS temporaryと逃げるsymlinkの拒否を維持する。

既存Flowの11操作と壁10操作のGTAO/所有GPU buffer破棄検証も同一commit `61c05a2b` で成功。全motion catalogは27ケース・5310frame・349描画比較・300moduleの検証に成功した。これらはINKWAVEの厳密な実装検証で、本家の関節曲線・ネイティブpaint/collision maskの証明ではない。

ビルド最終revisionは `99028ba751be8f82cc3fbdcb761a50a6a08eea02e774cfb7c6d70c8a3444aadd`。測定ビルドと最終ビルドのnative engine/Three.jsはバイト一致（engine SHA-256 `b10f9f320d85cfd826f95ac8521635101d0b2bd9da0ac69e9566b08a7af9baf5`）。検証コードや記録の後続更新と描画ロジックを区別する。[数値記録](inkwave-native-stage-render-verification-2026-10-12.json)に条件・結果を保存する。

同じLeanny commitの11.3.0 `SceneInfo.json`（SHA-256 `37b9cce349998238b86c353c151f618827220a718a0613a44ef2c64295c87d3e`）と `MapObjReplicaInfo.json`（`3ed4332dad172f0253172e6b504f99aed2f024e3180814749b122e67498aec42`）も調べた。前者はscene ID/label/model resource等、後者は45種のrow IDだけで、spawnやルール配置のtransform座標を含まない。この資料から本家配置の確定値は作らない。

最終のsource-composed/emitted paint-mask WebGL検証は124ケース・1512 hash query・15295 cellに成功した。Roller body99ケースのCPU-only/GPU-onlyは0（境界tie9）。全体CIで止まった入口を実際に通し、判定閾値・sample数・canonical hashの検査を維持した。

mainの並行更新 `ac1159b7`（#1284/#1296/#1297）を `c22cdacd` で統合し、共有比較記録の追記を両方保持した。原典23件、更新された弾道/受信20件、最終packaging9件、通常ビルドのScorch実選択/8人/着地/再訪cache/consoleエラー0を再確認した。native engineのバイト列は上記SHA-256と同じ。統合後revision `f96dec49e3a157e8dc546223e032f3ed70554cebfbf3f59974eb5605896dd137`、precache 5,743,681 byte、worker 70,515 byteで既存上限内。追加変更はレビュー用 [PR #1312](https://github.com/rhgrive3/actions/pull/1312) に保存し、mainへはマージしない。
