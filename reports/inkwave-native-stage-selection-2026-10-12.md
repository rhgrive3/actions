# 原典5ステージの公開選択・続行記録

ユーザーの追加指示で、PR #1285をステージ選択から確認できる状態にしてmainへマージし、その後の改善を続ける。以前の「mainにはマージしない」はこのPRについて更新された。完全な本家Ver.11.3.0再現を示す完成判定とは分ける。

## 公開ビルド

通常のビルドで、ユノハナ・ヤガラ・海女美・ザトウ・クサヤを選択できる。固定KiTrix commit `0611f51b35c9736ee986fb2218461e2585b7875e` の原典は利用者のブラウザへ直接取得する。Git/Pagesにモデルや画像を同梱しない。

- OBJはLFS media URLで取得し、LFS OIDのSHA-256で検証。MTL/PNGは固定Git treeのblob SHA-1とbyte数で検証する。
- Web Workerで表示・衝突三角形・BVH・チャート・三角形マスクを生成。原典メッシュを箱へ置換しない。
- 各2ステージのCacheStorage/IndexedDBキャッシュを利用者のブラウザに保存する。破損キャッシュは検証して再取得し、保存が拒否された場合は通常取得を使う。
- 初回はモデルと画像のダウンロードが必要。KiTrix/GitHubとGitHub APIに依存する。モデル未取得での初回オフラインは保証しない。
- メニュー画像は独自の抽象SVG。原典のスクリーンショットや架空のステージ座標ではない。
- 読み込み進捗を表示。取得失敗時は旧地形を保持し、ステージ選択へ戻る。
- 長いステージ一覧をスクロール可能にし、マウス/キーボード/パッドの選択を対戦設定と重ねない。

## 原典と本体の確認

JS変換と既存のPython変換を全5ステージで比較し、頂点・法線・UV・描画インデックス・衝突三角形・衝突法線・flags・object IDs・triangle face IDs・polygon masksがバイト一致した。BVHの葉の並びは同じである必要はなく、全三角形を一度ずつ含むことを確認した。これは固定表示OBJとの一致で、本家のネイティブcollision/paint maskの証明ではない。

追加Node検証は原典比較を含むnative16件、カメラ/ランク/品質の関連25件、Blaster受信・数値境界・kit paint29件が成功。通常ビルドの起動ゲートは131 core hints・14 range hints、precache 5,727,862 byte、worker 70,515 byteで既存上限内。

Chromium/SwiftShaderの実ブラウザで通常ビルドの選択ボタンを押し、全5モデルを外部URLから取得して本体を起動。各8人・7bot、CPU塗り、射出/着地、GL描画を確認した。クサヤ再訪はderived cacheを利用しOBJ再取得0。破損OBJを返す負対照では旧levelを保持し、進捗を除去して選択画面へ復帰した。

## 検出した塗り同期差と修正

クサヤの反復オンライン試験で、キュー/成長処理の完了後にも55セルの差を再現した。因果owner recordと全splatの記録により、ホストsequence 2025/2146の半径3.84・kind shotが受信側で呼ばれていないことを確認した。

`s3-blaster-short` の固定原典 `BlasterBurstParam.SplashDropPaintRadius` は3.84。main-weapon-catalogのterrain burstがこの半径でground dropを生成する。一方、受信側のcatalog半径検査はそのキーを列挙せず、実パラメーター由来の上限1.56と従来の3.744だけを使用していた。

`SplashDropPaintRadius` を所有者のcatalogパラメーターから計算する検査へ追加した。全体上限を広げない。他人の武器や3.84を超える改ざん値は拒否する。以前の241セル差も同じ領域/色の症状として記録したが、因果イベントまで採取できた再現は55セルのケースである。

オンラインはノヴァをホストの実ロスターへ設定し、その原典半径3.84をTurfの明示した塗り試験へ使用する。モデル/実装fingerprint、再生watermark、成長/送受信キューと全グリッドSHA-256の検査を維持する。
修正後の全5ステージ×5ルール25ケースはすべて成功・エラー0。Turfの5ケースは原典半径3.84を含めて全グリッドが一致し、ガチ4ルールのカウントも一致した。[数値記録](inkwave-native-stage-selection-verification-2026-10-12.json)に条件と結果を保存した。

## 未確認と再開

11.3.0のモデル版一致、原作スポーン・ルール別scene/placement、ネイティブmask、元シェーダー、実モバイル性能は未確認。PNGのchannel/normal/alphaはデコードからの推定で、Nintendo shader metadataの代用ではない。ガチ4ルールは到達可能なPnt地形へのローカル調整値。

原典データと画像は `.codex-stage-sources/` / `.browser-evidence/` のignored領域のみ。公開Gitへの追加なし。確認画像は `native-source-public-final/`、同期診断は `native-source-repeat/`、修正後の同期は `native-source-online-fixed/` に保存する。権利確認済みの再配布アセットとは扱わない。

```sh
node scripts/build-inkwave.mjs inkwave-public _site-public
node scripts/check-inkwave-startup-budget.mjs _site-public
node scripts/check-inkwave-native-source-browser.mjs _site-public .browser-evidence/native-source-public
NATIVE_HOST_WEAPON=s3-blaster-short node scripts/check-inkwave-native-online.mjs _site-public .browser-evidence/native-source-online
```

公開後の改善は別ブランチで続ける。source三角形/CPU塗り/物理を保持した描画負荷削減と、初回処理スパイクを次の測定対象にする。

## mainとPagesへの反映

PR [#1285](https://github.com/rhgrive3/actions/pull/1285)をユーザーの明示指示でmainへマージした。merge commitは `ed3a046574208471c5db5309e2469d263cacfdfd`。Pages run [38254171363](https://github.com/rhgrive3/actions/actions/runs/38254171363)はbuild/upload/deployすべて成功。

公開URL https://rhgrive3.github.io/actions/ の新規Chromiumブラウザで既存3+原典5の選択肢を確認し、実際のユノハナ選択ボタンから開始した。ブラウザ直接取得モード、固定OBJ SHA-256、279,299表示三角形、8人、ページ例外0を確認した。証拠はignored `.browser-evidence/native-pages-live/result.json`。これは公開動線の確認で、Ver.11.3.0完全一致や実機FPSの認定ではない。

継続ブランチはmain mergeを基点にした `codex/stage5-render-performance`。元の三角形/塗り属性を維持した画面外描画の削減を実装・比較し、追加の変更は別PRに残す。
