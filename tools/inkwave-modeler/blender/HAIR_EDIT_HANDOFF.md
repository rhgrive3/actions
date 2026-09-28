# 髪の並行編集引き継ぎ

髪の確定版: `INKWAVE_HAIR_REFINED.blend`、revision `20260927-v6-detail`。

顔の作業中ファイルを後から保存する場合は、髪が古い状態に戻らないよう、`../scripts/inkwave_hair_apply.py` でこの髪だけを最新版へ適用してください。適用スクリプトは髪以外の変更がないことを検査します。全体の古い.blendを開き直して置き換える必要はありません。

手順と比較画像: [髪リファインの記録](../docs/hair-refinement/README.md)。初期状態と統合直前の最新版のバックアップは `/mnt/workspace/.dev-state/agent-work/checkpoints/inkwave-hair-20260927/` にあります。

第6版では耳を通過する毛束を修正し、不要な頭皮の束を整理しました。削除する髪はライブラリの `hairRemovedObjects` に明記されています。更新済みの `inkwave_hair_apply.py` を使用してください。再適用のGLB一致・削除指定なしの欠落拒否を検査済みです。

[今回の比較と検証](../docs/hair-refinement/detail-pass/README.md)
