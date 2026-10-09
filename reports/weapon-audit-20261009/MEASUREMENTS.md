# 生成コードの測定結果

測定対象はINKWAVEの固定60Hz・実CPU衝突／所有グリッド。**Nintendo実機の測定ではない。** 距離はINKWAVE world unit、面積はその二乗。塗りグリッドは0.25単位、境界はセル中心で評価し半セルの不確かさを持つ。射程走査は0.1単位間隔。通常弾の拡散を0にして射程を測るため、この表は命中確率分布の検査ではない。ローラーは既存の単位分布を保持している。

入力基準 `5d0be6b7fdebfd07e696e75497aaa97aa5ff5648`。生成コード content hash `1b172cf51f4e9502da598ce4c47e08cef645548e9133c8d2a8244c663142d74a`。

| 条件 | 命中が残る最遠Z | 最大威力が残る最遠Z | CPU塗り最遠Z | CPU塗り面積 |
|---|---:|---:|---:|---:|
| shooter | 12.6 | 12.2 | 14.375 | 12.25 |
| dualies-normal | 12.2 | 11.5 | 14.375 | 12.1875 |
| dualies-post | 12.3 | 11.5 | 14.375 | 12.1875 |
| blaster | 13.5 | 10.7 | 11.875 | 47.375 |
| splatling-partial | 14.7 | 14 | 16.875 | 15.875 |
| splatling-first | 20.1 | 19.4 | 22.375 | 15.25 |
| splatling-full | 20.1 | 19.4 | 22.375 | 15.25 |
| charger-0 | 9.8 | 9.8 | 13.375 | 26.5625 |
| charger-0.25 | 11.8 | 11.8 | 14.875 | 30.25 |
| charger-0.5 | 16.1 | 16.1 | 18.875 | 41.875 |
| charger-0.75 | 20.4 | 20.4 | 23.375 | 58.3125 |
| charger-1 | 24.8 | 24.8 | 26.875 | 81.6875 |
| roller-horizontal | 11.2 | 6.1 | 14.125 | 78.625 |
| roller-vertical | 16.3 | 6.9 | 19.125 | 67.875 |
| slosher | 13.5 | 13.5 | 13.625 | 14.625 |

チャージャーはゲーム用の有限飛翔専用経路を使う。通常projectileリストの弾数0という診断項目は発射していないという意味ではない。`charger-0` は最低合法チャージへ丸められる経路の名称。各条件のダメージ距離走査・フレーム・飛翔座標・インク精算は `evidence/measurements-delivery.json` に保存。

実行:
```sh
node --experimental-vm-modules scripts/measure-weapons-fidelity.mjs --site _site --after --out measurements.json
```

既存goldenを変更せず、別に生成前6アダプターのソース経路と生成コードを比較した。`check-inkwave-weapons-fidelity.mjs` は15条件、3種の通信生成／ghostモード、4系統6条件の壁落ちを検査し、成功を記録した。3種とは全7系統の全ネットワーク状況を実ブラウザで確認した、という意味ではない。
