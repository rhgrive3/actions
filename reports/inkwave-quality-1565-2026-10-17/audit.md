# INKWAVE #1565: 基準実装・検証境界の監査メモ

基準は公開版 `inkwave-public/` とその production adapter 合成結果、main **`d5265f73d9dad69f1afd9690e374caee45195f11`**（PR1564 統合後）。開始時の `85acc45d0ab23a95161b599d4287fd8142e8145b` / `/workspace/inkwave-baseline` は旧履歴として保持し、最終比較には `/workspace/inkwave-baseline-current` を用いる。`game/` の INKGORGE 試作版は比較対象に含めない。本メモはソース読取りと診断ハーネスの準備を記録するものであり、未実行の測定値や未完了ゲートの成功を記載しない。

比較対象の S3 条件は既存記録の Ver.11.3.0 に合わせる。Wii U BFRES 係数、ホストの接地補正、S3 実機挙動は別の根拠である。今回も実機未確認項目を解消済みにしない。挙動記録の本体は `reports/inkwave-splatoon3-behavior-2026-10-02.md`。

## 実装の所有者

production とテストが共有する入口は `scripts/inkwave-source-composition.mjs:adaptBuildSource`。順序は S3 → touch → reliability → local-quality → network → practice-range → ranked → native-stages → audio → projectile-visuals → UI → main-ink-footprints → opponent-palette → opponent-preview → camera-aim。最後の camera adapter の fail-closed 条件を維持する。

```text
入力 / BotBrain → Actor のゲーム状態・移動・射撃・衝突
  └─ Actor._finishFrame → Character.update（表示）
       ├─ _trackRoot → _updateStates（walk wrapper の cadence / lean 含む）
       ├─ SourceMotionController.advance → applyForm
       └─ 可視の kid（current main の body proportion を含む）
            ├─ sourceMotion 非 active: _updateFeet
            │    └─ 条件を満たす walk fallback、その他は既存 procedural feet
            └─ _buildPose → _applyPose（native shoulder を復元して既存 pose / leg IK）
                 ├─ sourceMotion active: applyBody
                 │    ├─ SourceBank.sample → SourcePose の local TRS / FK
                 │    ├─ GaitTargets / BodyBalance
                 │    └─ HumanRetarget.apply / ground
                 │         └─ ContactTransition・接地 anchor・reach・IK
                 ├─ 既存 weapon + source.alignWeapon → proportion shoulder drop → face
                 └─ source.applyAccessories（source hair / root inertia）
       squid: source.updateSquid が true なら source owner、false なら既存 procedural squid
       Character.update wrapper: 完了した pose に s3ProportionHead
```

`SourcePose` は bank 全体の BFRES local position/quaternion/scale と、helper を含む source skeleton の world matrices・位置・回転。segment-scale compensation も評価する。描画される `Character.boneList` / `skeleton.boneMatrices` と同一ではなく、HumanRetarget がホストの寸法・接地に合わせて写像する。foot/knee の方向別 FK 目標を混合する GaitTargets と、胴体重心を扱う BodyBalance も別の責務である。

既定で source motion は enabled。ただし loading/error/disabled/disposed、Roller、および正確な source clip を持たない modern dodge/special の区間は既存 owner に戻る。Roller の接地と二手保持を source に移さない。`walk.mjs` の legacy 曲線を更新しても、source active 時の実際の脚 owner を直したことにはならない。source loading に失敗しても procedural animation が残ることは明示的な fallback 契約である。current main の `body-proportion-adapter.mjs` は rest/geometry の一度だけの写像、native shoulder で解く前処理、arm/weapon IK 後の shoulder drop、update 後の head 処理を加える。これは SourcePose の係数変更ではない。旧85acc の接地・weapon/muzzle 証拠を、体型変更後の current main に無条件で流用しない。

ここでいう「native」には別概念がある。Character の既存 procedural rig と、`patches/native-stages` の source stage を混同しない。world 構築は native registry 対象なら `buildNativeWorld`、それ以外は既存 Level / LevelView。通常 Level の grates は `createLevelMaterial` の `DoubleSide` 分岐で、今回の候補はこの shader 交換後の normal 方向を修正する。箱レイアウトから `Level.buildGeometry` で作る grate fixture だけでは、imported native-stage の材質や collision の網羅を証明しない。

## 基準に既にある仕事と対象外

root-hair spring propagator、SourcePose Euler のゼロ係数処理、camera FOV cache、retarget branch 更新、不要な中間 FK の削減、segment-scale scratch array 削減、paint/distance/collision hot path、empty FX pool、composer target、offscreen/quality budget、native texture association は既存合成に含まれる。今回の成果として再計上しない。詳細な既存証拠は `reports/inkwave-calculation-optimization-2026-10-16.md` にある。その component 結果を新しい whole-game 結果として流用しない。

- #1434 用の PR1331 / `2c57cb3c6dee7791ed26d08a845ba51388131993` は診断参照。merge せず、その古い比較結果も今回の測定として扱わない。
- PR1561 の過去の fixture 論点（Brella FX、hostile pool、Toxic Mist）は PR1564 に統合済み。current main の障害として旧失敗を継承しない。`reports/inkwave-open-pr-integration-2026-10-17.md` は Brella の既存 WeakSet 使用、real terrain/async Mist fixture、pool acquire/release 監査の更新を記録する。本メモ自体は新headで実行していないため、独立の件数・成功を追加しない。
- current `hostile-pool-reentry.test.mjs` は十箇所の acquire/release と Torpedo/residual-line 例外時解放を検査する。Mist の probe は exact async browser block と real Level import を実行する。最新 main と候補の同条件ログを比べ、該当群や厳格な条件を外さない。
- source BFRES、テクスチャ、音声その他の新規 source assets や production dependency を追加する提案ではない。診断用の既存 esbuild / Playwright は production dependency の追加とは分けて記録する。

## 候補の採用条件

| 段階 | 読取りで分かった内容 | 採用条件・未解決時の扱い |
|---|---|---|
| 基準固定 | main SHA と production 合成入口を固定 | 全入力・全 served artifact を manifest / Git SHA と照合。作業中の未commit状態を exact SHA と呼ばない |
| 材質 | custom world normal は Three が付けた back-face 符号を上書きする。候補は `DOUBLE_SIDED` で `faceDirection` を戻す | 表面・裏面・上/下照明、ink と coverage、暗所、range/native-stage を対象ごとに検証。意図した領域以外の差分が残るなら採用を保留 |
| 接地 | sole envelope の見た目候補は撤回済み。残した候補は終了済み Hermite 計算のみを省略 | 30/60/120 Hz、方向・微入力・停止・旋回・坂/段差・jump/air、武器/source fallback の owner、bone/muzzle/gear の関係を確認。ゲームの Actor 位置や入力特性を変えない |
| 計算量 | 終了済み ContactTransition は飽和した係数がゼロ。shader は vec3 の符号乗算を一つ追加 | 有効な正 duration と signed-zero / 非有限 offset の同値を試験。shader の追加乗算を「GPU 無料」と主張しない。state/資産/描画予算と実測結果を併記 |
| whole-game 診断 | 再利用ハーネスは production Game._frame と real owner を実行できる設計 | calibration / 同版反復 / workload / PWA / audio / endpoint pixel が全て通る場合だけ、対応する範囲の比較とする。失敗や pixel の意図した差は独立の証拠で解決するまで inconclusive |
| 統合 | render と motion は別 worktree で候補を準備 | 個別候補と最終合成をそれぞれ検証。required CI と browser gate の結果が揃うまで全体非劣化・完成・実機同等を宣言しない |

## 使える計測と既存ハーネスの注意

`check-inkwave-runtime-performance.mjs` は title/settings/battle の fixed-step profile だが、既存 compare は baseline `5e28dbd16f7829aebd88052ff5f7fdf71f39fdad`、renderer byte identity、hidden menu work 削減など特定 PR の条件に固定されている。current main/candidate の汎用非劣化判定にはそのまま使えない。

PR1331 の `measure-inkwave-whole-game.mjs` も A=`545c6b3…`、B=`7fd172f…`、cloth-only C tree=`29604d1…` に固定。今回の root/site 引数だけ差し替えて実行することはできない。そのため repo 外の **`/workspace/scratch/measure-inkwave-quality.mjs`** に診断派生を用意した。#1434 の実装や完了成果とは扱わない。

派生のルール:

- `--before/after-site` と full SHA/root を明示。production build を一切書き換えず、Git source inputs / 全 artifact hashes / 実際の served bytes を検証する。
- calibration は ABBA、各6測定frame。measurement は ABBA/BAAB の8試行、既定60測定frame・12 rendered warmup。各試行は新規 context。設定・viewport・simulation clock・RNG stream・camera・8人の配置を固定する。
- production が自然に PWA を登録・activate して offlineReady になるまで待つ。SW の無効化・登録強制・route bypass をしない。実 keyboard gesture で audio を有効にし、music worker / running audio を検証する。
- `--scenario normal` は PlayerController 1 + BotBrain 7、`crowd` は BotBrain 8。既定 `--input outward-fire` は owner の実処理後に固定の静止外向き射撃 intent を与える stress fixture。普通の人間操作の網羅とは呼ばない。
- optional `--input forward-fire` は normal の Controller に KeyW + fire を与え、bot intent を残す。死亡や非反復性で元来の厳格 guard が拒否したら unresolved とする。Practice Range / object stage / dark / ink の条件は別の試験が必要。
- 八人生存、controller 回数、固定 scale、描画非空、ゲーム状態 / random / paint / 全 bone state / frame workload、同版 endpoint pixel 反復、A/B endpoint pixel 一致を維持する。意図した grate/foot 画像差があっても自動許可しない。必要な領域限定 visual oracle は独立に検証する。
- rAF start 間隔、Game._frame の CPU submission、同期 readback 完了待ちを分け、各試行・全 raw frame と p50/p95/p99 を残す。readback は CPU/GPU overlap を直列化する。普通の表示 FPS / input-to-photon ではない。
- `--gpu-timing` は elapsed query を追加し、全 requested query の回収と nondisjoint を満たす時だけ whole-run GPU percentile を出す。部分 subset を whole-run と呼ばない。SwiftShader の値は hardware GPU 値ではない。
- draw/triangle、renderer geometry/texture/program、scene/attribute backing bytes、CDP heap/DOM/task、logical asset bytes と served URL receipt を記録する。heap は強制GCなしの境界 snapshot で、終了側は endpoint capture/serialization も含む。driver GPU memory、leak、cold-start transfer の証拠とは呼ばない。
- 各 output に実ハーネス、runtime-evidence library、invocation.json、双方 hash を保存。calibration scope はそれらの hash、両SHA / contentHash、設定、scenario 等を束ねる。fresh output を使い、失敗ログも保持する。
- default deadline は navigation120s、boot180s、PWA120s、setup180s、measured-window180s。`--*-timeout-ms` で変更可能。deadline 超過で readiness を緩和しない。従来 CI は calibration25分 / measurement50分枠で、今回の所要時間は実 calibration 後の projection に従う。

実行例（candidate SHA と Chromium path を実値に置換し、他の負荷試験を止めて順番に実行）:

```sh
node /workspace/scratch/measure-inkwave-quality.mjs \
  --harness-root /workspace/actions --mode calibrate \
  --stage scorch --scenario normal --input outward-fire \
  --samples 60 --warmup 12 --gpu-timing \
  --before-site /workspace/inkwave-baseline-current \
  --before-sha d5265f73d9dad69f1afd9690e374caee45195f11 \
  --after-site /workspace/inkwave-render-candidate --after-sha FULL_CANDIDATE_SHA \
  --playwright /workspace/actions/node_modules/playwright/index.mjs \
  --chromium CHROMIUM_EXECUTABLE \
  --out /workspace/actions/.ci-scratch/1565/evidence/grate-normal-calibration
```

同じ引数で `--mode measure --calibration CALIBRATION_DIR/whole-game-calibrate.json`、別の fresh `--out` を指定する。`crowd`、motion-only、最終統合にも別の calibration/output が必要。calibration の不一致を無視して measurement に進まない。

## 保持する既存ゲート

required `Validate INKWAVE update / validate` は `validate_core` と全8 `patch_tests` shards の fan-in。`scripts/check-inkwave-patches.mjs --quick` だけの成功では full suite 成功にならない。source suite、network、local-quality、practice-range、loading-cache、native cancellation/BVH、numeric sources、production build / startup budget / emitted packaging と emitted focused tests を維持する。

関連 browser は motion / motion-detail / catalog、paint masks、native normal、post-depth、resource shadows/reflections/context restore、idle resources、range、rematch/lifecycle、responsive/UI/input、startup。対象限定の新テストでそれらを置換しない。既存の `benchmark-inkwave-character-cpu.mjs`、`benchmark-inkwave-motion-caches.mjs`、native/paint の component scripts は補足診断として利用できるが、whole-game・実機GPU・端末発熱・電力・Switch/S3 同等性は未確認のまま残す。

## 現時点の判定追記

source 接地の visual factorization / sole-envelope 候補は mesh penetration が残るため採用していない。上表は採用条件の設計であり、この候補の完了記録ではない。終了済み ContactTransition の計算短絡も独立の同値・性能証拠で判断し、見た目補正の採用と混同しない。

**旧 global-normalization 候補**（content `c70ff01b…`）の native scorch 4試行 calibration はゲーム状態・骨・paint・random・endpoint pixels・PWA/audio の診断 guard を通過した。ただし性能採用判定は UNQUALIFIED。completed の生改善率 −11.1465%、pacing −13.8310% で、baseline 同版内にも renderer geometry +4 / texture −1 の不一致が残る。順序・共有process・ホストthrottleと source 効果は未分離であり、非劣化や #1434 完了を主張しない。完全な実データに結び付けた `/workspace/scratch/1565-calibration-summary.json` と `.md` に24 raw frame、p50/p95/p99、資源の計数範囲と次の matched static probe 条件を記録した。
