# Native coverage prefixの公開候補

以下の計測はmain基準`17ce3883`と候補`470e952a`の結果。追加証跡の公開前確認ではmainは`df8a4b8f8c29bf68a3480e8be14624c82f6d5190`へ進んでおり、そのmainや今回のdocs commit自体を測定した結果ではない。

`PaintSystem.coverage()`が必要な再計算で、前回ownershipのprefixをmask付きsource wordと照合し、最初の変更を含むcheckpointから元のeligible cell順でsuffixを加算する。既知turf publication時にも申告外のdirect grid変更を検出する。unknown versionやgrid/dead/facesのidentity変更はfull scan、異常・偽装storageは従来indexed loopへ戻す。public indexedFloorCoverageは直接full scanを維持する。float block sumを合成せず加算順を保つ。

## 測定と検証の範囲

- [旧source基準の部品/実browser要約](../inkwave-coverage-prefix-20261030/summary.json): 固定Hagglefish ownership履歴531 events+4 directed events、535出力/variantがbit-identical。Node replayのwall中央値はbaseline A99.645/B98.378→修正版53.465ms（A/A中央値平均比46.00%短縮）。追加typed buffer949340B。初回構築時間、JS object/一時配列を含むpeak memoryは未測定。v1/v2の遅い値とprototype偽装問題のあった旧v3も保持し、旧v3は採用しない。
- 同旧sourceの実native browser: 8 actors、30/60/120Hz、537 coverage呼出と10 directケースが比較成功。これは非計時correctness検証で、実機/FPS計測ではない。
- [現行mainへのbuild統合](summary.json): baseline17ce3883、candidate ffad9e08。470e952aはdocs追加でscoring runtimeは同一。通常build/source/artifact/LFS/startup budget検証済み。最初のbroad emitted testsは両版63/66（共通standalone fixture mismatch2、numba不在1）。その失敗logを保持し、supported subsetは両版62/62、prefix source/emitted各12/12、source-native各3/3。元の失敗を成功には数えない。
- [最新sourceのactual native smoke](native-smoke/README.md): baseline17ce3883/candidate470e952a、30-frame12窓/6組strict state/paint/BVH parity成功。A/Bのwall不利値も残す。scene submissionなしで画像/表示pose同一性・実機GPU・FPSを実証しない。
- [最新sourceの900-tick native計測](native-full/README.md): 同じbuildの全44窓/22 matched-ordinal組で記録state/paint/BVH等が一致。A/B wall −3.719%（95% −8.295〜+1.085%）、ThreadTime −3.022%（95% −6.777〜+0.885%）。同一build A/Aの揺れも大きく、全体高速化は未確認。全rawを圧縮保存し、元analyzerによるsaved-file readbackでanalysisとreportの一致を確認した。
- [score/HUD終端値と順序反転2セッション](native-counterbalanced/README.md): 同じsourceの300-tick試験88窓/44組と30-tick smoke20窓/10組で全記録stateと終端score/HUD binary64 coverage bitsが一致。A/B wallは1本目+5.72%、2本目−5.69%、ThreadTimeは−0.89%/−13.01%。条件付き区間・A/A・順序別値・全throttleを保存。セッション差とpage作成順/開始side同時反転の交絡があり、全体改善は未確認。旧900-tick結果やsmokeと時間をpoolしない。

Node固定履歴の46.00%短縮を全体性能へ読み替えず、全体高速化・実機FPSは未確認。900-tick計測もscene submissionなし・SwiftShader・固定CPU pool・固定ABBA/固定page順であり、自然scheduler・全描画への一般化はしていない。公開用docs commitは再build/計時していない。Splatoon 3の既存比較条件Ver.11.3.0を引き継ぎ、新しい塗り重み・面積・score数値を導入せず、本家実機の未確認事項を維持する。
