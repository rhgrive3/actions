# バトル中の不要処理の削減（2026-10-30）

## 変更

対象は INKWAVE のバトル更新。シミュレーション頻度・描画品質・ゲームの数値は変更していない。

| 箇所 | 削減した処理 | 個別の確認 |
| --- | --- | --- |
| 未充填botの特殊技判定 | 毎tickのvalidationとmemory更新を残し、未使用のcontext・normalIntent・helper closure・LOSを生成しない | 420呼出でcontext/normalIntent/LOS各420→0、closure 1,680→0。公開constructor/default driverは完全contextを維持 |
| 塗りポイント・インク切れのHUD | 対象のCSSAnimationだけ再利用し、class削除と強制幅読取によるレイアウトを避ける | 500組イベントの人工burstで幅読取1,000→0、LayoutCount 1,001→1。中央値1,041.0→43.9ms |
| native右武器目標 | sourceが右腕を所有しdualでもない時、読まれないアンカーと反動targetを計算しない | 5本のspringと左右腕/武器更新順を維持。8体の実Character単体9組で比率中央値2.51%短縮 |

個別の比較基準は `84453765039f040cb937f6beb7fdb58d54f169dd`。詳細・再現コマンドは
[bot context](../performance-20261030/bot-special-context/README.md)、
[HUD](../inkwave-battle-hud-restart-20261030.md)、
[武器目標](../performance-20261030/battle-pose/README.md) を参照。
個別時間は人工burst/単体処理の値であり、バトル全体のFPSへ換算しない。

HUDの停止中、cache無効化、対象CSSが他の規則に置き換わった場合は元の再始動を使う。
running/finishedでのseekはDOM animationイベント数まで元と同じではないが、対象のcleanup、
LayoutSampleの観測、通常/reduced-motionでの表示・停止・再開・同一taskでのswim/CSS切替を検査した。
`play()`を使う負例はCSS pauseを壊し、通常/reduced各7項目で失敗することも確認した。

## 最新mainとの統合

作業中に前回のPR #1945と別のnative/武器修正がmainへ入ったため、統合基準を
`5d4c27df4d4acb49676c08ca72cfa4486a3c64c2` に更新した。
同じ接地ray共通計算がmainに既にあることを確認し、今回の候補から外した。
`triangle-world.mjs` は今回の差分に含めていない。

初期候補コミットは `c4f6d8f5aa8e4a3a59543e01d9761b087725470d`。
その後、未充填context自体も作らない最終コードを
`f6ba8324987dfa91cce215c06e762233fc276f20` に保存した。
前者と後者を同じ版として集計しない。

## 8人の実対戦CPU測定

既存の `scripts/benchmark-inkwave-composed-cpu.mjs` と比較器を変更せずに使用した。
Tidewaterのlegacy地形、LOW、960×640、60Hz、900tick、local shooter＋7bot。
全8体のsource motionがreadyになった後にwarmupと1回の実scene描画・GPU待機を済ませた。
測定区間ではscene描画を止めるが、実Actor/AI/物理/武器/塗り/HUD/音声とpaint atlasは実行する。
前進・旋回・射撃・周期jumpとtickごとのseedは共通。Profiler/追加wrapperは無効。
Chromium 154.0.8037.57 / SwiftShader、Node v24.19.0、CPU quota 4 core。

| 順番/版 | 平均ms/tick | p50 | p95 | p99 | renderer thread ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| A1 基準 | 8.975 | 7.3 | 19.6 | 37.1 | 6,675.7 |
| B1 初期候補 | 9.206 | 8.0 | 17.5 | 26.3 | 7,397.4 |
| A2 基準再測定 | 8.642 | 7.2 | 18.1 | 30.2 | 6,468.3 |
| B2 初期候補再測定 | 8.739 | 7.3 | 17.6 | 31.5 | 6,642.3 |
| B3 最終null候補 | 9.009 | 7.8 | 19.3 | 32.6 | 7,151.7 |

**この全体測定では平均処理時間の短縮を確認できなかった。** 最終候補の平均は両基準より遅い。
個別処理の削減を、全体速度の非回帰やFPS向上の証明として扱わない。
全測定を残し、遅い値を除外していない。プロファイルや人工burstの値をこの表へ混ぜていない。

一方、各候補は基準と全900tickのgameplay digest、最終塗りgrid/所有順序、
actor/living最小数、roster/settings、draw、resource差分、live scene、BVH countersが一致した。
最終候補の比較器出力は [final-parity.json](final-parity.json)。
[measurements.json](measurements.json) に全条件・統計・SHAを保存し、各runの全JSONは
同じディレクトリの `.json.gz` に可逆圧縮して保存した。

再現例（それぞれ対応するソースのビルドを指定）:

```sh
CHROMIUM_PATH=/usr/bin/chromium node scripts/benchmark-inkwave-composed-cpu.mjs \
  --site _site --source-sha FULL_COMMIT_SHA --frames 900 --hz 60 \
  --quality low --weapon shooter --stages tidewater --no-wrappers \
  --evidence-dir .bp/run
node scripts/compare-inkwave-composed-cpu.mjs A1.json A2.json B3.json comparison.json
```

## 回帰と調査範囲

- 最新mainへの統合後、重点25テスト成功。最終null差分も14テスト成功。
- bot関連の比較、HUD実CSSとnegative、実Character 1,593frame/skin75checkpointを実施。
- 通常ビルド、入力lock、起動サイズ予算に合格。変更したHUDのlockはレビュー済み1項目だけ更新。
- source-poseのcompose cacheは実Characterで約11%遅く、slerp展開も約0.9%遅いため採用しなかった。
  [cache](rejected-local-cache-bench.json) / [slerp](rejected-mix-inline-bench.json) に全値を残した。
- 初期HIGHのCPU profileは負のtimeDeltaを22件含み、既存時間分析器が拒否した。
  候補選定ではGame._frame配下の単純sample数だけを使い、CPU時間比率や速度改善として扱わなかった。
- 最終コード `f6ba8324987dfa91cce215c06e762233fc276f20` のChromium検証は
  `--exact-source` で成功。800応答、page error 0。65種のブキ選択、移動・塗り・入力・HUD・
  リザルトを確認した。生成物の内容ハッシュは
  `c3785dd15be649ce72195cb0bcec2ea274ce37af641d012a049aa254c64f382f`。
  source bindingと検証要約は [verification.json](verification.json) に保存した。

本家の参照データ11.3.0、移動・射撃・塗りの数値、既存の未確認項目は維持している。
今回新たにSwitch実機との一致を確認したものではない。上記のTidewater測定もnative三角形地形、
実端末GPU、表示FPS、オンライン回線を検証したものではない。
