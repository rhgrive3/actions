# ヒッセン候補をmain7eへ合成するための保存候補

基点: 公式main `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51`。
新枝: `codex/tri-slosher-floor-main7e-20261023`。
元候補: PR1855 / `7b80097836e96baee170a6da8584750c9c0c1c56`。

**PR1855 refとmainは動かさない。Draft段階の候補で、本家の正確な一致とこの新候補のhosted CIは未確認。**

## 依存と変更範囲

main726→main7eの本体差分は `patches/local-quality/static-menu-adapter.mjs` とそのテストだけ。ヒッセンのruntime依存には直接の変更がない。元候補の `projectile-presentation.mjs` はblob `54f90896181bd28feefbd0bdff2c9347db03265f` をそのまま保持し、校正値・形状を再調整していない。

共通QAはc68 `c68c9d22908d46edd283ebfb5e73759d24b7e955` の**単独commit差分2ファイルだけ**をcherry-pickした。元commitのspecial側の祖先／22f3のtreeは取り込んでいない。c68のchecker本文と閉じた負例fixtureを保持し、PR1853 `def8b30deb621d3f73ace57c7a0dd67944272f66` の9-edge改変拒否assertionsを追加した。9-edge専用fixtureだけ全13組の実bytesをコピーし、c68の独立した閉じた負例fixtureを変更しない。

main7e比のproduction runtime差分は元のヒッセン1ファイルだけ。`area-special-vfx-clock.mjs` は追加しない。`special-motion.mjs` / `special-presentation.mjs` / `special-vfx.mjs`、`adapter.mjs`、`weapons-adapter.mjs`、`inkwave-source-composition.mjs` はmain7eと同一。別担当のfiring adapterを取り込まない。旧候補の履歴・元画像・失敗ログを保持し、元7bも祖先として残して将来のPR更新をforce不要にする。

[dependency-audit.json](dependency-audit.json) に全protected pathのblobと、c68本文・PR1853の9-edge assertionsの一致を記録した。

## 校正の意味と参照制限

`.2/.3` は同梱11.3.0由来catalogの床滴DrawRadius。
`.1/.15` は既存の **UNSOURCED** な `VISUAL_WIDTH_CALIBRATION.bucket=.5` を使った相対的な暫定校正で、本家から新たに実測した径ではない。前方向は既存paint用の親弾速度の水平成分。実際のdrop位置・落下・着地・塗りは変更しない。

取得済み資料に同条件の本家ヒッセンnative footage / encoded frameはない。今回のmain合成はその不足を解消しない。任天堂403や既存PNGのForbiddenを再取得・別経路で迂回していない。新たなNintendo mediaをrepoへ追加していない。

## source・生成物・物理検証

| 検証 | 結果 |
| --- | --- |
| c68閉じたfixture + PR1853追加9-edge + main7e静的メニュー | 18/18成功 |
| ヒッセン・既存Slosher・Bucket共有・birth速度/network・塗りgolden source | 37成功、emitted専用1件skip |
| 同じ本番minify生成物のfocused fixtureと塗りgolden | 35/35成功、skip0 |
| source/site 13参照の実root/versioned digest検査 | before/after両方 `emittedVerified:true` |
| 正規build / startup dependency予算 | before/after build成功、candidate予算成功 |
| 修正前新main buildで新回帰を実行 | サイズ・方向の2件が期待どおり失敗、物理対照1件成功 |
| source / emitted control / emitted candidate の物理receipt | 9条件すべて厳密一致 |

物理receiptはpitch -20/0/+20度 × elapsed30/60/120Hz。実 `FixedClock` の固定60Hz callbackへProjectiles / CPU Paintを通し、各Hzの全trajectory・damage・radius・seed・delay・inkMeta・着地・塗りスタンプ・CPU grid・ink・turfを比較する。各pitchの30/60/120Hz間も一致する。主弾最大9、床滴最大5、ink消費は100→94.3。これは制御VM計測で、実機／ブラウザ受入とは別。

[physical-comparison.json](physical-comparison.json)、[計測コード](gameplay-receipt.mjs.txt)、`gameplay-source/before/after.json` に実データを残す。

正規buildのcontentHash:

- 新main control: `ac27ae5f27169f2267a85d4bed904677d26f5e0aab10910c7181e4459f453f30`
- 新main candidate: `2042ffbbb14645c4f4a4db2188826b7988c4112dcebab1a14915fd2f72e77a07`

before/afterのcanonical input差分は `patch/runtime/projectile-presentation.mjs` のみ。旧7b build→新candidate buildでは `local-quality/static-menu-adapter.mjs` のみが変化する。QA・report・新native probeはcanonical gameplay/build inputではない。全入力hashを [build-proof.json](build-proof.json) に保存し、最終保存時にも一致を確認する。

## 新mainの小さいnativeブラウザ比較

通常のtrusted menu inputでmain→mode→練習場を通過した後、freeze下で既存 `startMatch` APIを同じ保存profileから呼び直し、入場直後の可変rAF更新が新actorへ混入するのを防いだ。そのfresh actorを通常のnative `_frame` でwarmup60 tick + fire後18 tick進め、1枚ずつ撮影した。これは通常のアプリ実装を使う**制御replay**で、無制御のlive gameplay連続動画とは区別する。

同じ既存Rookie（全style index0、帽子なし）、全ギア能力none、色覚サポートpalette `#ffd21a/#2a52ff`、ヒッセン、960×640、boot seed `0x18550001` / shot seed `0x18550018`。実際の色/style/gear、camera行列、87ボーン変換、主弾/drop traceが一致（camera / root / bone差0）。両画像を目視した。18Fで主弾9、床滴4、CPU paint133 cells、4描画行列の半径が半分・軸が前向きになることを再確認した。

- [新main before 18F](native-before/sim18.png)
- [新main after 18F](native-after/sim18.png)
- [native比較receipt](native-comparison.json)
- 再実行: `node scripts/check-inkwave-trislosher-native-matched.mjs <immutable-site> <new-output-dir>`

旧7bで条件を揃えて訂正済みの18Fペアも `previous-matched-before/after` に原bytesのまま保持した。さらに元の `reports/tri-slosher-floor-20261023/native-before/after` は色・装備が異なるため、同条件の見た目A/Bに数えない。そちらは通常起動・物理計測だけの歴史的資料として保持する。pixel径をメートルへ換算していない。

## 中間の失敗と範囲

- 最初のstandalone計測はcoarseなelapsed dtを直接Projectilesへ渡し、delayの丸め差で厳密一致が停止した。修正前buildにも同じ差があった。実FixedClockへ通した後、VM realmを跨ぐArray prototypeをJSON receiptへ正規化する修正も必要だった。両版の失敗コードとログを残し、production runtimeは変更しない。
- 新mainの最初のnative撮影は色・装備・camera・seedが同じでも、freeze前のlive rAF回数が違い、耳のポーズ最大約0.01774 quaternion成分・銃口位置約0.0000065 WUの差が残った。`intermediate/native-v1-*` と失敗比較ログへ保存し、最終A/Bには数えない。通常startMatchをfreeze下で再開始した上記v2が採用ペア。
- 最初の参照CLI呼出しは `--site` が欠け、source検査だけだった。成功したemitted検査には数えず、正しい `--site` を付けた両buildのreceiptを別保存した。
- 新候補のhosted browser / 全CIはまだ実行済みと主張しない。旧7bの長時間CI・checkout408 jobを再送していない。PNGの既存Forbiddenへ別経路アクセスしない。ローカルの保存済み画像だけを再利用した。
