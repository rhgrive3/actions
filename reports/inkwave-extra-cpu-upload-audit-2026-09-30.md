# INKWAVE 追加監査：画質・操作・演出を落とさない処理削減

- 日付：2026-09-30（日本時間）
- 対象：`rhgrive3/actions` / `inkwave-public`
- 調査基準：[8b5954be5eb0eb66da0a240a5b23061bc116f642](https://github.com/rhgrive3/actions/commit/8b5954be5eb0eb66da0a240a5b23061bc116f642)
- 状態：**追加3件を検証。今回の保存物はレポート・証拠・検証コードで、ゲーム本体への修正は未実装。**
- 前回のQ04/Q05/Q06は、この基準コミットでは反映済み。既存対策を再度提案したものではない。

## 結果

| 優先 | ID | 改善点 | 確認できた削減 | 効果が出る場面 |
|---|---|---|---|---|
| 1 | Q07 | 対戦FXの表示数0の属性転送要求を止める | 空600フレームで12,000回の更新転送呼出→0回 | 対戦画面で各エフェクトプールが空の間 |
| 2 | Q08 | NavGraphの8方向のsin/cosを一度だけ計算 | ベース4マップで1構築あたり180,422〜242,308回→0回。モジュール初期化時に別途16回 | ワールド／経路グラフ生成時 |
| 3 | Q09 | FX内のカメラ行列更新を1回にする | 2,400更新で行列更新・逆行列計算が各4,800回→2,400回 | FX更新ごと。単独の効果は小さい |

いずれも描画解像度、影、反射、エフェクト数、更新頻度、入力、物理精度、ボットの判断頻度を下げない提案。Q07/Q09は既存データの利用方法を変える。Q08は固定方向の数値16個を保持する小さな表を追加する。

表の転送回数は同梱Three.jsの実際のアップローダーを、バイト保持型の模擬GLで実行して数えたもの。**スマートフォン実機のFPS・GPU時間・消費電力は未測定**。Q07の呼出削減率を、そのままゲーム全体の高速化率と解釈しない。

## Q07：対戦FXの空プールに残る転送要求

### 根拠

[`fx.js` L645–654](https://github.com/rhgrive3/actions/blob/8b5954be5eb0eb66da0a240a5b23061bc116f642/inkwave-public/src/fx/fx.js#L645-L654) の `markUpdated(geo, count)` は、count=0でも `Math.max(1, count)` により1インスタンス分の更新範囲を設定し、全動的属性の `needsUpdate` を立てる。

呼出元は液滴、煙、光、リング、球状演出、ビームの6プール。動的属性は合計20本あり、各更新関数は先に `instanceCount` を最新値へ設定している。全て空のフレームでも20本の更新要求が出る。常時表示するmotesは別系統で、今回の対象ではない。

これらのメッシュは `frustumCulled=false`。同梱Three.jsの `WebGLObjects.update` はgeometryの属性更新を行い、描画時のインスタンス数0によるスキップはそれより後にある。したがって「描画されないから属性転送も自動で消える」とは扱えない。

- [Three.jsのgeometry更新 L4616–4627](https://github.com/rhgrive3/actions/blob/8b5954be5eb0eb66da0a240a5b23061bc116f642/inkwave-public/vendor/three/build/three.module.js#L4616-L4627)
- [Three.jsの属性アップロード L136–212](https://github.com/rhgrive3/actions/blob/8b5954be5eb0eb66da0a240a5b23061bc116f642/inkwave-public/vendor/three/build/three.module.js#L136-L212)

### 最小の修正方針

```js
function markUpdated(geo, count) {
  if (count === 0) return;
  // 以降は従来どおり
}
```

**プールのupdate自体は止めない。** 寿命、遅延演出、即時マーカーの消去、乱数、CPU配列、`instanceCount=0`の反映は従来どおり行う。停止するのは最後の転送要求だけ。再出現した同フレームではcount>0になり、従来の全live範囲を再び更新する。`clear()`で過去の更新要求を無理に消す必要もない。

### 検証結果

実際のFXクラスを元版と上記1行追加版で別々に実行し、同じ乱数列を与えた。

| ケース | 元版 | 提案版 |
|---|---:|---:|
| 最初の空600フレーム：bufferSubData呼出 | 12,000 | 0 |
| 同：更新転送量 | 192,000 bytes | 0 bytes |
| 空→爆発／出現／マーカー／消去／再出現を含む1,800フレーム：呼出 | 36,000 | 3,417 |
| 同：更新転送量 | 2,164,432 bytes | 1,643,104 bytes |
| 初回bufferData呼出 | 20 | 20 |

全6プールを実際に発生させ、0→有効の遷移13回を含めた。全フレームでCPUの動的属性配列全体・stats・乱数状態が一致。描画に使うバッファの有効部分も3,417件の比較で完全一致した。遅延演出と水面着弾による派生演出もこの実クラスの経路で進めている。

60fpsかつ全6プールが空なら、毎秒1,200回・19,200 bytesの更新呼出が対象になる。既存のlive範囲更新は機能しており、**大量の全容量転送をしている問題ではない**。主眼は少量転送を細かく発行する無駄の削減。初回バッファ確保、描画リスト走査、メッシュ管理のコストはこの修正では変わらない。

前回Q06は `showcase.js` のロビー演出のinstanceMatrix更新。今回は `fx/fx.js` の対戦用InstancedBufferGeometryの20属性であり、別実装の取り残し。

## Q08：経路グラフの固定8方向を使い回す

### 根拠と変更範囲

[`nav.js` L90–104](https://github.com/rhgrive3/actions/blob/8b5954be5eb0eb66da0a240a5b23061bc116f642/inkwave-public/src/game/nav.js#L90-L104) の `_clear` は、候補地点ごとに3高さ×8方向の障害物判定を行う。方向角は常に同じだが、各判定でsin/cosを計算し直している。

モジュール内で現在と同じ式から8方向を生成し、参照する。

```js
const RING = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
});
// _clear内。rは現在どおり呼出ごとにPLAYER.radiusから計算する。
if (L.pointInside(_p.set(
  x + RING[k][0] * r, y + h, z + RING[k][1] * r
), 0)) return false;
```

表は通常のJavaScript Numberで保持する。Float32化、角度式の変更、0や1への丸め、判定順序の変更をしない。半径は表へ焼き込まない。同じプロジェクトの `physics.js` にも固定方向を一度生成する実装がある。

### 検証結果

実際のLevelとNavGraphで、4マップのベースレイアウトを構築して比較した。

| マップ | ノード数 | 有向辺数 | 元版のsin+cos呼出 | 提案版の構築中呼出 |
|---|---:|---:|---:|---:|
| tidewater | 4,250 | 29,212 | 205,494 | 0 |
| kelpline | 4,740 | 33,406 | 229,066 | 0 |
| halyard | 3,698 | 28,202 | 180,422 | 0 |
| cargo | 4,950 | 35,542 | 242,308 | 0 |

これとは別に、軸平行の箱と37度回転したrail判定の追加コライダーを与えた4ケースも比較。計8ケースで以下が一致した。

- 障害物判定へ渡る全座標・margin・戻り値の順序付きSHA-256
- ノード、辺、コスト、辺種別、cells、valid、validIds
- 各ケース32件、合計256件のチーム別経路探索結果

実際のPropKitが生成する全装飾コライダーはこのfixtureに含めていない。数値はベースレイアウト／明示した追加形状の結果で、ゲームの最終配置におけるノード数の測定ではない。

モジュール読込時にsin/cosを計16回だけ実行し、16数値と配列の管理領域を保持する。数値部分は通常の64bit値換算で128 bytes相当、配列を含む実メモリ量はエンジン依存。品質・機能との引き換えはなく、追加保持量は小さい。ただし**主な対象はステージ準備であり、毎フレームのA*探索やFPSがこの割合で速くなるわけではない**。衝突判定回数自体も減らしていない。

## Q09：カメラ行列の二重更新をなくす

[`fx.js` L2214–2222](https://github.com/rhgrive3/actions/blob/8b5954be5eb0eb66da0a240a5b23061bc116f642/inkwave-public/src/fx/fx.js#L2214-L2222) は `getWorldPosition` と `getWorldDirection` を続けて呼ぶ。

同梱Three.jsでは双方が `updateWorldMatrix(true, false)` を呼ぶ。Cameraの実装はその都度行列を分解し、`matrixWorldInverse` も計算する。2呼出の間にカメラの姿勢変更はない。

- [位置・方向取得の実装](https://github.com/rhgrive3/actions/blob/8b5954be5eb0eb66da0a240a5b23061bc116f642/inkwave-public/vendor/three/build/three.core.js#L12887-L12941)
- [Cameraの行列更新](https://github.com/rhgrive3/actions/blob/8b5954be5eb0eb66da0a240a5b23061bc116f642/inkwave-public/vendor/three/build/three.core.js#L46723-L46741)

既存の方向取得による更新を利用し、その直後に同じ行列から位置を読む。

```js
camera.getWorldDirection(this._camDir);
this._camPos.setFromMatrixPosition(camera.matrixWorld);
```

カメラ更新全体を別フレームへキャッシュする提案ではない。現在フレームの行列更新1回を確実に残す。逆行列を独自実装に置き換える必要もない。

実際の `FX.update` を抽出し、関係しない粒子更新先だけstubにしたfixtureで確認。ゲームと同じPerspectiveCameraを使用し、2,400フレームの位置・回転変更、親Groupの移動・回転・非一様スケール、matrixAutoUpdate切替を与えた。カメラ位置・方向、照明方向uniform、motesのカメラuniform、world行列とinverse行列が完全一致。行列更新と逆行列計算は各4,800→2,400回。

60fpsなら各60回/秒の重複計算を省けるが、単独の効果は小さい。ゲームが作る標準PerspectiveCameraを前提とする。将来、位置取得などに副作用を持つ独自Cameraへ変えた場合は、その契約に合わせて再確認する。

## 今回採用しなかった候補

- ミニマップOFF中の初期構築を遅らせる：開始時の処理は減るが、ONへ切り替えた瞬間に構築時間が移る可能性がある。今回の「デメリットなし」候補には入れない。
- 音声パラメーター更新の間引き：音の補間や追従まで同じとする検証が不足しているため採用しない。
- 画質、影、反射、粒子数、描画頻度の引き下げ：対象外。

## 再現と検証の範囲

- [検証コード](inkwave-extra-cpu-upload-probe-2026-09-30.mjs)
- [数値・ソースhash・比較結果](inkwave-extra-cpu-upload-evidence-2026-09-30.json)

リポジトリルートで実行：

```sh
node reports/inkwave-extra-cpu-upload-probe-2026-09-30.mjs
```

Node v24.19.0で成功。検証コードは本体を編集せず、読み込んだ実ソースの監査用コピーへ最小変更を与えて元版と比較する。出力不一致ならassertで停止する。対象コードが更新済みの場合は置換境界のassertが止まるため、修正後検証用へ更新する必要がある。

WebGLAttributesは同梱実装を使うが、ブラウザ・実GPUによる描画比較やスマートフォン計測ではない。Q07はCPUの生成結果と転送済みの有効バイトの一致、Q08は判定列とグラフと経路の一致、Q09はカメラ数値とuniformの一致を確認した。これらの範囲で出力を保ちながら削れる処理を示している。
