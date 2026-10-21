# 更新後のゲーム起動失敗とキャッシュ復旧

初回調査の基準: `eb65d48`。PR は更新後の main `225f1d3042f2bdf9e8cec7e634afa4b8efa4a800` を基準に統合。変更範囲は公開版の起動・配信・Service Worker。ゲーム内の通常モード、操作、移動、射撃、対戦ルールは変更しない。

## 問題の経路

- 配信は `_versions/<revision>/` 単位。更新で旧ツリーが消えた後、古い HTML や部分的に残ったキャッシュが旧モジュールを要求すると起動できない。
- 起動エントリー `startup.mjs` 自体の失敗は、そのモジュール内の catch では扱えない。
- Service Worker 登録・更新は従来エンジン起動後のメニューまで延期されており、失敗したゲームから更新処理へ到達できない。
- `game.boot()` はモジュールの評価とは別に進み、自身の catch でエラーを処理する。初期化中の遅延 import の失敗も起動側へ渡す必要がある。
- immutable URL の取得にキャッシュ済み 404 や整合性不一致の 200 が返ると、同じ取得を繰り返しても復旧できない。

## 変更後

HTML に外部モジュール不要の小さな復旧処理を配置する。起動エントリーまたは初期化中のモジュール取得失敗を検出したら、失敗時に限り SW 更新を開始し、最大 1.5 秒後にキャッシュ回避用の文書 URL を一度開く。新しい文書を作り直すため、ブラウザーの失敗済み ESM module map も引き継がない。ブキやステージなどのゲーム用クエリーと fragment は保持する。起動成功後は内部パラメーターを履歴から除く。

URL と scope 単位の sessionStorage ガードで自動再試行を制限する。保存領域が使えない場合も URL の印でループを防ぎ、手動再試行は残す。オフラインでは自動遷移しない。一般のアプリ例外は自動再起動の対象にしない。ゲーム起動後は復旧用のイベント監視を外す。

SW は不正応答・404・410 に対し同一 revision の同一 URL を一度だけ HTTP キャッシュを回避して取得する。waiting の新版を古い active worker が通す経路でも 404/410 を再取得する。異なる revision の同名ファイルを代用せず、検証できない本文を現在版の Cache Storage へ保存しない。

復旧パラメーター付きの文書要求では、現在版の保存済み JavaScript のみ digest を再検証し、不一致の entry だけを除く。通常の warm hit の再検証・転送は増やさない。プロフィール、設定、他アプリの cache、正常な保存済みアセットは対象外。SW の強制 activation、対戦中の自動再読込は導入しない。

## 初回実装の検証（基準 eb65d48）

- loading-cache の全 Node テスト: 64 pass / 5 skip。基準入力依存の adapter テストは別途 minify した現行 `src/main.js` を入力にして 14/14 pass。
- Python キャッシュハーネス: 3 pass / 1 skip（別取得の baseline の指定が必要なケース）。
- 通常の配信ビルドと startup budget: pass。critical HTML 23,565 bytes、起動 JS 2,239,015 bytes、worker 76,529 bytes。いずれも既存上限内。
- 新規の Chromium / WebKit 回帰は、古い SW と HTML が残るプロファイルで entry 欠落、初期化中の import 失敗、恒久エラーを再現する。設定と他アプリの cache の保持、更新処理への到達、一度だけの再試行を確認する。CI の startup suite に組み込む。Chromium 153 のネイティブ実行で 3/3 pass（モバイルサイズ、永続プロファイル、実際の Service Worker / Cache Storage）。
- 実際の配信用 `_site` でも、最初の起動エントリー要求を 404 にした後、一度の文書再取得でゲームの `engine-ready` まで到達した。ページ例外 0、`map=tidewater` と fragment を保持、成功後に内部パラメーターを削除、復旧シェルを非表示にできることを確認。Chromium 153 / SwiftShader による起動確認であり実端末の速度測定ではない。
- 通常の Playwright ブラウザーダウンロードは破損応答となったため、npm 配布の Chromium をローカルに展開して検証した。WebKit と実際にホーム画面から起動する iOS / Android 端末は未確認。

## 更新後 main 225f1d3 への統合確認

公開版の新しいゲーム本体・描画アダプターを含む main 上で再検証。今回のコード領域の競合はなく、比較記録の双方の追記を保持した。

- loading-cache、cache manifest、integration workflow の Node 回帰: 91 pass / 5 skip。
- Python キャッシュハーネス: 3 pass / 1 skip。
- 配信ビルドと startup budget: pass。critical HTML 23,872 bytes、起動 JS 2,233,955 bytes、worker 76,293 bytes。既存上限内。
- Chromium / WebKit の古い SW / 永続プロファイルでの復旧回帰: 各 4/4 pass。
- 追加反例として、旧起動エントリーを 200 / JavaScript MIME の構文破損本文に置換すると、script 要素の resource error ではなく window の ErrorEvent が発生し、従来処理は 8 秒待っても起動に到達しなかった。対象 entry の正確な filename も捕捉することで、モジュール自身が実行できない場合も一度の再取得で復旧する。他アプリの filename は対象外。両ブラウザーで新規ケースを通過。
- 更新後ゲーム本体の配信ビルドでも、起動エントリー 404 → 一度の文書再取得 → `engine-ready` を確認。ページ例外 0、クエリー・fragment 保持、復旧シェル非表示、成功後の内部パラメーター除去を確認。

本家比較: 今回は Web 配信の更新・復旧機構のみであり、スプラトゥーン3のゲーム内挙動を変更・同等認定するものではない。本家の未確認値を推定で追加していない。
