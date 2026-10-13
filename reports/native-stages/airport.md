# カジキ空港：原典表示メッシュの比較

カジキ空港 (`airport` / `Vss_Propeller00`) を固定 KiTrix ソースから読み込む独立定義を追加した。公開ビルドはモデルを同梱せず、利用者による取得・変換・検証を経て実際の表示メッシュを使う。11.3.0 の対応情報はステージ名と内部名だけに用いる。抽出メッシュのバージョン、単位、本家の衝突・塗り・移動オブジェクト・スポーン・ガチルール配置と実機動作は未確認であり、`version1130Verified` は false のまま。

## 固定ソースと元データ比較

参照は公開 `kirakira-dev/KiTrix` の commit `0611f51b35c9736ee986fb2218461e2585b7875e`、ステージ tree `084a4ee4442823e237d9ef39b18b689484317cf9`。OBJ は 30,982,635 bytes / SHA-256 `da8165322d2e1fecdc326ef1a721153f26428623958337a01460fcc45f211118`。専用の隔離 Git 作業領域で git-lfs smudge を試したが、`Resource not accessible by integration` で失敗したため、固定 commit の公開 media URL から取得してサイズと SHA-256 を照合した。共有ソースの HEAD と index は取得前後で一致している。

344 個の MTL/PNG は固定 Git blob SHA-1 とサイズを確認した。公開する数値記録は `airport-verification.json` の fileIntegrity。元 OBJ の独立テキスト走査で、256,788 頂点の位置と法線、256,676 UV、605,823 face index が各 Float32/Uint32 バッファと一致した。変換器同士の一致だけで元データ一致を代用していない。Python とブラウザ Worker の位置・法線・UV・index・衝突・法線・flags・object index・paint mask も比較する。PNG と元属性は修正しない。

## 支持点・通行・ローカルルール

境界は元 `WoodDeckBright00` の範囲から得た X ±54.0315 / Z ±75.0002。対向パッド `[-44.8,13.5,-68]` と `[44.8,13.5,68]` は同じ元オブジェクトの反対側の実三角形に支持される。両側とも法線、床高さ、身体カプセル、支持ノードまでの連続床を検査し、共有ナビゲーションの一方向到達集合から中央へ進めることを確認する。元の屋根・柱・衝突を消して通路を作っていない。

`sourceSemantics.nonPaintableObjectPatterns` は `^Fld(?:Obj)?_Propeller00_.*(?:NoPaint|FenceNet00|RopeSingle|SmallPrant00|PlantationSet|PlantBase00|PlantShelf00).*$`。明示的な NoPaint 名と網・ロープ・植物名に対するローカル推定であり、Nintendo の塗りマスクではない。対応オブジェクト名・範囲・数は数値記録に保存する。これらも表示と衝突は保持する。Pnt と共通レイヤーは共有分類器を用い、Var/Vlf/Vgl/Vcl/Tcl の代替レイヤーを同時に有効化しない。元表示バッファの全頂点と全 index を保つ。

ナワバリ・エリア・ヤグラ・ホコ・アサリは既存 Actor、ブキ、7 体の BotBrain、ミニマップ、ガチルール機構を使う。ガチ配置は共通の到達可能な元支持ノードから作るローカル較正で、本家の位置・ルール別地形の再現とは区別する。ヤグラは対向する両半分を結ぶ全 waypoint と swept segment の本体・ポール・乗員カプセルと、通常 Actor の接近・ジャンプ・搭乗を検査する。

## 挙動の再現と比較の範囲

比較基準は Splatoon 3 Ver.11.3.0 の識別・既存ブキパラメータ資料。歩行・着地・壁登り・射撃の実機速度や接触位置の一致は未確認。CPU の歩行・着地・壁登りとブラウザでの通常ゲーム・入力・描画・WebSocket は別の検証として記録する。

専用 `airport-source.test.mjs` は通常 `shooter` / `WeaponShooterNormal`、既定 0AP ギア、30/60/120Hz、両人間チームと各チーム4ボットスロットの 30 ケースを検査する。実 Actor の `_integrate` と `_spawnBarrier` を復元し、射出・着地・ground.hit・元支持・着地後の中央への一方向経路・一定0.5秒の歩行を観測する。CPU fixture は簡略 Character と no-op `_finishFrame` を保持し、入力は Actor.intent に直接与える。実 `_integrate`・`_spawnBarrier`・元三角形 physics の移動/着地/経路回帰であり、CPUでproduction Character、銃口、物理入力や表示全体を検証したとは扱わない。生成済み engine export の回帰も同じ制御条件。production Character と銃口・実入力は実Chromeの30着地・通常射撃・カメラ確認で別に検証する。既存 `native-integration.test.mjs` の元支持床、塗り面の穴、塗った壁へのイカ接続・敵インクでの解除も確認する。

壁の射撃確認は `check-inkwave-native-projectiles.mjs` による元支持床の制御された立ち射撃。既存 Actor→WeaponRunner→Projectiles が実際に許可した弾と、元壁への球 sweep 接触、自然に発生した壁塗りと所有を 30/60/120Hz で確認する。手動の塗りスタンプを射撃の証拠に数えない。通常の人間スポーン射出・マウス入力は別のゲーム検証で扱う。

公開取得・変換・キャッシュ、改変 OBJ と壊れた派生 binary の拒否、native→legacy→native の片付け、品質変更後の CPU ownership と authority、844×390 のタッチ画面、実 production RoomDurableObject と WebSocket の5ルールは最終ブラウザ行列で確認する。元 single mesh と indexed culling の属性・順序および A/A と B/B の画素比較、12 移動カメラの描画を検査する。

## 検証状態

ソース照合、支持点・カプセル・一方向経路、受理済み `64b0497e` での CPU 60 件と専用回帰 3 件は成功。実 Actor の 30 着地ケースは全11目標への352経路を保持する。初回 Chromium は8 Actor・7ボット・全5ルール・エラーなし。ヤグラは70 waypoint、554回の実カプセル支持と30/60/120Hzの実キーボード搭乗に成功した。初回の実 WebSocket は全5ルールで成功し、Luna の塗り半径3.84、220 settling frames 後の全 CPU grid SHA-256 一致を確認した。受理済み `64b0497e` の通常射撃は元 `CargoBoxWood00Plus` の壁で3周波数とも元三角形への接触・自然発生の壁塗り・所有に成功し、0AP・立ち射撃を実記録した。

現在の検証は受理済み製品修正 `29c01b4f` と runner 修正 `c961c1ba` に基づく。後者はブラウザの初期化 callback がゲーム全体を返さない修正で、製品 runtime・catalog・build は前者と同一。最終私有 build は `caca515442762136ede45b18325f08c50fed30a6e95cabff5df4eec3234af4f3`、公開 build は `83ee538ae872480bfed37343a902bf70f80dfa250dc0c096b5dccff0751db044`。双方の全 artifact 識別・起動・配布サイズ検査に成功した。ソース付き CPU は69件成功・他ステージ/opted条件9件skipで、Airportの元属性・実支持・塗り・移動・経路は実データで検査した。生成済み engine の実 export を使う専用回帰3件も成功し、元テキストから独立に数えた vertex offset で全 index を照合した。

現在のブラウザ行列は8ケースすべて成功した。公開メニューから固定元データを取得・変換し、派生 cache 再利用では OBJ の再ダウンロード0件、改変 OBJ の拒否では以前の level とメニューを保持した。8 Actor・7ボット・全5ルール、70点のヤグラ経路・554回の実乗員支持・3周波数の実キーボード搭乗も再確認した。実 WebSocket は全5ルールで半径3.84の塗りを再生し、205/205/15/225/200 settling frames後に全CPU grid SHA-256が一致した。元壁への通常射撃と0AP、実Chromeの30着地ケース、ポインターロックと実マウスによるオフライン3周波数・オンライン両チーム3周波数、legacyカメラ復帰も成功した。

描画のゲーム/中央/俯瞰は A/A・B/B・元single meshとindexed cullingの差分がすべて0画素。12移動カメラを含め、物理・ナビ・CPU塗りauthorityは保持した。描画三角形は86,792を基準に、ゲーム視点84,588・中央51,744・俯瞰85,292。SwiftShaderのrender drain p50は基準/分割がゲーム3.0/3.8ms・中央3.6/3.5ms・俯瞰6.6/8.4msで、一部視点は分割の方が遅かった。ゲームの180 CPU samplesはp50 14.3ms / p95 41.1ms / max1253.8ms。タッチ844×390はp50 9.8ms / p95 31.4ms / max1166.8ms、render drain4.8ms。並行CPU・cgroupメモリ負荷とソフトウェア描画の診断値であり、実機FPSを意味しない。

品質high→lowでsource位置・CPU grid・authorityが一致し、壊れたbinaryの拒否、準備キャンセル、native→legacy→nativeの掃除、互換fingerprintの改変/欠落拒否と844×390タッチ表示に成功した。実画像は私有領域で確認した。個別[PR #1342](https://github.com/rhgrive3/actions/pull/1342)をレビュー可能とし、[集約PR #1324](https://github.com/rhgrive3/actions/pull/1324)へレビュー枝だけを統合する。

ブラウザ・詳細ログ・OBJ/MTL/PNG・派生バッファは私有 ignored 領域だけに置く。SwiftShader の時間を実スマートフォン・Switch の FPS として扱わない。
