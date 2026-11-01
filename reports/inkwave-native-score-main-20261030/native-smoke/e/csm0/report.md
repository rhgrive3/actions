# coverage 最適化：latest-main native smoke（2026-10-30）

**Strict smoke 合格。本測定は未開始。** 30 frame・warmup 1・A/A 1 quartet・A/B 1 quartet に限定し、21:03:02–21:10:10 UTC に exit 0 / `status=passed` で完了した。保存後 readback でも warmup4、A/A4、A/B4 の全12窓・6対・拒否0を確認した。

baseline は source `17ce3883007b9f402a82dc194285f23deba3afb9`（contentHash `3b3361d48aab678c369fef73b57c724a9bf12df024d6ba707c00094553eefb5d`）、candidate は source `470e952a2066adfbbeedf754850a0abd0f7d9fd2`（contentHash `b533be802784df3aec66803ef733352f8caa07eaf238709fde2c9a095b80aff8`）。両 source commit と全private Git LFS 17 payload のSHA/size結合が検証済み。各side690 unique filesの配信SHA/sizeを確認し、A2108/B704 requestsを保存した（A/Aの両ページはbaselineを使う）。実際に要求されたprivate16 payloadも一致し、未要求の1 payloadは両者とも `native-prebuilt/packs/17bb58c376d433629f030474dc50e198.bin`。

Hagglefish native、LOW480×300、60 Hz、shooter、GPU CPU0–1 / worker2–3、scene submissionなし、paint atlas drawあり。`CHROMIUM_PATH=/usr/bin/chromium`明示。profiling/allocations/強制GC/BVH作業量削減なし。既存harnessを変更せず、各phaseの交互warmupはAB。

全12窓で native=true・8 actors・7 bots・8 source characters、finite、active battle、page error/context lossなし、30 ticks、sceneRenderCalls=0を確認。全6 matched-ordinal対で initial/gameplay/digest/paint/counts/state/draw/resources/scene/pose/budget/BVH記録の完全一致を再検証した。ウィンドウ前後の全観測browser thread affinityと固定GPU PIDも一致。記録harness8 filesのSHAは保存版・現行版とも一致し、保存結果からのAA/AB再集計も一致した。

| 参考timing（各1 quartet） | wall A→B ms/tick | wall変化 | renderer ThreadTime A→B ms/tick | ThreadTime変化 |
|---|---:|---:|---:|---:|
| A/A | 12.630→12.493 | −1.082% | 14.414→14.882 | +3.246% |
| A/B | 12.050→13.263 | +10.069% | 14.164→13.940 | −1.582% |

各1 quartetのため95%区間は算出されない。A/Bでwallの不利値も含め全窓を保持し、外れ値除外や再試行はない。このsmokeだけでは全体改善・回帰やFPSを結論しない。以前のNode component中央値約46%短縮・追加配列949340Bという情報を、今回の全体計測結果へ読み替えない。scene-render無し・SwiftShader・固定CPU割当・observer付きThreadTimeという適用範囲であり、全pixel/audio/private state、本家スプラトゥーン3実機の同等性、実機FPSを実証していない。

warmup cgroup: 0/4窓、0 throttled periods、0 μs。

A/A cgroup: 0/4窓、0 throttled periods、0 μs。

A/B cgroup: 0/4窓、0 throttled periods、0 μs。

全窓 cgroup: 0/12窓、0 throttled periods、0 μs。

計測node PID 47575、GPU PID 47708、browser PID 47664 は消失。実行中node/Chromiumは0。終了したwrapper等のzombie entryは残る。本測定の起動は親の指示待ち。

証跡：[raw result (gzip)](result.json.gz)、[readback解析](analysis.json)、[検証script](analyze.mjs)、[固定smoke plan](smoke-plan.json)、[ログ](run.log)、[exit/PID](exit.json)、[終了・cgroup確認](completion-verification.json)。

raw result SHA256: `4c0e88091f4f3680f0bf9ab67377d48bffc327745205169a8a8fdd42721809c8`。

Archive note: raw result is stored as result.json.gz. Decompress before saved-file analysis; see ../../README.md. The recorded status about full measurement describes smoke completion time; later measurement is separate.
