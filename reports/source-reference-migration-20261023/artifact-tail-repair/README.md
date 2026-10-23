# 参照修復後に見つかった必須CIの成果物tail修復

PR #1852のsource005f2c52と#1853のdef8b30dは、参照確認を通過した後に`Verify emitted sub and special fidelity boundaries`で停止していました。全201件は成功しており、その直後に`_site-launch-packets.json: command not found`でexit127でした。

根拠: [#1852 core](https://github.com/rhgrive3/actions/actions/runs/39947135585/job/120400007287)、[#1853 core](https://github.com/rhgrive3/actions/actions/runs/39947097417/job/120392554578)。成果物名とretention指定が以前の編集でrun直下に残り、ファイル名がBashで実行されていました。

成果物を`actions/upload-artifact@v4`へ移動し、source SHA・run attemptを名前に保持します。既存のテスト、パラメータ、失敗伝播は維持。元の7jobの承認SHA256は変更せず、この正確なtail修復だけを旧bytesへ逆写像して照合します。同じ元hashでも、壊れた旧tailをそのまま使うworkflowは拒否。テスト削除、未知upload先、identity変更、if/エラー緩和、余分なコマンド、fan-in除去の変異も拒否します。参照を通すためだけに期待hashを更新する処理はありません。

Node22.23.4: wall/integration/added-contract/projectile-introの47/47成功。最初の新しい変異試験はneedleの改行escape誤りで6pass/1failとなり、正しいファイル名needleに修正して再試験しました。この失敗ログも保持します。

修正後のworkflowからrun本文をそのまま抽出し、Bashの`-e -o pipefail`で実行した[生成物テスト](repaired-fidelity-step.tap)も201/201成功、exit0。サイトはsource005f2c52、content24be9651の通常minify生成物です。この参照/QA修正でruntimeを変更していません。生成物upload自体はremote CIでの確認が残ります。

同じrunのactive browserはrunner shutdown通知後にブラウザが閉じ、responsiveはcancelled。これらを成功には数えず、修正後のremote CIで確認します。並行PR #1861にもworkflow変更があるため、この修復はtailだけに限定し、その未受入runtime/CI最適化は取り込んでいません。
