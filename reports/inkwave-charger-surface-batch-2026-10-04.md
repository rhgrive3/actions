# 公開INKWAVE：チャージャー表面挙動4件

対象 #107 / #122 / #194 / #279。旧 `game/` は対象外。実装開始時mainは `0859bf4fab08edc74c25fcb790e662a748a91ec9`。公開用は `404c66c858cfea14e81225fb6364febcf2c9c528` へrebase。0859→404の10ファイルはtools/inkwave-modelerだけであり、そのモデル/画像/ツール変更を維持した。

## 根拠

- [S3 Charger Wiki](https://splatoonwiki.org/wiki/Splat_Charger)：S3節の射撃後15F潜伏待ち、スコープ無しのブキ区別。通常ページ直取得は403だったため、同ページの検索索引が返したS3本文で15Fを再確認した。直接取得成功と偽らない。
- [Wiki実測の前隙/後隙](https://wikiwiki.jp/splatoon3mix/%E6%A4%9C%E8%A8%BC/%E3%83%A1%E3%82%A4%E3%83%B3%E3%82%A6%E3%82%A7%E3%83%9D%E3%83%B3/%E5%89%8D%E9%9A%99%E3%83%BB%E5%BE%8C%E9%9A%99#x60e781e)：v10.0.1、60fps実測。チャージャーの後隙は発射隙開始を起点とし、発射隙1F/イカ16F。実弾発射からの15Fと起点を区別する。生のFreezeFrameを潜伏待ち値とは扱わない。
- [日本語スプラチャージャー](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%97%E3%83%A9%E3%83%81%E3%83%A3%E3%83%BC%E3%82%B8%E3%83%A3%E3%83%BC)：v11.0.0表、軌跡塗りの横/縦半径とスコープ無しの説明。ページの小数は独自表示単位なので、コードへ絶対距離として移さない。
- [スプラスコープ](https://wikiwiki.jp/splatoon3mix/%E3%83%96%E3%82%AD/%E3%82%B9%E3%83%97%E3%83%A9%E3%82%B9%E3%82%B3%E3%83%BC%E3%83%97)、[Inkipedia Splatterscope](https://splatoonwiki.org/wiki/Splatterscope)：scope有無の対照。将来のスコープの50%開始/28度を本PRでは実装しない。
- [固定11.3.0 Charger raw](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponChargerNormal.game__GameParameterTable.json)：CollisionParam.InitRadiusForPlayer=.125、SplashPaintParam WidthHalfMin/Full=.78/1.56、DepthHalfMin/Full=2.73/1.56。
- [固定11.3.0 Shooter raw](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json)：InitRadiusForPlayer=.285。[Wikiの現行Splattershot](https://splatoonwiki.org/wiki/Splattershot)検索索引も.285を返した。
- [任天堂更新履歴](https://en-americas-support.nintendo.com/app/answers/detail/a_id/59461/)で比較版11.3.0を確認。rawはコミュニティ抽出であり、任天堂が内部数値を公開したという扱いではない。

## #107 カメラ

未スコープのChargerでは充填率からFOVとboomへ入る値を0にする。明示的なscopedCharge能力の有無を接続し、profileの現Chargerはfalse。cameraRig全体を書き直さず、衝突による接近・イカカメラ・リコイル・ユーザーFOVは元の経路を維持する。Charger以外の既存挙動も維持する。将来のスコープの曲線は未校正。既存14度/0.6WUを本家scope値として認定しない。

## #122 独立15F潜伏ゲート

実fireChargerが実行された時刻を0とし、Actor.updateで減算する別タイマーを設置。部分/満チャージ両方が1〜14Fで潜伏不可、15Fで可能。汎用busy()やlastFireを流用せず、再充填のcooldown・インク回復停止・サブ入力を本件の値で巻き添えにしない。lastFireが別イベントでリセットされても期限は変わらない。resetで消去。発射していない満チャージの潜伏保存は妨げない。

## #194 判定半径と実際の距離

Physics.pointCapsuleDistは「表面からの距離」ではなく、半径で上下端を決めた**カプセル中心軸線分までの距離**を返す。従って判定閾値にはプレイヤー半径と武器半径を各1回加える。以前のChargerは軸端へ+.12、判定閾値へ+.14を別々に足していた。部分/満チャージの両経路の軸端をPLAYER.radiusへ揃え、判定をPLAYER.radius + weapon.playerHitRadiusへ接続する。

絶対の実機↔WU換算は未校正なので、Shooterの現挙動をanchorにする。半径.38、旧projectile.size=.15より、軸からの閾値は.38*.95+.15=.511。これを .38 + .131 として同じ閾値に保ち、Chargerの武器側は .131 * (.125/.285) = .0574561403508772。全閾値の比ではなく、**プレイヤー半径を差し引いた武器側の比**を合わせる。0.515WUの旧逆転例はChargerも外れる。

既存の近似segmentCapsuleDistは長いビームで解析幾何の厳密最近点から小さくずれる。回帰では実関数で境界を測り、その±.004WUをpartial/full・頭/足/胴で検査する。正確な連続CCDへ置換したとは主張しない。敵順序、地形終端、満チャージ貫通は保持。absolute射程や有限弾速は本件に含めない。

## #279 幅と形状

通常ライン塗りの最小横半径は既存 .55*.8=.44WU を維持し、raw幅比 .78→1.56 で最大.88WUへ拡張する。横幅比は2.00。深さ/幅から投影方向のstretchAmtを計算し、最小2.5→最大0へ変える。定数1.2のままではなく、充填に応じて細長い形から丸い形へ変わる。

**残る校正:** native paintのstretchは前方1+sa、後方1+.25saという非対称なsmearであり、S3の楕円/内部塗りマスクそのものではない。ここではforward半径の比を対応させる最小モデル。ここで幅2倍の端点は現APIのcharge=0/1。PR63の8F最短解放を統合した際の実入力→charge座標の正規化は別途校正が必要で、8F実入力と満充填の最終塗り幅が厳密2倍と測定済みとはしない。中間充填の線形補間、背景への3D投影、重ね塗りによる最終輪郭も未校正。rawのwidth/depth半径をそのまま世界メートルとして使わない。従って本件は比率/形状変化の修正であり、実機の全塗り形状受入完了は未主張。

line splatだけを変更し、着弾塗り・足元専用塗り・弾数/間隔・ダメージ/射程は維持。実G.paint.splat引数と独立した実CPU所有格子の断面を最小/中間/最大部分/満チャージで検査する。

## 統合と検証

- 専用10件：実CameraRig、実Actor境界、実Projectiles/capsule sweep、実PaintSystem._cpuSplat、30/60/120Hz FixedClock。
- 公開minify出力を同じfixtureで読む経路を追加し、source-only合格と区別。
- 新cameraRig接続先の全内容を読んでupstream-lockにhash追加。既存hash/nativeファイルは変更しない。
- PR63の最小充填/保存時計、PR64の弾道、PR186の衝突順/足元塗りと重複実装しない。将来それらを統合する場合は、同じcharger full-hitの軸半径/閾値変更を残すこと。個別CI成功は同時mergeの無条件保証ではない。
- PR318はCharger再充填6F、今回の15Fは潜伏のみ。両タイマーを同じ値へ統一しない。
- ブラウザーGPUはDraft PRのActionsで確認。Switch/実スマートフォンの新規測定は未実施。

最終ローカル検証：全752/752、専用source10/10・公開minify build10/10、local-quality8/8、motion/workflow gates10/10。固定raw11ファイル・抽出132値の照合成功。build contentHashは `d31918c61516c6450061633b2f3e8d14744730aad3afa929aacdbea5db7c688d`。途中、生成物の一時退避でpersistent test-evidence guardが失敗したが、guardは変更せず永続ログ先へ戻して全回帰を再実行した。ブラウザー/Switch検証結果と混同しない。
