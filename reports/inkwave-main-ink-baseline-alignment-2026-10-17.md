# Projectile 比較基準の塗り整列 — 2026-10-17

## 目的と範囲

Projectile の paired comparator は、着弾時の claimed area、paint coverage、receipt、出生、物理状態、RNG を引き続き比較する。PR #1525 の新しい輪郭を candidate にだけ入れると、意図した塗り面積の変化で比較が失敗するため、比較用の別 checkout にも**レビュー済みの塗り変更だけ**を適用する。

本変更は比較用 prepare/helper/fixture/tests/workflow の変更であり、runtime を変更しない。本家の stencil を復元したという意味ではない。輪郭は小売版画像を参考にした較正であり、Nintendo の正確な形状・座標系・処理順の未確認項目は残る。

共有 runtime を candidate から丸ごとコピーせず、11 個の共有ファイルは 32 個の exact-count hunk だけで整列する。新規の塗り専用 2 module は全文 blob を固定する。元から baseline にある弾速、慣性、出生位置、乱数、判定処理は、別途承認済みの Roller 2 式と pool index 初期化 1 式を除いて残す。

## 固定した原典

- 元の PR #1525 の前後: [378dcf78d09714cb3f89c39a46e36a52ad997869 → 8c8c26d4486ddc95c03fcd5e0201c6c1c95c6654](https://github.com/rhgrive3/actions/compare/378dcf78d09714cb3f89c39a46e36a52ad997869...8c8c26d4486ddc95c03fcd5e0201c6c1c95c6654)。
- fixture: scripts/fixtures/inkwave-main-ink-pr1525-baseline.json。Git blob SHA: 5985726bc374b100f615dcd436f8cc9b653edbb9。helper が fixture 全体の SHA を検査し、13 path の allowlist、元 commit、32 hunk、新規 module の全文 SHA を検査する。
- 元の塗り module: 895085f4018f7586d68bf46d8c6ae1c49c390fb7。
- 既知の中間 highp 版: c8c8969cea508bafeb17134ef19545c00db7a4f9。
- 最終の packed-edge/highp 版: 1844653c07ffc22b65ab74054111a827fb87df55。baseline は未導入または上記の既知 blob に限り受理し、candidate は最終 blob と完全一致することを要求する。

GitHub connector から取得した元の 11 shared file の before/after 全文は Git blob SHA を再計算して検証した。その全文を入力に Node の実装で plan を作り、全 13 path の結果が fixture に記録された afterBlob と完全一致することも確認した。履歴全体や後発 PR head を無条件に取り込んでいない。

| 対象 | 方法 | 範囲 |
|---|---|---|
| patches/network-replication/adapter.mjs | 1 hunk | 塗り kind の許可一覧 |
| patches/network-replication/slosher-paint-admission.mjs | 1 hunk | ink-slosh receipt の許可 |
| patches/splatoon3/main-ink-footprint-adapter.mjs | 新規 module 全文 SHA | CPU/GPU の塗り輪郭と既存塗り口への接続 |
| patches/splatoon3/runtime/blaster-flight-paint.mjs | 6 hunks | 既存 drop に footprint を受け渡す |
| patches/splatoon3/runtime/main-ink-footprints.mjs | 新規 module 全文 SHA | 輪郭データ、CPU/GPU lookup |
| patches/splatoon3/runtime/main-weapon-catalog.mjs | 10 hunks | 塗り関数と既存呼出の footprint |
| patches/splatoon3/runtime/paint-packet-codec.mjs | 2 hunks | kind dictionary と version |
| patches/splatoon3/runtime/slosher-intermediate-paint.mjs | 2 hunks | 既存中間塗りの footprint |
| patches/splatoon3/runtime/slosher-nearest-paint.mjs | 2 hunks | 既存足元塗りの footprint |
| patches/splatoon3/runtime/weapon-edgecases.mjs | 2 hunks | Roller release の 1 stamp の kind/向き/footprint |
| patches/splatoon3/runtime/weapons-fidelity.mjs | 3 hunks | import と既存壁/かすり塗りの footprint |
| scripts/inkwave-source-composition.mjs | 2 hunks | adapter の import/呼出 |
| scripts/lib/inkwave-build-only-modules.mjs | 1 hunk | adapter の build-only 登録 |

## 検証と書込みの順序

prepare は最初に 13 path と両 profile を読む。Roller の raw source group が一致することを確認し、Roller 2 式、pool 1 式、最後に塗り 13 path を、一つの map で順に計画する。**全検証が成功するまで、baseline のファイルも receipt も書かない。**

unknown、重複、candidate の legacy/partial hunk、未レビューの新規 module 全文、欠損は拒否する。挿入 hunk の after 内に before が含まれる場合も、after の外に legacy block が残っていれば拒否する。既知の整列済み状態は再実行しても変更されない。

receipt には元 commit、manifest SHA、各 path の baseline/reference/candidate の Git blob SHA と SHA-256、hunk の元行・前後 SHA、replay した hunk、非対象領域の SHA-256、書いた path を残す。比較用のための整列であることを receipt に明記する。

これは全ソース検証後に書き込む手順であり、OS 障害時にも複数ファイルの書込みが一括で完了するという主張ではない。

## 実施した確認

復旧した作業環境の Node v24.19.0 で実行。CI は既存の固定 Node 22 と実ブラウザを使用する。

- 新規 baseline test 9/9 pass。既存 Roller/pool test 6/6 pass。
- 32 hunk × baseline/candidate × unknown/duplicate = **128 個の負対照**をすべて拒否。
- 各 candidate の legacy/partial block、2 新規 module の片側改変、manifest の変更を拒否。
- baseline と candidate に異なる出生・弾速・RNG のコードを置き、baseline のコードが保持され、candidate の非対象コードが入らないことを確認。
- 最終 path を壊した prepare は非ゼロ終了し、全 baseline ファイル、未作成の 2 module、既存 receipt を変更しない。
- Roller 2 式 → pool 1 式 → paint の実 prepare 合成に成功。二度目は changes/writtenPaths が空で、生成したソースは完全一致。
- 実際の candidate checkout が 32 個の候補 hunk と最終 GPU blob を満たすことを確認。
- 元 commit の before 全文からの整列結果は、全 13 path で原典の after SHA と一致（GPU module のみ明示された最終 pin）。

GPU packing の独立確認では、旧 highp 2 fetch 版と新 packed 1 fetch 版について、5 × 128 × RG の edge 値に差がなく、BA が次の RG と一致し、663,060 点の CPU contains 判定にも差がなかった。新 shader は highp sampler、CPU と同じ x の演算順、明示的な補間、1 回の texture lookup を持つ。**これは実 GPU の比較を代替しない。** Chromium/WebKit の最終 gate は親の統合 CI で確認する。

古い circle/generic mask の独立 golden、15 ケースの出生/着弾/RNG 制約、塗り領域の負対照は reports/inkwave-weapons-golden-reconciliation-2026-10-17.md の結果を維持する。RG の輪郭が等価なので、旧 oracle の固定値は更新していない。

## CI

### 元 PR #1512 の追加 head への追従

公開 branch ref と pull ref の両方で最新 head が [8f2c1a840c6b278d7e332246b2a4f1a836b1e202](https://github.com/rhgrive3/actions/commit/8f2c1a840c6b278d7e332246b2a4f1a836b1e202) であることを確認した。先行の 3e454581 から追加されたのは比較 helper/test の 2 ファイルだけで、runtime の機能差分はない。

この限定変更に従い、生成する縦振り reference は candidate と同じ 3 行の式に統一した。以前の短縮式は既知の移行入力としてのみ受理し、元式→同一式、旧 reference→同一式、整列済み→無変更を検証する。旧 reference と新式の混在・重複・未知の改変は拒否する。これは比較時の式と演算順を同一にする措置であり、この追補で旧短縮式の実値差を計測したという主張ではない。

実 prepare の移行試験でも、以前の短縮式を持つ baseline の weapons-fidelity だけを書き換え、全塗りファイルとその既知 hunk が変わらないことを確認した。

.github/workflows/inkwave-projectile-visuals.yml の変更 path と実行 gate に新 helper/fixture/test を追加した。

    node --test scripts/tests/inkwave-main-ink-baseline.test.mjs
    node --test scripts/tests/inkwave-roller-birth-baseline.test.mjs

paired comparator の claimed-area/coverage/physical gate は本変更で削除も緩和もしていない。
