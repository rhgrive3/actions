# INKWAVE 集約候補のソース検証追補

原記録: [INKWAVE Splatoon 3 behavior journal](inkwave-splatoon3-behavior-2026-10-02.md)。

以下はレビュー済み追記をそのまま別文書に保存した履歴であり、記載された tree・試験時点の記録である。後続候補の全試験成功、実ブラウザ実行、最終 head の CI、公開・main 受入を新たに主張しない。

### 2026-10-25: Charger／Roller の受理状態と診断プローブの寿命

集約候補に選定した追加15ファイルの gameplay 修復と、独立した profiler 修復を記録する。本家の参照版は引き続き Splatoon 3 Ver.11.3.0。以下は INKWAVE のソース・限定した生成物の確認であり、新たな本家フレーム値や実機一致を確定しない。追記前の照合対象は tree `36eb82d3f8b3ccdd5ec54990d5b1161b3518acb4`。

- Charger: `audio-adapter.mjs` と `queue-network-ui-adapter.mjs` の両方で、`kind=catalog` でも `behaviorKind=charger` の武器を既存の charge 開始判定へ含める。remote の開始エッジで一度だけ発音し、反復する charge loop を作らない。他の catalog family の分類は変えない。
- Roller: `issue-eight-followup.mjs` は更新後のドラム支持状態も確認し、未支持の最初の接地 tick に前フレーム由来の dash 時計を持ち越さない。`roller-contact.mjs` と adapter は追加 flag を固定の bit28（1<<28）に割り当て、owner の suspended hold を伝え、受理した owner・life・武器 epoch とサンプルから remote の接触表示／音を判定する。武器変更、早期 return、死亡・復活、削除・採用、owner 移行、dispose で旧状態を無効化する。held／grounded の意味、既存 bit27、PROTO2、COMPAT、26列の行形式は変更しない。
- Object Shredder: `object-gear.mjs` は受理済み adoption sidecar の装備 identity と sequence を優先し、Dualies turret と共用される bit27 だけから装備を推定しない。sidecar が欠落／無効な場合は既存の legacy flag fallback に戻る。これは「未装備」の証明ではなく、古い loadout の再利用もしない。旧 receiver と legacy 経路の bit27 の曖昧さは未解決として残す。
- `snapshot-guard.mjs::validRemoteActorPose` は二つの走査だけを昇順 index loop に置き換えた。有限値・flag・座標境界、検証順序、短絡、例外を保ち、検証省略やキャッシュを追加しない。改変した Array iterator hook を呼ばなくなる点は一般的な JS 同値性の例外。別の Node22/V8 単独計測は一時割当 1,888.118→96.002 bytes/actor-frame を示したが、残余はゼロではなく、ゲーム全体のメモリ上限や FPS 改善を示さない。

追加15ファイルの実行記録は Node22 の単一 serial invocation で85/85成功（canonical 80件と独立した元の対照5件）。gear／suspension 修復をそれぞれ外した対照は意図した意味論 assertion で失敗した。これはネットワーク実機や音の聴感確認ではない。

`patches/local-quality/range-frame-profiler.mjs` は、dispose 後に遅延 import が解決して frame wrapper／PerformanceObserver を再設置する不具合を、disposed flag と import continuation の guard で防ぐ。旧 probe の遅着が replacement を汚染しないことも含め、source 9/9、実際の新規 emitted/minified profiler・tracer 9/9が成功した。直後に dispose する fixture の3 frame では元の戻り値と frame binding を保持し、余分な timing read は0。実端末 CPU 計測ではない。

新しい限定合成では885入力と343 module の adapter closure を照合し、116 module の合成、661 module の静的 link、640件の JS/CSS minification を確認した。前回出力との差は profiler だけで +17 bytes、残る663 per-file 出力と native 3 bundle は一致した。全アセット build、完全な build revision／service-worker identity の生成、browser・GPU・実機・集約 exact-head CI の合格へは読み替えない。

QA の追加 `weapon-family-160-acceptance.test.mjs` は25/25成功。65 main＋95 alternate の160 ID roster と、11 family にまとめた各 ID の実発射経路を確認する。native Charger は通常弾とは別の finite-flight 配列を観測し、heavy Splatana はソース由来の通常23F／step37Fという別の遅延を解放 tick とともに待つ。衝突は no-hit stub のため、special 発動、命中・damage、network、見た目、性能の証明ではない。従来の強い handoff／allocation／special／queue 回帰を置換せず保持した。公開、main 統合、最終 build・CI・実ブラウザ受入は別の確認段階として残す。

profiler の browser QA は、既存 Range job 内に同一 origin の隔離 iframe を使う寿命検査を追加する候補として選定した。実際に配信する profiler／tracer の hash を build manifest と照合し、通常初期化・遅延 import 前の dispose・旧 probe と replacement を検査する。既存 Range 検査と live game の所有関係を保持する。3ファイルの syntax 検査と10件の receipt／source contract 検査は成功したが、これらはブラウザ DOM の実行ではない。実際の hosted Chromium 実行と最終 head の CI は未確認であり、公開・main 受入済みとは扱わない。
