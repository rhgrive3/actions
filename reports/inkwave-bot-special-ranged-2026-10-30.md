# Ranged special bot input policy (2026-10-30)

対象は公開版 `inkwave-public/` にビルド合成される `patches/splatoon3/runtime/bot-special-ranged.mjs`。比較基準は Splatoon 3 Ver.11.3.0 と既存 INKWAVE runtime。AIの判断距離・認知記憶・射撃許可は INKWAVE の heuristic であり、本家CPUや本家の内部判断値を再現したという主張ではない。効果、ダメージ、インク、ゲージ、クールダウンは変更しない。

## 閲覧した本家資料と対応

2026-10-30、Web openで以下8ページの本文・操作/運用節を直接閲覧した。シェルのHTTP取得は403だったため、Web取得へ切り替えた。ページごとの性能欄の版は11.3.0、5.1.0、4.1.0、10.0.0等が混在するため、AI判断の根拠は操作仕様と弱点に限定した。数値更新は行っていない。

| 対象 / Wiki | 操作の理解 | INKWAVEでの変更 |
| --- | --- | --- |
| [ウルトラショット](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ウルトラショット) | ZRで最大3回。照準を合わせて直接当てる必要がある。 | 固有射程と照準許可を使い、既存の長押しリピートとwindupを維持。通常メインの短い射程で停止しない。 |
| [マルチミサイル](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/マルチミサイル) | レティクル内の敵をロックして発射。壁越しロックも可能。 | 実runtimeのlock previewに対象が存在し、照準が落ち着いてからZR。新たな隠れ敵探索はせず、active中の直前視認点のみ最大0.8秒保持。 |
| [ジェットパック](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ジェットパック) | 浮遊しZRでランチャー射撃、終了時は発動地点へ戻る。長距離は弾速を考えた偏差が必要。 | 安全な発動地点、16〜24 WUの交戦距離、実弾の30 WU限界と偏差照準を使う。 |
| [ナイスダマ](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ナイスダマ) | 自身/味方のナイスで充電し、最大まで溜めて投げる。途中は位置固定。 | runtimeのchargeとcheer cooldownを参照して自充電。ready後、照準済みのR hold/releaseで投擲。既存飛翔の重力/水平減衰を考慮して照準する。 |
| [メガホンレーザー5.1ch](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/メガホンレーザー5.1ch) | 2本×3回のロック、発射後は自動追跡し、メイン等を併用可能。 | 3ロックまで照準追従し、実際の操作解除後は通常メイン入力を復元。直前視認点の短い記憶以外は透視しない。 |
| [キューインキ](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/キューインキ) | ZR保持で正面を吸引。後方/側方に弱く、発射モード移行後はZR解除で反撃。 | 敵方向に継続吸引して距離を保持。exhaleへの切替と既存20F待機、照準を確認して解除。敵を見失った瞬間の解除誤射を防ぐ。 |
| [カニタンク](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/カニタンク) | ZR連射、R砲撃、ZL球体。砲撃は連射加速をリセットし、球体は搭乗者を保護。 | 16〜26 WUを保ち、平時は連射を維持。近距離の削れた敵へ砲撃し、接近/背後/低HP被弾/近接ボムは球体退避。 |
| [ショクワンダー](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ショクワンダー) | Rで地形へ移動、ZRでメイン、燃料が尽きると発動地点へ帰還。 | 発動地点の床/水際を確認し、実raycastで確認した安全な床へhook。ready中だけ射撃/次hook、空振りや飛行中の入力を抑止。 |

## 検証範囲

専用テストは実際の公開Actor、WeaponRunner、special runtime、ProjectilesをproductionComposition経由で読み込み、AIが作る入力を渡す。テストの照準補助は要求方向を直接反映するため、本家実機や実ブラウザの照準精度測定ではない。統合されたBotBrainのspringとブラウザ確認は親作業で別途扱う。

再現: 射程内の敵を置き、特殊ゲージを満たして通常Actor `_startSpecial()`、フレームごとにdriver→Actor update。敵の非表示、死亡、味方化、大きい段差、未照準、空のhook ray、複数dtを試す。Trizooka 3回、ミサイル実ロック/10発、ナイス自充電/R解除、キューインキ吸引→反撃、カニ連射/砲撃/球体、ショクワンダー移動phase、メガホン3ロックを実イベントで観測する。

コマンド: `node --check patches/splatoon3/runtime/bot-special-ranged.mjs`、`node --experimental-vm-modules --test patches/splatoon3/tests/bot-special-ranged.test.mjs`。結果: 基本9件全pass（31.3秒）。追加のhuman camera背面時bot lockと、実projectile stepによるナイスダマ着弾位置の2件もpass（3.1秒）。合計11件を確認。`node --check` 2 runtimeと `git diff --check` もpass。

追加の限定修正: `all-specials.mjs` のmissile selectionはhuman cameraをbotへ適用していたため、human視点が後ろを向くだけでbotの正面lockが消えていた。botのみ既存の自身aim coneへ分岐し、human cameraの選択処理は維持した。

未確認: Switch実機比較、操作モデルの厳密一致、実ステージ全形状のhook安全性、対人の勝率。基礎special runtimeの既存calibration/未確認値はそのまま残る。
