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

原典 Banc のデコード済み JSON を私的に検証する場合は [配置取り込み手順](tools/README-placement.md) を参照。配置後の表示・衝突・推定塗り面へ同じ変換を適用する診断用ツールであり、原典の実配置・可動条件の入手やステージの利用可能化は行わない。

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

インク重ね描画は、視錐台内の描画領域のうち `_pushQuad` が一度でも書き込んだチャートの三角形だけを元の順で描く。判定と失敗時の扱いは [チャート選択の記録](../../reports/inkwave-native-ink-charts-2026-10-19.md) を参照。

CPU の塗りは、xz ハッシュの候補を各呼び出し元の最初の y 判定で先に除き（`NativeLevel.queryBlocksBand`）、成長を終えたボム等の放射・粒の所有権判定は、入力が完全一致する間だけ形状の外れセルを再判定しない。成長途中は、キーごとに最初の面ではマスクを複製しない。ピースの角度・ハッシュはレコードごとに 1 回だけ求め、確実に届かない点のセル判定は先に外れとする。表示のチャンク印付けは、面の箱に重なるチャンクだけを調べる。結果の同一性と計測は [#1671 の記録](../../reports/inkwave-native-cpu-1671-2026-10-20.md)、再現は `scripts/check-inkwave-native-sim-digest.mjs` と `scripts/measure-inkwave-native-sim.mjs`。

全ステージの自動検査は [地形整合性の記録](../../reports/inkwave-terrain-integrity-2026-10-20.md) を参照。固定OBJ/MTLから全三角形・BVH・paint chartとWebGL被覆を検査する。`GroundGrass*` は構造的地面で、古い私的変換物が装飾として除外していた場合は再変換が必要。原典の穴や境界を箱で埋める処理は行わない。

本体の品質変更は CPU 塗り・物理・ナビを保持する。塗り atlas の再配置は元の三角形に paint UV を再生成し、テクスチャ表現だけを変更する。オンラインではモデル/チャートと native runtime の fingerprint を検査する。元のガチ4ルール placement/geometry は未復元で、到達可能な Pnt 地形上のローカル調整値を使う。

## 変換済みデータ（native-prebuilt/、2026-10-24〜）

2026-10-24 の所有者判断により、原典ステージの**変換済み**データを `native-prebuilt/` に Git LFS で置き、ゲームと同じオリジンから配信する。元の OBJ/MTL/PNG は置かない。リポジトリは非公開化、公開は Cloudflare（Workers Static Assets）で行う予定。

- 中身はブラウザ内変換（`source-worker.mjs` の `convertSource` + `compactInactiveDisplay`）と同一。`tools/prebuild-native.mjs` が Node で同じ関数を実行し、配列は 16 MiB 以下に分割（Cloudflare の 1 ファイル 25 MiB 上限）、塗りチャートの面は列形式で保存する。
- 画像は `loadNativeTextures` の画素推定（不透明、法線形式、粗さ/不透明度チャンネル）をビルド時に同じ計算で適用し、(画像, 役割) ごとに KTX2 UASTC へ圧縮する（`tools/prebuild_textures.py` + basisu）。法線は実行時と同じ RG→XYZ 復元後に圧縮する。
- ランタイムは `native-prebuilt/<id>/stage.json` と各チャンクを SHA-256 で検証して読み、KTX2 は Three の KTX2Loader で端末の GPU 形式（ASTC / BC7 / ETC2）へ変換する。取得・変換に失敗した場合はステージ単位・画像単位で従来のブラウザ内変換（KiTrix）に戻る。
- ビルド（`scripts/build-inkwave.mjs`）は、現在の変換器（`scripts/lib/inkwave-native-prebuilt.mjs` の対象ファイル）と審査済みステージ定義に一致し、全ペイロードのハッシュが合うステージだけを採用し、リビジョン/PWA プリキャッシュの外（サイト直下 `native-prebuilt/`）へコピーする。LFS 未取得のチェックアウト（CI など）では自動的に従来経路になる。

再生成（変換器・ステージ定義・画像処理を変えたとき）:

```sh
git lfs pull
BASISU=/path/to/basisu node --max-old-space-size=12000 patches/native-stages/tools/prebuild-native.mjs [stage-id ...]
```

basisu は Basis Universal v1.16.4（npm `basis_universal` 同梱のバイナリで確認）。python3 に numpy と Pillow が必要。
