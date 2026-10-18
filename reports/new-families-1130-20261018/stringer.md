# ストリンガー3種・全5派生キット監査（Ver.11.3.0）

基準 `9ef63350385bffee71b3afa0a09290a92e9c862b`。実装コミット `f2a8519`、`29aa372`、`8e578f7`、`2e7cddd`、`4239305`、`612d7ba`。この記録はストリンガー担当範囲であり、GitHub/mainへの統合・CI・ブラウザ全16種の結果は統合担当の記録を参照する。本担当からpush・mergeは行っていない。

本家との完全一致は認定しない。一次パラメータが実際の発射・爆発・ジャンプ・通信再構成に接続されることと、公開資料で確認できる能力差を修正した。Switch実機、骨軌道、原典の省略値・分岐条件は未取得である。

## 原典と根拠の区別

- 一次データ: [Leanny 1130 / pinned commit](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)。`WeaponStringerNormal`、`WeaponStringerShort`、`WeaponStringerExplosion`のJSONを `patches/splatoon3/tests/fixtures/source-1130/weapon/` に保持。SHA-256は既存カタログの原典ハッシュ3件と一致し、テストで検証する。
- LACTの非爆発能力: [Nintendo ブキ解説](https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-choosing-the-right-weapons/)、[Inkipedia REEF-LUX 450](https://splatoonwiki.org/wiki/REEF-LUX_450)。既存 `audio/s3-articulation.mjs` も同じ区別を記録していたが、ゲーム判定側が矛盾していた。共通構造体内の `DetonationParam` の存在を爆発能力と扱わない。
- 明示数値: 各チャージ段階、ダメージ、初速、45F導火、爆風半径、`DamageOffsetY`、`PaintOffsetY`、チャージ中ジャンプ初速上限、弓傾斜の前進/逆回転速度。
- 再構築: 段階間のダメージ・初速に合わせ、射撃後硬直もMin/Mid/Fullの明示端点間を線形補間する。端点の15F等は原典値だが、中間補間・離散フレームへの受付はNintendo実行コードの復元ではない。9FチャージLACTの11.5F硬直→次の整数フレーム12Fで受付、という解釈を専用テスト名・コードコメントにも明記した。
- 未確定: `BowTiltKeepFrame=45`、`BowTiltResetSpeed=2`の発動条件。別担当がsendouの原典パラメータ/説明も確認したが分岐条件は判明せず、Wiki/Inkipediaへのこの環境からの直接アクセスは403。根拠なく「着地後45F固定」を追加していない。

## 修正と実測した差

| ID | 問題・再現操作 | 修正前 | 修正後・検証範囲 |
| --- | --- | --- | --- |
| F04 | 高い敵・段差付近で凍結矢が爆発 | 塗りだけY+0.6。ダメージ半径/LOS/対物/ボスは矢位置基準。原点Y=1、補正後の半径内にいる高所敵に0ダメージ | ダメージ中心Y=1.6を半径・LOS・サブ物体・スペシャル物体・ボスへ共通適用。原点/塗り/視覚位置を勝手に移動しない。再現対象に30ダメージ。壁で遮蔽された1爆発だけを除外し、フルイドの残る4爆発で120ダメージ |
| F08（部分） | 離地・着地中に弓と扇状発射を見る | 射撃は9度/F等の独自時計、表示は接地boolを9/sで別補間 | ローカル表示は射撃側の`bowTilt`を読み、30/60/120Hz描画で表示側から時間を進めない。従来の1.25radのリグ校正値は保持し、骨格の厳密な発射面一致は未立証 |
| S01 | 中チャージ直後に次弾を入力 | トライ/フルイドは12F、LACTは8F。`FreezeFrameMidCharge=15`を無視 | 3種とも明示Mid/Full端点で15F。実際の次チャージ受付・次の3矢生成までテスト。Min端点の12/8/12Fは保持 |
| S02 | LACTをフルチャージし床/壁へ当てる | 3矢とも凍結し45F後に28ダメージの爆発を生成し得る | 全段階でLACTは通常着弾終了、遅延爆発なし。トライ/フルイドのMid/Full凍結・45F導火は維持 |
| S03 | フルチャージを保持してジャンプ | `kind='catalog'`がネイティブ分岐から漏れ、通常の8.4 world units/sで離地 | `JumpHeightFullCharge=.07×60=4.2 world units/s`。3ベース+5派生キットの実Actorジャンプ受付で確認。未チャージ通常ジャンプは維持。空中240Fチャージのフルイドで浮動小数の`charge≈1`が上限を回避する境界も1e-9許容で修正 |
| S04 | 相手の凍結矢を見る | ghostは地形接触で即消失し、導火・爆発VFX/SEが出ない | トライ/フルイドはghostでも凍結・45F後の単一視覚/音響イベントを維持。遅い着弾では元の飛行寿命を越える分だけ原典導火に基づく有限の表示猶予を加算。ghostの塗り/プレイヤー/サブ/スペシャルへのダメージは0 |
| S05 | 相手がジャンプ直後に発射 | リモートの接地補間だけで弓を回し、実際の発射扇と時相がずれる | 既存`s3Catalog`の5値は維持し、同じメタデータobjectに任意の`s3StringerTilt`（実発射時の傾斜角）を追加。0〜ブキの最大角の有限数だけ受理し、現在の相手ブキと一致するときのみ表示へ反映。旧5値のみの送信と任意6値拡張の受信も対応。NaN/Infinity/負値/90超/文字列/nullは表示を変更しない |

S05は発射時のスナップショット同期であり、次の射撃までの相手の全傾斜経路を再現したという主張ではない。最初の6値送信案は旧クライアントの`length===5`チェックを通らなかったため、最終送信は5値tuple+任意の名前付きフィールドへ修正した。旧受信側は新フィールドを無視しながら従来のカタログ弾道を構築できる。

## ブキ別の確認値と継承

単位は60HzのF、ダメージはゲーム内100HP換算、初速は原典world units/F。以下の全端点をライブ発射から検証した。

| ベース | Min/Mid/Fullチャージ | 1矢のダメージ | 初速 | 消費インク% | Min/Mid/Full硬直 | 矢数/爆発 |
| --- | --- | --- | --- | --- | --- | --- |
| トライストリンガー | 9/30/72 | 30/35/35 | 2.1/2.1/3.85 | 5/6/8.5 | 12/15/15 | 3、Mid/Fullで45F後に各30、半径2.05 |
| LACT-450 | 6/12/34 | 30/45/45 | 1.45/1.45/2.55 | 3.5/4.68/6.5 | 8/15/15 | 3、全段階非爆発 |
| フルイドV | 12/40/80 | 24/24/35 | 1.45/2.294/3.5 | 7/8/9 | 12/15/15 | 5、Mid/Fullで45F後に各30、半径2.05 |

派生5キットは、登録時の同一`catalogRecord`継承と実発射/ジャンプ/通信表示で検証した。

| 派生キット | ID | 継承するベース |
| --- | --- | --- |
| トライストリンガーコラボ | `s3-stringer-normal-01` | トライ |
| トライストリンガー燈 | `s3-stringer-normal-02` | トライ |
| LACT-450デコ | `s3-stringer-short-01` | LACT |
| LACT-450MILK | `s3-stringer-short-02` | LACT |
| フルイドVカスタム | `s3-stringer-explosion-01` | フルイド |

## 7領域の独立監査結果

| 領域 | トライ | LACT | フルイド | 未確定・限界 |
| --- | --- | --- | --- | --- |
| 射撃 | Min/Mid/Full生成数・消費・硬直、次弾受付を追跡 | 同左、Mid硬直8→15F修正 | 同左、Mid硬直12→15F修正 | 段階間のNintendo補間/丸め、全低インク時系列の本家測定は未取得 |
| 弾道 | 段階別初速、角度、ArrowMargin、4F直進→制動/自由落下の経路を確認 | 初速・10.5→5→0.5度の既存回帰を再実行 | 初速・負角度による交差/拡散のコード経路を確認 | 省略されたField半径・寿命・移動速度加算のデフォルトはエンジン未回収。実機着弾時刻の数値比較なし |
| 攻撃 | +0.6中心とLOS・複数矢を修正 | 誤った爆発能力を除去 | +0.6中心・複数爆発の重なりを修正 | 既存の敵代表点Y+0.7/球形爆風モデル、壁表面付近の原典遮蔽規則は完全一致未立証 |
| 塗り | 既存の凍結時塗り+爆発時塗りを保持 | 独立落下飛沫・着弾塗りを保持。誤爆発の塗りは除去 | トライ同様 | 既存paint所有権/30・60・120Hz途中フレーム回帰58件を再実行。CPU/GPU・本家面積の定量一致は別途必要 |
| 状態遷移 | 既存キャンセル・非キープ能力を確認、full jump修正 | 75F full charge keepの既存経路と全キット継承を確認、full jump修正 | 非キープ能力とfull jump修正 | LACT `KeepChargePreDelayFrame=19`/`_Pre=14`の正確な復帰受付は未再現。フルイド`MoveJumpDownBias=.8`/開始率`.05`も未接続で意味未確定 |
| モーション/VFX/SE | ローカル傾斜時計統一、ghost導火/爆発追加 | 傾斜時計統一、非爆発音響/ゲーム能力の矛盾を解消 | トライ同様 | `BowTiltKeepFrame45`/`ResetSpeed2`、原典の骨軌道、実音波形/発生時刻、レティクルは未立証。モデル形状を完全一致としない |
| 通信 | 実record→ghostで矢・導火・傾斜を検証 | 旧/新メタデータと非爆発を確認 | 5矢とghost非権威を確認 | 重複/順序逆転は既存のowner birth sequence gateを維持。実WebSocket遅延・Switch側ロールバック比較は本担当単独では未実施 |

## 検証

- 新規2ファイルの11テストがソース構成で成功。主要差分の修正前失敗は、F04（0対30）、Mid硬直（12対15）、LACT Fullの誤凍結、full jump（8.4対4.2）、ローカル表示の別時計、ghostの即消失、remote傾斜メタデータの欠落をそれぞれ確認した。
- `stringer-source-1130.test.mjs`: 原典ハッシュ3件、全8identity×3段階の実発射、オフセット半径/LOS/対物、爆発能力と45F寿命、重なり、全8identityのActorジャンプ、次の実弾受付、record→ghostの非権威を検証。
- `stringer-tilt-motion.test.mjs`: 全8identityのローカル表示を30/60/120Hzで検証、表示は状態を書き換えない。preview fallbackと全8identityの送受信/不正メタデータも検証。
- 既存 `wiki-full-runtime`、`catalog-added-family-paint`、`catalog-paint-timing-boundaries` は58/58成功。ログは `stringer-regressions.log`。
- 既存のbow shape、stringers/splatanas motionと当時の新規2ファイルの計18テストも成功。元fixtureの任意source-motion動的import警告は継続するが、テスト失敗ではない。スプラタナ側の挙動変更は加えていない。
- 最終コード`612d7ba`のproductionビルド成功（contentHash `159ac627a30f…`）。その出力の新規11テストも11/11成功（`stringer-production-tests.log`）。起動予算ゲート成功、初期JS 2,704,306 bytes / 146 requests / 145 module preloads（`stringer-startup.json`）。ソース/production fixtureを実ブラウザ結果として扱わない。
- 統合後の全16種ブラウザ/ネットワーク/CI/main再確認は統合担当の成果と分ける。

実行コマンド:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/stringer-source-1130.test.mjs patches/splatoon3/tests/stringer-tilt-motion.test.mjs
node --experimental-vm-modules --test --test-concurrency=2 patches/splatoon3/tests/wiki-full-runtime.test.mjs patches/splatoon3/tests/catalog-added-family-paint.test.mjs patches/splatoon3/tests/catalog-paint-timing-boundaries.test.mjs
ESBUILD_MODULE=/workspace/actions/node_modules/esbuild/lib/main.js node scripts/build-inkwave.mjs inkwave-public _site
INKWAVE_BUILT_SITE=/workspace/actions-stringer/_site node --experimental-vm-modules --test patches/splatoon3/tests/stringer-source-1130.test.mjs patches/splatoon3/tests/stringer-tilt-motion.test.mjs
node scripts/check-inkwave-startup-budget.mjs _site
```

## 性能

`stringer-benchmark.mjs`/`stringer-benchmark.json`に再実行可能なNode VM比較を保持。基準9ef6335に対し、F04/硬直/jump/local poseまでの候補29aa372で、3,000爆発×24対象×8サンプル（順序交替）の同一hit数を測った。

| 指標 | 基準 | 候補 |
| --- | --- | --- |
| 3,000爆発の中央値 | 5,456.69 ms | 5,297.83 ms |
| 時間比 | 1 | 0.971 |
| 明示GC後の保持heap差分中央値 | 43,128 bytes | 46,428 bytes |

共有ホストで他テストも動いており各サンプルの幅が大きい。速度向上の証明とはしない。F04で追加したベクトルは爆発1回につき1個で、プレイヤーごと/フレームごとの増加はない。他ブキの爆発には追加せず、塗り/ダメージ判定を省略して軽量化していない。ghost表示追加とメタデータ拡張はこのCPU測定後のコミットであり、この数値でGPU/ブラウザGC・混雑時VFX・長期メモリを保証しない。
