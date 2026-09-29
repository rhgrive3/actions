# INKWAVE 画質・操作感を落とさない追加改善調査（第4回）

- 調査日: 2026-09-29 JST
- 対象: `rhgrive3/actions / inkwave-public/`
- 基準コミット: `2f12f1715ac4a36e5744bb9d7fe537996c885a2e`
- 状態: 調査・関数単位の比較検証完了。**下記3件は本体未実装。**
- ゲーム本体への修正ではなく、追加改善の調査レポート。

## 確認できた追加候補

| ID | 対象 | 内容 | 検証 |
|---|---|---|---|
| Q04 | Decor / LobbySet / Showcaseのロビー最終終了 | geometry/materialだけでなくInstancedMesh本体をdisposeし、専用属性を解放 | 同梱Three.jsの資源管理＋模擬GLで20回の解放経路を確認 |
| Q05 | Environment._rebuildDock | 捨てる桟橋・杭・係留船の所有materialを一度だけ解放 | 20回のfixtureでmaterial dispose 0→60、既存geometry解放80→80 |
| Q06 | ShowcaseのInkFX / Sparkles / InkTrail / Confetti | count=0の不要なmatrix更新要求だけを止める | 2,040フレームでCPUの行列・色配列と描画対象の模擬GPU行列が一致 |

Q04の20回fixtureで、明示解放されず残る模擬バッファはDecor 40→0、LobbySet 100→0、ロビーFX 240→0。ロビーcontactが共有するgeometry/materialはそのロビーの解放では破棄しない。

Q06では10 meshの空状態120フレームで、初回確保を除く模擬bufferSubDataが9,347,840 bytes→0。これは比較用fixtureの計測であり、実端末の転送量・FPSの実測ではない。ロビー8 meshのmatrix容量は合計63,232 bytes。

前回のQ01/Q02/Q03およびF01/F03/F04/F06は修正済みとして扱った。影・反射・描画解像度・粒子数・物理精度・更新頻度を下げる案は含めない。

「デメリットなし」は表示内容・ゲーム仕様との交換条件を設けない意味。実機FPSや電池消費の改善幅、ブラウザGC後の実GPUメモリ量は未測定。

## 対応順と範囲

**Q04 → Q05 → Q06を推奨。** Q04/Q05は終了・ステージ切り替え時の所有資源の解放、Q06は描画個数0のmatrix転送要求の除去。描画中のポリゴン数、テクスチャ、影、反射、演出、物理計算を減らす提案ではない。

今回の調査はゲーム本体、特に `showcase.js`、`lobbySet.js`、`environment.js`、`decor.js` と同梱Three.jsを対象とした。モデリングツールのGLB容量を根拠にはしていない。網羅的な全コード無欠陥の証明ではない。

## Q04. 最終終了時にInstancedMesh本体も解放する

### 根拠

Three.jsのInstancedMeshは、複数の物体をまとめて描くための `instanceMatrix` / `instanceColor` をmesh本体に持つ。これらは `geometry.attributes` の一部ではない。

- [Three.js WebGLGeometries L4135–4175](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/vendor/three/build/three.module.js#L4135-L4175): geometry.disposeで解放するのはindex/geometry属性等。
- [WebGLObjects L4629–4690](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/vendor/three/build/three.module.js#L4629-L4690): meshのdisposeイベントで専用属性のremoveとobject binding stateの解放を行う。
- [Decorの旗 L446–452 / dispose L488–512](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/world/decor.js#L446-L512): 旗はInstancedMeshだが、終了処理にmesh.disposeがない。
- [LobbySetの最終終了 L774–783](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/game/lobbySet.js#L774-L783): geometry/material等は解放するが、glows/bulbs/dripMesh本体の解放がない。前回追加されたshadow.disposeは正しく残っている。
- [Showcase._lobRelease L1651–1663](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/game/showcase.js#L1651-L1663): InkFX×2の計6 mesh、sparks、trail、contactの専用属性を解放しない。InkTrail.disposeもgeometry/material/removeのみ（L720）。
- [main._buildWorld L218–222](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/main.js#L218-L222)からDecor.dispose、[Showcase._updateSet L2093–2107](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/game/showcase.js#L2093-L2107)からロビー最終解放へ実際に到達する。

### 修正案と画質不変の条件

既存の最終解放経路で、その所有者が破棄するInstancedMeshに一度だけ `dispose()` を呼ぶ。**通常のclear、非表示にして保持している期間、次の演出で再利用するプールには追加しない。**

特にロビーcontactは[生成箇所 L1585–1589](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/game/showcase.js#L1585-L1589)でスタジオ側のgeometry/materialを共有している。ロビー終了ではcontact本体のdisposeだけ追加し、共有geometry/materialは生かす。既存の資源解放処理を「全textureを再帰dispose」のような汎用処理に置き換えない。

Props側の `_inst` は既に[clear L3297](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/world/props.js#L3297)で `m.dispose?.()` を呼んでいるので、新しい問題には数えていない。

### 再現結果

実際の終了メソッドと、同梱Three.jsのWebGLAttributes/WebGLGeometries/WebGLObjectsを使用。GLだけを模擬化し、20サイクル分の生成・明示解放を記録した。geometryには簡単な代替形状を使い、資源所有関係を再現している。

| 対象 | 現状の専用属性の明示解放漏れ | 提案後 | meshのdispose経由のobject解放 現状→提案後 |
|---|---:|---:|---:|
| Decor: 旗1 mesh/サイクル | 40バッファ | 0 | 0→20 |
| LobbySet: 発光・電球・水滴3 mesh/サイクル | 100バッファ | 0 | 0→60 |
| ロビーFX: 9 mesh/サイクル | 240バッファ | 0 | 0→180 |

共有contact geometry/materialの早期解放は0回。fixtureの共有所有者はロビー終了の検証後に別途終了している。

これは**明示解放が抜けていることの証拠**。ブラウザのGCやドライバによる後の回収は模擬化していないため、「この個数が実GPUで永久に漏れる」「何MB減る」とは断定しない。

**実装後の確認:** ステージ往復、ロビー完全退出→再入場を20回。旗・発光・水滴・足元の影・ロビー演出が正常で、ロビー保持中には解放されないこと。実描画後の資源推移も観察する。

## Q05. ステージ切り替えで捨てる桟橋・杭・係留船の材質を解放する

### 根拠

[Environment._rebuildDock L2793–2801](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/world/environment.js#L2793-L2801)は、旧pilings/dockProps/mooredをrootから外してgeometryだけdisposeし、直後に `_buildDock()` で作り直す。

[生成側 L2126–2165](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/world/environment.js#L2126-L2165)では、pMat/dockMat/boatMatを毎回新規生成する。旧materialは終了処理で解放されない。boatMatは同じ世代の係留船どうしで共有している。旧杭はInstancedMeshなので、Q04と同じ本体disposeも必要。

[main L259](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/main.js#L259) → `rebuildForArena()` → `_rebuildDock()` がステージ変更時の呼出経路。Environment本体はステージをまたいで保持する設計なので、アプリ全体を終了するときだけの問題ではない。

### 修正案と画質不変の条件

削除対象だけから旧materialをSetへ集め、各materialを一度だけdisposeする。旧杭にはmesh.disposeも追加する。既存geometry解放、新ステージの組立、泡場の再生成はそのまま維持する。船どうしの共有materialを重複解放せず、環境全体の共有uniform/textureは解放しない。

現在使っているシーンの描画品質を変更せず、既に使わなくなる旧世代の寿命だけを閉じる。

### 再現結果

実際の `_rebuildDock()` を呼び、以降の新規組立と泡場生成は記録用fixtureへ置換。1サイクルを杭1、桟橋1、同一materialを共有する船2として20回検証した。

| 項目 | 現状 | 提案後 |
|---|---:|---:|
| geometryのdispose | 80 | 80 |
| 一意のmaterialのdispose | 0 | 60 |
| 杭meshのdispose | 0 | 20 |
| 次世代の組立呼出 | 20 | 20 |
| 泡場の生成呼出 | 20 | 20 |

60は「3種類のmaterial×20」のfixture値。実ステージで船がない場合まで3個のGPU資源が確保されるという意味ではない。material disposeはmaterialが使う共有shader program等の参照を正しく返すための処理であり、毎回異なるGPU programが増えているとまでは主張しない。

**実装後の確認:** Marina系とそれ以外を往復し、杭・桟橋・船の材質、船の揺れ、泡・反射が同じこと。旧世代のmaterialだけが一度ずつ解放されること。

## Q06. 演出が0個のときはmatrixのGPU更新要求を出さない

### 根拠

戦闘中の弾のF03修正とは別の、`showcase.js` 内の演出処理に残っている。

- [InkFX.update L477–512](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/game/showcase.js#L477-L512): 滴・着弾跡・波紋のcount=0でも3つのmatrixをneedsUpdateにする。
- [Confetti.update末尾 L633–635](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/game/showcase.js#L633-L635)、[Sparkles/InkTrail L658–720](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/game/showcase.js#L658-L720)も同様。
- ロビーは[_updateSet L2131–2133](https://github.com/rhgrive3/actions/blob/2f12f1715ac4a36e5744bb9d7fe537996c885a2e/inkwave-public/src/game/showcase.js#L2131-L2133)でInkFX×2、Sparkles、InkTrailを更新。ロビー全体が見えていても、この8 meshの演出だけ空である時間がある。
- Three.jsのWebGLObjectsはcount=0を見て専用属性の更新を止める実装ではない。WebGLAttributesはversionが増え、updateRangesがなければ配列全体をbufferSubDataへ渡す。

### 最小の修正案

**計算を終えてそのフレームのcountを設定した後**の各matrix更新要求を、次の条件付きにする。

```js
if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
```

粒子の寿命、物理、乱数消費、matrixのゼロ化、countの計算は従来どおり実行する。0→有効に戻ったフレームでは無条件に更新要求を出す。各クラスのclearにある、count=0にした直後の同じ更新要求も省略できる。

**updateメソッド全体を「前フレームのcount=0だからreturn」で止めてはいけない。** spawnがcountを更新する前の新しい演出を見落とす。見えない内部スロットのゼロ化も残す。これで消滅、再出現、途中の空きスロット、プールの循環を壊さない。

中間保存時には有効prefixのみの転送も候補に含めたが、最終推奨は**空状態の更新要求抑止だけ**へ絞った。有効時のupdateRange管理や追加オブジェクト生成を増やさず、現在の全量更新を維持する。添付の最終プローブ・数値はこの最小案のもの。

### 再現結果

実ソースからInkFX/Sparkles/InkTrail/Confettiのクラスと形状生成を読み込み、最小案だけを別VM内へ適用。現状と提案に同じ固定seed・spawn・dtを与えた。ロビーの8 meshに検証用Confettiの2 meshを足した10 meshであり、実ゲームの単一画面を丸ごと測定したものではない。

| シナリオ | フレーム数 | 現状の模擬bufferSubData bytes | 提案後 |
|---|---:|---:|---:|
| 初期の空状態 | 120 | 9,347,840 | 0 |
| 滴・爆発・着地・泡・星・軌跡・紙吹雪 | 600 | 48,364,544 | 25,569,280 |
| スロット循環・短寿命と長寿命の混在 | 600 | 51,114,896 | 25,114,512 |
| clear後の空状態 | 120 | 9,433,600 | 0 |
| 再出現 | 600 | 48,363,680 | 25,370,144 |

**合計2,040フレームすべてでcount、CPU上のmatrix全配列・色全配列がバイト一致。** GLへ送った各フレームで、描画するcount分のmatrixもバイト一致。途中でGL提出しないフレーム、最大520スロットの循環、消滅後の再出現を含む。GPU側の描画しない範囲は古い値が残ってよい設計で、そこまで一致とは主張しない。

初回bufferDataによる確保は両案に残す。表はそれ以降のbufferSubDataだけ。色属性の更新方法も維持しており、混在シナリオのbytesにはその転送を含む。

ロビー8 meshのmatrix容量は63,232 bytes。全8 meshが空なのに毎フレーム更新する条件なら、60更新/秒で約3.79 MB/秒のmatrix転送要求に相当する。**コード上の容量×更新頻度の計算**であり、実ドライバ帯域やFPS・発熱の実測ではない。既にロビー全体が非表示なら `_updateSet` は休止するので、その休止状態への追加効果とはしない。

**実装後の確認:** ロビー入退場、泳ぐ到着演出、チーム変更、武器画面、勝利/敗北演出で初回出現・着弾・消滅が欠けないこと。空状態の属性versionが増えず、再出現した同フレームで更新されること。

## 再現資料・調査限界

- [再現プローブ](./inkwave-zero-tradeoff-followup-probe-2026-09-29.mjs)
- [実行結果JSON](./inkwave-zero-tradeoff-followup-evidence-2026-09-29.json)
- 実行: リポジトリルートで `node reports/inkwave-zero-tradeoff-followup-probe-2026-09-29.mjs`
- Node v24.19.0で全assert通過。依存パッケージの追加不要。検証対象10ファイルのSHA-256をJSONに記録。
- プローブは現在の本体から対象コードを抽出するため、本体へ修正を入れた後は「未修正を再現するassert」の見直しが必要。
- GLはbyte配列を保持する模擬実装。実WebGLコンテキスト、ブラウザのGC、実機GPU/フレーム時間、スクリーンショット、音声・ネット対戦は測定していない。
- Q04/Q05の提案は終了直前のfixtureへ追加処理を施して検証しており、本体へ統合した回帰試験ではない。
- 画質低下のあるF02/F05、反射/影/粒子削減、描画・物理更新の間引きは最終提案に含めない。

## 保存履歴

- 中間保存: [cd264578f128b4416c9c4c169e13e9ece19643cd](https://github.com/rhgrive3/actions/commit/cd264578f128b4416c9c4c169e13e9ece19643cd)
- 本ファイルを最終詳細版に更新し、再現プローブ・結果JSONを同じmainへ保存。
