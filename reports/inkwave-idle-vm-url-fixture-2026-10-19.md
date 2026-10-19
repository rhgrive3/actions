# Idle VM の URL / import.meta.url 依存を補う（2026-10-19）

## 範囲

対象は公開 INKWAVE の source-composed 検査 fixture のみ。基準は main `2584f1999a20927c48eb1dac6517b3fcca69c9b9`。本番 runtime、音声素材、権限、音量、スケジューラ、描画品質、ゲーム挙動は変更しない。PR1627 のモデル統合 head とは独立した修正である。本家との挙動同一性や実機音声再生の改善を示す変更ではない。

## 原因と修正

現在の実 `src/audio/music.js` はファイル音源を `new URL(relativePath, import.meta.url)` で解決する。idle fixture は VM の URL グローバルと SourceTextModule の import.meta.url を提供せず、音声 stub も URL を plain object へ置換していた。そのため #384 の品質無効化検査を含む module 評価が失敗していた。

- idle VM に Node の標準 URL constructor を渡し、読み込んだ実 module file の URL を initializeImportMeta で設定する。
- Blob URL の生成・解放 stub は標準 URL の subclass の static methods とする。既存 blob:fixture、worker、interval の記録規則は維持する。
- music-worker-failure の独自 URL tracker も既存 fixture URL を継承する。失敗・解放・二重配送・mute・dispose の全 assert はそのまま残す。
- 新規 3 項目は private identifier を参照しない。最初の 2 項目は built:null を明示し、通常 composition と baseline=true の現 source が標準 URL を使えること、観測用 URL subclass により実 MP3 解決が一度だけ行われることを検査する。最後の 1 項目は source または指定 emitted graph の module metadata と公開 MusicEngine、標準 URL constructor / Blob stub の両立を検査し、worker/interval が module 評価だけで起動しないことも確認する。

## Source 検証

公式 main の実読 blob を強制照合する read-only loader で、fixture を利用する既存 10 test files 全体を実行した。追加の 3 項目を合わせて **68/68、skip 0**（5.89 秒）。387 実読入力は公式 main か明示した 3 test-only 差分に一致し、不一致は 0。

同じ main-only 対照は既存 65 項目中 23 成功 / 42 失敗。失敗は URL 未定義 10 件と URL 非 constructor 32 件で、runtime を変更せず再現した。最初の広範囲試験では local cache に未取得の既存 font / SVG があり、qualityIdentity の読み込み 1 件が ENOENT だった。公式 blob と一致する既存 cache を読取再利用して補完し、元ログを保持した。欠落素材を assertion 変更で回避していない。

依存を一つずつ外す負対照も確認した。

1. VM URL を除去すると実 music import が URL is not defined で失敗。
2. initializeImportMeta を除去すると実 file URL が Invalid URL で失敗。
3. 共通音声 URL stub を元の object に戻すと URL is not a constructor で失敗。
4. worker-failure 専用 tracker だけを元に戻すと既存 4 項目がすべて同じ constructor エラーで失敗。

既存の unpatched-public、adapter drift、mute、scheduler、cloud/reflection resource、paused simulation、30/60/90/120 Hz 等の条件は変更していない。通常 workflow の local-quality 全 test glob が新規 test も収集するため、workflow の変更は不要。

## 受入の限界

取得済みの公式 main00b8994 Pages artifact12183076203（ZIP SHA256 965dc2077b211da29b8785bc4092314fb668a1d5d5f86235f661075611dcadb3）の実 minified graph でも実行し、source 2 項目＋emitted 1 項目が成功した。manifest SHA256 788fc8b4a8f0f5c5374a0dab798156e38f33c5c5f2d9eac246fcac6d5fef1ac7、保存済み 501 files を実行前後で再照合し、実読 33 emitted modules も全 SHA256 一致。import.meta.url を直接読む検査用 export だけを追記し、minifier が変更する private 名への依存はない。

この公式 artifact は b75 の新 file-track 導入前であり、新 track の exact-emitted 機能受入の代用ではない。source 2 項目の MP3 実解決は現 main2584 を使用する。新しい exact-head CI、b75/2584 の emitted file-track、ブラウザ・実機は未確認。別の runtime 不具合や #384 の本家校正をこの test-only 変更で解消扱いにはしない。
