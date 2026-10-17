# Banc 配置の私的な診断取り込み

これは原典の配置ファイルを入手した後の検証用ツールです。Banc の実配置データや原典メッシュは同梱しません。マヒマヒの利用可能化、水位低下、可動床の動作、ガチルールの配置、専用衝突・塗りマスクの復元は未完です。

比較基準は Splatoon 3 11.3.0。ただし `--reference-version` は利用者の申告であり、入力の版を認証しません。出力は常に `versionVerified: false` / `diagnosticOnly: true`。公開ビルドと通常のステージローダーは、この診断出力をプレイ用データとして拒否します。

## 入力と正規化

ローカルでデコード済みの Banc JSON を用意してください。BYML/ZS のデコードやゲームデータの取得機能はありません。原本・変換物は ignored な `.codex-stage-sources/` 以下に置き、Git に追加しないでください。

```sh
python3 patches/native-stages/tools/import-banc-placement.py \
  --input .codex-stage-sources/private/banc.json \
  --out .codex-stage-sources/private/placement.json \
  --stage mahi --reference-version 11.3.0
```

ルートの `Actors` と `Rails` は空配列でも明記が必要です。Actor は `Hash`、`Gyaml`、`Layer` と、明示的な XYZ の `Translate` / `Rotate` / `Scale` が必要です。省略を原点・単位拡大率で補いません。回転はラジアンのまま保持します。Rail は `Hash`、`Layer`、`IsClosed`、`Points`、各点の `Hash` / `Translate` が必要です。

Hash は uint64 の数値または10進文字列を受け、JavaScript の安全整数範囲を超える値も Python で先に文字列へ変換します。パラメータ群・Rail 制御点・AI 群も保持しますが実行しません。重複キー・Hash、非有限値、特異拡大率は拒否します。未解決 `ToRailPoint` は記録し、後段の配置変換を拒否します。複数 Banc を推測で合成する機能はありません。

## メッシュとの明示的な対応

配置 JSON と別に bindings JSON を作成します。下は**合成例**であり、本家の座標規約や配置値ではありません。

```json
{
  "schema": 1,
  "stageId": "mahi",
  "sourceObjSha256": "<OBJ 原本の SHA-256: 64桁の小文字hex>",
  "placementSha256": "<正規化出力の sourceDocument.sha256>",
  "rule": "turf",
  "objectSpace": "actor-local",
  "eulerOrder": "XYZ",
  "vertexScale": 1,
  "translationScale": 1,
  "bindings": [{"object": "ExamplePrototype", "actor": "18446744073709551615"}]
}
```

元の OBJ 頂点が actor-local であることを別途検証してください。既に世界座標になったメッシュへ重ねて適用してはいけません。`vertexScale` / `translationScale` / `eulerOrder` は省略不可で、規約は自動推定しません。変換は `R * (Scale * vertex * vertexScale) + Translate * translationScale`。法線は逆転置、負の拡大率では三角形の向きも補正します。

同じプロトタイプを複数 Actor に結び付けられます。結び付けたオブジェクトは `Cmn` と選択ルールのレイヤーだけを生成します。ルール対応は turf=`Pnt`、zones=`Var`、tower=`Vlf`、rainmaker=`Vgl`、clams=`Vcl`。未知の Actor・重複対応・曖昧な OBJ 名・非対応レイヤーは拒否します。未対応オブジェクトは既存の表示用メッシュ分類のまま保持するため、この選択だけでルール別ステージ全体を復元したことにはなりません。既存の塗り・衝突除外も解除しません。

## 変換と証跡

stage JSON には `id`、`sourceSha256`、`bounds` の `minX/maxX/minZ/maxZ`、2個の XYZ `spawnPads` を明記します。範囲と仮スポーンは診断用の値で、原典のスポーンと認定しません。

```sh
node patches/native-stages/tools/build-placed-source.mjs \
  --obj .codex-stage-sources/private/source.obj \
  --mtl .codex-stage-sources/private/source.mtl \
  --stage .codex-stage-sources/private/stage.json \
  --placement .codex-stage-sources/private/placement.json \
  --bindings .codex-stage-sources/private/bindings.json \
  --out .codex-stage-sources/placed-diagnostic
```

出力先は空ディレクトリのみ。変換した表示頂点、衝突三角形、BVH、推定塗りチャートを同じ既存 converter から生成し、入力原本・MTL・正規化配置・bindings のハッシュを記録します。MTL 階層の PNG は完全性メタデータに記録するだけで、コピーしません。`DIAGNOSTIC-ONLY.txt` と manifest の制約を維持してください。これらのハッシュは入力の同一性であり、原典の真正性や版の証明ではありません。

検証は `source-placement-import.test.mjs` と `scripts/check-inkwave-source-placement-browser.mjs`。後者は production converter のソースから独立に束ねた診断 Worker を Chromium で実行します。公開ゲームに配置読み込み口を追加する検査ではありません。根拠と未完部分は [調査記録](../../../reports/native-stages/source-placement-import-20261017.md) を参照してください。
