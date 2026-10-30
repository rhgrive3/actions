# Native weapon target calculation

基準は `84453765039f040cb937f6beb7fdb58d54f169dd`。本変更は、native右腕IKが動かず、dualの左武器アンカーにも使われないフレームで、native武器目標の計算を省略する。sourceの武器整列は独自の目標を作る。5本のsway spring、武器アニメーション、pivot、左腕IK、顔・髪・タンク・指は同じ順序で処理する。

`patches/local-quality/firefight-tier-budget.mjs` の既存Character変換に条件を加えた。sourceの足・胴体を省略する既存条件、サンプリング範囲、offscreen頻度は変更していない。

## 再現

Node.js 22.12以上。リポジトリのルートで実行する。

```sh
node --experimental-vm-modules --test patches/local-quality/tests/native-weapon-target.test.mjs
node --experimental-vm-modules scripts/benchmark-inkwave-native-weapon-target.mjs --output .benchmark-evidence/native-weapon-target.json
```

テストは本物のActor/Character、実source bank、他の全現行アダプターを2つの独立VMで使う。物理はfixtureの平面、自色inkであり、全対戦・renderer・GPUを実行するものではない。基準側だけ、右武器目標のブロックを基準SHAで合成した1,895 byteの固定fixtureに戻す。fixtureのSHA-256は `3509256a7dcaa32cc9a9a421d56e220eb1b21533a09e88602fe5d7983a2100ef`。Character全ファイルや他領域を過去版に戻さない。source bankを読み込めない場合は失敗し、stubへ切り替えない。

## パリティ

初回実験は [parity-initial.json](parity-initial.json)。30/60/120Hz、計1,593 frame、全スキン頂点75 checkpointで差分0だった。source有効/無効、手動source seek、dualies/charger/slosher/roller、空中/着地、実Actor/WeaponRunnerの発射、死亡を含む。各frameで全node local TRS/world行列、全bone行列、P/sp全値、顔uniform、actor/runner/Character scalar、足・source接触、実projectileを比較した。武器・左右腕・muzzle nodeも全node比較に含まれる。

[リポジトリ版回帰ログ](regression.log) は1/1成功、skipなし（[構造化記録](regression.json)）。source所有351 frame、source無効717 frame、dual126 frameを実際に通過した。同じ1,593/75シーケンスを維持し、銃口getter3種、照準銃口、head、actor statsの明示比較と、source/native/dual経路を実際に通った条件も加えている。fixtureを読むSHA検証と旧目標ブロックの復元も毎回実行する。

## 限定CPU計測

8体の本物Characterに対し150 warmup tick後、120回の60Hz更新を9組測った。組ごとに新旧順を交互にした。rendererと対戦全体のsimulationは含まない。

- [初回全9組](benchmark-first.json) は他laneのブラウザ処理との重なりを否定できないため採否に使わない。個別sampleは捨てず全体を保存した。
- [取り直し全9組](benchmark-repeat.json) の測定区間は2026-10-30 14:09:49.301–14:10:00.737 UTC。9組全て短縮し、組ごとの時間比率の中央値は0.9749398（2.506%短縮）。時間の別々の中央値は旧604.306ms、新586.095ms。

保存値はPR整理前のscratchハーネスで得た値。上記tracked benchmarkは同じ更新・warmup・交互9組のループを使い、基準のCharacter全ファイルsnapshotを固定対象ブロックへ縮小した再現用入口である。整理後の追加時間計測は行っていない。実バトル全体の速度、ブラウザ、端末FPS、GPUの改善率には読み替えない。全体計測は親作業のstrict harnessで別途確認する。

処理・見た目の変更を意図していない。スプラトゥーン3の新たな実機同等性の主張はない。
