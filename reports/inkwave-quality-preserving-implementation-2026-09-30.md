# INKWAVE 無劣化の処理改善：実装・追加監査結果

- 日付：2026-09-30（日本時間）
- 対象：`rhgrive3/actions/inkwave-public`
- 方針：画質、解像度、演出数、入力、判定、操作感、見えるタイミングを下げない。
- 状態：Q07〜Q11をmainへ個別に反映済み。後述の再現試験と構文検査を通過。

## 反映した5件

| ID | 変更と対象 | 得られた結果（再現fixture） |
|---|---|---|
| Q07 | [`fx/fx.js`](../inkwave-public/src/fx/fx.js)：表示数0の対戦FX属性を転送要求しない | 最初の空600フレームでbufferSubData 12,000→0回。再出現を含む1,800フレームで36,000→3,417回、2,164,432→1,643,104 bytes。全6プールの表示対象バイト一致。 |
| Q08 | [`game/nav.js`](../inkwave-public/src/game/nav.js)：障害物判定の8方向を一度だけ計算 | ベース4マップで各18万〜24万回のsin/cos再計算を構築中0回へ。モジュール初期化で16回だけ計算。追加コライダーを含む計8ケースの判定列・グラフ・256経路が一致。 |
| Q09 | [`fx/fx.js`](../inkwave-public/src/fx/fx.js)：カメラのworld行列を1更新で使う | 2,400フレームでカメラ行列更新／逆行列計算が各4,800→2,400回。位置・向き・行列・関連uniformが一致。 |
| Q10 | [`fx/screenfx.js`](../inkwave-public/src/fx/screenfx.js)：レンズインクを表示個数ぶんだけ転送 | 1,200フレーム、502描画フレームの属性転送が3,534,080→558,528 bytes。全状態・CPU配列・有効なGPUバイト・描画回数が一致。 |
| Q11 | [`boss/bossModelFx.js`](../inkwave-public/src/boss/bossModelFx.js)：ボスのインク・蒸気・蒸気seedの有効範囲だけ転送。終了時にInstancedMesh本体を解放 | 900フレームでlow 4,020,832→1,043,060 bytes、high 11,286,080→2,603,560 bytes。全状態・CPU配列・有効なGPUバイトが一致。終了時の本体disposeイベント0→1回。 |

Q10は220スプライト分のバッファを保持したまま、現在表示する先頭`n`個だけを更新する。0個のときもレンダーターゲットの消去経路は維持。Q11は蒸気に寿命切れの穴があるため、「生存個数」ではなく既存の描画上限`this.ns`を転送範囲に使った。再利用したseed属性も同じ範囲を更新する。いずれも初回の全バッファ確保と演出の生成・寿命計算は変えていない。

Q07〜Q09は[元の監査レポート](inkwave-extra-cpu-upload-audit-2026-09-30.md)と[修正後の比較結果](inkwave-extra-cpu-upload-postfix-evidence-2026-09-30.json)、Q10は[検証コード](inkwave-lens-live-range-probe-2026-09-30.mjs)・[証拠](inkwave-lens-live-range-evidence-2026-09-30.json)、Q11は[検証コード](inkwave-boss-fx-range-probe-2026-09-30.mjs)・[証拠](inkwave-boss-fx-range-evidence-2026-09-30.json)を参照。

## 調査を広げた範囲と止めた理由

前回までの監査残件を最新mainと照合し、描画・対戦更新・経路生成・ミニマップ・レンズ演出・ボス演出・HUD・物理・シャドウキャッシュ・音声・ステージ切替の主要経路を見た。`needsUpdate`を立てるコードの一覧から、描画数0と有効範囲の取り残しも追跡した。ロビーと投擲弾の空転送は既に修正されていたため重複計上していない。

次の案は、今回の「デメリットなし」を満たすと示せなかったため反映していない。

- ミニマップOFF時の事前生成を延期する：試合開始の作業は減るが、ONへ切り替えるフレームへ重さを移す。
- HUDのスナップショット配列・オブジェクトを常時再利用する：保存する消費側や将来の参照に影響し得る。現状は各フレームの小さな割当にとどまる。
- 音声補間、遮蔽判定、ボット判断、シャドウ・反射の更新頻度を下げる：音・判定・画に影響する可能性がある。
- ステージ表示外のアニメーションを停止する：画面へ戻した時点の状態と時刻を保持する追加設計が必要。
- 既に有効なペイントのdirty描画、投擲予測キャッシュ、ロビー終了時のGPU解放を再提案すること：追加の改善にならない。

対象の主要経路では、**出力を保持する条件と実際の削減効果を両方確認できる追加候補はここで尽きた**。全環境・将来の変更まで性能改善が存在しないことを証明する意味ではない。

## 検証と限界

リポジトリルートで以下を実行した。

```sh
node reports/inkwave-extra-cpu-upload-probe-2026-09-30.mjs --postfix
node reports/inkwave-lens-live-range-probe-2026-09-30.mjs
node reports/inkwave-boss-fx-range-probe-2026-09-30.mjs
node --check inkwave-public/src/fx/fx.js
node --check inkwave-public/src/game/nav.js
node --check inkwave-public/src/fx/screenfx.js
node --check inkwave-public/src/boss/bossModelFx.js
```

検証はNode v24.19.0と同梱Three.jsの実装を使用。bufferSubDataはバイトを保持する模擬GLで追跡し、描画対象のデータが元版と一致することを確認した。ブラウザ実描画・スマホ実機・GPU時間・FPS・電池消費は測定していない。転送量やJS呼出数の削減をゲーム全体のFPS改善率として扱わない。画質や表示内容に手を加える変更は含めていない。
