# INKWAVE ナワバリバトル（Turf War）本家攻略準拠・PR #2019 HEAD 対応 Patch ＆ 検証報告書

## 1. 概要と参照した本家『スプラトゥーン3』攻略ソース・Patch構成

本報告書は、Google Drive 内の [INKWAVE-main-b1f571da-20261016-edit](https://drive.google.com/drive/folders/1hLvz1DGhRuYZVPI3l5HTiAVGvxD8f1KS) フォルダに格納された `rhgrive3/actions` リポジトリ（PR #2019：`feat/bot-turf-war-paint`）に対し、**適用先の本体コード（`inkwave-public/src/game/bots.js` 等）を一切直接変更せず、`patches/splatoon3/` 配下のランタイム＆アダプタ追加および `scripts/inkwave-source-composition.mjs` への2行フック接続のみ**で実装したナワバリバトルBot塗りAI改善パッチの技術・実戦検証レポートです。

1. [**効率のいい塗り方：MatchGuyのスプラ塾（Spl3.ink）**](https://spl3.ink/matchguy-vol03/):  
   - **カニ歩き塗り（Strafe Painting）**: 射撃中に横方向へ移動し、着弾の重複を防いで面で塗る技術（切り返しカクつきを防ぐ指数平滑フィルタ `_smoothStrafe` 付き）。  
   - **中間塗りの縦振り補完（Pitch Micro-Wave）**: 中間飛沫がまばらなブキで横に歩くだけだと生じる塗り穴を、視点をこまめに上下へ微動させて埋める技術。  
   - **ローラー種別ごとの横振り連打＆コロコロ補完**: カーボン・ダイナモローラーは横振り立上りエッジ（`input.firePressed`）の高速サイクルと後隙のイカダッシュ慣性移動を組み合わせ、標準・ヴァリアブル・ワイドローラーは横振り直後に短時間コロコロへ移行して根元の薄い塗りを補完する技術。  
   - **人数有利（WIPEOUT等）時の塗り広げ**: 相手が盤面にいないタイミングを最大の塗りチャンスとして前線を押し上げる判断。  
2. [**【スプラトゥーン3】ナワバリバトルのルールと立ち回り｜勝つコツ（Game8）**](https://game8.jp/splatoon3/485632):  
   - **初動の分担と味方4体の強非干渉化**: 開幕は中央へ向かう2体と自陣〜中間を塗る2体に分かれ、味方の現在位置（`11.0m` 以内 `-5.5`）および向かっている目標ノード（`13.0m` 以内 `-7.5`）を見て塗る場所が被らないように分散するセオリー。  
   - **広域プラザ評価（半径6.5m）と仕上げ塗り**: 狭い袋小路ではなく塗れるセル数（`macroSt.n`）が豊富な広場と敵インク上書き（実質2倍のスコア差）を優先し、前方カバー率が72%に達した時点で `goalTimer` 満了を待たず即座に次の未塗り区画へ遷移する高速サイクル。  
3. [**【スプラ3】ナワバリバトルのやり方と立ち回り（GameWith）**](https://gamewith.jp/splatoon3/362091) & [**【スプラ3】ナワバリのおすすめ武器・最強武器ランキング（GameWith）**](https://gamewith.jp/splatoon3/362982):  
   - **リアルタイム優勢・ピンチ判定（`G.paint.coverage()` 連携）**: 実エンジンの `PaintSystem.coverage()`（O(1) 配列参照）から自軍と敵軍の塗り差（`teamLead`）を取得し、劣勢時は敵インク奪還を最優先し、終盤優勢時は敵陣深追い（`progress > 0.78`）を禁止してデスを防ぐ判断。  
   - **試合終了間際の塗装系ボム押し込み**: 残り4秒以下（爆発猶予2.4秒以上）で塗装力のあるサブウェポン（クイックボム `burst`・カーリングボム `curling`・タンサンボム `fizzy`）を投擲し、タイムアップ直前の塗りを上乗せするテクニック（ジャンプビーコンやスプラッシュウォール等の非塗装サブによるインク枯渇を防止）。  
   - **サブ系統別プロファイル（`botWeaponPaintProfile`）**: `LACT-450`（`WeaponStringerShort`）の超高速ノンチャ横拡散、[クーゲルシュライバー・ヒュー（Ballpoint Splatling Nouveau）](https://splatoonwiki.org/wiki/Ballpoint_Splatling_Nouveau)（`WeaponSpinnerDownpour`）の短射程・高拡散モード（チャージ率 `0.24` 解放）維持、`R-PEN/5H`（`WeaponChargerPencil`）の5発マガジン残弾撃ち切り、`エクスプロッシャー`（`WeaponSlosherLauncher`）の遠距離着弾仰角（`-0.06 rad`）、`フィンセント`（`WeaponBrushHeavy`）等の水平下向き広角連打（`-0.04〜-0.06 rad`）を個別定義。  
4. [**ナワバリバトルの勝ち方｜勝負はラスト30秒（ずんだもch）**](https://zundamoch.com/articles/article91.html) & [**Turf War \- Inkipedia**](https://splatoonwiki.org/wiki/Turf_War):  
   - **残り50〜30秒のスペシャル温存とラスト30秒の一斉解放**: 残り50秒〜30秒の非交戦時はスペシャルの無駄吐きを控え（`it.special = false`）、ラスト30秒に入った瞬間に未塗り・敵インク領域へ向けて塗装系スペシャルを解放する時間管理。  
   - **終了間際（ラスト6.5秒）の全面塗り切り替え**: 残り6.5秒以下では交戦中でもローラー横振り・ワイパー横斬り・長射程チャージャー中チャージ解放を優先し、ブザービーターで盤面を塗り切るロジック。

## 2. 実戦4v4ランダムブキ対決（旧ロジック4体 vs 現ロジック4体・重複なし）参考測定結果

> [!NOTE]
> 本節の実戦8戦（旧ロジック vs 現ロジック）は、初期試作段階（コミット `427f7aec`）において動作確認・定性評価のために実施された参考測定データです。固定乱数シードや機械可読ログによる完全再現可能なベンチマークではなく、またその後にプッシュされたコミット（`4856f1f` および本PR HEAD）でのランタイム変更（R-PEN・ソイチューバー・スピナーのチャージ契約整合、足元塗り照準ガード、SMIキャッシュ最適化等）を含んでいません。現PR HEADにおける挙動および契約の正当性検証は、第4節に記載の単体・統合・回帰テスト全件合格によって担保されています。

実エンジンに登録された全161種のカタログブキから、毎試合8丁を完全ランダム・重複なし（同一ブキミラーなし）で抽出し、ステージおよびチーム（Alpha `team=0` / Bravo `team=1`）を交互に入れ替えて実施した4v4実戦ベンチマークにおいて、**現ロジック（New Logic）が8戦8勝（勝率100%・平均塗りカバー率 `44.59% vs 28.66%`、平均リード `+15.93%`）を達成**しました。

| 試合 | ステージ | 現ロジック4体（完全ランダム・重複なし） | 旧ロジック4体（完全ランダム・重複なし） | 現ロジック塗り率 | 旧ロジック塗り率 | 塗り差 | 勝敗 |
| :---- | :---- | :---- | :---- | :---: | :---: | :---: | :---: |
| **\#1** | `tidewater` (`team=0`) | Painbrush BRN-Z (266p, 0k/2d) / Splash-o-matic (869p, 3k/1d) / N-ZAP '85 (1100p, 2k/1d) / Bloblobber (803p, 1k/2d) | E-liter 4K (145p, 0k/1d) / Explosher (1035p, 1k/1d) / Splatterscope (262p, 0k/2d) / Splattershot Pro FRZ-N (1046p, 5k/2d) | **44.44%** | 29.89% | **\+14.55%** | **WIN** |
| **\#2** | `kelpline` (`team=1`) | Snipewriter 5B (139p, 0k/0d) / Douser Dualies FF (998p, 2k/1d) / Dread Wringer (1396p, 3k/1d) / Splatana Wiper (514p, 1k/2d) | Nautilus 79 (789p, 1k/2d) / REEF-LUX 450 (720p, 2k/2d) / Dapple Dualies Nouveau (717p, 1k/1d) / Custom Splattershot Jr. (489p, 0k/1d) | **41.87%** | 35.25% | **\+6.62%** | **WIN** |
| **\#3** | `halyard` (`team=0`) | Carbon Roller Deco (398p, 0k/1d) / Gold Dynamo Roller (861p, 2k/0d) / Painbrush BRN-Z (429p, 0k/1d) / Custom E-liter 4K (62p, 2k/2d) | Recycled Brella 24 Mk II (190p, 2k/1d) / Octobrush Nouveau (276p, 0k/1d) / Custom Wellstring V (367p, 1k/2d) / .96 Gal Deco (592p, 1k/0d) | **39.63%** | 29.74% | **\+9.89%** | **WIN** |
| **\#4** | `cargo` (`team=1`) | Splatana Stamper Nouveau (684p, 1k/2d) / Slosher Deco (841p, 1k/1d) / Splatana Wiper RUS-T (624p, 0k/1d) / Foil Flingza Roller (220p, 0k/1d) | Custom Range Blaster (332p, 1k/0d) / Dapple Dualies NOC-T (569p, 0k/0d) / Douser Dualies FF (795p, 4k/0d) / Custom Jet Squelcher (503p, 0k/2d) | **31.21%** | 30.42% | **\+0.79%** | **WIN** |
| **\#5** | `scorch` (`team=0`) | Splattershot Pro FRZ-N (1044p, 8k/1d) / Inkbrush (230p, 0k/2d) / Hornz Dread Wringer (710p, 1k/1d) / Clawz .96 Gal (342p, 0k/0d) | Octobrush (366p, 0k/2d) / Tenta Brella CRE-M (276p, 1k/2d) / Tenta Sorella Brella (178p, 1k/2d) / Tentatek Splattershot (585p, 2k/3d) | **62.28%** | 16.94% | **\+45.34%** | **WIN** |
| **\#6** | `tidewater` (`team=1`) | Splash-o-matic GCK-O (969p, 1k/1d) / Painbrush BRN-Z (480p, 0k/1d) / Jet Squelcher (1113p, 5k/1d) / Ballpoint Splatling Nouveau (209p, 0k/1d) | Torrentz Hydra Splatling (379p, 0k/1d) / H-3 Nozzlenose VIP-R (1183p, 4k/1d) / Clash Blaster (280p, 0k/2d) / Tentatek Splattershot (424p, 0k/2d) | **45.03%** | 29.34% | **\+15.69%** | **WIN** |
| **\#7** | `kelpline` (`team=0`) | Dread Wringer D (1052p, 0k/1d) / Splattershot Pro FRZ-N (1078p, 5k/1d) / Nautilus 47 (506p, 1k/1d) / Splattershot Jr. (801p, 1k/1d) | Splatana Stamper Nouveau (729p, 1k/2d) / Bulbz Tri-Stringer (388p, 0k/2d) / Cometz Octobrush (336p, 0k/2d) / Annaki Splattershot Nova (742p, 3k/1d) | **54.21%** | 24.81% | **\+29.40%** | **WIN** |
| **\#8** | `halyard` (`team=1`) | Nautilus 79 (489p, 1k/0d) / Heavy Splatling (393p, 3k/1d) / Bamboozler 14 Mk II (211p, 0k/1d) / Inkbrush (394p, 0k/1d) | Custom Range Blaster (204p, 0k/1d) / Range Blaster (316p, 3k/1d) / Tri-Slosher Nouveau (519p, 0k/1d) / Neo Sploosh-o-matic (234p, 0k/1d) | **38.03%** | 32.89% | **\+5.14%** | **WIN** |

## 3. Patch方式準拠の最小差分ファイル一覧（PR #2019 HEAD 基準）

- `patches/splatoon3/runtime/bot-turf-paint.mjs`（新規追加：全11ブキ系統・サブ系統別プロファイル、マルチプローブエポックキャッシュ、4体味方非干渉＆広域プラザ評価・SMI整数キャッシュ、交戦時道作り・足元塗り照準ガード、ラスト30秒SP管理＆終了間際塗装ボム・全面塗り切り替え、Tacticoolerドリンク受取ヒト復帰）  
- `patches/splatoon3/bot-turf-paint-adapter.mjs`（新規追加：`src/game/bots.js` に対する `replaceOnce` アダプタ。本体コードを直接編集せず、`adaptBotPaintPitch` の直後に合成）  
- `patches/splatoon3/tests/bot-turf-paint.test.mjs`（新規追加：単体テスト、チャージ武器照準ピッチ検証ゲート、シューターwantPaintNow制約、ローラーpendingガード、ブラシエッジ入力、Tacticoolerドリンク受取ヒト復帰意図保持、LACT-450チャージ上限、足元塗り照準ガード、SMIキャッシュインプレース更新、および `MAP_LAYOUTS.kelpline` 実エンジン結合テスト）  
- `scripts/inkwave-source-composition.mjs`（既存ファイルへの2行フック追加のみ：`adaptBotTurfPaint` の import と呼び出し）  
- `scripts/ci/inkwave-test-suites.json`（必須CI接続：`quality` スイートに本PRの集中回帰テスト4ファイルを追加登録し、`ci-quality-gate.yml` の `npm run test:quality` 経由で毎回のPR検証にて常時実行されるよう保護）

## 4. 関連テストおよび回帰テスト検証結果（全129項目 PASS）

PR #2019 HEAD 上で関連テスト・回帰テストを実行し、**129項目すべてが100% PASS（失敗0）** することを確認しました。

### 必須CI / テストスイートランナー接続
- 必須CI `INKWAVE A+ Quality & Security Gate`（`.github/workflows/ci-quality-gate.yml`）内の `npm run test:quality`（`node scripts/ci/run-inkwave-test-suite.mjs quality`）にて、以下の集中テスト4スイートが毎回のPR pushで自動実行されます：
  ```bash
  node --experimental-vm-modules --test \
    patches/splatoon3/tests/bot-turf-paint.test.mjs \
    patches/local-quality/tests/bot-weapon-territory.test.mjs \
    patches/splatoon3/tests/bot-splatling-charge.test.mjs \
    patches/splatoon3/tests/bot-special-support.test.mjs
  ```

### 個別テストスイート結果
- `patches/splatoon3/tests/bot-turf-paint.test.mjs`: **20/20 PASS**（チャージ中ピッチ検証ゲート、シューターwantPaintNow制約、ローラーpendingガード、ブラシエッジ入力、Tacticoolerドリンク受取ヒト復帰意図保持、LACT-450上限0.14、足元塗り照準保護、SMIインプレースキャッシュ、実エンジン統合含む）  
- `patches/local-quality/tests/bot-weapon-territory.test.mjs`: **28/28 PASS**（R-PEN満充電連続発射、ソイチューバー0.22短チャージ、通常チャージャー0.70、30/60/120Hz制御）  
- `patches/splatoon3/tests/bot-splatling-charge.test.mjs`: **2/2 PASS**（スピナーTurf平均チャージ `0.8918` >= 0.85）  
- `patches/splatoon3/tests/bot-special-support.test.mjs`: **20/20 PASS**（Tacticooler自陣展開・ドリンク受取ヒト復帰含む全スペシャル）  
- `patches/splatoon3/tests/sub-mark-lifecycle.test.mjs`: **11/11 PASS**  
- `patches/local-quality/tests/bot-navigation.test.mjs`: **15/15 PASS**  
- `patches/local-quality/tests/bot-navigation-respawn.test.mjs`: **2/2 PASS**  
- `patches/splatoon3/tests/bot-combat-quality.test.mjs`: **6/6 PASS**  
- `patches/splatoon3/tests/bot-form-stability.test.mjs`: **6/6 PASS**  
- `patches/local-quality/tests/bot-paint-observation.test.mjs`: **9/9 PASS**  
- `patches/local-quality/tests/bot-edge-guard.test.mjs`: **10/10 PASS**  
- クオリティ監査: `npm run check:patches`（183/183 PASS）、`npm run test:ci-config`（17/17 PASS）、`npm run audit:migration`（133/133 CLEAN）全パス。