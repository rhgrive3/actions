# ワイパー波の外側接触と最短終端の順序

基準mainは`9addefc5`、物理処理は`b84d77cb`と同じ。#1579は外側lobeの地形接触を検出すると、その場で塗りと退役を確定していた。その後で選ぶ、より近いActor・CoreIndex地形・Boss・盾の接触より後方へ塗れる。

実PhysicsとCPU採点gridで、ドライブ波の発射点Z=1.4、右柱の面Z=2.1、敵Z=2.8とすると、波はZ=2.03で敵へ30HPを与えて終了するのに、後の柱へ2壁セルを塗った。修正後は0セル。敵Z=3.8なら外側接触の方が先なので、2セルを維持する。右柱Z=2.1・左柱Z=3.4・敵Z=3.1では、右だけ塗り・退役し、左は確定しない。ghostも到達した側だけ退役し、HPと塗りは持たない。

地形探索は各lobeの接触時刻と既存Hitを保持する。Actor/Core/Boss/防御を含む波全体の最短終端を決めてから、到達範囲内の外側だけ塗り・退役を確定する。`stop=-1`の退役済み・Infinityの未接触を除外し、既存piercing継続より前に確定する。新queueや毎stepの追加objectは使わず、単一lobeは追加loopを通らない。

旧処理の候補ごとの乱数1回は同順に予約し、採用された塗りへ明示seedを渡す。棄却された塗りで以後の射撃乱数列をずらさず、ghost/remote/半径0の既存消費gateも維持する。seed=0、異なる値の乱数列、採用された左右lobeのseed順、次の実射撃のseed/速度を検査する。

回帰は[新規8試験](../../patches/splatoon3/tests/splatana-lobe-hit-order.test.mjs)と[既存部分接触4試験](../../patches/splatoon3/tests/glob-partial-contact.test.mjs)。近敵/遠敵、近い/遠いcore地形、実際に開いたBrella盾、Boss queryの制御境界、複数外側、重複防止、ghostを含む。Bossモデル自体の形状を実描画した試験ではない。旧production `fb8eea6e`では新試験が6失敗・2成功となる。修正sourceは新旧合わせ12成功。独立した実Physics前後比較5条件でも、終端・ダメージ・乱数消費・次弾は不変、最短終端を越えた塗りだけを除去した。

近接slashの4F・seen・対物経路とStringerの独立damage centreは変更しておらず、近接/対物/爆発offset/LOS等の重点21試験も修正後に成功。sourceとemittedのCI列へ新試験を接続した。最終production・ブラウザ・mask・通信・負荷は親作業の新生成物受領に記録する。

これは#1579の外側lobeモデル内部で接触時刻と所有権を整合した修正。本家の外側退役アルゴリズムを新たに立証するものではない。退役lobeとBossの集約半径・描画meshの形状対応は別の未検証項目として残る。
