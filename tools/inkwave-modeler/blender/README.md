# INKWAVE — Blender 5.2 マスターへの移行レポート

対象: `../INKWAVE_AI_MODELER_FINAL.html` の Aqua Tech リファレンスキャラ（`inkwave-ref-aquatech`、366,476 三角形）。
状態: **移行は完了**。元の `inkwave_character_source.glb` は Three.js の形状を保持する基準データ。
現在の Blender マスターには、その後の顔のスカルプト、顔の見た目の仕上げ（`scripts/inkwave_face_look.py`）と靴下の色柄修正が入っているため、元データとは意図的に差がある。
顔の測定と残差は `../docs/face-refinement/README.md` に記録する。
2026-09-28: 5 方向の参照シートに合わせる多視点フィット、目頭〜頬のならし、上唇、下まつ毛を入れた（`../scripts/inkwave_face_multiview_fit.py`、記録は `../docs/face-multiview-fit/README.md`）。元の状態はマスターの中の `FACE_FIT` コレクションと属性に残り、`--restore` で戻る。

Blender 側で作り直したものはない。ブラウザのランタイムが作った最終バッファ（スカルプト、ヘアスプライン、ディテールの変換を適用済み）を
そのまま GLB に書き出し、Blender はそれを読み込んで、glTF が運べない部分だけを足している。

## 1. ファイル

| ファイル | 内容 |
|---|---|
| `inkwave_character_source.glb` | ランタイムからの書き出し（HTML の **Export to Blender (.glb)** ボタンと同じ）。229 メッシュ、129 材料、ルート extras にプロファイル全体。 |
| `INKWAVE_CHARACTER_MASTER.blend` | 編集用マスター。意味ごとのコレクション、4 枚の参照画像（パック済み）、スタジオ照明、検証カメラ。画像はすべてパック済みで、外部ファイルに依存しない。 |
| `INKWAVE_CHARACTER_MASTER.glb` | マスターから書き出した Web PBR の GLB（Y-up、extras 付き、カメラ・ライト・参照なし）。 |
| `INKWAVE_GAME.glb` | ゲーム用。現在は `INKWAVE_CHARACTER_MASTER.glb` と同じバイト列。 |
| `migration_counts.json` | 最後のビルドの数値（メッシュ、三角形、材料、Blender 専用の追加、法線マップ変換）。 |
| `references/` | HTML に埋め込まれた参照画像を取り出したもの（front / back / left / persp）。 |
| `../docs/blender-migration/` | Three.js と Blender の 5 方向比較画像と `view_compare.json`、ヘアの影の証拠、ゲーム GLB を Three.js で表示した比較。 |

### ブラウザで Blender 版を見る

`tools/inkwave-modeler` で `python3 -m http.server 8765 --bind 0.0.0.0` を起動し、
`http://localhost:8765/INKWAVE_AI_MODELER_FINAL.html` をブラウザで開く。
リモート VS Code ならポート 8765 を転送する。左の **View workspace Blender model** を押すと、
隣の `blender/INKWAVE_GAME.glb` が直接読み込まれる（実機側のファイルピッカーは不要）。
画面のドラッグで回転でき、Front / Right / Back / Left / Perspective でも確認できる。
**Show procedural model** で生成版へ戻る。
比較画像は `../docs/blender-migration/compare_*.jpg` にある。

## 2. 元の Three.js モデルから移行し直す手順

この節は**初回移行の再現**用。現在の編集済みマスターに対して実行すると、Blender で行った顔の造形が移行時点に戻る。

`TMPDIR` などは永続ディレクトリに向けること（`/tmp` は使わない）。Playwright は `playwright` として import できること、
`../analysis/three.min.js` があること（`../analysis/README.md` の Setup）。

```bash
cd tools/inkwave-modeler
node scripts/inkwave_export_source.mjs INKWAVE_AI_MODELER_FINAL.html blender/inkwave_character_source.glb <qa-dir>
blender --background --factory-startup --python scripts/inkwave_blender_import.py -- \
  --source blender/inkwave_character_source.glb --output blender/INKWAVE_CHARACTER_MASTER.blend \
  --export blender/INKWAVE_CHARACTER_MASTER.glb --game blender/INKWAVE_GAME.glb --render-dir <renders>   # --no-render で約 7 秒
node scripts/inkwave_roundtrip_qa.mjs --tree <qa-dir>/export_tree.json --baseline blender/inkwave_character_source.glb \
  --glb master=blender/INKWAVE_CHARACTER_MASTER.glb --glb game=blender/INKWAVE_GAME.glb --out <qa-dir>/roundtrip.json
node analysis/render.mjs INKWAVE_AI_MODELER_FINAL.html <renders>/three <jobs.json>   # Three.js 側の mask / beauty
python3 scripts/inkwave_view_compare.py --three <renders> --blender <renders> --out <cmp> --docs docs/blender-migration
blender --background blender/INKWAVE_CHARACTER_MASTER.blend --python scripts/inkwave_blender_reopen_check.py -- --out <dir>
node scripts/inkwave_glb_three_render.mjs blender/INKWAVE_GAME.glb <prefix>      # ゲーム GLB を同じスタジオの Three.js で表示
```

ジョブの形式は `analysis/render.mjs` のとおり: 正面・右・背面・左は `{"view": v, "mode": "mask"|"beauty", "scale": 0.5}`（561×701）、
パースは `{"persp": [-0.55, 0.08, 3.3, 700, 875, [0, 0.8, 0], 30, null, "mask"]}`（700×875、最後の 2 つを省くと beauty）。

## 3. 移行したもの

- **ジオメトリ**: 366,476 三角形、229 メッシュ。ボディとヘアは結合前の部品単位（`BODY_arm_L`、`HAIR_strand_07_…` など）に分けた。
  各メッシュにランタイムのワールド変換を焼き込み、ルート `INKWAVE_CHARACTER` にランタイムのルート変換を置いた。
- **階層**: ルート → `BODY` / `HEAD` / `HAIR` / `CLOTHES` / `LEGWEAR` / `SHOES` / `HEADGEAR`。Blender では同名のコレクションにも入る。
  ノードの extras（`modelPart`、`gearSlot`、`sourceUUID`、ヘア・肌シェーダの値）とルートの extras（プロファイル全体）は
  Blender のカスタムプロパティになり、マスター GLB に戻る（230/230 ノード）。
- **材料**: 同じ見た目の材料をまとめて 129 個（以前は 1 メッシュ 1 材料で 229 個）。ヘアの毛束 42 本は、それぞれ固有の焼き込みマップを持つので別の材料のまま。
- **参照**: `REFERENCE_FRONT/BACK/LEFT/RIGHT` の画像 Empty（HTML の `refCalib` と同じ位置と大きさ、不透明度 0.45、レンダーには出ない）。
  パース用のシートは検証カメラの背景画像（初期状態は非表示）。
- **スタジオ**: ランタイムの `setupStudio()` と `makeStudioEnv()` を再現。サン 4 灯（同じ向き・色・強さ、影はキーライトだけ）、
  PMREM の部屋の 4 枚の発光パネル（×1000 に拡大して視差をなくした、カメラと Viewport には出ない）、HemisphereLight は空と地面のグラデーションのワールド。
- **書き出し経路の修正**: 書き出しは表示状態に左右されない（アイソレート、非表示スロット、Clay/Flat などの表示モード、ワイヤーフレームを試験して 229 / 366,476 / 129 が同じ）。
  武器モードのルート `INKWAVE_WEAPON` も Blender スクリプトは受け付ける。

## 4. 材料の変換

glTF に書ける値（色、ラフネス、メタル、クリアコート、シーン、スペキュラ、IOR、発光、アルファ）は **ランタイムの値のまま**。
QA は 129 材料をすべて値で比べて、記録していない差は 0。Blender だけが持つ追加は、エクスポーターが読まない 2 本目の出力（`INKWAVE_CYCLES_OUTPUT`、target = Cycles）に入れた。

| ランタイムの項目 | Blender（Cycles） | GLB |
|---|---|---|
| ヘア `inkwave-hair-v2`: グラデーション、筋、吸盤の点 | 焼き込んだ baseColor マップ（毛束ごと） | 同じ |
| ヘアの発光: 透過の下限 0.04、ライムの先端の光、インクの光 | 焼き込んだ emissive マップ | 同じ |
| ヘアの発光: フレネル項 `albedo × trans × 0.16 × (1-|N·V|)²` | Layer Weight (Facing)² × 色 の Emission を加算 | 入らない（視点に依存するので glTF で表せない） |
| 肌 `inkwave-skin-v1`: 影の境目を暖かくする | 薄い Subsurface（0.07、半径 1 / 0.42 / 0.25、スケール 1 cm） | 入らない（glTF に SSS がない）。PBR の値はそのまま |
| 角膜: AdditiveBlending の黒いクリアコート面 | Transparent + 光沢面の加算（ランタイムと同じ） | BLEND、アルファ 0.01、クリアコートあり。スペキュラを残すエンジン（Filament、Unity HDRP、Unreal）ではハイライトが出る。three.js では虹彩がそのまま見える。以前の「不透明な黒いふた」は解消 |
| 服と脚の bumpMap（`EXT_materials_bump`、8 材料） | タンジェント空間の法線マップ（Normal Map ノード）。元の高さ画像も `INKWAVE_BUMP_HEIGHT` として材料に残す | `normalTexture`（glTF コア） |

移行後の小修正: `textures/legwear_teal_refined.png` を `scripts/inkwave_legwear_refine.py` で
`legwear_texture` にパックした。正面の脚のティール色の帯を参照どおり足首近くまで伸ばした。
この工程で変わるのは該当画像だけで、229 メッシュの頂点・法線・UV・面の index は全て同一だった。
較正した正面の脚領域におけるティール色の画素数は、参照 441、移行時 0、修正後 486（同じ HSV 閾値）。

法線マップの強さ: Three r159 のバンプは **画面の 1 ピクセルあたりの高さの差** で計算する（`perturbNormalArb` が位置の微分を正規化する）。
そのためランタイムの見た目は画面の解像度で変わる。変換は全身を映すモデラーの構図（約 500 px/m、検証カメラは 420〜500 px/m）に合わせた:
高さ = `bumpScale / 500` m、1 ピクセルが覆うテクセル数でボックスフィルタをかけてから微分。結果は `migration_counts.json` の `bump_to_normal_maps`。

エクスポーターの癖: クリアコートのラフネスが Blender の初期値 0.03 と同じだと書き出されず、glTF の既定値 0 になる。
角膜（0.03）はこの値だけ 0.03002 にして正しく書き出している。

## 5. QA の結果（2026-09-27、Blender 5.2.2 LTS）

### 5.1 移行時点のジオメトリと材料（`scripts/inkwave_roundtrip_qa.mjs`）

移行直後の source / master / game / 再オープン後の再書き出し の 4 つとも **ROUNDTRIP PASS**。
以下の「完全一致」は**移行時点**の記録であり、現在の編集済みマスターには当てはまらない。
現在の顔の検査では `--edited '^HEAD_(face|skin(_0[2-9])?)$' --edit-budget-mm 5` を使い、顔以外の形状・UV・階層の保存と、顔の意図的な変位量を別々に検証する。

| 項目 | 結果 |
|---|---|
| メッシュ / 三角形 / 材料 | 229 / 366,476 / 129（4 ファイルとも） |
| ワールド境界のずれ | 0（全メッシュ、許容 2e-5 m） |
| 三角形単位の比較（重心 + 面法線） | 違う三角形 0 |
| 頂点数 | +1,846（43 メッシュ）。Blender が UV・法線の継ぎ目で頂点を分け直すため。面は同じ |
| 材料の値 | 129 材料で記録にない差 0。記録した変換 17 件（バンプ → 法線マップ 16 項目、角膜のアルファ 1） |
| テクスチャ | 画像 107 枚（source 107）。baseColor 57/57 |
| extras | ノード 230/230、ルートのプロファイルあり |
| ヘルパー | カメラ、ライト、参照、グリッドは GLB に入らない |
| シェーディング法線（位置ごと） | 15° を超えるもの 3 / 203,670 |
| シェーディング法線（位置 + UV ごと） | 15° を超えるもの 620 / 203,638（0.30%）。**すべて 6 つの極点**（リングが 1 点に縮む所）: `HEAD_face_02`、`HEAD_face_03` に各 264、`BODY_hand_L/R` に各 46。ランタイムの法線は Blender の値から耳の極点で約 86°、指先で約 25° ずれている。Blender のカスタム法線はこの極点の値を保てない。影響はその点に集まる三角形の扇だけ |

再オープンの検査（`scripts/inkwave_blender_reopen_check.py`、別プロセス）: .blend を開き、229 メッシュ / 366,476 三角形 / 129 材料、
参照 Empty 4 つ（パック済み）、パックされていない画像 0、1 フレームのレンダー成功、GLB の再書き出しも上の QA に合格。

### 5.2 移行時点の 5 方向の比較（`scripts/inkwave_view_compare.py`）

Blender はシーンリニアの EXR を出し、両方に Three r159 と同じ ACES Filmic（露出 0.92）と sRGB を適用して、同じ背景色で比べた。
dRGB はシルエットの内側での平均の差（0〜255）、明るさの比は Blender / Three.js。

| 方向 | サイズ | シルエット IoU | 全身 dRGB | 全身の明るさの比 | 頭 dRGB | 頭の明るさの比 |
|---|---|---|---|---|---|---|
| 正面 | 561×701 | 0.9800 | 21.8 | 1.10 | 38.7 | 1.23 |
| 右 | 561×701 | 0.9804 | 19.8 | 1.05 | 32.1 | 1.05 |
| 背面 | 561×701 | 0.9798 | 15.2 | 1.03 | 27.4 | 1.03 |
| 左 | 561×701 | 0.9817 | 23.8 | 1.10 | 36.2 | 1.19 |
| パース | 700×875 | 0.9834 | 22.1 | 1.10 | 38.7 | 1.23 |

- シルエットの不一致は 100% が輪郭から 2 px 以内（ラスタライズの差）。形の一致は 5.1 の三角形比較で証明している。
- 肌、白いジャケット、黒い服、靴は近い（パースの平均 sRGB の例: 腕の肌 Three (122,105,96) / Blender (117,104,95)、白いジャケット (216,217,209) / (218,218,211)）。
- **一番大きい差はポニーテール**。ランタイムではキーライトのシャドウマップが両方のポニーテールを影にする。
  同じページでキーライトの影だけを切ると、ランタイムのポニーテールは Blender とほぼ同じになる（ライム部の平均 sRGB: ランタイム (130,164,87)、影なしのランタイム (192,212,140)、Blender (204,221,160)）。
  Cycles のキーライトだけのレンダーでは、ポニーテールを遮る物はない。書き出した GLB を Three.js に表示しても同じ影が出るので、
  原因は書き出しデータではなく、ランタイムのシャドウパスにある（未解決。`../docs/blender-migration/hair_key_shadow_evidence.jpg`）。
- ほかの差: Cycles は間接光と環境光の遮蔽を計算するが、ランタイムの IBL には遮蔽がない。脚のリブの凹凸は Blender の方が少し強い（固定の 500 px/m で変換したため）。

## 6. 制限（避けられないもの）

1. 視点に依存するヘアのフレネル項と、肌の SSS 近似は、GLB に入らない（Blender 専用）。
2. glTF に加算合成がないので、角膜は GLB では BLEND アルファ 0.01。ハイライトの見え方はエンジンによる。
3. ランタイムのバンプは画面解像度に依存する。法線マップは 1 つの構図（500 px/m）に合わせた近似。
4. 6 つの極点の法線（5.1）。
5. ランタイムの `envMapIntensity`（ヘアと肌 0.75）は材料ごとに Cycles に入れられない。

## 7. 次に編集する場所

| したいこと | 場所 |
|---|---|
| 形を直す | Blender の `INKWAVE_MASTER` の各コレクション。ランタイムに戻す場合は HTML の生成コード（`buildBody`、`makeHeadLoft`、`buildHair` など）を直して、2 章の手順で作り直す |
| 材料を直す | Principled BSDF（GLB に入る値）。Blender だけの見た目は `INKWAVE_CYCLES_OUTPUT` 側 |
| ヘアの色 | HTML の `profile.materials`（`hairTipColor` など）を変えて書き出し直す。焼き込みマップは書き出しのたびに作り直される |
| 顔 | `HEAD_face` を Edit / Sculpt Mode で編集する。`../docs/face-refinement/README.md` に較正レンダーと輪郭の測定、再現スクリプトがある。見た目の仕上げ（まぶた、鼻、口、チーク、目、肌）は `scripts/inkwave_face_look.py`（同 README の 7 章）。`inkwave_face_refine.py` を再実行する前に `inkwave_face_look.py -- --restore` |
| ゲーム用の最適化 | まだしていない（LOD、テクスチャの圧縮、Draco/Meshopt、リグ）。`INKWAVE_GAME.glb` は現在マスターと同じ |
