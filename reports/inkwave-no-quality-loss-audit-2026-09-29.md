# INKWAVE：画質を維持して直す価値がある追加改善

- 対象：`rhgrive3/actions` / `inkwave-public/`
- 基準：[`2075e6468b99c901ff0817b5858c7bae2d1a6095`](https://github.com/rhgrive3/actions/commit/2075e6468b99c901ff0817b5858c7bae2d1a6095)
- 調査日：2026-09-29
- 状態：監査・再現検証済み。ゲーム本体の修正は含まない。

## 結論

**新規2件と、前回修正に残った1件に絞った。いずれも解像度・影・反射・演出・操作応答・物理精度を下げずに、不要な生成や解放漏れを除去する案。**

| 対応順 | ID | 改善 | 確認できた無駄 | 変更の範囲 |
|---|---|---|---|---|
| 1 | Q01 | ロビー終了時に影のターゲットを解放 | 20回終了させても影の解放イベント0回 | 最終終了処理への追加 |
| 2 | Q03 | ロビー初期化の環境光ベイクを1回にする | 同じ入力で2回生成 | コンストラクタの1呼出を置換 |
| 3 | Q02 | 投擲ガイド線の距離バッファを再利用 | 検証180フレームで同じ用途の属性を121個生成 | 距離配列の更新方法のみ |

Q01/Q03は新規。Q02は前回F04の固定照準キャッシュが正しく入った上で、動かしている照準に残る割当の取り残し。前回の修正を無効とする指摘ではない。

「絶対」の基準は、**画質や体験との交換条件がなく、取り除く処理を具体的に説明・再現できること**とした。実機FPSの上昇幅を保証する意味ではない。影/FXを低品質へ切り替える案、反射の解像度・更新頻度・対象数を減らす案は今回の対象外。

## Q01. ロビー終了時、所有する影のRenderTargetを明示的に解放する

**根拠**

- [lobbySet.js L607–611](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/lobbySet.js#L607-L611)：ロビー専用の `lights.key` を生成し、`castShadow = true` にしている。
- [dispose L772–780](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/lobbySet.js#L772-L780)：geometry、material、各種テクスチャ、反射/環境光ターゲットは解放するが、`key.shadow` の解放がない。
- [showcase.js L1651–1665](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/showcase.js#L1651-L1665)：`_lobRelease()` がこのdisposeを呼び、シーンを空にする。
- [同 L2093–2106](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/showcase.js#L2093-L2106)：画面から消え、オンライン接続やメニュー等の保持条件がなくなった後、1.5秒超でこの経路に入る。単なるアプリ終了専用処理ではない。
- [同梱Three.jsのLightShadow.dispose L46517–46531](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/vendor/three/build/three.core.js#L46517-L46531)：`map` と、存在すれば `mapPass` をdisposeする。シーンから取り外すだけではこの呼出は起きない。

**最小の修正案**

`LobbySet.dispose()` の最終解放処理へ、次を追加する。

```js
this.lights?.key.shadow.dispose();
```

対象はこのインスタンスが所有する影だけ。ロビーを一時的に非表示で保持している間には呼ばない。既存のspillのcookie解放はそのまま残す。

**画質が変わらない理由**

描画中のライト強度・影サイズ・更新頻度には触れない。終了して再利用しない影用資源の寿命を閉じる変更なので、表示する内容は変わらない。

**再現結果**

実際の `LobbySet.dispose()` 本体と、実際のThree.jsの `SpotLight` / `WebGLRenderTarget` を使用。描画後を模した `shadow.map` をセットして20回終了させた。

| 検証項目 | 現状 | 上記処理追加のfixture |
|---|---:|---:|
| shadow.mapのdisposeイベント | 0 | 20 |
| 任意のshadow.mapPassのdisposeイベント | 0 | 20 |
| 既存spill cookieのdisposeイベント | 20 | 20 |

`mapPass` は存在する場合の解放も検証するために付けたもので、実ゲームで必ず作られるという主張ではない。測定は解放イベントであり、実GPUメモリ量ではない。

**実装後の確認**：ロビー表示→完全退出→再入場を繰り返し、新しく入ったロビーの影が通常どおり表示されること。保持中のロビーを早期解放しないこと。

## Q02. 動く投擲ガイド線のlineDistanceを、同じ数値のまま再利用する

**根拠**

[weapons.js L1407–1452](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/weapons.js#L1407-L1452) では、既に固定入力の軌跡をキャッシュしている。しかし位置・発射速度が変わると、L1437の `computeLineDistances()` は引き続き実行される。

[Three.js L28208–28230](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/vendor/three/build/three.core.js#L28208-L28230) は呼出ごとにJS配列と `Float32BufferAttribute` を新規生成し、`lineDistance` を置換する。64頂点の固定長なので、毎回作り直す必要がない。

**修正案**

投擲ガイド専用の64要素の距離属性を一度だけ作り、軌跡が変わったときに内容を書き換えて `needsUpdate = true` にする。Three.js本体の共通メソッドを書き換えず、武器側に閉じる。参考の同値実装は添付プローブ内の `reusableLineDistances()`。

**同じ見た目を保つための条件**

- 頂点、衝突判定、軌跡キャッシュ、`drawRange`、色、リングの脈動・着地点を変更しない。
- 累積距離は従来と同じJSのNumberで加算し、最後に各要素をFloat32へ格納する。前のFloat32要素から累積すると丸めが変わるため避ける。
- まず現状同様に64頂点すべての距離を更新する。live範囲のみの計算など、別の最適化を同時に混ぜない。

**再現結果**

実際の `updateArc()` を変更せず、距離計算だけを置換して比較した。条件は「動く照準・衝突なし60フレーム」「動く照準・床に衝突60フレーム」「固定照準60フレーム」。

| 検証項目 | 現状 | 再利用案 |
|---|---:|---:|
| フレーム数 | 180 | 180 |
| 物理segment呼出 | 10,626 | 10,626 |
| 生成されたlineDistance属性の数 | 121 | 1 |
| GL createBuffer呼出（模擬GL、position含む） | 122 | 2 |
| GL bufferData呼出（模擬GL） | 122 | 2 |
| GL bufferSubData呼出（模擬GL） | 120 | 240 |

**全180フレームの頂点配列・距離配列はバイト単位で一致。描画範囲、線の色/表示状態、リングの位置・回転・サイズ・色/表示状態も一致した。** 描画頂点数26と64の両方を含む。固定照準のキャッシュも維持している。

`bufferSubData` が増えるのは、新規バッファ生成から既存バッファ更新へ置き換わるため。これは転送データ量削減の提案ではなく、割当・初期化の繰り返しを除く提案。

模擬GLではgeometry終了時のdeleteBufferは双方2回だった。現状は置換前の属性に対応する明示的deleteがこの経路にはないが、ブラウザのGC/ドライバ挙動は再現していないため、恒久的なGPUリーク量とは扱わない。単体の256 bytesは小さく、ゲーム全体の大幅高速化を主張する項目でもない。

**実装後の確認**：照準旋回、移動、床・壁への着弾、インク不足、ガイド再表示で破線とリングが従来と同じこと。既存の軌跡キャッシュを外さないこと。

## Q03. 同じ環境光をコンストラクタで2回ベイクしない

**根拠**

[lobbySet.js L80–85](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/lobbySet.js#L80-L85) の初期化順は次のとおり。

1. `_bakeEnv()` が環境光用の代理シーンを作り、`_rebakeEnv()` で1回生成する。
2. `_build()` / `_lights()` / `_reflection()` を実行する。
3. **現在と同じチーム色**で `setTeamColors()` を呼び、無条件にもう1回 `_rebakeEnv()` を実行する。

[L135–165](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/lobbySet.js#L135-L165) の環境光は、本体シーンとは独立した `_envScene` をPMREM化するもの。途中の3メソッドはこの代理シーンや入力色を変更しない。[L170–181](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/lobbySet.js#L170-L181) と [L440–450](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/lobbySet.js#L440-L450) では、対象materialへ最初の環境光を既に渡している。

**最小の修正案**

コンストラクタ内だけ、次の置換を行う。

```diff
- this.setTeamColors(this.U.uTeamA.value, this.U.uTeamB.value);
+ this.update(0, this._t);
```

`setTeamColors()` 自体は変更しない。[L749–754](https://github.com/rhgrive3/actions/blob/2075e6468b99c901ff0817b5858c7bae2d1a6095/inkwave-public/src/game/lobbySet.js#L749-L754) の最後の `update(0, this._t)` は初期化に必要なので残す。コンストラクタの呼出を単純に削除するだけにはしない。

**画質が変わらない理由**

代理シーン、色、PMREMサイズ128、ぼかし係数0.04、近遠クリップ、生成位置を維持し、同一結果を再生成する2回目だけを省く。後でチーム色が実際に変わる際の再ベイクは維持する。環境光を低解像度にしたり、更新を遅らせたりする変更ではない。

**再現結果**

実際のコンストラクタと `_bakeEnv()` / `_rebakeEnv()` / `setTeamColors()` を使用し、PMREM生成先に渡る代理シーンのgeometry・material色・transformと生成引数を記録した。周辺のモデル組立・Canvasテクスチャ・フォント処理等はfixtureで置き換えている。

| 検証項目 | 現状 | 呼出置換案 |
|---|---:|---:|
| コンストラクタ中のPMREM生成呼出 | 2 | 1 |
| 初期入力のハッシュ | 2回とも同一 | 現状と同一 |
| 実際の色変更後の追加生成呼出 | 1 | 1 |
| 初期化＋色変更時のupdate呼出 | 2 | 2 |

fixture内materialが参照する環境光の入力ハッシュも変更前後で一致した。実GPUの画素比較ではなく、同一入力と呼出順・副作用の検証である。削減対象はロビー生成1回につき重複PMREM生成1回で、常時のゲームFPSを改善する項目ではない。

**実装後の確認**：ロビー初回表示の照明・濡れた床・衣服の反射、チーム色変更後の色の反映、退出後の再入場。初期のライト/演出の `update(0, 0)` を保持すること。

## 検証ファイル

- [再現プローブ](./inkwave-no-quality-loss-probe-2026-09-29.mjs)
- [実行結果JSON](./inkwave-no-quality-loss-evidence-2026-09-29.json)

リポジトリルートで実行：

```sh
node reports/inkwave-no-quality-loss-probe-2026-09-29.mjs
```

Node 24.19.0で全assert通過。実際のソースのメソッド本体と同梱Three.jsを使用し、検証対象7ファイルのSHA-256をJSONへ記録した。GL操作・PMREM描画は模擬で、実端末のフレーム時間、発熱、消費電力、GPUメモリ実量、スクリーンショット差分は測定していない。

対応は **Q01 → Q03 → Q02** を推奨する。最初の2件は変更範囲が小さく、Q02は同値性の条件が増えるため最後に独立して入れると確認しやすい。
