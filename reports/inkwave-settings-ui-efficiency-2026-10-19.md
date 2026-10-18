# 設定画面の操作・表示同期と不要処理の整理

基準 main: `dfbdcc9c523790f66fa56a22e4cf7873bdb3af03`。

対象: 公開版 `inkwave-public/` を本番合成した設定画面。入力スナップショットは変更せず、`patches/local-quality/settings-ui-adapter.mjs` を既存の合成・identity・build-only 管理へ接続する。

## 再現した問題と変更

- スライダーを指1で押し、指2の move/up を同じトラックに渡すと、指2が値を書き換え、指1のドラッグも終了していた。押し始めた pointerId だけを受理する。トラックを直接押しても行とプレビューを選択する。右クリックを除外し、pointercancel / lostpointercapture / blur / 行再生成 / 画面破棄でリスナーと capture を解放する。
- Controls を開いたまま mouse → touch → pad と切り替えても、マウス専用行は初回生成時のままだった。マウス行の表示方針が変わった時だけ再生成し、接続済みのフォーカスとスクロール位置を維持する。pad ↔ keyboard は同じ行を再利用する。
- スライダーのプレビュー表示中に defaults の適用経路を呼ぶと、操作部だけが更新されプレビューは旧値だった。実際に保存された設定の1スナップショットから両方を同期する。
- `refreshControl`、profile 変更、audio 連動で同じ設定オブジェクトを複数回取得・複製していた。1イベントにつき1回取得して再利用する。slider の同値 refresh は DOM を再更新しない。
- saved 表示、退出プレビュー、ドラッグの作業が設定画面の寿命から独立していた。画面の destroy が timer・observer・イベント・control をまとめて退役させる。
- 一覧の端のフェード判定が毎フレーム scrollHeight / clientHeight / scrollTop を読んでいた。ResizeObserver と scroll / resize で dirty にし、変更時だけ1回読む。ResizeObserver のない環境は従来の毎フレーム更新へフォールバックする。タブの pill もサイズ変更に追従する。
- 狭い横長画面で「サウンド」「ゲーム」のタブ名が途中改行されていた。文字列の幅に応じた flex 配分と nowrap で1行を保つ。

## 検証

- `node --test patches/local-quality/tests/settings-ui.test.mjs`: 9件成功。旧実装で第二ポインターによる誤操作が成立する negative control を含む。
- メニュー・ナビゲーション・ring・profile・view-settings の関連既存テスト: 82件成功。
- `scripts/check-inkwave-settings-ui.mjs`: 本番ビルドの Menus と quality installer を Chromium 上で起動。1280×800 / 844×390 / 390×844 の3条件で成功。実マウスの click / drag / pointer capture、入力方式切替、default reset、preview、1 snapshot refresh、タブ変更時のドラッグ終了、タブ名の改行を検証。
- 選択リングの意図的な追従処理を除外して一覧フェード処理だけを計測すると、静止中120フレームの一覧 geometry read は0回、scroll 後は3プロパティを1回ずつ読む。GPU負荷・FPS・電力の測定ではない。
- スクリーンショットと JSON、ビルド・テストログはローカル `work/` に保存。チェック用 HTML は検証スクリプトのHTTPサーバーだけが返し、配信物に追加しない。

## 本家比較と限界

参照対象は従来どおり Splatoon 3 Ver.11.3.0 の設定・TV/テーブルモードと携帯モードの独立した操作設定。今回、既存の profile・感度・ジャイロ権限・ゲーム内の移動／射撃ロジックの値は変更しない。独立 profile の既存回帰を継続して実行する。

Web の pointer capture、マウス・タッチ間の切替、スクロールフェードは INKWAVE 固有の UI。上記は Web 内の状態同期の確認であり、本家 Switch 実機と同一のメニュー操作、フレーム時間、感度、操作感になったという根拠ではない。実 iPad / Safari / WebKit、物理コントローラー、オンライン対戦全体はこのブラウザチェッカーの対象外。
