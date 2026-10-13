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

専用 `airport-source.test.mjs` は通常 `shooter` / `WeaponShooterNormal`、既定 0AP ギア、30/60/120Hz、両人間チームと各チーム4ボットスロットの 30 ケースを検査する。実 Actor の `_integrate` と `_spawnBarrier` を復元し、射出・着地・ground.hit・元支持・着地後の中央への一方向経路・一定0.5秒の歩行を観測する。表示・音声だけを CPU fixture で省略する。既存 `native-integration.test.mjs` の元支持床、塗り面の穴、塗った壁へのイカ接続・敵インクでの解除も確認する。

壁の射撃確認は `check-inkwave-native-projectiles.mjs` による元支持床の制御された立ち射撃。既存 Actor→WeaponRunner→Projectiles が実際に許可した弾と、元壁への球 sweep 接触、自然に発生した壁塗りと所有を 30/60/120Hz で確認する。手動の塗りスタンプを射撃の証拠に数えない。通常の人間スポーン射出・マウス入力は別のゲーム検証で扱う。

公開取得・変換・キャッシュ、改変 OBJ と壊れた派生 binary の拒否、native→legacy→native の片付け、品質変更後の CPU ownership と authority、844×390 のタッチ画面、実 production RoomDurableObject と WebSocket の5ルールは最終ブラウザ行列で確認する。元 single mesh と indexed culling の属性・順序および A/A と B/B の画素比較、12 移動カメラの描画を検査する。

## 検証状態

ソース照合、支持点・カプセル・一方向経路と初期 CPU 行列は成功。実ブラウザと最後の共有修正を含む行列は実行中で、最終結果・fingerprint・SwiftShader 計測値は `airport-verification.json` に追記する。ブラウザ・詳細ログ・OBJ/MTL/PNG・派生バッファは私有 ignored 領域だけに置く。SwiftShader の時間を実スマートフォン・Switch の FPS として扱わない。
