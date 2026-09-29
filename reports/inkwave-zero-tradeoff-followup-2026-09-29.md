# INKWAVE 画質・操作感を落とさない追加改善調査（第4回）

- 調査日: 2026-09-29 JST
- 対象: `rhgrive3/actions / inkwave-public/`
- 基準コミット: `2f12f1715ac4a36e5744bb9d7fe537996c885a2e`
- 状態: 中間保存。追加3件の関数単位検証を完了。詳細と再現資料を追記予定。
- ゲーム本体への修正ではなく、追加改善の調査レポート。

## 確認できた追加候補

| ID | 対象 | 内容 | 検証 |
|---|---|---|---|
| Q04 | Decor / LobbySet / Showcaseのロビー最終終了 | geometry/materialだけでなくInstancedMesh本体をdisposeし、専用属性を解放 | 同梱Three.jsの資源管理＋模擬GLで20回の解放経路を確認 |
| Q05 | Environment._rebuildDock | 捨てる桟橋・杭・係留船の所有materialを一度だけ解放 | 20回のfixtureでmaterial dispose 0→60、既存geometry解放80→80 |
| Q06 | ShowcaseのInkFX / Sparkles / InkTrail / Confetti | count=0の不要なmatrix更新要求を止め、描画するprefixだけ転送 | 2,040フレームでCPUの行列・色配列と描画対象の模擬GPU行列が一致 |

Q04の20回fixtureで、明示解放されず残る模擬バッファはDecor 40→0、LobbySet 100→0、ロビーFX 240→0。ロビーcontactが共有するgeometry/materialはそのロビーの解放では破棄しない。

Q06では10 meshの空状態120フレームで、初回確保を除く模擬bufferSubDataが9,347,840 bytes→0。これは比較用fixtureの計測であり、実端末の転送量・FPSの実測ではない。ロビー8 meshのmatrix容量は合計63,232 bytes。

前回のQ01/Q02/Q03およびF01/F03/F04/F06は修正済みとして扱った。影・反射・描画解像度・粒子数・物理精度・更新頻度を下げる案は含めない。

「デメリットなし」は表示内容・ゲーム仕様との交換条件を設けない意味。実機FPSや電池消費の改善幅、ブラウザGC後の実GPUメモリ量は未測定。
