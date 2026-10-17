# Banc 配置取り込みの追加と残件（2026-10-17 JST）

公開版 `inkwave-public/`、開始 main `9fe55aa056d6b5c31773254a4796c7db50df02f8`。比較基準は Splatoon 3 11.3.0。ただし今回入手した表示モデル・公開エディターのコードが11.3.0の実データと一致することは未確認。本家実機比較は実施していない。

## 変更と効果

従来は表示用 OBJ のオブジェクトをそのまま変換し、Actor ごとの配置を取り込む経路がなかった。デコード済み Banc JSON を正規化する Python CLI と、明示的な Actor–OBJ 対応表による私的な配置診断を追加した。

`source-placement.mjs` は宣言した単位・Euler 規約で平行移動・回転・拡大を適用し、同じ `source-convert.mjs` から表示頂点、衝突三角形/BVH、推定塗りチャートを生成する。uint64 Hash は丸めず保持し、原本と変換設定のハッシュを記録する。`Cmn` と対象ルールの結び付け済み Actor を選択できる。未対応の表示用形状と従来の塗り/衝突除外は保持する。

再現条件は合成プロトタイプの配置 `[10,3,2]`、Y回転π/2、拡大 `[2,1,3]`。変換前 `[0,0,0]` の頂点が `[10,3,2]` になり、同じ高さ3の三角形への実 `NativePhysics` ray が塗り面を持つ。原典の配置や操作値を示す例ではない。ギア・ブキ・射撃・移動設定への変更はない。

すべて診断用で、通常の公開ゲームからの配置インポート口は追加していない。CLI はカタログを生成せず、通常ビルドとステージローダーは診断 manifest を拒否する。マヒマヒの unavailable 判定は維持した。手順と入力条件は [README-placement](../../patches/native-stages/tools/README-placement.md)。

## 調査根拠

- [Splatoon-3-Map-Editor](https://github.com/OctoSquiddy/Splatoon-3-Map-Editor/tree/0e3c66d28b58f7b43df7cdfb6c34514e0ebc1fd4) の固定コミット `0e3c66d28b58f7b43df7cdfb6c34514e0ebc1fd4`。`StageDefinition.cs` の Actors/Rails、`SpatialObject.cs` の Translate/Rotate/Scale（ラジアン）、`MuObj/MuRail/MuRailPoint` の uint64 Hash、レイヤー、制御点を参照した。`MuRail.cs` は Pnt/Var/Vlf/Vgl/Vcl のルール対応を明示している。
- 同エディターの `Lft_FldObj_Hiagari04PntFloat` 等は rail/sequential rotation/AI lift パラメータへのアクセスを持つ。しかしクラス定義だけでは実配置、経路、移動開始条件を復元できない。全6,856 tree entry の調査で原典 Banc 配置ファイルは得られなかった。
- [KiTrix](https://github.com/kirakira-dev/KiTrix/tree/0611f51b35c9736ee986fb2218461e2585b7875e) 固定コミットの `Vss_Hiagari04` OBJ は29,497,521 bytes、SHA-256 `fc8f7233063cdbe7b2bd821b30cbe60e94e7a20e6a5d60ce00ce9b272232d561`。98オブジェクト中 Float 名の部品が7個あるが、明示的な Pnt/Var/Vlf/Vgl/Vcl/Tcl レイヤー名はなく、Banc 配置も回収できなかった。数値のみ [audit](source-placement-mahi-audit-20261017.json) に記録した。
- Drive の追加検索でも Banc/BYML/RomFS 等の実データは得られなかった。既存の提供資料は RomFS を含まない旨の説明があり、ローカル調整済み配置を原典の値へ昇格させなかった。
- [ToolboxPaintFix](https://github.com/nvnprogram/ToolboxPaintFix/tree/a135901547ee854d826eb018a66b049a3ed76657) の BFRES `blitz_paint_type` と `_pu0/_pu1/_pu2` に対して、現有 KiTrix MTL は同じ情報を持たない。初回実装時には本家の塗り画像や専用衝突データは未入手だった。追加探索で塗りPNG候補108枚と専用衝突の変換ツール・フラグ表を発見したが、ゲームへの適用・版照合とステージ別衝突は未完。[追加調査](source-data-search-20261017.md) を参照。楕円の弾着塗りマスク・表示三角形からのステージ判定は未解消。

## 検証の範囲

- 新規16件：uint64正規化、入力欠落・重複・未解決参照の拒否、ルール別インスタンス、6 Euler 順序を独立した Three 計算と照合、非一様/鏡映法線、実 converter→NativeLevel/NativePhysics の衝突・塗り面、CLI証跡、通常ゲーム読み込み拒否。
- 関連58件（新規16件を含む）成功。source paint JS/Python 一致、Mahi unavailable、形状、ビルド、キャンセル、キャッシュを含む。別のテクスチャ所有権・公開配信検証43件も成功（新規16件との重複あり）。
- native-stage 全体と既存 Scorch/ranked contracts は416件中289成功、失敗0、127スキップ（原典アセット等の任意条件を要する検査）。スキップを原典の一致確認として数えない。
- 公開生成物の Boolean-ground / small sphere-triangle / vertical-slab 判定・ダメージ回帰20件も成功。
- 公開構成ビルド成功。Chromium 154 の実 Web Worker で通常変換と診断配置変換を確認、JavaScript エラー0。[ブラウザ証跡](source-placement-worker-20261017.json) は production converter のソースから束ねた独立診断 Worker による合成検査であり、公開ゲームの配置読み込み・原典地形の実行・GPU表示の確認ではない。
- CI に同じ native-stage contracts と診断 Worker 検査を接続した。

## 未完了

原典 Banc の実配置、11.3.0との版照合、Mahi rail/AI/水位条件の実行、ガチルールの目標/スポーン/地形全体の復元、専用衝突・壁登り・塗り属性、本家塗り画像の適用は未完了。今回のツールが保持する rail/AI パラメータは動作しない。実機の歩行・壁泳ぎ・可動床追従・各ルール開始状態との比較も必要。これらを完成・解消済みとは判定しない。
