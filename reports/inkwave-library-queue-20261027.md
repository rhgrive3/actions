# INKWAVE — Library追加キューのローカル対応・検証記録

作業日: 2026-10-27 / 作業ブランチ: `local/library-queue-20261027`

## 結果と現在の到達点

指定Driveフォルダ `INKWAVE-main-b1f571da-20261016-edit` の最新manifestが指す `da5058b723a02374639056cca7ed840006ee5361` を基準に、ローカルで実装・レビュー・検証した。3名のサブエージェントをAstra/highで使用し、通信・武器、描画・UI、音声・ロード・CIを並行処理した。PR確認は読み取りのみで、push・PR作成・マージ・公開・Drive書換え・スケジュール変更は行っていない。

**追加キュー312件すべてに個別判断を付け、204件をローカル実装した。ただし、312件すべてを実装したという意味ではない。** 実機検証や新しいアセット/ライフサイクル設計が必要な29件は未実装のまま明示しているため、「全改善完了」「商用出荷可能」とは認定しない。

| 判断 | 件数 | 意味 |
|---|---:|---|
| ローカル実装 | 204 | 今回のソース変更に対応。検証範囲は各記録/検証票を参照 |
| 現行mainで対応済み | 43 | 新規実装の件数に含めない |
| 採用しない | 35 | 実在する所有権・境界値・性能上の不利益を確認。理由を個別保存 |
| 追加検証・設計・アセットが必要 | 29 | 未実装。条件が満たされたとは扱わない |
| 既存PRの対象・追加根拠が必要 | 1 | Fizzy flight paintの既存対象。今回新規実装に数えない |
| **追加キュー合計** | **312** | 未分類0件、担当競合0件 |

別にREADME/RECOVERYの2ファイルを文脈資料として記録。直下1,004ファイルは、旧PR対象690件と今回の314レコードに分けた。旧690件にも95件の不採用、2件の追加根拠、2件の部分対応、2件のユーザー除外が含まれ、690件すべてを実装済みと再分類していない。Archiveの既存履歴も新規実装に算入していない。

最終PR先頭も再取得し、#1889 `7d38cd95`、#1890 `1e5ef7d7`、#1895 `65ad3508` の更新に今回の追加実装との新たな重複がないことを確認した。mainと#1882の先頭は作業開始時から不変で、件数に変更はない。

全件台帳は `inkwave-library-queue-20261027.json`。元Library ID、slug、最終担当、判断、根拠、担当間移管を保持する。各分野の詳細は同じreports内のroot/network/visual/audio-build-native台帳にある。

## 実装した主要な問題修正

### 通信・確定処理

受信側のnative tickが受理したactor/eventだけを、ranked pose・Rainmaker barrier・wipeoutなどの追加情報へ渡す。追加データだけが先に採用される経路を抑え、既存の受理主体を維持した。

Tower Mineは、state送信が失敗したのにそのrevisionを塗りの根拠へ進める状態を修正した。元のstateを順序どおり保持し、送信成功を確認してから後続tick/stateと確定処理を通す。ローカル設置の即時反応は保持し、タイムアウト・ホスト交代・disposeで未送信stateを権威へ昇格させない。

relayのpong失敗時の退役、拒否するupgradeの先行予算消費、新しいsocketへの再接続を繰り返すことでper-socket制限を回避する増幅を修正した。room集計上限は既存の8人分を根拠とし、通常8接続を単純に絞らず、休止復帰とホスト交代でも予算を引き継ぐ。

### 音声・起動・Nativeロード

未開始の投機的MP3読込は、共有する実需要や開始済み需要を残して不要なものを取消す。失敗したループ再生の再試行前にhandleを確保しない。非表示Boss画面のタイマーと再開、BGMの再生拒否後のtrusted gesture再開、退役済み音声の寿命を整理した。

Native prebuilt配列は検証済みchunkを最終配列へ流し込み、並列数を制限した。face unpackを協調実行し、元face recordはcommit完了後だけ解放する。KTX pack失敗は同一load内で保持し、idle workerを解放し、transcoder初期化は失敗後も規定の時間を置いて再試行できる。既存のdecode・hash・取消・world所有権を迂回していない。

フォント読込が完了しない場合でもmural作成は750msで先へ進む。遅れてフォントが成功した場合は生存中の所有者だけを再描画し、dispose後や遅延描画例外による未処理Promise拒否を防ぐ。

### 描画・武器・UI

過密時のショット軌跡48件と既存ドロップ衝突予算を巡回させ、配列の先頭だけに表示機会が偏る問題を修正した。ドロップの入替削除と前回確認位置からのsweepを保持。ビーム飽和時の0番固定上書き、容量が7の倍数のドロッププールで一部スロットだけを上書きする問題、表示可能になる前にseenへ入れてしまうビームも修正した。

インスタンス色・ring/shell静的属性・Ribbon成分は、変化した範囲だけを更新する。画面外でまだGPUへ消費されていない更新範囲を次回まで保持する。Ribbonのカリングは実際の生成頂点を含む包囲球を使用し、初期warmと復旧時の扱いを保持した。

武器の一時ベクトルや短命recordは、呼出し深度・ローカル主体・実際のrecycle境界を確認した範囲で再利用した。遅延Slosher方向やremote音源座標、外部へ保持される値は独立所有を維持した。独立レビューで見つかったShotBias公開コールバックの参照保持違反は再利用を撤回し、保持・入れ子・後続呼出し・例外の回帰を追加した。

Cargo templateの全ゼロUV/全白colorは、実際のmerge fallbackで同じ最終値になるものを省いた。Marinaは同じ側の三角形と壁の固定軸に無関係な矩形だけを先に除外し、交差候補の元の計算を維持する。旗/バナーは格納済みFloat32色と同じ時の再書込みを省いた。

## 検証結果

| 検証 | 結果/範囲 |
|---|---|
| 本番ビルド | esbuild minify構成で成功 |
| 起動budget | 既存ゲートを変更せず合格。初期JS 2,011,022 bytes、145 modulepreloads |
| Source/build照合 | 1,482入力のhash一致、差異0件 |
| ソース合成/構文 | 118モジュール、失敗0件 |
| 基本ゲート | check:patches / audit:migration / test:ci-config / test:direct-source 全て合格 |
| メモリ回帰 | 77件合格、失敗0・skip0 |
| 旧キュー回帰 | test:queue-recovery全phase合格 |
| 通信・ranked・relay | 17suite / 208テスト合格 |
| 独立武器レビュー | 9suite / 62テスト合格 |
| Native関連 | source inventory23、prebuilt/worker19、minimap11、ink chunks12など合格。実ソースアセット依存5件はskip |
| キャラクタCPU同値 | 228メッシュ/1,380属性バッファがバイト一致。370状態を30/60/120Hzで比較 |
| SwimWake同値 | 1,050フレーム、点/uniform/状態が一致。fixtureでの異なるpoint record数1,341→153 |
| 新規描画/世界回帰 | pending GPU範囲、font寿命、Cargo merge、水際/旗色など10テスト合格 |
| 差分健全性 | git diff --check合格 |

本番content hash: `c21cf1debfeb3a8f36d74cc88e27477384702cfc0c7f2d1350ae4d44be7dc40b`

Asset revision: `cbf59ed3f4e2964a9b8573b0ff4f259abf56550ebfa21fe608beda9e68838ca4`

Chromium151.0.7922.34で本番ファイルのhashを検証し、nativeメニュー→Turf War→実入力90tick射撃→終了→Practice再入場を確認。塗りversion29→60、ローカル色セル153→1,047。別のTurf War実行でGPU contextlost/contextrestored、一時停止/再開60tick、CPU塗りgrid/actor所有権維持、終了後再開の拒否を確認した。Service Workerも有効。採用した2laneでpage/console/HTTP/requestエラーは0件。最初にPracticeの停止時計へTurf用の時計アサーションを当てたfixture失敗は、GPU喪失要求より前の失敗として別途保持した。

詳細は `inkwave-library-verification-20261027.json`。CPU・実ブラウザー・物理実機の結果を区別する。SwiftShaderでの秒数をiPadの性能値には換算しない。このheadless環境は日本語fallback glyphが欠けており、日本語タイポグラフィのピクセル受入れには使わない。

### 不合格や未完了を隠さないための記録

最初の統合で、既存adapterと音声修正2件が重複して合成を拒否した。既存実装を確認して重複変更を除き、その2件は新規実装から対応済みに修正した。5件のdirect-owned sourceについては、新しい変換を本来の著者ソースへ移動し、生成結果の同値を照合した。ゲートを緩めたり許容リストを足して通したものではない。hash固定のlegacy sourceは保持し、direct-owned moduleは既存の所有規則に従って直接変更した。

Sprite/Ribbonテストは新しい実helperを使うようfixtureを更新した。既存同値アサーションは維持し、未消費rangeとzero方向の回帰を追加した。

追加の大規模 `roller-shaft-production` 全行列は240秒で打切りになり、全件合格とは数えない。同じseedの最初のproduction比較は個別に25.04秒で合格。30秒のbounded stackで、長いケースは既存 `PaintSystem._initGrid → pointInsideGrid` の有限走査に時間を使っていることを確認した。RNG拒否loopの証拠はなく、これを回避するための製品コード変更はしていない。

## 採用しない/未実装の境界

35件の不採用には、公開コールバックが保持できるpaint options/splat関数/ShotBiasの再利用、変更可能なprojectile listから完全なsnapshotを省く案、丸めや読取り順序を変える省略、guard追加でnear/mixedの合成CPU試験が遅くなった軸prefilterなどを含む。実装数を増やす目的で契約を変更しない。

29件の未実装項目の主な条件は次のとおり。

- iPad/Safariの音声unlock継続、GPU形式/フィルタ/mipの同値、CPU画像解放後のcontext復旧、実RAM改善などの物理実機証拠。
- World/paint/map/共有muralを一体でprepare/commit/cancelできる所有構造。現在の公開後にyieldを足すだけでは部分worldや旧材質が参照中のcanvas変更を外へ出す。
- Native navigation/CSR/minimap raster、Legacy dead-gridのバージョン付き検証済みアセットと、全依存を含むfingerprint。誤った1bitを塗りやBOT経路へ持ち込まないため、既存の安全な再計算を維持する。
- KTX2のdecode前mip選択に必要なloader契約、低メモリ時の代替ロード/拒否方針、runnerを跨ぐbuild再利用の証拠。

これらはソース監査済みだが、**実装済みとは分類していない**。物理iPad/Safari/PWA、実際の多人数WAN対戦、公開hosted CIは今回実行していない。本家Charger/Bloblobber/Roller/Brushの未確定数値も推測で変更していない。詳細な本家との挙動境界は既存 `inkwave-splatoon3-behavior-2026-10-02.md` に追記した。

## 再現とローカル適用

対象のbase SHAと一致するcheckoutでパッチを適用する。現在の作業ツリーはすでに適用済みなので再適用しない。

Nodeは固定したViteの要件に合わせて `^20.19.0 || >=22.12.0`。今回の検証はNode24.22.1。root/accountのlockfileを含め、CIのNode22指定は維持した。

```bash
npm ci
npm run check:patches
npm run audit:migration
npm run test:ci-config
npm run test:direct-source
npm run test:queue-recovery
npm run test:memory
npm run build
npm run check:budget
```

ブラウザー検証はローカルの本番 `_site/` を使用する。PR #1882を含む既存PRのmergeや遠隔公開は行わない。全件判断JSONと検証JSONはパッチと一緒に保持し、未実装項目が次回の引継ぎで消えないようにする。
