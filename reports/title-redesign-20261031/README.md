# ZEVANT 起動タイトル刷新・デモ軽量化

2026-10-31。統合先は [PR #1988](https://github.com/rhgrive3/actions/pull/1988)。基準 main は `4423b1ea47a5be387991f3de9a70f900fb4d1b26`。

## 見た目と操作

タイトルを、黒に近い背景、大きい白の ZEVANT ロゴ、シアンの細線、ライム色の開始ボタンを中心とする構成へ刷新した。デスクトップではロゴを左、デモを右に見せる。縦画面ではデモを上、開始操作を下へ配置する。既存のローカルフォントを使い、画像・フォント・実行時モジュールの追加取得はない。入口の短い CSS アニメーションだけを使い、常時動く装飾や blur は追加していない。

開始ボタンはネイティブの `button` で、既存の `_titleGo()` が操作を所有する。ボタン・子要素のクリックをタイトルの一つのハンドラに集約し、外側のユーザー操作リスナーにも伝える。既存の開始直後の入力抑止、遷移遅延、連打抑止、音声初期化、キーボードとゲームパッドのメニュー操作を維持する。キーボードフォーカス、safe-area、48px 以上の開始ボタン、日本語・英語、短い横画面に対応した。

## タイトル専用の負荷制御

| 項目 | 変更後 |
| --- | --- |
| デモの人数 | 4対4から2対2へ。通常対戦は4対4 |
| 背景描画 | 通常PCは最大30Hz、タッチ端末または低画質設定は最大20Hz |
| デモの物理・対戦更新 | 既存の固定60Hzを保持。描画を省略しても時間を捨てない |
| 背景の動的解像度倍率 | 上限をPC 0.75、タッチ0.60とする。既に低い倍率なら引き上げない |
| UIの解像度 | DOMで描画し、背景の解像度制限を適用しない |
| 動きを減らす設定 | 1枚描画して保持。以降は重いワールド描画と対戦更新を止め、入力とメニュー更新を続ける |
| タイトル終了 | 入った時の解像度倍率を復元し、保持画面とデモへの参照を解放する |

描画間隔の判定は30/60/90/120/144Hzの外側更新で検証した。画面回転、ウィンドウサイズ、DPR、動きの設定の変更では保持画像を更新する。保持画像を表示できない場合は実描画へ戻す。停止中の時間を通常対戦へ持ち越さない。

この値は ZEVANT の装飾デモの予算であり、Splatoon 3 のタイトル画面を計測・再現した値ではない。人数半減や解像度倍率は処理対象の削減であり、端末FPSやゲーム全体の負荷の改善率を意味しない。

## 検証結果

最終の通常ビルドの content hash は `c9bf67fbd892348c581641b77b4bd4c31dcfa86cd1e4ad71e3bbe82beb5501e0`、build revision は `62de07c3fe84fcec612071ee0d390c0573fd2e056ea8ffa6abf0e9b62afd5dd0`。実行時の検証記録とソース blob の対応は [validation.json](validation.json) に保存した。ローカル checkout の HEAD は基準コミットのままで変更を作業ツリーへ適用していたため、検証記録の `sourceHead` 単独を最終コードの識別子として扱わない。PR のコード11ファイルとローカルの Git blob SHA がすべて一致することを別途照合した。

- 新規デモ回帰6件・UI回帰5件が成功。60Hzの対戦更新、表示間隔、倍率の復元、保持画像の失敗・再開、オンラインや通常対戦の除外、人数を確認した。
- 既存の静的メニュー回帰10件、タイトルの入力所有権回帰3件が成功。静的メニューのテスト用評価環境に新しいビルド内包関数を渡し、既存の検査内容を保持した。
- qualityスイート19ファイルと既存のAO・geometry・topology検査、direct-sourceスイート3ファイル、quick patches、対象のpackaging検査、通常ビルド、起動サイズ予算が成功した。quality全体の実行後に行ったデモ参照解放とクリックハンドラ整理は、関連回帰と最終ビルド・ブラウザ検証で再確認した。
- Chromium 151 / ANGLE SwiftShader の実アプリ・native RAFで検証。デスクトップ、iPad相当の縦横、スマホ相当の縦横の5画面サイズと、動きを減らす設定2条件を目視確認し、文字切れやボタンの重なりがないことを確認した。日本語はホストのNoto Sans CJK JPを使用し、アプリへ検証用CSSやフォントは注入していない。
- 信頼されたダブルクリック・Enter・タップで開始し、ゲームパッドのメニュー確定経路も検査した。各操作の遷移は1回、開始後はデモ0体・デモ参照なし、音声AudioContextはrunning。タイトルへの再入場で4体へ戻り、通常対戦で8体と元の解像度倍率へ戻ることを確認した。物理ゲームパッドの実機操作ではない。
- 動きを減らす設定で、デスクトップ97フレーム／タッチ96フレームの観測中にワールド描画0・Match更新0、メニュー更新と保持画面の表示は継続した。設定解除後のデモ再開も成功した。
- 最終ブラウザ検証はページ例外0、console error0、配信物のハッシュ不一致0で完了した。

配信物のソース差分は `src/main.js`、`src/game/match.js`、`src/ui/menus.js`、`styles/ui.css` に限定される。ほかの差分はビルド識別情報、HTML・Service Worker、revision付きURLである。3つのink-volume manifestはrevision部分を正規化すると同一。初期JSリクエスト146・modulepreload145は増えていない。起動予算の各測定値は検証JSONを参照。

## 再実行

```sh
npm run check:patches
npm run test:direct-source
npm run test:quality
node --test patches/local-quality/tests/title-demo-budget.test.mjs patches/local-quality/tests/title-presentation.test.mjs patches/local-quality/tests/static-menu-art.test.mjs
npm run build
node scripts/check-inkwave-title-redesign.mjs --site _site --evidence-dir /tmp/zevant-title-check
```

ブラウザ検査にはPlaywrightとChromium、および日本語を目視確認するためのホストフォントが必要。必要に応じて `PLAYWRIGHT_BROWSERS_PATH` と `FONTCONFIG_FILE` を指定する。検査は配信済みの `news=0` オプションで初回ニュースダイアログを除き、ゲームの描画や対戦更新をデバッグ停止せずに進める。baselineや短すぎた観測窓の途中結果ではなく、最終の成功したrelease実行を本記録の根拠とする。

## 検証の範囲

ソフトウェアWebGLのため、この起動時間・フレーム数からiPad、iPhone、Safariや実GPUでのFPS改善率は計算しない。ネイティブステージのLFS payloadがない環境では既存のbrowser conversion fallbackを使用しており、全ステージ・全ブラウザの実機比較は未実施。GitHub上のCIとmain統合・公開反映の最新状態はPRとActionsを参照する。
