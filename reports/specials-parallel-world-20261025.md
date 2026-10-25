# Triple Inkstrike / Super Chump の数値配置計算

基準: PR #1876 head `6dacd47095352cfd600f9c83012c71a2f298a460`。対象は `patches/splatoon3/runtime/all-specials.mjs` 内の配置用三角関数だけ。open PR #1870 head `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da` の同ファイル差分を照合し、既存のpaint-disk layout/Wail/target-selection等の最適化は重ねて実装していない。

## 変更した処理

- **トリプルトルネード**: 既存の20方向の `sin/cos` を初回にだけ評価し、非公開の不変な数値配列に保存する。半径、ワールド座標、接触面、raycast、groundHeight、paint seedと塗り加算は毎回元の順序で計算する。最初の単一点の段階も従来と同じ座標を使う。
- **デコイチラシ**: 既存の12点楕円の回転・横17.5/縦10の係数を、activation状態が保持する不変な数値配列へ保存する。回転に使うseedの値が変われば再生成する。狙い・位置・向き・ステージ情報はキャッシュしない。毎回のプレビューと実発射で、全接触面を問い合わせ直す。

保存するのは数値の方向係数だけで、Vector、Physicsの応答、Levelの高さ、着地点そのものは保存しない。プレビュー中に足場が動く場合や、同期的な地面問い合わせから別の配置計算へ再入する場合も元の計算結果を保持する。新しい楕円配列はactivation状態とともに解放対象となり、モジュール全体では40数値のトルネード円を1つだけ保持する。

## 決定的な削減量

| 条件 | 基準 `sin` / `cos` 呼出し（それぞれ） | 変更後（それぞれ） |
| --- | ---: | ---: |
| トルネード3本、各0〜50Fを2Fごとに塗る26パルス | 1446 | 20 |
| デコイ2秒プレビュー120Hz＋実配置1回、途中でseedを1回変更 | 2892 | 24 |

これは呼出し回数の削減であり、ゲーム全体のFPS改善率ではない。並行作業中の壁時計の値は性能根拠に採用していない。直列の局所CPU計測は下記コマンドで再実行できる。

```sh
SPECIAL_WORLD_BENCH=1 node --test \
  --test-name-pattern='optional isolated numerical-plan benchmark' \
  patches/splatoon3/tests/special-world-circle-plans.test.mjs
```

この任意ベンチマークは、ウォームアップ2回の後、10000プレビュー配置を前後交互に9回ずつ計測する。実際の配置関数とVector演算を使うが、地面問い合わせは固定の軽いsinkであり、実ステージ全体のCPU時間ではない。raycastそのものの削減は行っていない。

統合後に親が確保した直列計測枠で、実際の基準・候補のminify済みモジュール同士を同じVM loaderで評価した。10000回の中央値は **137.158485 → 75.767850 ms（約44.8%短縮）**、両方の累積出力checksumは `546012.6409223394` と一致した。Mathの呼出し監視は計測中無効。これはVMを使った局所CPU計測で、実ブラウザ・ゲーム全体のフレーム時間・実端末FPSの短縮率ではない。[9回ずつの生データとartifact identity](specials-parallel-world-20261025-benchmark.json)。

最初のcandidate-only emitted診断では、元oracleがhost realm、候補がVMで実行されていた。この異なる実行環境の時間差は比較に採用しない。実際の生成物を時間比較するときは、下記の2つの環境変数を必須にし、同じloaderとfixtureで両方のモジュールを実行するよう修正した。

## ローカル検証

1. 新規 `special-world-circle-plans.test.mjs`: **4 PASS、失敗・skipなし**。基準の2関数をfixtureへそのまま保存し、候補の実関数をAcornで読み出して比較する。トルネードの全stamp、query列、seed、個人塗り加算と、30/60/120Hzで変化する地面・狙い・seedのデコイ全着地点を比較する。remoteの無権限経路、キャッシュ更新、ネストした同期地面問い合わせも含む。
2. 既存 `all-specials.test.mjs` の関連5件: **5 PASS、失敗・skipなし**。デコイ爆発時の塗り・攻撃、SPUによる範囲とHP、ソナーとの接触、固定クロック・clearを確認。
3. 既存 `special-device-flight.test.mjs` / `special-triple-source-1130.test.mjs`: **19 PASS、失敗・skipなし**。実Actor/Projectilesの投擲、接触、82F開始、11回の攻撃パルス、2F塗り、デコイのプレビューと実配置、上下の面の選択を含む。
4. runtime構文と `git diff --check`: PASS。

```sh
node --test patches/splatoon3/tests/special-world-circle-plans.test.mjs
node --experimental-vm-modules --test --test-concurrency=1 \
  --test-name-pattern='Triple Inkstrike|Super Chump|catalogue world damage|world effect clock' \
  patches/splatoon3/tests/all-specials.test.mjs
node --experimental-vm-modules --test --test-concurrency=1 \
  patches/splatoon3/tests/special-triple-source-1130.test.mjs \
  patches/splatoon3/tests/special-device-flight.test.mjs
```

ログは作業worktreeの `.ci-scratch/specials-world/` に保存した。ブラウザ・通常ビルドの統合確認は親の統合工程で別途実行する。このlaneからGitHub Actions・外部書込み・公開配信は行っていない。

### 実際の生成物を選ぶoracle

`SPECIAL_WORLD_EMITTED` を指定すると、sourceの候補関数へフォールバックせず、実際の最適化済み `all-specials.mjs` を丸ごとVMで評価する。manifestのinput/artifact seal、選択したartifactのSHA-256とrevisionコピーを検証し、minify後のprivate関数は固有のASTプロパティで特定する。基準は従来どおり保存済みの元2関数。地面・塗り・Vectorのfixtureは同じで、関係しないimport ownerだけがsink（Inkjetの初期化用socketを除き、関数呼出しは例外）となる。ブラウザや完全なdependency graphの実行を代替するものではない。

```sh
SPECIAL_WORLD_EMITTED=/absolute/path/_site/patches/splatoon3/runtime/all-specials.mjs \
  node --experimental-vm-modules --test \
  patches/splatoon3/tests/special-world-circle-plans.test.mjs
```

```sh
SPECIAL_WORLD_BASELINE_EMITTED=/absolute/path/_site-before/patches/splatoon3/runtime/all-specials.mjs \
SPECIAL_WORLD_EMITTED=/absolute/path/_site-after/patches/splatoon3/runtime/all-specials.mjs \
SPECIAL_WORLD_BENCH=1 node --experimental-vm-modules --test \
  --test-name-pattern='optional isolated numerical-plan benchmark' \
  patches/splatoon3/tests/special-world-circle-plans.test.mjs
```

このloaderの追加ではruntimeを変更していない。source側4件と、`--experimental-vm-modules` 時の完全source-module loader確認を含む5件をPASSした。親の統合ビルド後には基準・候補の実際の生成物同士による同じ4件もPASSした。基準artifactのinputは保存元の `6dac` all-specials入力SHA-256と照合し、host/VMを混ぜたemitted時間比較は拒否する。

## 本家との比較と限界

参照は既存のSplatoon 3 Ver.11.3.0 `WeaponSpTripleTornado` / `WeaponSpFirework` と、同runtimeに記録されている公開メカニクス資料を継承する。トルネードの2F塗り、半径0.5→7の50F成長は既存の参照値。20点の床配置と、デコイ12点の17.5×10楕円・端での再配置は既存INKWAVEの較正で、本家の完全な配置式が抽出済みという意味ではない。

再現操作は、トルネードを地上でサブ離しして3本投げること、およびデコイを構えたまま狙い・足場を動かしてから発射すること。今回の変更でこれらの入力、発射/接触/爆発時刻、移動、ダメージ、塗り、SPU、ゲージ、通信、乱数順序は変更しない。原作の着地点分布、完全な軌跡、実GPU/Safari/iPad/本家実機の性能と画面一致は新規検証していない。共有の挙動比較記録への統合は親が担当する。
