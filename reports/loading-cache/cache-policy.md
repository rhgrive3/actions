# INKWAVE Loading / Cache policy

対象はこのbranchの起動・配信・キャッシュのみ。通常のゲームループ、gyro権限、復帰処理、戦闘物理は変更しない。

## URLと保存先

| 対象 | 方針 | 備考 |
|---|---|---|
| scope root / index.html | navigationはHTTP cacheを `no-cache` で再検証。4秒deadline後は保存済み完全snapshotへ | リクエストを発行することと、毎回本文全量を転送することは別。ETag再検証可 |
| root sw.js | ブラウザのSW update機構、登録時 `updateViaCache: 'none'` | 手動の定期pollingやreloadなし |
| `_versions/<current>/` のallowlist | Cache Storage hitはそのまま返す | fetch、digest、cache.putをhitごとに行わない。JSONの空destinationも含む |
| 同URLのmiss | 200/非opaque/非redirectをSHA-256とbyte数で検証し保存 | 同時missは一つにまとめる。quotaによる保存失敗でもonlineの検証済み応答は返す |
| retained旧revision | その旧URLのcacheのみ参照、無ければその旧URLをfetch | 新版の同名ファイルには置き換えない |
| 未知のfuture revision | network/HTTP cacheに委ねる | 旧workerが勝手に新しいsnapshotを作らない |
| mutable root asset / query / range / cross-origin / non-GET | このworkerのasset cache対象外 | URL増殖や部分応答の混入を避ける。HTML query navigationだけは既存仕様通り対応 |
| 設定・プロフィール | 既存localStorageの小さなJSONを維持 | バイナリをlocalStorageに追加していない |
| 手続き生成のcanvas・GPU texture | 既存メモリ/GPU管理のまま | IndexedDBへの永続化・GPU binary保存は導入していない |

HTTP応答headerは実ホストの設定に依存する。このbranchはGitHub Pagesのheaderを変更していない。benchmark serverの `max-age=600` は同条件比較用の明示的な設定であり、実Pagesのheaderを測った値ではない。

## Snapshot transaction

`empty → installing → verified core + verified index → complete marker → waiting → active`

installでindex本文をmanifestのdigestと照合し、非公開の候補cacheへ先に保存する。coreは二並列で取得する。HTMLを先に保存しても、最後のcomplete markerと全必須keyがなければoffline-readyではない。installが失敗すると候補だけを消す。途中の並列処理をsettleさせてから破棄し、削除後に残存処理がcandidateを作り直す経路を防ぐ。

既存activeが完全なら、各ファイルを新版manifestのdigestに照合してから新revisionのURLへ再利用する。同一ファイル名だけで流用しない。immutable URLの意味は維持する。これにより、tree全体のrevisionが変わっても同じ本文を毎回networkから取る必要はなくなる。ただし更新時のcache copyとdigest計算は残り、ゼロコストではない。

新candidateから `skipWaiting()` は呼ばない。既存clientが閉じるまで待つ。waiting通知はメニューに表示し、自動reloadやreload loopは導入しない。初回install完了後、または自然なactivation後にclaimする。メニューでupdate noticeが出る条件は、実際にwaiting workerが存在すること。

管理stateの読み取り失敗時は、候補installで旧cacheを削除しない。stateが失われたのに完全な旧snapshotが残る場合も削除を中止する。fetchを担当するactive workerが次のnavigation時に自身のstateを復旧できるため、その後のupdate retryで進める。repairをwaiting workerが独断で行う設計にはしていない。

## 容量と削除

アセット本文の上限は1revisionあたり12MiB、保持は最大2revision（activeとcandidateまたはprevious）。core precache自体は5MiB以下。現buildのcoreは152ファイル・約4.14MB。stateとcomplete marker、HTTP headerやブラウザDBの管理領域はこの本文上限とは別で、native使用量は `navigator.storage.estimate()` でも測る必要がある。

候補が何版もwaitingになっても古い候補を残し続けない。pruneの対象はscope付き `inkwave-startup-v2:<scope>:` の名前空間だけ。旧 `inkwave-shell-v1` の掃除は、新版がactivationした後にこのアプリのorigin/pathのentryだけを削除する。他アプリのcacheやentryは消さない。移行前のlegacy cache、HTTP cache、他アプリの保存量まで24MiBに制限したという意味ではない。

## Offlineの約束と限界

core全keyとindexとcomplete markerが揃うsnapshotがoffline fallback対象。初回install完了前に閉じた場合、保存容量不足、ブラウザによるeviction時は保証しない。完全なpreviousがあればそこへ戻り、どちらも無ければ日本語のoffline/retry文書を返す。リトライはユーザー操作のみ。

coreにCSSの `@import` 先HUD、patch profile JSON、font、lightmap JSON/PNGを含めた。lightmapのPNGはrevision内で不要な `?h=...` を除き、実リクエストとprecache keyを一致させる。JSONもimmutable版URLでは `force-cache` とし、従来の毎回再検証指定を外す。layout hashの整合性判定は残す。

未訪問のnews画像、stage選択カード画像、opaque dynamic importのモード等、全optional内容をofflineで保証するものではない。古いdeploymentから削除された未キャッシュの旧URLを、新版の同名ファイルで補完しない。online-only battleもoffline対応に変えていない。

## iOS / Safari

2026-10-04 JSTに確認したWebKit公開policyは、Safari 17以降のStorage APIとquota、Home Screen Web Appのbrowser相当のquota枠、best-effort保存とorigin単位evictionを説明している。quotaは保存保証ではない。Home Screenに追加しても無期限保持を前提にできない。HTTP cacheとCache APIは同じquota対象ではない。この実装では自動persist要求を追加せず、消失・quota失敗を処理する。

一次資料: [WebKit: Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/)（2023-08-10公開、上記日に内容確認）。SW lifecycle/updateの照合資料は [W3C Service Workers Editor’s Draft](https://w3c.github.io/ServiceWorker/)（2026-09-17版）。Editor’s Draftの存在を各ブラウザの実装保証とは扱わない。Safari/standaloneの実機回帰は未実施。
