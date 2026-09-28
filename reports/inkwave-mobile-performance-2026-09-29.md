# INKWAVE スマホ向け処理改善レポート

- 調査日: **2026-09-29 JST**
- 対象: **rhgrive3/actions / main / inkwave-public/**（ゲーム本体）
- 基準コミット: **bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d**
- 完了範囲: 現行ソース・同梱Three.js・公開ビルド経路の調査、主要条件の関数単位での再現、改善順序と実機検証計画。
- 初回調査はレポートと検証資料だけで実施。その後、同レポートのP1（ID01〜05）をゲームコードへ反映した。
- **実機FPS、GPU時間、発熱、電池消費、ブラウザの実メモリ量は未測定。改善率を実測値としては提示しない。**

## 結論

改善余地はある。最初に手を入れるべきなのは、モデルを一律に粗くすることよりも、**モバイル設定の伝達漏れ、動的解像度の条件、GPU資源の解放漏れ、無変化時にも走る処理**である。

特にAndroidのBloomとScreenFXには、main.jsで設定したモバイル上限が行き渡っていない。動的解像度も「60fpsを維持し、余裕が戻ったら画質回復」という用途に合っていない条件が残る。既存の軽量化を維持したまま、これらを直す順序を推奨する。

## 実装反映 — 2026-09-29

P1のID01〜05を、既存のDPR上限・MSAA/GTAO無効化・FXAA・LOD・ShadowCache・タッチ/ジャイロ処理を維持したまま実装した。

- **ID01:** `effectiveQuality(settings, mobile)` を共通化し、main / Renderer / ScreenFX が同じモバイル上限を使用。Androidでも既定Bloom OFF、high/ultraのScreenFXはparticles上限0.7を受けて6 taps・Lens 1/4になる。
- **ID02:** 動的解像度を約50fps以下で低下、58fps以上が3窓安定したら一段階回復するヒステリシス方式へ変更。タッチ端末はRendererと同じ0.6まで低下可能で、回復失敗時は8/16/32秒の段階的クールダウンを使う。回復回数の生涯上限は撤廃。
- **ID03:** Composer再構築時に各Passの`dispose()`とComposerの`dispose()`を実行。ただしScreenFX所有の`extraPass`は継続利用するため除外。
- **ID04:** `Decor.dispose()`を追加し、ステージ固有geometry/material/CanvasTextureを重複排除して破棄。lightmapもステージ所有として追跡し、切替時に明示的にdispose。
- **ID05:** 最後のsplat/滴り終了時刻 + 約6.5秒を保守的なwetness期限として管理し、未塗装・完全乾燥後はdry atlas passを停止。GPU readbackやCPU塗り判定は追加していない。

再現プローブも新版の期待値へ更新した。**実機FPS、GPU時間、発熱、電池消費の改善率は引き続き未測定**であり、実装済みであることと実機効果の大きさは分けて扱う。

## P2/P3 実装反映 — 2026-09-29

残りのID06〜09も、入力・オンライン同期・既存の画質順序を崩さない形で実装した。ID10はGPU実測なしでGrade/Output/FXAAを融合すると色空間やHDR順序を変える危険があるため、危険な統合は行わず、確実に不要なPass生成だけを除去した。

- **ID06:** `frameRate` を追加。モバイルの既定 `Auto` は60fps、`Display` を選べば90/120Hz等の画面更新を使える。rAFを単純に1回おきに捨てず、経過時間を蓄積するため75/90/120/144Hzでも平均60fpsかつゲーム時間を失わない。デスクトップのAutoは従来どおり画面更新に追従する。
- **ID07:** Minimapの最終Canvas合成をdirty/アニメーション時だけ最大30Hzに制限。Minimap OFFでは高価な初期ラスタ構築とCanvas合成を行わず、軽量な論理タイマーだけ進める。HUDのmap player/marker配列も再利用し、毎フレームの一時オブジェクト生成を削減。
- **ID08:** `showcase.fullFrame` でロビー/オンラインセットが全画面を覆っている間、背後のarenaのFX・environment・Decor・props・camera/diorama・paint atlas・surface visual更新とarena shadow更新を休止。入力、ネットワーク、時刻、音声、showcase自体は継続する。
- **ID09:** Boss Battleランタイムを通常起動グラフから分離。`main.js` / `match.js` のBoss静的importをなくし、Boss選択時だけ `bossMode.js` を遅延ロードする。通常Turfの初回依存グラフからBoss系モジュールを外す。Characterの全LOD warm-upは、試合中Low→High変更時の初回ヒッチを避けるため維持した。
- **ID10:** モバイルでは実効品質上BloomがOFFなので、`UnrealBloomPass` 自体を生成しないよう変更。Grade → ScreenFX → Output → FXAAの順序は保持し、GPU実測なしのPass融合は実施していない。

### 追加のソースレベル検証

- touch Autoのフレーム上限を60/75/90/120/144Hz入力で10秒シミュレーションし、すべて60fps出力・約10秒のシミュレーション経過を確認。
- `Display` 120Hzとdesktop Auto 120Hzは120fpsのままになることを確認。
- `main.js` / `match.js` にBoss runtimeの静的importが無いこと、遅延ローダーがビルドの静的preload探索形式に一致しないことを確認。
- Minimap 30Hz合成、OFF時のidle build抑止、hidden tick、ロビーworld guard、touch BloomPass非生成をソース上で確認。
- 変更した主要JSの構文確認を実施。最終的な公開ビルドはmain反映後のPages workflowで確認する。

**実機でのFPS p50/p95/p99、GPU時間、端末温度、消費電力についてはまだ測定していない。** したがって「何％高速化した」という数値はここでは主張しない。

## 優先順位

P1は最初に直す候補、P2は次の段階、P3は計測後に判断する候補。効果の大きさはコードからの見込みであり、実測順位ではない。

| ID | 優先 | 改善 | 主に効く場面 | 見た目・挙動への注意 |
|---|---|---|---|---|
| 01 | P1 / 実装済み | モバイル品質設定をRenderer・ScreenFXまで統一 | Android、移動・被弾・特殊演出 | 演出の比較が必要。照準・危険通知は保持 |
| 02 | P1 / 実装済み | 動的解像度の低下・回復条件を整理 | 60Hz端末、負荷変動、長時間プレイ | 画質の上下動を防ぐ |
| 03 | P1 / 実装済み | Composer再構築時の旧Passを解放 | 品質・影設定を何度も変更 | 再利用するScreenFX Passを解放しない |
| 04 | P1 / 実装済み | ステージ切替時のDecor・lightmapを解放 | 連戦、ステージ往復 | 共有資源の二重解放を防ぐ |
| 05 | P1 / 実装済み | 無塗装・乾燥済みインクの更新停止 | 待機、塗装の少ない場面 | 塗り判定・得点・濡れ表現を変えない |
| 06 | P2 / 実装済み | 高Hz端末向け60fps描画上限を用意 | 90/120Hz画面、電池消費 | 入力・ネット・経過時間を正しく維持 |
| 07 | P2 / 実装済み | ミニマップの合成とHUDの低頻度部分を整理 | 試合中のCPU・Canvas負荷 | 照準やダメージ反応は遅延させない |
| 08 | P2 / 実装済み | ロビーで隠れたワールド処理を休止 | ロビー放置時の発熱 | ロビーに必要な共有処理は継続 |
| 09 | P2 / 実装済み | 初回依存グラフ・事前生成を分割 | 初回起動、試合開始の引っ掛かり | 初射撃のシェーダー待ちを再発させない |
| 10 | P3 / 安全策反映 | 全画面Passの統合を検討 | GPU帯域が限界の端末 | HDR・色変換・FXAAの順序を保持 |

## 1. モバイル品質設定が一部で使われていない

**確認済み。** [main.js L126–144](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/main.js#L126-L144) と L224–225では、タッチ端末用に `bloom:false`、`particles<=0.7`、atlas/影の上限などを作る。

一方、[renderer.js L125–159](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/core/renderer.js#L125-L159) は元の `QUALITY[settings.quality]` を使い直し、Bloom除外条件は `!this.mobile.ios`。設定がONならAndroidのmedium/high/ultraでBloomが有効になる。設定変更側L178–189にも同じ条件がある。初期設定はhigh・Bloom ON（config.js L246–248）。

また、[screenfx.js L794–803](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/fx/screenfx.js#L794-L803) も元のQUALITYを参照する。highのスマホでもTAPS=8、Lens解像度は縦横1/3となり、main.jsのparticles上限0.7がここには伝わらない。

**提案:** `effectiveQuality(settings, device)` のような一箇所で実効設定を確定し、Renderer・FX・ScreenFX・ワールド構築で共有する。タッチ端末のBloomは既存の意図どおり既定OFFにし、ScreenFXは例えば6 taps・Lens縦横1/4を比較候補にする。任意の高画質設定は明示的に扱う。

**見込み:** Bloomが動いていたAndroidでGPU処理を減らせる。Lensを1/3→1/4にすると、そのターゲットの画素数は理論上43.75%減る。ただしLens使用時だけの話であり、ゲーム全体の43.75%高速化ではない。ScreenFXには既に演出がない場合のPass停止がある（L860–867）ので、それは維持する。

**確認方法:** Android/iOS × low/medium/high/ultraで実効値、Pass有効状態、特殊演出中のGPU時間を比較する。被弾・潜伏・必殺技・インク付着の見やすさを確認する。

## 2. 動的解像度が60Hzと噛み合っていない

**関数単位で再現済み。** [main.js L926–954](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/main.js#L926-L954) の条件は以下。

- 4秒窓の平均が40fps未満で低下。50fps程度では低下しない。
- 回復は75fps超の窓が3回必要。通常の60Hz表示ではこの条件を満たせない。
- `s > 0.76` のガードにより1→0.875→0.75で停止。Rendererのモバイル下限0.6まで到達しない。
- 回復回数 `ups` は同じ状態の寿命中に最大2回で、低下後にリセットされない。コメントにある「失敗するたび倍増するクールダウン」とも実装が一致しない。

| 入力した描画間隔 | 再現結果 |
|---|---|
| 30Hz相当20秒→60Hz相当120秒 | 0.75まで低下し、そのまま回復なし |
| 30Hz相当60秒 | 0.75で停止 |
| 50Hz相当60秒 | 1.0のまま |
| 30→120→30→120Hz相当 | 最初の2段階は回復。再低下後は120Hzでも回復なし |

**提案:** 目標60fpsのフレーム予算に合わせて低下条件を決め、60Hzでも回復できる仕組みにする。回復の余力はrAF間隔だけでは分からないので、CPU/GPU計測か、十分な安定期間後の一段階試行と失敗時クールダウンを使う。上げ下げのヒステリシスを設け、マッチ/品質変更時の履歴リセットも定義する。下限は端末用設定と呼出側で一致させる。

**注意:** CPU負荷やネット待ちが原因なら解像度を下げても改善しない。CPU/GPUの区別なく画質だけ落とさない。現在ultraとロビーは対象外なので、自動調整と利用者の設定の関係も明示する。

## 3. Composerを作り直すときに旧Passを破棄していない

**解放処理の不足を確認。メモリ増加量は未実測。** [renderer.js L133–174](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/core/renderer.js#L133-L174) は旧Composerの主ターゲット2個だけをdisposeして新規Passを作る。品質/影設定変更やScreenFXの設置でこの経路を通る。

同梱 [UnrealBloomPass.js L96–128](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/vendor/three/jsm/postprocessing/UnrealBloomPass.js#L96-L128) は11個の中間ターゲットを持ち、L210以降に独自disposeを実装する。GTAOや各ShaderPassにも所有資源がある。旧Passへのdispose呼出がないため、一度GPUに確保された資源が残るリスクがある。

**提案:** 再構築時に旧Passの所有資源を解放する。Composer自身のdisposeも使うが、同梱版の `EffectComposer.dispose()` は全Passを自動disposeしない（L354–360）。継続利用する `extraPass` は除外し、その所有者ScreenFXが寿命を管理する。OFFのBloomは遅延生成にする選択肢もある。

**注意:** 未使用のBloomターゲットが11個あるだけで「11個分のGPUメモリが必ず確保済み」とは言えない。JS上の生成と実際のGPU割当は区別する。

**確認方法:** 各品質を実際に描画してからhigh↔low、影ON/OFFを20往復する。warm-up後の `renderer.info.memory`、program数、コンテキスト喪失、旧資源のdisposeを観察する。資源数だけからバイト単位のGPUメモリ量は断定しない。

## 4. ステージ切替時の装飾・lightmapの寿命管理

**解放経路の不足を確認。** [main.js L213–243](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/main.js#L213-L243) は旧Decorを `scene.remove()` するだけ。`Decor` にはdisposeメソッドがなく、[decor.js L207–221](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/world/decor.js#L207-L221) でCanvasTextureやgeometry/materialを生成する。

lightmapも [main.js L267–276](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/main.js#L267-L276) でステージごとに読み込まれ、levelMaterial.js L52でuniformに渡される。旧マテリアルのdisposeだけでは、その参照先テクスチャの解放にはならない。

**提案:** ステージが所有するDecor・lightmapを明示的に管理し、終了時に一度だけdisposeするか、上限付きキャッシュへ移す。Decor内部で共有されるgeometry/materialはSetで重複排除する。ゲーム全体で共有するmuralsやtexlibまで破棄しない。

**確認方法:** 同じ2ステージを10往復し、初回キャッシュ増加の後にgeometry/texture数が横ばいになるかを見る。次の試合の旗・スポーン床・陰影が壊れていないことも確認する。

## 5. 塗られていなくてもインク乾燥描画が続く

**関数単位で再現済み。** [paint.js L602–650](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/world/paint.js#L602-L650) は約0.05秒ごとにdryMeshを有効にする。growingも新しい塗装もない状態で、60Hz相当10秒間に**200回**の乾燥用描画要求が発生する。

**提案:** 最後の濡れ更新から、乾燥完了を保証できる時点を管理する。新規splatと成長・壁の滴りの最終更新まで含めて追跡し、濡れが残らないと分かったらdryMeshを止める。まずは保守的な全体タイマーで十分。必要性が計測で示されたらdirty領域管理へ進める。

乾燥判定のために毎フレームGPUから読み戻す方法は採用しない。CPUの塗りセル、移動、ダメージ、得点計算は変更しない。既存のquadsバッチと部分属性更新は維持する。

**確認方法:** 未塗装・完全乾燥後は乾燥描画要求0、成長中・壁の滴り中は維持、再塗装で即再開。200回はソースの分岐から数えた描画要求であり、GPU時間の計測値ではない。

## 6. 90/120Hz端末向けの描画上限

**コード上、ゲームループに60fps上限がない。** main.js L926–936はrAFごとに全 `_frame()` を実行する。ブラウザが90/120Hzでコールバックを発行し処理が間に合えば、60Hzより多くの描画・HUD・シミュレーション更新が走る。

**提案:** モバイル既定60fpsと、高Hzを選べる設定を用意する。rAFの経過時間を蓄積し、スキップ分を失わず描画を制御する。90Hzで単純に1回おきに描くと45fpsになるため、実時間ベースで処理する。

ネットワークは既に約20Hz送信（net/netmatch.js L162–167）。描画上限をそのまま送信・タイマーの変更にしない。バックグラウンドからの復帰も別扱いにする。60Hz端末では上限導入だけによる高速化は期待しない。

## 7. ミニマップの合成とHUDの更新頻度

**部分的な既存最適化はある。** [minimap.js L310–340](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/game/minimap.js#L310-L340) は塗りのラスタ更新を0.15秒間隔・3分割にしている。一方、Canvas合成 `_compose()` は毎updateで実行する。

[main.js L1117–1135](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/main.js#L1117-L1135) はHUD更新時にミニマップを常に更新し、プレイヤー配列等を新しく作る。小マップOFFでもこの呼出は残る。HUD側には既に差分更新が多数あるので、全体を未最適化とは評価しない。

**提案:** 小マップ/大マップを含む実際の表示先を確認し、どこにも表示されていない時は合成を止める。静的な背景・塗り合成と、プレイヤー/スポーン演出を分け、前者はdirty時だけ、後者は15～30Hzなどを比較する。HUDは得点・名簿等の低頻度項目と照準・被弾等を分け、前者だけ間引く。

**確認方法:** マップOFF/ON、大マップ、スーパージャンプ、味方死亡/復帰を比較する。入力に直結する表示は反応を維持する。GC負荷はallocation profileで確認してから配列再利用を広げる。

## 8. ロビーで隠れているワールド処理

[main.js L961–1029](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/main.js#L961-L1029) は `showcase.fullFrame` のときattract試合のシミュレーションとゲーム世界の描画を既に止める。ただしFX、環境、Decor、props、paint.flush等は引き続き呼び出される。

**提案:** 完全に隠れたワールドの視覚更新を停止する。ロビーの照明・音・通信など必要な共有部分は分離する。再表示時に蓄積dtをまとめて処理せず、視覚時間の再同期規則を決める。

**確認方法:** ロビー30～60秒のCPU profileを取得し、まず実時間を使っている関数だけを対象にする。元から軽い関数の呼出削減を大きな効果と誇張しない。

## 9. 初回起動・試合準備の依存グラフとLOD生成

公開経路は [.github/workflows/pages-inkwave.yml](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/.github/workflows/pages-inkwave.yml) → [scripts/build-inkwave.mjs](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/scripts/build-inkwave.mjs)。minify、Three.js tree-shaking、modulepreloadは既にある。

現行ビルドの依存グラフ探索を実行すると**102モジュール**、その中に**Boss関連10モジュール**が含まれる。ビルド前の対象グラフは6,160,035 bytes、srcのJS全体は85ファイル・3,894,389 bytes。**これらは非圧縮ソースの値であり、公開サイトの転送量ではない。** 今回はminify後サイズ・HTTP圧縮・キャッシュ状態を実測していない。

さらに [character.js L898–918](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/game/character.js#L898-L918) のwarmAllは全3 tierとdither材質を準備し、武器のfar形状も事前生成する。[character-lod.js](https://github.com/rhgrive3/actions/blob/bba6eab9277e28cbdab89c6b2cff9a03dcdb6e3d/inkwave-public/src/game/character-lod.js) は頂点クラスタリングとキャッシュを既に持つ。LOD自体を新規導入する必要はない。

**提案:** タイトル表示・通常対戦・Bossで依存を分ける。BossはMatchからの静的importもあるため、preloadタグを消すだけでは遅延化できない。コードの依存境界を変更する必要がある。モード決定後の先読みとloading画面内warm-upを使い、初射撃時の処理詰まりを防ぐ。low設定で使用しないhero等の事前生成を省けるか、品質変更時の再warmも含めて検討する。CPU側のLOD生成は必要ならビルド時生成か分割実行へ移す。

なお、調査対象のゲームsrcにはGLTFLoader/GLB読み込みが見つからず、現行キャラはJS生成経路。`tools/inkwave-modeler/` のBlender成果物のサイズを、そのままゲーム中の負荷と結び付けない。

## 10. 全画面Passの削減は計測後に

RendererではBloom等を除いても、scene→grade→（演出時ScreenFX）→Output→FXAAの経路がある。GPU実測がない状態でGrade/Output/FXAAを融合すると、HDR入力・tone mapping・色空間・AAの順序を変えてしまう可能性があるため、今回は融合しない。

**反映済みの安全策:** モバイルの実効品質ではBloomが常時OFFなので、無効な `UnrealBloomPass` を生成してComposerへ追加する処理自体を省いた。これにより見た目やPass順序を変えず、不要なBloom内部ターゲットの生成経路を除去した。

**今後:** 実機GPU timingで全画面Passが支配的と確認できた場合だけ、Grade/Output等の融合をA/Bする。単にHDRを8bitへ変えたりFXAAを削ったりしない。

## 維持する既存最適化・仕様

- DPR上限: iOS 1.2、その他タッチ端末1.35。モバイルMSAA/GTAO無効、atlas上限2048、影サイズ上限2048、FX粒子上限0.7。
- ShadowCacheの静的キャスター再利用と画面外キャラの影省略。影を全面的に半頻度へ戻すと、既存コメントが指摘するガタつきの再発リスクがある。
- キャラLOD・ヒステリシス・far形状キャッシュ、インクquadsバッチ・部分属性更新。
- ミニマップの塗り更新分割、HUDの既存差分更新、ScreenFXの演出なしPass停止。
- ビルドminify、Three.js tree-shaking、シェーダー事前compile、ロビーで覆われたattract試合の停止。
- タッチ、ジャイロ、Safe Area、移動/射撃/塗り/得点、オンライン同期。

Android BloomとScreenFXの伝達漏れ、全ループの60fps上限未実装については、設定オブジェクトや過去説明の存在だけで「対応済み」と判断しない。

## 実装する場合の順序と合格条件

1. **ID01・02:** 実効品質の統一と解像度制御。端末別条件を確認し、60Hz回復・持続負荷・再低下後の再回復を確認。
2. **ID03・04:** 資源の所有権と破棄。設定20往復・ステージ10往復でwarm-up後の資源数が増え続けない。
3. **ID05:** 無変化時のpaint更新停止。未塗装/乾燥後は乾燥描画0、塗り始めと滴りは従来どおり。
4. **ID06～08:** 実装済み。上限・HUD/Minimap・ロビー休止について、入力応答とオンライン同期を保持する。
5. **ID09:** Boss依存分割を実装済み。通常TurfからBoss preloadを除外し、初回戦闘のwarm-upは維持。
6. **ID10:** 安全策のみ反映。モバイルBloomPass非生成。全画面Pass融合はGPU実測後に判断。

比較は**1項目ずつ**行い、同じステージ・キャラ数・武器・画角・設定で旧版と新版を往復測定する。

| 計測場面 | 条件 | 見る値 |
|---|---|---|
| 初回起動 | キャッシュなし/ありを分離 | 操作可能までの時間、長いメインスレッド処理、転送量 |
| ロビー | 60秒待機 | CPU時間、描画回数、Canvas更新 |
| 通常対戦 | 静止、移動、連射、被弾、特殊演出 | frame time p50/p95/p99、CPU/GPU、draw calls/triangles |
| オンライン | 同じ人数でホスト/参加側を分離 | 送信間隔、入力応答、補間の乱れ、CPU |
| 連続プレイ | 10分以上、開始直後と後半を比較 | 熱による性能低下、バッテリー消費の傾向 |
| 切替 | 品質20往復/ステージ10往復 | 資源数、コンテキスト喪失、描画欠け |

最低でもAndroid Chromeの60Hz端末、90/120Hz端末、iPhone Safariで実施。各条件3回を目安とし、温度・充電状態・OS/ブラウザ・画面解像度・DPRを記録する。WebGLのGPUタイマーが使えない環境は「GPU時間未計測」と記録する。

既存の `window.__inkwave.perf`、`window.__G.renderer.info`、`bootMarks` は活用できる。ただし **perf.renderはCPU側の描画命令発行区間であり、GPU実行時間ではない**。FPS平均だけで改善を判定しない。目標60fpsの予算は約16.7msだが、実機達成は未確認。

## 再現資料と調査履歴

- [再現スクリプト](./inkwave-mobile-audit-probe-2026-09-29.mjs): 現行コードの関数本体・条件式・ビルドの依存探索を読み出して実行。ブラウザ/GPUのベンチマークではない。
- [再現結果JSON](./inkwave-mobile-audit-evidence-2026-09-29.json): 修正後の関数再現結果、構文確認、資源寿命の配線確認、Pages本番ビルド結果を記録。
- 実行: リポジトリルートで `node reports/inkwave-mobile-audit-probe-2026-09-29.mjs`。
- 中間報告はコミット `82656c51319f4a4e7a0a375c7336c425bfa68f81` で先行保存。その後、本最終報告に更新。
- レポートと資料は `reports/` に置き、既存のゲーム公開対象やPagesのパス条件に追加していない。

ソースから確認できた処理条件と、実機で効果を確認する必要がある提案を分けて記載した。P1修正後のPages本番ビルドは成功済みだが、現時点で「何倍速くなる」「すべて60fpsになる」とは結論付けない。
