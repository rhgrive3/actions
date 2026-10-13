# チョウザメ造船：原典表示メッシュの比較と確認

`sturgeon` は固定した原典表示メッシュを使うローカルステージとしてレビュー可能。対向する元床上の開始支持点から両チームが同じ遊べる領域へ到達し、全5ルール、実射撃、全ヤグラ経路の通常入力、実WebSocketの全グリッド一致を確認した。[PR #1337](https://github.com/rhgrive3/actions/pull/1337) をレビュー用の [集約PR #1324](https://github.com/rhgrive3/actions/pull/1324) に自己統合する。mainへのマージと原典・派生バッファ・画像の公開は行わない。

対象は公開版 `inkwave-public/` に適用する定義 [sturgeon.json](../../patches/native-stages/definitions/sturgeon.json)。Splatoon 3 Ver.11.3.0資料が確認するのは `Vss_Nagasaki03` / チョウザメ造船の識別情報である。抽出物の版・抽出日・座標単位、Nintendoの衝突・塗り・登れる面・金網のマスク、スポーンとランク戦の配置、動く床の変換と状態、ネイティブなシェーダーは未確認。今回の静的表示由来の物理・塗り・ルール配置は、本家の配置や動く中央足場の再現とは判定しない。

| 項目 | 固定根拠と結果 |
| --- | --- |
| 公開ソース | `kirakira-dev/KiTrix`、commit `0611f51b35c9736ee986fb2218461e2585b7875e` |
| ステージ木 | `fd3bcfd8eb89378b4f1764d3947e5132febf3295` |
| OBJ | SHA256 `7db028642562633eec19030d4b77219f9e5d5f2b189ce0d2a396911b7ddafb30`、31,263,599 bytes |
| 元形状 | 269,203頂点、188,196三角形、86オブジェクト。独立した元テキストのストリーム読取りと、全float32位置・法線・UVのビット一致、uint32三角形インデックス一致を確認。304個の欠落UVだけゼロ補完 |
| 元画像・材質 | 固定Git blob201件（MTL＋200 PNG、14,332,856 bytes）すべてSHA1・バイト数一致。使用した149 PNGも元バイト列と一致。Worker/Python変換のバッファとマスク一致 |
| 11.3.0識別 | `VersusSceneInfo-1130.json` の Id14 / DisplayOrder10 / Season1、`leanny-1130/SceneInfo.json` の Labelと `Model/Fld_Nagasaki03.bfres`。両参照のSHA256は数値記録に保持 |
| 開始支持点 | 元 `GroundSteelPlate02_A_01` のX[-30,30], Z[-72.5,72.5], 床Y=11から `[-15,11.08,-63]` / `[15,11.08,63]` を推定。全カプセル支持、距離129.5222、両チームの有向経路を確認 |

認証付きLFS smudgeは `Resource not accessible by integration` で失敗したため、固定コミットの公開 `media.githubusercontent.com` から取得し、期待LFS OIDとバイト数を検証した。元データ・派生形状・詳細ログ・スクリーンショットは無視されたローカル領域だけに保持する。

表示から推定した衝突除外は `^FldObj_Nagasaki03_Crane_` と `^Fld_Nagasaki03_CameraWall_` のみ。遠景クレーン4個はY35.116以上、最大X878.974まで伸びる。CameraWallの1個はX±28.99 / Z±57.5316 / Y1.9064〜11のカメラ境界形状である。これらをアクター衝突と塗りから除く一方、表示頂点・法線・UV・面インデックス・描画は保持した。本家の衝突フラグを復元したという主張ではない。

採用済みfoundation `460da55901b7c70238f377759c588c7b46b0709a` と実装 `52933ebd1069be59cc167440b4de02a1576dd683` に対応する保存済みビルドで、次を確認した。

| 検証 | 結果 |
| --- | --- |
| 原典・CPU回帰 | 81件中71成功、失敗0、他ステージ原典が必要な10件は対象を限定して未実行。全Sturgeon回帰を実行。元支持、壁の自インク登りと敵インク離脱、所有禁止マスク、経路、ミニマップ、Worker/Python一致を含む |
| ローカルゲーム | 全5ルール、既存8アクター/7ボット、自然な射出と着地、両チームのボット移動・塗り、カメラ・ミニマップ、ブラウザエラー0 |
| ヤグラ | 全45地点×両陣営×30/60/120Hzの270件を物理W/Spaceとゲームの本来の固定時計フレームで乗車。全デッキ・ポール・ライダー掃引、3点の区間内サンプル、両デッキ端の実カプセル支持2,124件。経路は元対向支持点を結ぶ軸の両半分に入る |
| ヤグラ終点条件 | 終点で未乗車のゴール成立が試験開始前に起きるため、12乗車試験は同じ元経路弧の終点から内側1mmで開始。45点の経路を変えず、正確な終点のカプセル支持も別に確認。乗車最大0.6秒 |
| 実WebSocket | 本番 `RoomDurableObject`、全5モード、2,024パケット。ホスト所有Luna `s3-blaster-short` のカタログ半径3.84。全2,259,705セルのSHA256が両ピアで一致 |
| 同期完了 | 各モードの初回とランク戦snapshot後の最終、計10回の実settlementでwatermark到達、塗り成長・再生・送出キュー0、最終ルール数値一致。古いsettlementを成功扱いしない |
| 配布 | 原典入りprivateと原典を含まないpublicの両方でパッケージ9/9、既存budget・起動ガード成功 |

別の独立ブラウザ確認はfoundation `c961c1bad0dcc2062fdfc496da2da9435e0abd79` の正確な保存済みビルドに対応する。c961→460で変わらない元バッファ、描画・品質・読込/キャッシュ/変換・物理/連続三角形掃引・識別判定・復活の実装を比較して、証拠を維持した。中止した未開始の任意再実行は成功に数えない。

| 独立した実Chromium確認 | 結果 |
| --- | --- |
| 実ブキ壁塗り | production `Character` 銃口・`Actor` → `WeaponRunner` → `Projectiles`、通常 `shooter` / `WeaponShooterNormal`、ギア0AP、RNG0.5。30/60/120Hzの各1発が元 `Wallshipmetal01` 三角形64824・面14480に衝突して所有。自然な壁塗り4/5/5、射手生存・支持あり |
| 射出・着地・カメラ | 両陣営×3Hz×人間と4ボットの30件が元三角形に着地し、通常経路で移動。物理メニュー・マウス射撃、実WS両チームの6ケースで対向方向カメラと射出を確認 |
| 公開読込 | 実メニューからクロスオリジン元データ取得・変換、キャッシュ再利用、改変OBJ拒否と旧世界保持成功。代替ブロック配置へのフォールバックなし |
| 描画 | gameplay/center/overheadのA/A・A/B・B/B差0画素。181塗りchunk、12移動カメラ/12インデックス再構築。ゲーム権限とCPU塗りに変更なし |
| 品質・ライフサイクル | CPUグリッド・元三角形・Level/Physics/Nav/Paint保持、破損バッファrollback、キャンセル、原典→旧→原典→旧切替。一致識別のみ受理、変更・欠落識別を拒否。844×390タッチで8体、着地済み、2048アトラス/58テクスチャ |

最新foundation `d92fab242a6616c2de82a01798d0b135889ff97e` は通常mergeで取り込んだ。変更は有効な壁登り・高所落下が実際に処理したランク戦フレームの入力を保持するmarkerだけで、Sturgeonは両機能を無効にしている。専用回帰でmarker追加前後の本来のランク戦入力・元支持上の位置・生存/接地・ルール目標を比較し、古いtrue markerが通常操舵を妨げないことを、4ランク戦モード×両陣営×3Hzの24条件、計1,680フレームで確認した。保存済み460ビルドのブラウザ証拠を最新ビルドの実測と呼び替えない。正確な各ビルドSHAと変更範囲は [sturgeon-verification.json](sturgeon-verification.json) に記す。

CPUの専用移動・復活とmarker比較ではproduction `Actor` と `Character` を構築し、積分・フレーム完了・向き・銃口を保持する。ただしGPU塗り描画と一部の試験用match/frame文脈は限定し、marker比較ではlive `RankedWorld` のblocked callbackを省く。共有 `fixture.make()` は固定world-Z銃口、積分とフレーム完了のno-opを持ち、表示だけを省いたものではない。CPU限定試験を本番ゲームや実ブキ壁塗りの代用にしない。ネットワーク用の手動塗りは所有・同期API確認であり、実射撃の証明に数えない。

Chromium154/SwiftShaderと共有CPU上の性能記録は、460ゲームCPU p50 8.8ms / p95 18.3ms、c961のタッチ画面CPU p50 14.2ms / p95 44.2ms。固定描画の元→chunk中央値はgameplay 5.0→2.9ms、center 1.9→1.7ms、overhead 2.3→2.4ms。GPU確認は共有browser lock、原典大ジョブはCPU lockとNode直列実行を使った。これらは実スマホ・SwitchのFPSではなく、本家実機との微入力、加速/停止/旋回、坂/段差/足運び、射撃中移動、泳ぎ・敵インク・変身・ジャンプ・塗り幅・回復・被弾・復活・カメラのフレーム値一致は未確認。

専用回帰は [native-sturgeon.test.mjs](../../patches/native-stages/tests/native-sturgeon.test.mjs)、全ヤグラの通常入力確認は [check-inkwave-native-sturgeon-tower.mjs](../../scripts/check-inkwave-native-sturgeon-tower.mjs)。共通ランタイムの採用済み修正はこのステージの実装とは分け、未採用の共通提案を取り込まない。数値記録に再現コマンド・原典とブキ/ギア/状態/入力・自己レビュー・証拠SHA・検証範囲を保持する。
