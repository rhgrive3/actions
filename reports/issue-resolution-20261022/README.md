# actions未解決issueの並列修正・受入記録（2026-10-22）

基点: `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`。開始時と再検索時の未解決issue35件を6担当で確認した。全35件の結果は [index.json](index.json)。#1430は最終sourceの同一buildでChromium/WebKit各3反復・234check成功により受入完了。初回の残る34件は各残条件を満たすまでOpenを維持した。その後の継続受入で #1165 と #1432 の残条件が満了した。同一公開sourceのRanked全suite/3独立bootで #1608、元buildのHTTP/SW native traceで #1711 も調査・受入が満了した。追加の証拠と継続中の作業は [continuation](continuation/README.md) を参照。未確認の実機値や本家データを補って解決済みとはしない。

## 実装した修正

- #1767: 実Matchへのbind前にowner時計を確定させる経路を遮断。原本で2件失敗を再現し、修正後は関連12件成功。bind済みキューのcatch-upとtrusted clock設計は残る。
- #845: ネイティブ地形のchart/物体boundsを足元の三角形支持と誤認する経路を遮断。三角形の穴と動的支持の反例を加え、元のsource raycastへfallbackする。legacy最適化を維持。
- #1671: opt-inの30秒・4000frame・4MiB上限capture/exportを追加。物理iPad計測を実行できる具体的な記録手段であり、FPS改善そのものとは数えない。
- #1812: 7武器330照準条件・実OBB22条件・旧経路の対照2条件を追加。既存runtimeは全通過。
- #1432: リマッチ検証へ明示的なChromium/WebKit選択を追加。既定値・厳格なring/round判定・待機上限は維持。

## 検証

変更箇所の5suiteは54/54成功、skip/cancelなし。独立レビューで阻害指摘なし。比較用の実WebGLは120条件・20,280セル、AA境界694セルを除く19,586セルでCPU/GPU不一致0。最終production buildは公開source commit `f9d744eba5cbd86ef9a4a77e9a4dbd61c48d4d90` と全1362宣言input＋build script・2016artifactを照合済み（[final-build.json](final-build.json)）。最終buildの入力受入はChromium/WebKit各3反復・234check成功（[final-reliability.json](final-reliability.json)）。full rematchは別の固定dd84 buildでWebKit3round＋Range成功、Chromiumは外側300秒制限で2round後に未完となり、最終candidate全体のfull rematch成功とは数えない。詳細は [verification.json](verification.json) と各担当のreceipt。未完・OOM・timeoutの試行も担当報告に分離して保存した。

## 35件の担当別結果

| 分野 | issue | 根拠と残条件 |
|---|---|---|
| weapons | #1814, #1812, #1813, #1431, #1789, #1823 | [weapons.md](weapons.md) |
| performance | #1757, #1671, #642, #845, #1434 | [performance.md](performance.md) |
| network-security | #1767, #1665, #1666 | [network-security.md](network-security.md) |
| controls-physics | #79, #287, #890, #735, #1607, #532, #992, #956, #725, #226 | [controls-physics.md](controls-physics.md) |
| ci-startup | #1432, #1430, #1608, #1711 | [ci-startup.md](ci-startup.md) |
| motion-paint | #1708, #1565, #952, #997, #1165, #1116, #1097 | [motion-paint.md](motion-paint.md) |

残る受入は主に、物理iPad/Safariの同条件計測、11.3.0本家の音源・骨格/曲線・物理trace、trusted hostの攻撃/命中再構成、同一公開deploymentの独立起動反復である。各issueの現在の実装と必要資料をJSONに列挙し、既存修正の重複PRは作らない。

担当別JSONのremote未変更・open維持の記載は担当調査時点の値。最終的なGitHub状態とPR公開結果は本indexの最終記録を参照する。

ブラウザJSON・console logの原本は [browser-raw-receipts.tar.gz](browser-raw-receipts.tar.gz) に無変更でまとめ、[SHA256一覧](browser-raw-receipts.json)を付けた。このreportディレクトリで `tar -xzf browser-raw-receipts.tar.gz` とすると記録中の相対pathを復元できる。PNGはローカル `.browser-evidence/issue-resolution-20261022` に保持し、別のSHA256一覧へ記録した。
