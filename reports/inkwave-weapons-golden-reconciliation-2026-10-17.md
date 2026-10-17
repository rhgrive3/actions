# INKWAVE: 塗り輪郭・Spinner 初速の回帰基準の更新

## 対象と判定の範囲

2026-10-17。対象は `inkwave-public/` と production adapter composition。
この変更は検証用 script・fixture の更新であり、runtime の変更を含まない。

採取基点は `d0d64b7405611cc9afe93ee370a6e647bfd2e703`。
PR #1512 の Roller 発生位置、PR #1525 の主弾・飛沫・足元の塗り輪郭、
同日の Heavy Splatling 初速率修正を含む。
初速の根拠と未確認項目は
`reports/inkwave-spinner-kinematics-source-audit-2026-10-17.md`、
輪郭の参照画像・条件と限界は
`patches/splatoon3/reference/main-ink-footprints-2026-10-16.md` に記載している。

ここで固定する値は INKWAVE の deterministic regression receipt。
本家 Splatoon 3 の測定値ではない。11.3.0 の抽出パラメータは寸法・初速率等の
参照元だが、輪郭の control sections は画像から調整した INKWAVE の形状であり、
Nintendo の stencil texture を取得したものではない。実機一致は未確認のままとする。

## 古い基準を残したまま、意図した差を分離する

次の既存 archive は一切変更せず、SHA-256 を検査し続ける。

| Archive | 引き続き拘束するもの |
| --- | --- |
| `weapons-fidelity-9c070329.json` | 15 ケースの旧 birth・hit sweep・CPU scoring cells |
| `weapons-fidelity-roller-birth-8e55bfcb.json` | 承認済み Roller 発生位置修正後の 2 ケース |
| `slosher-paint-9c070329.json` | Slosher の旧 source-circle と generic mask、旧 scale・depth の負対照 |

追加した `weapons-physical-bf9a8a92.json` は、独立した旧チェックアウト
`bf9a8a9270b349a3b20c9550ff6ed78a61c9e729` から採取した。
全 15 ケースについて、旧 birth hash と scoring hash が既存 9c070329 archive と
一致したことを確認し、この関係も毎回の検証で要求する。
現在の runtime を改変して旧値を生成したものではない。
この fixture は全 birth fields、全塗り stamp、全 terrain impact、birth 時と
全飛翔完了時の乱数呼出回数を保存する。

新しい `weapons-fidelity-main-20261017.json` は実際の minified build から
採取した全 15 ケースの receipt。全 birth・全 hit sample・全 scoring cell に加え、
全 stamp と全 terrain impact の hash も固定する。ただし新しい値を採取しただけで
合格にはせず、以下を独立した追加条件とする。

1. Spinner 以外の birth と全 hit sweep は従来の archive に一致する。
   Roller 2 ケースだけは承認済み 8e55bfcb archive を参照する。
2. Roller の raw birth 座標に承認済み差分の逆変換を適用すると、全 serialized
   birth fields が 9c070329 archive に戻る。速度・角度・半径・damage・life・
   見た目に使う乱数値・弾数の差は許可しない。
3. Spinner の旧速度から同じ乱数 quantile を逆算し、新速度が下記の率の式に一致
   することを確かめる。方向と速度以外の全 birth fields は旧値と一致する。
4. 全 15 ケースの birth 時と全飛翔終了時の乱数消費を旧値に拘束する。
5. Spinner・Roller 以外では、stamp の位置・半径・伸長・seed・時刻、全 terrain
   impact が旧 fixture と完全一致する。新しい輪郭名と、その輪郭が塗った面積だけを
   比較から外す。
6. 意図した mask の変更を取り消した負対照は、従来の全 scoring cell に戻る。
7. unminified source composition と minified build は、全 birth・stamp・scoring
   cell・paint bounds、および hit 境界とその次の標本で一致する。

## Spinner の独立した速度の確認

旧式が `v_old = v_base + 7.2 q` だったため、旧 receipt の速度の大きさから
`q = (v_old - v_base) / 7.2` を求め、現在の結果に
`v_new = v_base (1 + 0.12 q)` を要求する。
検査は production の quantile helper を呼ばない。
丸め済み旧 receipt の逆算誤差だけを考慮し、速度は `1e-7`、方向は `1e-8` の
絶対許容差を用いる。元の signed-power quantile・median bias と 1 回の RNG
呼出を維持することは、別の Spinner source-backed unit tests でも確認している。

この固定 seed での部分チャージの `v_base` は 86.625、1 周および full は 126。
今回の sampled quantile が負なので、この 3 ケースの射程標本は少し短くなる。
全ての乱数結果で射程が短くなるという意味ではない。

| ケース | 旧 hit range → 新 | 旧 full-damage range → 新 | 旧 paint max Z → 新 |
| --- | --- | --- | --- |
| 部分 charge 0.25 | 14.7 → 14.6 | 14.0 → 14.0 | 16.625 → 16.375 |
| 1 周 charge 2/3 | 20.1 → 19.9 | 19.4 → 19.2 | 21.875 → 21.875 |
| full charge 1 | 20.1 → 19.9 | 19.4 → 19.2 | 21.875 → 21.875 |

単位は INKWAVE world unit。ターゲットは既存 PLAYER capsule、距離の標本間隔は
0.1、塗りは cell size 0.25 の平面 grid。この表を本家の射程表として使わない。

## 独立した塗り oracle

`scripts/lib/source-paint-oracle.mjs` は production の profile generator・mask・
raster・culling・geometry helper を import しない。
PR #1525 の固定 edge bytes を別 fixture に保存し、128 columns × 5 profiles の
左右輪郭を scalar interpolation で読む。fixture 全体の SHA-256 と、元の
4 KiB RGBA8 配列を再構成した SHA-256 の両方を検査する。

各 stamp について、床面と塗り sphere の交差半径、heading、前後で異なる stretch、
記録された Float32 seed の最下位 bit による左右反転、byte の隣接 2 列補間を
独立に計算し、平面の全 cell center を走査する。production の bounding-box
候補抽出を再利用しないので、culling が輪郭を切ってしまう不具合も検出できる。
新 profile を持たない source stamp は従来の circle / half-ellipse で検査する。

一般の generic stamp は以前の mask をそのまま使う。その cell の変化は実際の
grid 差分から加え、generic mask 自体を独立に再現したとは扱わない。
15 ケースには `ink-shot`、`ink-slosh`、`ink-flick` が含まれ、Brush や roll-contact
の profile はこの 15 ケースでは実行しない。これらは別の paint/profile tests の対象。

### Roller の足元 1 stamp

調査中、`footprint: null` だけでは横振りの旧 cell hash に戻らないことを確認した。
原因は PR #1525 の `weapon-edgecases.mjs::paintRollerReleaseFootprint` が、
発射時の足元 1 stamp を generic から source-splash + ink-flick に変えたこと。
同時に heading を付けているが `stretchAmt: 0` なので物理的な伸長はない。

負対照ではこの 1 stamp のみ旧 generic kind・heading なしへ戻し、後続の飛翔・
着弾 stamp は profile だけを外す。このとき足元の位置・半径・seed・team・時刻は
旧 bf9a8a92 の値と完全一致し、他の全 stamp は現在の物理記録と完全一致する。
結果は横振り・縦振りとも、既存 8e55bfcb archive の全 scoring cell に一致した。
archive の値を変更したり、横振りだけ検証を省いたりしていない。

## Slosher の独立した負対照

`scripts/lib/slosher-paint-receipt.mjs` は native の 9 発の生成、落下飛沫、地形への
着弾を実行する。各着弾の raw PaintParam / AfterPaintParam から distance・drop
height に応じた radius と depth を別計算し、owner と 1 回だけの着弾 stamp を確認。
nearest 1 + flight splash 9 + impact 9 の 19 stamps と、全飛翔の RNG 35 回を要求する。

旧 0.2 倍 wrapper と、depth の base width を二重に足す旧式を負対照として実行し、
現在の輪郭・旧 source-circle・旧 generic のそれぞれで保存値を確かめる。
負対照は塗り projection だけを変え、native の着弾記録は一致する必要がある。

| 投影条件 | 新輪郭の塗り面積 | 旧 source-circle | 旧 generic | 新輪郭 max Z |
| --- | ---: | ---: | ---: | ---: |
| 現在の正しい寸法 | 73.0625 | 75.25 | 79.875 | 17.375 |
| 旧 0.2 倍 wrapper | 16.375 | 16.8125 | 17.4375 | 14.875 |
| 旧 depth 二重加算 | 100.125 | 103.6875 | 109.5625 | 21.375 |

面積は INKWAVE world unit²、CPU scoring grid の cell center 判定。
source-circle / generic の 6 組は既存 archive の全 stamp・impact・cell hash に
戻ることまで検証する。新輪郭が旧 circle に戻る退行も、この比較で失敗する。

## 実行結果

採取 build の content hash:
`7582e8bcaa8c3742a8179a5978d6d61ad8a9103402ebc3842a08302c382891c2`。

```sh
node --experimental-vm-modules scripts/check-inkwave-weapons-fidelity.mjs --site _site
INKWAVE_BUILT_SITE=_site node --experimental-vm-modules --test --test-isolation=none scripts/tests/inkwave-slosher-paint-golden.test.mjs
```

- weapons-fidelity: 15 ケース通過。3 network modes、6 wall-drop cases、既存の
  burst の重複検出 control・発射 cadence・ink 消費チェックも通過。
- Slosher: 3/3 通過、skip 0。unminified source と minified build の全 receipt 一致。
- 旧 archive 3 files は変更なし。runtime の変更なし。

その後の統合 build
`4808b21696ade0732e5d035c90bce88f683c09f06c5c4ba4cbad7ea752280210`
でも両 command が通過した。統合側の jump lifecycle 修正は、この固定 seed・
通常発射 15 ケースの birth・着弾・塗り・hit sweep を変えないことを確認した。

この script 群は固定 60 Hz の平面回帰検証。30/60/120 Hz の入力・移動・射撃、
ブラウザ GPU と CPU の画素比較、Switch 実機との比較はそれぞれ別の検証として扱う。
単独のロジック検証を実機一致の証拠にはしない。
