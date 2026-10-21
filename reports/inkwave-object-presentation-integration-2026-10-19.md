
## 2026-10-19: 変身・オブジェクト表示・ルール/ギアの比較記録

この節は 2026-10-19 06:31 UTC 時点の受入範囲を記録する。コード保存、PR公開、exact-head CI、実ブラウザ、main統合、公開サイト反映は別の段階である。以下の未確認項目を、CPUテストだけで本家実機との一致へ昇格しない。

### イカとヒトの相互変身

- PR1604 の head `b69b00e704a96a5d8a964c3cc5fb9c35939fdacb` は適用CI40成功・対象外7skipと928 PNGを確認後、main `1cbe15538e6fb98a7ab18a58473caf75006bf6ad` へ統合した。公開manifestと公式Pagesビルドは全バイト一致し、公開後のoffline4ルール検証も成功。mainのcheck-runsは29成功・任意診断1skip。任意性能計測や本家実機計測の完了を意味しない。
- ヒト復帰の150ms表示補間、source/fallbackの引継ぎ、spawn直後の表示継続を扱う。ルール上の形態変更時刻と表示補間を区別する。詳細と留保は `reports/inkwave-squid-form-2026-10-18.md`、`reports/inkwave-squid-native-appearance-2026-10-18.md`。

### スポナー・ホコ・アサリ: PR1627 の限定受入と残件

- 固定 head `62cd3a08fcc43fce60fba77392beae418ce2258c` は本番生成物を用いた比較。通常4ワークフローは成功したが、object native QAはホコの支持手検査で失敗した。スポナー24/24、アサリ70/70と補助2枚、ホコ88/120を取得した部分結果であり、PR全体の成功ではない。
- スポナーは同照明/同カメラで抽出口、円筒ヘッド、ガード、下部スキッドを比較。足のworld位置を維持し、明白なガード貫通は確認されなかった。5 mesh/0 textureを維持、912→2720 triangles、属性63,328→293,760 bytes、materials4→5。実描画回数は維持するがshader program数は増える。Actor側面2枚では下端が切れ、撮影距離の修正と再撮影が未完。モデル色で照明差を補正しない。詳細: `reports/inkwave-spawner-model-2026-10-19.md`。
- ホコは既存charge/recoveryの時計を表示へ利用し、新しい発射時計を作らない。source Shooterのjumpで支持手距離0.01057014 world unitsを実ブラウザと同入力CPU replayで再現した。sourceの短い潜伏中断/復帰との所有競合は別件。kid-spaceのIK残差とworld-spaceの握り距離を混同しない。補正後のdrop→潜伏→復帰→通常ボムの生成位置への後作用も受入対象である。未解決を閾値変更やmuzzle固定で隠さない。詳細: `reports/inkwave-rainmaker-attack-motion-2026-10-19.md`。
- アサリの小1.4倍/大1.2倍は可読性の暫定値で、本家の寸法測定値ではない。接地、飛行方向、バリアの前/斜め/後ろの破片表示は限定確認済み。バリア実描画は非表示0/表示1/2pass負例2。単発CPU値から高速化を断定しない。投げ腕は初回の瞬間変位、Dualies、右側の予備上げが未完。
- アサリの表示左腕がsourceの潜伏履歴へ入り、次の通常ボム生成位置を変える回帰を実consumerで再現した。表示の上書きを次のsource処理前に撤去し、表示ヒトが残る潜伏区間は既存elapsedで回復を継続する修正候補を別に検証中。旧headの画像を新候補の見た目の受入として使わない。
- 任天堂JPの[バンカラマッチ公式ページ](https://www.nintendo.com/jp/switch/av5ja/battle-bankara/index.html)掲載の連続映像で、投げる手の頭横への移動と球の右上への出現を確認した。版と入力時刻は不明。後方投影では公式にも頭と球の短い重なりがあるため、前斜め画像の遮蔽だけで球の世界位置が不正とは判定しない。角度と奥行きを揃えた比較が必要。詳細: `patches/splatoon3/reference/clam-presentation-2026-10-19.md`。

### ヤグラの同点先着優先

- [S3検証Wiki](https://wikiwiki.jp/splatoon3mix/ガチヤグラ)の後着側を1カウント戻す挙動と比較。実RankedEngineの通常updateで、所有を失った側の50→51補正が同じupdateの再加点で50へ戻る不具合を再現した。
- `ranked/tower.mjs` の得点確定を現在ownerに限定。実consumerの新19条件は旧版で失敗、修正版を含む136条件と独立31条件/追加6条件が成功。本番4 offline mode/2-browser online roomも確認した。PR1629はhead `2cea886c365c676dae4403f236c446d28f7d7dd2` の全必須CI後、main `3e8812d996eea01ad4cab84eb8fbaa3545cb5d5f` へ統合。公開後検証はこの時点では未確認。
- 詳細: `reports/inkwave-tower-tie-consumer-2026-10-19.md`。

### ギアと未確定の初動時間

- [S3ギア検証Wiki](https://wikiwiki.jp/splatoon3mix/ギア/ギアパワー/分割2)と固定11.3.0パラメータを参照。PR1630は自然SP増加にスペシャル増加量アップを誤適用する2consumer、およびジャンプ短縮のcharge/flight各相の整数frame切捨てを対象とする。塗りによるSP増加効果と、初動の別項を維持する。
- head `f2dbd6fd1889b672df4812a2a223296e330f7f9d` は関連149テストと独立6テストが成功、旧runtime負対照6件は失敗。実ブラウザでRainmaker攻撃のdamageが空になる失敗は未帰属で、全CI/生成物受入完了とはしない。host/followerと30/60/120Hzの消費経路を区別する。
- 現行のジャンプ初動1F/22Fは確定原値のbindingではなくcalibration。実Actorのイカ開始81F/219F、ヒト開始102F/240Fは差21F。S3 Wikiの追加18Fは版/個別映像の確認が足りず、S2由来の21F資料をS3の裏付けに転用しない。現行初動値を推測で変更しない。
- 復活短縮では、明示したホコ時間切れ自爆を履歴へ含める別候補を検証中。通常のnull attacker、落下、水没、キル介在とは区別し、初回死亡を無条件短縮しない。ネットワークはhost/match/seq/lifeと明示timeout包絡を検証する。PR1630の別hunkを旧ファイルで上書きしない。

### 監査の限界

- 移動/重量とインク消費・回復の限定監査では、関連135テスト、原資料49数値binding、12回復条件で不一致を再現しなかった。省略既定値、非標準タンク、未実機計測の条件は未確認のまま。
- アサリの投射Y成分/移動継承には実装差があるが、公開パラメータだけでは適用順・座標系・距離校正を確定できない。既存ボム式を無根拠に流用しない。全Wiki性能・全ルールの監査完了を意味しない。


### 2026-10-19 08:24 UTC：統合候補の検証状態更新

PR1630（自然SP・ジャン短）とPR1633（アサリ閉鎖時端数）は最終head全必須CI・専用emitted・実browserを経てmain136c5346へ統合。先行PR1631のローラー方向修正と中央記録を保持。モデル候補は別PR1627のままで、前節の保留状態を完成へ置き換えるものではない。ホコの通常/チャージjumpで残っていた左手の離れに対し、既存0.2rad上限後だけ最大0.03WUの一時鎖骨位置補正を試作。1条件3jump合計84空中frame、2条件168frameの握りgateとsource履歴・通常射撃/ボム・解除復元を確認した。0.03WUは校正値で実機寸法ではない。新20枚の下降/着地比較と最終headのemitted/CIは未確認。381319で失敗したemitted testの直接importと128画像receipt名の上書きはQA側で修正し、新headで再検証する。詳細は専用air-position報告を参照。

PR1632（ホコ所持時間切れの復活短縮履歴）も最終headの全必須CI、exact emitted5件、統合形browserとmain136合成88件の受入後、main b07bf92へ統合。今回のモデル候補はこの6path差分も公式blob一致で保持し、main反映とモデル側の新native受入を区別する。


## 2026-10-19 PR1627 staged Clam arm deferral

The preceding 789378 native result (252 original PNGs and two contact sheets) is historical evidence, not acceptance of the next head. Actual Controller comparison against official main b07 identified newly introduced Clam wrist discontinuity (normal power throw 0.300659 WU; repeated throws up to 0.494475 WU). The new stage removes only the Clam arm event consumer/overlay and retains the ball, barrier, event-envelope, spawner and Rainmaker improvements. The original implementation and continuity prototypes remain preserved. Complete Clam preparation/release motion remains unfinished.

Four runtime paths separate the unaccepted arm overlay; ordinary bomb behavior and the three Rainmaker restoration hooks remain. Five Clam test paths are retained in source and emitted lanes, now requiring main-equivalent arms and source history. Their 21 source cases pass; the old 789378 negative control passes 10 ball/barrier cases and fails 11 arm cases. Shared contracts pass 24/24, Rainmaker source 27/27, and ordinary bomb/Clam rules 44/44. These counts overlap with additional drivers and must not be summed as unique cases.

The 80 Clam captures retain all views/timing and record contact residual without claiming a faithful grip. Air comparison overlays the historical 381319 handoff and contemporaneous bomb module together, with Clam inactive in Rainmaker mode. The capture denominator stays 252 PNGs plus two sheets. New exact-head emitted tests, browser capture, official readback and final visual review remain required before integration. No new stage browser completion is claimed here.


## 2026-10-19 PR1627 Clam ball display held back after native collision evidence

Native8a capture and exact football-shell diagnostics found the head center inside the displayed shell at release0/16.7ms. The old display's head-center signed face distances were +0.04348/+0.264996 WU (outside), while new display distances were -0.13258/-0.080389 WU (inside). Scale, center offset removal and velocity-axis orientation each contributed; reverting scale alone would not resolve the observed problem. These are head-center containment measurements, not full head-surface intersection volume or proof of retail dimensions.

The next stage restores the old-main ball size/pose across inventory and field/flight together to avoid a new carry-to-flight scale jump. It retains successful-event repair, barrier fracture/reuse, bounded inventory marker cache, spawner and Rainmaker improvements, and the previous Clam arm deferral. Full Clam enlargement and preparation/release motion remain unfinished; no physical shot origin or gameplay radius is silently adjusted. The8a original code, tests, PNGs and diagnostic prototypes remain preserved.

The central report preserves the full new-main9af3006e prefix including PR1637, followed by this PR's existing appendices and this note. The new head requires its own source/emitted/browser/visual acceptance; earlier8a green CI is not substituted for it.
