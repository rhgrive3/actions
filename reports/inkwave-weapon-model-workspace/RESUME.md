# INKWAVE メインブキ個別モデル — 作業再開ガイド（2026-10-11 時点）

目的: INKWAVE の全65メインブキの3Dモデル・持ち方・モーション・可動部を Splatoon 3 Ver.11.3.0 に近づける。
ブランチ: `ccr-f2195044-hletup`。比較記録: `reports/inkwave-splatoon3-behavior-2026-10-02.md` の「2026-10-11」節。

## 現状
| 状態 | ブキ |
|---|---|
| 完成（Opus 作成） | シューターA 7（`shooters.mjs`）、ローラー5・フデ3（`rollers.mjs` / `brushes.mjs`、振り・ドラッグのモーション含む） |
| 完成（Opus の途中成果を Haiku が仕上げ） | ブラスター7（`blasters.mjs`）、チャージャー8（`chargers.mjs`） |
| 完成（Haiku 作成。品質は中） | シューターB 7（`shooters-b.mjs`、.96ガロンは手直し済み） |
| 完成（Sonnet 作成） | シェルター4（`brellas.mjs`、傘の開閉）、ストリンガー3（`stringers.mjs`、弦）、ワイパー3（`splatanas.mjs`、斬り） |
| 完成（Opus で作り直し、第2段） | スロッシャー5（`sloshers.mjs`）、スピナー6（`splatlings.mjs`、ノーチラス47 を含む）、マニューバー6（`dualies.mjs`、スパッタリーを含む） |
| 従来モデルのまま | バケットスロッシャー（既存テストが従来のインク量表示・取っ手位置に依存） |

輪郭IoU（本家3Dレンダーとの側面シルエット一致度）: 全65種平均 0.346 → 0.495（`silhouette-now.json`、修正前は `before/silhouette.json`）。
比較画像: `compare/*.jpg`（本家 | 修正前 | 現在）。ローラー・フデ・シェルター・ストリンガー・ワイパーは参照の構図上、側面IoUは参考値にならない。

## 次の作業（ユーザー指示）
スロッシャー → スピナー → マニューバーの作り直しは完了（ユーザー指示によりマニューバーで個別モデル作業は終了）。残りは全体テスト・記録・PR の仕上げ。
以下は追加で作り直す場合の手順。
各ブキ: 参照（`refs/<id>.3d.png`、`rotsheets/<id>.rot.jpg`）を見る → 形状を立体的に作る（押し出し板ではなく lathe/箱/管の組合せ）→
`tools/iterate.sh` で描画比較 → `WEAPON_IDS=<id> node --experimental-vm-modules --test patches/splatoon3/tests/weapon-models-all.test.mjs` → コミット・push。
既存テストの制約: スロッシャーは `surface`（水平なインク面）と `lever` チャンネル、スピナーは `barrels`（局所Z軸で回転）と充電コイル `d.glow` を保持、
マニューバーは `d.dual` と `gripR = gripL = GRIP_PISTOL`、`slide`/`slideInk`/`led` を保持。

## 作業環境の復元
```sh
export SP=/tmp/inkwave-ws; mkdir -p $SP && cp -r reports/inkwave-weapon-model-workspace/{refs,rotsheets,tools,before} $SP/
cp reports/inkwave-weapon-model-workspace/{BRIEF.md,model-components.txt,alt-kits.json} $SP/
npm install --no-save --no-package-lock esbuild@0.28.2 playwright@1.56.1   # Chromium は環境の既存のものを使う
# 回転動画が必要なら: tools/dlrot.sh tools/names.tsv $SP/rot（Inkipedia から再取得。別キット対応は alt-kits.json）
SP=$SP $SP/tools/iterate.sh $SP/it-x <id,id,...> [--no-held]   # ビルド→描画→比較（<outdir>/<id>.compare.jpg, silhouette.json）
```
- 修正前比較の基準は `before/<id>.side.png`（各ブキのファミリー共通モデル）。`tools/compare` は `scripts/compare-inkwave-weapon-gallery.py`。
- 比較シート作成: `python3 tools/famsheet.py $SP out.jpg "Title" <ids...>`（`$SP/before2` と `$SP/now` を参照するので必要ならパスを合わせる）。
- 基盤: `patches/splatoon3/runtime/weapon-models/{registry,kit}.mjs`、`weapon-family-motion.mjs`、`scripts/render-inkwave-weapon-gallery.mjs`、
  `patches/splatoon3/tests/weapon-models-all.test.mjs`（全65種の形状・グリップ・銃口・実Actorでの保持と攻撃）。仕様は `BRIEF.md`。

## 検証状況
- `check-inkwave-patches.mjs` 全体: 初回 4437件中 失敗5（修正済み: ボム投擲IK、#1096 Blaster ダイジェスト更新、スロッシャー従来化、スピナー充電コイル復元）。
  修正後の再実行は途中まで失敗0（完走結果は未取得）。
- PR は未作成→このコミットで作成予定。main へのマージは未実施。

## 注意
- 参照画像は Inkipedia（任天堂の公式レンダー）からの取得物。作業参照用であり、ゲーム本体には含めていない。
- 寸法・関節曲線・銃口位置は画像からの推定で、本家実機との比較は未実施（未確認）。
