# latest-main native 全体 benchmark 再実行結果（2026-10-30）

**全体改善は確認できない。** A/B の算術平均は wall 22.633 → 21.958 ms/tick、renderer ThreadTime 9.086 → 8.837 ms/tick と短いが、ABBA quartet の 95% 記述区間はいずれも比 1 をまたぐ。A/A の揺れも大きい。状態一致の合格と、速度改善の確認を区別する。

20:15:42.880–20:46:31 UTC に完了。`status=passed` / exit code 0。全 44 窓（warmup 20、A/A 8、A/B 16）を保存し、22 対を保存ファイルから再検証した。除外・外れ値処理・自動再試行はない。

| 比較 | quartet数 | wall 比の幾何平均（B/A） | 95% 記述区間 | renderer ThreadTime 比の幾何平均 | 95% 記述区間 |
|---|---:|---:|---:|---:|---:|
| A/A（同一 baseline） | 2 | 0.971354（-2.865%） | 0.451094–2.091645 | 0.932613（-6.739%） | 0.231067–3.764127 |
| A/B（candidate / baseline） | 4 | 0.970901（-2.910%） | 0.919769–1.024875 | 0.973539（-2.646%） | 0.910475–1.040970 |

区間はフレーム単位でなく ABBA quartet の log-ratio による Student-t 記述区間。独立性・正規近似を仮定する少数標本であり、継続的なホスト干渉やドリフトがあれば妥当性を損なう。

| A/B quartet（実行順） | wall 変化 | renderer ThreadTime 変化 |
|---|---:|---:|
| 1 | -7.089% | -8.574% |
| 2 | -3.582% | -0.719% |
| 3 | -1.364% | -1.010% |
| 4 | +0.563% | -0.026% |

A/A の quartet 変化は wall +3.180%, −8.555%、ThreadTime +4.086%, −16.438%。A/B の最大差は最初の quartet にあり、最後は wall +0.563%、ThreadTime −0.026% だった。この結果から、ネイティブ全体の短縮が再現したとは断定しない。

| cgroup（測定区間の差分、全値保持） | 抑制のある窓 | 抑制period合計 | throttled_usec合計 |
|---|---:|---:|---:|
| warmup | 15/20 | 67 | 4708144 |
| A/A 測定 | 6/8 | 18 | 371713 |
| A/B 測定 | 10/16 | 23 | 249845 |
| 全窓 | 31/44 | 108 | 5329702 |

A/A 最後の A 窓は 11 periods / 367280 μs、A/B 最初の A 窓は 4 periods / 62820 μs を記録した。抑制だけで全時間差を説明したとは扱わず、これらの窓も集計に含めた。

条件は元の固定プランと同じ：Hagglefish native、LOW 480×300、60 Hz、900 ticks/窓、shooter、8 actors / 7 bots / ready source characters 8、各フェーズ各side 5×900 tick の交互 warmup、A/A 2 と A/B 4 の ABBA quartets。GPU CPUs 0–1、workers 2–3、4-core cgroup quota、`CHROMIUM_PATH=/usr/bin/chromium`。scene submission なし、paint atlas draw はあり。profiling、allocation計測、強制GCなし。

| source | commit | build contentHash |
|---|---|---|
| baseline（latest main） | `db2134a71ffe3360626fdadba78916d9b702d31b` | `a0a4342576cc16e7480afe08e98b04c039b4979926844bc348a6b43e40438b61` |
| candidate | `df2491c6096c173efc14504dc5d00ea5b8458df5` | `3b3361d48aab678c369fef73b57c724a9bf12df024d6ba707c00094553eefb5d` |

両ビルドとも private Git LFS 17 payload の SHA/size と source commit 結合を検証済み。実際に要求された private 16 payload の配信 SHA/size も一致し、未要求は両sideとも `native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin`。配信は各side 687 unique files、A 2149 / B 721 requests を記録した。A/A の両ページも baseline を使うため request 数は非対称。全 HTTP 応答のバイト検証は既存guardを維持した。

保存後readbackでは、全44窓の finite、native initial、エラーなし、active battle、900 ticks、sceneRenderCalls=0、各ウィンドウ前後の全観測thread affinity、固定GPU PID 43397、全22対の initial/gameplay/digest/paint/counts/state/draw/resources/scene/pose/budget/BVH 完全一致、AA/AB集計の再計算一致を確認。記録された harness 8 files は保存版と現行版の両方のSHAを再確認した。

適用範囲は、この source 組合せと固定 CPU 割当・SwiftShader を使う scene-render 無しのホスト実験。per-frame wall は後続observerを除外し、renderer ThreadTime はdigest/counter/CDP等を含む。scene 描画がないため、このpose記録の一致は描画済みの骨姿勢を実証しない。実機GPU・自然scheduler・提示FPS、全pixel/audio/全private state、本家スプラトゥーン3実機の同等性は実証していない。旧cohortや他解像度の時間と直接混ぜない。

前回 `rnfull0` は環境再接続で計測プロセスが消失し、warmup20/A/A8/A/B5の未完了結果として保持した。`interruption.json` のみ別追加し、元resultのSHA256 `3e7532f3e4d7f32c4504761bd66a50cc5868ec8e929d4adccf7db2fd657bb39f` は不変。今回の統計へ混ぜていない。新実行は evidence-dir だけ変更して最初から一度実行した。切断された最初の起動tool呼出しと、後処理の初回import失敗も別metadataに保持している。

計測 node PID 43259 と GPU PID 43397 は消失し、実行中 node/Chromium は 0 と確認。終了した detached wrapper やChromiumの zombie entry は残るが実行は終了している。

証跡： [raw result (gzip)](result.json.gz)、[readback解析](analysis.json)、[検証スクリプト](analyze.mjs)、[固定planと再実行理由](full-plan.json)、[元planの複製](original-full-plan.json)、[標準出力](run.log)、[終了記録](exit.json)、[process・throttle確認](completion-verification.json)、[旧中断metadata](../rnfull0/interruption.json)、[起動tool失敗記録](setup-events.json)、[初回解析失敗記録](analysis-attempt-1.json)。

raw result SHA256: `19ad7a94bab6edaee500fad2d5c765d03bec22c7ea518e3d324bb1eabd04ea67`（7094763 bytes）。

Archive note: raw JSON is stored as result.json.gz. Decompress before running analyze.mjs; see ../../README.md for saved-file readback. Measurement sources remain db2134a7 / df2491c6, independently of the archive branch base.
