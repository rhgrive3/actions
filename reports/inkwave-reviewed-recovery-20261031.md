# INKWAVE 2026-10-30 レビュー成果のPR統合記録

## 経緯と固定基準

- リポジトリ: `rhgrive3/actions`
- レビュー元のGit基準: `5d4c27df4d4acb49676c08ca72cfa4486a3c64c2`
- PRブランチを作った時点のmain: `df8a4b8f8c29bf68a3480e8be14624c82f6d5190`
- 元レビュー成果のDrive: https://drive.google.com/drive/folders/1BbhoGnJVkC97gL6IaDT7B-GxQi3MggKw
- レビュー記録: https://drive.google.com/file/d/1xVCp56RnlsRdY6jW3cdv27zlwt6Lh9Cu/view

前回の完成ソースZIPは全19パート中10パートしかDriveにないため、その最初の10パートからCRC付きで救出できたソースと固定Git基準を照合した。未保存パートの内容を推定して作らず、救出できたコードのみをPR化した。

## 差分統合の方針

救出した4,102ソースファイルとレビュー時基準のGit blob SHAを比較して、変更52ファイル、新規7ファイルを特定。変更52のうち4ファイルは現在のmainとバイト単位で同一だった。残る55の候補中、34変更+7新規の41ファイルはmainに対して競合せず採用。残る14ファイルを基準版・Drive修正版・mainの三者で比較し、12ファイルは双方の変更を統合、2ファイルはmain側が既に同等以上の修正を含んでいたため重複変更しなかった。

### 競合の重要判断

- `patches/splatoon3/runtime/all-subs.mjs`、各種adapter: main側の新しい変更と、レビューで追加された予測・入力検証を両立する非重複パッチを統合。
- `patches/splatoon3/runtime/audio/spinner-charge-clips.mjs`: 最新mainの録音キャッシュ・期限・リトライ・段階ループを維持し、非有限PCMの公開拒否だけを追加。
- `patches/local-quality/tests/native-geometry-grid-20261029.test.mjs`: mainが追加したnormal-coneの検査を保持し、レビュー版の厳密なfallback、itemSize、Uint8Array、upload-release検査を採用。
- Botテスト: `isBot` に加え、必要な`isLocal=false`、`remote=false`を共存させる。mainの既存コメントは保持。
- `added-ui-motion-source.test.mjs`: 最新main側で既に現在の合成ソースを使った堅牢なnegative controlへ更新されていたため旧版へ戻さない。
- `bot-navigation-respawn.test.mjs`: main側でレビュー版の`isBot`に加えownerフラグまで実装済みのため重複変更しない。
- `splatling-reticle.test.mjs`: モックDOMの`setAttribute`、`removeAttribute`を実際に属性状態を更新する実装へ補う。

## 修正の領域

サブ投擲予測・インクコスト表示・first-entry接触、天井接触ID・加速度、ScreenFXの解放・影初期化・viewport、GPUの微分・数値セマンティクス、プロフィールとロビーの検証、非有限の音声入力とデコードPCM、CIテスト fixture。

## 検証状況

- 救出元コードの対象55ファイルを `node --check` で確認: **55成功、構文失敗0**。
- 救出元の音声集中テスト: **30成功、失敗0、スキップ0**（finite PCM/Charger/Spinner）。
- 前回ローカルレビュー記録では品質試験2361件成功、失敗0、条件付きスキップ5件。ただしそれは本PRのHEADに対する検証ではない。
- 最終PR HEADの実行ビルド・全体CIの確認はGitHub側ワークフローの結果に従う。本記録は未確認のCIを成功と表現しない。

## 既知の重大な残課題

- `#1665` / `#1666`: オンラインのprojectile birthの自己申告を偽造した場合、実発射や実命中がないのにダメージを受理しうるP1の通信信頼境界。今回のPRで解消したと主張しない。
- 未保存の完全ソースZIP後半9パート、原作全数値との完全一致、物理端末上のFPS保証は対象外。
- PRのマージ・本番デプロイ・CIの最終結果は [PR #1980](https://github.com/rhgrive3/actions/pull/1980) とGitHub Actionsを一次記録とする。未完了のCIを成功と表現しない。

## 2026-10-31 最新main再統合

- `main` 統合基準: `4ebe41cc6b31a9e8891beeb51ae061ca62027d51`。PR #1977の29ファイル最適化を含む。
- 途中までの復旧成果は55ファイル変更として残し、GitHub PR #1980に統合。共有・競合する4ファイルは双方の意味を照合して統合した。
- `patches/splatoon3/adapter.mjs`: mainのStorm投擲起点・接地処理とレビューの天井ブロックIDを両立。
- `runtime/all-subs.mjs`: mainの全結果型サブ予測・Fizzy爆発時系列とレビューのfirst-entry接触を併存。
- `runtime/kit-subs.mjs`: mainの衝突・バウンド・着弾結果予測を維持し、既存弾道プレビュー互換処理と共存。
- `runtime/kit-support.mjs`: 最新mainの共通60Hz Sensor・Cooler飛行とプレイヤーに表示される予測を優先。旧レビューの移動積分で置き換えない。
- 音声回帰テストは本番の `adaptBuildSource` 合成経路へ修正。Sensor回帰テストは最新の共有飛行モジュールと旧記録の双方に対応。
- 旧レビュー独自のfirst-contactのみ表示するテストは、main既存の `throw-prediction-parity.test.mjs` と矛盾しない統合契約テストへ修正。
- すべてGitオブジェクトのSHAで維持し、統合ツリーを親 `main` + レビュー作業HEADの2親コミットとして保存した。
- GitHub Actions実行結果は当該HEADのチェックを参照し、成功と未実行・実行待ちを区別する。
