# 最新mainの静止メニュー背景を統合した際の確認

対象mainは`97b0c7f9e97f2c62fa132919b91cdfd2ebf82009`（PR #1586）。`b1c550c5`との差分9ファイルはメニュー背景、メニュー中のframe分岐、合成順序、build identityと試験・報告。ブキ、衝突物理、採点塗り、通信プロトコルの実装は変更されていない。静止メニューではattract matchの更新を止める一方、入力・メニュー・ネットワークsessionは更新する。実試合、オンラインroom、pause、resultsはその分岐の対象外。

新規CSS試験は、合成stylesheet全体から`data-screen="lobby"`が消えることを要求していたため、既存のroom用cursor/toast規則に対して失敗した。これは新背景がオンラインroomへ適用された証拠ではない。生成背景のownership marker以降だけで除外画面を検査し、marker以前の既存room規則は全文保持を要求するよう修正した。新たなstatic lobby背景を追加する負対照と、既存room規則を削除する負対照の両方を検出する。

静止メニュー試験は修正前5成功・1失敗、修正後7成功・0失敗。これは合成JavaScript/CSSと入力・session分岐の試験であり、実ブラウザ描画や端末性能の証明ではない。新しい画像と生成物hashを含むbuild・responsive・実試合の確認は統合後の受領へ別途記録する。

PR #1586報告の「不可視3D showroomを構築しない」は**画面への入場経路**に限る。合成後も`_menuApi().setLoadout`の武器選択callbackは`showcase.showLoadout(...)`を呼ぶ。実callbackの実行で、選択ブキのprofile保存とshowcase呼び出し1回を確認した。そこから`_showPedestal`が必要に応じてstage/Characterを生成するため、武器選択後もallocationが常にゼロという認定はしない。この既存callbackの変更は今回行っていない。静止画の背後で連続するworld/showcase frameを停止する効果と、選択時のallocationを区別する。
