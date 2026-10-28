# Shooter / Dualies 照準の投影と射撃中の瞬間移動

基準 main: `48511150bbaeab182dd04c712d39bd5b26df18f3`。独立ブランチ: `fix/shooter-dualies-reticle-20261026`。ローカルコミットのみ。PR 作成・push・CI 起動・merge は行わない。

## 問題と変更

Long Lane の開始位置 `(6, 0, 0)`、yaw 0、pitch 0 / -0.8 を既存の練習場 API とカメラで再現した。実機操作と区別した controlled app diagnostic である。

- 床を向くと、Shooter の +8F ガイドは地面を通過して y=-5.06、Dualies の +7F ガイドは左右とも y=-4.34 / -3.69 まで進み、それをスクリーンへ投影していた。ガイドの最大フレームまでに床へ接触した場合、実際の head と同じ `InkFlightRuntime.world` の球 sweep で最初の接触面に止める。既存の左右別 aim target・発射順・spread・turret の状態は変更しない。
- Shooter の小さい接触マーカーだけ、実際の native InkFlight ではなく旧 `_ballistic` / `advanceFidelityProjectile` の全寿命を予測していた。同じ native launch、spawn velocity、integrator、collision を使い、実際の最初の field 接触と一致させる。全飛行の予測は `s3ShooterImpact` に残し、`ShotGuideFrame` より後の落下による床接触は「現在の照準を遮る内側マーカー」として表示しない。水平・遮蔽物なしの床マーカーを除くための、明示的な HUD 再構成方針である。
- Dualies の同じ circle に SVG `transform="translate(...)"` と WAAPI `transform: scale(...)` が書かれ、射撃中は WAAPI が投影を上書きした。実ブラウザの旧版では `(634.04, 418.25)` のリングが `(650.5, 360)` へ移動した。投影を親の SVG group、キックを子の circle に分け、元のキック寸法・130ms の設定を保つ。
- 連続射撃は各手1個の Animation を再利用する。武器変更・非表示・死亡・respawn・dispose では既存の feedback cleanup から解除する。reticle を作り直した際は投影・lock・roll の dirty cache と DOM handles も作り直す。
- 集中射撃中の merged ring を実際の merged guide へ投影する。`s3Turret` で1つ／通常時2つを切り替え、解除後に merged ring の opacity fade が残って3つ重なり得る経路をなくす。スライドの許可・移動・回復・射撃状態を変更しない。

`inkwave-public/`、弾の出生・ダメージ・塗り・乱数・通信・音声・モデルは変更していない。`weapons-adapter.mjs` は既存 native collision の読み取り口を追加するだけで、発射や step の本体を変更しない。

## 根拠と本家比較の限界

比較対象は既存パラメーターと同じ Splatoon 3 Ver.11.3.0、Splattershot / Splat Dualies、ギアによる追加補正なし。固定抽出 `Leanny/splat3@7280ff9cde8bb1c5dcef46c700c326471584d2e6` の `ShotGuideFrame` は Shooter 8 / Dualies 7 で変更していない。

公式の [ブキとギア](https://www.nintendo.com/jp/switch/av5ja/customize/index.html) は、マニューバーが左右交互に射撃し、射撃しながら高速移動することを説明する。[GameWith のスライド解説](https://gamewith.jp/splatoon3/366623) は通常時2つ／スライド後1つの照準を説明し、実ゲーム画像へリンクしている。ただし今回その画像、既存の公式 `photo/01/005.jpg` / `021.jpg`、公式 Contentful の実ゲーム画像の直接取得は HTTP 403 となり、画面を実見しての新しい一致判定は行えなかった。Web 検索の画像説明や過去レポートを実見した映像の代用にしていない。Nintendo の画像・音声・映像を追加しない。

今回の確定範囲は「実際の INKWAVE の弾とガイドの field 接触の一致」「ブラウザの transform 競合と蓄積の解消」である。本家と同じ pitch・距離・ブキ・ギア・射撃状態での対照映像、外側と内側の絶対位置、本家が上記フレームによる内側表示の cutoff を使うか、スライド切替の描画タイミングは**未確認**。この変更だけで本家との完全一致とは認定しない。

## 検証

新規 `patches/splatoon3/tests/shooter-dualies-projection.test.mjs` は production composition / emitted runtime、実 Character、実 Level / Physics と実際に発射した native head を使う。pitch -0.45 / -0.8 / -1.05、Shooter と Dualies の各手、30 / 60 / 120Hz の step で最初の床接触点を照合する。乱数・インク・projectile list・時間を dry query が変更しないこと、水平時の遅い落下と表示を区別すること、geometry generation と player velocity の cache invalidation も確認する。VM は optional source-motion の dynamic import を使えず native fallback pose を使う。この CPU 試験は本家の表示やブラウザの視覚証明ではない。

基準版 emitted に新規試験をかけた負例は3件すべて失敗した。候補の最終 emitted は追加した移動時試験も含む4件成功。詳細コマンド・ハッシュ・ログは同名ディレクトリの検証記録を参照する。

既存 `issue-575-dualies-independent-aim.test.mjs` は source 側で左右別軌道・順序・turret を通過する。emitted 側では古い5フィールドのイベントキー期待に対し、既存の production audio adapter が `mode` を追加するため1件失敗する。基準 emitted と候補 emitted の両方で同じ失敗を確認した。今回のコードで新しい通信フィールドを足してはいない。未関係の harness 修正でこの結果を隠さない。

追補（#575 fixture 修正）: 上記の基準／候補で共通する失敗ログは保存したうえで、fixture を部分的な6アダプター合成から正規 `scripts/inkwave-source-composition.mjs` へ揃える。本番の後段 `audio-adapter.mjs` は `mode` を追加し、旧 `audio.play('shoot_dualies')` を止め、`installWeaponAudioRuntime` から `playWeapon` で左右の `fire_left` / `fire` を選ぶ。fixture も実 audio runtime を組み込み、キーは6個を完全一致、通常時 `normal`、実スライド後 `turret`、再生回数2と左右の正確な articulation、旧音声0を検査する。従来の36フィールド出生tuple、projectile/packet/FXの個数・順序・ID、RNG、hand/muzzle、実弾道、roll/release のアサーションは維持する。ゲーム本体・通信schemaは変更しない。追加検証記録は `fixture-575-followup.json` と `fixture-575-source.tap.gz` / `fixture-575-emitted.tap.gz` に保存する。

cutoff の由来を明確にする: `profile.json` の `weapons.shooter.shotGuideFrame=8` と固定抽出 `weaponsFidelityCompletion.weapons.shooter.WeaponParam.ShotGuideFrame=8` は既存データである。しかし `impact.guideFrame > w.shotGuideFrame` なら内側マーカーを非表示にする条件は**今回追加したheuristic**で、抽出データにそのUIの分岐が存在するわけではない。水平 Long Lane で12F後に床接触する弾に対し、本家が内側マーカーを消すのか／別の距離・位置へ表示するのかは未確認。8F/9F境界を含む同条件の原典映像が必要で、新規テスト成功から本家仕様を認定しない。

取得エラーの追補: `https://www.nintendo.com/jp/ichikara/av5ja/photo/01/021.jpg` の追加診断は `curl (56): CONNECT tunnel failed, response 403`、応答ヘッダーは `HTTP/1.1 403 Forbidden` / `server: envoy`。これは実行環境のCONNECT経路の拒否であり、Nintendo起点の403とは断定しない。005のshell取得は021失敗後に実行されておらず、005の個別HTTPコードは不明（web image取得のみ失敗）。拒否した対象を別経路で取得し直していない。既存 `dualies-motion-comparison-2026-10-03.md` 記載の原典保存先 `/mnt/workspace/.dev-state/agent-work/evidence/inkwave-motion-detail-20261002/terminal-dualies/` は今回の環境に存在せず、その記録にも8F cutoffの観察はない。

ブラウザは `scripts/check-inkwave-shooter-dualies-projection.mjs`。通常メニューの trusted click で練習場へ入り、native fade が実際に消えるまで待つ。投影の診断は既存 debug stepping とカメラ設定、キックの診断は実 emitted listener へ通知した明示的な DOM component fixture を使い、通常操作で撮影できた弾道とは扱わない。RAF の間隔が数秒空く software Chromium では130ms全体の滑らかさを評価できない。実際に active なキックの中心座標、100連続通知の bounded owner、非表示 cleanup、武器切替、実 NativeRunner の許可されたスライドと解除を別々に記録する。通常マウス入力の試行では `pointerlockerror` を記録しており、入力や状態を強制して通常操作成功とはしない。

最終比較は `before-verified/` と `after-verified/`。同一 probe SHA-256 `3bbd061fc6a1cbfc769e97cc5c2a5d26fe62a3e2bbced97d60df901652f133cb`、同じ lane / camera /武器設定を使い、両プロセス終了コード0。候補では `--assert` の投影・active kick・bounded animation・hide cleanup・DOM rebuild・受理された native roll→turret→release の検査が成功した。各版の palette / idle animation の位相はランダムであり pixel-perfect の画像比較ではない。

| 検査 | 基準 emitted | 最終候補 emitted |
| --- | --- | --- |
| Shooter 下向き guide y | -5.061985 | 約0、実際の床面 |
| Dualies 下向き guide y | -4.342443 / -3.543556 | 約0 / 約0、左右別の接触位置 |
| Shooter 水平時の内側 cue | 後の床接触を表示 | 12F接触の予測は残すが、8Fを超えるため cue なし |
| Active kick での中心移動 | 60.552741 CSS px | 0 CSS px（観測した active sample） |
| 100通知後の左右 Animation 数 | 50 / 50 | 1 / 1 |
| HUD 非表示後の左右 Animation 数 | 50 / 50 | 0 / 0 |
| NativeRunner の roll 許可 | true | true |
| 候補の turret / release 表示数 | 比較用 fixture の CSS clock と分けて記録 | 1 / 2 |
| 通常マウス操作の実発射 | 0、pointerlockerror 1 | 0、pointerlockerror 1 |

候補の content hash は `024bfccbf2401ce05e91ae1d528b56e9c91f466a044dc1973f07abec48700bb0`、基準は `7031d167d31a6aedf55686be1c17bde5998073f1e35e7c511602c717f030aad0`。通常の optimized build、quick compatibility、startup budget は成功。限定ソース回帰39/39、最終 emitted の新規回帰4/4。初期のブラウザ診断は fade 完了前の画像、roll 前に fire input を反映しない手順、`freeze(false)` を unfreeze と誤認した手順を含んだため最終証拠には採用しない。最終 probe は native fade の実値を待ち、roll 前に入力を1tick反映し、通常操作試行には既存 `debug.unfreeze()` を使う。

## 統合レビュー: 8F cutoff は採用しない

統合担当は、上記候補の「ShotGuideFrame を超える接触を inner marker にしない」という新しい非表示条件を runtime から切り離した。8F という抽出フィールドは本家の inner-marker 消去規則の根拠にはならないため、元の full-flight marker admission を維持する。実際の head と同じ first-contact 予測、床への guide clamp、移動・地形変更の cache invalidation、SVG projection と shot-kick の分離、bounded Animation owner は保持する。新規回帰と browser checker は全寿命の実接触を保証し、未確認の非表示条件を成功要件にしない。元ブランチの画像・数値はその候補時点の履歴証跡であり、最終統合の cutoff 採用を意味しない。この表示条件はドラフトPRの未解決項目に残す。
