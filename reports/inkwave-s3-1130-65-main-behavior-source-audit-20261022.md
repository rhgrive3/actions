# INKWAVE：Ver.11.3.0 全65メインブキ・挙動差異監査（2026-10-22）

**監査基準HEAD:** `144923aefc282a588225ac44de3da95762653add`（`rhgrive3/actions` main）
**リリース参照:** pinned [Leanny/splat3 11.3.0 source JSON](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)
**実装:** `inkwave-public/` ＋ `patches/splatoon3/runtime/` ＋ 既存のnativeブキ owner

## 検査範囲と重要な制限

- 数値レコード **65 / 65** を展開・列挙。既存nativeブキ **7**、追加catalogブキ **58**、全 **11** 系統。
- 実際に使用される弾丸生成（`emitUnits`）・角度・威力（`impactDamage`）・塗り（`NearestParam`）・低インク（`pay`）と、抽出された固有フィールドを比較。
- **ソース上の不一致が確認された8群の問題、実射再現待ち1群、値の意味が未確定の1群**を9件＋1件のIssueに整理（#1804～#1813）。
- 確定した構造的欠落が影響するのは少なくとも **11種の追加ブキ**（ローラー4・フデ3・スロッシャー4）。既存のオバフロ反射・エクスプロッシャー銃口位置は別Issueを維持。
- 残り54種が「本家完全一致」という意味ではない。今回検証した個別ソース機能の明らかな未接続を新しく発見していないだけで、**実機60fps逐次比較・描画・ネットワーク・詳細数値の完全検査は未実施**。
- ソースの存在はゲームエンジン内部の適用順序を保証しない。とくに `UnitDamageRate=0`、`RandomRotateYBias` の分布、低インク閾値、角度やヒット領域の式は実測または逆解析が必要。

## ソース・分野ごとの網羅性

| 系統 | 原本レコード | native | 発見したIssue |
| --- | ---: | ---: | --- |
| shooter | 14 | 1 | 今回のコード確定差異なし |
| blaster | 7 | 1 | 今回のコード確定差異なし |
| roller | 5 | 1 | #1804, #1805, #1806, #1807, #1810, #1812, #1813 |
| brush | 3 | 0 | #1806, #1807, #1808, #1812 |
| charger | 8 | 1 | 今回のコード確定差異なし |
| slosher | 6 | 1 | #1809, #1811 |
| splatling | 6 | 1 | 今回のコード確定差異なし |
| dualies | 6 | 1 | 今回のコード確定差異なし |
| brella | 4 | 0 | 今回のコード確定差異なし |
| stringer | 3 | 0 | 今回のコード確定差異なし |
| splatana | 3 | 0 | 今回のコード確定差異なし |

## 確定したソース欄の欠落（優先度順）

| 課題 | 対象 | 11.3.0ソース | 現行catalogの差異 |
| --- | --- | --- | --- |
| **#1804** | ヴァリアブルローラー | タテ振りユニット3・4が各6粒の `PaintOnly=true` | 共通 `DamageParam` を付けた弾を全て衝突・ダメージ判定へ投入、`PaintOnly` を読まない |
| **#1805** | カーボン／ダイナモ／ヴァリアブル／ワイド | `AfterOffsetSpawnRotateXDegree=-2.5°` など、粒インデックスごとに変わる上下角。ヴァリ側弾は `SpawnRotateYDegree=±18°` | `SpawnRotateXDegreeBase` は使うが追加オフセット・固有Y回転を読まない |
| **#1806** | 追加ローラー4＋フデ3 | `DamageRejectStartFrame/EndFrame/Rate=.5`：滞空時間ごとに威力が減衰 | `impactDamage` は距離帯だけを評価し、独立した時間減衰なし。legacy #124/#128の修正とは別owner |
| **#1807** | 追加ローラー4＋フデ3 | `DepletionBulletNum`, `DepletionSpeedRate=.5/.7`, 当たり判定・塗りも低インク倍率 | `pay` が満額不足で攻撃拒否、`emitUnits` は常に通常弾数・弾速。legacy #305の修正と別 |
| **#1808** | パブロ／ホクサイ／フィンセント | 左→右／右→左で別の `SpawnRotateYDegree`、`SplashNearestParam` の塗り時刻と半径 | 振り方向別Y回転未使用。フデ固有近距離塗りのループ／順序未使用 |
| **#1809** | ヒッセン／スクリュー／エクス／モップリン | `NearestParam` の独立した足元塗り。実数：半径 **1.296 / 1.0 / 1.56 / 2.0** | nativeバケツ・catalogオバフロにはownerがあるが、この4つでは呼ばれていない |
| **#1810** | 追加ローラー4（特にダイナモ・ヴァリ） | ヨコ振りの `Inside/Outside` が別角度・威力。ダイナモ最大 **1800/1200**、ヴァリ **1500/1000** | `impactDamage` は常に `DamageParam.Inside` を使用 |
| **#1811** | ヒッセン／モップリン | `RandomRotateYDegree=3°/4.5°`（除外インデックス付き）、`FrameOffsetMaxDegree=1.5°/4.5°` | catalogの射出角は確定的。nativeバケツの散布処理は未共有で、視点移動への扇状補正もオバフロにしか適用していない |

## 未確定・実射が必要なもの

- **#1812**：追加ローラー・フデの発射方向はいまだ `_aimFrom(aimPoint-muzzle)`。nativeローラーは `aimPitch` 由来。エクスプロッシャー #1794 と同様、`-45°` が照準とずれる可能性がある。ただし7種それぞれのゲーム内実射は未実施。
- **#1813**：ダイナモのヨコ振り第二ユニットは抽出値 `UnitDamageRate=0`。catalogは不使用だが、その `0` が本家内部で「完全無ダメージ」を意味するとは確定していない。
- **#1431**：クアッド／エクスの発射初期表示と実弾の発生位置差。実装・モデルの差であり、下向き照準 #1794 の修正とは別。
- **#1789**：オーバーフロッシャーの斜面反射と `BounceAfterMaxSpeed` の本家適用順序。本家動画/内部ロジック未確定。

## 本家の資料と採用した確からしさ

1. [Leanny S3 11.3.0 source](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)：実際の各ブキの疎な数値テーブル（**source-defined**）。
2. [スプラ3 攻略＆検証Wiki パラメータ情報](https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報)：`PaintOnly`, `SpawnRotateYDegreeLeftToRight`, `DamageReject`, `Depletion` などの説明。記載が「不明」の用途は確定扱いしない（**community interpretation**）。
3. [Inkipedia Dynamo Roller](https://splatoonwiki.org/wiki/Dynamo_Roller)：角度別ヨコ振り最大180/120ダメージ、30～55F時間減衰、低インク投射の挙動（**retail study**）。
4. [main weapon catalog interpreter](https://github.com/rhgrive3/actions/blob/144923aefc282a588225ac44de3da95762653add/patches/splatoon3/runtime/main-weapon-catalog.mjs)：`mode`, `emitUnits`, `impactDamage`, `pay`、各関数と使用フィールドを確認（**installed game code**）。
5. [native S3 weapons-fidelity](https://github.com/rhgrive3/actions/blob/144923aefc282a588225ac44de3da95762653add/patches/splatoon3/runtime/weapons-fidelity.mjs)：native Slosherの `slosherYawOffset` 等が使われる経路を参照（**separate owner**）。

## 全65件：武器別監査台帳

<caption>下表の「今回の監査では追加の確定差異なし」は本家と同一であることを意味しない。</caption>

| 系統 | 日本語 | English | INKWAVE物理ID | 実装owner | 課題 |
| --- | --- | --- | --- | --- | --- |
| shooter | ボールドマーカー | Sploosh-o-matic | `s3-shooter-short` | catalog | 今回の監査では追加の確定差異なし |
| shooter | わかばシューター | Splattershot Jr. | `s3-shooter-first` | catalog | 今回の監査では追加の確定差異なし |
| shooter | シャープマーカー | Splash-o-matic | `s3-shooter-precision` | catalog | 今回の監査では追加の確定差異なし |
| shooter | プロモデラーMG | Aerospray MG | `s3-shooter-blaze` | catalog | 今回の監査では追加の確定差異なし |
| shooter | スプラシューター | Splattershot | `shooter` | 既存native | 今回の監査では追加の確定差異なし |
| shooter | .52ガロン | .52 Gal | `s3-shooter-gravity` | catalog | 今回の監査では追加の確定差異なし |
| shooter | N-ZAP85 | N-ZAP '85 | `s3-shooter-quickmiddle` | catalog | 今回の監査では追加の確定差異なし |
| shooter | プライムシューター | Splattershot Pro | `s3-shooter-expert` | catalog | 今回の監査では追加の確定差異なし |
| shooter | .96ガロン | .96 Gal | `s3-shooter-heavy` | catalog | 今回の監査では追加の確定差異なし |
| shooter | ジェットスイーパー | Jet Squelcher | `s3-shooter-long` | catalog | 今回の監査では追加の確定差異なし |
| shooter | スペースシューター | Splattershot Nova | `s3-shooter-quicklong` | catalog | 今回の監査では追加の確定差異なし |
| shooter | L3リールガン | L-3 Nozzlenose | `s3-shooter-triplequick` | catalog | 今回の監査では追加の確定差異なし |
| shooter | H3リールガン | H-3 Nozzlenose | `s3-shooter-triplemiddle` | catalog | 今回の監査では追加の確定差異なし |
| shooter | ボトルガイザー | Squeezer | `s3-shooter-flash` | catalog | 今回の監査では追加の確定差異なし |
| blaster | ノヴァブラスター | Luna Blaster | `s3-blaster-short` | catalog | 今回の監査では追加の確定差異なし |
| blaster | ホットブラスター | Blaster | `blaster` | 既存native | 今回の監査では追加の確定差異なし |
| blaster | ロングブラスター | Range Blaster | `s3-blaster-long` | catalog | 今回の監査では追加の確定差異なし |
| blaster | クラッシュブラスター | Clash Blaster | `s3-blaster-lightshort` | catalog | 今回の監査では追加の確定差異なし |
| blaster | ラピッドブラスター | Rapid Blaster | `s3-blaster-light` | catalog | 今回の監査では追加の確定差異なし |
| blaster | Rブラスターエリート | Rapid Blaster Pro | `s3-blaster-lightlong` | catalog | 今回の監査では追加の確定差異なし |
| blaster | S-BLAST92 | S-BLAST '92 | `s3-blaster-precision` | catalog | 今回の監査では追加の確定差異なし |
| roller | カーボンローラー | Carbon Roller | `s3-roller-compact` | catalog | [#1805](https://github.com/rhgrive3/actions/issues/1805), [#1806](https://github.com/rhgrive3/actions/issues/1806), [#1807](https://github.com/rhgrive3/actions/issues/1807), [#1810](https://github.com/rhgrive3/actions/issues/1810), [#1812](https://github.com/rhgrive3/actions/issues/1812) |
| roller | スプラローラー | Splat Roller | `roller` | 既存native | 今回の監査では追加の確定差異なし |
| roller | ダイナモローラー | Dynamo Roller | `s3-roller-heavy` | catalog | [#1805](https://github.com/rhgrive3/actions/issues/1805), [#1806](https://github.com/rhgrive3/actions/issues/1806), [#1807](https://github.com/rhgrive3/actions/issues/1807), [#1810](https://github.com/rhgrive3/actions/issues/1810), [#1812](https://github.com/rhgrive3/actions/issues/1812), [#1813](https://github.com/rhgrive3/actions/issues/1813) |
| roller | ヴァリアブルローラー | Flingza Roller | `s3-roller-hunter` | catalog | [#1804](https://github.com/rhgrive3/actions/issues/1804), [#1805](https://github.com/rhgrive3/actions/issues/1805), [#1806](https://github.com/rhgrive3/actions/issues/1806), [#1807](https://github.com/rhgrive3/actions/issues/1807), [#1810](https://github.com/rhgrive3/actions/issues/1810), [#1812](https://github.com/rhgrive3/actions/issues/1812) |
| roller | ワイドローラー | Big Swig Roller | `s3-roller-wide` | catalog | [#1805](https://github.com/rhgrive3/actions/issues/1805), [#1806](https://github.com/rhgrive3/actions/issues/1806), [#1807](https://github.com/rhgrive3/actions/issues/1807), [#1810](https://github.com/rhgrive3/actions/issues/1810), [#1812](https://github.com/rhgrive3/actions/issues/1812) |
| brush | パブロ | Inkbrush | `s3-brush-mini` | catalog | [#1806](https://github.com/rhgrive3/actions/issues/1806), [#1807](https://github.com/rhgrive3/actions/issues/1807), [#1808](https://github.com/rhgrive3/actions/issues/1808), [#1812](https://github.com/rhgrive3/actions/issues/1812) |
| brush | ホクサイ | Octobrush | `s3-brush-normal` | catalog | [#1806](https://github.com/rhgrive3/actions/issues/1806), [#1807](https://github.com/rhgrive3/actions/issues/1807), [#1808](https://github.com/rhgrive3/actions/issues/1808), [#1812](https://github.com/rhgrive3/actions/issues/1812) |
| brush | フィンセント | Painbrush | `s3-brush-heavy` | catalog | [#1806](https://github.com/rhgrive3/actions/issues/1806), [#1807](https://github.com/rhgrive3/actions/issues/1807), [#1808](https://github.com/rhgrive3/actions/issues/1808), [#1812](https://github.com/rhgrive3/actions/issues/1812) |
| charger | スクイックリンα | Classic Squiffer | `s3-charger-quick` | catalog | 今回の監査では追加の確定差異なし |
| charger | スプラチャージャー | Splat Charger | `charger` | 既存native | 今回の監査では追加の確定差異なし |
| charger | スプラスコープ | Splatterscope | `s3-charger-normalscope` | catalog | 今回の監査では追加の確定差異なし |
| charger | リッター4K | E-liter 4K | `s3-charger-long` | catalog | 今回の監査では追加の確定差異なし |
| charger | 4Kスコープ | E-liter 4K Scope | `s3-charger-longscope` | catalog | 今回の監査では追加の確定差異なし |
| charger | 14式竹筒銃・甲 | Bamboozler 14 Mk I | `s3-charger-light` | catalog | 今回の監査では追加の確定差異なし |
| charger | ソイチューバー | Goo Tuber | `s3-charger-keeper` | catalog | 今回の監査では追加の確定差異なし |
| charger | R-PEN/5H | Snipewriter 5H | `s3-charger-pencil` | catalog | 今回の監査では追加の確定差異なし |
| slosher | バケットスロッシャー | Slosher | `slosher` | 既存native | 今回の監査では追加の確定差異なし |
| slosher | ヒッセン | Tri-Slosher | `s3-slosher-diffusion` | catalog | [#1809](https://github.com/rhgrive3/actions/issues/1809), [#1811](https://github.com/rhgrive3/actions/issues/1811) |
| slosher | スクリュースロッシャー | Sloshing Machine | `s3-slosher-launcher` | catalog | [#1809](https://github.com/rhgrive3/actions/issues/1809) |
| slosher | オーバーフロッシャー | Bloblobber | `s3-slosher-bathtub` | catalog | [#1789](https://github.com/rhgrive3/actions/issues/1789) |
| slosher | エクスプロッシャー | Explosher | `s3-slosher-washtub` | catalog | [#1809](https://github.com/rhgrive3/actions/issues/1809) |
| slosher | モップリン | Dread Wringer | `s3-slosher-double` | catalog | [#1809](https://github.com/rhgrive3/actions/issues/1809), [#1811](https://github.com/rhgrive3/actions/issues/1811) |
| splatling | スプラスピナー | Mini Splatling | `s3-spinner-quick` | catalog | 今回の監査では追加の確定差異なし |
| splatling | バレルスピナー | Heavy Splatling | `splatling` | 既存native | 今回の監査では追加の確定差異なし |
| splatling | ハイドラント | Hydra Splatling | `s3-spinner-hyper` | catalog | 今回の監査では追加の確定差異なし |
| splatling | クーゲルシュライバー | Ballpoint Splatling | `s3-spinner-downpour` | catalog | 今回の監査では追加の確定差異なし |
| splatling | ノーチラス47 | Nautilus 47 | `s3-spinner-serein` | catalog | 今回の監査では追加の確定差異なし |
| splatling | イグザミナー | Heavy Edit Splatling | `s3-spinner-hypershort` | catalog | 今回の監査では追加の確定差異なし |
| dualies | スパッタリー | Dapple Dualies | `s3-maneuver-short` | catalog | 今回の監査では追加の確定差異なし |
| dualies | スプラマニューバー | Splat Dualies | `dualies` | 既存native | 今回の監査では追加の確定差異なし |
| dualies | ケルビン525 | Glooga Dualies | `s3-maneuver-gallon` | catalog | 今回の監査では追加の確定差異なし |
| dualies | デュアルスイーパー | Dualie Squelchers | `s3-maneuver-dual` | catalog | 今回の監査では追加の確定差異なし |
| dualies | クアッドホッパーブラック | Dark Tetra Dualies | `s3-maneuver-stepper` | catalog | 今回の監査では追加の確定差異なし |
| dualies | ガエンFF | Douser Dualies FF | `s3-maneuver-long` | catalog | 今回の監査では追加の確定差異なし |
| brella | パラシェルター | Splat Brella | `s3-shelter-normal` | catalog | 今回の監査では追加の確定差異なし |
| brella | キャンピングシェルター | Tenta Brella | `s3-shelter-wide` | catalog | 今回の監査では追加の確定差異なし |
| brella | スパイガジェット | Undercover Brella | `s3-shelter-compact` | catalog | 今回の監査では追加の確定差異なし |
| brella | 24式張替傘・甲 | Recycled Brella 24 Mk I | `s3-shelter-focus` | catalog | 今回の監査では追加の確定差異なし |
| stringer | トライストリンガー | Tri-Stringer | `s3-stringer-normal` | catalog | 今回の監査では追加の確定差異なし |
| stringer | LACT-450 | REEF-LUX 450 | `s3-stringer-short` | catalog | 今回の監査では追加の確定差異なし |
| stringer | フルイドV | Wellstring V | `s3-stringer-explosion` | catalog | 今回の監査では追加の確定差異なし |
| splatana | ジムワイパー | Splatana Stamper | `s3-saber-normal` | catalog | 今回の監査では追加の確定差異なし |
| splatana | ドライブワイパー | Splatana Wiper | `s3-saber-lite` | catalog | 今回の監査では追加の確定差異なし |
| splatana | デンタルワイパーミント | Mint Decavitator | `s3-saber-heavy` | catalog | 今回の監査では追加の確定差異なし |

## 修正受入条件（Issueごとに別PR）

- 固定60Hzの実発射で、照準角 `-70,-45,-20,0,+40,+70°`、水平/縦振り、左右フデ振り、距離と時間ダメージ、低インク、Flingza塗り専用、壁・床・オブジェクト/傘遮蔽、ネットワークghostの値を記録する。
- sourceパラメータに基づく境界値をテストし、ソース欄が不明な箇所は実機動画・逆解析と**比較前に値を捏造しない**。
- `#1814` は追跡の親Issue。#1804～#1813を個別PRで修正後、関連Issueを閉じる。CIとPages公開は別々に確認する。
