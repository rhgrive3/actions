# INKWAVE・弾描画の固定ソース監査（2026-10-11）

参照は Splatoon 3 Ver.11.3.0、Leanny/splat3 commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6` の `data/parameter/1130/weapon`。今回 GitHub connector で現在実装されている65メインの原本を再取得し、UTF-8全体のSHA-256を既存カタログの65件と照合した。**65/65一致**。弾の描画データを新しい `projectile-visual-source-data.mjs` に独立して保存し、全フィールドのJSON pointer、取得元、blob SHA、全体SHA-256、Wiki版、描画分類を [機械可読の記録](../patches/splatoon3/reference/projectile-visual-profiles.json) に保存した。

この一致は数値の出典と転記の確認である。本家の頂点・しずく輪郭・連結メッシュ・曲がる履歴尾・shader・texture・material時間変形を復元した証拠ではない。Nintendo実機11.3.0の同じカメラ／ギア／入力条件での比較は未実施。新しい分類はブキごとの手続き描画を選ぶための判断であり、抽出された本家mesh分類という意味ではない。

## 出典と単位を混ぜない

[固定した抽出原本](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon) が数値の根拠。[日本語のパラメータ調査](https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/メイン) は `DrawSizeParam` を見た目のサイズとして説明し、衝突・塗りの項目と分けている。尾の識別子や詳細意味には未確定の記述が残る。[Inkipediaの調査者によるShooter表](https://splatoonwiki.org/wiki/Template:Shooter_data_S3) もmotion/paint/collisionの既定値を記載するが、通常11.3.0 Shooterの描画半径や尾既定値を回復する資料ではない。

| 値 | 原本の扱い | INKWAVEでの変換／限界 |
| --- | --- | --- |
| `DrawSizeParam.InitRadius/EndRadius` | 描画用のnative数値をそのまま保存 | 現行bridgeはsource→world係数1。pixel・metre換算や実機の見た目寸法を独立測定していない |
| `ChangeFrame/TailSolidFrame/MaxLengthFrame` | 60Hzのframe数 | 秒へは÷60。0F／未記載／tail長0を区別する |
| `AfterOffset*Radius` | 群のindexごとのoffset値 | 群内indexで加算。別の群まで一つのlinear rampにしない |
| `CollisionParam` | 敵・地形への判定 | 描画幅の証拠にしない |
| `PaintParam` | 着弾塗り・地形への跡 | 空中の弾輪郭や厚さの証拠にしない |
| `FourPetals*RadiusRate` | 原本の係数を保持 | Nintendoの正確な描画／塗りでの用途は未確認。4枚のmeshを復元したとは扱わない |
| source速度2.266/F（Splattershot） | 原本のmove値 | 係数1なら135.96 world/s。Wikiの運動記述では22.66DU/Fという慣例があるが、描画半径をmetreへ確定する根拠にはしない |

Wikiの個別性能表の版は武器ごとに異なる。過去の [65件個別Wiki監査](inkwave-main-weapons-wiki-audit-2026-10-11.json) のURLと表示版を各recordへ再利用した。今回新しく全65ページを取得したという主張ではない。特に6スロッシャーとローラーについては今回ページを読み直し、分類に関係する群構成と例外を確認した。数値原典11.3.0はこれらWikiの別版の性能値で上書きしない。

## 指定された3ブキのraw値

### WeaponShooterNormal（スプラシューター）

[原本](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json) SHA-256 `dfca9f45fd0df3b6afab8f6ec0e47034912f3a6fc411936b9fd7257fe85c4cb9`。

このsparse JSONには `DrawSizeParam`、明示的draw半径、`spl__BulletShooterTailLengthParam` がない。**通常Shooterのtail既定値はnull／未確認**。調査開始時のINKWAVEが使う2F fallbackはプロジェクトの校正値であり、本家raw指定値というラベルを付けない。3Fも6スピナーの明示値であり、通常Shooterに移植して既定値としない。全14 Shooterと全6 Maneuverでも同tail parameterが不在だった。

1.0.0 mission用 `WeaponShooterMissionLv3.DiffusionTailLengthParam` は `$type=spl__BulletShooterTailLengthParam`、`MaxLengthFrame=10`。提供RE packの「別type」という表現は誤りで、**別slot・別mission・別版**が正確。これも通常11.3.0 Shooterの10F既定値の証明にはならない。

### WeaponRollerNormal（スプラローラー）

[原本](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json) SHA-256 `5b423eb35d4cac268a1e4085ec8321d27639ddbfc8f3775bb65696af5c2449c7`。

| 群・unit | raw BulletNum | raw InitRadius | raw EndRadius | raw ChangeFrame |
| --- | ---: | ---: | ---: | --- |
| WideSwingUnitGroupParam.Unit[0] | 12 | 0.30 | 0.30 | 未記載 |
| WideSwingUnitGroupParam.Unit[1] | 未記載 | 0.30 | 0.30 | 未記載 |
| VerticalSwingUnitGroupParam.Unit[0] | 未記載 | 0.36 | 0.36 | 未記載 |
| VerticalSwingUnitGroupParam.Unit[1] | 2 | 0.36 | 0.36 | 未記載 |
| VerticalSwingUnitGroupParam.Unit[2] | 2 | 0.36 | 0.36 | 未記載 |

drawのpointerは各unitの `/UnitParam/DrawSizeParam`。未記載BulletNumを原本に1と記載されているように報告しない。横0.3・縦0.36の同一群内のhead半径を、扇の中央ほど大きいrandom rampで変えない。これらの半径だけから扇の連結状態・薄い液膜・裂け輪郭・厚さは確定できない。[個別Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/スプラローラー) の横／縦振り区別とも別々に扱う。

### WeaponSlosherStrong（バケットスロッシャー）

[原本](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherStrong.game__GameParameterTable.json) SHA-256 `1d20043ad7efaf2831801afbce601fb1e14bfd11947063903c6fadd6c98f5298`。

| UnitGroupParam.Unit | raw BulletNum | delay F | InitRadius | EndRadius | Init/End offset | TailID |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| [0] | 0 | 0 | 1.2 | 1.2 | +0.4/+0.4 | 0 |
| [1]・前群 | 4 | 0 | 0.5625 | 1.0 | −0.05/−0.03 | 0 |
| [2]・後群 | 5 | 4 | 0.6 | 0.6 | −0.1/−0.1 | 0 |

3unitとも `ChangeFrame=0`、`TailLengthMin=0.5`、`TailLengthMax=4`、`TailSolidFrame=5`、`TailLengthMaxLastTail=-1` が明示される。`-1`のengineでの意味は未回復。unit0は0発なのでactive4+5へ数えない。

AfterOffsetDelayFrameは前群1F・後群2Fで、放出予定frameは前群0/1/2/3F、後群4/6/8/10/12F。これはrawからの群の時系列であり、ゲーム内での放出／判定時計の一致は別の確認。

前群の初期半径は0.5625／0.5125／0.4625／0.4125、最終半径は1.00／0.97／0.94／0.91。後群は初期／最終とも0.60／0.50／0.40／0.30／0.20。現行INKWAVEはChangeFrame0を即最終値として扱うが、そのinterpolation解釈と尾を速度履歴から構成する法則はNintendoの未回復rendererを証明しない。係数1、solid窓5/60秒、tail min0.5/max4の数値は独立して保持する。[個別Wiki](https://wikiwiki.jp/splatoon3mix/ブキ/バケットスロッシャー) の群区別を9発の一列rampへ潰さない。

## スロッシャー派生を同じsheetにしない

| sourceActor／ブキ | 明示数値／Wikiの記述 | 描画分類に必要な区別 |
| --- | --- | --- |
| Strong／バケット | active4+5、TailID0 | bucketの前／後群。半径・tail値は本家数値、連結meshは手続き近似 |
| Diffusion／ヒッセン | unit数4、TailID0/0/1/2、tail max2 | [3方向の放出](https://wikiwiki.jp/splatoon3mix/ブキ/ヒッセン)。枝を一つのbucket sheetへ混ぜない。unit0のoffsetで0／負になる半径はgeneric球fallbackへ変えない |
| Launcher／スクリュー | core半径0.1、伴随unit半径0 | [渦判定のunitは不可視](https://wikiwiki.jp/splatoon3mix/ブキ/スクリュースロッシャー)。coreの螺旋VFXは近似で、4つの判定代理へ球を描かない |
| Bathtub／オーバーフロッシャー | draw growth5F、unit0=0.16→0.8、unit1=0.104→0.52＋offset; tail min/max/solid=0 | [跳ねる泡状ショット](https://wikiwiki.jp/splatoon3mix/ブキ/オーバーフロッシャー)。独立bubbleを保つ。球形を全ブキで無条件禁止することも原典に反する |
| Washtub／エクス | 1発、半径0.7、tail max4/solid1F | [地形で爆発する砲弾](https://wikiwiki.jp/splatoon3mix/ブキ/エクスプロッシャー)。bucket連結sheetへ混ぜない |
| Double／モップリン | 8+8、delay0/8F、TailID0/1、end1.4−0.16i／1.2−0.14i | [2連続の放出](https://wikiwiki.jp/splatoon3mix/ブキ/モップリン)。二つの放出時刻と枝を独立して残す |

Dynamoの横第2unitはinit0.3/end0.55でChangeFrameは未記載、Flingza縦の第3／4unitは主群0.48と異なる0.08、Inkbrushの第2unitはinit0.2/end0.35でChangeFrame未記載。これらもrootのSplat Roller値を一律流用しない。全6スピナーの `MaxLengthFrame=3` は各原本で明示されている。Brellaのgroup `DrawRadius`、Stringerのdebug `DrawParam`、Saberの `SplashDrawRadius` はprovenance JSONへ保持したが、debug表示disabledのcapsuleをretail矢meshと同じと判定しない。

## 公開60fps動画の取得と限界

Nintendoの [現行公式ページ](https://www.nintendo.com/jp/switch/av5ja/index.html) のHTMLは [nawabari_pc.mp4](https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/nawabari_pc.mp4) を直接参照する。2026-10-11T05:16:26Zに取得、9,569,787 bytes、SHA-256 `5e933a5ce4b6695ca07b12777298ad5bf5eee82b5ce50ba0f90141382d5e8640`。ffprobeでH.264、996×560、avg/r frame rateとも60/1、1526frames、25.433333秒を確認し、decodeと目視を実施した。

選択はdecode先頭をn=0とし、n636〜641（PTS10.600000〜10.683333秒）、n942〜947（PTS15.700000〜15.783333秒）。地形・移動・複数プレイヤー・カメラを含むインク飛行を確認した。原本fpsとPTSは確認したが、これは編集された無版表示の販促動画で、AP／入力edge／撮影版が不明。通常Shooter尾の2F既定値や、11.3.0のピクセル一致をこの短いsequenceから決定しない。bucketの単独スローはこの選択で得られていない。

Inkipediaの [Splattershot販促ファイルページ](https://splatoonwiki.org/wiki/File:S3_About_videos_05_-_Splattershot.mp4) はNintendoの日本語S3サイト出典・2022-04-26 uploadを確認できた。しかし直接media取得は403、web経由はvideo/mp4非対応だった。今回decodeできていないので、このcandidateを60fps実測済みや本家tail測定済みと報告しない。

## 全65件の描画選択分類

sourceActorをキーにする。`family=slosher`だけでbucketのsheetを選ばない。Shooter／Dualies／Splatlingは弾ごとのtail、Roller／Brushは振りごとの飛沫、他種は爆発弾・streak・散弾・矢・斬撃を分ける。この表は推奨分類とデータcoverageであり、全65種のretail形状一致という受け入れ判定ではない。

| INKWAVE ID | 名前 | 固定sourceActor | rendererMode |
| --- | --- | --- | --- |
| `s3-shooter-short` | Sploosh-o-matic | `WeaponShooterShort` | `shooter-family-bullet` |
| `s3-shooter-first` | Splattershot Jr. | `WeaponShooterFirst` | `shooter-family-bullet` |
| `s3-shooter-precision` | Splash-o-matic | `WeaponShooterPrecision` | `shooter-family-bullet` |
| `s3-shooter-blaze` | Aerospray MG | `WeaponShooterBlaze` | `shooter-family-bullet` |
| `shooter` | Splattershot | `WeaponShooterNormal` | `shooter-family-bullet` |
| `s3-shooter-gravity` | .52 Gal | `WeaponShooterGravity` | `shooter-family-bullet` |
| `s3-shooter-quickmiddle` | N-ZAP '85 | `WeaponShooterQuickMiddle` | `shooter-family-bullet` |
| `s3-shooter-expert` | Splattershot Pro | `WeaponShooterExpert` | `shooter-family-bullet` |
| `s3-shooter-heavy` | .96 Gal | `WeaponShooterHeavy` | `shooter-family-bullet` |
| `s3-shooter-long` | Jet Squelcher | `WeaponShooterLong` | `shooter-family-bullet` |
| `s3-shooter-quicklong` | Splattershot Nova | `WeaponShooterQuickLong` | `shooter-family-bullet` |
| `s3-blaster-short` | Luna Blaster | `WeaponBlasterShort` | `blaster-explosive-glob` |
| `blaster` | Blaster | `WeaponBlasterMiddle` | `blaster-explosive-glob` |
| `s3-blaster-long` | Range Blaster | `WeaponBlasterLong` | `blaster-explosive-glob` |
| `s3-blaster-lightshort` | Clash Blaster | `WeaponBlasterLightShort` | `blaster-explosive-glob` |
| `s3-blaster-light` | Rapid Blaster | `WeaponBlasterLight` | `blaster-explosive-glob` |
| `s3-blaster-lightlong` | Rapid Blaster Pro | `WeaponBlasterLightLong` | `blaster-explosive-glob` |
| `s3-blaster-precision` | S-BLAST '92 | `WeaponBlasterPrecision` | `blaster-explosive-glob` |
| `s3-shooter-triplequick` | L-3 Nozzlenose | `WeaponShooterTripleQuick` | `shooter-family-bullet` |
| `s3-shooter-triplemiddle` | H-3 Nozzlenose | `WeaponShooterTripleMiddle` | `shooter-family-bullet` |
| `s3-shooter-flash` | Squeezer | `WeaponShooterFlash` | `shooter-family-bullet` |
| `s3-roller-compact` | Carbon Roller | `WeaponRollerCompact` | `roller-splash-sheet` |
| `roller` | Splat Roller | `WeaponRollerNormal` | `roller-splash-sheet` |
| `s3-roller-heavy` | Dynamo Roller | `WeaponRollerHeavy` | `roller-splash-sheet` |
| `s3-roller-hunter` | Flingza Roller | `WeaponRollerHunter` | `roller-splash-sheet` |
| `s3-roller-wide` | Big Swig Roller | `WeaponRollerWide` | `roller-splash-sheet` |
| `s3-brush-mini` | Inkbrush | `WeaponBrushMini` | `brush-splash-fan` |
| `s3-brush-normal` | Octobrush | `WeaponBrushNormal` | `brush-splash-fan` |
| `s3-brush-heavy` | Painbrush | `WeaponBrushHeavy` | `brush-splash-fan` |
| `s3-charger-quick` | Classic Squiffer | `WeaponChargerQuick` | `charger-streak` |
| `charger` | Splat Charger | `WeaponChargerNormal` | `charger-streak` |
| `s3-charger-normalscope` | Splatterscope | `WeaponChargerNormalScope` | `charger-streak` |
| `s3-charger-long` | E-liter 4K | `WeaponChargerLong` | `charger-streak` |
| `s3-charger-longscope` | E-liter 4K Scope | `WeaponChargerLongScope` | `charger-streak` |
| `s3-charger-light` | Bamboozler 14 Mk I | `WeaponChargerLight` | `charger-streak` |
| `s3-charger-keeper` | Goo Tuber | `WeaponChargerKeeper` | `charger-streak` |
| `s3-charger-pencil` | Snipewriter 5H | `WeaponChargerPencil` | `charger-streak` |
| `slosher` | Slosher | `WeaponSlosherStrong` | `slosher-bucket-sheet` |
| `s3-slosher-diffusion` | Tri-Slosher | `WeaponSlosherDiffusion` | `slosher-triple-sheet` |
| `s3-slosher-launcher` | Sloshing Machine | `WeaponSlosherLauncher` | `slosher-spiral-core` |
| `s3-slosher-bathtub` | Bloblobber | `WeaponSlosherBathtub` | `slosher-discrete-bubbles` |
| `s3-slosher-washtub` | Explosher | `WeaponSlosherWashtub` | `slosher-explosive-glob` |
| `s3-slosher-double` | Dread Wringer | `WeaponSlosherDouble` | `slosher-paired-sheets` |
| `s3-spinner-quick` | Mini Splatling | `WeaponSpinnerQuick` | `shooter-family-bullet` |
| `splatling` | Heavy Splatling | `WeaponSpinnerStandard` | `shooter-family-bullet` |
| `s3-spinner-hyper` | Hydra Splatling | `WeaponSpinnerHyper` | `shooter-family-bullet` |
| `s3-spinner-downpour` | Ballpoint Splatling | `WeaponSpinnerDownpour` | `shooter-family-bullet` |
| `s3-spinner-serein` | Nautilus 47 | `WeaponSpinnerSerein` | `shooter-family-bullet` |
| `s3-spinner-hypershort` | Heavy Edit Splatling | `WeaponSpinnerHyperShort` | `shooter-family-bullet` |
| `s3-maneuver-short` | Dapple Dualies | `WeaponManeuverShort` | `shooter-family-bullet` |
| `dualies` | Splat Dualies | `WeaponManeuverNormal` | `shooter-family-bullet` |
| `s3-maneuver-gallon` | Glooga Dualies | `WeaponManeuverGallon` | `shooter-family-bullet` |
| `s3-maneuver-dual` | Dualie Squelchers | `WeaponManeuverDual` | `shooter-family-bullet` |
| `s3-maneuver-stepper` | Dark Tetra Dualies | `WeaponManeuverStepper` | `shooter-family-bullet` |
| `s3-maneuver-long` | Douser Dualies FF | `WeaponManeuverLong` | `shooter-family-bullet` |
| `s3-shelter-normal` | Splat Brella | `WeaponShelterNormal` | `brella-pellet-fan` |
| `s3-shelter-wide` | Tenta Brella | `WeaponShelterWide` | `brella-pellet-fan` |
| `s3-shelter-compact` | Undercover Brella | `WeaponShelterCompact` | `brella-pellet-fan` |
| `s3-shelter-focus` | Recycled Brella 24 Mk I | `WeaponShelterFocus` | `brella-pellet-fan` |
| `s3-stringer-normal` | Tri-Stringer | `WeaponStringerNormal` | `stringer-arrow` |
| `s3-stringer-short` | REEF-LUX 450 | `WeaponStringerShort` | `stringer-arrow` |
| `s3-stringer-explosion` | Wellstring V | `WeaponStringerExplosion` | `stringer-arrow` |
| `s3-saber-normal` | Splatana Stamper | `WeaponSaberNormal` | `splatana-slash` |
| `s3-saber-lite` | Splatana Wiper | `WeaponSaberLite` | `splatana-slash` |
| `s3-saber-heavy` | Mint Decavitator | `WeaponSaberHeavy` | `splatana-slash` |

## 検証結果と未確認事項

今回のsource転記検証は、全65個のmodule export・pin・sourceActor・SHA-256、全52unitのdrawSize／bulletNum／delay／FourPetals係数を取得原本と比較して成功した。明示0と未記載null、Shooter tail null、Spinner tail3、Machineのunit[1]の明示半径0を区別する。`projectile-visual-source-data.mjs` は32816bytesで、gameplayカタログ・既存profile・衝突値・塗り値を変更していない。

このsource監査自身はrenderのWebGL検証、online replay、resource reuse、30/60/120Hzの描画比較を実施する所有者ではない。それらはrenderer／regression laneと統合reportに分ける。Nintendo実機11.3.0で同条件のframe列を採り、mesh厚さ／裂け／尾の曲がり／正確なwidth／VFXのtexture・材質を照合する作業は未確認として残る。

