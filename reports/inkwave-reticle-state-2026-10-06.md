# INKWAVE レティクル状態の比較記録 (2026-10-06)

対象: #711 チャージャー HUD の射程内判定、#709 ブラスター拡散レティクル。参照バージョンは本リポジトリの比較基準 Ver.11.3.0。ブキは Splat Charger / Blaster 系、ギアなし、通常の対戦操作条件。公式の数値資料がないフレーム値・ピクセル値は断定していない。

## #711 チャージャー HUD の inRange がフルチャージ射程固定

| 項目 | 内容 |
|---|---|
| 本家の根拠 | Inkipedia「Splat Charger」: 弾の飛距離はチャージ量に応じて 10.75 から 25.75 units へ連続的に伸びる（Issue #711 の引用どおり）。フルチャージ以外は途中の距離で消える。INKWAVE が取り込んだ抽出パラメータ `MoveParam.DistanceMinCharge / DistanceMaxCharge / DistanceFullCharge`（9.033 / 24.037 / 24.037）は別スケールの値であり、Inkipedia の数値と同一視していない。 |
| INKWAVE の実装箇所 | 判定: `inkwave-public/src/game/player.js` `PlayerController.computeAim()` の末尾（上流は `w.rangeMax` 固定）。修正: `patches/splatoon3/adapter.mjs` の `src/game/player.js` 節で `replaceOnce` により、`weaponRunner.charge`（0〜1 にクランプ。イカ状態のチャージキープ中は保持中の `s3Stored.charge`）から求めた射程へ置換。射程の式: `patches/splatoon3/runtime/weapons-charger-flight.mjs` の `installChargerFlight` 内 `reachFor`。`begin` と新しい `Projectiles.prototype.chargerReach(charge)` が同じ式を使う。チャージャー飛行が未導入の場合は上流の `lerp(rangeMin, rangeMax, charge)` に相当する式へ戻る。 |
| 再現操作 | チャージャーを持ち、チャージせずに、最小射程と最大射程の中間距離にある地点へ照準を合わせる。修正前は HUD が「射程内」（`is-far` なし）を示すが、ZR を即離すと弾は最小チャージ距離で消える。フルチャージまで溜めると射程内になる。 |
| プレイへの影響 | 未チャージ・低チャージでは届かない地点でも射程内と表示され、撃つ前の射程判断を誤らせていた。修正後は現在のチャージ量に応じて射程内表示が切り替わり、チャージが進むと射程内に移る（単調）。チャージしていない待機中は最小射程で判定する（タップ撃ちの射程）。チャージキープ中は保持チャージの射程で判定する。待機中の表示が本家でどうなるかは未確認。`+ 0.5` の許容幅、ローラー（6）、その他のブキ（`range \|\| 12`）の判定は変更なし。弾道・数値・チャージ速度も変更なし。 |
| 確認状態 | **ロジックのみ確認済み**: `patches/splatoon3/tests/charger-hud-reach.test.mjs`（実 Actor、実 Projectiles、導入済み飛行ジョブの `range` と `chargerReach` が c = 0 / 0.5 / 0.998 / 1 で一致、単調性、非チャージャー不変、導入前の lerp 代替、main 構成で charge 0 が射程内になる否定対照）。**ブラウザ上の実表示は未確認**。**本家実機（Switch）での射程内表示の挙動比較は未確認**。HUD の is-far 遷移の見た目（不透明度 .42 等）は上流のままで、本家との一致は未判定。 |

## #709 ブラスターの拡散がレティクル内側の円まで拡大する

| 項目 | 内容 |
|---|---|
| 本家の根拠 | Inkipedia「Blaster」のレティクル説明: 外側と内側の円で構成される。拡散（ブレ）を表す外側が変化し、内側の円は固定、という Issue #709 の引用に従う。ピクセル寸法や拡大率の公式値は未取得で、数値は断定していない。 |
| INKWAVE の実装箇所 | 上流: `inkwave-public/styles/hud.css` `.iw-ret--blaster .iw-ret__svg { transform: scale(calc(1 + var(--sp, 0) * .012)); transition: transform .1s linear; }` が SVG 全体（外周 r=23 と内側 r=9）を拡大。`--sp` は `src/ui/hud.js` `_updateHud` が `.iw-ret` に設定。修正: `patches/splatoon3/ui.css`（ビルドで `index.html` の `styles/ui.css` 後に追加リンクされる）で SVG の transform を無効化し、`circle.iw-ret__ring:not(.thin)`（外周のみ）に同じ係数・同じ transition で `transform-box: fill-box; transform-origin: center` を適用。半径、破線パターン、係数 .012、イージングは変更なし。 |
| 再現操作 | ブラスターを装備して連射し拡散を増やす（`--sp` が増える）。修正前は内側の細い円も外側と一緒に大きくなる。修正後は外周だけが広がり、内側の円は静止サイズのまま。 |
| プレイへの影響 | 内側の円が拡散の目安として動いてしまい、静止時の照準中心の大きさが読めなかった。外周のみが拡散を示す。当たり判定、弾の散らばり、ダメージには影響しない（表示のみ）。 |
| 確認状態 | **ロジックのみ確認済み**: `patches/splatoon3/tests/blaster-reticle-css.test.mjs` が実 CSS テキストのカスケード（詳細度と記述順）で、SVG の transform が none、外周のみが `--sp` の scale を持ち、`.thin` 内側の円は transform なし、他のレティクルは不変であることを確認（上流 hud.css のみでは SVG 全体が拡大する否定対照付き）。**ブラウザでの getComputedStyle と実際の見た目は未確認**。**本家実機（Switch）とのレティクル見た目の比較は未確認**。ストロークの太さが外周の scale に伴い変化する点は従来の SVG 全体の拡大と同じ挙動で、本家との一致は未判定。 |
