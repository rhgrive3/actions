# 既存Issue以外の信頼性改善（2026-10-22）

基準: `rhgrive3/actions` main `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`。
Node.js 24.19.0、Python 3.12.14、esbuild 0.28.2。
開始時の未解決Issue 35件・進行中PR 11件を確認し、候補ごとにopen/closedの重複検索を行った。
各担当は独立worktreeで修正し、統合先は `improve/independent-audits-20261022`。
実装・テストは進行中PRの変更パスと重複しない。共有の挙動比較記録には今回の保存データ復旧だけを追記した。

## 修正と再現条件

| 対象 | 修正前の再現 | 修正後 |
| --- | --- | --- |
| バックアップ | `os.walk` の `dirnames` に入ったディレクトリへのリンクがmanifestから消える | リンク自体を保存し、リンク先は走査しない。復元検証と差分削除も同じ走査を使う |
| 差分復元 | 内容が `target` の通常ファイルと、リンク先が `target` のsymlinkはGit blob hashが同じ。種別変更に必要なpayloadを省略していた | hashとファイル種別の両方が一致する場合だけpayloadを再利用。権限だけの変更は従来どおりpayload不要 |
| 保存済み戦績 | `wins:'bad', matches:{}, totalTurf:'120'` が結果処理まで残り、数値がnullや文字列連結になる | bootとTurf/Boss結果保存の既存normalizerで、不正な既存カウンターだけを0に戻す。正常値・追加フィールド・XP専用呼出は保持 |
| 起動キャッシュ | 最初のService Worker登録が一時失敗すると、その画面を開いている間は再登録できない | 再接続・メニュー復帰で再試行可能。処理中と成功後の重複登録、対戦中の開始、自動リトライループを抑止 |
| 開発資料 | READMEと開発ガイドが「ルートにpackage.jsonはない」と説明 | 現在のルートpackage.jsonによるビルド・検証管理に修正 |

バックアップの形式は変更しない。ただし、過去に生成された種別変換payloadの欠けた差分は正しく復元できないため、検証エラーとして扱い、元のツリーから差分を再生成する必要がある。ライブのDrive・既存バックアップは操作していない。

## 検証

- バックアップ: 新規テストは修正前にディレクトリリンク4件・同一内容の種別変換2件の失敗を確認。最終全13件成功。内部・外部・循環・切れたリンク、full restore、差分の追加/変更/削除、両方向の種別変換、権限のみの変更を含む。
- 保存戦績: 新規3件すべて修正前に失敗。修正後は関連39件成功。実際の合成GameソースのbootとTurf/Boss集計・保存ブロックを実行し、勝敗、再保存、再読込、boot後の破損、正常値の保持を確認。
- 起動登録: 初期5件中3件が修正前に失敗。最終6件はソースと本番向け最適化生成物でそれぞれ全成功。保存修正と起動復旧を合わせた統合先の関連25件も成功。
- 起動キャッシュの関連群: 63成功・5skip。未変更baseでも全体コマンドの4件が `/mnt/workspace/` 固定のfixture入場条件で失敗する。変更側でも同じ失敗を確認し、guardを緩和していない。詳細: [登録修正の記録](loading-cache/registration-retry-20261022.md)。
- 本番向けビルド成功。`check-inkwave-startup-budget.mjs _site` 成功（初期JS 2,199,784 bytes、worker 78,227 bytes、499 precache entries）。生成された保存normalizerも不正値/正常値51ケースでソースと同じ結果。
- 基準版と統合版の標準 `npm test` が成功。統合版はNodeテスト89件・Pythonテスト13件が成功（skipなし）し、パッチ互換性・直接ソース監査・品質スクリプトも成功。

主な再実行コマンド:

```sh
npm test
python3 -m unittest discover -s tools/backup/tests -p 'test_*.py' -v
node --test patches/network-replication/tests/profile-stat-recovery.test.mjs patches/network-replication/tests/queue-bugs-recovery.test.mjs
node --test patches/loading-cache/tests/startup-registration.test.mjs patches/loading-cache/tests/recovery.test.mjs
npm run build
node scripts/check-inkwave-startup-budget.mjs _site
INKWAVE_BUILT_SITE=_site node --test patches/loading-cache/tests/startup-registration.test.mjs
```

保存修正とキャッシュ修正は別担当による読取りレビュー・関連テスト再実行も成功。
VM検証はブラウザAPIとbootstrap/presentationをスタブにしており、実ブラウザのインストール・オフライン準備完了・iPad性能を証明しない。
Splatoon 3 Ver.11.3.0の比較条件を継承するが、今回の対象は破損データの回復とブラウザ/開発環境の信頼性であり、本家の未公開数値や実機一致を追加認定しない。
