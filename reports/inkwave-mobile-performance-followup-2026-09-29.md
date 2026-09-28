# INKWAVE スマホ向け追加処理改善レポート（第2回）

- 調査日: **2026-09-29 JST**
- 対象: **rhgrive3/actions / main / inkwave-public/**
- 修正後の調査基準: **b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd**
- 比較元: 前回調査の完了時点 `43acee04d9c279488ad1fc75efab87730a4fb40f`
- 成果物: 本レポート、追加再現スクリプト、結果JSON。ゲーム実装は変更していない。
- **新しい改善候補5件＋前回最適化の境界条件1件を確認。実機FPS・GPU時間・電池消費・実GPUメモリ量は未測定。**

## 前回の修正はどうなったか

修正コミット `f746d05`、`7bcbb91`、`7e1f299` と現行コードを読み、既存プローブを再実行した。以前の問題をそのまま未修正扱いにはしていない。

| 項目 | 今回の確認 |
|---|---|
| モバイルBloom/ScreenFX | effectiveQuality経由。タッチ端末でBloom false、粒子係数0.7上限、Renderer/ScreenFXの参照を確認 |
| 動的解像度 | 30Hz相当→60Hz相当で1.0へ回復。持続的な30Hz相当入力では下限0.6。再低下後の回復も確認 |
| 無塗装の乾燥描画 | 60Hz相当10秒で0回 |
| フレーム上限 | 60/75/90/120/144Hz入力でタッチautoは平均60回/秒、displayでは120回/秒を確認 |
| Boss依存分割 | ビルドのpreload探索は102→92モジュール、Boss関連0 |
| Composer・Decor・lightmap解放 | 解放処理の実装と呼出を確認。ただし旧プローブの一部はソース中の配線確認であり、実GPUメモリの横ばいまでは証明していない |
| ロビー・ミニマップ | 休止/間引き/dirty管理を確認。ミニマップの終了境界は下記F06で追加指摘 |

## 優先順位

P1は先に対応する候補、P2は処理時間を比較しながら対応する候補。番号は前回のIDと独立している。

| ID | 優先 | 追加所見 | 確認の強さ | 主な効果 |
|---|---|---|---|---|
| F01 | P1 | ボム・雲のmaterial解放と雲の音停止が不足 | 実メソッド＋Three.jsオブジェクトで解放/停止呼出を再現 | 連戦時の資源・残留音 |
| F02 | P1 | high→low変更が既存の影サイズ・FXに届かない | setter/照明生成メソッドと生成経路を確認 | 低品質へ下げた時の負荷 |
| F03 | P2 | 弾0個でもインスタンス3属性を毎フレーム更新 | 実メソッド＋同梱Three.jsで更新versionを再現 | CPU→GPU転送 |
| F04 | P2 | 照準固定でも投擲予測を全面再計算 | 実メソッドで照会数と属性再生成を再現 | 投擲ボタン保持中のCPU/GC |
| F05 | P2 | 水面反射はスマホでも毎フレーム別シーン描画 | ソース確認。GPU/CPU時間は未測定 | Marinaステージの描画負荷 |
| F06 | P1 | ミニマップの最後のボム/flashを消す合成が抜ける | updateメソッドで終了後の合成停止を再現 | 最適化後の表示正確性 |

## F01. ボム・雲を消しても個別materialが解放されない

**根拠:** [weapons.js L1001–1033](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/game/weapons.js#L1001-L1033) は通常ボム1個ごとにbody materialのcloneとcap materialを生成する。Storm投擲物にもcloneがあり、雲生成は [L1062–1092](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/game/weapons.js#L1062-L1092) でbase/top materialと音のループを作る。

削除側の [clear L577–588](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/game/weapons.js#L577-L588)、ボム消滅L1248–1293、雲の自然終了L1330はscene.removeを使い、これら個別materialのdisposeを呼ばない。雲の自然終了ではloop.stopを呼ぶが、**clearでは呼ばない**。試合切替等はmain.js L564、633、683からclearに到達する。

再現では、通常ボム20個を生成して都度clearすると、**40個のmaterialを生成、disposeイベント0回**。雲1個のclearでも**loop.stop 0回、material dispose 0回**。Sceneからは消えているので「画面から消えた＝資源まで解放済み」とは判断できない。これはAPI呼出の確認であり、40個分のGPU割当量を測ったものではない。

音声側 [audio.js L305–345](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/audio/audio.js#L305-L345) はループを保持し、stopで外す設計。上限による停止はあるため無限増殖とは言わないが、clear時に音が残り、他の音の枠を使う可能性がある。

**提案:** `_releaseBomb` / `_releaseCloud` のような共通の終了処理を作り、自然終了・水没・Storm化・試合clearの全経路で呼ぶ。個別materialはSet等で一度だけ解放し、雲のloopは停止する。共有bombGeo/bombCapGeo/cloudGeo、bombMatCacheの元material、既存のbeam poolは破棄しない。プール化するなら容量上限と再利用時の状態リセットを設ける。

**合格条件:** 投擲/自然終了/水没/試合終了を各20回。個別materialの生成・破棄が対応し、clear後にstorm_rainの再生ハンドルが残らない。実描画済みの状態でrenderer.infoの資源数も観察する。

## F02. 品質をlowに変えても、既存の影とFXは起動時の設定が残る

**根拠:** [main.js L384–407](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/main.js#L384-L407) の設定変更はRendererへ渡すが、既存G.envの影サイズやG.fxの粒子設定を更新しない。

Environment/FXはmain.js L136/L144で起動時に生成。[environment.js L1413](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/world/environment.js#L1413) にshadowSizeを保持し、L1485でsun.shadow.mapSizeに設定する。[fx.js L666–704](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/fx/fx.js#L666-L704) も係数q、maxChecks、各容量を初期化時に決める。

タッチhigh起動なら影2048・FX係数0.7。lowの定義は影1024・FX係数0.4だが、その場で変更しても既存インスタンスへ適用されない。制御fixtureでも実際の照明生成とsetterを呼び、Renderer更新1回に対してsun.shadow.mapSizeは2048のままという経路を確認した。**lowが何も効かないという意味ではなく、DPR等の即時反映と、既存の影/FXで適用範囲が異なる。**

**提案:** 品質変更時に各サブシステムへ実効値を渡す。影はターゲットの正しい再生成、shadow cameraのfit、ShadowCacheのinvalidateを一緒に行う。FXは既存容量を保持しても、生成係数・active上限・判定予算を即時変更できる設計にする。破壊的な再構築が必要な部分は安全な試合切替時に適用し、UIに反映時点を示す。

**合格条件:** 同一ステージでhigh→low→highと往復し、Rendererだけでなく実際の影RT寸法、G.fx.q、maxChecksを記録する。影2048→1024なら画素数は1/4だが、ゲーム全体の4倍高速化ではない。射撃・塗り・得点を変えず、意図しないエフェクト増殖や欠落も確認する。

## F03. 弾0個でも700個分の属性を更新対象にしている

**根拠:** MAX_BLOBS=700（weapons.js L387）。[生成 L537–549](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/game/weapons.js#L537-L549) ではfrustumCulled=falseで、[_draw L1409–1460](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/game/weapons.js#L1409-L1460) の末尾は数にかかわらずinstanceMatrix・instanceColor・blobShapeをneedsUpdateにする。更新範囲の指定はない。

弾リストを空にして600回呼ぶと、countは0のまま、**3属性すべてversionが600増加**した。700個分の総属性容量は **64,400 bytes**。同梱Three.jsの [three.module.js L148–151](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/vendor/three/build/three.module.js#L148-L151) はupdateRangesが空なら配列全体をbufferSubDataに渡す。更新要求が毎フレーム処理される場合、60fps換算で約**3.86 MB/s**が全量転送の対象になる。これはコードから計算したバッファ量で、実測のGPU帯域やFPSではない。

**提案:** 0個ならcount=0/visible=falseにして更新要求を出さない。再出現時に必ずvisibleを戻す。n>0なら各属性の `0..n*itemSize` だけを更新する。FX側は既に [fx.js L644–654](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/fx/fx.js#L644-L654) でlive範囲更新を実装しており、弾側へ同じ考え方を適用できる。

**合格条件:** 0→1→多数→0の遷移、影、色替えを確認。GPUバッファ更新の範囲がlive個数に比例し、0個の間は新しいversionが増えない。弾道・命中判定・弾の最大数は変更しない。

## F04. ボム予測線は照準が動かなくても最大126回の衝突照会

**根拠:** [weapons.js L1376–1404](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/game/weapons.js#L1376-L1404) はarcN=64、頂点間2ステップで予測する。衝突がなければ毎回126回G.physics.segmentを呼ぶ。main.js L1061から投擲ボタン保持中に毎フレーム呼ばれる。

固定位置・固定発射速度・衝突なしのfixtureでは、60フレームで**7,560回のsegment照会**。さらにcomputeLineDistancesが、**60個の別々のlineDistance属性**を作った。同梱 [three.core.js L28208–28230](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/vendor/three/build/three.core.js#L28208-L28230) は呼出ごとに新しい配列/BufferAttributeを設定する。衝突すれば早期終了するため7,560回はこの無衝突条件の値であり、通常プレイの平均値ではない。

**提案:** 発射起点・速度・物理ワールドのversionが変わらない間は軌跡と着地点を再利用する。リングの点滅・色は毎フレーム変えてよい。lineDistanceは固定配列を再利用し、live頂点の範囲だけ更新する。照準移動・プレイヤー移動・ステージ切替は即invalidateする。照準に追随する必要があるので、最初から全体を低頻度に間引かない。

**合格条件:** 固定照準では初回だけ軌跡計算、移動/照準変更では即更新。元と同じ入力で着地点・段差判定が一致すること。軌跡予測と実際のボム物理の精度は下げない。

## F05. Marina水面反射の追加描画を端末別に制御できる

**根拠:** [environment.js L1637–1712](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/world/environment.js#L1637-L1712)。水面のonBeforeRenderで鏡像カメラを使いrenderer.render(scene, rc)を呼ぶ。Marinaのみ、1フレーム1回、low/水中/override時は除外済み。highは縦横0.4倍、medium0.28倍、ultra0.5倍の反射RTを使い、端末別の更新頻度制限はない。

**既存の工夫は維持する:** ultra未満ではキャラ・FX等を外し、遠景は別の焼き込み反射へ分離している。ゼロから全シーンを二重描画しているという評価ではない。それでも残ったlevel/props等の追加drawとmipmap付きHDRターゲット更新は残る。

**提案:** まずreflectionのCPU時間・draw calls・GPU時間を本描画と分けて測る。支配的ならモバイル用に反射サイズ・更新頻度・参加オブジェクトの予算を設ける。静止時キャッシュ、例えば30Hzへの制限、カメラ移動時の即時更新をA/Bする。解像度縮小だけではdraw calls由来のCPUコストはほぼ減らないので、更新頻度・対象削減も区別する。

**合格条件:** Halyard等で静止/旋回/水際/昼夕を比較し、水面のずれ・ちらつき・残像を確認。非Marinaに効果を一般化しない。GPU実測がない段階で反射を一律OFFにする優先度ではない。

## F06. 最後のミニマップ表示を消すためのdirty更新が必要

これは追加軽量化そのものではなく、**今回入った間引きを維持するための境界修正**。

**根拠:** [minimap.js L324–360](https://github.com/rhgrive3/actions/blob/b4d6da439b6525ba18eb0a4e9b0e7807c9b3b1bd/inkwave-public/src/game/minimap.js#L324-L360) のanimatedは「flashT<0.45、fxListあり、bombsあり、cloudsあり」。その全てがfalseになった瞬間にdirtyは立たない。

実updateメソッドで次を再現した。Canvas自体は描画せず、_compose呼出と最後に渡る状態を記録している。

| 条件 | 再現結果 |
|---|---|
| ボム1個を合成→最後のボムを削除→他の塗り/FX変化なしで1秒 | 合成は最初の1回だけ。最後の合成状態にはボム1個が残る |
| flashT=0.4から合成→0.45超へ進行→他の変化なし | 合成は最初の1回だけ。最後の合成状態にはflashあり |

通常のボム爆発は塗り/FXが別の更新を起こして症状を隠す場合があるが、水没削除（weapons.js L1290）ならその契機がない。flashの終了境界も同じ問題になる。後で塗り等が更新されれば消えるため、永久残留と断定はしない。

**提案:** 前回の動的表示がある状態→ない状態の遷移でもdirtyを立て、最後にもう一度合成する。bomb/cloud削除の世代番号、flash終了検知、または前後のanimated状態を使う。その最後の1回が終わったら再び停止する。

**合格条件:** 最後のボム水没・雲終了・flash終了・マップ表示OFF/ONをそれぞれ確認。終了後に消去用の合成1回が発生し、その後は静止状態で不要な合成を再開しない。毎フレーム合成へ戻さない。

## 実装と検証の順序

1. **F06:** 最終dirty更新を追加。前回の省力化を残しつつ表示残りを防ぐ。
2. **F01:** オブジェクト所有資源と音の終了処理を統一。長時間プレイに効く範囲を先に潰す。
3. **F02:** low設定の適用先を揃え、ユーザーが負荷を下げられる状態にする。
4. **F03/F04:** 転送範囲・固定入力時のキャッシュを実装して、画質/物理を保ったまま不要処理を減らす。
5. **F05:** 実機のreflection計測後に判断。GPU帯域とCPU draw発行のどちらが支配的かを区別する。

実機比較は同じステージ・人数・武器・画角で旧/新版を往復し、frame time p50/p95/p99、CPU/GPU時間、draw calls、資源数、10分以上の推移を記録する。投擲予測はボタン保持時、反射はMarina、寿命問題は連戦をそれぞれ独立したシナリオにする。

## 今回、重複提案しなかったもの

- ワールドの空間分割は既にLevel.queryBlocksにある。physics.raycastが毎回全ブロックを総当たりするとは扱わない。
- FXのlive属性範囲更新、弾本体のオブジェクトpool、ビームpool、キャラLOD、ShadowCacheは既にある。
- 修正済みのBloom伝達、乾燥停止、60fps上限、Boss遅延ロードを新しい発見として数えていない。
- ゲームsrcは引き続きJSキャラ生成経路で、Blender編集ツールのGLB容量をゲーム負荷の根拠にしていない。
- ボトルネック実測なしに、エンジン変更・WebGPU化・全モデル簡略化を先行提案しない。

## 再現資料・保存履歴

- [追加再現スクリプト](./inkwave-mobile-followup-probe-2026-09-29.mjs)
- [追加結果JSON](./inkwave-mobile-followup-evidence-2026-09-29.json)
- 実行: リポジトリルートから `node reports/inkwave-mobile-followup-probe-2026-09-29.mjs`。
- 現行の関数本体と同梱Three.jsを使用。入力・Scene・ネット/音声等の境界はfixtureで制御している。ソースSHA-256をJSONに記録。
- Canvas/WebGLコンテキスト、実ネット対戦、音声出力は起動していない。画面写真・実GPU割当量・FPS改善率の証拠ではない。
- 第2回中間保存: `aa8bcef142e00c3535456d57be56e83558850c9b`。今回は前回レポートを上書きせず、別ファイルに保存する。

改善による数値上の高速化率は未確定だが、F01～F04/F06にはコード/関数再現で確認できる不要処理または終了処理の不足がある。これらから順に対応するのが妥当。
