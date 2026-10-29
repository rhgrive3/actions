# ガチホコの短押し発射・バリア・発光・攻撃飛沫

比較元は `main` の `e67c636b81762df56b346a09ef570964d43084df`。対象は公開版の `patches/splatoon3/runtime/ranked/`。原作画像は実際に表示して確認し、ゲーム本体や配信物へ転載していない。

## 参照と確認条件

- [任天堂・ガチキング決定戦](https://www.nintendo.com/jp/bankara-king/index.html)の[通常ホコショット図](https://www.nintendo.com/jp/bankara-king/assets_final/img/rule_step02_img_hoko.png)：艶のある大きな球状インク、銃口へ伸びる穴の開いた液状の尾、周囲の細長い飛沫と粒を確認した。説明用の合成画像であり、投影寸法・時間の計測値としては扱わない。
- [任天堂の入門記事](https://www.nintendo.com/jp/ichikara/av5ja/03_en.html)と[任天堂掲載の実機画像](https://assets.nintendo.eu/video/private/f_auto%2Cq_auto/uvumuwlrx4ohvy2bftbv.jpg)：所持者周囲の金色の光、光条・光粒、バリア破裂の周囲塗りを参照した。取得直後の演出を含み、攻撃中の点灯時刻をこの静止画だけで確定しない。
- [GameWithの原作バリア画像](https://img.gamewith.jp/img/f33a5ad6da46ff301dd1b43dc5e16b0e.png)：膨張した膜、濃いチーム色と不規則な淡色部分、強い光沢、地面へ食い込む輪郭を確認した。
- [S3mixのホコ性能表](https://wikiwiki.jp/splatoon3mix/ガチホコバトル#rainmaker_stats)：ノーチャージ・半チャージと最小チャージ20Fの記述を参照した。既存の Ver.11.3.0 向け数値を維持し、Switchで新たなフレーム計測はしていない。公式画像の撮影版・ギアは未特定。

## 確定した問題と変更

| 対象 | 変更前 | 変更後・再現操作・影響 |
| --- | --- | --- |
| バリア | 薄いワイヤー球。膜や光沢が見えない | `world.mjs` と `rainmaker-visuals.mjs` で、光沢・淡色の流動模様を持つ膜へ変更。中央でバリアを撃つと既存の圧力・色・衝突半径に沿って膨張し、反対色への攻撃で縮む。被弾判定とHPは維持。 |
| 短押し攻撃 | 20F未満で離すと攻撃自体を破棄 | `rainmaker.mjs` が解放を保持して既存の最小チャージを完了する。素早く押して離すと弱弾を1発発射。再押下で強弾へ変わらず、泳ぎ・死亡・所持解除でキャンセルする。 |
| 発射位置 | 早期解放の時点で固定すると、移動後に後方から出るおそれ | `install.mjs` が実際の発射移行時に生きた銃口を採取。所有者・life検査、1F待機中の固定snapshot、通常の壁・防御判定を維持。旧snapshotは追加の `released` がなくても復元できる。 |
| 体の光 | フルチャージ時に魚の材質だけが発光 | 所持者と銃口へ金色の光条・光粒を追加。チャージと発射で強まり、潜伏・死亡・所持解除で消える。bloom無効でも描画し、元のキャラクター材質は変更しない。 |
| 発射飛沫 | 単色の小球だけ | 艶のある大きな弾頭、穴のある液状の尾、引き伸ばされた粒を描画。弱弾と強弾の見た目を分ける。弾道・ダメージ・塗りの数値は維持。 |
| 着弾 | 球が消え、爆発時のリングだけ | 待機中のインク塊、着弾飛沫、遅延爆発の盛り上がるインク塊と飛散を追加。8個の再利用プール、共有geometry/materialで寿命・GPU資源を管理。 |
| 水面と上階 | 弾の床検索が高さ上限を渡していない | `combat.mjs` から弾の高さを渡す。水面の上に別階があっても、その上階を水没位置の足場として扱わない。 |

## 検証

以下はCPU・ブラウザの再構成側検証であり、本家実機との一致判定ではない。

- `node --experimental-vm-modules --test patches/splatoon3/tests/{ranked-rainmaker,ranked-combat,ranked-rainmaker-shot-origin,ranked-engine,ranked-rainmaker-motion,queue-combat-scratch}.test.mjs`：107件成功。短押し・再押下・移動中の生きた銃口・取消・復元・水面を30/60/120Hzで確認。既存の通常強弾、壁・防御物・host/follower判定も保持。
- `ranked-combat.test.mjs`・`ranked-world.test.mjs`・`rainmaker-model.test.mjs`：source 29件成功。
- `queue-gameplay-local-20261026.test.mjs`・`rainmaker-model-actor.test.mjs`・`rainmaker-visuals.test.mjs`：source 13件成功。Checkpoint表示、既存モデルの両手支持・頭部干渉、発光の銃口位置、飛沫プールの上限・解放を確認。
- `check-inkwave-patches.mjs --quick`、`inkwave-source-migration-audit.mjs`、通常ビルドと起動予算チェックは成功。
- 最適化生成物を指定した銃口・短押しテストは14件成功、同じ生成物の `ranked-world.test.mjs` は表示1件成功・6件失敗。後者の6件はクリーンな基準SHAから別worktreeでビルドしても同じように失敗した。内訳はネイティブマップを含む一覧と5マップ前提の不一致、GPU paint用mock rendererの不足4件、scorchの旧床fixture1件。この既存のfixture非互換を修正していない。source版の同ファイル7件は通過している。

ブラウザ最終実行は成功。画像・生成物のハッシュは[verification.json](rainmaker-barrier-attack-2026-10-29/verification.json)、実行結果は[browser-result.json](rainmaker-barrier-attack-2026-10-29/browser-result.json)を参照。通常のオフライン tidewater を起動し、最初の配置とバリアへの被弾入力を設定した後、実Actor/Matchの固定60Hz処理で取得・チャージ・発射・着弾・消去を進めた。取得後45tickでバリア破裂の飛沫を落ち着かせてから所持中の光を比較した。`?shadercheck=1` によるGPUプログラムのリンク検査に加え、同じ停止画面で対象効果だけを隠したframebufferとの差を測り、実際の画素への寄与を確認した。低画質・bloom無効のChromium 151.0.7922.34 / SwiftShader、1280×800。pressure49,566・idle24,440・half34,452・full39,401・flight8,145・impact2,999・blast10,560画素が変化し、飛沫消去後の差は0。これらは可視性の検証であり、本家との一致率やGPU時間ではない。

最終配信物のcontentHashは `b3a3c652b54b6cdd1d4821505026045fc21ccadcc1ba8c0653c45d49a8c9a5bf`、inputHashは `9211d96ae99c3cef480781302b1aa2acf5f85aaf72989bafd40a45e8cd78dfdd`。再実行コマンドは `node scripts/check-inkwave-rainmaker-visuals.mjs --site .built-site/rainmaker-final --phase candidate --evidence-dir .browser-evidence/rainmaker/final --profile-dir .browser-evidence/rainmaker/profile-final-settled`。

## 実ゲームの比較画像

| 表示 | 変更前 | 最終候補 |
| --- | --- | --- |
| 膨張したバリア | ![変更前のワイヤーバリア](rainmaker-barrier-attack-2026-10-29/before-barrier.png) | ![濡れた膜のバリア](rainmaker-barrier-attack-2026-10-29/after-barrier.png) |
| フルチャージ | ![変更前のチャージ](rainmaker-barrier-attack-2026-10-29/before-charge.png) | ![体と銃口の発光](rainmaker-barrier-attack-2026-10-29/after-charge.png) |
| 発射中 | ![変更前の単色球](rainmaker-barrier-attack-2026-10-29/before-shot.png) | ![弾頭と液状の尾・飛沫](rainmaker-barrier-attack-2026-10-29/after-shot.png) |

着弾後の遅延爆発：

![盛り上がるインクと飛沫](rainmaker-barrier-attack-2026-10-29/after-blast.png)

ローカル調査中の初回候補ではGLSL予約語 `patch` により膜・弾のシェーダーが無効になった。修正後の候補と区別し、見えない旧候補は成功として扱っていない。最終版では予約語を除去し、同じ不具合を見逃さない描画検証を残す。

## 確認の限界

原作の通常ショットの明瞭な着弾フレームを今回取得できておらず、爆発の立体形状・粒数・寿命は原作測定値ではない。膜の模様、発光の大きさ・時刻、弾の表示寸法も手続き的な近似であり、完全一致を主張しない。Switch実機、実iPad、実オンライン通信、多数同時爆発時のGPU時間、広域CI全体はこの限定検証の対象外。基準画像と候補のチームパレット・味方装備はランダムで、画像の単純な差分値を改善量とは扱わない。
