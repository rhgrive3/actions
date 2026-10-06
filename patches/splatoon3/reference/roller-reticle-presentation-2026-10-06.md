# Roller 照準の表示（#724）と転がり塗りの幅（#649）

参照版は Splatoon 3 Ver.11.3.0。数値の一次抽出データは Leanny/splat3 のコミット `7280ff9cde8bb1c5dcef46c700c326471584d2e6` に固定している。

## 1. Roller の照準表示（#724）

### 差分

変更前のインストール済み HUD は `HUD._buildReticle()` の `kind === 'roller'` 分岐で、
Roller 専用の `viewBox="-80 -40 160 80"` の SVG を出力し、`styles/hud.css` の
`.iw-ret__svg.wide { left: -80px; width: 160px; }` が 160 px を固定していた。描画される要素は次の 4 点。

- 中央ドット
- SVG x = -46 から -60 の左ブラケット（角丸を含む）
- 対になる右ブラケット（x = +46 から +60）
- x = -30 から +30 を結ぶ幅の広い下部弧

マウス / ゲームパッド / タッチ / ジャイロのどれでも同じ分岐を通るため常にビルドされる。

### 本家の根拠

- 任天堂公式 Splatoon 3 ローラー紹介ページ
  https://www.nintendo.com/jp/ichikara/av5ja/index.html
- 任天堂公式 Splatoon 3 ローラーのゲームプレイ参照画像
  https://www.nintendo.com/jp/ichikara/av5ja/photo/01/027.jpg
- Issue #724 本文: 本家イメージは「照準点まわりのコンパクトな中央マーカー」を示し、
  この左右ブラケット対と下部弧は含まれない、と記録されている。

Issue 本文自身が「本家の正確な直径・線長・不透明度・横振りや縦振り中の一時的な表示差は主張しない」
と明記しているため、本変更では上述で確認できる輪郭（wide ブラケットと下部弧の除去）のみを扱う。

### INKWAVE の実装箇所

- `patches/splatoon3/adapter.mjs` の `src/ui/hud.js` 接続 `compact Roller reticle`。
  Roller 分岐を共通の 80 px キャンバス上のコンパクトな中央マーカーに置き換える。
- `patches/splatoon3/tests/issue-724-roller-reticle.test.mjs` が installed ソースから
  `HUD._buildReticle` を実行して DOM 出力を検証する。

`inkwave-public/` は編集していない。`styles/hud.css` の `.wide` 規則もそのまま残り、
出力されなくなった要素に一致しなくなる。

### 再現操作

Roller を装備し、未攻撃のまま立ち止まる。旧実装では中央ドットと左右ブラケット対と下部弧が
常に表示された。変更後は中央ドットと薄いリング 1 個だけになる。
入力装置別の分岐は無く、4 つの入力すべてで同じ表示になる。

### プレイへの影響

照準の見た目だけが変わり、弾速・ダメージ・当たり判定・塗り幅・可視サイズ・射程は不変。
旧表示は転がり幅と着弾範囲を大きく見せていたため、画面写真による目視審査で転がり幅を
過大評価していた。今後は照準が実際の幅を誤解させる要素を表示しない。

### 確認状態

- 確認済み（ロジックと installed ソース）: wide キャンバス、左右ブラケット、下部弧が
  一切出力されないこと。他のブキの reticle 分岐が不変であること。接続が fail-closed であること。
- 未確認（本家実機が必要）: 本家 Roller 照準のピクセル寸法、線長、不透明度、
  横振りや縦振り中の一時的な表示差の有無。

## 2. 転がり塗りの幅の速度依存（#649）

### 差分

変更前の `WeaponRunner._roller()` は `hs = Math.hypot(a.vel.x, a.vel.z)` を計算するが
転がり塗りには使わず、常に 3 帯（間隔 `w.rollWidth * 0.33`、半径 0.62）を描いていた。
速度に依存するのは音量と震动だけだった。

### 本家の根拠

固定済みの Ver.11.3.0 Roller パラメータ（`profile.weaponsFidelityCompletion.weapons.roller`）:

- `BodyParam.PaintParam.SpeedMax = 0.132`
- `BodyParam.PaintParam.WidthHalfMax = 2.8`
- `BodyParam.CollisionParam.WidthHalf = 1.4`
- `WeaponRollParam.SpeedNormal = 0.108`、`SpeedDash = 0.132`、`DashFrame = 90`

Issue #649 本文が記録する本家挙動: 転がりの塗り幅は移動速度とともに広がり、
左右のサイド飛沫は速度とともに成長する。飛沫は床のみを塗るため、壁を塗るには
ローラー本体との接触が必要である。

本リポジトリの換算 `perFrameVelocityToPerSecond: "*60"`（`profile.calibration.unitConversions`。
`runtime/weapons-fidelity.mjs` が既に `60 * SpawnSpeedBase` を使用）により、

- `SpeedMax 0.132` が `rollSpeed 7.92`
- `SpeedNormal 0.108` が `rollBaseSpeed 6.48`

に対応する。`installRollerPaint()` はこの対応を再導出して検証し、成立しなければ導入を拒否する。

### INKWAVE の実装箇所

- `patches/splatoon3/runtime/roller-paint.mjs`: 固定データの fail-closed バインドと
  `rollerRollPaint()` の単一実装。
- `patches/splatoon3/adapter.mjs` の `src/game/weapons.js` 接続 `speed-dependent roller roll paint`。
- `patches/splatoon3/adapter.mjs` の `src/world/paint.js` 接続 `floor-only splat option` と
  `floor-only splat skips wall faces`。`opts.floorOnly` はサイド飛沫だけが指定する。
- `patches/splatoon3/runtime/install.mjs` が `installRollerPaint` を呼ぶ。
- `patches/splatoon3/tests/issue-649-roller-paint-speed.test.mjs` が実 Roller を 4 速度で走らせる。

モデルは次のとおり。本体の帯は全速度で不変（間隔 `w.rollWidth * 0.33`、半径 0.62）。
速度に依存するのは床のみのサイド飛沫の横位置だけで、
`bodyEdge = rollWidth * 0.33` から `maxHalf = rollWidth * 0.5` まで、
`rollSpeed` に対する比で動く。比 0（静止）では飛沫を出さず、比 1（90F ダッシュ）で上限に届く。
`maxHalf` は `WidthHalfMax` を既存の最大幅校正 `w.rollWidth` に写した上限であり、
二重の最大値を作らない（#189 が絶対幅を管理する）。
中間曲線は未検証のため非線形の値を置いていない。線形は `weapons-fidelity.mjs` の
`splatlingLaunchSpeed` と同じ最小モデルの扱いで、任天堂コードの復元主張ではない。

### 再現操作

平らな床で Roller を転がし、`kind: 'roll'` の paint 呼び出しの横位置と半径を記録する。
低速、通常（`rollBaseSpeed`）、ダッシュ直前、ダッシュ（`rollSpeed`）の 4 条件で比較する。
ダッシュ時は通常時より外側まで床を塗る。本体の帯幅は 4 条件で同一である。

### プレイへの影響

- 低速や開始直後の転がりの塗り幅が狭くなり、90F ダッシュ後は最大幅になる。
- ダッシュ遷移が塗り幅に反映される。接触ダメージ幅は不変。
- 本体の帯は不変なので壁を塗れる範囲は変わらない。サイド飛沫は床のみなので、
  本体が触れない壁を転がりだけで塗ることはない。

### 確認状態

- 確認済み（ロジックのみ、実 Actor と実 WeaponRunner）: 速度に対する幅の単調増加、
  ダッシュ時の上限到達、低速時の狭さ、本体帯の幾何が不変であること、
  飛沫の左右対称性と床限定、`rollSpeed`、`rollBaseSpeed`、`rollDashTime`、`rollInkPerMeter`、
  `rollDamage` の不変、reset 後の復帰、同一入力での決定性。
- 未確認（本家実機が必要）: サイド飛沫の実効幅の絶対値、`WidthHalfMax` からワールド座標への係数、
  中間速度域の曲線形状、ブラウザ実描画での見え方。
- 残る制約: `floorOnly` は記録パケットに載らないため、ネットワーク対戦でリモート側が
  サイド飛沫を再生する時は壁の抑止が効かない。プロトコルの書き換えは本件の範囲外。