# MAP3 公開版ランタイムへの接続

対象は通常公開ステージ `tidewater` / `kelpline`。`marina` / `cargo` への改名ではない。既存の `halyard`、`cargo`、練習場、native stage の地形データは置き換えない。

設計資料は当時の検証範囲を記録したまま保存する。`design.json` の SHA-256 は `878312eeb34be46d5d6859c2142ed55bc3c6b808fd8c20a91ee9e97f9d31358f`、設計時 sourceHead は `b208addacc61009fba44ae973d5288b6f315f303`。今回接続する公開ソースの確認基準は PR #1985 の `b86f972e02a73b40d3e274455048015ee15d11e5`。これらを同じ版として扱わない。

## 地形と共有 API

`inkwave-public/src/world/stages/map3-data.js` の `MAP3_STAGES` は、設計 JSON の全レコードを保持する。床、坂、遮蔽物、スポーン、26 経路、降下、ルール候補の全フィールドと入力ハッシュをテストで照合する。`map3-layout.js` は `MAP3_LAYOUTS` / `createMap3Layout()` / `getMap3Stage()` を公開し、`maps.js` の既存の `TIDEWATER` / `KELPLINE` に接続する。

`layout.map3` は完全な immutable stage レコード、`layout.map3Source` は入力情報。地形 block の `tag` は元レコードの `id` と一致する。描画・ルール・検査はここから座標を取得できる。両チームの全レコードを `single` に入れ、`half` は空にする。二重ミラーによる面・塗りセルの複製を避ける。

- Tidewater は 39 床・28 坂・22 遮蔽物、5 つの水平高度を持つ。
- Kelpline は 42 床・22 坂・19 遮蔽物、6 つの水平高度を持つ。
- 基底の長方形床は削除され、各床の `bottom..y` を実体にする。水域には見えない支持床を追加しない。
- スポーンは設計どおり Tidewater `(0,4.8,±68)`、Kelpline `(0,6,±68)`。home jump も実際のスポーン床へ戻す。
- 金網は該当床を置換する実 collider。ヒト支持、イカ通過、塗装不可を既存の grate 契約で実現する。
- 通路接合の描画面を削らないよう床・坂の bevel は 0。遮蔽物だけに小さな bevel と材質を設定する。
- `envBoats:false` により、通常の周辺ボートが新しい外周建築と重ならないようにする。

## 既存 R への変換

Level の通常 R は坂を埋める厚い OBB になるため、そのまま使うと下層に侵入する。MAP3 では全坂を `thin:true` とし、設計の垂直厚さ `t=.6` を、法線方向厚さ `t × run / hypot(run,rise)` に変換する。これで同じ XZ の上面と下面の差が設計どおり .6 WU になる。坂の端点、幅、上面の式は保存する。

Level が持つ低端の斜面方向 .6 WU 延長は残る。従って名目の垂直側面スラブと全頂点が同一という主張はしない。実 OBB の上面、下面、延長、接合、身体通過を検査した。Level の汎用坂生成は変更していない。

構造アートの `map3ArtColliders(layout)` が返す追加 collider も最終 terrain 検査に含める。最終の 180 度回転対称版では Tidewater 212 個（桟橋柱 4、遮蔽物・lip 144、市場橋部材 64）、Kelpline 93 個（遮蔽物 85、高架 portal 8）。既存遮蔽物の上の屋根・柱・プランター・積み箱・換気設備・海側 lip の rail に加え、Tidewater の橋アーチと Kelpline の高い横梁を含む。遮蔽物部材の footprint は元の遮蔽物内、Tidewater の橋柱は橋床の端、Kelpline の portal 柱は bridge_edge 内。Kelpline 横梁下面は y=12.76 以上。名目 26 経路や下層床を塞がない。アート側の境界・回転対称性検査に加え、最終 collider を含めた実物理・nav・camera 検査を再実行した。

## ナビゲーションで見つかった実問題

実 NavGraph は Tidewater 8,340 node、Kelpline 11,174 node を生成し、全て最大連結成分に残る。ただし無向の連結だけでは往復経路を保証しないため、全床から両スポーンへの往復、および指定 26 経路の各 waypoint 間の往復を実 A* で確認した。

既存の 6,000 回探索上限では、遠方の高い市場など Tidewater 8 件、Kelpline 6 件の探索が `null` になった。十分な探索予算では経路が存在する。`layout.navPathMaxIter:12000` を追加し、NavGraph.path のデフォルト予算は MAP3 の場合だけこの値を読む。明示予算、通常の他ステージ、native の既存予算を維持する。テストは旧予算での 14 件の失敗を再現した上で、新しいデフォルトの 848 件の有向探索が成功することを確認する。

これに加え、実 BotBrain が Kelpline の金網着地点 `(-26,0,-25)` から `(-26,3.6,-16)` へ復帰し、上層の任意金網へヒト姿のまま進むことを 30/60/120 Hz で確認した。指定するのは目的地のみで、steering・Actor・physics は本番処理。これは BotBrain の全ての選択・操舵が成功するという証明ではない。3.4 WU を超える任意降下の nav edge は追加していない。高い金網からの降下と徒歩・泳ぎの復帰は物理側で別に検査する。

## Clam Blitz の目標選択で見つかった実問題

直線が床・壁で遮られている場合、従来の通常ステージの Clam bot は「目標へ行けない」と判定し、実際に A* 経路が存在しても basket を選ばなかった。`frame.botGoalRoute` は native source stage にしか接続されていなかったため、MAP3 の立体地形で Power Clam を作っても攻撃目標へ進まない。修正前の Tidewater 60 秒テストでは 32 個を拾い Power Clam を 2 個作ったが、throw / score が 0 だった。

`map3-ranked-goals.js` を追加し、ranked/install の frame 作成時に非 native の MAP3 だけへ経路 hook を接続した。目標の実床高度、身体空間、最終 nav node から目標までの短区間の支持・身体空間、有向 A* を確認する。nav / 開始 node / team / 目標 node で結果を保持する。native adapter の接続 anchor と native 判定は変更していない。拾得・投擲・弾・basket 判定を迂回しない。

両 MAP3 ステージで、同じ Power 所持 actor の直接 ray が blocked のとき旧 policy は `null`、新 hook は実 basket への throw 目標になる negative control を保持する。水上・実遮蔽物内部の目標は拒否する。さらに実 BotBrain・Actor・paint・projectile・ranked rule の両ステージ 60 秒テストで、拾得→Power 化→投擲→得点まで成功する。元の 60 秒を延ばして合格させていない。native-ranked-goals-policy / source の既存回帰も成功した。

Tidewater の zone capture / count、拡大 zone、tower 乗車・移動・対戦被弾、Rainmaker shield破壊・取得・escort、最大 charge 射撃・checkpoint も実 simulation で確認する。この fixture は optional source-motion の dynamic import を実行しない場合があり、見た目の実機比較や全 animation の証明には数えない。別の source-loaded #1431 tests では現在の MAP3 床・screen・全 art collider を使って source pose / muzzle / FX / projectile 所有を確認する。

## 下層の塗りを読めるミニマップ

MAP3 に限り、上面の投影と、床が重なる場所の下層投影を別にキャッシュする。下層は上の床・坂の下面で切り、実際に下の床がある XZ だけを変更する。桟橋の非塗装 hidden 支柱は map の床候補から除く。

ローカル actor が高架下へ入り .18 秒続いたら「↓ 下層」、高架から出るか上の床へ上がると「↑ 上層」へ切り替える。足元で判定するため、下層での通常ジャンプで上層に切り替わらない。向き・team flip が変わる場合はキャッシュを再生成し、テーマが変わった古い別レイヤーの背景も再生成する。

同じ XZ の paint cell は引き続き別々。切替時は既存の ink version / dirty invalidation を使って再描画する。静的な配列と背景 canvas は各レイヤーで保持し、再切替では地形を再ラスタライズしない。production の配列再利用処理が別レイヤーの配列を上書きしないよう、新規レイヤー作成時に参照を切り離す。

現段階の HUD の actor・目標アイコンは XZ 表示のまま。全アイコンの在階識別や手動レイヤー選択は実装していない。上層表示が「6 高度のうち最高高度だけ」を意味するわけでもなく、各 XZ の上面投影である。

## 実行した検証と限界

次のコマンドは実際の Level / Physics と、本番 source composition・全 runtime installer を使う。renderer/audio と操作入力、Character の描画、塗りの条件は検査用に制御する。Nintendo 実機やブラウザ描画の代用とはしない。

```bash
node --experimental-vm-modules patches/local-quality/tests/map3-terrain.test.mjs
node --experimental-vm-modules patches/local-quality/tests/map3-terrain-minimap.test.mjs
node --experimental-vm-modules patches/local-quality/tests/bot-navigation.test.mjs
node --experimental-vm-modules patches/splatoon3/tests/ranked-autonomy-integration.test.mjs
```

| 検証 | 結果・範囲 |
|---|---|
| frozen source / 公開 binding | 全レコード・hash・スポーン・部材数・5/6 高度を照合。他の通常 stage に MAP3 metadata がないことを確認 |
| 実 R の OBB | 50 坂の上面、法線厚からの垂直厚、中央下面、.6 toe を確認 |
| 指定経路 | 26 経路・10,770 点、実 raycast の支持とヒト / 保守的イカ身体の bodyFits が成功 |
| 実 Actor の操作 | 歩行 26、泳ぎ 24、射撃移動 26 経路を各 30/60/120 Hz、計 228 回。約 224,532 tick、waypoint 高さ誤差最大約 .081 WU。Tidewater の 2 つの市場経路は金網を通るためイカ連続支持を要求しない |
| 金網と水 | 12 回のヒト待機→イカ降下が下層へ着地、6 回の支持のない水域落下が実水死になる |
| 下層空間 | 6 つの断面で実 raycast により 4.2 / 3.0 WU の頭上高を確認 |
| CameraRig | 6 位置、30/60/120 Hz、pitch −.8 / 0 / .9、yaw 回転と実 Actor ジャンプ、計 54 ケース。lens と near-plane 5 点の solid 侵入 0。スコープ、対戦中の追走・壁際全位置、全 aspect 比は未確認 |
| NavGraph | 全 floor の保持と 848 件の有向探索。旧探索予算の具体的な失敗を保持した回帰検査 |
| BotBrain | 現行 Kelpline の金網降下後の復帰・上層金網での変身回避を各 30/60/120 Hz。現行 Tidewater の異なる階への戦術経路と同一階での接近も確認 |
| Ranked bots | 両ステージの Clam Blitz で 60 秒内に拾得・Power 化・投擲・得点。Tidewater の zone / tower / Rainmaker の実自律操作も確認 |
| Paint / minimap | 実 PaintSystem の packing・dead mask・CPU splat。上下床を別陣営で塗り、独立 cell、選択 layer、hysteresis、cache、viewer flip、piers 除外を確認 |

CPU の runtime turfArea は Tidewater 約 **8,462.83 WU²**、Kelpline 約 **11,351.95 WU²**。部材上面、坂の実表面、死んだセル、セルの丸め等を反映するため、設計上の水平床投影や名目床面積とは別の値である。面積の大きさだけで対戦品質を判定しない。

旧 `bot-navigation.test.mjs` の海面下 dry trench（y=-2）は MAP3 に存在しないため、その限定回帰を `bot-navigation-legacy-layout.fixture.mjs` に明示して保持する。入力は commit `0582bb1ee6ac03dfb54e292ea839d18463e33fcc` の旧 Kelpline で、旧「地面が海面より低いなら水」という誤判定の negative control、7 bot の脱出、実金網接触を引き続き検査する。現行ステージの証明には数えず、現行 MAP3 の BotBrain 検査と区別する。旧 0.4 WU 側壁の soft-push 回帰も同じ明示 fixture を使い、ranked lane の旧中心塔の反例は元の 3 箱を明示した限定 fixture で保持する。現在の turf 投影回帰は実 belvedere 坂に移し、100 坂セルと 95 平面セルで旧表面積スコアと正しい水平投影スコアの勝者が逆になる条件を保持した。Decor / PropKit の資源所有テストは現在も該当する Halyard / Cargo の anchor を使い、既存 generic Decor の before/after 比較から新しい別 art owner を明示的に分離する。

Splatoon 3 との比較条件は既存 `source-audit.md` / `reference-observations.md` を引き継ぐ。本番移動 profile は Ver.11.3.0 とする既存実装を使うが、本家の未公開数値や実機の坂・水際・見上げ挙動を今回推測して確定していない。画像での形態比較、ロジックの測定、ブラウザでの動作、本家実機を区別する。実対戦の勝率・武器相性・打開圧力・全 UI の在階識別は別途評価が必要。

## 最終 runtime の共通面積再測定

最終ソースの `Level(MAP_LAYOUTS[id], map3ArtColliders(layout))` から実 OBB の全 solid 面を抽出し、既存 `measure_baseline.py` の `geometry_metrics` を変更せずに使って再測定した。法線 y ≥ .68 の三角形をステージ bounds で切り、.25 WU のセル中心で XZ の和集合を測る。境界セルの面積重みも既存手法と同じ。通常の部材に加え、実 R の低端延長、金網、遮蔽物上面、hidden の構造 collider 上面を含む。描画専用の mesh は含まない。

再現には Node の VM modules と Python / NumPy を使う。

```bash
python3 docs/stage-redesign/map3/measure_current_runtime.py
```

実行スクリプトは `measure_current_runtime.py`、入力 hash・実部材数・測定値・native 照合記録は `current-runtime-common-metrics.json` に保存した。

| 面積の定義（WU²） | Tidewater | Kelpline |
|---|---:|---:|
| frozen 設計の床のみ・遮蔽物控除後 XZ 和集合 | 7,874.40 | 8,887.20 |
| frozen 設計を共通手法で測った上向き XZ 和集合（.25 WU） | 8,104.00 | 9,032.00 |
| 最終実 Level ＋ art collider の上向き XZ 和集合（同手法） | **8,104.00** | **9,032.00** |
| 最終実 Level の上向き面の水平投影総和（重複を保持） | 8,990.71 | 12,049.98 |
| 最終実 Level の上向き面の実表面積総和（重複を保持） | 9,047.81 | 12,098.01 |
| 実 PaintSystem の CPU turfArea | 8,462.83 | 11,351.95 |

共通手法の和集合は今回の .25 WU 解像度で frozen 設計と同値になった。実 Level の低端延長や追加構造面は総和を増やすため、これは全形状の一致や厳密な多角形和集合の一致を意味しない。CPU turfArea は paintable / turf face と dead mask を適用した実表面セルの和で、上下に重なる塗装面は別々に数える。従って和集合、設計の床だけの面積、CPU turfArea を同じ分母で比較しない。hidden の屋根・高い梁を含む最高面や上下の高さ差から、歩行可能な高度・通行可能な頭上高は判定できない。

比較対象は保存済み native 23 ステージの同じ .25 WU 共通測定で、XZ 和集合の中央値は **8,037.125 WU²**。今回の実 Level はその約 **100.83% / 112.38%**。native の binary は再読込・再測定していない。既存抽出の 117 件の LFS hash / size 記録を現在の HEAD pointer と照合し、`patches/native-stages` / `native-prebuilt` に HEAD との差分と未追跡ファイルがないことを確認した。JSON に両 tree hash も記録した。この照合は native の入力資産・専用ソースが保存済み測定時と一致する根拠であり、共有コードの全挙動や実機との同一性まで保証するものではない。
