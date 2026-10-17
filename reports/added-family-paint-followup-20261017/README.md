# 追加ブキの床塗り・飛沫: 時刻と境界条件の再監査

比較基準は Splatoon 3 **11.3.0**。既存カタログの固定ソースと前回の [出典照合](../added-family-paint-20261017/source-verification.json) を継続する。変更前mainは `e6a27000dfd36c2d8ddb24bd3a167ac984d9623b`。ギアなし・ヒト状態。静止射撃は床から高さ8、スライドは接地、壁起爆は高さ8で確認。本家実機での比較は未実施。

## 修正した差分

| 対象・再現条件 | 原因とプレイへの影響 | 実装・確認状態 |
| --- | --- | --- |
| 弓・ワイパー・傘の落下飛沫を30/60/120Hzで比較 | 30Hz更新の最初の物理ステップで生まれた飛沫が、その更新の残り時間を消費せず、途中位置と着地が遅れた | `main-weapon-catalog.mjs` が生成時の残り時間を渡し、`weapon-catalog-adapter.mjs` が描画前に消費。描画関数自体は時間を進めない。実際のinstance行列と飛沫座標も照合 |
| 通常・キャンプ等の散弾の一部が先に止まる | 各散弾を一描画分ずつ進める順番が、共有飛沫の生成時刻に混入 | `added-family-paint.mjs` が距離到達・終了の参照フレームを記録し、全員の成立時刻を採用。重心・活性率の既存モデルは維持 |
| 両チームの飛沫が低FPSの一更新内で別々の参照フレームに着地 | キュー順に塗ると、先に着地した飛沫が後の飛沫を上書きする | `blaster-flight-paint.mjs` が着地イベントを時刻順に適用。反転したキュー順で床所有・両者の累積得点を検査 |
| 同時に600個の落下飛沫を生成 | 512個のキュー上限が未着地の塗りを無条件に捨てる | authoritativeキューの破棄を撤去。既存の寿命240参照フレーム・水面下退場・描画48個上限は継続。全600個の着地を確認。退場時は線形の安定圧縮に変更 |
| チャージ矢が高い壁に刺さって起爆 | 下向き床probeだけで爆発塗りを処理し、壁に塗られなかった | 明示された爆発半径・`PaintOffsetY` を既存の球状塗り経路へ接続。3本それぞれ一度の壁起爆、離れた床への得点なしを確認。公式の壁マスクそのものの復元ではない |
| ドライブ・デンタルを空中で8回振る | Shooter用の足元スロット処理を通り、下の床へ即時に投影 | 分岐をshooter/splatling/dualiesに限定。ワイパーは専用の足元・落下飛沫経路を使用。高さ2で8発を実際に生成し、着地前の床塗り0を確認 |
| 連続スライド・サブ操作による中断 | 最後の距離サンプル未満の区間を、新しいスライドまたはcancelが破棄 | `slidePaint(..., ending=true)` で前の終端を確定。接地時の終端中心を検査 |
| 和傘・スパイの傘を保持 | 明示された`FootSplashPaintRadius/WaitFrame/SpanFrame`が未接続 | 近傍の接地床だけへ接続。開閉時の浮動小数誤差による1フレーム遅延も防止。空中・高い位置からの床投影を抑止。span=0の一回処理は下記の解釈モデル |

## 検証と限界

- 新しい境界検査16件。Actor→WeaponRunner→Projectiles→Physics→CPU Paintのproduction compositionを使用。追加の通常・キャンプ・スパイの途中時刻検査も含む。前回の追加28件と合わせ、minified buildで44件成功。
- 変更前mainへ16件を適用すると14件失敗・2件成功（最初の13件と追加の傘3件を分けて実行）。LACT途中位置のケースと安定した生存順は以前から成功しており、改善成果へ数え直していない。
- Chromiumで実際のCharacter・Physicsを使う15種×3更新頻度=45ケース。最初の1秒の共通30時点で、飛沫位置・参照フレーム・着地数・床セル数・得点を照合。3秒後の床所有配列も一致。可視飛沫が実際の描画instance行列に含まれることを確認。`browser.json`。
- 関連回帰493件は492成功・失敗0・skip1（既存Bluefinアセット不在）。Pagesのlocal-quality1062件は1053成功・skip9、practice/loading90件は85成功・skip5。source identity2件、loading Python harness3件成功・skip1、quick互換性、startup budgetも成功。
- 既存のcatalog総合ブラウザ検査とseven-claimsも成功。以前停止したMist probe等の修正は最新mainの別変更であり、今回の成果に含めない。
- CPU/GPU paint mask検査: 124ケース、1512 hash queries、15295セル、unsupported負例4261件。body242ケースでは差分9セルは既定の同距離tie、CPU-only/GPU-onlyは0。これは共有mask経路の検査であり、本家の画像マスク一致の証拠ではない。
- 各検査の実行結果とbuild識別子は `verification.json`。`inkwave-main-weapons.yml`でsource・minified・ブラウザ時系列を継続検査する。

未確認事項は前回記録から継続する。`ADDED_PAINT_MODEL`の省略値、SplitNum位相、活性散弾率からの線形補間、乱数分布、Nintendoの床/壁マスク、傘の斜面・段差追従は本家実機で確認していない。通常/キャンプは足元の待機・間隔フィールドを省略しているため推定値を補っていない。スパイガジェットの明示span=0は無限ループや毎更新の大量塗りを避ける一開傘一回の解釈であり、本家のゼロ値セマンティクス確定ではない。30/60/120Hzの一致を他の全フレーム間隔・全ネットワーク順序への保証には拡張しない。今回も「本家と完全一致」「改善余地ゼロ」とは判定しない。

再実行:

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/catalog-added-family-paint.test.mjs patches/splatoon3/tests/catalog-paint-timing-boundaries.test.mjs
node scripts/build-inkwave.mjs inkwave-public work/release
INKWAVE_BUILT_SITE=work/release node --experimental-vm-modules --test patches/splatoon3/tests/catalog-added-family-paint.test.mjs patches/splatoon3/tests/catalog-paint-timing-boundaries.test.mjs
node scripts/check-inkwave-added-family-paint-browser.mjs work/release work/added-family-paint-followup.json
```
