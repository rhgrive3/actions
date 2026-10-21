# Projectile QA の歴史 replay と PR 差分比較の分離

## 失敗と基準

PR #1651 の `610175a583c17933b54548df275268ba19d89676` は、ブラウザ起動前の baseline 8 fixture で失敗した。公式 main `00b8994711809ba6d0469723c858ddef6805e2ae` でも同一8件を再現（27件中19成功、8失敗）。pose 5文脈と current-owner 2個の全file pin が現在の本番コードに追従していない。描画の合否とは別の前処理不具合である。

## 比較の目的を固定

- 歴史fixtureは、以前の実比較が成功した公式 `0dec529d5fc7effb595232fe1097dbd387983fe7` の29 source blobを固定して再生する。gzip SHA-256と各Git blobを検証し、既存hunk/未知1byte拒否を保持する。現在mainの成功証拠とは呼ばない。
- PR #1651 の新しい比較は公式 `d42f3f26372361332bdf596ac88155b153557538` を無改変beforeにする。610由来candidateとの29path pairを全blob検証し、実際に異なる3pathもそのまま残す。候補は610自身またはその直接のQA後継commitに限定し、実行headをreceiptへ保存する。
- beforeはtracked/untrackedともcleanを要求。candidateは対象29pathのHEAD blobと作業treeの一致を検証する。manifestの相対pathはsource I/O前に検証する。未知path/source、dirty実行、無関係commitは失敗する。
- 完全履歴fetchは追加しない。直接parentのcommit headerを使うため、1commit shallow checkoutでも検証できる。

## 回帰結果と未完点

歴史source27/27、公式pair3/3（29path×両側の1byte変更と欠落116負例、逆転/候補のbefore上書き拒否）、workflow契約3/3、本物の小型Git repoを使うCLI8/8が成功した。CLIは無関係branch、存在しない基準commit、dirty/untracked before、dirty candidate、unsafe path、source欠落、未レビューの深い子孫を拒否する。

既存compare jobは全byte同一で、48場面のphysics・RNG・camera・contact・paint ledger・image hash条件を維持する。元PRの飛翔/塗り追加が実比較で差を生む可能性は残り、除外しない。新headの全CI、実ブラウザ48場面、実shader受入は別途必要。武器runtime・timeout・権限は変更していない。
