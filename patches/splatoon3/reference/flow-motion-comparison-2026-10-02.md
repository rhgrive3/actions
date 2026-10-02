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

新しい `runtime/flow-motion.mjs` の `installFlowMotion({ THREE, Character, Actor })` は、**production installer の他の Character hooks 全ての後**に一度適用する。親の共有 installer で import / call する必要がある。この lane は共有 installer、adapter、profile、upstream、モデル、髪、generated output を変更しない。個別テストでは同じ VM 内で production `install(profile)` を一度適用した後、この追加 installer を呼ぶ。prototype 上の `Symbol.for` により、別 realm の重複 module から再度呼んでも二重巻きを防ぐ。

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

lane の Node 回帰は GPU shader compile や Switch 実機比較の代用ではない。最終 browser の loaded module hash / active build と実 shader / scene / render の確認、共有 installer の wiring、最終 integration の exact-SHA Actions は親の担当で、lane 単独では **NOT-INTEGRATED**。元映像と同じ camera / gear / input を用いた実機測定、airborne / opponent-concealed visibility、自然解除の曲線、正確な particle count / luminance / timing は未確認として残す。


## Ambient-occlusion override pass (2026-10-03)

独立レビューで、本体の `GTAOPass` が `Points/Line` のみを除外し、Flowの透明な `Mesh/InstancedMesh` を法線・深度用の不透明材質で描いてしまう点を確認した。本体 `weapons.js` の `ribbonGate` と同じ方式で、Flowのglint・spiral・kid/squid shellは `scene.overrideMaterial` のあるpassでは描画範囲を0にする。通常passの元の範囲は復元する。

Shellは本体と同じ実インデックス・vertex attribute・skeletonを使い、独立したgeometry viewに描画範囲を持たせる。本体geometryの描画範囲を変更しない。viewを破棄する前に借りたattribute/index参照を外し、Three.jsのgeometry破棄処理が本体GPU bufferを消さないようにする。資源数にはこのviewも含める。画質変更時は古いviewを破棄して置き換え、同じLODで数が増えないことを検査する。

回帰は全Flow meshでoverride/通常passの描画範囲を直接確認し、本体vertex/index/drawRangeの保持とview破棄時の参照分離を検査する。これは実ソースのpass契約の回帰であり、実GTAO描画やSwitchの見え方の認定は親のWebGL検証に残る。
