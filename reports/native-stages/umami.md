# ナンプラー遺跡 / Um’ami Ruins (`umami`)

このステージは固定公開ソースの表示メッシュを INKWAVE の既存キャラクター、ブキ、7 bot、ミニマップ、ルール、マルチプレイヤーに接続するローカル推定実装。スプラトゥーン3 11.3.0 と同じ当たり判定・塗り条件・配置だとは判定しない。検証数値は [umami-verification.json](umami-verification.json) に記録する。

- 比較対象: `inkwave-public/`、KiTrix `0611f51b35c9736ee986fb2218461e2585b7875e` の `Vss_Factory00`。
- 11.3.0 `VersusSceneInfo` と `SceneInfo` は `Vss_Factory00` / ナンプラー遺跡 / `Model/Fld_Factory00.bfres` の名称とモデル識別だけを裏付ける。公開 OBJ の抽出バージョン、日付、単位一致は未確認。
- source tree: `232d0e5ba4b69b74a7fa044da5b7c15c8ee273f5`。OBJ は 59,818,484 bytes、SHA256 `9d7c261d324d514148499d2ab804b49b05e0394bdc74e46b6e6afb0fff664d3b`。
- 隔離した LFS smudge は `Resource not accessible by integration`。公開 media URL で同一 OID とサイズを取得。MTL と全 378 PNG（合計 379 ファイル）は固定 Git blob SHA1 と byte 数を照合。
- 独立した原文逐次読み取りで 486,036 個ずつの位置・法線・UV、1,170,666 indices / 390,222 triangles が保存済み Float32/Uint32 render buffers と完全一致。converter parser を比較側で再使用しない。Worker/Python の collision・flags・objects・triangleFace・polygon mask の一致も別途確認する。

## 支持面と推定条件

`definitions/umami.json` だけを追加して、共有 catalog discovery と Worker へ同じ定義を配布する。対向 pads `[-18,13.5,-73]` / `[18,13.5,73]` は原文 `Fld_Factory00_floorA_20_1__FloorRubber00` の上向き floor 支持。実際の raycast 高さ 13.5、normal `[0,1,0]`、既存 player radius に 0.04 を加えた capsule が通る。元の敵陣側を同じ岸の点に差し替えない。bounds X±46.5 / Z±79.5 は元の FloorSeat / FloorRubber / floor edges の範囲から選択した INKWAVE の対話範囲。

共通 `PackPnt/Var/Vlf/Vgl/Vcl` 判定は Pnt のみを有効にし、ranked 別モデルも全原始 vertex/index buffers に保持する。追加の nonPaintable patterns は `^FldObj_Factory00_PackPnt_.*GeneralBoxNoPaint_` と `^Fld_Factory00_floorA_np_` のみ。前者は明記された NoPaint box 2 objects（X±18,Y6–12,Z±46.5 と X±39,Y12–13.5,Z±37.5）、後者は `_np_` floor object（X−50.7976–43.5,Y3.01–21.06,Z−68.7017–63.06）。collision と表示は保持し、paint chart だけを除外する。名前からの推定であり retail flag を復元したとはしない。roof や障害物を都合よく削除しない。

source-named underwater bottoms `Fld_Factory00_pPlane590_1__GroundWater00_va` と `Fld_Factory00_pPlane644_1__GroundWater00` は anchored exact-name nonCollidable patterns で表示のみ保持する。220 triangles、bounds X±23.99/Y−8.4–−2.9254/Z±62.47 と X±24/Y−8.4–−7.0604/Z±59.705 は既存 water fall threshold −1.45 より下にある。原文表示 buffers は変えず、低い水底を通常床と判定して落下後も生存する推定誤りを修正した。`[−20,−2,−46]` で既存 Actor の実落下死亡と元 source floor pads の支持・route を再検査する。

source crane 部分は原文座標のまま保持する。吊り材 object は X±0.3541,Y−52.9109–0.0263,Z±2.25、主 crane は X±62.5337,Y1.8085–65.6882,Z±15.4098。動的変換・状態・本家配置データはないので、その位置・アニメーションを捏造しない。対向 floor pads と playable component はこの静的 export で確認する。

## 挙動差分と再現

| 項目 | 本家の根拠と条件 | INKWAVE / 再現 | 影響・判定 |
| --- | --- | --- | --- |
| 初期発射・復活・向き | 11.3.0 の名称識別のみ。本家着地点とカメラの実機値は未計測 | 既存 `native-spawn.mjs`、双方 pads、fixture shooter/default gear、乾いた floor、fire で launch、death→respawn、30/60/120 Hz | 元の支持面へ着地して対向側へ向く。ローカル確認、本家一致未確認 |
| 歩行・段差・壁 | console の微入力、加速、停止、旋回、坂速度の実機記録なし | `NativePhysics` と既存 Actor を使用。30/60/120 Hz に 0.2 s full inward walk。原文 wall の自 ink で climb、敵 ink に置換すると release | source geometry を使用。フレーム間隔の差を記録し、本家のフレーム値と断定しない |
| 塗り・泳ぎ・turf | native paint/grate/climb masks は未回収 | polygon mask の hole は CPU ownership と turf に算入しない。Worker と Python の mask が一致 | display から推定した chart。Nintendo の masks・material shader は未確認 |
| ranked | 本家 zones、tower、rainmaker、clams の配置未回収 | 共通 SCC を双方の spawn から directed reachability で選び、そこに local objectives を配置 | Pnt 表示層を各モードで使うローカル校正。retail ranked geometry / route / score placement の一致未確認 |
| 表示・性能 | Switch / 実スマホの未計測 | 元の source attribute order と indexed culling、A/A・B/B・A/B pixels、8 actors、12 moving cameras、Chromium SwiftShader | software GL 診断値のみ。実機 FPS 判定に代用しない |
| online | console netcode の再現は主張しない | 実 WS と production RoomDurableObject、2 peers / 8 actors、各ローカルモード、実 paint replay と full CPU grid 比較 | fingerprint / ownership のローカル整合を確認する |

0.2 s inward walk の移動距離は 30 Hz 0.784、60 Hz 0.738、120 Hz 0.715 source units。双方チーム、初期 launch と death respawn で同じ結果が出た。接地は全条件で維持したが、この差を本家との一致として扱わない。source 単位と本家速度は未確認。

水底補正の実比較は `[−20,−2,−46]`、同じ Actor / 1/60 s / no fire・no move。補正前は groundHeight −8.05 が残り alive、補正後は below-water support がなくなり splat。

保存された OBJ / MTL / PNG / derived buffers / detailed logs / screenshots は ignored private directories に限る。公開 build に source payload を含めず、ブラウザで固定原本を検証して取得する。公開 commit は stage 定義、stage 専用回帰検査、本文と数値要約だけ。
