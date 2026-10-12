# 原典メッシュ統合（ローカル検証用）

開始 main: `b078c37907351f1bbc13d0e7d4b5cbeb0a330009`。作業ブランチ: `codex/stage5-native-integration`。

ユーザー添付 R6 の OBJ パーサーと三角形 BVH を移植し、既存ビルドアダプター、本体キャラクター・武器・PaintSystem の authority に接続する。独立デモは配信しない。

KiTrix の指定 commit は `0611f51b35c9736ee986fb2218461e2585b7875e`。第三者の表示用抽出データであり、11.3.0 のネイティブ衝突、塗りマスク、スポーン、5ルール配置との一致は未確認。KiTrix リポジトリの MIT 表記だけでは Nintendo 由来アセットの再配布権限を確認できない。OBJ・MTL・PNG と変換後モデルは `.codex-stage-sources/` にのみ置き、公開ビルドと Git から除外する。

## 再開

```sh
bash patches/native-stages/tools/fetch-assets.sh "$PWD"
python3 patches/native-stages/tools/build-native.py --source .codex-stage-sources/KiTrix/stages --out .codex-stage-sources/generated
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node scripts/build-inkwave.mjs inkwave-public _site-native
```

通常のビルドは原典アセットを同梱せず既存ステージを維持する。ローカルビルドだけで5ステージを選択できる。外部データを含むビルド成果物の公開可否は未確認。main にはマージしない。

検証内容と残件は `reports/inkwave-native-stage5-2026-10-12.md` に記録する。
