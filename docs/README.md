# ドキュメント案内

リポジトリの入口は [ルート README](../README.md) です。このページでは、手順書と変更ごとの調査資料を案内します。

## 開発・運用

- [INKWAVE 開発ガイド](inkwave-development.md): 入力と出力、依存ツール、ビルド、テスト、ブラウザ確認。
- [パッチ構成](../patches/README.md): 変更の置き場所と各領域の資料。
- [コントリビューション手順](../CONTRIBUTING.md): 並行ブランチ、検証、PR に残す情報。
- [PR Worker](pr-worker.md): 他リポジトリでの調査・修正・テストと push の条件。
- [Hex worker lanes](../lanes/README.md): exact SHA、タイムアウト、計測成果物の契約。

## INKWAVE の比較・調査資料

[`reports/`](../reports/) は個別変更の根拠と検証記録です。日付・issue 番号・対象 SHA を確認し、古い結果を現在の `main` の保証として扱わないでください。

| 分野 | 入口 |
| --- | --- |
| 挙動比較の記録ルール | [AGENTS.md](../AGENTS.md) |
| 本家との挙動差分 | [挙動比較記録](../reports/inkwave-splatoon3-behavior-2026-10-02.md) |
| 数値の参照元と確認状態 | [参照資料](../patches/splatoon3/reference/README.md) |
| 移動物理 | [移動物理パッチ](../patches/movement-physics/README.md) |
| 練習場 | [練習場パッチ](../patches/practice-range/README.md) |
| 原典ステージと外部アセット | [ステージ統合手順](../patches/native-stages/README.md) |
| 起動・キャッシュ | [loading-cache レポート](../reports/loading-cache/README.md) |
| 音声再構築 | [音声 v11 手順](audio-rebuild/README-v11.ja.md) |
| キャラクター制作 | [Blender 手順](../tools/inkwave-modeler/blender/README.md)、[アセット QA](../tools/character-asset-qa/README.md) |
| 作業ごとの未完了範囲 | [remaining](../remaining/README.md) |

追加資料はファイル名・本文から探せます。以下はリポジトリのルートで実行します。

```sh
rg --files reports docs patches tools -g '*.md'
rg -n 'ジャンプ|jump' reports patches --glob '*.md'
```

新しい記録には、対象コミット、再現操作、変更箇所、実行した検証と結果、未確認事項を残します。既存の資料を移動・削除するときは、他の資料やスクリプトからの参照を先に確認してください。
