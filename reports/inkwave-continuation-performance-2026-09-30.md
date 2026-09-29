# INKWAVE 継続監査：入力・通信・毎フレーム処理

- 日付：2026-09-30（日本時間）
- 対象：`rhgrive3/actions/inkwave-public`
- 継続元：[Q07〜Q11の実装結果](inkwave-quality-preserving-implementation-2026-09-30.md)
- 条件：画質、演出、入力感度、補間遅延、更新頻度を下げず、同じ出力へ至る不要な作業を除く。
- 結果：Q12〜Q18の追加7件をmainへ反映。コード、再現用probe、証拠JSONを段階ごとに保存した。

## 第1回の反映：Q12〜Q14

| ID | 修正 | 確認した効果と出力 |
|---|---|---|
| Q12 | [`core/mobile.js`](../inkwave-public/src/core/mobile.js)：使っていない`getCoalescedEvents()`取得を削除 | 照準の移動処理は既存の`clientX/Y`差分をそのまま使用。取得値`evs`は`void evs`以外で使われていなかった。ブラウザに依頼して捨てていた連続イベント一覧の生成を省く。 |
| Q13 | [`core/gyro.js`](../inkwave-public/src/core/gyro.js)：rotationRate配列の再利用、校正用2配列の除去、画面回転のsin/cosと感度gainを入力値ごとに保持 | 2,500サンプルごとの6ケースで内部状態・consumeしたyaw/pitchが一致。各ケースの感度換算2,503→11回、sin/cos各10,003→7,505回。motionのあるケースのrate配列2,500→3個。校正配列120〜1,598→0個。 |
| Q14 | [`net/netmatch.js`](../inkwave-public/src/net/netmatch.js)：受信統計の百分位に相手ごとの作業配列を再利用 | 7相手・6,000フレーム・13,995受信で一時配列27,990→0個。相手ごとに最大60要素の作業配列を1つ保持。遅延・再生速度・補間/外挿・テレポート後のactorサンプル・イベント待ち列が毎フレーム一致。 |

Q12は取得結果が元々捨てられていたことをコードの参照関係で確認し、構文検査した。イベントの合成方法や送信間隔は変更していない。

Q13はori、校正不成立、rrA/rrBのdegree/radianの6ケースを使用。画面の0/90/180/270度回転、感度・反転変更、resync、stop/start、重複/不完全サンプルを含む。設定を直接変更した場合もキーの比較により再計算する。数式の順序は維持した。保持するキャッシュは1インスタンスあたり数個の数値だけで、センサーの受信数・フィルタ・積分・感度曲線は変えていない。

Q14では時間順のlate/gap配列を並べ替えず、作業配列にコピーしてから従来と同じ数値順でsortする。ギャップの上下限、百分位の選択位置、60サンプルの窓、遅延の計算式は同じ。空配列・重複・非有限値などの百分位20ケースも一致。作業配列は最大7×60個の数値参照をNetMatch内に保持し、試合終了後はそのインスタンスとともに回収される。

## 第2回の反映：Q15〜Q17

| ID | 修正 | 確認した効果と出力 |
|---|---|---|
| Q15 | [`net/netmatch.js`](../inkwave-public/src/net/netmatch.js)：リモート音声のwant関数と3コールバックをクラスメソッドと直接呼出へ移す | 7actor・3,600フレームでソース上の一時関数生成99,200→0回。近傍判定23,333回、開始458回、設定13,124回、停止458回と全引数・順序・ハンドル状態が一致。 |
| Q16 | [`audio/music.js`](../inkwave-public/src/audio/music.js)：左右の残響で同じ包絡線・減衰係数を1回計算 | 実際の初期化条件48kHz・1.5秒でexp 285,696→142,848回。7ケースの左右Float32データが全バイト一致。各耳の乱数列・フィルタ状態・初期反射は維持。 |
| Q17 | [`audio/music.js`](../inkwave-public/src/audio/music.js)：strokeWaveの包絡線を4倍音ずつ共有して計算 | 初回生成のexp 81,920→20,480回。sin/cos各81,920回は維持。sharp 7/9（実際の使用値）を含む10ケースでFloat32係数とキャッシュの同一性が一致。生成する配列は計328 bytesで同じ。 |

Q15は相手の武器切替、生死・距離・所有権の変化、音声システム不在、ハンドル取得不成立を含めた。音量、ピッチ、位置、停止fadeとその計算タイミングは同じ。

Q16は2つの独立した乱数生成器を残し、サンプル時刻ごとに両耳を処理する。追加のサンプル配列は使わない。サンプルレート8〜96kHz、0長・preが長さ以上、任意のtap、文字列seedも確認した。

Q17は各倍音への加算順を従来と同じサンプル順に保ち、JS Numberのスカラーで蓄積してからFloat32へ格納する。4倍音ずつ処理して、従来と同じFloat32出力配列2本だけを生成する。最終版ではFloat64作業配列を使わない。キャッシュされる波形の長さ・係数・形式は同じで、再生中の処理を増やさない。

第2回の[比較コード](inkwave-audio-cpu-probe-2026-09-30.mjs)と[証拠JSON](inkwave-audio-cpu-evidence-2026-09-30.json)を保存。音声APIを記録する模擬ハンドル/コンテキストで検証しており、実際の再生や聴感測定はしていない。

```sh
node reports/inkwave-audio-cpu-probe-2026-09-30.mjs
node --check inkwave-public/src/audio/music.js
node --check inkwave-public/src/net/netmatch.js
```

## 第3回の反映：Q18

[`game/weapons.js`](../inkwave-public/src/game/weapons.js)の投擲ガイドは64頂点ぶんの配列を保持し、近くの壁・床に着いた場合は先頭の一部だけ描画する。位置とlineDistanceの転送範囲をその描画頂点数に合わせた。rangeオブジェクトは属性ごとに再利用する。

1,800フレーム、表示1,548フレーム・非表示252フレーム、頂点数2/3/10/33/45/64の比較で、転送438,272→155,216 bytes（約64.6%減）。転送回数は856回で同じ。判定18,241回、CPU配列全体、属性version列、着地点・リング・色・表示状態、有効なGPUバイトが一致。予測計算のキャッシュと64頂点ぶんのlineDistance計算は変更していない。

[比較コード](inkwave-arc-range-probe-2026-09-30.mjs)と[証拠JSON](inkwave-arc-range-evidence-2026-09-30.json)を保存。壁/床の衝突回答を制御し、実際のupdateArcとthrowVelocity、同梱Three.jsの属性アップローダを使用した。

```sh
node reports/inkwave-arc-range-probe-2026-09-30.mjs
node --check inkwave-public/src/game/weapons.js
node reports/inkwave-no-quality-loss-probe-2026-09-29.mjs
node reports/inkwave-mobile-followup-probe-2026-09-29.mjs
```

既存のQ02/F04等のprobeも通過。古いF04のfixtureには、現在のProjectilesコンストラクタに合わせてlineDistance属性の初期化を補った。過去の証拠JSONは当時の記録として保持した。

## 再現方法・測定の範囲

[比較用コード](inkwave-input-network-probe-2026-09-30.mjs)と[証拠JSON](inkwave-input-network-evidence-2026-09-30.json)を保存した。

```sh
node reports/inkwave-input-network-probe-2026-09-30.mjs
node --check inkwave-public/src/core/mobile.js
node --check inkwave-public/src/core/gyro.js
node --check inkwave-public/src/net/netmatch.js
```

元版は`d5d54d1d37274dfa82467b37b9b8009719783ed3`の該当ファイルを使用し、継続開始時main `43539687b87070c3a950ce55b18a679423c5413f`と同じblobであることを検査。Node子プロセスが制限される環境では、同コミットのファイルをディレクトリ構造ごと書き出し、`INKWAVE_BASELINE_DIR`に指定できる。今回の実行もこの経路を用いた。

実際のGyro/NetMatchクラスをNode VMで読み、合成したセンサー・受信イベントで比較。Three.jsはリポジトリ同梱版を使用。割当数は除去対象のソース上の配列生成数であり、エンジン内部の全割当やGC時間を測った値ではない。実機ブラウザ、スマホのFPS、電池、実WebSocketの通信時間は未測定。スマホ全体での改善率や、全端末で副作用がないことを保証する数値ではない。

## 追加で確認した範囲

通信の送受信、pad/touch/gyro、音声の初期化と遠隔actor更新、SwimWake、CameraRig、HUDのタンク/ビーコン/ボス表示、メニューのcursor/測定、BossNav/Brain、Physics、shadowcacheも確認した。

- DOM寸法読みをResizeObserverへ移す：回転・CSS変更・初回表示に1フレーム遅れが生じないことを実ブラウザで確認できていないため見送った。
- HUDの公開スナップショットを全面再利用する：保持される参照の扱いを変えるため、従来どおりの値渡しを保つ。
- ボスの判断間隔、通信/音声設定の頻度、画面外の演出を減らす：表示・操作・音・判定へ影響し得るため反映しない。
- CameraRigの定数FOV換算など、残る小さな式のキャッシュ：今回の7件に比べ削減は小さく、効果と追加の状態管理を実機で評価できていないため追加しなかった。

「他に改善がない」「全端末でデメリット0」を証明したものではない。今回追加した範囲では、上の7件について出力の維持と作業削減を確認した。利用枠の残量は取得できないため、枠を使い切ったという判定も行っていない。
