# 原典メッシュ統合・ステージ選択

開始 main: `b078c37907351f1bbc13d0e7d4b5cbeb0a330009`。作業ブランチ: `codex/stage5-native-integration`。
作業中の main 更新 `bca45e7cb55f3331a58459ea0219e42b44762712` は作業ブランチ側へ取り込み済み。カメラ補正は composition の最終処理として維持する。

ユーザー添付 R6 の OBJ パーサーと三角形 BVH を移植し、既存ビルドアダプター、本体キャラクター・武器・PaintSystem の authority に接続する。独立デモは配信しない。

KiTrix の指定 commit は `0611f51b35c9736ee986fb2218461e2585b7875e`。第三者の表示用抽出データであり、11.3.0 のネイティブ衝突、塗りマスク、スポーン、5ルール配置との一致は未確認。KiTrix リポジトリの MIT 表記だけでは Nintendo 由来アセットの再配布権限を確認できない。OBJ・MTL・PNG と変換後モデルは `.codex-stage-sources/` にのみ置き、公開ビルドと Git から除外する。

## 再開

```sh
python3 -m pip install -r patches/native-stages/tools/requirements-build.txt
bash patches/native-stages/tools/fetch-assets.sh "$PWD"
python3 patches/native-stages/tools/build-native.py --source .codex-stage-sources/KiTrix/stages --out .codex-stage-sources/generated
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node scripts/build-inkwave.mjs inkwave-public _site-native
```

通常のビルドは原典アセットを同梱せず、ステージ選択で5ステージを表示する。選択後、利用者のブラウザが固定KiTrixの公開LFS media/MTL/PNGを直接取得する。OBJのSHA-256とMTL/PNGの固定Git blob SHA-1を検証し、Web Worker内で描画・衝突・チャート・マスクを変換する。元データや変換モデルをGitやPagesへ公開しない。ブラウザ内のCacheStorage/IndexedDBは各2ステージの私的なキャッシュで、保存が拒否された場合は通常取得に戻る。

初回はステージごとのモデル（約40～70MB）と画像の取得が必要で、KiTrix/GitHubへの接続とGitHub APIの利用制限の影響を受ける。取得できない場合はステージ選択へ戻り、前の地形を保持する。画像未取得の初回オフライン起動は保証しない。2026-10-12の追加指示で、ステージ選択を有効にしたPR #1285のmainマージが許可された。完全再現の完成判定は別に継続する。

検証内容と残件は `reports/inkwave-native-stage5-2026-10-12.md` に記録する。

表示メッシュの法線マップは RGB / UNORM RG / signed-byte RG を PNG の統計から判別する。BFRES の元シェーダーとの一致は未確認。コピー元 MTL/PNG は固定 Git tree と照合できる:

```sh
python3 patches/native-stages/tools/verify-source.py --source .codex-stage-sources/KiTrix/stages --assets .codex-stage-sources/generated --report .browser-evidence/native-stage5/source-comparison.json
```

## 機能検証

```sh
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node --experimental-vm-modules --test patches/native-stages/tests/*.test.mjs
node scripts/check-inkwave-native-stages.mjs _site-native .browser-evidence/native-stage5
node scripts/check-inkwave-native-online.mjs _site-native .browser-evidence/native-online
node scripts/check-inkwave-native-lifecycle.mjs _site-native .browser-evidence/native-lifecycle
node scripts/build-inkwave.mjs inkwave-public _site-public
node scripts/check-inkwave-native-source-browser.mjs _site-public .browser-evidence/native-source-public
```

Node >=22、`esbuild@0.28.2`、`playwright@1.62.1`、`ws@8`、Chromium が必要。ブラウザ検証は `/usr/bin/chromium`（`CHROMIUM_PATH` で変更可）と SwiftShader を使う。画像・モデルを含む成果物は ignored ローカル領域に置く。数値検証の要約だけを reports に保存する。

本体の品質変更は CPU 塗り・物理・ナビを保持する。塗り atlas の再配置は元の三角形に paint UV を再生成し、テクスチャ表現だけを変更する。オンラインではモデル/チャートと native runtime の fingerprint を検査する。元のガチ4ルール placement/geometry は未復元で、到達可能な Pnt 地形上のローカル調整値を使う。
