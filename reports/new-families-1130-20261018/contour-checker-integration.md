# 最新mainの輪郭と独立回帰検査

main #1583/#1585/#1584による意図した輪郭変更を、旧汎用maskの固定hashだけで判定していた `check-inkwave-weapons-fidelity.mjs` がCI #39114724719で失敗した。既存の原典数値・弾道を変更せず、検査の形状期待値と独立oracleを分離して統合した。

旧4種の物理/塗りarchiveはbyte不変。新しいshape-only receiptはruntime `7cebf05e56f4b0147d4bf8a49a2b076639c512363d4531828fe3edb6be89c4d9` の9条件（Charger5、Splatling3、Blaster1）のcell/stamp hash・面積・最大Zを固定する。これはINKWAVE回帰値でありNintendoの実測値ではない。従来省略していたChargerの正確なcell/stamp hashも拘束する。

production profile生成・mask・cullingをimportしない全セル走査oracleへ、別のimmutable 128列RG端点fixtureを追加した。旧5輪郭/Charger fixtureは保持。contactとblast/rectified blastの3輪郭×3方向×3seed＝27条件、方向除去9条件、kind18/19の差を独立に確認した。全15native射撃条件でsource全セル＝oracle全セル＝minified build全セル、全stamp・seed・RNG消費・birth・hit・terrain impactを照合した。

Blasterは旧maskに対して単にfootprintを外すだけでは旧挙動へ戻らない。変更された2stamp（sphere index1、fall index7）についてのみ、追加bearing/amountを旧nullへ戻し、fallのsource-splashを旧dropへ戻す。時刻・位置・半径・所有者・seed・cosmeticは一切変えず、全9stampの物理記録と旧cell hashを完全復元できた。これを本検査の対照として保持した。その他のstamp/攻撃の形状・物理比較は従来どおり厳密に維持する。

| Blaster対照 | 面積 m² | 最大Z | cell hash先頭 |
|---|---:|---:|---|
| 最新輪郭 | 53.4375 | 13.125 | 711abcf4 |
| footprintだけを除去 | 65.5 | 13.125 | 0c9d0727 |
| 旧mask metadataを正確に復元 | 66.5 | 13.375 | 166e55d9 |

全対照はRNG draw1、9stamp、同じ飛行/着弾を保持。面積の差を射程・ダメージ・物理の差として扱わない。3ネットワークmode・6壁落下case・実burst重複の負対照・生存/HP権限も本検査を最後まで実行して成功した。

別の更新main #1586（メニュー静止画）も取り込んだ。ブキ物理変更との因果を分けて検証し、最終生成物とマージ後mainのhash/CI受領はPR #1577本文へ記録する。
