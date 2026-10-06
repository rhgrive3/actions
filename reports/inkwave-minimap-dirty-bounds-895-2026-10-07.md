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
  7. （補正）アルファ/バイリニア第1パスをダーティ行の全幅走査から実ハーロ矩形 `[y0-1, y1+1) × [x0-1, x1+1)` へ限定（エンボスの隣接参照は全カバー）
  8. （補正）パスごとのフラッシュ画素バウンディングを `this._lastFlashBox` として記録
  9. （補正）`_drawInk` 冒頭で前回フラッシュ箱の古いアルファを消去し、その矩形を bounded に再アップロード（下記「補正」参照）
- `patches/splatoon3/runtime/minimap-dirty.mjs` — 挙動本体（`installMinimapDirty`）:
  - `PaintSystem.prototype._inkMark(f, i, j)` は turf 面かつ非 dead セルのときのみ、セル中心をワールド座標へ変換して `this.inkDirty` の `{x0,z0,x1,z1,gen,full}` を拡張する。
  - `Minimap.prototype._drawDirtyInk(rec)` はマップ座標を `toCanvas` でピクセル矩形へ写し、エンボス隣接のため1px（`HALO`）、バイリニア参照のためセル2つ分（`CELL_PAD=2`）を膨らませ、消費したバウンディングだけを戻す（`rec.gen === gen` のときのみ＝スナップショット安全性）。
  - 大きなダーティ領域 `(x1-x0)*(y1-y0)*BANDS >= W*H` は既存の3バンド全描画へ、それ以外は `_drawInk(y0, y1, x0, x1)` へ。
  - `tickHidden`（ミニマップOFF）を上書きし、ダーティ領域を O(1) の全体無効化へ畳む。

配線：`patches/splatoon3/adapter.mjs` の `adaptSource` 先頭で `adaptMinimapDirty` を適用。`patches/splatoon3/runtime/install.mjs` で `Minimap` を import し `installMinimapDirty(api)` を `installWeaponsFidelity` の直後に呼ぶ。既に適用済みのツリーを再合成しても壊れないよう、アダプタは全フックが揃っていれば冪等に素通りし、アンカー欠落/重複（上流ドリフト）では失敗する（`patches/local-quality/first-touch-adapter.mjs` と同じ流儀）。

## 補正（fb7: 視覚リグレッション + 第1パス最適化）

親レビューで具体的な視覚リグレッションが指摘され、FB6 の許容（「再描画矩形の外側のフラッシュアルファ残存を許可」）は**不採用**とされた。

- **リグレッション**：部分 `_drawInk(y0,y1,x0,x1)` は現在のダーティ矩形の内側しか `fd`（flashImg）アルファを消さない。古い非ゼロフラッシュが矩形外に残り、新しい塗りが `if (flashes && !this._quiet) this.flashT = 0;` でグローバル `flashT` をリセットすると、`flashT<0.45` の間 `globalAlpha=(1-flashT/0.45)*0.85` で古いフラッシュが**蘇る**。ネイティブの全体バンド経路は処理する全行の古いアルファを消す。
- **修正（bounded historical flash cleanup）**：各パス終了時に自分がフラッシュした画素のバウンディングを `this._lastFlashBox` として記録し、次の `_drawInk` 冒頭でその箱だけを `fd[o+3]=0` し、その矩形を bounded に `putImageData` する（前回箱 ⊆ 現矩形ならメインパスが書き換えるためスキップ）。全体所有権リスキャンではなく、**前回フラッシュ矩形 ∪ 現ダーティ矩形の bounded 和集合**のみを扱う。新フラッシュのタイミング（`flashT` リセット、`fd=170`）は不変。
- **第1パス最適化**：アルファ/バイリニア評価を全幅走査から実ハーロ矩形へ限定。エンボスは `al[i±(W+1)]` を読むためハーロ（四方向1px）で全カバー。CPU 訪問画素数は `_alpha` への書き込み回数で計測し、ハーロ面積と厳密一致することを検証（アップロード面積でなく実訪問数）。

## 検証

すべて `node --experimental-vm-modules --test`。ロジック/CPU レベルで、ブラウザ canvas、GPU、Switch 実機は測定していない。

- `patches/splatoon3/tests/minimap-dirty-895.test.mjs` — 13/13 合格（フォーカス比較1回で確認）。アダプタ未適用の基準では従来 2/9。
  - 3ステージで、局所更新の `inkImg`・`flashImg` が強制全描画と毎ステップ**バイト一致**。再描画矩形の**内側も外側も**一致（`fd.inside === 0 && fd.outside === 0` + 全バイト deepEqual）。従来は矩形外の差を許容していた。
  - **2つの遠隔領域を時間を隔てて連続塗り**（3ステージ）：フラッシュ寿命 0.45s を超えてから遠端へ塗っても、旧フラッシュの残留が蘇らず、affected union の内外とも全描画基準と一致。クリーンアップのアップロード面積は2つの局所矩形に留まる（`< W*H/2`）。
  - **第1パス CPU 訪問数**：`_alpha` 書込みカウンタがハーロ矩形面積と厳密一致し、全幅走査より厳密に小さい（実訪問画素数の計測）。
  - 描画 putImageData 面積は定常交戦フィクスチャで全描画の **5% 未満**（`partialArea < fullArea * 0.05`）。
  - 全体無効化4種（`clear()` / 視点チーム反転 / チーム色 / テーマ）が全描画すること。
  - 全ステージ塗りのような広域変更は**3バンド経路**（幅=全幅, 高さ<全高, `_band=1`）にフォールバックし、単発全描画と ink が一致。
  - OFF では `tickHidden` がラスタも ImageData も実行せず、`inkDirty.full=true`・バウンディングが O(1)、復帰で全体1回。
  - 窓内複数スプラットの合流で更新1回・和集合内に継ぎ目なし。
- 基準（アダプタ配線を戻した状態）: FB6 時点の `BEFORE` ログ 2 pass / 7 fail、EXIT=1。
- 隣接制御（FB6 時点）: `patches/local-quality/tests/minimap-resources.test.mjs`（#419）10/10、`patches/splatoon3/tests/adapter.test.mjs` 10/10、`patches/practice-range/tests/isolation.test.mjs` 7/7、`patches/network-replication/tests/contracts.test.mjs` 13/13。fb7 補正は指示によりフォーカス比較1回のみ再実行（隣接制御は未再実行）。

ログとハッシュ: FB6 は `/mnt/workspace/inkwave-batch-c/evidence/additional-100/r54-895/`、fb7 補正は同ディレクトリ `fb7-895/` と `EV/fb7.json`。

## 本家（スプラトゥーン3 Ver.11.3.0）との比較

観察可能な挙動として、本家のコーナーマップは塗り替わった領域だけが順次更新され、常時ステージ全体を再走査しない。本品もこれを満たす（局所塗りは局所更新、変更のない領域は再処理しない）。一方で本家内部の更新単位・フレーム値・フェード/エンボス処理は公開されておらず、こちらへ数値として写していない。ミニマップOFF時にライブ更新を行わないこと、チーム色/テーマ/ステージ変更で全体を再描画することも本家の観察挙動と矛盾しない。

**未確認**：ブラウザ実表示、GPU/Canvas2D の実コスト、Switch 実機でのフレーム比較。したがって速度の実測値（ms/フレーム等）は主張しない。この修正の主張は「出力が全描画と一致し、処理面積が有界」というロジック/CPU レベルの事実に限る。

## 制約

- `inkwave-public/` の原生ファイルは不変。`runtime/weapons.mjs`、generic footprint264 には触れていない。
- `patches/splatoon3/profile.json` と `upstream-lock.json` は無変更（`git diff f31f5da4 --` が空）。
- 変更ファイル（この作業のみ）: 上記アダプタ/ヘルパ/テストと本レポート群。
