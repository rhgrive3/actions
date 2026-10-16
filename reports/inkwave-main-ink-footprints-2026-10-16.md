# INKWAVE：バケツ・ローラー・筆・シューター・マニューバーの塗り形状

共通の丸／楕円だった着弾輪郭を、資料に合わせた5種類の断面テーブルへ変更した。対象5系統は34種類の基本ブキと、それを使う派生キット。ブキごとの幅・塗りの伸び・飛沫の配置は既存の11.3.0固定データを使う。画像に基づく近似であり、Nintendo の実テクスチャや実機との完全一致は確認していない。

[画像11点・検証資料・採用判断](../patches/splatoon3/reference/main-ink-footprints-2026-10-16.md) と [画像URL・ハッシュ台帳](../patches/splatoon3/reference/main-ink-footprints-images.json)。バケツはWikiとGame8、ローラーはWikiとアルテマ、筆はWikiとnote、シューターはWikiとアルテマ、マニューバーはアルテマと任天堂を実際に表示して比較した。出典の版・ギア・射角が不明な画像を11.3.0の定量測定とは扱わない。

## 変更とプレイへの影響

- バケツ：太い先端と細い根元を作る既存のユニット配置に、丸みのある不揃いな池を適用。足元と途中の落下飛沫も接続。スクリュー／泡をバケツのシートにせず、エクスプロッシャーの爆発は既存の爆発塗りを使う。
- ローラー：横振り／縦振りの既存の散布・減衰に沿って、太い着弾部と細い接続部を表す輪郭を適用。追加ローラーの塗り進みは帯状にする。基本ローラーの既存の接触帯は維持。
- 筆：振った飛沫は画像で確認した両端の丸い帯状の輪郭、接触移動は細い連続帯にする。パブロ／ホクサイ／フィンセントの幅や散布は各ブキの既存データによる。
- シューター／マニューバー：着弾・途中・足元の独立した塗りを維持し、接続部と不揃いな肩を持つ輪郭にする。両手・射撃後のスライド状態は既存の発射処理が担当する。
- CPUも同じ輪郭で泳ぎ・敵インク・面積を判定する。新しい輪郭と違う旧楕円の面積に固定しない。実際に塗られたセルだけを一度加算する。

変更箇所は `runtime/main-ink-footprints.mjs` と build-only の `main-ink-footprint-adapter.mjs`、既存のメイン着弾／落下飛沫／接触経路、塗りの通信受理。`inkwave-public/` は変更していない。

## 負荷と同期

128×8の共通RGBA8テーブルは4,096 bytes。GPUは1回のテクスチャ参照、CPUは同じバイト列を参照する。初期化時にだけ曲線を焼き、塗り時の三角関数や輪郭の再生成を避ける。回転後の範囲でCPU走査を絞り、倒数をスタンプごとに計算する。新しい弾、スタンプ、通信フィールドは追加しない。

確定した輪郭を既存のkindとseedで送る。受信後に現在の装備から推測しない。バケツ着弾の出生証明・位置・半径・深さの検証は維持し、異なる形状への偽装を拒否する。辞書の対応kindが増えるため、圧縮の交渉版はv2にした。

CPUの比較は5秒＝300固定tickの部品シミュレーション。Actor、WeaponRunner、Projectiles、CPU Paintを使い、移動積分・表示・音はfixtureで簡略化している。旧楕円の対照と候補を交互に7回実行し、最初の2回を除く5回の中央値を記録する。[測定値](inkwave-main-ink-cost-2026-10-16.json)。GPU FPSやスマートフォン実機の性能を示す値ではない。

| ブキ | 塗り回数 | 旧楕円 ms | 候補 ms | 増減 ms / 300tick |
| --- | ---: | ---: | ---: | ---: |
| shooter | 45 | 66.87 | 67.64 | +0.77 |
| dualies | 36 | 40.78 | 41.27 | +0.49 |
| slosher | 91 | 57.75 | 60.17 | +2.42 |
| roller | 27 | 29.95 | 29.20 | -0.74 |
| s3-brush-mini | 3 | 14.78 | 25.26 | +10.48 |
| s3-roller-heavy | 133 | 37.28 | 45.29 | +8.02 |
| s3-brush-heavy | 8 | 17.62 | 20.87 | +3.25 |
| s3-slosher-diffusion | 151 | 94.69 | 115.06 | +20.36 |

再測定では5秒分の処理で最大 +20.36ms。VM・JIT・GCを含む部品測定のばらつきがあるため、端末のフレーム時間に換算して性能保証とはしない。各回の値もJSONに保存した。

## 確認

- ソースの関連検証 **205/205** 通過。最終の小さな計算削減と期待値更新後も対象44件を再実行し **44/44** 通過。
- 本番minify生成物の Actor／塗り到達／足元／辞書圧縮／バケツ着弾受理 **117/117** 通過。
- 実Chromium/SwiftShaderで、ソースと生成物それぞれ旧付帯形状124条件、整数hash 1,512照会、身体輪郭 **782条件（新規5形状540条件を含む）** を比較。CPUだけ／GPUだけの内点は **0/0**。9セルは元から残るfloat32境界上（|sd|<0.001 WU）の差として分離。
- 本番uniform・テクスチャupload・実アトラスの6比較と、実Actor発射記録8ブキ×旧楕円／新輪郭の16比較を確認。幅ゼロ区間の余分な線が出ない画素検証も通過。
- ソース／生成物の検証結果は構造化データ全体で一致。[ブラウザ結果の要約とハッシュ](inkwave-main-ink-browser-2026-10-16.json)。ビルドのcontentHashは `b9d166911697dcc3d91966629006aacf4b04ede326373f43a691c2b411a0027f`。
- 34ブキの実発射経路、追加ローラー4＋筆3の実接触経路を確認。負荷比較8ブキは旧楕円対照と発射記録が一致し、30/60/120Hzを入力した本番FixedClockで最終CPUグリッドが一致。


比較画像は、ソースと本番minify生成物の実shader・uniform・アトラスから出力した。単発輪郭の対照と、実Actorの単一トリガーで生成された8ブキの塗り記録を同じGPU経路で描いた比較を添付する。後者の各ペアでは数値・配置・seedは同じで、輪郭だけを旧楕円に切り替えたものが対照となる。全ゲームの旧版画面を撮ったものではない。

- [単発輪郭・接触帯の実GPU比較](inkwave-main-ink-footprints-gallery.png)
- [実Actor発射記録8ブキの輪郭比較](inkwave-main-ink-footprints-volleys.png)

画像確認で筆の輪郭を修正し、接触帯の幅ゼロ区間に半透明の線が出る問題も修正した。後者は実アトラスの画素検証を追加し、空の区間のalphaが0であることを確認する。

本家実機との同条件比較、全ブキの本家マスク選択、写真にある細かい穴や独立した飛沫の完全一致、壁・複数面での本家投影一致、Switch/iPad実機のFPSは未確認。輪郭の手動校正を本家の解析済み定数として扱わない。

## 再実行

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/main-ink-footprints.test.mjs
node --experimental-vm-modules scripts/measure-main-ink-footprints.mjs --output cost.json --capture captures.json
ESBUILD_MODULE=/path/to/esbuild/lib/main.js node scripts/build-inkwave.mjs inkwave-public /absolute/build
node scripts/check-inkwave-paint-mask.mjs --site /absolute/build --playwright /path/to/playwright/index.mjs --executable /usr/bin/chromium --main-ink-captures captures.json --evidence-dir /absolute/evidence --profile-dir /absolute/browser-profile
INKWAVE_BUILT_SITE=/absolute/build node --experimental-vm-modules --test patches/splatoon3/tests/main-ink-footprints.test.mjs
```
