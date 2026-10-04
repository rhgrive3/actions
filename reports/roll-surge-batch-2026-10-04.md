# 床ロール・壁ロール・ノボリ溜め移動の修正

## 対象と所有範囲

main `0859bf4fab08edc74c25fcb790e662a748a91ec9` から独立した Draft。
対象は #213 #224 #233 #242 #257 #275 の6件。起票時と実装開始時に最新本文、main、open PR を確認した。
公開 `inkwave-public/` のバイト列は変更せず、既存S3パッチと fail-closed adapter の接続だけを修正する。
既存 #59 の地上加減速・スライド、#62 の入力edge、#63 の武器/回復、#186 の衝突修正は複製しない。

## 参照と確度

比較対象は Splatoon 3 Ver.11.3.0、スプラシューター、基本条件はギアなし、自色インク、60Hz。

- [任天堂・現行更新履歴](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html): Ver.11.3.0、2026-08-20。ノボリ直後の過大な水平移動の修正は、本件の溜め中の移動とは別。
- [S3検証Wiki・床ロール](https://wikiwiki.jp/splatoon3mix/%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E8%A9%B3%E7%B4%B0%E4%BB%95%E6%A7%98#fd394133): 速度1.45 DU/F、速度条件の10F猶予、入力深度に依存しない方向判定、ロール中の加減速・操舵。
- [同・壁ロール](https://wikiwiki.jp/splatoon3mix/%E3%82%B7%E3%82%B9%E3%83%86%E3%83%A0%E8%A9%B3%E7%B4%B0%E4%BB%95%E6%A7%98#l4eb695b): 壁法線45度以内。
- [同・イカ速](https://wikiwiki.jp/splatoon3mix/%E3%82%AE%E3%82%A2/%E3%82%AE%E3%82%A2%E3%83%91%E3%83%AF%E3%83%BC/%E5%88%86%E5%89%B22#swim_speed_up): 中量0GPの泳速1.92 DU/F。
- [神ゲー攻略・イカノボリ](https://kamigame.jp/splatoon3/page/219207953075454395.html)、2025-03-06更新: B保持中にもゆっくり壁を移動して位置を調整できる。
- [空乃さゆる氏の公式映像・プレイ観察](https://note.com/sayurusky/n/n4c638718e320): ZL+B保持中の低速壁移動。2022年から2023年の観察であり現行の厳密な係数証拠ではない。

全て調査中に本文を開いた。コミュニティの測定値をNintendoの公開内部仕様と呼ばない。
#233本文の最初のWiki URLは「システム」の「ス」が欠けているため、上記の正しいURLを使用した。Issue本文自体は変更していない。

## 変更と回帰条件

|Issue|修正前|変更|確認|
|---|---|---|---|
|#213|native通常離脱が先に走り、真反対+Bが失敗。一方65/70/72度の無効方向で誤発動|fresh raycast/自色検証の後、正規化した45度円錐に入るB押下だけ通常離脱を延期。その後既存beforeActionsがロールを所有|±X/±Z壁、0/30/45/46/60/65/70/72/90度、新規B/なし、敵色/無塗装/壁喪失|
|#224|15F水平処理を完全にskip|native空中加減速へ戻す。装備込み泳速を空中目標として使い、保存launch速度を復元しない|中立/保持/直交/逆向き、低速からの加速、衝突後ゼロからの有界再加速|
|#233|現在速度のみ、猶予0F|直近の適格な実速度と方向を記録。10/60秒以内のみ使用|1/5/9/10F可、11F不可。native反転8tick後のB、hold再発動なし、air/敵色/ヒト/死亡reset/SJ等で破棄|
|#242|追加深度0.3ゲート|post-deadzoneの有効な非ゼロ方向を許容|0/.0001/.20/.29/.31/1.00。ゼロ/前方は不可|
|#257|最低速度9.216、base泳速比80%|固定8.7 WU/s、base比1.45/1.92。ギアによって最低速度を引き上げない|74%不可、76/78/100%可、境界前後|
|#275|B保持中vel/climbVを常時0|native壁移動の目標速度を一時的に低速化し、位置調整とチャージを両立|45F前後の上/左右、full保持、release burst、shared設定復元|

ロール速度履歴は描画フレームではなく既存固定tickで進める。通常ジャンプbufferや入力queueを増やしていない。
壁の塗り検証を過去フレームのclimbingフラグだけで代用しない。更新後は同じnative raycast結果を使う。

## 未校正値と未完の受入

- 床ロールの60度/90度境界には資料差がある。本件はその変更をせず、既存90度を維持。今回の床試験は180度中心。
- 8.7 WU/sは既存base泳速11.52に無次元比1.45/1.92を適用した設定。独立したNintendo-to-world距離校正ではない。
- 10F端点は最後に適格速度を観測したtickからの経過として実装し、10Fを含む。現行Switchで端点を追試する。
- ロールの空中係数は既存native `squidAirAccel=14` / `squidAirDecel=3` WU/s²を再利用する。これらの係数が本家と一致するとは主張しない。
- ノボリ溜め移動倍率 `chargeMoveScale=0.25` は「低速で位置調整可能」を回復する**暫定校正値**。正確な本家倍率は未取得。通常壁速7.5/5.2に対し上限1.875/1.3 WU/sとなるが、これをS3の数値として引用しない。
- #208のアーマー、#249の塗り切れ、#253の無入力壁下降、Surge射出18F制限は変更しない。
- Switch実機、物理iOS、オンライン2-peerでの最終受入は未実施。Draftを維持する。

## 検証の種類

新規 `roll-surge-batch.test.mjs` はnative Actor.update、_updateClimb、_horizontal、Runnerと実adapterを使う。
壁の幾何/塗りと描画はfixtureであり、Switchまたは公開ブラウザの実測とは区別する。
30/60/120Hzの描画間隔から同じFixedClockを進め、同じtickごとの位置/速度/状態を比較する。
既存collision-clippingテストは中立入力で停止を維持することと、新規入力による再加速を分けた。launch速度への巻戻しを許す変更ではない。

全体テスト、公開ビルド、Draft PRのCI結果は最終確認後に追記する。

## ローカル検証結果

- 新規15テスト: **15 pass / 0 fail**。同じテストをmainの別worktreeへ持ち込んだ負例は **4 pass / 11 fail**。全6Issueの修正前症状を検出した。
- `node --experimental-vm-modules scripts/check-inkwave-patches.mjs`: **757 pass / 0 fail / 0 skip**。
- local-qualityとmotion/workflow検証器: **18 pass / 0 fail**。
- `git diff --check`: 成功。公開ソースの変更なし。
- esbuild 0.28.2を使った通常の4段adapter合成ビルド: 成功、build revision `80ca9845fb0d`。
- ローカルbrowser gate: **未実行**。system Chromium 154は開始時のUnix socket作成が `Operation not permitted` で終了した。許可付きコマンドでも同じ環境制約を確認し、それ以上の回避はしていない。
- コード/fixture合格を、ブラウザ描画やNintendo実機の合格として扱わない。PRの既存Actions browser(active/catalog/ui)を続けて確認する。

## CI 追跡: 移動可能な溜めに合わせた実ジオメトリの診断壁

初回 CI 37185726584 で catalog の launch RGB 条件が失敗。旧 3 WU 壁は、溜め中も登れる変更後には frame 26 で壁が切れ、frame 75 の B 解除前にノボリが失われた。CPU の全 production installer・native Physics・Character で再現し、診断壁を 6 WU に変更すると charge=20、launch=75、crest=80 を観測。既存撮影フレーム、RGB/ready/glint/cleanup の合格基準を一切削らず、短い壁を負例として追加。実ゲームのステージ形状やノボリ速度は変更していない。GPU の最終合否は新 head の CI で確認する。

CI再修正後のローカル確認: 全体758 pass / 0 fail / 0 skip。catalog・production合成の集中47件とmotion/workflow10件も成功。次のCI完了まではGPU成功とは扱わない。
