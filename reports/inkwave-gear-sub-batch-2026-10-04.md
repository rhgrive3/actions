# 公開 INKWAVE：サブ構えとギア5件（2026-10-04）

main `0859bf4fab08edc74c25fcb790e662a748a91ec9` 基準、#193 / #235 / #245 / #298 を最初の4件とし、後続 #267 を追加した5件。旧試作版・他Draftの実装は含めない。#243はPR #319で対応済み、#241は不発ロック長が未確認のため選ばなかった。

## 根拠と条件

- [S3 Wiki ギア分割1](https://wikiwiki.jp/splatoon3mix/%E3%82%AE%E3%82%A2/%E3%82%AE%E3%82%A2%E3%83%91%E3%83%AF%E3%83%BC/%E5%88%86%E5%89%B21)：表11.0.1、標準100%タンクのスプラッシュボムは70%、サブ効率35APで2連投、57APでは45.5%、最大35%削減。わかばの大型タンク23APと混同しない。
- [固定11.3.0 params](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json)：ConsumeRt_Sub_Lv2=[.65,.825,1]（High/Mid/Low）。Splat Bombのクラス割当は上記Wikiの端点・35AP境界で裏付け、空のSubWeaponSettingから既定値を復元したとはしない。
- [S3 Wiki スプラッシュボム](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B5%E3%83%96%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E3%83%9C%E3%83%A0#spec)：ヒト5F/イカ10Fの最短前隙、R押下で構えて解放で投擲。表の版注記1.0.0であり、11.3.0の公式公表フレームとは偽らない。現行履歴にこの値の変更は確認できなかった。
- [S3 Wiki ヒト移動速度の例外](https://wikiwiki.jp/splatoon3mix/%E3%82%AE%E3%82%A2/%E3%82%AE%E3%82%A2%E3%83%91%E3%83%AF%E3%83%BC/%E5%88%86%E5%89%B22#run_speed_up)：投擲ボタン保持の構えは0.72DU/F、ヒト速ギア/重量に依存しない。中量通常0.96に対する比.75。特殊装置を持つだけの状態と実際のR構えを分ける。
- [S3 Wiki アメフラシ・スペ性能](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%9A%E3%82%B7%E3%83%A3%E3%83%AB%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%A2%E3%83%A1%E3%83%95%E3%83%A9%E3%82%B7#if4d2daf)：持続480→600F、初速最大+50%、ゲージ回収不可時間も連動。GP3/6/10/20/30の持続表491/502/516/546/569F。
- [固定11.3.0 Ink Storm](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpInkStorm.game__GameParameterTable.json)：RainyFrame Low/Mid/High=480/540/600、SpawnSpeedZSpecUp=1.12/1.4/1.68。MidはGP28.5ではなく曲線制御点。既存のAP飽和曲線で計算後、持続フレームは整数化してWiki表へ照合した。
- [任天堂現行更新履歴](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/How-to-Update-Splatoon-3-2266003.html)：比較版11.3.0の確認。[公式ギア説明](https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-choosing-the-right-gear/)はギアの機能を裏付けるが、非公開曲線やフレームの一次数値資料ではない。

## 変更

### #193 サブ効率

Splat Bombに明示的なinkSaverCurve=[1,.825,.65]を持たせる。装備APから該当サブの曲線を選び、未登録サブに同じ最大削減を流用しない。35APは49.805875、34APは50.15794、57APは45.5。実Runnerで無回復の2連投を検査した。共有SUB.bomb.inkCostを書き換えずactor別の短命specを作るため、投擲イベント中に別actorのsub更新が入っても倍率が二重化しない。メイン効率/回復/サブ性能の曲線は変更しない。

### #235 最短準備

sub-ready.mjsが実R押下時刻とpending releaseを保持する。基準を押下が受理されたtickの時刻0とすると、ヒトは5/60秒、イカからは10/60秒より前に生成しない。1ベースのupdate番号なら押下update1、ヒトの最短生成はupdate6（経過5F）。長押し後は余分な5Fを追加しない。単に映像を遅らせず、実インク消費とthrowBombを許可境界で呼ぶ。

イカからRを押したらヒトへ出て、解放によるpending中も投擲前に勝手に潜伏して入力を失わない。インク不足、死亡、reset、スペシャル、Super Jumpはpendingを残さない。#318の発射後ロックを検出した場合は拒否されたRを後から再投擲しない。連投間隔30F/投擲後10F等の別制限まで本PRで一致したとはしない。

### #245 構え速度

地上の構えだけ4.32WU/s（既存の座標換算で0.72DU/F、通常5.76の.75比）へ接続。0/57APで同じ、空中の既存制御や解除後の通常ギアは維持。Flowの既存runMultiplierは温存するが、Flow中の正確な本家値は未認定。PR #322との合成では、ただ持つholdは通常歩行、subArmedかつ実R保持だけを構えとして扱う。敵インク・投擲後の全条件の実機校正は別課題。

### #298 スペ性能と不変snapshot

specialPowerを通常メイン/追加枠へ登録し、保存/正規化/AP計算へ通す。アメフラシ発動時にa.s3.stormPowerSnapshot={duration,throwScale}を確定する。装置b.s3StormDuration→雲durへコピーし、後の装備変更や他actorの設定から独立させる。共有SPECIALSをギアごとに書き換えない。480/491/600Fの最後に浮動小数誤差で1tick残さない。

投擲はネイティブの速度成分を比率で強化し、固定の上向き成分/プレイヤー速度まで丸ごと1.5倍にはしない。PR #259のベクトル実装が存在する場合だけ厳密なbuild hookでforward Zを回転前に強化し、Y=.24、慣性、world Y下限を保持する。現mainの基礎Storm速度16自体を本家の値として認定しない。基礎ベクトルは#259の担当。

PR #322が作る既存stormGaugeLock>0をthrowStorm後にsnapshotの持続へ延長する。独立のロック時計やholding機構は作らない。このPR単体のmainには#322のロック機構がまだないので、ゲージ停止の受入にはその統合が必要。holding中にギア値を変えても発動時の10秒を保持すること、599F不可/600Fで回収再開を合成で確認した。

Tidal Slamへ架空のスペ性能値は適用しない。現native雨の最後0.3秒のfade/damage条件や塗り分布の本家一致まで本件のduration検査で認定しない。

## wire と接続

native bomb event配列の任意末尾metadataにstormDurationを保存し、ghostBombへ渡す。remoteが装備を知らなくても発動時の持続を復元する。旧metadataなしは既存durationへfallbackする。src/net/netmatch.jsの内容は読取済みで、新規接続先の完全hashをlockへ追加した。既存hash/nativeファイルは変更しない。

**PR #182の拡張bomb packetとは統合調整が必要。** そのspin/identity/timelineスロットを本metadataで上書きしてはならない。完成したwire所有者の形式へmetadataを移して両者の回帰を実行する。混在ビルド/2人遅延対戦の完全互換は未検証。

## 検証と既存PR

- 専用11件：AP0/3/10/34/35/57、実二連投、再入actor、5/10F、短押し/長押し、キャンセル、構えの地上/空中、スペ性能0/3/6/10/20/30/57、snapshot、JSON packet/ghost、雲期限、30/60/120Hz FixedClock。
- 既存Bomb/Action/Face表示29件では、投擲済み状態を調べる準備入力を5F以上の合法な構えへ変更。短押しの表示試験は実放出まで待ち、実放出の同tick姿勢・銃口/手/時計・無副作用を以前と同じ誤差で検査する。時計を早送りしたり判定を弱めたりしない。
- PR #322 head9f1fcacb19c6f410742fefa3b521ad6579d97b7c + PR #259 head763422306ebc939b29a13a882884e75826f16658 の正確なruntime/adapterを一時合成し、既存Storm12件＋新3件=15件が成功。hold/no-auto-throw、単一ダメージ/味方回復を保ち、GP57のZ100.8・Y14.4、移動慣性を別に確認。物理接触のstubを使うCPU機能試験でありGPU/実機一致ではない。
- 合成順はStorm adapterを先に、Gear/Sub adapterを後にする。PR #259 runtimeは通常のpatch build経路でもgear hookを通す。両PRのコードを本ブランチへコピーしていない。
- 全公開回帰と公開minify出力でも検証し、Actions結果はPR headごとに記録する。Switch/iOSの新規測定は未実施。

ローカル最終結果：全公開回帰753/753、専用11/11、公開ビルドから同11/11、local-quality 8/8、motion/workflow gates 10/10。固定raw11ファイル/抽出値132件を照合。公開build digestは `28ad43a1f45e4b131ddbd1de6608fcf3378f6e4f4bc3687ff1ca298c451b7f85`。ローカルChromiumはUnix socket EPERMで実行不可のため、ブラウザー評価は当該Draft PRのActionsへ分けて確認する。


## 後続 #267：サブ性能のガイド/実投擲を同じactor-local値へ

拡張前合格checkpointは `8a9435a2db5926bf674d87c1a1eee27a8064ecca`、[run37191448676](https://github.com/rhgrive3/actions/actions/runs/37191448676) のIN​KWAVE4ジョブ成功。旧checkpointの検証と今回の追加は区別する。

新subThrowSpecがSUB.bombを変更せず、actorのsubPowerを一度だけ適用した短命のthrow specを返す。native throwBombとupdateArcの両方がその値を使う。gear.updateの共有SUB.throwSpeed書換えと復元を削除したので、他actorの更新中にguideや投擲が再入しても倍率が伝播しない。原典Low/Mid/High=1.12/1.4/1.68から既存gear curveが計算する0/10/57AP=1/1.1515/1.5を維持。

[S3 Wiki Splat Bombのサブ性能表](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B5%E3%83%96%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%83%E3%82%B7%E3%83%A5%E3%83%9C%E3%83%A0)は0/10/57APの初速11.20/12.90/16.80 DU/Fを掲載。丸め表示と計算内値を区別し、発動時間/インクコスト/回復条件は変更しない。[固定Bomb原典](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBombSplash.game__GameParameterTable.json)のMoveParam.SpawnSpeedZSpecUpは既存bindingで照合済み。

PR259 runtimeが存在する場合の既存build hookを広げ、bombならsubPower、stormなら発動時specialPower snapshotの倍率で**local forward Zだけ**を拡張する。別成分Y、プレイヤー移動継承、上向き上限、world Y下限はその担当の値を保持する。最新確認head16d1259d731cc695b0aa1d467df17be1c1c5bff4は直前head7a508f27からreportのみ変更で、実runtimeも再読して同じanchorを確認した。他担当PRへ直接書き込んでいない。

実nativeのarc cache初速と実投擲初速を0/10/57APで比較し、20tickの実弾積分とFloat32 guideの各2tick頂点も比較する（3e-5WU許容）。gear変更でcacheが更新されること、低インクでも装備後のguideになること、57AP actor内から0AP actorのguideと投擲を再入した負例、subPower/specialPowerの相互汚染がないことを確認する。

最新PR259とPR322 head9f1fcacb19c6f410742fefa3b521ad6579d97b7cの実runtime/adapter合成で、既存15件＋追加2件=17件成功。中立照準GP57ボムのforward100.8、Y14.4は維持され、移動XZ×1.6や上向き上限を別に確認。Stormの600F時計/保持・回復・非加算も保持。native基礎ベクトル自体の実機一致や、全てのgenuine kitのsub軌道を認定するわけではない。

既存integrationのサブ性能検査は共有SUBの一時書換えを観測していたため、新設計では実throwVelocityへ渡された速度を記録する検査へ変更した。raw High=1.68*60、共有Low=1.12*60、誤差1e-9の期待値は変えず、合法な6F構えと実bomb1個も確認する。

#267追加後の結果：全757/757、専用source15/15・公開minify build15/15、公開buildの既存integration19/19、最新PR259/322合成17/17、local-quality8/8、motion/workflow gates10/10。固定raw11ファイル/132抽出値を再照合。contentHash `725a387ef0879b426cc9e7d0341acf962d8d3338971e437270eb216423bf7612`。公開直前もPR259 head16d1259dのruntimeが合成済み内容と同一であることを再読確認した。
