# 公開 INKWAVE：対人弾半径と武器待機ゲート（2026-10-04）

main `0859bf4fab08edc74c25fcb790e662a748a91ec9` の公開 `inkwave-public/` + 有効パッチが対象。#228 / #230 / #232 / #214 / #290 の5件に、関連する #346（スライドのメイン効率）を追加した6件。前バッチのスピナーPR #302はこのブランチに含めず、旧 `game/` も不使用。

## 出典・数え方

- [任天堂11.3.0までの履歴](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html)：9.3.0でDualies通常弾の判定を拡大しつつスライド後の方が大きい関係を維持。Blasterは11.0.0で後隙短縮、11.2.0で約1/60秒延長。絶対値は下記の補助資料から採用する。
- [固定11.3.0 Dualiesデータ](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponManeuverNormal.game__GameParameterTable.json)：CollisionParam.InitRadiusForPlayer=.31、CollisionLapOverParam.InitRadiusForPlayer=.335。Field側は両モードとも.2。コミュニティ抽出であり任天堂公開仕様書ではない。
- [S3 Wiki スプラマニューバー](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%9E%E3%83%8B%E3%83%A5%E3%83%BC%E3%83%90%E3%83%BC)（表11.0.0、2026-10-04再閲覧）：構え撃ち4F、スライド後インク回復不能70F。12F移動、前4F、武器使用禁止4F、移動禁止32Fを別に表記。
- [Inkipedia Blaster S3](https://splatoonwiki.org/wiki/Blaster#Splatoon_3)：発射から潜伏/サブまで22F。[11.3.0 Blasterデータ](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBlasterMiddle.game__GameParameterTable.json)のPostDelayFrame_Blaster=22も完全バイトとフィールド照合。発射前10F、連射50F、回復停止57Fとは異なる時計。
- [Inkipedia Slosher S3](https://splatoonwiki.org/wiki/Slosher#Splatoon_3)：発射から潜伏/サブまで16F。2026-10-04の#214監査時にS3本文を開いた結果に基づく。後のWeb抽出再訪はInternal Errorのため、新たな再取得成功は主張しない。[日本語Wiki](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%83%90%E3%82%B1%E3%83%83%E3%83%88%E3%82%B9%E3%83%AD%E3%83%83%E3%82%B7%E3%83%A3%E3%83%BC)の後隙17Fという端点包含表記と区別し、ここでは弾生成イベントを時刻0として16/60秒後を許可する。
- [S3 Wiki 検証/メインウェポン](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%A1%E3%82%A4%E3%83%B3%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3#m57e1d02)（表v10.0.0、2026-10-04再閲覧）：地上スプラチャージャー60F充填＋6F再チャージ不可＝66F連射。最初の起動前隙、ZR解放の認識、弾着遅延を周期へ混ぜない。11.3.0までの公式履歴にこの周期変更は見つからなかった。

## 実装

`runtime/weapon-gates.mjs` を `installWeapons` の末尾に登録する。Actorが形態/回復を判定する前に独立タイマーを一度進める。Runner単独更新や降下中更新には同じ時計のフォールバックを使う。二重減算やG.time依存は避ける。

- **#228**：通常の対人半径.15 WUを保持し、スライド後は `.15 * .335/.31 = .16209677… WU`。独立の `s3PlayerRadius` を発射時に保存し、adapterで対人比較だけに使用する。`size`、塗り/field、boss、表示、packetの各半径を変えない。絶対距離換算が未確定なので.31をそのままWUへ代入しない。
- **#230**：移動中に射撃cooldownの負債を蓄積せず、移動終了後の4F制限から最初の弾を基準に4F間隔で再開する。同一tick3発を生成しない。移動/32F硬直/発射禁止を別時計にする。現main固有の移動終了13tickと開始前4F欠落は変更しないため、スライド入力から本家同様20Fになるという主張はしない。PR #59/#62の移動終了境界が統合されれば、終了イベントをそのまま起算点にできる。
- **#232**：合法なスライド消費イベントから70Fを独立に保持。初回も2回目も70Fを再設定し、拒否されたスライドは更新しない。通常の射撃/サブの回復停止とAND合成する。69Fで回復しない、70Fで初めて許可。回復ギアは許可後の速度だけを変える。
- **#214**：実発射後にBlaster22F/Slosher16Fを設定し、busyによる潜伏制限と動的なsub入力判定へ接続。メインを放った同じupdateの後半でボムを投げない。ブロック中のサブ解放は破棄、R保持が境界をまたぐ場合は許可後に構え直してから解放できる。拒否したサブ解放をボムのインクロックとして数えない。空撃ちでは発射後ゲートを作らない。
- **#290**：native Chargerの実解放で新しく作られたcooldownを6Fへ置換する。充填60Fは変更しない。観測して次tickにZRを離す試験では61/127/193tickに発射し、発射同士は66F。保存チャージ/最小時間キャンセルを射撃と誤認しない。

## 検証

- 専用14件：位相の違う初回/連続2回スライド、撃ち続け/解放、70F回復境界、GP57、Charger 60F/6F/66F、22F/16Fの前後、同tickサブ、潜伏、低インク、リセット、かすめ命中、発射後モード解除、30/60/120Hz FixedClock。
- 公開ビルド出力へ `INKWAVE_BUILT_SITE=_site` を指定して同じ14件を再実行。元ソースに再adapterを掛けるのでなく、実minify出力のActor/Runner/Projectiles/Physicsを読む。
- Bomb motionの既存試験は、以前許可されていたSlosher発射直後の不正なsub期間を区別した。許可まで待った構え/リリースでは以前と同じ手のIK・無副作用・到達可能性の条件を維持し、ブロック中はプレビューが入力のfallbackを変更しないことを新たに確認する。許容誤差を緩めていない。
- 完全なCPU回帰、品質、ビルド、ActionsブラウザはPRの正確なheadごとに結果を記録。Switch実機、iOS、2人ネット対戦、絶対WU校正は未実施。

## 既存PRとの統合注意

- #63 head `bfae5fd133c1e4682d0def2d87c5321929cb449d`：既存のShooter/Chargerコードを読み、Chargerの充填/保存/低速を保持した一時的な手動合成候補で今回の14件を確認する。両PRがweapons.mjsを編集するため、Gitの無競合mergeや全PRの検証済みとは呼ばない。
- #64 head `33db80691e65ea5e620cfff4abaa17be9eefc7ae`：弾の衝突ステップを別関数へ移す。統合時はその対人半径fallback `p.size` を今回の `projectilePlayerRadius(p)` に接続する必要がある。boss側 `p.size*.6` やfield半径は変更しない。このPRへ#64の弾道実装はコピーしていない。
- #59 / #62：距離積分、移動の終了carry、入力edgeは既存PRの担当。今回の4F発射時計と70F回復時計を距離/ポーズへ兼用しない。
- #302：独立したスピナーインストーラー。双方の登録を保持し、共有weapons/profile/referenceの編集を片側だけで上書きしない。


## #346 追加：メイン効率とスライド消費（2026-10-04）

旧合格 checkpoint は PR318 head `444e568d607ce5dd3fd6d233f655572991be9c5e`、[Actions 37187550792](https://github.com/rhgrive3/actions/actions/runs/37187550792) の4ジョブ成功。追加差分はそのコミットから fast-forward する。ローカルでは最新 main `404c66c858cfea14e81225fb6364febcf2c9c528` の modeler 変更を保持して検証し、その無関係な10ファイルを本PRの差分へ含めない。

### 根拠と単位

- 上記固定11.3.0 `WeaponManeuverNormal` の `SideStepParam.InkConsume=.07` はインクタンク比率。既存変換を維持し `rollInk=7`（満タン100単位）へ、装備の `ConsumeRt_Main` を一度掛ける。
- [固定11.3.0 共通ギアパラメータ](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json) の `ConsumeRt_Main` は Low=1 / Mid=.775 / High=.55。既存の57 AP上限・ギア曲線を共用する。
- S3 Wiki スプラマニューバーのギア表は 0/3/6/10/20/30/57 AP のスライド消費を 7/6.70/6.41/6.05/5.26/4.65/3.85% と掲載（2026-10-04再閲覧）。10 APの内部計算は6.04555で、表の小数2桁表示とは区別する。HPダメージの0.1切捨てをインクへ流用しない。

### 変更と境界

`gear.mjs` の Actor 固有ブキ複製後、メイン効率の作用対象へ `rollInk` を追加する。共有 WEAPONS、射撃コスト、スライドの速度/距離/入力/回数は維持する。57 APなら残量5から合法にスライドして1.15残る。0 AP、10 APでは同じ残量5を拒否する。受理した消費は既存 #232 の70F回復時計をそのまま設定する。

binary64 の `7.000000000000001` や `3.8500000000000005` により数式上ちょうど足りる残量を拒否しないため、スライド入口だけに1e-10の比較補正と支払後の0下限を設ける。1e-6不足は拒否し、再入力中の二重支払も拒否する。これはゲーム上有意な残量不足を許容する変更ではない。

### 回帰と合成範囲

追加4件を含む専用18件で、全7 AP例、残量境界、Actor分離、反復装備/リセット、武器切替、過剰subsの3枠正規化、不正な8装備配列の空装備への拒否、Flow中の非重複適用を確認する。

PR341 head `f81652b6fb478241a54c3676d33d3c030a186133` の正確な `flow-effects.mjs` / `flow.mjs` / `gear.mjs` と profile.flow を使った一時合成を別途2件実行した。同PRの gear に今回の `rollInk` 1フィールドを追加し、その他のコードは保持した。実イベントによる発動・延長・失効・再発動、0/57 APでの支払、30 APメイン効率＋27 APヒト速→Flow57 AP上限、weapon/runner同一性、別Actor不変を確認した。Flowの一時加算対象4能力にメイン効率は含まれず、スライドコストを再乗算しない。これは手動の実runtime合成証拠で、両PRの無競合Git統合や条件付きギアPRの検証済みを意味しない。

全回帰・公開minify出力・正確headのActions結果はPR本文へ別記する。旧合格headのCIを追加後のheadへ流用しない。Switch実機での同条件計測は未実施。

追加後のローカル結果：全パッチ760/760、専用18/18、公開minify出力18/18、実Flow合成2/2、local-quality8/8、motion/workflow gates10/10、固定原典11ファイル・129フィールド合格（未知14維持）。build contentHash `1e69ecf287790f48cae62cce2928744a3c98191ccd437d0f243ae947a5357792`。Actionsは新しい公開headで別に再検証する。
