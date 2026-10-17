# 未入手データの追加探索（2026-10-17 JST）

対象は INKWAVE 公開版と Splatoon 3 11.3.0 の差分。今回は資料探索・取得・同一性確認だけを行い、ゲームの塗り・当たり判定・配置は変更していない。先の「塗り画像は未入手」は、この探索で下記の候補画像を取得できたため更新する。画像の原典版・実機との完全一致は別途未確認。

## 塗りマスク候補：画像を取得できた

[Flexlion の Paint Editor](https://flexlion.github.io/assets/ink_playground/index.html) と、その [固定ソース](https://github.com/Flexlion/flexlion.github.io/tree/7740d29fdded2899a7633e50647736e3723c5e9a/assets/ink_playground/paint_texs) に `Shot00`～`Shot04`、`ChgrSplash00/01`、`Common`、`RlrSplash00/01/02`、`Roller00`、`Bomb00`、`WallDrip00/01` 等の PNG がある。

- commit `7740d29fdded2899a7633e50647736e3723c5e9a` の PNG **108枚、343,704 bytes** をローカル取得し、全ファイルのサイズ・Git blob SHA-1 と固定 tree を照合した。別に SHA-256 を記録した。画像・シェーダー原文は本PRに同梱しない。
- [Leanny の11.3.0 `InkTexInfo`](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/mush/1130/InkTexInfo.json) は56定義。`TextureName`（空なら RowId の basename）と `PatternNum` から期待する名前を生成すると **55定義で画像がすべて存在**。`SprBall01` の画像だけ欠落。同じ画像への別名定義を含むため、55定義＝55画像ではない。
- 例：`Shot00` は12パターン、`Shot01`～`Shot04` は各6、`ChgrSplash00` は12、`ChgrSplash01` は3、`Common` は3、`RlrSplash00/01/02` は各3。`Shot00_0` は32×32、`Shot04_0` は32×91、`Bomb00` は128×128。実際の非円形画像を取得したもので、楕円を生成し直したものではない。
- Paint Editor の実装は画像の alpha を補間して塗る。しかしブラシサイズ・回転・混色をそのエディターがどう扱うかだけでは、本家の地形投影・塗り判定とは認定できない。PNG の登録コミットは2026-05-19で、11.3.0の原画像とのバイト比較は未実施。

ファイル別のハッシュ・寸法・alpha の範囲と定義対応は [数値目録](paint-mask-discovery-20261017.json)。各ファイルは上の固定ソースから取得できる。原典 PNG の版、アニメーションフレーム/チャンネル、パターン選択と乱数、ブキ別のマスク選択、縦横尺度、斜面・壁への投影、混色・所有判定のしきい値を確認してから、既存の楕円マスクへ適用する必要がある。今回は**取得済み、ゲーム未適用**。

## 専用衝突：変換ツールとフラグ表を発見

[nvnprogram/PhiveConverter](https://github.com/nvnprogram/PhiveConverter/tree/03faf4be678a42d18b1786bef6321b52dfbcd10b) は Splatoon 3 `.bphsh` を OBJ と材質 JSON に変換するツール。固定 commit `03faf4be678a42d18b1786bef6321b52dfbcd10b` の README、`fxconfig.json`、全24 tree entry を確認した。

出力の `usemtl` ごとに `mat_name`、`mat_flags`、`col_disable_flags` を持つ。設定には `Fence`、`ForceColPaintPaintable`、`ForceColPaintNotPaintable` と、プレイヤー/カメラ/弾などの判定を分ける `SplPlayer`、`SplCamera`、`SplInkBullet`、`SplPaintSplash` 等がある。これは表示メッシュから推定している現在の分類と照合する入口になる。

ただしツールは**各ステージの原典 `.bphsh` を同梱しない**。README にある汎用例をマヒマヒのフラグと解釈しない。旧 [FiveX](https://github.com/nvnprogram/FiveX) は同作者が後継として上記ツールを案内している。変換形式が分かっても、専用判定の復元や版照合が済んだことにはならない。

## マヒマヒ実配置：未発見

`Hiagari04` の GitHub code 検索は Map Editor のクラス、KiTrix の表示用モデル、Leanny/Flexlion/SplatDatabase 等のステージ一覧に着地した。Leanny 固定 tree 19,488 entry、Flexlion 固定 tree 3,253 entry に、対象の Banc 実配置や `.bphsh` はなかった。ステージ一覧の `__RowId: Vss_Hiagari04` は配置座標ではない。

Drive は資料フォルダの一覧、関連語・拡張子検索に加え、19分割ZIPの part 01 を実際に取得して内容を確認した。ルートの `SOURCE_INFO.txt` は Splatoon 1 decomp と公開 Leanny/HoianViewer/資料集の snapshot と説明し、`HOW_TO_RECONSTRUCT_ALL.txt` とともにゲーム RomFS を含まないと明記する。part 01 は1,716 entry。この確認は残り18個の全ファイルを調査したことを意味しない。

追加のモデル/資料リポジトリ CoconutsXXS/Splatoon-Blender（18,937 entry）、Delus1onL/Splatoon-Asset-Documentation（52 entry）、RAMDRAGONS/Splatoon-FesData（3,068 entry）も tree を確認。服やプレイヤー向けの ink texture、Splatfest資料等は、ステージ配置・衝突・弾着塗りマスクと区別した。Textures Resource の「Ink Effects」は候補ページを確認したが、それだけでは必要な塗りマスクと認定できず、採用しない。

マヒマヒの本家 Banc 座標・rail/AI/水位変化条件、各ルールの実際の目標・スポーン配置、ステージ別の専用衝突は未発見。公開 mod の地形改変も、そのまま本家の11.3.0配置として使用しない。

## 飛沫の用語にも注意

[Leanny の `WeaponSlosherLauncher`（スクリュー）](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherLauncher.game__GameParameterTable.json) は本体76～52、別 Unit の渦38を持ち、[公式更新履歴](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/Splatoon-3-Update-History-2358763.html) も地形越しの「spiral」のダメージ修正を記載している。一方、落下する `SplashParam` は同じ `DamageParam` を持たない。Bloblobber も本体 Unit と落下飛沫のパラメータが別である。プレイヤー用の半径フィールドの存在だけで、すべての小さな飛沫へ本体・渦のダメージを追加してはいけない。実行側と実機による追加照合が必要で、既存の未確認扱いを維持する。
