# 統合候補の native scorch whole-game 診断

**診断 guard は passed、採用判定は UNQUALIFIED。性能・総資源の非劣化、安定した高速化は未確立。** 全8試行・480 raw frame と480 GPU queryを保持し、異なる資源数を示した試行も除外していない。

A: `d5265f73d9dad69f1afd9690e374caee45195f11` / content `8f56a1470c72ecf04250ba7be2cf74a3c89f7267674c840d7d63c14fa3b29775`。B: `57e5cf61121514c8d04ac8efe059b5386fa99f27` / content `657671efb238bc3625cdfea9f704087307b91a8fc0687cef01f48fd0a982e974`。ハーネス SHA-256 `359ed88ab17f84f16986f1668c30a4e86d0aca9d23cbab18bdc07f6d4f11c011`。

full raw: `/workspace/actions/.ci-scratch/1565/evidence/combined-measurement/whole-game-measure.json`（19,266,905 bytes、SHA-256 `7c150d439c08f962296a80eea2a24e3e83ba5fcd6d9ee4f1fa3bcc77c052ad6a`）。compact JSON は同名 `.json`。invocation、保存ハーネス/library、calibration の実ファイル hash も結び付けた。

条件は Chromium141 / SwiftShader、480×300/DPR1、medium・shadows/bloom有効、native scorch/browser-direct。PlayerController1 + BotBrain7 の実処理後に固定の静止外向き射撃 intent を与える8人生存fixture。ABBA/BAAB、各12 rendered warmup +60測定frame。自然なPWA activation/offlineReadyとrunning audio/battle music workerを保持する。通常の人間操作・実機FPSの網羅ではない。

gameplay・全bone/paint/RNG/frame workload、同版反復およびA/B endpoint pixels、draw callsは一致。GPU queryは480/480回収、missing/disjoint0。これらの成功はrenderer総資源やtimingの非劣化閾値を通過したという意味ではない。

| 時間 ms（各variant240frame、pacing236区間） | A mean / p50 / p95 / p99 | B mean / p50 / p95 / p99 |
|---|---:|---:|
| CPU submission wall | 29.119 / 28.100 / 39.600 / 51.400 | 28.783 / 28.100 / 39.200 / 46.200 |
| readback completion wait | 1267.222 / 1255.000 / 1430.500 / 1661.600 | 1238.040 / 1224.400 / 1391.800 / 1583.200 |
| software GPU query | 1276.124 / 1261.346 / 1432.769 / 1675.038 | 1247.025 / 1235.586 / 1406.643 / 1587.579 |
| completed frame | 1296.342 / 1282.100 / 1451.800 / 1700.300 | 1266.823 / 1256.400 / 1429.500 / 1613.800 |
| rAF pacing | 1300.146 / 1286.500 / 1469.200 / 1703.400 | 1269.909 / 1259.500 / 1434.600 / 1618.600 |

生の平均改善率は completed **+2.277%**、pacing **+2.326%**。paired pacing の平均効果は+2.320%、95%区間 **[-0.967%, +5.607%]**。0を含み、安定した改善を主張しない。Bの最悪completed frame1843msはAの1706.1msより遅い。

| 四組のpaired効果 | 平均改善率 | 95%区間 |
|---|---:|---:|
| CPU submission | +1.115% | [-2.784%, +5.014%] |
| software GPU | +2.272% | [-1.367%, +5.911%] |
| completed frame | +2.269% | [-1.344%, +5.882%] |
| rAF pacing | +2.320% | [-0.967%, +5.607%] |

隣接ペア(0,1)/(3,2)/(5,4)/(6,7)、trial平均の相対効果に対するt区間(df3)。独立・近似正規を仮定する小標本の診断で、事前に定義した非劣性試験ではない。全測定窓でCPU throttleが観測されるが、source効果や資源差を説明し切る因果証拠ではない。

**資源不一致は ordinal4(B) のみ。** その前後は406 geometry /132 texture /147 program、他7試行は全て410/131/147。各窓内では不変。mainSceneと記録した全privateOwners、boot/PWA/setup各段階も全試行一致した。Showcaseはwarmdone・portrait task/queue/inflightなし、同じdetached portrait Character・private scene・target寸法を記録したが、4 geometry/1 textureの所有者を特定できなかった。

**原因は UNKNOWN。** 同じobject graphでもrendererへの登録・upload・retirementの履歴が異なる可能性はあるが、allocation/disposal identity ledgerがなく確認できない。以前のbaseline内でも同種の406/132が現れたため、候補sourceだけに原因を帰すことも、warmupだけとして解消扱いすることもできない。G.sceneのgeometry337・attribute backing104,188,607bytesが一致してもrenderer-wide資源の一致やVRAM byte同一性は導けない。

| used heap境界（bytes） | A before → after | B before → after |
|---|---|---|
| performance.memory | 303,649,242–305,225,701 → 313,862,564–321,931,871 | 302,723,244–304,922,165 → 314,246,753–315,536,414 |
| CDP | 125,460,928–128,127,260 → 135,234,708–143,313,820 | 125,640,712–127,751,964 → 135,577,188–136,910,680 |

performance.memory usedの増分範囲はA8,636,863–18,282,629bytes、B10,150,898–12,813,170bytes。CDP usedはA7,107,448–16,736,228bytes、B8,602,196–11,269,968bytes。強制GCは行っておらず、終了側にはendpoint capture/serializationも含む。これはcold-GC retained memory、allocation rate、peak、leak、driver VRAMの測定ではない。二つのAPIの範囲は合算しない。

native source-displayの材質は別のMeshStandardMaterial。このwhole-game条件でcustom levelMaterialが使われるのはnative ink overlayであり、authored-Level grate裏面の修正確認は独立fixtureの結果に属する。実機GPU、入力遅延、端末温度/電力、S3実機同等性、#1434完了は今回も未確認。
