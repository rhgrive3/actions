# #1565 native scorch calibration: 検証成功と採用判定の境界

診断 guard は **passed**。**採用判定は UNQUALIFIED、性能・総資源の非劣化は未確認**。full JSON は `/workspace/actions/.ci-scratch/1565/evidence/grate-calibration/whole-game-calibrate.json`（9,454,269 bytes、SHA-256 `c3f5d8b082fffb9cefd7a50d24e261dff0c4a606d29600e101951c41bb6d19b0`）に保存され、全24 raw frame を compact JSON にも残した。失敗・不利な値を除外していない。

A: `d5265f73d9dad69f1afd9690e374caee45195f11` / contentHash `8f56a1470c72ecf04250ba7be2cf74a3c89f7267674c840d7d63c14fa3b29775`。B: `a6fcd76166b1aa887b7cbc3456833366b7d9cfe3` / contentHash `c70ff01bfc49cc9ff974336d902abaa85bf66c6e6b9752cac6dc189a21b5aba2`。ハーネス SHA-256 `77f0d946f638924751146d0aefa4a9678ec75f748a00693f492bcb60d6968360`。

実際の native scorch、normal、480×300/DPR1、medium/shadow/bloom有効、ABBA、各12 rendered warmup + 6測定frame。PlayerController1 + BotBrain7 を実行後、固定の静止外向き射撃 intent を与える8人生存 fixture。audio running / battle music worker / 自然にactivateしたPWA offlineReady を全試行で確認。Chrome 141.0.7390.37 / SwiftShader、AMD EPYC 9V74 80-Core Processor、logical CPU 5。

全試行の gameplay・骨・paint・random・frame workload、同版反復 endpoint pixels、A/B endpoint pixels が一致。renderer resource 数の一致や timing の非劣化閾値は、このハーネスの passed 条件に含まれていない。

| 実測 ms（全A/B samples） | A p50 / p95 / p99 | B p50 / p95 / p99 | 平均 A → B | 生のコスト変化 |
|---|---:|---:|---:|---:|
| CPU submit | 24.700 / 30.600 / 30.600 | 28.000 / 41.800 / 41.800 | 25.567 → 29.542 | +15.55% |
| readback wait | 1133.500 / 1261.700 / 1261.700 | 1273.500 / 1379.300 / 1379.300 | 1140.642 → 1266.658 | +11.05% |
| completed frame | 1158.400 / 1289.700 / 1289.700 | 1299.100 / 1421.100 / 1421.100 | 1166.208 → 1296.200 | +11.15% |
| rAF pacing | 1161.400 / 1290.100 / 1290.100 | 1320.900 / 1423.400 / 1423.400 | 1146.410 → 1304.970 | +13.83% |
| software GPU query | 1141.537 / 1273.576 / 1273.576 | 1278.568 / 1395.312 / 1395.312 | 1148.591 → 1275.691 | +11.07% |

completed の改善率は **-11.15%**、pacing は **-13.83%**。悪化側の観測であり、非劣化や高速化を主張しない。GPU query は24/24回収、missing/disjoint0。ただし software renderer のみ。

| 順序 | variant | CPU submit平均 ms | software GPU平均 ms | completed平均 ms | renderer geo / tex / programs |
|---|---|---:|---:|---:|---|
| 0 | A | 22.850 | 1090.162 | 1107.533 | 406 / 132 / 147 |
| 1 | B | 29.683 | 1237.531 | 1257.983 | 410 / 131 / 147 |
| 2 | B | 29.400 | 1313.852 | 1334.417 | 410 / 131 / 147 |
| 3 | A | 28.283 | 1207.020 | 1224.883 | 410 / 131 / 147 |

A0は406 geometry /132 texture、B1・B2・A3は410/131。**同一 baseline SHA 内でも +4 geometry /−1 texture** になり、原因は特定されていない。候補が発生させたとも、warmupだけが原因とも断定できない。各測定窓の前後は安定している。G.scene の unique geometry337、attribute backing104,188,607 bytes等は全試行一致するが、renderer全体の等価性を証明しない。

`renderer.geometries` は Three の renderer登録からdisposeを引いた件数、textures は renderer管理のWebGL texture/cache/render-target件数、programs は program-cache件数。いずれもG.sceneだけに限定されない。一方 unique geometry / backing bytes はG.sceneをtraverseしたCPU側の値で、Showcase・portrait・post・environmentの私有sceneやtexture/骨texture等を網羅しない。heapは強制GCなし、終端capture/serializationも含む境界値で、API間の数値を合算しない。

calibrationは各variant12 frame（pacing10区間）だけ。各試行p95/p99は最大値と同じで、8試行measurement/信頼区間は未実施。A0→A3にも時間変動があり、順序・process共有・ホスト負荷・cgroup CPU throttleの影響とsource変更の影響は未分離。throttleは全測定窓で記録されるが、悪化を説明し切る因果証拠ではない。

次は別の matched static renderer probe を行う。exact production modules、同じgeometry/textures/uniform/camera/targetsで自然なcompile/texture完了を待ち、ABBA/BAABで全raw値を保持する。top/back grateに加えてFrontSide、real texlib、real Paintの非ゼロ勾配を含める。draw CPU・完了待ち・全query GPUを分け、PNG/full-image readbackは計測外。資源のallocation/disposal ownerと私有sceneも記録する。これはwhole-game採用の代替ではない。

後続のwhole-game調査ではShowcase warm/portrait task、private環境/post target、旧match解放の自然なreadinessとcreation/disposal ledgerを追加する。owner停止や強制disposeで一致させない。今回のpassedを全体成功や#1434解決へ読み替えず、既存full JSON・画像・全raw24frameを保持する。

native source-displayは別のMeshStandardMaterialを使う。このwhole-game診断のcustom levelMaterial対象はnative ink overlayであり、authored-Level grate裏面shaderの修正確認は独立fixtureに属する。

compact receipt: `/workspace/scratch/1565-calibration-summary.json`。
