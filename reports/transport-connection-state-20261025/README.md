# Transport 接続単位の状態持ち越し — 2026-10-25

基準 main: `7f863ea2d65671abd1453fdae1b61de00f1d10e2`。
専用ブランチ: `fix/transport-reconnect-state-20261025`。
通常生成物 contentHash: `a80d4962d3f446080d3c4d2e604bb9b99b479a377145e986862ef9640ee9db5e`。

## 調査と重複確認

GitHub connector で main、全 open PR #1867–#1876、および差分を確認。
指定 PR の確認時 head は以下で、終了前の再照合でも同じだった。

| PR | head |
|---|---|
| #1868 | `3b9c6433eb5060fed7c8e6ea9746c071aa8851b6` |
| #1869 | `b57ccf044c42ffb7016664ee45599942c19e74c4` |
| #1870 | `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da` |
| #1872 | `2cdee65931e0b5cc095f736dcb325e3d7493695a` |

どの open PR も今回の `net-adapter.mjs` の接続状態修正を含まない。
親の relay receipt/anchor 候補とは同じファイルを触る可能性があるが、
本変更は receipt/anchor、権限、時計証明、ワイヤー仕様に触れない。
統合時にはファイル全体の置換をせず、この小差分を適用する。
native loading、canopy audio、VFX、mobile resize、muzzle、terminal queue、
gpu-identity 修復、髪・身体モデル・材質・武器細部は変更していない。

まず生の transport.js と実際の合成コードを照合した。
生ソースに見えるキャンセル後の listener/timer 残留は、main の
`adaptNet` がすでに解消しているため重ねて実装しなかった。
既存の接続キャンセル、古い callback、heartbeat watchdog、非表示復帰、
START/GO/UNLOCK の失敗処理は既存回帰で確認した。
試合終了・復活の全経路を監査済みという主張ではない。

## 再現した2件

1. `?netlag=10&netjitter=1000` で接続Aに乱数0.9の受信を予約し、
   配送前に閉じる。接続B（新規 Transport と同じ Transport の両方）で
   乱数0の welcome を受けると、本来10msの予約が910msとなる。
   モジュール共通の `SIM.last` が破棄した TCP 接続の配送時刻を保持していた。
   同時接続間にも同じ干渉がある。配送順序の時刻を connect クロージャへ移し、
   同じ接続内の順序を保ったまま別接続を分離した。
   **これは開発用遅延シミュレーター有効時の問題で、通常URLの遅延改善ではない。**
2. 同じ Transport が800msの RTT を測った後、別の部屋へ connect しても
   `rtt=800` が残り、新しい20msの応答も旧測定値と平滑化される。
   connect で RTT を0へ戻し、新しい部屋の最初の応答を新しい標本とする。
   通常の NetSession は接続ごとに新しい Transport を作るため、
   この修正の対象は Transport を直接再利用する呼び出しである。

どちらも状態の所有範囲の修正。CPU/FPS、GPU、省電力の改善は計測・主張していない。
タイマー数の削減やゲームルール・表示削除による軽量化もしていない。
既存のキャンセルが全タイマーと socket handler を解放する契約を維持する。

## 検証

Node `v24.19.0`、既存 esbuild `0.28.2` を使用。
依存は `/workspace/actions/node_modules` へのローカルリンクで再利用した。
リンクや生成サイトはコミットしない。

| 検査 | 実行結果 | 証跡 |
|---|---|---|
| 修正前・全本番アダプター合成 Transport | 4件失敗（意図した負例） | [before.log](before.log) |
| 新規4件＋net/session-wire/next-seven-room | 52件成功、skip 0 | [focused.log](focused.log) |
| queue-network / queue-network-ui | 43件成功、skip 0 | [queue.log](queue.log) |
| 通常最適化ビルドの Transport に同じ新規試験 | 4件成功、skip 0 | [emitted.log](emitted.log) |
| direct-source | 20件成功、skip 0 | [direct-source.log](direct-source.log) |
| quick patches / 通常ビルド / startup budget | 成功 | [build.log](build.log), [budget.json](budget.json) |
| 実 Chromium 154.0.8037.57 + ローカル WebSocket | 4接続、error 0 | [browser.json](browser.json) |

新規試験は関数抜き出しではなく全合成 Transport モジュールと実際の
admission/receipt/UTF8 依存を VM で実行する。Socket、時計、乱数、タイマーは
決定的な fixture。生成物モードでは minify 済みモジュールを変更せず読む。
古い配送 callback の呼び出し、同時接続、接続内の配送順、切断後タイマー0を確認。
ブラウザ試験は実 HTTP/ES module/WebSocket とブラウザのタイマーを使い、
乱数だけ固定して予約遅延を観測する。旧RTT約122ms→connect直後0、
新接続の初回RTT約0.4ms、遅延予約910ms→10ms、close後heartbeatなしを確認。

再実行（リポジトリ root、esbuild/Playwright/ws/Chromium が必要）:

```sh
node --experimental-vm-modules --test patches/reliability/tests/transport-connection-state.test.mjs patches/reliability/tests/net.test.mjs patches/reliability/tests/session-wire-admission.test.mjs patches/reliability/tests/next-seven-room.test.mjs
node --experimental-vm-modules --experimental-global-webcrypto --test patches/reliability/tests/queue-network.test.mjs patches/reliability/tests/queue-network-ui.test.mjs
npm run check:patches
npm run test:direct-source
node scripts/build-inkwave.mjs inkwave-public .ci-scratch/reconnect/site
INKWAVE_TRANSPORT_SITE=.ci-scratch/reconnect/site node --experimental-vm-modules --test patches/reliability/tests/transport-connection-state.test.mjs
node scripts/check-inkwave-startup-budget.mjs .ci-scratch/reconnect/site
node scripts/check-inkwave-transport-connection-state.mjs .ci-scratch/reconnect/site .ci-scratch/reconnect/browser.json
```

## 未確認・統合条件

- 実ゲーム全体、実デプロイ relay、2台対戦、Safari/iPad、実GPU、全テストの受入は未実施。
- ブラウザは Transport 単独のローカル relay fixture。ゲーム全体や Cloudflare Worker の受入ではない。
- Splatoon 3 Ver.11.3.0 の内部 RTT 平滑化・ブラウザ通信シミュレーター相当仕様は不明。
  本家一致や移動・射撃・復活フレームの検証をしたとは扱わない。
- 新しい大量 CI、PR 作成、main 統合、デプロイは行わない。公開 commit は `[skip ci]` 付き。
- 親の別候補を取り込んだ統合後の再検証は親に残る。gpu-identity 修復は別担当のまま。
- 本タスクを止める権限拒否・未解決の環境 blocker はなし。
