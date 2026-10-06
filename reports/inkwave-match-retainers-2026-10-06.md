# INKWAVE 長時間セッションのリテイナー修正 (#747 #749 #730 #733 #629 #630)

## スプラトゥーン3との比較

**ゲームプレイ挙動の変更なし。** 対象は、ページ寿命を持つオーナー(Projectiles、BossHud、CameraRig、Game)が、破棄済みマッチの Actor / Boss を参照し続ける問題の解放処理のみ。歩行・射撃・塗り・被弾・復活・カメラ構図/タイミングの数値と判定は変えていない。本家との挙動差分記録 `reports/inkwave-splatoon3-behavior-2026-10-02.md` は更新しない(未確認項目の状態も変更なし)。

比較した範囲: 死亡カメラ(キラーを見る)の見え方は、`spectate.pos` / `spectate.from` を残すため従来と同じ。チャージャーのレーザーサイトはオンライン退出で描画が止まるようになるが、これは「居ない Actor のサイトが残る」不具合の修正で、本家のチャージ挙動との比較対象ではない。

## 実装方針

- `inkwave-public/` と `game/` は無変更。ビルド時アダプタ `patches/local-quality/match-retainer-adapter.mjs`(`adaptMatchRetainers`)が `src/game/match.js` / `weapons.js` / `cameraRig.js` に文字列置換(`replaceOnce`)で挿入する。`adapter.mjs` の `adaptQualitySource` から呼び、`IDENTITY_FILES` に登録済み。
- 新規ランタイムモジュールは追加しない(起動プリロード予算に影響なし)。
- 既存のアンカー(`  dispose() {`、`    this.bossMode?.dispose(); ...`、`  clear() {`、`    for (const p of this.list) this.pool.push(p);`)は原文のまま残し、前後に挿入する。他ブランチの同アンカー置換と合成できる。
- すべての解放は、廃棄するマッチ自身の roster / boss との同一性確認つきで、冪等。新しいマッチの参照は消さない。`Match.dispose()` 内の解放はキャラクター破棄より前に走る。

## 項目別

| # | 保持経路 | 修正箇所 (アダプタ) | 再現 | プレイへの影響 |
|---|---|---|---|---|
| #747 | `Projectiles.vols[i].hits`(32 スロットのリング)が Actor / Boss を保持。`clear()` は空にしない | weapons.js `clear()` で `this.sights.clear();` の直後に `v.hits.length = 0`。リングの配列オブジェクトは再利用(割り当てなし)、投てき単位の重複排除は不変 | スロッシャー等で被弾者を記録 → マッチ遷移 → `vols[*].hits` に旧 Actor が残る | 表示上の変化なし。長時間のメモリ保持のみ |
| #733 | `Projectiles.sights: Map<Actor, Mesh>`(チャージャーのレーザーサイト)。`Match.removeActor` では解放されず、退出した Actor のサイトが残りの試合中描画される | weapons.js に `releaseActor(a)` を追加(サイトの scene 除去、material dispose、Map 削除、`vols[*].hits` からの除去。共有 `ribbonGeo` は dispose しない)。match.js `removeActor` で `G.projectiles?.releaseActor?.(a)` を呼ぶ | オンライン(humans-only)でチャージ中のチャージャーが退出 | 退出者のサイトが画面に残り続ける不具合が消える |
| #749 | `BossHud.boss` が破棄済み Boss を保持。`setMode(false)` は次の非 attract 開始まで呼ばれない | match.js `dispose()` の先頭で、`G.hud.boss.boss === this.boss` のときだけ `setMode(false)` | ボスマッチ → リザルト → メニュー | 古い Boss の HUD 状態が残らない。新しい Boss は消さない |
| #730 | `CameraRig.spectate.actor`(キラー)が死亡時に設定され、復活 (`follow`)・`orbit`・`cinematic`・`overview`・マッチ破棄で解放されない | cameraRig.js の 4 メソッド先頭で `spectate.actor = null`(`pos` / `from` は保持)。match.js `dispose()` で roster 所属のときのみ解放 | 死亡 → 復活 / リザルト → メニュー | ブレンド映像は不変 |
| #629 / #630 (重複) | `Game._attractFollow`、`CameraRig.target`、`CameraRig._prevTarget` が破棄済みマッチの Actor を保持 | match.js `dispose()` で roster 所属のものだけ null 化 | attract → ライブ、ライブ → リザルト → メニュー attract orbit | カメラ構図/タイミングは不変 |

null 化の安全性(コード読み): `CameraRig.update()` は `mode === 'follow' && this.target` のときだけ `_follow` を呼ぶ。`main.js` は生存中のローカルが `rig.target !== m.local` なら `rig.follow(m.local, true)` で再追従する。`_updateAttract` は `_attractFollow` が truthy のときだけ参照する。

## 検証状況

- ロジック単独テスト: `patches/local-quality/tests/match-retainers.test.mjs`(13 件)。実際の合成済み `match.js` / `cameraRig.js` / `weapons.js` / `hud-boss.js` を `vm.SourceTextModule` + スタブで読み込む。#747 と #749 と #733 と #629/#630 には、アダプタなしの合成での陰性対照(バグ再現)を含む。
- **ブラウザ実動作・ヒープスナップショットは未実施。** 「リテイナーが実際に解放され GC される」ことの実機確認は未確認のまま。単独のロジックテストを実機比較の代用にしていない。
- 本家との実機比較: 対象外(挙動変更なし)。
