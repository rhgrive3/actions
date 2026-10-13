# ゴンズイ地区 / Eeltail Alley 原典統合

対象は `eeltail` / `Vss_District00` のみ。作業開始 SHA は `996a30c93d4a01d5f2924c7316f132e56adb229a`。main にはマージしない。原典と画像は ignored の `.codex-stage-sources/` / `.browser-evidence/` に保存する。

## 原典と配置の根拠

KiTrix は commit `0611f51b35c9736ee986fb2218461e2585b7875e`、ステージ tree `a9c61480637edfe4a2482a9d3e2e189294867f60` を固定する。OBJ の LFS OID は `5d22e97f51ed26fed86035ccff8c5d88e99798bf135b0f01b527a6f26797599f`、サイズは 126,375,025 bytes。隔離 LFS smudge は `Resource not accessible by integration` で取得不可だったため、公開 media URL から取得し SHA-256 / サイズを照合した。MTL blob `5323d98774c08c76302e36d20b613969b9a27d2f` と 349 PNG は pinned Git blob を照合済み。変換が参照する 280 PNG は原典と byte-identical。

`Leanny 1130 SceneInfo.json` の `Vss_District00` はラベル「ゴンズイ地区」、`Model/Fld_District00.bfres`、`SequenceName: Versus` を確認できるが、座標・衝突・ルール別配置を持たない。OBJ 座標は Y-up float32 のまま変換し、スケール・平行移動は適用しない。実機の単位・11.3.0 との形状一致は未確認。

bounds は中央の基盤、Pnt の足場、`Fld_District00_Gound7_1__MetalPlate00` の X=±28.5 と `Fld_District00_Edge241_1__SlopeConcreate00` の Z=±98 から選んだコア領域。背景都市や周囲の非塗装路面の AABB 全体をゲーム範囲には使わない。表示・推定衝突三角形は切り詰めない。

spawn は `Fld_District00_Gound4_1__RubberTile00` の Y=15 支持を実測した `[-7.5,15.08,-93]` と `[7.5,15.08,93]`。0.08 はローカル接触余白。両点で normal `[0,1,0]`、bodyFits が成立し、中心地面 `(0,6,±0.5)` へ 94 / 95 ノードの directed Nav path がある。spawnBarrier=2.5 は共通ゲームのローカル推定値。Nintendo の本来の spawn / landing 配置ではない。

## 検証と実機比較の区別

原典対生成の比較は positions / normals / UV / 全 local indices の float32 / uint32 完全一致。1,056,904 vertices、763,146 render triangles。共通分類器による active=188、inferred collidable=113、collisionTriangles=211,969、paintFaces=67,563。法線・名前・素材から分類した表示三角形であり、ネイティブの衝突データや塗りマスクではない。

スプラトゥーン3の操作速度・入力閾値・旋回・停止距離・泳ぎ・インク回復・被弾/復活・カメラの実機比較は未確認。本作の統合検証を実機一致の判定には使わない。ブキ・ギア・状態・フレーム間隔を各検証の条件として記録する。

## 表示専用 Shadow の分類

`^Fld_District00_Shadow0__Shadow$` だけを `sourceSemantics.nonCollidableObjectPatterns` に指定する。530 triangles の当該表示オブジェクトは AABB `[-121.5047,-8.9225,-113.3141]`–`[131.4187,96.6,185.0925]` を持つ。この source-name / bounds から表示用の影と推定し、衝突と塗りから除外した。全 vertices / indices / UV / normals と当該オブジェクトの描画は保持する。元の衝突フラグを復元したという判定ではない。

この変更で paint grid は 7,261,207 → 2,430,264 cells、valid cells は 3,720,546 → 1,306,737、低品質 2048 atlas の密度は 1.6384 → 2.56 pixels/unit。影の大きな投影面をインク所有やスコアに含めない。表示三角形 763,146 は不変。

## Node 検証

source-aware native suite は 16 pass / 0 fail / 0 skip。JavaScript worker conversion と Python conversion の render attributes / indices / collision / flags / polygon masks が完全一致。実 source の spawn support、paint ownership と空洞、own-wall squid climb と enemy-wall release、30/60/120 Hz の地面接触、Nav、Squid Spawn launch→landing、bot paint-goal の directed reachability、ガチ4ルールのローカル較正を確認した。

[Eeltail movement verifier](../../scripts/check-inkwave-native-eeltail-movement.mjs) は実 source の `(5,6,-15)` の支持地面に composed Actor / main-weapon catalog を置き、0 AP の `s3-shooter-first`、0.5 秒、30/60/120 Hz render schedule → fixed 60 Hz logic の条件で歩行・0.1 入力・停止・90度旋回・反転・射撃移動・自インク泳ぎ・敵インク・ジャンプ・インク回復を確認する。10 cases 全て schedule difference=0。射撃は実 main admission で6 projectiles / ink消費、射撃移動速度4.56、歩行6.24。自インク泳ぎ12.096、敵インク1.44でhp100→91、回復ink50→65.1515。これらはゲームのローカル測定値であり、実機の速度・単位・フレーム値との一致を主張しない。Character / audio の fixture 表示は stub、移動・接触・武器 admission は composed runtime / source triangles を使う。

共通 foundation `a84009de` は中心の高い2ノード支柱 `(0,13.5,-0.5)` をガチ中心に選ぶ問題を修正した。両チームから到達できる paint-floor SCC 内の地面 `(0,6,-0.5)` を使い、tower path は86 nodes。元のガチ placement は未確認のまま。

## 再実行

原典を pinned hash で検証して取得した後、単一 private conversion と各検証は次で再実行できる。原典パスはローカル配置に合わせる。`.browser-evidence/` の画像と raw JSON はコミットしない。

```sh
python3 patches/native-stages/tools/build-native.py --source .codex-stage-sources/eeltail-KiTrix/stages --out .codex-stage-sources/generated --stages eeltail
INKWAVE_NATIVE_STAGE_SOURCE="$PWD/.codex-stage-sources/eeltail-KiTrix/stages" INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node --experimental-vm-modules --test patches/native-stages/tests/*.test.mjs
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node --experimental-vm-modules scripts/check-inkwave-native-eeltail-movement.mjs
node scripts/build-inkwave.mjs inkwave-public _site-native-eeltail-public
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node scripts/build-inkwave.mjs inkwave-public _site-native-eeltail-local
```

Chromium は各コマンドを `flock /workspace/actions/.ci-scratch/native-stage-browser.lock` で排他実行する。

```sh
NATIVE_STAGE_IDS=eeltail node scripts/check-inkwave-native-source-browser.mjs _site-native-eeltail-public .browser-evidence/eeltail-source-browser
NATIVE_STAGE_IDS=eeltail node scripts/check-inkwave-native-stages.mjs _site-native-eeltail-local .browser-evidence/eeltail-gameplay
NATIVE_STAGE_IDS=eeltail node scripts/check-inkwave-native-online.mjs _site-native-eeltail-local .browser-evidence/eeltail-online
NATIVE_STAGE_IDS=eeltail NATIVE_RENDER_MOVING=1 node scripts/check-inkwave-native-render.mjs _site-native-eeltail-local .browser-evidence/eeltail-render
NATIVE_STAGE_IDS=eeltail NATIVE_MOBILE_STAGE_IDS=eeltail node scripts/check-inkwave-native-lifecycle.mjs _site-native-eeltail-local .browser-evidence/eeltail-lifecycle-final
```

数値要約: [eeltail-verification.json](eeltail-verification.json)。11.3.0 の native collision / paint mask / spawn / ranked placement はこの検証でも未確認のまま。

## Chromium の検証状態

2026-10-13 時点で原典の公開 direct download / worker conversion / 8 actors・7 bots / Squid Spawn landing / private cache hit（追加OBJ download=0）/ damaged OBJ reject と Tidewater retain は実 Chromium で確認した。shared source checker の same-map reuse と world-only Tidewater preparation による false timeout / stale actor error は checker 側で修正した。失敗 raw evidence も ignored 領域に残す。同じ immutable build で public source / Turf実ゲーム / ガチ4プローブ / online 5 modes / render A/B は positive。lifecycle は修正 checker (`60cbfb49`) で全て pass。high/low quality で CPU paint / triangles / physics / Nav 保持、実1回の damaged geometry fetch を integrity reject して live level / paint / display 保持、native preparation cancel → Tidewater の native groups=0、switch後の resource counts復元を確認した。touch viewport 844×390で8 actors / grounded / Squid Spawn終了、errors=0。先の same-map no-op による checker failure は失敗診断として保存し、game code を変えずに real production build seam で再検証した。最終 foundation の変更挙動確認は進行中。

Chromium / SwiftShader の timing はソフトウェアGLの診断値。モバイル emulation は viewport / touch の動作確認であり、実機GPUのfpsではない。


実ゲーム（immutable `a84009de` foundation + Eeltail Shadow 分類）では8 actors全員alive / 7 bots、localは `[-7.43906,12,-81.00015]` のsource支持に着地・grounded。CPU 180 framesの p50=10.2ms、p95=28.9ms。zones capture、tower dynamic floor/rider、rainmaker barrier/pop/pickup、clam pickupとsnapshotを確認した。Online は2 peers / actual WebSocket / production RoomDurableObject、Turf CPU grid SHA-256が205 settling frames後に一致、ガチ4のhost count snapshotも一致。全 browser errors=0。

render A/Bはsame scene / actual camera / actors / paintの条件で、gameplay・center・overhead各480×320のstage pixelsでchangedPixels=0、self variation=0。Renderとmoving frustum12 framesでsource positions / CPU paint / physics / navのauthorityは不変。Ink trianglesは135,250 → 129,135（gameplay）、80,737（center）、130,383（overhead）。Render p50はgameplay baseline9.0ms / chunked9.7msなので、このsoftware GL測定から速度向上を主張しない。Pnt geometryとretail ranked layoutの一致も主張しない。
