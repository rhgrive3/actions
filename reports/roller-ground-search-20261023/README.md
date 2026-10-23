# ローラー縦振り: alignLeftと接地探索の分離、不採用の最小候補

**修正完了ではない。軸限定候補は着地悪化で不採用。mainと既存PR refは更新しない。**

通常Codex cloudで調査。Work・native subagentは使用していない。元main726、cf9、weighted37a、aece診断、各保存ビルドとlogsは保護した。候補は公式main `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51` から別worktree/branch `candidate/roller-vertical-ground-axis-20261023` に作成した。main726→7e027の差分はメニュー関連2ファイルのみで、rollerとroller-detailは同一だった。

## 原因の分離

`roller.mjs` / `installRollerMotion` の右腕 `_solveLimb` 内を観測した。最初の姿勢へのalignLeftだけでなく、**実際に採用されたfloor評価候補**の「ground軸回転前 → 回転後・alignLeft前 → alignLeft後」を対応付けた。quaternionの角度は各段階の前tickとの差であり、スカラーの足し算ではない。

| 案 / native tick | 元入力Δq | 採用ground回転後・align前Δq | 採用align後Δq |
| --- | ---: | ---: | ---: |
| 元 / 49 | 0.600034 | 1.568667 | 1.899398 |
| cf9 / 50 | 0.650033 | 1.633812 | 1.728563 |
| weighted / 50 | 0.356998 | 1.583063 | 1.640665 |

元48tickではZ軸+1.30radを選択し、その候補にalignLeftが0.415871rad補正する。49tickは基準姿勢の床誤差が0になり、`if (neededGround && bestGroundError > .003)` の探索へ入らない。Z補正は一度に0へ戻り、残るalignLeft補正は0.165758radである。cf9もZ+1.35→なし、weightedはZ+1.35→X−0.30の切替がある。

**大きな段差の主因は接地探索の採用解が急に外れる／別軸へ切り替わること。alignLeftも採用姿勢に依存する追加変化を与える。** alignLeftだけが1.9radを作るという解釈は否定できた。raw queryが多いことやdetailでの再加算、pivot独自移動ではない。元・cf9・weightedで以前観測したdetail/rigid leverの診断も維持する。

観測用スクリプトは元artifactをmanifest SHAで照合し、配信レスポンスにだけASTでフックを追加する。diskの原本は変更しない。4案すべて、観測あり/なしの全66tickで条件とnative行が厳密一致した（unfrozen bootからの累積renderer.infoだけを明示除外）。各rawは元配信body SHAと観測body SHAを記録する。

## 必要最小限の試験差分と却下理由

production差分は `patches/splatoon3/runtime/roller.mjs` の探索ループに追加した条件1つ。縦振り・発射済み・非rolling・非contactのときだけ既存X軸候補を残す。新しい補間曲線、duration、grip/socket、左手支持、共有native IK、native入力/発射/移動/paint/network、spawn/reset/landing gate、character/髪/skin/meshは変更していない。**これは原因に対する試験案であり、X軸限定が本家仕様という根拠はない。**

| 通常roller・同じnative fixture | 元 | 軸限定候補 |
| --- | ---: | ---: |
| 40tickのdrum centre移動 | 0.788756 | 1.169697 |
| 49tickの移動 | 1.109129 | 0.520107 |
| 48–56最大1tick移動 | 1.109129 (49) | 0.717140 (50) |
| 39–56最大1tick移動 | 1.109129 (49) | 1.169697 (40) |
| 39–56移動総量 | 5.124046 | 5.423425 |
| 50–56移動総量 | 2.661387 | 2.661387 |

INKWAVE座標の測定。49tickの見た目は両側で同じ姿勢に到達しているが、その前に候補がdrumを立てており、40tickの移動を増やした。後半だけの改善で採用しない。[元40tick](images/before-released-edge-40.png)、[候補40tick](images/candidate-released-edge-40.png)、[元49tick](images/before-released-edge-49.png)、[候補49tick](images/candidate-released-edge-49.png)。画像を実際に読んで確認した。

画面上でも最大移動を49→40tickへ移した。39–56の投影centre最大1tick移動は元129.750px@49、候補97.275px@40だが、これを見た目の承認には使わない。worldの着地移動と加速度は悪化した。31–56、39–56、48–56、50–56の全速度・加速度・画面投影は [analysis.json](analysis.json)、簡約は [summary.json](summary.json)。decoded video frameや実測メートルには換算しない。

## 回帰検査と実画面

- 新規 `roller-vertical-ground-search.test.mjs`: source **3成功/1失敗**、実minify生成物 **3成功/1失敗**。失敗は「後半の改善を着地の大きな移動へ移さない」検査で、native source fixtureでは最大0.573590→0.842467。閾値を緩めたりskipへ変えたりしていない。
- 旧版相当の正確な条件削除をfault注入すると、後半横移動の0.30 INKWAVE fixture限界を検出するテストが **旧fail / 候補pass**。この限界はretail測定ではない。actual emitted browserでも元50–56の既存最大移動0.717140を基準にすると、48–56は旧fail / 候補passだが、39–56 guardは候補fail。
- 同検査の横振り/空中継続は全姿勢とdrumが旧版相当と一致。ZR解除/着地のnative clocks・弾の生成/位置/速度/ダメージ・ink・移動が一致。左右grip閾値は維持した。
- Carbon / 通常 / Dynamo / Flingzaの30/60/120Hz、restart/reuseの全180 native tick行が一致。variantの時計はcatalog runnerとCharacterの既存表示状態から別々に記録し、3種以上の異なるwindupを確認した。新しい共通durationはない。
- 既存focused **9/9**、support故障注入 **8/8**。support検査の入力SHAだけを今回sourceへ追随し、3つの故障anchor・historical b34 fixture・閾値は維持した。
- 実Chromeのpractice rangeで、元/候補それぞれZR解除、着地を48tickに変更、通常横振り、空中継続の4条件×66tickを完走、page errorなし。条件は同じ既存avatar/gear、名前seed3564230742、Aqua/Cherry palette、25 geometry SHA `b984d502777fda1948cef806a72e952639d709432fab328283ae48ab0c739f56`、camera/射影、水平aim。横振りと空中はnative出力全行が一致し、全4条件でink/攻撃/弾が一致した。[照合](browser-comparison.json)
- flags（SwiftShader等）・800×600・60000ms撮影timeout・描画方式は既存と同じ。新候補の実ブラウザは60Hzのみで、実ブラウザ30/120Hz受入は未完。source/emittedのFixedClock検査と分ける。
- modest operation check: 4条件の描画call増分はそれぞれ元/候補3233、3212、3221、3211で同じ。triangle累積増分は±2〜26の差があり、boot/背景描画を含むためpixel/負荷完全一致は主張しない。actor/weapon geometryは同じで装飾・particle追加なし。これはhardware GPU性能測定ではない。

[検査logs](checks)、[観測raw](layers)、[観測なし対照](controls)、[4条件browser raw](browser)。初期テストfixtureでVM間Array prototype比較とvariant時計の読取箇所を修正した。最終の数値閾値は緩めていない。途中ログと重複source実行ログもローカル保存し、実emitted検査の結果と取り違えていない。

## 本家比較と未解決

以前の通常GETで任天堂紹介ページ `https://www.nintendo.com/jp/ichikara/av5ja/index_en.html` と公式player `https://media-assets.apps-jp.nintendo.com/contents/embed/NablZy7jqxO` がHTTP403で拒否された状態を継続扱いとした。今回再取得・迂回はしていない。参照バージョン/gear/入力/camera一致の新規retail比較は未確認。本家一致、全体受入、候補の必須CI成功は主張しない。任天堂mediaは含めていない。

床補正の連続性を保ち、着地から後半へ悪化を移さない修正は未完成。共有IKの全面変更、grip基準変更、予約中のspawn/reset/landing gateの編集には進まない。候補は不採用のまま別branchに保存し、PR1856/cf9、weighted37a、PR1854、mainは更新しない。

## 再現

```sh
node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/roller-vertical-ground-search.test.mjs
INKWAVE_BUILT_SITE=<candidate-site> node --experimental-vm-modules --experimental-global-webcrypto --test patches/splatoon3/tests/roller-vertical-ground-search.test.mjs
INKWAVE_ROLLER_GROUND_FAULT=1 node --experimental-vm-modules --experimental-global-webcrypto --test --test-name-pattern='late ZR' patches/splatoon3/tests/roller-vertical-ground-search.test.mjs
node scripts/check-inkwave-roller-recovery-matched.mjs <site> <output> focused
node scripts/check-inkwave-roller-recovery-layers.mjs <site> <output> released-edge 60
node scripts/analyze-inkwave-roller-ground-search.mjs reports/roller-ground-search-20261023 /tmp/replayed.json --published
```

新規source/emitted検査は意図的に非zero終了（1件の実不合格）。faultは後半検査で非zero終了する。観測比較スクリプトの完走statusはmotion採用を意味しない。
