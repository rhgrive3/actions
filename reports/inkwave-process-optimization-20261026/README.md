# INKWAVE 処理別最適化・独立レビュー

調査基準: `48511150bbaeab182dd04c712d39bd5b26df18f3`。統合基準は最新main `d88aa68`（PR #1892／#1893反映済み）。公開版 `inkwave-public/` と、実際の配信コードを作る合成アダプター／runtime が対象。

修正担当は **gpt-6.1-sol / xhigh 3体**、独立レビュー担当は **gpt-6.1-sol / high 3体**。担当範囲を分けて調査・修正し、レビュー3体全員がシミュレーション・描画・サービスの同じ最終差分を再確認した。確認した処理には、未解決のブロッカーや根拠のある追加の低リスク最適化案を残していない。全プログラムの数学的な最適性や、未読の全レシピ／端末条件まで証明したという意味ではない。

## 処理ごとの変更

| 処理 | 変更と保持した条件 |
|---|---|
| ボス経路探索 | ヒープとNumber精度のヒューリスティックを再利用。探索順・経路・Float32コスト・同点処理を維持。固定ケースのhypot呼出しは61,545→10,247。 |
| ボスの行動選択・ハザード | 重複距離計算と終了時刻だけ読むための一時オブジェクトを除去。乱数・重み順・時計端点を維持。 |
| 原典ステージの球スイープ | 呼出し側所有の出力を追加し、毎ヒットの結果オブジェクトとVector3×2の割当を除去。出力省略時の独立所有、source/movingの分離、同点・UV・missを維持。 |
| 波テクスチャ | 画素ごとの不変乗算と行座標計算を外へ移動。worker／同期フォールバックのバイト列を維持。 |
| Prop Builder | 部品ごとに捨てていた合成用Matrix4をBuilder内で再利用。保持すべき部品・アニメーション行列は独立のまま。 |
| ロビーの属性書込み | 頂点ごとの一時配列をスカラー書込みへ変更。ジオメトリのバイト列・UV・コールバック順を維持。 |
| ロッカー描画 | Vector2／Colorを再利用。ネスト呼出しには別の一時状態を用意し、描画先・色・失敗時の復元を維持。 |
| マップピン・練習場HUD | 同じDOM書込みとピン配列再作成を除去。最新ターゲット・hover・期限・CSSOM正規化・外部変更後の復旧を維持。 |
| Dualies通信 | 同一パケット内の純粋な状態読出しだけを共有。パケット内容、20Hz、別のgear/cost/life走査順を維持。 |
| Service Worker install | 同じスナップショットを2workerで処理する順序を保ち、shiftをカーソルへ変更。失敗時の中断・rollbackを維持。 |
| ビルド | 破棄するThree core 1,458,113 bytesの余分な読込／合成を省略。文字列圧縮の編集適用を1回の連結に変更し、117モジュールで結果オブジェクトの完全一致を確認。 |
| 原典材質の品質切替 | balanced→highで後から判明するテクスチャchannelをshaderとprogram keyへ反映。直接highで読み込んだ結果と一致させる。 |
| KTX2の寿命 | abortで利用者のPromiseが終わっても、実worker callbackが完了するまで旧loaderを保持。renderer切替時の早すぎる破棄を修正。 |

調査中に見つけたアカウントの重複openは[PR #1893](https://github.com/rhgrive3/actions/pull/1893)の同一entry.jsを一時的に再利用して検証した。その後mainへ同じ修正と3件のテストが入ったため、最終PRにはアカウント変更も重複テストも含めない。現在の再現先は `account/tests/client-lifecycle.test.mjs` のrapid open／close during import／stale ownerの3件。main由来のAPI・DB・入力・描画・profiler修正をすべて保持している。

## 処理棚卸しと3体の最終レビュー

| 範囲 | 修正担当の処理別記録 | reviewer 1 | reviewer 2 | reviewer 3 |
|---|---|---|---|---|
| シミュレーション／入力／ボス | [simulation-audit.md](simulation-audit.md) | 指摘なし | 指摘なし | 指摘なし |
| ワールド／描画／FX／キャラクター | [rendering-audit.md](rendering-audit.md) | 指摘なし | 指摘なし | 指摘なし |
| UI／音声／通信／アカウント／ビルド | [services-audit.md](services-audit.md) | 指摘なし | 指摘なし | 指摘なし |

独立記録: [reviewer 1](reviewer-one-audit.md)、[reviewer 2](reviewer-two-audit.md)、[reviewer 3](reviewer-three-audit.md)。変更しなかった処理も、既存最適化・無効化条件・変更を見送った理由を記載している。[描画の関数一覧](rendering-functions.json)、[サービスの関数一覧](services-functions.txt)、[reviewer 2の初回ファイルハッシュ](reviewer-two-final-files.sha256)と[追従後の33ファイルハッシュ](reviewer-two-integration-files.sha256)も保存した。

## 検証とコスト

局所検証は**93成功・失敗0・既存skip 1**。内訳はサービス43、描画26、ボス4、原典スイープ7、既存カタログ呼出し6、テスト登録7。カタログの1件は既存Bluefinアセットfixtureが無いためskipであり、成功に含めない。quick互換性・数値参照チェックも成功（参照11.3.0）。実行コマンドは担当記録、保存したログは[logs/](logs/)にある。

最初の原典テストでは異なるVM realmの配列prototype比較が1件失敗し、数値比較を維持してArray.fromで正規化した。その失敗ケースだけ再実行し成功。サービスでも2件のテストfixture前提を修正した。失敗ログと修正後ログを保存し、同じ全体テストの繰返しは行っていない。後続の統合ビルド・ブラウザ・最終commitのCI結果はPR本文／checksに記録する。

最新main追従ではService Workerのテスト末尾だけが競合した。mainのstream検証3件と今回のカーソル検証を両方残し、影響する4件だけを再実行して成功した（上記93件に重複加算しない）。3体のレビュー担当が追従後の所有者・呼出し側・競合解消も再確認した。監査記録には初回差分の履歴と追従後の記録を併記している。

ボスのヒューリスティックはgrid 1セルあたり8 bytesとヒープの数値配列最大容量を保持する。例の40×40 gridでは12,800 bytes。原典スイープの結果はlevelごとのWeakMap、ロッカーの定常scratchはbackdropごとに保持する。KTX2の旧loaderは実callbackが残る間だけ保持する。割当を減らすために必要な限定的な保持コストを隠さず記録する。

文字列圧縮の12,000 literal合成ケースでは同じ222,116文字を生成し、1回の観測で4,595ms→100msだった。これはビルド内の合成ケースであり、ゲームFPS・実端末・ビルド全体の速度向上率ではない。画質、物理式、ゲーム速度、乱数、ネットワーク権限、音声品質を下げる変更はない。本家実機／iPad／Safariの新たな一致・性能測定は行っていない。

## CIで見つかった検証・セットアップの修正

初回head `70cc3b1` では24 workflowが成功した。残るランク戦検証の失敗、CPU検証のセットアップ中断、全体統合の古いfixtureを修正し、同じ3体が最終差分を再確認した。ゲーム本体の最適化コードはこの追補で変更していない。

- [ランク戦の失敗](https://github.com/rhgrive3/actions/actions/runs/40362215329/job/121710371513): ホストが後でチャージ1へ到達しても、以前の入力lease切れによる部分チャージ発射が先頭イベントに残り、旧検証がそれを読むことがある。変更していない実ルールでログと同じ `0.733333333333334` を再現した。元CIには入力受信の時系列記録が無いため、実際のパケット停止を直接観測したとは扱わない。[根拠](ranked-lease-reproduction.md)と[修正監査](ranked-charge-fix-audit.md)を参照。
- 検証用helperは両方のシミュレーション時計を止め、通常のゲスト入力→20Hz送信→ホストの実受理seq/fire/owner/life/match→同数の固定フレームという順序を守る。ホストが権威を持つ。入力lease・ルール・チャージ値・イベント履歴は変更せず、途中発射は失敗にする。チャージ1／直撃60／爆風180／1発のみ／相手への反映／壁・試合終了の条件を維持する。通常CIの既定4モードも維持する。
- 追加したnative回帰は **7/7成功**。実Input・Player・Actor・clock・NetMatch・Transport・受理判定・ルールと、古いseq／不正fire／寿命切れ／所有者変更／途中失敗の後始末を確認した。
- **実Chromium 154、200msのローカルrelay遅延、オンライン・ガチホコだけの確認が成功**。本体は既存の同じ `_site` を使い、再ビルドしていない。1発の `1/60/180`、双方のイベント、壁への2命中、双方のfinish、エラー0を確認した。[要約](ranked-charge-browser-summary.json)、[21 batchの受理記録](ranked-charge-receipts.json)、[実行ログ](logs/ranked-charge-browser-final.log)を保存する。
- [CPU検証の中断](https://github.com/rhgrive3/actions/actions/runs/40362215063/job/121710368745): ソース・生成物の回帰を通過後、Azure Ubuntu mirrorから25.9MBを取得する処理が長時間かかり20分制限に到達。既存の `prepare-inkwave-ci-apt.py` をPlaywright install直前に使い、署名付きUbuntu archiveをHTTPSで取得する。制限時間、依存関係、source SHA、30フレームの実CPU traceと全ゲートを保つ。契約テスト **10/10成功**。
- [統合CIのfixture失敗](https://github.com/rhgrive3/actions/actions/runs/40362214873/job/121731511320): main由来のRenderer.resizeを実行するfixtureにmobile／quality／DPR等の依存が無かった。fixtureだけを補い、実メソッドの抽出・crop adapter・全ての既存アサーションを保持した。**17/17成功**。後続artifactの欠落はこの先行失敗により実行されなかった工程に起因するため、artifact条件は緩めない。

追補の局所検証は7・10・17件をそれぞれ成功として記録し、再実行分を重複加算しない。最終headのCIは、この追補を含むcommitに対して改めて確認する。
