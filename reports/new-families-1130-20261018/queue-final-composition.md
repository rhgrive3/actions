# main #1592のqueue guard統合

基準main `77402adf14da75cc11c34e5e299163f4a5fafb9e` は #1592 と #1595 を含む。
production buildが `persisted profile admission` のanchor不足で停止した。
4系統の先行改修やワイパー波の最短終端修正を戻さず、final queue passの合成を修正した。

## 原因と所有者

final passの前に、既存network／aim-profile／quality overlayがraw sourceを変えていた。
プロフィールだけを新anchorへ変える修正では、次のloadout・settings・XP等でも停止する。
既存Sessionへ新passを適用したsourceでは `validStartRoster` の同名importも重複した。
raw sourceを別経路で通すことや、見つからないanchorをskipすることはしていない。

| 目的 | 最終的に保持・接続した実処理 |
|---|---|
| 保存profileと武器 | 既存 `normalizeQueueProfile`、`safeWeaponId`、own-key `validWeaponId`、起動時の保存 |
| STARTとHUD | 武器・mode・host所有botも検証する既存roster ownerと、local/weapon/Runner不足guard |
| XP | 両resultの既存 `settleProgression`、元の加算・score式・Private Battle永続化禁止。新しい任意のlevel上限で正当saveを縮めない |
| 設定 | 有限値／quality own-keyの補完後、既存aim移行・profile選択・gyro permission epoch・保存へ接続 |
| 相手塗り | 既存 `readPaintOrder`／kit receiptがFloat32・source kind・membership・team・epoch・sequence・capabilityを判定 |
| 例外復旧 | 描画塗りの例外を隔離し、`applying`を呼出し前の値へfinallyで戻す。成功前にapplied sequenceを進めない |
| その他の#1592目的 | 現入力yawのcamera owner、operation所有のattract reset、Crab Tank aim修正を保持 |

既存ownerの所定箇所・個数をbuild時に検査する。9種のownerを個別に削除する負対照は
全件で失敗する。重複したruntime guardや別のXP計算器を追加していない。

## 通信塗りと感度の実退行

旧final passの8種kind listは、既存ownerが認める `source-shot`、`source-splash`、
`rollFloor`、`ink-*`を拒否した。実際のcanonical packetでも旧`shot`だけを通し、
source系を落とすことを独立再現した。追加listを削除し、より厳密な既存ownerを唯一の
admissionとして維持した。半径や所有権の制限を緩めたわけではない。

旧 `sanitizeSettings` のpad `.2..3` はS3の `-5/0/+5` を `.2/.2/3` へ変えた。
保存済み `padSensitivityScale==='s3'` とliveは `-5..+5`、旧saveは既存legacy倍率の
移行を通す。gyroとtouchの `-5/0/+5`、mouse `.2/1/3` は従来の範囲を保持した。
新clampによるgyro範囲の退行があったとは主張しない。
live補完はpartialのkey集合を保ち、modeだけの切替へ元profileのflat値を混ぜない。
無効値は有限のfallbackへ修復し、TV/Handheldの保存・reload・reset、正当な0／falseを検査した。

また、実行される `queue-nine-final-adapter.mjs` が `reliabilityIdentity()` の列挙外だった。
明示登録し実ファイルSHAとのunit比較を加えた。配信revisionは既に生成物由来なので
cache破損ではなく、source input identityの追跡不足である。登録前後のruntime生成物の
実バイト同一と、変わるinput／manifestは外部受領記録で区別する。

## 検証

- 旧main production build失敗を再現。旧Session合成の重複bindingも実parseで再現。
- `tests/issue-queue/critical-queue.test.mjs` **14/14**。raw stubだけでなく、完全
  `adaptBuildSource`の構文・実Actor aim・実paint admission・owner消失・実SHAを確認。
- 既存queue復旧／room／match lifecycle／XP／HUD／settings等 **206/206**。
  この中の既存settings testは実helperを注入し、従来assertを保持した。
- sourceのpaint／score／codec／感度関連 **55/55**、production paint／codec **34/34**。
- 独立source/built probeは自動kindを含む22種×4wire形式、実送信codec、10不正値、
  deadline、実kitの18列capability、source輪郭のCPUgridを確認。所有権・順序・重複を維持。
- minified production build成功。runtime修正 `f9aa1290`、identity補完 `7f02db8a`。
  新生成物のcontentは `bf135842ec0c7b470cea9e21606eb3f163397b63c6b33aa988943a306ff4b79c`。

外部記録は `/workspace/queue-final-composition-verification.json`、独立通信記録は
`/workspace/queue-paint-independent-final.json` と対応built receipt。
最終mainの705条件・mask・通信・長時間stress・CIは親作業で新生成物を受領する。
以前の `b93bfef0` 等を新contentの実行結果へ読み替えない。本家の未確認仕様や
Issue #532／#992の残項目を解消したという報告でもない。
