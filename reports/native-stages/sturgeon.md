# チョウザメ造船：原典表示メッシュの比較と確認

対象は公開版 `inkwave-public/` に適用する原典ステージ定義 `sturgeon`。固定 KiTrix の表示用 OBJ/MTL/PNG を使い、独自の25ステージ用ブロック配置は使わない。Splatoon 3 Ver.11.3.0 の資料が確認するのは `Vss_Nagasaki03` / チョウザメ造船という識別情報だけであり、この公開抽出物の抽出日、版、座標単位、Nintendo の衝突・塗り・登れる面のマスク、スポーン・各ルールの配置、動く床の変換と状態、ネイティブなマテリアルシェーダーは未確認。

| 項目 | 固定根拠 |
| --- | --- |
| 公開ソース | `kirakira-dev/KiTrix`、commit `0611f51b35c9736ee986fb2218461e2585b7875e` |
| ステージ木 | `fd3bcfd8eb89378b4f1764d3947e5132febf3295` |
| OBJ | SHA256 `7db028642562633eec19030d4b77219f9e5d5f2b189ce0d2a396911b7ddafb30`、31,263,599 bytes |
| 11.3.0 識別 | `VersusSceneInfo-1130.json` の Id14 / DisplayOrder10 / Season1、`leanny-1130/SceneInfo.json` の Labelと `Model/Fld_Nagasaki03.bfres` |
| 形状 | 269,203頂点、188,196三角形。原典の float32 位置・法線・UVと uint32面インデックスを保持 |
| 範囲と開始支持点 | `GroundSteelPlate02_A_01` の元範囲 X[-30,30], Z[-72.5,72.5]。両端の床Y=11に `[-15,11.08,-63]` / `[15,11.08,63]` を推定配置 |

認証付き LFS smudge は `Resource not accessible by integration` で失敗し、固定コミットの公開 `media.githubusercontent.com` URLを使った。期待LFS OIDとバイト数を検証する。MTLと各PNGは固定Git blob SHA1とバイト数で検証し、変換後に使うPNGは元データのSHA256とも比較する。検証結果は [sturgeon-verification.json](sturgeon-verification.json) に記録する。原典・派生形状・スクリーンショットは無視されたローカルディレクトリにのみ保持する。

`sourceSemantics.nonCollidableObjectPatterns` は `^FldObj_Nagasaki03_Crane_` と `^Fld_Nagasaki03_CameraWall_`。前者の4オブジェクトはY35.116以上の遠景クレーンとワイヤーで、最大X878.974まで伸びる。後者は名前がCameraWallの1オブジェクト、X±28.99 / Z±57.5316 / Y1.9064〜11のカメラ境界形状である。これを表示抽出物から推定した選択として、アクター衝突と塗りの対象から外す。双方の表示頂点・法線・UV・面インデックスと描画は保持する。本家の衝突フラグを復元したという意味ではない。

操作比較は既存のアクター・通常ブキ・ギア0AP、原典三角形による支持とカプセル判定、30/60/120Hzの移動・射撃、初期イカスポーンの射出と着地、壁の自インク登りと敵インクでの離脱、原典ポリゴン外の所有禁止、既存ボットの有向経路で行う。実際の壁への塗りは `Actor` → `WeaponRunner` → `Projectiles` の通常射撃と、採用済みの連続三角形衝突を確認する。床への手動塗りは塗り・ネットワークAPIの別検証であり、ブキの実射撃の証明には数えない。

ローカル各ルールの目標は、両チームから到達できる塗れる床の強連結成分から導く。原典のルール配置や動く中央足場の状態を再現したとは判定しない。Towerは採用済みの安全性ゲートに従い、全経路とデッキ・ポール・ライダーの支持や掃引空間が証明できる場合だけ選択可能になる。

ブラウザ確認は実Chromium、8体の既存アクターと7体のボットで、ゲーム、実WebSocketと本番 `RoomDurableObject`、原典単一メッシュとの画素比較、12の移動カメラ、品質変更・破損データのロールバック・キャンセル・原典→旧→原典の切替、844×390タッチ画面、マルチプレイの一致識別を確認する。ブラウザは共有ロックを使って順番に実行する。時間はSwiftShaderのソフトウェアGLと共有CPU上の測定であり、スマホ・Switchの実機FPSではない。本家実機で未測定の加速・停止距離・旋回・微入力・坂や段差・足運び・射撃中移動・泳ぎ・敵インク・変身・ジャンプ・塗り幅・回復・被弾や復活・カメラの一致は未確認として残す。

実装箇所は [sturgeon.json](../../patches/native-stages/definitions/sturgeon.json)、専用回帰は [native-sturgeon.test.mjs](../../patches/native-stages/tests/native-sturgeon.test.mjs)。共有の変換・物理・塗り・ボット・ルール・描画・読み込みは採用済みfoundationを使う。数値記録には最終コミット、ビルド識別、検証条件、各確認の結果と未確認範囲を記す。
