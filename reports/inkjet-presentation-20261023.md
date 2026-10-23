# 2026-10-23 ジェットパック：噴流と装置の接続

担当範囲は Inkjet の表示のみ。基準は `a4e81347906c0d60ceef76a69f476261bf8d3f86`、tree `34236683e6776aac9d8b1d4ae0b8a1b31d3f2df2`。専用ローカルブランチ `inkwave/inkjet-visual-review-20261023` で作業し、main、比較ブランチ、PR1844 head は更新していない。

今回の成果は INKWAVE 内で再現した噴流の接続ずれの修正。本家とのフレーム単位の同等性は未認定。

## 根拠と変更範囲

- 親から受けた参照情報は decoded 300 枚／録画 30 fps（ヘッダ306は実デコード数ではない）。参照のゲーム版、ブキ、ギア、入力時刻、native FPS は不明。本担当は参照画像を直接閲覧していない。過去に拒否された GameWith HTTPS 取得、直接動画 URL、別経路での取得は一切試していない。
- 本担当が実際に見たのは、指定基準と候補の emitted 本番ビルドを Chromium 154.0.8037.57／WebGL2／ANGLE SwiftShader で描いた通常ゲーム画面と検査表示。通常画面は Tidewater の native match、入力、カメラ、HUD、Physics、Projectiles、PaintSystem を使う。検査表示は別の単純な床、近接カメラ、native Actor／Character／Physics／FX を使い、paint はスタブである。両者を区別する。
- `DIRECTORS.inkjet.frame()` は噴流始点を actor 位置と aimYaw から算出していた。一方、実際の装置は胸ボーンと体の向きに追従する。方向転換中、ノズルの実メッシュ上の開口中心と噴流始点が最大約0.59 WUずれ、検査画像では装置から離れた噴流を確認できた。
- `patches/splatoon3/runtime/special-vfx.mjs` の **`DIRECTORS.inkjet.frame()` 内5行のみ**追加。描画中の `spInkjetPack` の world matrix から既存モデルのノズル端を変換する。モデルが利用できない actor は従来の位置計算を維持する。装置の参照は毎回取得し、前の発動／死亡の装置をキャッシュしない。
- 噴流の長さ上限、幅、粒数、寿命、予算、シェーダー、材質、モデルは編集していない。始点の高さが変わるため、床までの距離で clamp される発動直後の表示長は新しい始点に従う。攻撃、物理、判定、通信、入力／操作ロック、発動・帰還時刻を変更していない。

## native 状態と実画面

次表は候補の通常画面を60 Hzの simulation stepで進めた記録。録画フレームや本家のフレーム値ではない。発動入力を入れた stepを1としている。

| simulation step | native 状態 | 実画面／値 |
| --- | --- | --- |
| 1 | Inkjet、t=0 | パックと砲が装着される |
| 46 | Inkjet、t=0.75 | 飛行、足の高さ4.915 WU |
| 62 | Inkjet、t=1.0167 | 実弾が生成済み。shot markに従う砲の反動を確認 |
| 74 | Inkjet、t=1.2167 | 砲の保持位置への回復 |
| 450 | Inkjet、t=7.4833 | duration直前、足の高さ5 WU |
| 451 | Inkjetなし、superJump charge、t=0 | パック・砲・持続噴流は解除 |
| 510 | superJump charge、t=0.9833 | イカ姿、帰還表示、足の高さ0 WU |
| 570 | superJump flight、t=0.2833 | 帰還飛行中。カメラも動く |
| 750 | special／superJumpなし | 発動地点へ着地、通常表示 |

帰還は既存 `returnToOrigin()` → native `superJump`。帰還動作が欠けているとは扱わない。charge中に位置が床へ移る挙動も既存 native 処理であり、今回変更していない。反動は `animateDevice()` の既存 shot mark によるものを観測し、曲線を調整していない。

## 検証

- 変更前固定 HEAD で `all-specials.test.mjs` を Node **22.23.4** で単独実行：**83/83**、62.846秒。事前の cgroup memory.max は17179869184 bytes、他の重いテストと並列にしていない。heap／timeout等の制限変更なし。この共有回帰は一度のみ。親の最終合成 HEAD の CI とは別。
- 担当回帰6ファイル：source **55/55**、`INKWAVE_BUILT_SITE` でfixtureの読込先を候補の minified emitted モジュールにした同じ回帰 **55/55**（fsでレシピを直読するcadence等の検査はsourceのまま）。対象は `inkjet-vfx-cadence`、`inkjet-vfx-pool-budget`、`inkjet-aim`、`inkjet-paint-wire`、`special-vfx`、`special-models`。`special-vfx` はゲーム状態・paint呼出し・イベント・乱数の on/off 比較を含む。
- 本番ビルド、`npm run check:patches`、構文検査、`git diff --check` が通過。
- 新規 `scripts/check-inkwave-inkjet-presentation-browser.mjs` は実際のメッシュの開口頂点から中心を測り、effect buffer の始点と比較する。30／60／120 Hz、4方向、移動、実発射、イカ降下、停止dt=0、時間終了→帰還→着地、再利用、native resetによる解除、再装備・再利用、死亡を確認。resetは保存済みloadoutを再適用するので、検査用kitはその後再装備する。
- 修正前の誤差範囲は30Hz `0.144–0.566`、60Hz `0.144–0.594`、120Hz `0.143–0.550` WU。修正後は全て `0.004960 ± 0.000001` WU（開口面の内側とノズル端の差）。
- 同じseedの before／afterで native発射レコード、全Inkjetイベント、位置、stats、反動、帰還状態が完全一致。director error／page error は0。
- negative control：5行を実際に戻して本番を再ビルドし、baselineと同一contentHashを確認。候補の合格条件で **12方向ケースが失敗**、他のライフサイクル検査は成功。候補sourceはSHA256で元通りの復元を確認した。
- 実装は新規mesh／poolを作らず、既存の変換とbufferを使う。物理GPUでの負荷・多人数時のGPU時間は未計測。SwiftShader検査を実機FPSの測定とは扱わない。

## 証拠と再現

証拠はローカル `/workspace/inkjet-evidence/`。任天堂の映像・画像は含めていない。通常画面の色・髪・bot等は通常の初期化で変わるため、通常画面のbefore／afterはpixel差分用の対ではない。同じseed・cameraの検査表示を接続比較に使う。

- `baseline-all-specials.log`：exact HEAD、tree、メモリ、Node版、83件のTAP。
- `regression-source.log`／`regression-emitted.log`：55件ずつのTAP。
- `baseline-inspection/`／`candidate-inspection/`：`inspection-hover-back.png`、`inspection-flight-shot.png`、`inspection-pack-without-fx.png` と状態／発射／イベントのJSON。
- `baseline-screen/`／`candidate-screen/`：通常ゲーム画面PNGと`normal-state.json`。baselineの古い帰還画像名には位相名のずれがあるため、JSONを正とする。候補は実状態に合わせて命名。
- `negative-restored/`／`negative-restored.log`：元実装を戻した負例。
- `summary.json`：正確なcontentHash、誤差、native記録の一致結果。`normal-screen-capture.mjs` は通常画面の再現用検査コード。

検査再現：

```sh
node scripts/build-inkwave.mjs inkwave-public /tmp/inkjet-site
node scripts/check-inkwave-inkjet-presentation-browser.mjs --site /tmp/inkjet-site --evidence-dir /tmp/inkjet-inspection
```

baseline contentHash：`e1c18a72dc8a4e358944f8a8dec59f0d4e178c2d2da9881c8af2d2946e380ab2`。
candidate contentHash：`406e1f3cc48d6a873d94d7fe66d1931f6cb95782ae8342614051ad1145b654ac`。

## 親の参照補完が必要な範囲

本担当は本家の連続画像を見ていないため、今回の修正を「本家比較済み」「モーション調整完了」とは称さない。次の録画フレーム群があれば、追加の曲線・噴流調整が必要かを判断できる。

1. 飛行安定後の連続10枚：噴流の長さ、太さ、揺れ、脚と装置の関係を比較する。
2. 初回の砲口閃光の2枚前〜8枚後：砲・体の反動方向と回復を確認する。nativeな発射タイミングとは別に録画時刻を記録する。
3. 装置消滅の2枚前〜帰還着地：カメラ移動を背景で補正して、charge／flightと体の姿勢を区別する。

絶対の録画frame番号は未取得なので推測で埋めない。参照の版・gear・入力・native FPSも引き続き未確認。拒否された参照取得の迂回や公開はしていない。

## 同日追補：ノズル座標の所有者・所属・可視性

独立レビューの指摘を実 Character／FX fixture で再現した。`A.character` が生存中のBの実Inkjet Characterを参照すると、Aの噴流がBの位置（x約99.93）へ出た。holderを外すとローカル座標y約-0.1874を使い、model／holder／祖先が非表示でもモデル座標を読むことも再現した。いずれも不正な参照・階層・可視性を明示的に作る負例であり、通常のゲームプレイでの発生経路を立証したものではない。

- `5d4516a69b6fff18a2798c90a2a26632c7494aa6`を親として保護し、`DIRECTORS.inkjet.frame()`のモデル取得に限定した防御条件を追加。`ch.actor===a`、現在の装備モデルがそのholderに接続、正しいCharacter rootへつながる階層、モデルから祖先までの可視性を検査する。条件外は既存actor-space fallback。装備参照はキャッシュしない。他スペシャル、モデル、材質、寿命、alpha、ゲーム処理、通信に変更なし。
- 新規 `patches/splatoon3/tests/inkjet-nozzle-owner.test.mjs` はlocal（isLocal=true、remote=false）／remote（isLocal=false、remote=true）それぞれで、foreign alias、detached holder、hidden model、hidden holder、hidden ancestorの10件。条件を戻した後の正常ノズル、native非表示→再表示の装備再生成、死亡による解除も確認する。CPU fixtureの物理はスタブで、Actor／Character／装置／FXは実モジュールを使う。通常の移動・帰還は別の実Physicsブラウザ検査で確認する。
- Node22.23.4で既存55件＋新規10件：source **65/65**、emitted fixture **65/65**（レシピのfs直読検査はsourceのまま）。保存済み5d4516のemittedビルドを読む負例は **0/10成功、10件失敗**。所有者一致だけの中間版はforeignの2件成功、detached／hiddenの8件失敗。
- Chromium154／WebGL2／SwiftShaderで既存ブラウザ検査を再実行し、30/60/120Hzの回転・移動・発射・停止・イカ降下・時間終了→帰還→着地・reset・再利用・死亡が通過。通常ケースの誤差／位置／反動／stats、全native発射レコード、全Inkjetイベントは5d4516と一致。最大ノズル誤差 **0.004960240809 WU**。全FX合成画像のpixel一致は主張しない。
- 本番ビルド、quick patch check、構文、diff checkが通過。最終contentHashは `6687f87a7a1edb2146b537435cc89776ed244e94705a723af7aa1eacc7b04bba`。追加証拠は `/workspace/inkjet-owner-evidence/`。既に完走した固定a4e8134の共有83件は再実行していない。本家フレーム比較の未確認範囲は上記から変わらない。
