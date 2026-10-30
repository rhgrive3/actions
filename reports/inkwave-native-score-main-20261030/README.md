# Native coverage prefixの公開候補

`PaintSystem.coverage()`が必要な再計算で、前回ownershipのprefixをmask付きsource wordと照合し、最初の変更を含むcheckpointから元のeligible cell順でsuffixを加算する。既知turf publication時にも申告外のdirect grid変更を検出する。unknown versionやgrid/dead/facesのidentity変更はfull scan、異常・偽装storageは従来indexed loopへ戻す。public indexedFloorCoverageは直接full scanを維持する。float block sumを合成せず加算順を保つ。

## 測定と検証の範囲

- [旧source基準の部品/実browser要約](../inkwave-coverage-prefix-20261030/summary.json): 固定Hagglefish ownership履歴531 events+4 directed events、535出力/variantがbit-identical。Node replayのwall中央値はbaseline A99.645/B98.378→修正版53.465ms（A/A中央値平均比46.00%短縮）。追加typed buffer949340B。初回構築時間、JS object/一時配列を含むpeak memoryは未測定。v1/v2の遅い値とprototype偽装問題のあった旧v3も保持し、旧v3は採用しない。
- 同旧sourceの実native browser: 8 actors、30/60/120Hz、537 coverage呼出と10 directケースが比較成功。これは非計時correctness検証で、実機/FPS計測ではない。
- [現行mainへのbuild統合](summary.json): baseline17ce3883、candidate ffad9e08。470e952aはdocs追加でscoring runtimeは同一。通常build/source/artifact/LFS/startup budget検証済み。最初のbroad emitted testsは両版63/66（共通standalone fixture mismatch2、numba不在1）。その失敗logを保持し、supported subsetは両版62/62、prefix source/emitted各12/12、source-native各3/3。元の失敗を成功には数えない。
- [最新sourceのactual native smoke](native-smoke/README.md): baseline17ce3883/candidate470e952a、30-frame12窓/6組strict state/paint/BVH parity成功。A/Bのwall不利値も残す。scene submissionなしで画像/表示pose同一性・実機GPU・FPSを実証しない。

900-tick44窓の全体A/B測定は別作業で進行中で、この公開候補に結果を混ぜない。Node固定履歴の短縮を全体性能へ読み替えず、全体高速化・実機FPSは未確認。公開用docs commitは再build/計時していない。Splatoon 3の既存比較条件Ver.11.3.0を引き継ぎ、新しい塗り重み・面積・score数値を導入せず、本家実機の未確認事項を維持する。
