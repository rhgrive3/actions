# INKWAVE：画質を維持する追加監査（検証中）

- 対象：`rhgrive3/actions` / `inkwave-public/`
- 基準コミット：`2075e6468b99c901ff0817b5858c7bae2d1a6095`
- 日付：2026-09-29
- 方針：解像度、影の品質、反射、エフェクト数、更新頻度、入力応答、物理計算の精度を下げる提案は含めない。

## 確認済み：ロビー終了時の影用 RenderTarget の明示的解放漏れ

`src/game/lobbySet.js:607–611` で生成する `lights.key` は影を描画する SpotLight だが、同ファイル `dispose():772–780` はその `shadow.dispose()` を呼んでいない。`src/game/showcase.js:1651–1665` の `_lobRelease()` からこの dispose が実行され、最後にシーンが空になる。`_updateSet():2093–2106` ではロビー画面を離れた後、保持条件がなくなると通常操作でも解放経路に入る。

提案は最終解放時に、この LobbySet が所有する `lights.key.shadow` を dispose すること。描画中の影や設定を変更しない。使用中の共有資源を一括 dispose する修正にはしない。

同梱 Three.js の `LightShadow.dispose()` は `map` と `mapPass` を解放する。シーンからの除去はこれに代わらない。GPU 実メモリ量や FPS は未計測で、プローブでは解放イベントを確認する予定。

## 検証中

- 動かしている投擲ガイド線の `lineDistance` 属性を、同じ数値のまま再利用できるか。
- LobbySet コンストラクタ中の同一環境光の二重ベイクを、初期化の副作用を保って1回にできるか。

検証後に、このファイルへ再現結果・具体的な修正条件を追記する。ゲーム本体のコードは変更していない。
