# Bot special context の計算省略

基準: `84453765039f040cb937f6beb7fdb58d54f169dd`。同commitの
`bot-special-context.mjs` と `canonical-kits.mjs` を
`patches/splatoon3/tests/fixtures/bot-special-context-before-84453765.json`
に固定して比較する。

## 対象

BotBrain の共有tailは、未充填で通常攻撃を続ける間も毎simulation tick
special contextを作っていた。充填判定より先に現在の認識敵へのLOS、
距離・照準計算、4個の操作closureを作るため、specialの判断に使わない
地形raycastが発生していた。

contextの入力検証・memory更新を軽い前段に分けた。合成後のBotBrainだけが
`driveCanonicalBotSpecial(..., true)` によって省略を選択する。
未充填、またはRainmaker carrierの既存gateで終わる場合は、
tailが参照しないperceptionと操作helperを構築しない。
ready/activeではそのtickの現在の位置から従来通り計算する。

公開 `createBotSpecialContext` と `driveCanonicalBotSpecial` の通常呼出は
完全なcontextを返し、perception、helper、列挙keyを維持する。
有効性の確認、memoryの装備・life・状態変更によるreset、
`intent.special = false` と毎tickのdispatchは維持する。
行動・更新頻度・弾道・描画品質は変更していない。
スプラトゥーン3実機との新しい一致判定は行っていない。

## 検証

`bot-special-context-parity.test.mjs` は以下を固定基準と比較する。

- 公開constructor/default driverの全fieldとhelper、認識喪失、装備・life・死亡reset。
- 明示opt-in経路の無効入力、未充填、active、Rainmaker carrierとmemory identity。
- 19種の実special policyについて、未充填/ready/active × 30/60/120Hz × 8tickの1,368判断。
  intent、照準、移動、memoryを照合する。外部の地形・描画はCPU fixtureである。
- 合成後BotBrainの実tailからActorと通常Shooter発射まで、30/60/120Hzで比較する。
  射撃数、インク、HP、照準と入力が一致し、不要LOSが毎tick1本減ることを確認する。
- 420回の未充填呼出で、LOSは420→0、操作closureは1,680→0。
  公開default呼出では従来通りLOSと4個のhelperを生成する。

上記5件と既存Bot special回帰7ファイルで83/83成功、skip/failは0。
`tests.log` に全結果を保存した。総wall timeには別計測を妨げないための
SIGSTOP待機を含むため、性能値には使わない。新規testは既存の
source-test自動検出に含まれる。

再現コマンド:

```sh
node --experimental-vm-modules --test --test-concurrency=1 \
  patches/splatoon3/tests/bot-special-core.test.mjs \
  patches/splatoon3/tests/bot-special-context-parity.test.mjs \
  patches/splatoon3/tests/bot-special-integration.test.mjs \
  patches/splatoon3/tests/bot-special-owner-integration.test.mjs \
  patches/splatoon3/tests/bot-special-melee.test.mjs \
  patches/splatoon3/tests/bot-special-ranged.test.mjs \
  patches/splatoon3/tests/bot-special-support.test.mjs
```

## 対象処理のmicrobenchmark

```sh
node --experimental-vm-modules scripts/benchmark-inkwave-bot-special-context.mjs \
  reports/performance-20261030/bot-special-context/benchmark.json
```

実 `Level` / `Physics.los` に静止した認識敵を1人配置し、固定1/60秒で
旧版・候補版の順序を交互にして比較する。各50,000呼出×9sample、
各20,000呼出warmup。raw samples、開始/終了時刻、Node versionと
対象source hashをJSONに保存する。
これは対象処理のCPU測定であり、ゲーム全体のFPS・GPU・実機性能ではない。

初期の短い測定（warmup 3,000、20,000呼出×11sample）は
`preliminary-benchmark.json` に保持する。未充填opt-in経路は35.05→1.55ms
だったが、full/active経路のsampleにばらつきがあり、最終値には使わない。

最終測定は2026-10-30 14:03:26.195–14:03:30.118 UTC、Node v24.19.0、
所要3.92秒。各50,000呼出の中央値は次の通り。

| 経路 | 基準 | 候補 | 変化 | LOS回数（基準→候補） |
| --- | ---: | ---: | ---: | ---: |
| 明示opt-in・未充填 | 74.91ms | 7.25ms | -90.3% | 450,001→0 |
| 明示opt-in・active | 68.22ms | 69.01ms | +1.16% | 450,001→450,001 |
| 公開default・未充填 | 66.13ms | 66.78ms | +0.99% | 450,001→450,001 |

呼出数には測定後の結果同値確認1回を含み、warmupは含まない。
完全contextを必要とする2経路の追加費用はこの測定で約1%であり、
高速化を主張しない。未充填botの不要処理を除く局所最適化であり、
実対戦全体のCPU/FPS比較は統合後の別測定が必要である。
