# ライブミニマップの局所更新 — #895 (2026-10-07)

## 課題

`inkwave-public/src/game/minimap.js` の `update()` は `PaintSystem.version` をグローバルな無効化フラグとしてのみ使い、局所的な塗り1回でも150msごとにマップ全体を再走査・再転送していた。`_drawInk(y0, y1)` は行範囲 `[y0, y1)` の2パス（所有権のバイリニア評価とエンボス書き込み）を回し、`putImageData` を `(0, 0, 0, y0, W, y1-y0)` の全幅ダーティ矩形で2回（ink / flash）呼ぶ。全体更新は3バンド（`BANDS = 3`）に分割されるが、それでも各バンドはマップ幅ぶんの矩形をCPU処理する。

ステージのラスタ寸法（既定 7 px/m）:

| ステージ | 論理寸法 | ラスタ (px) | ピクセル数 |
| --- | --- | --- | --- |
| Tidewater | 50 × 88 m | 350 × 616 | 215,600 |
| Kelpline | 48 × 96 m | 336 × 672 | 225,792 |
| Halyard | 48 × 92 m | 336 × 644 | 216,384 |

## 修正方針

公開ソース（`inkwave-public/`）は不変のまま、所有アダプタ2ファイルで実現する。

- `patches/splatoon3/minimap-dirty-adapter.mjs` — 5つの厳密アンカー（`replaceOnce`、欠落/重複で失敗）:
  1. `src/world/paint.js` の `_cpuSplat` 所有権書き込み直後に `if (this._inkMark) this._inkMark(f, i, j);`
  2. `src/world/paint.js` の `clear()` の `this.version++` 直後に `if (this.inkDirty) this.inkDirty.full = true;`
  3. `src/game/minimap.js` の `_drawInk(y0 = 0, y1 = this.h)` → x範囲引数追加
  4. 画素ループ `px < W` → `px < x1`
  5. `putImageData(...)` のダーティ矩形を `x0, y0, x1-x0, y1-y0` へ
  6. 150msゲートの分岐に、ダーティ世代の変化と部分再描画の分岐を挿入
- `patches/splatoon3/runtime/minimap-dirty.mjs` — 挙動本体（`installMinimapDirty`）:
  - `PaintSystem.prototype._inkMark(f, i, j)` は turf 面かつ非 dead セルのときのみ、セル中心をワールド座標へ変換して `this.inkDirty` の `{x0,z0,x1,z1,gen,full}` を拡張する。
  - `Minimap.prototype._drawDirtyInk(rec)` はマップ座標を `toCanvas` でピクセル矩形へ写し、エンボス隣接のため1px（`HALO`）、バイリニア参照のためセル2つ分（`CELL_PAD=2`）を膨らませ、消費したバウンディングだけを戻す（`rec.gen === gen` のときのみ＝スナップショット安全性）。
  - 大きなダーティ領域 `(x1-x0)*(y1-y0)*BANDS >= W*H` は既存の3バンド全描画へ、それ以外は `_drawInk(y0, y1, x0, x1)` へ。
  - `tickHidden`（ミニマップOFF）を上書きし、ダーティ領域を O(1) の全体無効化へ畳む。

配線：`patches/splatoon3/adapter.mjs` の `adaptSource` 先頭で `adaptMinimapDirty` を適用。`patches/splatoon3/runtime/install.mjs` で `Minimap` を import し `installMinimapDirty(api)` を `installWeaponsFidelity` の直後に呼ぶ。既に適用済みのツリーを再合成しても壊れないよう、アダプタは全フックが揃っていれば冪等に素通りし、アンカー欠落/重複（上流ドリフト）では失敗する（`patches/local-quality/first-touch-adapter.mjs` と同じ流儀）。

## 検証

すべて `node --experimental-vm-modules --test`。ロジック/CPU レベルで、ブラウザ canvas、GPU、Switch 実機は測定していない。

- `patches/splatoon3/tests/minimap-dirty-895.test.mjs` — 9/9 合格。アダプタ未適用の基準では 2/9（下記ログ）。
  - 3ステージで、局所更新の `inkImg` が強制全描画と毎ステップ**バイト一致**。ちらつきレイヤ `flashImg` は遷移履歴であり、再描画矩形の**内側は完全一致**、外側のみ差が出る。
  - 描画 putImageData 面積は定常交戦フィクスチャで全描画の **5% 未満**（`partialArea < fullArea * 0.05`）。
  - 全体無効化4種（`clear()` / 視点チーム反転 / チーム色 / テーマ）が全描画すること。
  - 全ステージ塗りのような広域変更は**3バンド経路**（幅=全幅, 高さ<全高, `_band=1`）にフォールバックし、単発全描画と ink が一致。
  - OFF では `tickHidden` がラスタも ImageData も実行せず、`inkDirty.full=true`・バウンディングが O(1)、復帰で全体1回。
  - 窓内複数スプラットの合流で更新1回・和集合内に継ぎ目なし。
- 基準（アダプタ配線を戻した状態）: `BEFORE` ログ 2 pass / 7 fail、EXIT=1。
- 隣接制御: `patches/local-quality/tests/minimap-resources.test.mjs`（#419）10/10、`patches/splatoon3/tests/adapter.test.mjs` 10/10、`patches/practice-range/tests/isolation.test.mjs` 7/7、`patches/network-replication/tests/contracts.test.mjs` 13/13。

ログとハッシュ: `/mnt/workspace/inkwave-batch-c/evidence/additional-100/r54-895/`（`AFTER-895.log`、`BEFORE-baseline.log`、`CTRL-*.log`、`AFTER-sha256.txt`）。

## 本家（スプラトゥーン3 Ver.11.3.0）との比較

観察可能な挙動として、本家のコーナーマップは塗り替わった領域だけが順次更新され、常時ステージ全体を再走査しない。本品もこれを満たす（局所塗りは局所更新、変更のない領域は再処理しない）。一方で本家内部の更新単位・フレーム値・フェード/エンボス処理は公開されておらず、こちらへ数値として写していない。ミニマップOFF時にライブ更新を行わないこと、チーム色/テーマ/ステージ変更で全体を再描画することも本家の観察挙動と矛盾しない。

**未確認**：ブラウザ実表示、GPU/Canvas2D の実コスト、Switch 実機でのフレーム比較。したがって速度の実測値（ms/フレーム等）は主張しない。この修正の主張は「出力が全描画と一致し、処理面積が有界」というロジック/CPU レベルの事実に限る。

## 制約

- `inkwave-public/` の原生ファイルは不変。`runtime/weapons.mjs`、generic footprint264 には触れていない。
- `patches/splatoon3/profile.json` と `upstream-lock.json` は無変更（`git diff f31f5da4 --` が空）。
- 変更ファイル（この作業のみ）: 上記アダプタ/ヘルパ/テストと本レポート群。
