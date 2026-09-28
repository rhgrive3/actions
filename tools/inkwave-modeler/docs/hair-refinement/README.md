# Blender 髪型のリファイン（2026-09-27）

最新版: **20260927-v6-detail**。[耳の貫通・不要な毛束の修正と比較](detail-pass/README.md)。以下は第5版の作業記録。

参照: `../../blender/references/{front,back,left,persp}.jpg`。髪の第5版 `20260927-v5` を、並行作業で更新された顔を含むマスターへ統合した。

- 高いツインテールの頂部を下げ、先端の幅・長さ・内向きのカーブを調整。正面の左右は別々に輪郭を合わせた。
- 前髪の扇状の広がりを抑え、中央の垂れ・外側の跳ね・顔横のカールを調整。
- 頭皮に沿う毛束を薄くし、内側の短い毛束の幅を調整。
- 青緑を先端付近まで残すグラデーション、不規則な大小の斑点、控えめな筋を44枚のsRGBテクスチャとして焼き込み。BlenderとGLBで同じ画像を使う。画像は全てパック済み。

## 比較

- [同じ顔・カメラ・照明による修正前後、5方向](before_after_5views.jpg)
- [参照との正面比較](reference_front_comparison.jpg)
- [最終モデル、5方向](final_5views.jpg)

参照4枚ではポーズ・頭の向き・照明が異なる。側面と斜めは造形の目視確認用で、参照画像とカメラが完全一致した数値検証ではない。細い毛筋、根元の重なり、光沢には参照との差が残るため、髪全体の「完全一致」は主張しない。

## 検証

- 保存後に別のBlender 5.2.2 LTSプロセスで再オープン。229モデルメッシュ、384,912三角形、パックされていない画像0。全頂点が有限値。
- 髪以外の199オブジェクトと86材料は、統合直前の最新版から変化なし（カメラ・ライト・スタジオも含む）。
- GLBの髪以外179メッシュは、全頂点属性（位置・法線・UV等）とインデックスが統合直前のGLBと完全一致。50の髪メッシュだけを交換した。
- 41の髪メッシュを変形。髪の頂点数・面数・UV・オブジェクト階層を保持。
- 正面シートのテール外周: y=120〜190の全71行、左右142点の平均差 **3.24 → 0.85 px**。合わせ込みに使った16点を除く126点では **3.15 → 0.87 px**。最大差は **14 → 3 px**。448×560画像、既存の正面較正、固定HSV閾値による輪郭。これは長いテールの外周だけの指標で、髪全体の品質スコアではない。

検査結果: [verification.json](verification.json)、[tail-outer-contour.json](tail-outer-contour.json)。
元データ・全ログ・各反復の.blendは `/mnt/workspace/.dev-state/agent-work/{evidence,checkpoints}/inkwave-hair-20260927/` に保持。

## 顔などの並行編集との統合

`../../blender/INKWAVE_HAIR_REFINED.blend` は髪のライブラリ。顔の編集ファイル全体を古いマスターで上書きせず、最新版に髪だけを移す。既に髪を統合済みのファイルへの再適用も可能。

```bash
export TMPDIR=/mnt/workspace/.dev-state/agent-work/scratch
export TMP="$TMPDIR" TEMP="$TMPDIR"
# tools/inkwave-modeler を作業ディレクトリにする。
blender -b <最新版.blend> --python-exit-code 1 --python scripts/inkwave_hair_apply.py -- \
  --hair blender/INKWAVE_HAIR_REFINED.blend \
  --out <永続作業場所/統合.blend> --export <永続作業場所/統合.glb> \
  --report <永続作業場所/統合検査.json>
```

このスクリプトは髪以外のオブジェクト・材料・画像を前後比較し、変化があれば失敗する。共有マスターへの配置は、検証後に元ファイルが更新されていないことをSHA-256で確認してから行う。モデル用とゲーム用のGLBを同じ書き出しで更新する。

造形の再生成は `scripts/inkwave_hair_refine.py -- --out <候補.blend>`（未修正の髪を持つマスターが必要）。通常の並行統合には、再生成せず上のライブラリ適用を使う。
