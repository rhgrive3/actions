# main7e上のHUD最終候補（2026-10-23）

親確認用の別ブランチ `candidate/inkwave-reticle-main7e027-final-20261023`。PR1859のref / mainを更新する操作は含まない。公式main `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51` から作り、原候補 `c74a2d6011777eae7e001297c018ffcecaa263e7` の変更を保存した。実装commitは `8902adfd232754af807ec734e9bddf64ae2b6436`、tree `0974a3fca3cc951fd38582c8f33d50abfcb0d945`。この後の証拠commitはruntime入力を変えない。

## mainとの差分と所有

- runtime変更は `patches/local-quality/s3-hud-look-adapter.mjs` だけ。blob `0bc60b0c9bbb0a4be1931f43e3c7d352c15b39a0` はc74と一致。確定hit時の照準位置、連続hitの固定scale、4個のAnimation再利用、hit/killとaim-on-targetの区別、reset cleanupを維持する。ACK購読を追加しない。
- 共有QAは `scripts/check-inkwave-local-references.mjs` と `scripts/tests/inkwave-local-references.test.mjs` の2 leafだけ。公開 `22f3b7534ae2093aef4c2549112a85a1da09bbf3` とblobが一致し、c68のpin修復・閉じたnegative fixtureと、PR1853の9-edge検査を両方保持する。checker `6d8a6eb13d36bf33bb4655b3fa21219e550683e7`、test `24311c5d9dc055831ad1c4f1757cde93bc0d28f5`。
- c74の専用回帰・ブラウザー検証器・原本/中間証拠と比較記録を保持。共有比較reportのHUD追記は原候補のままであり、他担当の追記を取り込んだり消したりしない。
- PR1858のstatic-menu改善はmain由来のまま。`inkwave-public/`、specialを含む `patches/splatoon3/runtime/`、workflow、builder、composition登録はmainと同一。Tri-Slosher / Roller / Shooter・Splatling splash担当のruntime変更は含めない。

`official-refs-before.txt` / `official-prs-before.json` は今回の公式読取。mainは7e、PR1859はc74。PR1854は現在22f3であり、当方はそのrefを操作していない。初回確認時の2e8と現在の公開refを混同しない。22f3のspecial履歴をmerge/cherry-pickせず、QA2 leafだけを移した。

## 今回終了した検査

- 焦点source **68/68**。HUD / weapon-family / static-menu回帰と参照QA8件を含む。9-edgeのowner/ref/両端byte mutation負の対照も通る。
- 正規 `scripts/build-inkwave.mjs` によるesbuild-minify build成功。
- 実生成物HUD回帰 **12/12**。sourceを別途minifyした代用品ではなく、上の通常buildを直接読み込む。
- 参照checker source / emittedともpass、13 exact mappings。生成物検査ではrootとversionedのpinを照合する。quick patch check、startup budget、`git diff --check` もpass。
- `compare-build.mjs` で1420 canonical inputsとbuilderを現在のGit treeへ結び付け、2110 artifactsを実際のbytesから再hashした。input/content manifest digestも照合した。

今回のbuildは revision `1b6e89b3322e2a53d5b1223f8567b6737a0f4b7aae399c81cca362ae35e2b61c`、contentHash `fb5f0fab676d92749db0e02f332770530eb930b6c6d7590ec0e926dd3715c5d7`。

## 前回実測から変わった入力

前回main7e合成の全1420入力・全2110出力との差分は **0 / 0**、`inkwave-build.json` 全体もbyte一致。QA2 leafはruntime build inputではない。原c74の測定buildからの入力差は既に追加受入した `local-quality/static-menu-adapter.mjs` の1つだけ。`build-readback.json` に保存した。

この同一性に基づき、[凍結したmain7e追加受入](https://github.com/rhgrive3/actions/blob/e9f837d0c22191cb522907797a9af3c506fbaef2/reports/reticle-main7e027-acceptance-20261023/README.md) を引き継ぐ。今回はブラウザーを再実行しておらず、新SHAで新たに描画した証拠とは呼ばない。前回はdesktop / touch phoneのmenu・locker・settings・rangeの可視性、実弾36/36/36の3発目kill、3解像度15点のマーク位置と標的切替、実BOMB_BLOCK越しのHP不変・hit0/marker0を検証した。原c74のbefore/after、30/60/120/144Hz、reset/weapon切替、miss・recovery証拠も変更しない。

[通常remote hit転送の訂正報告](https://github.com/rhgrive3/actions/blob/364409f1c699eb1269153419f4591ef2844521a2/reports/reticle-hit-forward-contract-20261023/README.md) も保存した。受理済みACK時marker0、その後の通常owner hit forwardで1、再送後も1である。正常条件で永久欠落や異常遅延は再現していないため、既存hit経路を保持する。

## 再実行と証拠

`focused-source.tap.gz` / `emitted.tap.gz` はraw bytesを可逆圧縮したもの。`raw-tap-identity.json` に展開後のSHA256と件数を保存した。`build.log` / `references-source.json` / `references-emitted.json` / `patch-check.log` / `startup-budget.log` は今回の結果。`compare-build.mjs` は4引数（repo、今回site、前回main7e測定site、原c74測定site）で `build-readback.json` を再生成する。canonical inputを変える変更があれば同一性による受入継承を停止する。

実行コマンドは `commands.txt`、証拠ファイルのSHA256は `evidence-sha256.json`。通常buildは実装commit上で実行し、証拠commit後にも同じ全入力がそのGit treeと一致するか再確認する。候補branchの公式ref / tree / leaf readbackとexact SHAは親への最終報告で示す。

## 残るgate

**source/component** と **通常Chromium/SwiftShader** の受入を、hardware GPU / Safari / Switchの受入へ読み替えない。全required remote CIの合格も、この焦点検査からは主張しない。

1. 本家映像の参照アクセスは403等で拒否されたまま。回避・再取得・Nintendoメディア公開は行わず、matching weapon/state/camera/aimでのretail動的忠実度は未確認。240ms等は既存INKWAVE値で、retail定数ではない。PNG/JSON診断でありencoded動画frameの測定ではない。gameplayの既存60Hz時計、HUD sampleの30/60/120/144Hz、browser timelineのmsを区別する。
2. 本物のlive transport / 配備済みrelay / remote browser描画は未検証。二端末source VMでの受理済みACKと通常hit forward1回は、それらの代用ではない。

この2つは別の未確認事項である。merge、force push、PR1859 ref更新、他PR編集は行わない。
