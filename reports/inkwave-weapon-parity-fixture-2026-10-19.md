# 武器 parity 検証の fixture 寿命を整理

## 範囲と維持する検査

公開版は既存の Splatoon 3 Ver. 11.3.0 比較を継続する。この差分は検証用 object の寿命だけで、歩行・泳ぎ・射撃・塗り・被弾・復活などのゲーム挙動を変えず、未確認の実機一致を新たに確認済みとはしない。

変更は `weapon-empty-part-draw.test.mjs` の fixture 寿命だけ。ゲーム runtime、cache 方針、髪・キャラクター・武器の形状や描画、timeout は変更しない。最初の実 Character の A/B 組を最後まで保持し、以降も各武器で独立した組を生成・破棄する。最後の `finally` で保持分を解放する。独立性検査は WeakSet と生成数 counter を使い、破棄済み全 object を強参照しない。

- 全 65 武器、130 独立 Character / Skeleton、near/far 全組合せ、30/60/120 Hz
- 元の 19 箇所の assert 呼出しを変更せず、全 geometry byte、muzzle、155 個のゼロ面積 placeholder、animation channel、描画属性を比較
- 各武器の `setColor`、実 `warmAll`、可視性復元
- 追加で共有 style geometry の byte 不変、独立 instance、両 realm の最終 cache entries/liveUsers がゼロであることを検査

最終解放後の cold 再生成は既存 [issue-483.test.mjs](../patches/splatoon3/tests/issue-483.test.mjs) が実 Character で検査する。旧 geometry と異なる新 object、各一回の dispose、rematch/quality 切替、24 回の fresh build、WeakRef/GC 回収を含む。この専用 suite は変更しない。

## 同一環境での比較

公式 main `161f8f410ac614c12c826e3255d293daae20cc12` の依存を Git blob で照合した source fixture と Node 24.19.0 を使用。対象 test は main `00b8994711809ba6d0469723c858ddef6805e2ae` でも同じ blob `23e34d918eb2aa06ce45c53550b9d5bf9ebd1364`。

原状は各組を破棄するたび参照数がゼロとなり、正常な参照カウント cache が同一 style を再生成していた。3 key ごとの geometry hash は全回同一だった。

| 測定 | 原状 | 候補 |
| --- | ---: | ---: |
| test 実行時間 | 245.49 秒 | 35.97 秒 |
| owned geometry build | 260 回 | 4 回 |
| process peak RSS | 516.09 MiB | 488.82 MiB |
| 境界 sampled peak heapUsed | 303.73 MiB | 263.70 MiB |

両方 1 test 成功、skip/fail ゼロ。候補は 130 Character / Skeleton、155 hidden parts / 59 affected weapons、最終 entries/liveUsers ゼロ。Character 使い回し、最後の解放漏れ、共有 geometry 改変の負対照は、それぞれ独立性・live0・byte 不変の検査で失敗した。

単発の同環境測定であり、CI や実端末の同率高速化は主張しない。heap は武器境界の sample で連続計測の真の peak ではない。VM fixture の既存 procedural fallback を用いており、実ブラウザ描画・GPU 性能の測定ではない。suite 数・対象・既存 assert・timeout を減らしていない。
