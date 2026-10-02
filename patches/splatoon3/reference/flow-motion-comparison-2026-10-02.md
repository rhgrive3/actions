# Flow の外周・発動・延長・解除 — 2026-10-02

公開版 `inkwave-public/` と独立パッチを比較する。ゲーム値の参照は Ver.11.3.0。Nintendo の紹介映像には、ソフト版番号、入力履歴、ギア AP、固定カメラ条件がない。以下の時間、光量、粒子数、曲線、輪郭幅は **visual calibration** であり、原作から抽出した joint / particle parameters ではない。Switch 完全一致を認定していない。

## 原作の一次資料とフレーム

[任天堂 イカ研究所極秘レポート](https://www.nintendo.com/jp/switch/av5ja/report/index.html) を 2026-10-02 に再取得した。発動時の足元へのインク放出、約30秒の持続、相手を倒したり味方の撃破をアシストした際の時間延長を説明している。今回、ゲームの閾値・持続・延長・塗り・ギア相当効果は変更していない。既存 profile の extension=5秒などはこの映像だけから確定した値ではない。

公式動画は、レポート内の Nintendo media embed とそこから参照された最大解像度 HLS を使用した。どちらも 1920×1080、60 fps。TS の PTS ではなく、**デコード先頭を n=0** として選択する。

| 一次動画 | 確認したフレーム | 観察と境界 |
| --- | --- | --- |
| [発動紹介 xovjK0Ll8Nz](https://media-assets.apps-jp.nintendo.com/contents/embed/xovjK0Ll8Nz) | n=232–290、2F間隔。n=360–500、10F間隔 | n=254–290付近はプレイヤーを中心に明るい glint と拡大する曲線状のらせん。近くの相手の被弾／撃破インクと重なるため、最初の発動 frame は確定しない。n=360–500 は体・頭・ブキ付近の疎な四方向 glint とチーム色の光。広い輪が常時出続ける映像ではない |
| [持続・延長紹介 12xDM8Nk5Y8](https://media-assets.apps-jp.nintendo.com/contents/embed/12xDM8Nk5Y8) | n=100–180、10F間隔。n=220–290、5F間隔。n=390–450、10F間隔。n=555–620、5F間隔 | n=150–180、410–440 は泳ぎ／イカ状態でも水面付近に glint。n=225–280 は次の相手の撃破後にプレイヤー側の短い曲線と強い flash が再度見え、疎な glint に戻る。n=555–620 はイカ→ヒト復帰でも光が持続。カメラと撃破インクが動くため、正確な延長演出 frame 数は未測定 |

最初の動画は以前の永続証拠を **実ファイルと SHA256 を再確認してから**使用した。`flow-1.ts` は `c7d15d31294c12f20dda8a22e7fc47823ea7e29d62b1bfda9c217f1052482d95`。二つ目は今回取得し、結合 TS は `7c2884a128340903079262c29356db8b55a64e4134708894d7efb011fd7a7f7d`。bare embed は最初 HTTP 403 だったが、Nintendo Referer と browser User-Agent を付けて公式 embed、master、1080 playlist、全3 segment を取得できた。取得失敗を残った制約として扱っていない。

永続証拠は `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/flow/`。`source-observations.json` に URL、hash、選択 frame 番号、観察／未知を保存し、`official-frames/`、`official-flow-2-frames/` に原寸 frame、contact sheet に時刻と crop 条件を保存する。

## 公開版との差分と今回の接続

既存 `runtime/flow.mjs` が `actor.s3.flow` の active / remaining / score を管理し、発動・延長で塗る。既存 `runtime/weapon-motion.mjs` は active 中に body の `uGlow` を即時 pulse に変えるが、外周粒子・発動らせん・延長 flash・解除 fade がない。この差分は体色だけで判定せず、上表の event と持続中の形を比較した。

新しい `runtime/flow-motion.mjs` の `installFlowMotion({ THREE, Character, Actor })` は、body / weapon / locomotion の Character hooks の後に一度適用する。2026-10-03 の統合候補 `d846b5b8fadd6cef86e7d02699cf9b3b7356b80e` では、共有 production installer が新しい14 motion installer と Flow を接続済み。Flow の後の face wrapper は入力を記録して captured update を呼び、Flow / glow を上書きしない。この lane は共有 installer、adapter、profile、upstream、モデル、髪、generated output を変更しない。個別テストでは同じ VM 内で production `install(profile)` を一度適用し、追加の `installFlowMotion` 呼び出しは既存 prototype の重複インストール拒否を検証する。prototype 上の `Symbol.for` により、別 realm の重複 module から再度呼んでも二重巻きを防ぐ。

実装は次の三つを組み合わせる。

- 発動時は3本の開いたテーパー付きらせん strip が短く拡大・回転して消える。常時足元に torus を置かない。延長は同じ有限な strip を小さく再開する。
- 18個の固定 instanced glint pool から短い duty で少数だけ明るくし、持続中は疎な四方向光にする。体を貫いて地形越しに見える depth bypass は使わない。kid は実 hips / spine / head、squid は実 pivot の現在の姿勢を anchor として追う。
- 薄い外周 shell は実 kid の描画中 indexed skin / cloth / hair のvertex/index属性と実 skeleton、実 squid body のvertex/index属性を共有する。描画範囲はshell固有のgeometry viewで管理する。source material の vertex hook も再利用し、skin の顔変形、hair の normal 処理、squid の tentacle wave と uniform を保つ。AABB の代理形状や別の skeleton を作らない。実際の3段階 LOD と source quality の rebuild に追従し、古い shell を除去する。

自己所有は Character ごとに **2 particle geometries、shellごとのgeometry view、最大6 materials、1 instanced mesh、3 ribbon meshes**。body shell は source の mesh 数に従い、3つの実 LOD tier を上限に再利用する。source attribute / index / skeleton / uniforms は借用し、source geometryをdisposeしない。glintとribbonのown buffers / materials、instanced GPU state、shell view固有のVAOをdispose時に一度解放し、sceneからshellを除去する。viewの破棄前に借用attribute/indexを外す。dead / reset では effect を即時消し、既存 pool を再利用する。dispose 後の update で pool を再生成しない。

`actor.s3.flow.active` の立ち上がり、`remaining` の増加、active の立ち下がりだけを読む。延長を推測するために別の damage-credit map や score / duration clock を作らない。state が最大 duration で増加しなかった場合は、production Flow の塗りと同じく追加の延長演出を起こさない。武器交換や Runner.reset によって Flow を消さず、kid/squid/swim/climb、空中、攻撃中、移動 action と既存 pose を共存させる。

`uGlow` の最終 assignment はこの layer が所有し、Flow の attack/fade と native special-ready glow の強い方を表示する。`wGlow`、special fraction、Runner clocks、Flow state、Actor position は書き換えない。instance ごとの `s3FlowMotionEnabled=false` は新しい layer のみ抑制し、既存 weapon-motion の Flow emission を維持するので、修正前の反事実 render ができる。

校正値は module の `FLOW_MOTION_CALIBRATION` に明示した。entry=.65 s、extension=.35 s、attack=.10 s、expiry=.24 s、shell=.012 INKWAVE world units。glint の周期・shape・colour と実 leg span に対する radius も校正である。entry の長さは上表の見える短い spiral に合わせた近似。**natural expiry の映像は今回の2本にない**ため、expiry=.24秒を原作の測定値として扱わない。

## 実 source 回帰と統合の境界

`tests/flow-motion.test.mjs` は one-VM production installer と actual Actor.update → actual Runner → Actor._finishFrame → full Character / native IK を使う。world collision integration と display/audio/projectile hits のみ stub。準備 turf、実 splat award、hostile assist extension、実 `advanceFlow` expiry、dt=0、30/60/120Hz と irregular rendering を検証する。direct variable dt でも elapsed transition と read-only gameplay を確認する。

全7 weapon kind、kid/squid、地上／空中、form return、native LOD、quality rebuild、special-ready coexistence、hidden return、reset、death、40回の発動／解除 reuse、double-install / double-dispose を扱う。shell は実 drawn index の頂点を native `getVertexPosition` で読み、同じ source skeleton による pose を確認し、両ピストルの実 grip error と native IK reach error も確認する。resource counts と dispose event を検証し、shared geometry が破棄されないことを確認する。

読み取り診断 `flowMotionSnapshot(ch)` は phase、opacity、visible、aliveParticles、event / eventAge、activation / extension / expiry counts、ownedResources、disposed を公開する。親の actual WebGL trace と final exact-SHA Actions へ `integration-handoff.json` で渡す。

lane の Node 回帰は GPU shader compile や Switch 実機比較の代用ではない。2026-10-03 の独立レビューでは下記の focused browser verifier を追加した。共有 workflow への接続と最終 integration の exact-SHA Actions は親の担当で、focused lane の passing receipt だけで製品全体を認定しない。元映像と同じ camera / gear / input を用いた実機測定、airborne / opponent-concealed visibility、自然解除の曲線、正確な particle count / luminance / timing は未確認として残す。


## Ambient-occlusion override pass (2026-10-03)

独立レビューで、本体の `GTAOPass` が `Points/Line` のみを除外し、Flowの透明な `Mesh/InstancedMesh` を法線・深度用の不透明材質で描いてしまう点を確認した。本体 `weapons.js` の `ribbonGate` と同じ方式で、Flowのglint・spiral・kid/squid shellは `scene.overrideMaterial` のあるpassでは描画範囲を0にする。通常passの元の範囲は復元する。

Shellは本体と同じ実インデックス・vertex attribute・skeletonを使い、独立したgeometry viewに描画範囲を持たせる。本体geometryの描画範囲を変更しない。viewを破棄する前に借りたattribute/index参照を外し、Three.jsのgeometry破棄処理が本体GPU bufferを消さないようにする。資源数にはこのviewも含める。画質変更時は古いviewを破棄して置き換え、同じLODで数が増えないことを検査する。

回帰は全Flow meshでoverride/通常passの描画範囲を直接確認し、本体vertex/index/drawRangeの保持とview破棄時の参照分離を検査する。これは実ソースのpass契約の回帰であり、実GTAO描画やSwitchの見え方の認定は親のWebGL検証に残る。

## 独立した実 WebGL / GTAOPass 検証 (2026-10-03)

`scripts/check-inkwave-flow-render.mjs` は親と同じ immutable built site の `_versions/<revision>/` を読み、manifest の全 artifact / source input / build script hash を実ファイルと照合する。ブラウザへ渡す response body を hash 検証した後、その同じ bytes で fulfill し、path / SHA256 / byte length を結果に保存する。`--exact-source` は build inputs と verifier 自身を HEAD の committed blobs に追加で束縛する。検証の前後で入力を再照合し、別 build / dirty source を合格させない。

実 production installer、Actor.update、WeaponRunner、完全な Character と native IK、Level / Physics / PaintSystem / Projectiles を使う。固定入力、平坦な診断 box、match の playing / canRespawn 境界である。全体 Game.update を呼ばず、native turf と splat award で発動・延長し、remaining を短縮せず約30秒を実 Actor tick で進めて解除する。kid entry / active、extension、squid entry / active、kid return、expiry / off、即時 reset / death、hide の11場面を描画する。preview / animation interruption の CPU 回帰は renderer 単独の主張と区別する。

各場面では本物の WebGLRenderer と GTAOPass.render を実行し、beauty、Normal、Depth、AO の実 framebuffer pixels を読み戻す。Flow mesh を同一姿勢のまま非表示にした対照と比較し、正常な override は Normal / Depth / AO の全 bytes が一致し、実 GL drawElements / drawElementsInstanced の Flow draw が0になる。shell / glint / ribbon を個別に非表示にした beauty 差分も検証する。さらに gate だけを一時的に bypass する故障対照を実 GPU で描き、元の不透明 occluder バグが Normal / Depth / AO の pixels に現れることを必須にする。

独立初回 passing receipt は `review-flow/browser-instrumented/flow-render-result.json`、source-bound content hash は `64948045d77ac6fe195373e0dd79f05551b1e141c067d4f5c1f809fc97d77418`。故障対照は Normal / Depth それぞれ3732 pixels、AO 6063 pixels を変えた。shell、glint、ribbon はそれぞれ1082 / 341 / 2346 beauty pixels を変え、shader error は0。この数値はこの診断 camera、480×360、Chromium WebGL2 / SwiftShader での観測であり、Nintendo の見え方や実機 GPU の数値ではない。最終 commit に束縛した receipt は lane の `done.json` に記録する。

実 GL bufferData で本体 attribute/index arrays と38個の WebGLBuffer を対応付け、dispose 中の deleteBuffer を観測する。本体 buffer の削除は0、全38個が gl.isBuffer のまま、借用参照を外した4 shell view の dispose と実 VAO 解放を確認した。共有 native geometry を使う別の Character はdispose前後で Normal pixels が完全一致する。CPU 回帰も source の attribute/index bytes と drawRange object の保持を検証する。

beauty の hidden/hidden 対照にも少数 pixel の差が出るため、raw 差分と繰り返し対照を保存し、完全な beauty bit 一致を認定しない。off / reset / death / hide は visible Flow mesh、実 renderer callback、実 Flow GL draw が全て0であることを確認する。Nintendo 一次資料は現行 page の lookup と retained TS hash を再確認してから frame contact sheet を独立に閲覧した。入力、ギア、映像の版番号、自然解除の曲線、Nintendo の AO 実装は不明のままで、校正値は変更しない。
