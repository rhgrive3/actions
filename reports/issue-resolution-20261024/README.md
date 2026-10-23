# Issue対応の継続結果（2026-10-24 JST）

[PR #1852](https://github.com/rhgrive3/actions/pull/1852)はhead `9d075e26`、[独立CI修復PR #1853](https://github.com/rhgrive3/actions/pull/1853)はhead `62d6eb3e`へpush済み。mainは`7e027ac2`を取り込み、メニュー描画の後続修正を保持しています。**全29件解消ではなく、mainへ未マージです。**

## 今回直した点

1. 必須CIの参照チェック修復後、201件の生成物テストが成功した直後に`_site-launch-packets.json`がBashコマンドとして実行されexit127になる不具合を修正。成果物を本来のupload actionへ移しました。最終条件は`always()`と`if-no-files-found: error`で、成果物欠落を成功扱いにしません。
2. 元の7jobの承認SHA256を維持し、修復tailの正確な逆写像だけを比較へ追加。壊れた旧tailは元hashと同じでも拒否し、テスト削除、失敗無視、upload/identityの緩和も負例で拒否。別の未受入CI最適化PR #1861は取り込んでいません。
3. 別のCharger実験で、発射方向のすり替え、前回追加に伴う初期化循環、照合後proofの期限・payload・消費済みaliasを補強しました。詳細と未完了境界は下記の別記録です。この変更は公開候補PRに含めません。

## 公開候補の検証

| 対象 | 結果 |
|---|---|
| 最新通常minify build・quick・startup budget | 成功 |
| Git入力1421 / 生成物2110 | final head9d075e26ともhash一致 |
| 最新生成物の対象回帰 | **30/30、skipなし** |
| 最新生成物で、停止していたworkflow run本文をBashで再実行 | **201/201、exit0、skipなし** |
| 最新生成物のexact launch packet verifier | passed、source fallbackなし、保存対象JSONを実生成 |
| 最終workflow関連契約 | **47/47** |
| Quad実Chromium/WebGL | **30/60/120Hz×open/wallの6/6条件成功** |
| native時計同期・実WSとproduction Workerのローカル実行 | **起動・再戦・再接続3条件、双方向6経路成功** |

contentHashは`70ad429d704571381920075c638f9d8c4a4e69edccb78b8afe914e5cae410379`。ブラウザ実行時sourceはb8af626bで、その後の9d075e26はCI/記録だけです。final headとの全入力一致も確認。Quadは診断materialによる実volume表示検証であり、原作画質や端末FPSの認定ではありません。実ブラウザはいずれもChromium/SwiftShaderで、配備済みrelay・物理GPU・実iPad/Switchの試験とは区別します。

前回の全network820/820は旧公開候補sourceの結果として[前回記録](../issue-resolution-20261023/continuation/README.md)に保持。今回の実験版901件と、同じsuite/同じsourceの数字として混ぜません。

GitHubの全必須CIはまだ待ち行列にあり、完了として扱いません。旧headの自分の未完了run3件だけを明示的にcancelし、新headの検証待ちと分けました。他PRのrunは操作していません。実uploadと全remote受入は残ります。[snapshotと検証情報](verification.json)。

## Charger実験の結果

[実験のsource・全raw・失敗履歴](https://github.com/rhgrive3/actions/blob/fix/native-charger-initial-spawn-20261023/reports/issue-resolution-20261024/native-charger/README.md)。方向/初期化修復後の固定source4d09927aは**125ファイル901/901**、対象source108/108、生成物89/89、native起動/時計browser3条件6経路が成功。別worktreeで追加した寿命補強後のb5c49fa5は**source111/111、生成物92/92**が成功。901件全体はb5c49fa5で再実行したとは称しません。beforeの方向1失敗、循環の同一baseline再現、寿命/改変/aliasの3失敗も残しています。

これはnative Splat Charger1/65のoptional proofです。**必須PvP/Boss damage gate、他64main/sub/special、信頼できる過去Match/world順序、外力、後続life・latejoin/owner移管は未完。** これらは実機待ちだけではなく実装・統合の残件です。実験は最新main全変更を統合した候補でも、productionへ強制適用した修正でもありません。

## 残件

実機なしで残る作業は上記authority、#1434の厳密pixel一致校正、#845の追加leg/ground CPU最適化、remote CI受入です。#1434は前回の同状態2画素差が未解消で、今回改善率を追加主張していません。

原作11.3.0の移動/gyro曲線、塗り形状、雨/雲の対応、靴model/装備高、追加武器音声などの資料不足と、物理GPU memory・FPS・実操作の受入も残ります。#1767は修正がmainにありますがmainの必須CIが未成功なので閉じていません。全件の条件は[29件の履歴表](../issue-resolution-20261023/README.md)を併読し、古いsourceの音声・build結果を現在値に読み替えません。

[raw-evidence.tar.gz](raw-evidence.tar.gz)、[member hash](raw-hashes.json)、[localのみの画像hash](local-images.json)。ブラウザprofile・Cookie・外部asset本体は含めません。失敗は[CI修復記録](https://github.com/rhgrive3/actions/blob/fix/reviewed-source-reference-migration-20261023/reports/source-reference-migration-20261023/artifact-tail-repair/README.md)と前回/実験版のrawを保持しています。
