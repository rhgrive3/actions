# ウルトラチャクチなどの飛沫処理の軽量化

基準: main `7f863ea2d65671abd1453fdae1b61de00f1d10e2`。検証はすべて作業環境内で実行した。GitHub Actions の手動実行・再実行はしていない。提出コミットの `[skip ci]` は今回のローカル検証のためであり、workflow や既存の検査を削除する変更はない。

## 変更

`patches/splatoon3/runtime/special-vfx-kit.mjs` の共通粒子プールを変更した。ウルトラチャクチだけでなく、このプールを使う他のスペシャルにも適用される。

- **CPU**: 同じ抵抗値の粒子が連続する間は、同じ更新内の `exp(-drag * dt)` を再利用する。次の更新へキャッシュを持ち越さず、異なる時間刻み・NaN・無限大・符号付きゼロを従来どおり処理する。同一抵抗の生存64粒子では指数関数の呼出しが64回から1回になる。粒子の Float32 状態、アップロード属性、寿命、入替・溢れ時の除去順、乱数列は維持する。
- **描画**: 煙・粉塵・霧の確実に透明なビルボード領域を、ノイズ計算より先に除外する。4オクターブの重みは合計0.9375なので、煙の輪郭は `1 - age * .25` の上限へ達しない。霧の非負ノイズは輪郭を縮める方向にだけ働く。インク塊の既存のアルファ閾値も、粒子ごとに一定の値として先に判定する。形・色・粒子数・寿命・閾値を変更しない。

本体と2つの拳の衝突・ダメージ・塗り・ゲージ・通信・時刻・モーションは変更しない。並行PR #1870 も同じファイルを変更するが、確認時の差分は属性配列・ShapePool の別処理であり、本変更を取り込んでいない。

## ローカル計測

Chromium 151.0.7922.34 / ANGLE SwiftShader、Xeon Platinum 8573C、Node 24.19.0。本番最適化ビルド同士を使用し、全artifactハッシュとinput manifestを検証した。変更されたビルド入力は上記runtimeファイル1つだけ。

| 対象 | 基準の中央値 | 変更後の中央値 | 解釈 |
| --- | ---: | ---: | --- |
| 同一抵抗520粒子、1000回の更新 | 54.5 ms | 47.5 ms | 約12.8%短縮。9回交互計測の局所CPUベンチマーク |
| チャクチの10時点を合計したGPUクエリ時間 | 1543.51 ms | 1525.48 ms | 差は約1.2%。ばらつきがあり、安定したGPU性能向上とは判定しない |

CPUの条件は200回のウォームアップ、各更新 `dt=1e-6`、描画を含まない固定520粒子の合成負荷。ゲーム全体のフレーム時間ではない。GPUは960×720、画質係数1、同じrendererで前後の順序を交互にし、非disjointの `TIME_ELAPSED` クエリを使用した。`gl.finish()` だけの壁時計計測はGPU完了を表さなかったため採用していない。

**実端末のFPS改善率は未測定。** GPU向けの別案（ドーム等のdiscard前倒し）は安定した利得がなく不採用。今回、見た目を削るLODや爆発・塗りの間引きは加えていない。

## 検証

- **関連8ファイル、43件PASS、失敗・skipなし**。チャクチの実Actor/Physics/Projectiles、拳の独立した着地、死亡・取消・remote、他のスペシャル、pool上限・除去順、粒子recipeと乱数、ゼロ抵抗、今回の抵抗キャッシュを検証。
- **生成物＋直接ソース所有の22件PASS、失敗・skipなし**。`INKWAVE_BUILT_SITE=_site-after` を指定した実際の本番生成物を使用。
- **実ブラウザ9ケースPASS**。30/60/120Hz × FXなし・無効・有効で実Actor/Physics/Projectiles/Characterを使用。source motionは全ケースready、拳の仮ボックス露出なし、武器の非表示・復帰、法線overrideと資源解放を確認。page/console errorsなし。床の塗りはこの既存ブラウザfixtureではsinkであり、実ステージの塗り性能測定ではない。
- **前後22画像比較PASS**。実際のチャクチimpact recipeの10時点に加え、煙・霧・塊・粉塵の12条件。全RGBAチャンネル一致。粒子状態も一致し、非表示の負の対照では174326チャンネルが変化した。
- strict quick patch check、通常ビルド、startup budget、`git diff --check` PASS。

VMの既存スペシャルテストはoptional source-motion dynamic-importの警告を出すため、その経路の実ブラウザ確認とは区別する。上記ブラウザ9ケースでは実際のsource motionがreadyだった。全リポジトリのテスト、Safari/iPad、実GPU・本家Switch、2端末オンラインの受入を行ったという意味ではない。

## 再実行と証跡

変更前を別ディレクトリで通常ビルドし、候補を `_site-after` へ通常ビルドしてから実行する。両方の入力差が対象runtime1ファイルであることもスクリプトが検査する。

```sh
node scripts/benchmark-inkwave-splashdown-vfx.mjs \
  --before _site-before --after _site-after \
  --evidence-dir .browser-evidence/splashdown-vfx
node --test patches/splatoon3/tests/special-sprite-drag-cache.test.mjs \
  patches/local-quality/tests/special-vfx-zero-drag-parity.test.mjs
node scripts/check-inkwave-splashdown-browser.mjs \
  --site _site-after --evidence-dir .browser-evidence/splashdown-lifecycle
```

Playwright/Chromiumが必要。比較スクリプトは `CHROMIUM_PATH` で既存Chromiumも指定できる。GPU elapsed queryが利用できなければ失敗し、CPU提出時間で代用しない。

- [前後のクエリ・CPU生データ、全画素比較、build identity](splashdown-performance-20261025/paired.json)
- [実ブラウザの9ケース](splashdown-performance-20261025/lifecycle.json)
- [コマンド・検証集計](splashdown-performance-20261025/validation.json)

## 本家との比較

参照版は既存のSplatoon 3 Ver.11.3.0、通常地上発動のウルトラチャクチ。根拠・未確認範囲は既存の `triple-slam-fists.mjs`、`reference/special-vfx.md` と共通比較記録を継承する。本作業で本家映像を新規計測してはいない。

再現操作は「カタログでウルトラチャクチを選ぶ→ゲージを満たす→地上で発動→本体と2拳の着地を観察」。本変更は既存INKWAVEの表示・ロジック結果を保って計算を省くもので、本家との拳の経路・高度・塗り形状・VFXの一致を新たに認定しない。
