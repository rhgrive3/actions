# 敵 Bot AI 改修案（Drive: F_QA_BENCHMARK）のレビューと main への反映

2026-11-07。対象は Google Drive フォルダ `F_QA_BENCHMARK`（`00_SCOPE.md`、`01_RESEARCH/BASELINE_AUDIT_REPORT.md`、`02_DESIGN/QA_BENCHMARK_TEST_PLAN.md`、`03_IMPLEMENTATION/bots.js`・`bots-unified.mjs`、`04_TESTS/QA_AND_BENCHMARK_FINAL_REPORT.md`・`qa_benchmark_suite.mjs`・`qa_benchmark_results.json`、`05_HANDOFF/BUG_REPORT_AND_HANDOFF_GUIDE.md`）。同名のファイルが 2 世代（03:42 作成と 05:17 作成）あり、報告書は「全バグ修正完了版」と明記された新しい方を読んだ。コードは新しい方の `bots.js` を取得して比較した。

Bot は INKWAVE 独自の機能で、スプラトゥーン3に対応する挙動はない。このため本家（Ver. 11.3.0）との一致は判定できず、判断の基準は「INKWAVE として弱くならないか、既存の校正値と衝突しないか」に置いた。本家の実機比較・iPad 実機での計測は行っていない。

## 結論

- Drive の `bots.js` を丸ごと `inkwave-public/src/game/bots.js` に差し替えることはしなかった。差し替えると、`bots.js` を前提にビルド時に文字列置換するアダプタ（例: `patches/splatoon3/weapon-catalog-adapter.mjs` の「single duel special owner」）の置換先が消え、Bot に関係する 95 ファイルのうち、合格が 86 → 39 に減った（`--experimental-vm-modules` 付きで実行）。
- Drive の改善のうち、main に無く、既存の校正値とも衝突しなかった「見失った敵を最後に見た位置から追う」処理だけを反映した（下記）。
- 残りは、すでに main のビルド（アダプタ）に入っているか、既存の校正値・テストが固定している挙動を変えるため、反映していない。一覧は「項目ごとの扱い」に書いた。

## Drive 側の測定が main の実動作を表さない理由

Drive の「変更前」は、上流ミラー `inkwave-public/src/game/bots.js` を素のまま動かした値。本番ビルドは `patches/` のアダプタが `bots.js` に多数の最適化・挙動変更を入れるので、素のミラーは本番の Bot と別物である。たとえば Drive が問題にした `regionStats` の毎フレーム呼び出し、味方配列の毎回生成、壁越しの射撃は、main のビルドでは対処済み（下表）。そのため、Drive の「regionStats 61〜68% 削減」「壁撃ち 96〜100% 削減」などの数値は、main に対する効果として読めない。

## 反映したもの：見失った敵を、最後に見た位置から追う

- 本家の根拠：なし（Bot は INKWAVE 独自）。Drive の Agent A の「壁裏の敵を透視追跡しない・`lastSeenPos` のみを参照する・到着（2.2m）で追跡を打ち切る」を移植した。
- 変更前の挙動：`seeTimer` は敵を見るたびに 1.2 になり、見えない知覚ごとに 0.2 ずつ減る。敵が壁の裏に入っても約 1.2 秒は「見えている」扱いで、その間と、`lostTimer` が 2.5 秒を超えるまでの追跡中は、敵の現在位置（壁の向こう）へ経路を引き、照準・距離取り・横移動も壁の向こうの実位置を基準にしていた。壁越しの射撃自体は `botClearShot`（2026-11-05）が止めていた。
- 変更後の挙動：直近の知覚で敵が見えていた（`seeTimer > 1`）間は、敵の位置を `lastSeenPos` に記録する。見えなくなった後は、経路・照準・距離取りを `lastSeenPos`（速度 0 の仮の標的）で行い、そこから 2.2m 以内に着いたら標的を捨てて塗りに戻る。知覚の周期（0.15〜0.25 秒）と既存の `seeTimer` の意味は変えていない。`lastSeenPos` が無い標的（知覚の前にモードが標的を入れた場合など）は従来どおり実位置で動く。
- 実装箇所：`inkwave-public/src/game/bots.js` の `reset`（記録の初期化）、`update`（記録・隠れた標的の経路と終了判定・`_trackedTarget()` の利用）、`_targetHidden`・`_trackedTarget`（`_range` の次）。既存アダプタが頼る行は書き換えず、前後に追加した。
- 再現操作：Bot の標的が射線の通る位置から遮蔽物の裏へ動いた直後に、Bot の向きと経路の目的地を見る。変更前は壁裏の実位置を向き・追う。変更後は最後に見た位置を向き・追い、そこに着くと標的を捨てる。
- プレイへの影響：遮蔽物の裏に隠れた相手を Bot が正確に追ってこなくなる。見失った後の Bot は、最後に見た場所まで行って探す。
- 確認状態：
  - ロジック単独のテスト `patches/local-quality/tests/bot-last-seen-tracking.test.mjs`（5 件）。変更前のコードでは 5 件とも失敗し、変更後は成功する。
  - 既存の Bot 関連テスト：変更前と同じ結果（95 ファイル中 86 合格。残る失敗 9 件は変更前から同じで、fixture の JSON などテストではないもの 4 件と、`native-approach`・`native-climb`・`native-drop`・`native-jump-attach`・`native-surge`（変更前から失敗））。`source-quality` スイートは 2800 件中、失敗 0（10 件スキップ）。ビルド（全アダプタ適用）は成功。
  - 計測（headless Chromium、`scripts/measure-inkwave-bot-duel.mjs --target strafe --distances 9 --rounds 3 --seconds 10`、シューター・スプラスピナー・スプラチャージャー）：変更前後のビルドで全項目が一致（撃破・与ダメージ・命中率とも）。試し撃ち場のレーンは遮蔽物が無く、敵が常に見えているため。つまり「開けた場所で弱くならない」ことの確認であり、遮蔽物の裏での効果はロジックテストでのみ確認した。
  - 未確認：遮蔽物のあるステージでの試合全体の強さ・キル数・塗り面積の変化、`_pickRetreat`（退避先を決める脅威の位置）は従来どおり敵の実位置を参照している点、本家・iPad 実機での比較。

## 項目ごとの扱い

| Drive の項目 | main の現状 | 扱い |
| --- | --- | --- |
| 壁越しの射撃 | `bot-combat-quality-adapter.mjs` の `botClearShot`（2026-11-05）で、直近の知覚で射線が通ったときだけ撃つ | 対応済み。反映不要 |
| 壁越しの追跡・照準・経路 | 未対応だった | **今回反映** |
| `regionStats` の毎フレーム呼び出し | `bot-paint-observation-adapter.mjs`（知覚の周期ごとに共有） | 対応済み |
| 塗り目標・ボス目標の味方配列の毎回生成 | `combat-gpu-cpu-perfect-adapter.mjs` の CPU-13、`queue-bots-20261030-adapter.mjs` ほか | 対応済み |
| 射程外の無駄撃ち（射程の 1.08 倍まで撃つ） | `botFireReach`。通常は `range * 1.08`、ブラスターは射程＋爆風半径の 70%。INKWAVE の校正値（`bot-combat-quality.mjs` の冒頭に記載） | 未反映。Drive の 0.99 倍は「`w.range` が実到達距離」という前提が必要で、公開資料での裏付けが無い。ブラスターの校正と衝突する |
| ブキ別の適正距離・チャージ解放・先読み時間の表（`getWeaponCombatSpec`） | 既存の `_range()` とブキ別の分岐 | 未反映。表の係数（`prefDist` の比率、`effProjSpeed` の clamp など）の根拠が示されておらず、公式値を推測で確定させないという方針に反する。要実測 |
| 視野角・背後の死角、ターゲット保持・攻撃者・味方の優先度（`_perceive` のスコア） | 距離＋現ターゲット −4 のスコア。`bot-target-los-pruning.test.mjs` などが同じスコアとタイブレークを固定している | 未反映。難易度・体感の設計判断で、既存テストの契約を変える。所有者の判断が必要 |
| 味方 2 体以上が狙う敵への分散ペナルティ、塗り目標の分離 | 塗り目標の味方との間隔ペナルティは既存。ターゲットの重複回避は無い | 未反映（上と同じ理由）。要判断 |
| `paint` モードで前方に塗る面が無いとき（`aheadStats.n === 0`）に撃たない | `n === 0` でも撃つ（既存の挙動） | 未反映。足元の塗り・水たまり作りなど他の経路への影響を確認していない。要検討 |
| 退避・補給・終盤の判断（`unreachablePursuit`、`modeHold` ほか） | 既存の閾値 | 未反映。Drive 自身が発見した BUG-F-05 は、Drive の新ロジックが作った不具合で、main には存在しない |
| `_steer` のレイキャスト順（`_dryLine` を `_fatLos` の前に） | `_fatLos` の次に `_dryLine` | 未反映。`_dryLine` は 0.45m 刻みの地面判定で、`_fatLos` の 3 本のレイとどちらが安いかは経路の長さ次第。計測していない |
| 検証ハーネス `qa_benchmark_suite.mjs`、結果 JSON | — | 実行していない。Drive の作業環境のファイル配置を前提にしており、main のビルドを対象にしていない。Drive の報告書の「19/19 合格」「直接対決 4 勝 0 敗」「全 65 ブキの性能値ハッシュ不変」は再確認していない |

## 次にやるなら

- 遮蔽物のあるステージで、変更前後のビルドの Bot 同士の試合（キル・デス・塗り・スタック）を同じシードで比べる。今回の計測レーンでは遮蔽の効果が見えない。
- 上の「未反映」のうち、`_perceive` の視野角・ターゲット優先度とブキ別の適正距離は、所有者が方針を決めてから、既存テストの契約を更新する形で個別に入れる。
