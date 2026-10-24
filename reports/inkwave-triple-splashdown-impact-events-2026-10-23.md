# ウルトラチャクチ: native impact に表示を接続

## 範囲と参照の限界

- 基準 commit: `a4e81347906c0d60ceef76a69f476261bf8d3f86`、tree: `34236683e6776aac9d8b1d4ae0b8a1b31d3f2df2`。取得した公開比較ブランチと一致を確認した。
- 専用ローカルブランチ: `inkwave/triple-splashdown-visual-20261023`。main、比較ブランチ、親が検証中の PR 1844 の head は更新しない。
- 親の観察記録は「78枚、encoded 25 fps、開始時点から空中、録画 f36–38 に中央衝撃、f42–45 に左右の爆発」。この担当ではその参照画像を閲覧していない。ゲーム版・入力時刻・ギア・native FPS は不明。これを60 Hzの発動時刻へ換算していない。
- GameWith の HTTPS 403 を再試行・迂回していない。任天堂の映像・素材は追加していない。
- 今回は **native イベントに対応しない偽の着弾表示を修正する候補**。本家とのモーション・爆発形状・フレーム一致の確認は未完了。

## 調査した実装と変更

`catalogue.mjs` の `start` → `spawnFists`、本体 `_updateSpecial` → `burst(index=-1)`、独立した `fistsStep` → `burst(index=0/1)` を確認した。本体着地と左右の拳の着弾は既存の別イベントであり、拳は本体死亡後も残る。リモート `fistGone` は `dead=true` のみを立て、HPを0にしない。

変更前の `KIT_FX.fist.end` は、拳リストから消えたものを原則として着弾爆発に変えた。このため (1) `Projectiles.clear()` による解除、(2) ghost の表示期限切れ、(3) HP が100のままのリモート破壊通知でも地面に大爆発が出た。親の観察した中央→左右という発生順序を、これらの終了理由から保証することはできない。

ランタイム変更は `patches/splatoon3/runtime/special-vfx.mjs` の次の2関数のみ。

- `KIT_FX.fist.end`: リボン／fallbackモデルの後始末と `dead` の破砕表示を残し、リスト退出から着弾を推定しない。
- `DIRECTORS.tripleSplashdown.event`: 既存の本体 `impact` に加え、既存の `index=0/1` の着弾イベントを表示する。従来の半径・粒子設定を保つ。

攻撃値、物理、判定、塗り、通信、発動時刻、操作ロック、拳の軌道・モデル・色、髪、他スペシャル、共通材質／シェーダーは変更していない。通常の3発を維持し、非着弾の終了時だけ偽の爆発を減らす。共有ファイル全体の置換は行っていない。

## 検証

- ソース: 新しい `triple-splashdown-impact-vfx.test.mjs` と既存の presentation / network / special-vfx、計25テスト通過。
- 新テストは実 Actor / Physics / Projectiles / Character の production composition を使う。30/60/120 Hz の **固定 dt 診断**で本体→左右、各イベントと表示の時刻・位置、FX on/off で events / paint / position / HP / gauge の一致、解除→再発動、死亡後の独立拳、remote の破壊・表示期限切れ→受理された着弾を検査する。実ディスプレイの refresh rate や本家実機比較の代用にはしない。
- Negative control: ランタイムファイルを `git show a4e8134…:patches/splatoon3/runtime/special-vfx.mjs` の正確なバイト列に一時復元。新テストの cancellation / remote ケースを実行して **2件失敗、exit 1** を確認後、候補を `finally` で復元した。解除時の不要な2発、remote 破壊時の不要な1発を検出。
- minified emitted build: 新テストと既存 presentation / network、計10テスト通過。contentHash: `ed7294f6204a4ed3965bc686282f5ee116c43a4ecce3489f176f4cae21b72638`。
- `npm run check:patches` と通常 production build 通過。
- ブラウザ: Chromium 154 `/usr/bin/chromium`、WebGL2、ANGLE SwiftShader。明示的な GPU フラグを追加せず Playwright 標準の headless 起動を使用。候補の通常試合・解除検査は成功し、console/page error、VFX内部エラーとも0。配信する全 artifact の SHA256 を manifest と照合した。
- 既存の emitted ブラウザ presentation 検査も9条件（固定 dt の30/60/120 Hz × FXなし／無効／有効）で通過。実 Actor/Physics/Projectiles/Character を制御した床に置く検査表示であり、通常ステージの画面とは別。既存ハーネスの変更は installed Chromium のパス指定と明示起動フラグ除去のみ、内容とハッシュは `controlled-probe-adaptation.json` に記録した。拒否された起動の迂回ではない。

## 実画面と処理負荷

`scripts/check-inkwave-splashdown-impact-browser.mjs` は通常の production boot、tidewater、通常HUD・カメラを使う。初期スポナーから通常の射撃入力で離れて接地後、UIと同じ保存先にカタログ装備を設定し、ゲージを満たして Q 入力する。bots は固定し、既存 `debug.step` で60 Hzのsimulationを進めて選択フレームだけ描画する。実時間FPSの測定ではない。これとは別に、リセット→再発動で2拳が存在することを検査し、`Projectiles.clear()` 後の次の描画を **解除の検査表示** として撮影する。

- [通常画面 simulation f60](inkwave-triple-splashdown-impact-events-2026-10-23/candidate-normal-f060.png): 本体と2拳が空中に存在。
- [通常画面 simulation f70](inkwave-triple-splashdown-impact-events-2026-10-23/candidate-normal-f070.png): native 本体着地の表示。2拳はまだ空中。
- [通常画面 simulation f87](inkwave-triple-splashdown-impact-events-2026-10-23/candidate-normal-f087.png): native 左右の着弾表示、拳のリタイア。
- [候補の解除直前](inkwave-triple-splashdown-impact-events-2026-10-23/candidate-inspection-before-clear.png)／[解除直後](inkwave-triple-splashdown-impact-events-2026-10-23/candidate-inspection-after-clear.png): 不要な着地爆発0。
- [基準の解除直前](inkwave-triple-splashdown-impact-events-2026-10-23/baseline-inspection-before-clear.png)／[解除直後](inkwave-triple-splashdown-impact-events-2026-10-23/baseline-inspection-after-clear.png): 左右に不要な着地爆発2発。基準側も最後の単独実行では console/page error、VFX内部エラーとも0で完了した。

| 検査 | 基準 | 候補 |
| --- | --- | --- |
| 通常の本体＋左右の着弾表示 | 3発 | 3発 |
| native イベントの発動からの相対時刻・位置 | 基準のまま | 一致 |
| 生存している2拳を clear した直後の着地表示 | 不要な2発 | 0発 |

native 相対時刻・位置の一致は両ブラウザ receipt の `events` を発動時刻で正規化して照合した。壁時計の開始時刻と起動中に消費する simulation 時間は異なる。起動時の微小な位置差やカメラ／乱数の進みを含むため、ピクセル完全一致や厳密な性能A/Bテストとはしない。

f70/f87 は **候補の入力後のsimulation step番号**であり、録画f36–45から導いた値ではない。既存実装の順序を確認した結果である。

候補の `Director.update` CPU時間110サンプルは平均0.175 ms、p95 0.400 ms、max 4.200 ms。選択した通常描画のdraw callsは99–126。SwiftShaderで他のブラウザも動いていた単発の観察であり、GPU時間、ハードウェアFPS、厳密な性能比較は未測定。新しい毎フレーム処理やモデルは追加していない。通常の爆発数は3のまま。

撮影準備中に、短い初回ロード待ち、attract試合の誤検出、スポナー中の発動、解除検査での装備復元漏れがあった。これらの撮影は採用せず、現在のハーネスは非attractのlocal actor・match playing・スポナー離脱・接地・解除前の2拳を検査する。基準側の並列撮影1回は既存 shooter MP3 のロード待ちに失敗した。音声コードは変更せず、同じ撮影を単独再実行して成功した。

証拠は同名ディレクトリの `source-tests.log`、`emitted-tests.log`、`negative-control.log`、`controlled-browser.json`、`candidate-browser.json`、`baseline-browser.json`、`build-identity.json`。全15枚の通常選択フレームと解除2枚は作業ディレクトリ `.ci-scratch/triple-splashdown/candidate-final/`、基準側は `baseline-retry/` にも残している。

再現コマンド:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/triple-splashdown-impact-vfx.test.mjs patches/splatoon3/tests/triple-splashdown-presentation.test.mjs patches/splatoon3/tests/triple-splashdown-network.test.mjs patches/splatoon3/tests/special-vfx.test.mjs
node scripts/build-inkwave.mjs inkwave-public .ci-scratch/triple-splashdown/candidate-site
INKWAVE_BUILT_SITE=.ci-scratch/triple-splashdown/candidate-site node --experimental-vm-modules --test patches/splatoon3/tests/triple-splashdown-impact-vfx.test.mjs patches/splatoon3/tests/triple-splashdown-presentation.test.mjs patches/splatoon3/tests/triple-splashdown-network.test.mjs
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-splashdown-impact-browser.mjs --site .ci-scratch/triple-splashdown/candidate-site --evidence-dir .ci-scratch/triple-splashdown/candidate-browser
```

## 親に残す比較

参照録画 f0–35 の拳と本体の向き／上昇・滞空の相対運動、f36–38 の中央衝撃の輪郭・高さ・見え方、f42–45 の左右の破裂位置・膨張・残滓を、今回の候補の実画面と比較する必要がある。録画 f0 は発動ではないため、候補 simulation frame の同じ数字とは対応づけられない。参照の破壊ケース・キャンセル・オンライン遅延は与えられておらず、本家と一致したとは主張しない。
