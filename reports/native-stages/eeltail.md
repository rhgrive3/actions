# ゴンズイ地区 / Eeltail Alley 原典統合

対象は `eeltail` / `Vss_District00` のみ。作業開始 SHA は `996a30c93d4a01d5f2924c7316f132e56adb229a`。main にはマージしない。原典と画像は ignored の `.codex-stage-sources/` / `.browser-evidence/` に保存する。

## 原典と配置の根拠

KiTrix は commit `0611f51b35c9736ee986fb2218461e2585b7875e`、ステージ tree `a9c61480637edfe4a2482a9d3e2e189294867f60` を固定する。OBJ の LFS OID は `5d22e97f51ed26fed86035ccff8c5d88e99798bf135b0f01b527a6f26797599f`、サイズは 126,375,025 bytes。隔離 LFS smudge は `Resource not accessible by integration` で取得不可だったため、公開 media URL から取得し SHA-256 / サイズを照合した。MTL blob `5323d98774c08c76302e36d20b613969b9a27d2f` と 349 PNG は pinned Git blob を照合済み。変換が参照する 280 PNG は原典と byte-identical。

`Leanny 1130 SceneInfo.json` の `Vss_District00` はラベル「ゴンズイ地区」、`Model/Fld_District00.bfres`、`SequenceName: Versus` を確認できるが、座標・衝突・ルール別配置を持たない。OBJ 座標は Y-up float32 のまま変換し、スケール・平行移動は適用しない。実機の単位・11.3.0 との形状一致は未確認。

bounds は中央の基盤、Pnt の足場、`Fld_District00_Gound7_1__MetalPlate00` の X=±28.5 と `Fld_District00_Edge241_1__SlopeConcreate00` の Z=±98 から選んだコア領域。背景都市や周囲の非塗装路面の AABB 全体をゲーム範囲には使わない。表示・推定衝突三角形は切り詰めない。

spawn は `Fld_District00_Gound4_1__RubberTile00` の Y=15 支持を実測した `[-7.5,15.08,-93]` と `[7.5,15.08,93]`。0.08 はローカル接触余白。両点で normal `[0,1,0]`、bodyFits が成立し、中心地面 `(0,6,±0.5)` へ 94 / 95 ノードの directed Nav path がある。spawnBarrier=2.5 は共通ゲームのローカル推定値。Nintendo の本来の spawn / landing 配置ではない。

## 検証と実機比較の区別

原典対生成の比較は positions / normals / UV / 全 local indices の float32 / uint32 完全一致。1,056,904 vertices、763,146 render triangles。共通分類器による active=188、inferred collidable=112、collisionTriangles=211,969、paintFaces=67,563。法線・名前・素材から分類した表示三角形であり、ネイティブの衝突データや塗りマスクではない。

スプラトゥーン3の操作速度・入力閾値・旋回・停止距離・泳ぎ・インク回復・被弾/復活・カメラの実機比較は未確認。本作の統合検証を実機一致の判定には使わない。ブキ・ギア・状態・フレーム間隔を各検証の条件として記録する。

## 表示専用 Shadow の分類

`^Fld_District00_Shadow0__Shadow$` だけを `sourceSemantics.nonCollidableObjectPatterns` に指定する。530 triangles の当該表示オブジェクトは AABB `[-121.5047,-8.9225,-113.3141]`–`[131.4187,96.6,185.0925]` を持つ。この source-name / bounds から表示用の影と推定し、衝突と塗りから除外した。全 vertices / indices / UV / normals と当該オブジェクトの描画は保持する。元の衝突フラグを復元したという判定ではない。

この変更で paint grid は 7,261,207 → 2,430,264 cells、valid cells は 3,720,546 → 1,306,737、低品質 2048 atlas の密度は 1.6384 → 2.56 pixels/unit。影の大きな投影面をインク所有やスコアに含めない。表示三角形 763,146 は不変。

## Node 検証

初期 immutable foundation `a84009de` の source-aware native suite は 16 pass / 0 fail / 0 skip。JavaScript worker conversion と Python conversion の render attributes / indices / collision / flags / polygon masks が完全一致。実 source の spawn support、paint ownership と空洞、own-wall squid climb と enemy-wall release、30/60/120 Hz の地面接触、Nav、Squid Spawn launch→landing、bot paint-goal の directed reachability、ガチ4ルールのローカル較正を確認した。

[Eeltail movement verifier](../../scripts/check-inkwave-native-eeltail-movement.mjs) は実 source の `(5,6,-15)` の支持地面に composed Actor / main-weapon catalog を置き、0 AP の `s3-shooter-first`、0.5 秒、30/60/120 Hz render schedule → fixed 60 Hz logic の条件で歩行・0.1 入力・停止・90度旋回・反転・射撃移動・自インク泳ぎ・敵インク・ジャンプ・インク回復を確認する。10 cases 全て schedule difference=0。射撃は実 main admission で6 projectiles / ink消費、射撃移動速度4.56、歩行6.24。自インク泳ぎ12.096、敵インク1.44でhp100→91、回復ink50→65.1515。これらはゲームのローカル測定値であり、実機の速度・単位・フレーム値との一致を主張しない。Character / audio の fixture 表示は stub、移動・接触・武器 admission は composed runtime / source triangles を使う。

共通 foundation `a84009de` は中心の高い2ノード支柱 `(0,13.5,-0.5)` をガチ中心に選ぶ問題を修正した。両チームから到達できる paint-floor SCC 内の地面 `(0,6,-0.5)` を使い、tower path は86 nodes。元のガチ placement は未確認のまま。

## 最終 accepted foundation の実ゲーム検証

最終測定 foundation は `68bbcbf7589eb77edb7c741edc9d40fee908c037`。source sphere sweep、対向 pad の camera / aim、spawn-seeded directed Nav、実 Actor での landing、source-supported bot goals、swept Tower clearance / 通常入力 boarding / 両陣側への経路 / arc 中点、全5 mode settled ink SHA checker、News の physical input admission を含む accepted code。Eeltail に未承認 source-drop / climb flags は追加しない。

単一 Eeltail private asset に対する serial CPU suite は 69 tests / 64 pass / 0 fail / 5 skip。skip は private source を持たない Urchin の1 fixture、opted wallsの1 fixture、Flounder shotsの3 fixture。Eeltail の worker/Python buffers・mask、支持、wall swim/enemy release、Nav、initial/死亡後 landing、bot goals は pass。10 movement cases / 30・60・120 Hz schedule の差は全て0。独立した原典 text streaming と生成 float32 positions / normals / UV、全 uint32 indices、MTL / PNG の pinned blob 照合も最終 asset で再実行した。

Nav は12,447 nodes / 6,126 valid。Tower は source-clear な80 waypoints、halfSize=1.2、lift=1.2、arc start index=40。対向 pad 軸への両端投影は ±39.131、全 deck / pole / human envelope radius=2.097 を越えて両陣側に入る。旧86-point / +3.3 local route を使用しない。正常な source floor `[1,6,-1.5]` から physical W + Space による boarding を30/60/120Hzで確認した。全 waypoint と各 segment の3 interior samplesで634 actual capsule deck supportsを確認し、source swept clearance と live rider scoringも pass。6 rule-only KO timings / SourceRanked snapshotsはlocal較正の診断であり、Nintendo placement・速度の確認ではない。

実 Chromium で公開 direct OBJ download / worker conversion / cache hit（追加 OBJ=0）/ altered OBJ rollback は pass。8 actors・7 bots の実ゲーム、ガチ4 rule capture / rider / barrier / pickup / snapshot は pass。controlled source-supported stance の普通の Actor / WeaponRunner / Projectiles shot が source wall に衝突・自然塗りを生成することを30/60/120Hzで確認した。手動 splat を shot の証明にしない。

[stage-specific checker](../../scripts/check-inkwave-native-eeltail-final.mjs) は到達不能な13.5の支柱より下の source floor6を minimap が選び、実 cell2192554のown inkがlive rasterに出ること、levelが現在のNavを保持すること、Viewer flip / spawn floor15を確認した。humanとopposing botのstale combat aimを入れた死亡後 launch / 自然 ground landingを30/60/120Hzの計6 casesで確認した。別の共通 camera checker は genuine menu start / actual canvas pointer lock / physical mouse fire、offline3 + real WebSocket両チーム6 の計9 source landingsを確認。Tidewaterの既存yawは保持した。

Online は production RoomDurableObjectとactual WebSocketの2 peers / 8 actors、Turf・Zones・Tower・Rainmaker・ClamsすべてのCPU ink grid SHA-256がgrowth / transport queuesのsettle後に完全一致。host `s3-blaster-short` のsource radius3.84をordered paint transport probeに使う。ranked host countsも一致。camera packets=1,209。全browser errors=0。

Render は original single mesh referenceとのA/A・B/B・A/B、gameplay・center・overhead480×320のpixelsでchanged=0。12 moving camerasでもsource attributes / physics / Nav / CPU paintを保持した。Lifecycle はhigh/low authority保持、実1回のcorrupt vertices fetch rejectionでlive level/paint/display保持、native preparation cancel→Tidewater0groups、legacy/native switchのresource counts復元、844×390 touch viewport / 8 actors / grounded / spawn終了を確認した。fingerprint同一許可・変更/欠落拒否もpass。

公共/単一 private minified buildは両方 startup/file budgets と packaging9/9 pass。公共版にoriginal assetsを含めない。測定hashはnumeric JSONに完全値を記録する。public contentHash `5c8d3178…`、private `1273c471…`、共通inputHash `eb52f598…`。

## 条件と未確認項目

Source OBJ / MTL / textures / generated buffers / screenshotsはignored private pathsのみに保存する。動作は既存game actors / weapons / controllers / bots / minimap / ranked systems / multiplayer上で確認し、source geometryの代わりに手製の足場を置かない。原典identityのみを確認した11.3.0とは、native collision / paint / grate / climb masks、shader、moving object states、transform / units、spawn / ranked placement、console / physical mobile performanceが未確認。`version1130Verified:false`を保持する。

SwiftShaderのtimingはsoftware GL診断値。最終gameplay CPU180framesはp50=21.1ms / p95=46ms / max316ms。chunked gameplay render p50=12.6ms、single mesh reference=8.2msで、速度向上を主張しない。touch emulationのCPU p50=11.9ms / p95=40.9msは実機GPU FPSではない。初期`a84009de`のpositive matrixとhashも別のbaselineとして保存し、最終codeの結果へ読み替えない。

## 再実行

pinned source取得後、重いCPU jobは `flock /workspace/actions/.ci-scratch/native-stage-cpu-heavy.lock` と `--test-concurrency=1`、各Chromium checkerは個別に `flock /workspace/actions/.ci-scratch/native-stage-browser.lock` を付ける。Asset/pathsはローカル配置に合わせる。

```sh
python3 patches/native-stages/tools/build-native.py --source .codex-stage-sources/eeltail-KiTrix/stages --out .codex-stage-sources/generated --stages eeltail
INKWAVE_NATIVE_STAGE_SOURCE="$PWD/.codex-stage-sources/eeltail-KiTrix/stages" INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node --experimental-vm-modules --test --test-concurrency=1 patches/native-stages/tests/*.test.mjs
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node --experimental-vm-modules scripts/check-inkwave-native-eeltail-movement.mjs
node scripts/build-inkwave.mjs inkwave-public _site-native-eeltail-final-public
INKWAVE_NATIVE_STAGE_ASSETS="$PWD/.codex-stage-sources/generated" node scripts/build-inkwave.mjs inkwave-public _site-native-eeltail-final
NATIVE_STAGE_IDS=eeltail node scripts/check-inkwave-native-source-browser.mjs _site-native-eeltail-final-public .browser-evidence/eeltail-source-final
NATIVE_STAGE_IDS=eeltail node scripts/check-inkwave-native-stages.mjs _site-native-eeltail-final .browser-evidence/eeltail-gameplay-final
NATIVE_STAGE_IDS=eeltail node scripts/check-inkwave-native-projectiles.mjs _site-native-eeltail-final .browser-evidence/eeltail-projectiles-final
node scripts/check-inkwave-native-eeltail-final.mjs _site-native-eeltail-final .browser-evidence/eeltail-final
NATIVE_STAGE_ID=eeltail node scripts/check-inkwave-native-camera-basis.mjs _site-native-eeltail-final .browser-evidence/eeltail-camera-final
NATIVE_STAGE_IDS=eeltail NATIVE_HOST_WEAPON=s3-blaster-short node scripts/check-inkwave-native-online.mjs _site-native-eeltail-final .browser-evidence/eeltail-online-final
NATIVE_STAGE_IDS=eeltail NATIVE_RENDER_MOVING=1 node scripts/check-inkwave-native-render.mjs _site-native-eeltail-final .browser-evidence/eeltail-render-final
NATIVE_STAGE_IDS=eeltail NATIVE_MOBILE_STAGE_IDS=eeltail node scripts/check-inkwave-native-lifecycle.mjs _site-native-eeltail-final .browser-evidence/eeltail-lifecycle-current
node scripts/check-inkwave-startup-budget.mjs _site-native-eeltail-final-public
INKWAVE_BUILT_SITE="$PWD/_site-native-eeltail-final-public" node --test scripts/tests/inkwave-build-packaging.test.mjs
```

数値要約: [eeltail-verification.json](eeltail-verification.json)。最終source・実ゲーム・input・online・render・lifecycle checksはすべてpass。小さなchecker-orchestration出力引数ミスも含め、過去の失敗diagnosticはprivate ignored領域に残し、successful retryを別記録した。
