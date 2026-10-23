# 追加の独立した信頼性改善（2026-10-22）

基準main: `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`。
前回のPR #1832とは別の4件を独立worktreeで調査・修正した。
開始時と公開前の未解決Issue34件、進行中PR17件を確認し、候補ごとにopen/closed重複検索を行った。
既存Issue #990が明示的に含む非所有パッド入力の候補は除外し、練習場も関連14件とリセット経路を確認したが、具体的な新規不具合を再現できず変更しなかった。

## 修正と再現

| 対象 | 修正前 | 修正後・保持した条件 |
| --- | --- | --- |
| 表示名と翻訳 | `constructor`、`toString`、`__proto__` 等が翻訳辞書の継承プロパティに一致し、関数/オブジェクト表示や例外になる | 辞書自身のキーだけを翻訳として採用。通常の翻訳・タッチ向け文言・テキストとしてのHTML表記は保持。ロック済み入力は変更しない |
| コントローラー振動 | 古いコントローラーの強い振動を優先する状態が新機器へ持ち越され、最初の弱い振動が抑制される | 既存の機器ライフサイクル切替時に優先状態を初期化。同一機器の強弱優先・振動の時間/振幅・入力所有権・Joy-Con割当は保持 |
| ロッカー背景 | 背景の設定・clear・renderの例外後にclearColor/alpha/autoClearが漏れる | 失敗時に元の状態とtarget/cube face/mipを復旧し、元例外（null/0も含む）を保持。成功時のcanvas描画とshowcase合成は維持 |
| キャッシュの本文転送 | fetchはヘッダー到着で完了するため、本文が止まると検証読込に既存の30秒期限が効かない | 各取得試行の本文検証までAbortControllerの期限を維持。正確なrevision URL・既存の一度のreload再試行・全整合性検査・通常のcache-hit経路は維持 |

期限は各試行30秒であり、再試行を含む全処理の30秒上限ではない。タイマーは同期計算や暗号処理を中断するものでもない。

## 検証結果

Node24.19.0、Python3.12.14、esbuild0.28.2、Chromium154.0.8037.57。
実装4コミットを統合した `2527c5f` から本番向けビルドを作成した。最終文書/検証ツール追加後も再ビルドで同じ内容を確認する。

- 修正前: 翻訳の6条件、振動の3条件、ロッカーの3条件、本文転送の3条件で失敗を確認。
- 新規回帰は統合先で28/28成功。実際の合成Input、翻訳/DOMヘルパー、ロッカーruntime、Service Workerを使用する。描画/振動API等のスタブ部分は実機確認と区別する。
- 最適化生成物でも振動4/4・ロッカー6/6成功。
- 標準 `npm test` 成功: Node89件・Python4件、skipなし。パッチ互換性・直接ソース監査・品質スクリプトも成功。
- 担当の関連検証: 翻訳20/20、ロッカー21/21、振動/Joy-Con/handoff21/21。独立レビューでも同一機器の抑制、Joy-Con構成切替、元例外と成功描画の保持を確認。
- キャッシュ関連群63成功・5skip。skipは既存の歴史的baseline siteを要求する条件で、この修正を検証済みに数えていない。本文停止は実際のNode fetchと、ヘッダーだけを送るローカルHTTPサーバーでも再現・復旧を確認。
- 最初の384MiB制限では既存handoff試験がOOMとなった。実装担当はそのファイルを1536MiBで単独再実行し12/12成功。独立レビューの広いhandoff2ファイルも384MiBでOOMであり、その試行を成功扱いにはしていない。新規28件と統合npm検証には1536MiBを使用した。
- 起動予算検査成功: 初期JS2,199,865 bytes、worker78,263 bytes、precache499 entries。ビルドcontentHash: `72528b9858ed831cde7a8e33bb384c2c8e1995b9e280e1e82d3a3891ec81e387`。

## Chromiumの実DOM比較

[検査スクリプト](../../scripts/check-inkwave-ui-literals-browser.mjs)で実際の最適化済みi18n/UIモジュールを読み、ネイティブDOMに表示した。日本語/英語×キーボード/パッド/タッチの6条件それぞれで、Object.prototypeの12キーとHTML表記の計13文字列を確認。修正前は各条件12キーの表示が壊れ、修正後は全78入力で正確な文字列を保持した。通常の翻訳を維持し、HTML表記も実行しない。

旧版は前回のPR #1832 (`7b6ed10`) のビルドで、今回のi18n・UIヘルパー・翻訳アダプターの入力はmain26a4と同一。比較の[生結果](native-ui.json)を保存した。これは実DOMの限定検証であり、ゲーム全体の描画、物理GPU、実機の振動、Safari/iPad性能やSwitch実機比較を証明しない。

```sh
NODE_OPTIONS=--max-old-space-size=1536 npm test
node --max-old-space-size=1536 --experimental-vm-modules --test --test-concurrency=1 patches/splatoon3/tests/ui-localization-own-keys.test.mjs patches/loading-cache/tests/worker-body-deadline.test.mjs patches/local-quality/tests/locker-stage-state.test.mjs patches/reliability/tests/rumble-device-handoff.test.mjs
npm run build
node scripts/check-inkwave-startup-budget.mjs _site
INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test patches/local-quality/tests/locker-stage-state.test.mjs
INKWAVE_CONTROLS_SITE=_site node --experimental-vm-modules --test patches/reliability/tests/rumble-device-handoff.test.mjs
CHROMIUM_PATH=/usr/bin/chromium node scripts/check-inkwave-ui-literals-browser.mjs _site /path/to/baseline-site
```

Splatoon 3 Ver.11.3.0の比較条件を継承し、未公開の振動値やゲーム数値を新たに推定していない。既存Issueの完了・本家実機との一致・CI全成功・物理端末の性能改善は認定していない。
