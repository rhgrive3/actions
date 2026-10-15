# ナメロウ金属（改修後）原典メッシュ統合

`mincemeat` は本体 INKWAVE のステージ選択、プレイヤー、7体の Bot、塗り、三角形物理、ミニマップ、オンラインへ接続する。Turf・Zones・Rainmaker・Clams は利用できる。Tower は局所経路の実用性を確認できず、理由を示して開始前に拒否する。原典は `Vss_Scrap01`。旧 `Vss_Scrap00` を代用品にしていない。凍結した `inkwave-public/` に変更はない。

数値と検証状態は [mincemeat-verification.json](mincemeat-verification.json)。元の OBJ・MTL・PNG、変換モデル、スクリーンショットは ignored の `.codex-stage-sources/` と `.browser-evidence/native-mincemeat/` に保存し、Git と公開ビルドへ入れない。

## 原典と比較の範囲

| 項目 | 根拠・確認状態 |
| --- | --- |
| 表示メッシュ | `kirakira-dev/KiTrix@0611f51b35c9736ee986fb2218461e2585b7875e`、stage tree `257212ff6a22efaf9773c55568f165c86fce967a` |
| OBJ | 44,675,591 bytes、LFS SHA-256 `11cecf76146211ac7fff04394763b0a1d883605f78136b4aee59b8e8dd076d23`。固定 public media から取得して照合 |
| MTL・PNG | 351ファイルを固定 Git blob と照合。変換後に使う285画像は元 PNG の bytes と同一 |
| 保存属性 | 398,287頂点・252,705三角形。位置・法線・UV・三角形インデックスを独立した OBJ テキスト走査で照合。float32位置差の最大値0。UVのない原典オブジェクトだけ0を補う |
| 11.3.0の同定 | ローカル Leanny 1130 `SceneInfo.json` の `Vss_Scrap01` は `ナメロウ金属（改修後）`、preload は `Fld_Scrap01.bfres` と `Fld_Scrap00.bfres`。この同定を KiTrix メッシュの版一致の証明にしない |
| 未確認 | ネイティブ衝突、塗りマスク、原典単位、11.3.0の表示モデル一致、実際のスポーン・ランクルール配置、実機FPS。`version1130Verified: false` を維持 |

## 推定した地形選択と配置

定義は [mincemeat.json](../../patches/native-stages/definitions/mincemeat.json)。原典の全頂点・インデックスを保持したまま、表示する Pnt 共用層と三角形衝突・塗りの推定フラグを選ぶ。

- `FldObj_Scrap01Vcl_*`、`FldObj_Scrap01Vlf_*`、`Scrap01BoxVgl`、`Scrap01_CapeVgl_*`、`SlopeVcl_*`、`FenceVlf_*` などは名前が示す別ルールの候補。固定 source 内の71オブジェクトを inactive にし、重複したランク地形を Turf に重ねない。これは元ゲームの layer metadata を回収した結果ではない。
- `FldObj_Scrap01BoxPntVar_*GeneralBoxNoPaint_*` は Pnt/Var 共用として表示と衝突を残し、名前の NoPaint に基づいて塗り対象から外す。native paint mask は未回収。
- 共用の構造床・縁の source 頂点から X `[-31,31]`、Z `[-75,75]` を対話領域とする。背景・屋根・遠方のスクラップの bounds をマップ境界として使わない。
- スポーンの支持面は `[-7.5,9,-60.5]` と `[7.5,8.953200340270996,59.5]`。source 三角形の上向き法線、カプセル clearance、塗り可能性を確認し、足位置は支持面より0.08上に置く。既存の推定 spawn barrier は2.5。
- 両支持面から有向到達できるノードはそれぞれ5,755。主な相互到達成分は5,701ノード、X `[-30.5,30.5]`、Z `[-63.5,63.5]`。上端の Y12床は片方向の降下でこの成分へつながるが、歩行ナビで戻れないため今回の推定スポーンに使わない。
- 通常のランク配置は両チームが到達できる paint floor 成分から調整し、中央は `[-0.5,1.5,-8.5]`。対向pad由来の forward/lateral を目的物方向の局所推定に用い、source頂点を回転しない。高い中央スクラップを歩行で相互到達できる中央として採用しない。実際のルール別地形・目的物配置・チェックポイントの一致は未確認。
- Tower の試作経路は36ノード、lift1.2、deck half-size0.8、中央 `[-11.5,7.210292519815676,-0.5]`。deck全回転・人体半径を含む水平半径1.5313708498984764と高さ2.03の全segment SAT、141地点の実 Actor 支持（ブラウザでは左右2姿勢の282件）、両チームからの床approach、通常W・Spaceによる30/60/120Hz搭乗は通る。しかし team0 の攻撃arcは3.0476402207765574、team1は35.73236098362085で11.72459949177204倍。実 `RankedEngine` / `TowerRule` の理想的な単独乗員フレームによる得点検査では、各5秒のcheckpointを含めて約7.54–7.57秒対34.78–34.80秒でKOになる。これはロジック単独の時間で、全経路の実入力走行ではない。端点が中心面を越え、体積が衝突しないだけでは通常の対向陣営の対戦を保証できない。この試作を production Tower として公開しない。
- 原典の18個の Vlf 名（16個の `Scrap01Vlf`、2個の `FenceVlf`）には `GroundConcreteFlat`・`ConcreteWide`・`FloorSlope01` があり、bounds はZ±36–39付近、床Y6付近を含む。private の限定実験は Vlf/common を選び PntVar と他の候補層を除外し、元のvertex/index bytesと対向padを保持する。222 active objectsでも、既存6組のhalf-size/lift候補のうち `.8/1.2` の同じ非対称経路だけが残り、攻撃arcは3.0476402207765574対35.73205475569995となる。原典の層metadataや Vlf のネイティブ意味を回収できた証拠ではなく、この実験の層を全モードへ混在させない。
- 定義の `ruleAvailability.tower` は `supported:false` / `source-route-unverified`。メニューは理由を表示し、offline API・menu API・直接online・real WebSocket room start を既存対戦の破棄・fallback・broadcastの前に拒否する。4つの他モードは維持する。本家のTowerの利用可否や、複合ジャンプ/壁登りによる人間の全場接続が不可能だと判定したものではない。

この選択で表示候補205、衝突候補113オブジェクト、実衝突146,903三角形、paint chart80,578、CPU mask4,844,952セルになる。chart投影の最大残差は0.002440512930039331 source units。これは塗り座標の推定誤差で、表示/衝突三角形を動かした距離ではない。source の投影面・背景スクラップを含む推定Turf面積は本家の専用maskによる集計面積と未照合。MTLのpacked/non-colour mapに対するneutral tint、normal/roughness channel、低quality texture選択は既存converterの推定であり、元BFRESのshader/material再現を確認したものではない。

## 操作・ゲームロジックの比較

本家参照版は11.3.0。SceneInfoによる stage identity 以外の小数値、フレーム値、操作感を本家から計測できていない。ブキ・ギア・歩行/泳ぎパラメータは INKWAVE の既存 profile と runtime を使い、ステージ追加で値を変更していない。Nodeの操作は fixture の shooter、ギア補正のない既存 profile によるもの。実ブラウザの壁射撃は `WeaponShooterNormal` の `shooter`、各ギアmain/subがnone（0 AP）、RNG0.5の制御条件で、通常Actor/WeaponRunnerのadmission・Projectile source sweep・自然なwall splatを30/60/120Hzで検査する。以下は INKWAVE の実装検証と本家との差分を区別する。

| 再現操作・実装 | INKWAVEで確認する挙動 | 本家との一致・影響 |
| --- | --- | --- |
| source支持面で30/60/120Hz、1秒静止後1秒前進。`NativePhysics` と既存 `Actor._integrate` | 接地・生存・有限座標を保ち、実カプセルで前進。フレーム間隔別の移動量を数値記録 | 本家の微入力、最高速度、加速、停止距離、90度旋回、反転、射撃中速度、足運びの実機比較は未確認 |
| source壁を自チームインクで塗って squid の壁接触、敵インクへ上書き。既存 `_updateClimb` | 壁泳ぎで正の上昇速度、敵インクで壁泳ぎ解除。polygon mask外のCPU ownershipは0 | native塗りマスクや本家の坂・段差・壁登り値は未確認。表示三角形の推定衝突は本家の専用衝突と異なる可能性がある |
| 本体の対戦開始、初期 squid spawn の射出・着地、Botのpaint goal | source supportへの着地、方向のある経路上の塗り目標。両チーム/全4 Bot slots×30/60/120Hzの24 CPU casesは1秒以内に着地し14目的物への有向経路を保持。実Chromeのhuman/全Bot slots30 controlled casesも1秒以内に着地し、普通の経路移動を行う。8 actors/7 bots の実動作はbrowser evidenceへ記録 | 実際のspawn transform・ジャンプ・変身・被弾・復活値・インク回復・敵インク効果の本家比較は未確認 |
| Turf と Zones/Rainmaker/Clams、Tower の開始拒否 | paint capture・得点、バリア破壊/取得、アサリ取得、snapshot restore、ミニマップ表示。Towerは理由表示と開始前の状態保持を確認 | ranked地形は推定したPnt共用層。原典のルール別地形と目的物位置の差分が残る |
| real WebSocket と production `RoomDurableObject` の2 peers | source/runtime fingerprint一致、8 actors、全4利用可能モードのsettled CPU ink grid digest一致、3 ranked counts同期、Tower拒否時の room/actors/world/transport 保持 | retailネットコード、実機通信条件との比較は未確認 |
| 本体カメラ・8キャラクターの描画、inkの全三角形drawとspatial draw比較、quality変更 | source位置/UV/index保持、画素一致、CPU paint/physics/nav authority保持、キャンセル/破損時rollback、touch viewport | SwiftShaderは実機GPUではない。実機FPSと本家カメラの操作計測は未確認 |

## 証拠の範囲

固定原典の独立した属性/画像照合、公開ブラウザ取得・変換・cache・破損rollback、8 actorsを残したmoving ink render比較は private evidence として保持する。原典を変更しない runtime 校正の更新では、各 build revision と検査対象を数値JSONで分ける。過去の74-node Tower入力結果を36-node試作経路の結果として扱わず、36-node試作の入力成功もproduction Towerの実用性の証拠にしない。Nodeの床上配置/支持検査は source clearance の証拠であり、キーボード搭乗の代用ではない。SwiftShader上の処理時間は診断値で、実機FPSではない。

## 実装レビューと処理時間

独立した定義、source buffer checker、actual source/Actor検査のみをstage差分とし、共有Tower修正・カメラ・source projectile・navigation・canonical fixtureは受け入れ済みfoundationへ分離した。sourceの属性・層選択・NoPaint名・対向支持面を確認し、unsafeな対戦開始と11.72倍のTower経路偏りを残さない。フォールバックのデモ地形を追加していない。

受け入れた最新180-frame、低quality、8 actors/7 normal botsのSwiftShader sampleはCPU p50 14.8 ms、p95 38.2 ms、最大58.7 ms。別の同一sourceのsampleではCPU p50 36.5 ms、p95 226.2 ms、最大2959.7 msを観測した。profileのpaint.advanceSimulationは12.10秒、paint._drawQuadsは10.62秒、character.updateは1.83秒（集計は入れ子のため加算しない）。無seedのブキ/Bot圧力、ソフトウェアGPUと共有実行環境のstallを含む診断であり、モバイル/console FPSではない。別の同一sourceの過去sampleやmobile viewportの軽い値をこの結果の代用にしない。source取得は初回約59.6秒、conversion約6.89秒の測定を保持し、cache hitではOBJ再取得0件。実機frame budget、初回offline取得、外部配布継続性は未確認。

## 検証の再実行

`PRIVATE_SOURCE` は `Vss_Scrap01/` を含む私的な入力ディレクトリ、`PRIVATE_REPOSITORY` は固定KiTrixの読取用Git clone。proxyとTLS verificationを維持する。

```sh
python3 patches/native-stages/tools/build-native.py --source PRIVATE_SOURCE --out .codex-stage-sources/generated --stages mincemeat
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node scripts/build-inkwave.mjs inkwave-public _site-native-mincemeat
node scripts/build-inkwave.mjs inkwave-public _site-native-mincemeat-public
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" INKWAVE_NATIVE_STAGE_SOURCE=PRIVATE_SOURCE INKWAVE_MINCEMEAT_SOURCE=PRIVATE_SOURCE/Vss_Scrap01 flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock node --experimental-vm-modules --test --test-concurrency=1 patches/native-stages/tests/*.test.mjs
python3 scripts/check-inkwave-mincemeat-source.py --source PRIVATE_SOURCE/Vss_Scrap01 --assets .codex-stage-sources/generated --repository PRIVATE_REPOSITORY --report .browser-evidence/native-mincemeat/source-comparison.json
flock /workspace/actions/.ci-scratch/native-stage-browser.lock env NATIVE_STAGE_IDS=mincemeat node scripts/check-inkwave-native-stages.mjs _site-native-mincemeat .browser-evidence/native-mincemeat/gameplay
flock /workspace/actions/.ci-scratch/native-stage-browser.lock env NATIVE_STAGE_IDS=mincemeat node scripts/check-inkwave-native-source-browser.mjs _site-native-mincemeat-public .browser-evidence/native-mincemeat/browser-direct
flock /workspace/actions/.ci-scratch/native-stage-browser.lock env NATIVE_STAGE_IDS=mincemeat node scripts/check-inkwave-native-online.mjs _site-native-mincemeat .browser-evidence/native-mincemeat/online
flock /workspace/actions/.ci-scratch/native-stage-browser.lock env NATIVE_STAGE_IDS=mincemeat NATIVE_RENDER_MOVING=1 node scripts/check-inkwave-native-render.mjs _site-native-mincemeat .browser-evidence/native-mincemeat/render
flock /workspace/actions/.ci-scratch/native-stage-browser.lock env NATIVE_STAGE_IDS=mincemeat node scripts/check-inkwave-native-lifecycle.mjs _site-native-mincemeat .browser-evidence/native-mincemeat/lifecycle
```

公開用 production build は source payload を同梱せず、選択時に固定 public source をブラウザが取得・検証する。private prepared build はローカル検証用で、公開しない。外部 source の配布継続性・初回オフライン取得は保証していない。
