# テスト結果・失敗記録

## 最終の基本回帰

| 検査 | 総数 | 成功 | 失敗 | skip |
|---|---:|---:|---:|---:|
| ブキ／S3全体 | 2746 | 2740 | 0 | 6 |
| キャッシュ・通信・移動・練習場 | 286 | 281 | 0 | 5 |
| 品質・入力・信頼性 | 1562 | 1545 | 0 | 17 |
| 測定の入力基準SHA | 1 | 1 | 0 | 0 |
| ジャイロ所有者世代の追加回帰 | 2 | 2 | 0 | 0 |
| 合計 | 4597 | 4569 | 0 | 28 |

focusedテスト等の重複実行はこの合計に加えていない。これらのコマンドで失敗0という意味であり、ブラウザ／通常圧縮ビルドが成功したという意味ではない。各コマンドと全skipタイトルは `test-results.json`。

**実行順の留保:** ブキ全体と関連系の全件検査は、最後の付随ジャイロ修正前に実行した。その修正後には品質・入力・信頼性の全件、追加ジャイロ2件、生成コード132件、診断ビルド、生成後の射程・塗り・通信検査を再実行した。ブキ全体と関連系の長時間スイートを最後のジャイロ変更後にもう一度走らせたわけではない。

## 成功した統合・資料検査

- 指定ZIP由来7パラメータJSONのSHA-256と63明示項目を照合。数値ミラー1,045項目、プロファイル結線38項目を検査。
- 非圧縮診断ビルド成功。実生成コードの15条件の射程・ダメージ・塗りを測定。
- 別途、生成前の6アダプター実行経路と生成後コードのCPU塗り・命中境界を照合。36列パケット、3種の発射再生、4系統6条件の壁落ちを検査。
- 追加の精度・マニューバー・チャージャー検査、資料来歴検査、復元ヘルパーの正常／拒否動作を実行。復元ヘルパーは改変済みアセットを上書きせず、一部だけ復元することもない。

## 成功していない検査

| 検査 | 実際の結果 |
|---|---|
| 通常のesbuild圧縮ビルド | esbuild未導入でERR_MODULE_NOT_FOUND。依存取得もEAI_AGAIN。診断ビルドの成功で置換していない。 |
| localhostによる実ブラウザ | ERR_BLOCKED_BY_ADMINISTRATOR。 |
| 同一モジュールをメモリ経由で載せる実ブラウザ | WebGL2コンテキストなし。仮想GLで成功扱いにしていない。 |
| Nintendo実機・2実端末通信・射撃感・音・操作遅延 | 今回は未実施。 |

## 途中の失敗と是正

| ログ | 結果／扱い |
|---|---|
| baseline-splatoon3.tap | 変更前: 2,732成功・失敗0・6skip。 |
| final-splatoon3.tap | 最初の変更後: 2,737成功・3失敗・6skip。旧チャージ速度期待、誤ったcharge変数設定、旧二択角度期待。理由はREADMEに記載。 |
| corrected-oracles.tap / cone-final.tap | 上記の個別確認。27成功、10成功。 |
| verified-quality.tap | 最初の追加回帰: 1,542成功・2失敗・17skip。空中スライド禁止の旧期待。 |
| input-final.tap | 空中受付／着地二重発動禁止／普通の着地バッファを検査し18成功。 |
| verified-splatoon3.tap / quality-delivery.tap | 全体再実行の結果。実行順は上記の留保参照。 |
| emitted-final.tap / emitted-verified.tap | 生成コード初回は125成功・7失敗、是正途中は131成功・1失敗。旧fixture6件と実ジャイロ二重リセット1件を特定。 |
| emitted-delivery.tap | 最終生成コード132成功・失敗0・skip0。期待値を下げず、実イベント／モジュール依存とジャイロ処理を是正。 |

キャッシュの既存worker試験は `/mnt/workspace` の作業親ディレクトリを要求した。ディレクトリを作成して再実行したのであって、そのテストを削除して合格にしていない。元資料の画像2件、過去baseline専用の試験、ビルド／GCの明示環境を要求する試験は各ログのskipを保持している。

## 基本回帰でのskip一覧

### ブキ／S3全体

```text
ok 73 - \#561: installed built site presents the assist exactly like the composition # SKIP
ok 383 - \#523 emitted config preserves opt-in policy # SKIP
ok 385 - \#523 emitted Game/Match use emitted defaults for the live HUD transport # SKIP
ok 1139 - \#724 the pinned official reference image is unmodified # SKIP reference image not fetched in this environment
ok 1140 - \#724 the reference record carries the measured geometry, not the retracted absence claim # SKIP reference manifest not fetched in this environment
ok 2464 - \#158: emitted full Match module judges deterministic Alpha and preserves close non-ties # SKIP
```

### キャッシュ・通信・移動・練習場

```text
ok 1 - adapter exact baseline parses, preserves every method except three startup-owned methods # SKIP
ok 2 - removing profiler wrappers yields identical full AST except explicit dwell/cache edits # SKIP
ok 3 - adapter rejects duplicate application and unexpected source topology # SKIP
ok 4 - production profiler dispatch does not alter evaluation count or synchronous return # SKIP
ok 46 - old worker fixture really refetches/rewrites warm scripts and bypasses JSON # SKIP
```

### 品質・入力・信頼性

```text
ok 192 - FxHooks alone cannot retain Actor after missing lifecycle or a late event # SKIP
ok 306 - \#425: emitted full HUD and touch modules retain quantization and authoritative readiness # SKIP
ok 322 - \#510 emitted full Game/Match modules preserve reusable transport and live scalar updates # SKIP
ok 478 - full emitted Game frame gates native Match clock/projectiles and rebases after portrait # SKIP
ok 548 - production emitted helper follows identical native navigation and single-start guards # SKIP
ok 597 - isolated forced GC releases the old attacker after reset; baseline retains it # SKIP
ok 653 - emitted complete Match module contains the production passive path # SKIP
ok 706 - \#672 a live minimap module cannot retain a retired jump Actor during unticked menus # SKIP
ok 821 - emitted menu fixture: unfocused # SKIP
ok 822 - emitted menu fixture: focus-without-neutral # SKIP
ok 823 - emitted menu fixture: fixed # SKIP
ok 969 - 30Hz emitted page focus gates gamepad authority # SKIP
ok 970 - 60Hz emitted page focus gates gamepad authority # SKIP
ok 971 - 120Hz emitted page focus gates gamepad authority # SKIP
ok 972 - actual emitted input policy boundaries # SKIP
ok 1036 - \#523 + \#533 emitted defaults hide corner map while alive gyro projection and A confirmation work # SKIP
ok 1037 - \#523 + \#533 emitted defaults hide corner map while dead gyro projection and A confirmation work # SKIP
```

## 証跡の見方

検証ZIP内の `reports/weapon-audit-20261009/evidence/` は明示的に選んだ検査ログだけで、ブラウザプロファイル、キャッシュ、入力元の全資料アーカイブ、フォントは含まない。原典JSONはソースの `patches/splatoon3/reference/weapon-audit-1130/`。

## 最終生成コード・GCの追加結果

`bash scripts/check-weapon-audit-emitted.sh _site` 相当の14ファイル・明示site・`--expose-gc`検査を実行し、**132成功・失敗0・skip0**。基本回帰との重複を含むため4,569へ足し合わせない。基本回帰でskipされていた生成HUD、入力所有権、assist、マップ方針、GC等を実生成コードで追加検査した。参照画像不足等の未実行理由は別に残る。

最終診断ビルド: `build-last.log`。content hash `1b172cf51f4e9502da598ce4c47e08cef645548e9133c8d2a8244c663142d74a`。生成後の統合検査は `built-final.log`、測定は `measurements-delivery.json`、実ブラウザ失敗は `browser-delivery.json`。通常圧縮ビルド／GPU描画は成功扱いにしていない。

ソースZIPとpatchには結果文書と再現用コードを含め、長いログそのものは検証ZIPへ分離している。

## PR1188 最終コードでの検証（Claude, 2026-10-09, commit ed5b4fe 系列）

この環境では esbuild 0.28.2 の本番ビルドと、Chromium（SwiftShader）の実WebGL2・実WebSocketが動作した。いずれもINKWAVEの検証で、任天堂実機の比較ではない。

| 検査 | 結果 |
|---|---|
| `scripts/check-inkwave-patches.mjs`（splatoon3＋reliability 全件） | 3,602件：成功3,587・失敗0・skip15 |
| local-quality＋idle gates | 743成功・失敗0 |
| network-replication | 189成功・失敗0（途中で検出した Hit 未渡しの不具合を修正後） |
| practice-range / loading-cache / scripts tests / platform・movement・ink-flight smoke | 41 / 36 / 33 / 29 成功・失敗0、Python harness OK |
| 本番ビルド（esbuild minify）＋ `check-inkwave-startup-budget.mjs` | 合格：precache 5,209,167 B（上限5 MiB）、初期JS 3,355,384 B、コアpreload 125 |
| `check-inkwave-weapons-fidelity.mjs --site _site` | 合格（15条件・3通信モード・壁落ち6条件、source/build一致） |
| `check-inkwave-paint-mask.mjs`（実WebGL2） | 合格：付随形状108条件、本体81条件で CPUのみ0・GPUのみ0（零交差同値7セル） |
| `check-inkwave-network-browser.mjs`（2ブラウザ・実WebSocket） | 遅延0F／6F とも合格（paired 130） |
| `check-inkwave-network-comparison.mjs` | 合格（28条件） |
| `check-inkwave-pr1171.mjs` | 合格 |
| `scripts/measure-blaster-floor-paint.mjs` | `evidence/blaster-floor-paint-1188.json`（高さ・実弾・地形・起爆・30/60/120Hz一致） |

本PRの新規テスト：`blaster-floor-paint-1188`（8）、`main-knockback-1188`（6）、`splatling-charge-decel-1188`（4）。GitHub Actions の結果はPR上のチェックを参照。
