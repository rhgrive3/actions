# INKWAVE 挙動パッチ

公開版 `inkwave-public/` を変更せず、ビルドしたサイトにだけ挙動の変更を適用する。本体の取得、接続アダプター、挙動、数値を別々に管理する。

**スプラトゥーン3との完全一致を認定するものではない。** 参照版は Ver.11.3.0。数値の一次抽出データは Leanny/splat3 のコミット `7280ff9cde8bb1c5dcef46c700c326471584d2e6` に固定した。未公開の既定値、座標スケール、実機の操作感は確認が必要である。

## 構成

| ファイル | 役割 |
| --- | --- |
| `adapter.mjs` | 本体とパッチの接続。元ファイルを編集せず出力だけ変換する |
| `upstream-lock.json` | 接続先の SHA-256 と検証した本体コミット |
| `bootstrap.mjs` | 設定とパッチを読み込み、適用後にゲームを起動する |
| `runtime/clock.mjs` | 60 Hz の固定更新、経過時間と入力の保持 |
| `runtime/movement.mjs` | イカロール、イカノボリ、被弾処理の状態管理 |
| `runtime/movement-motion.mjs` | イカロール・イカノボリ・スーパージャンプの表示と状態の同期 |
| `runtime/weapon-motion.mjs` | スライド後の構え、バケツの振り、リセット、フローの発光 |
| `runtime/weapon-detail-motion.mjs` | 実際の発射に同期した反動、チャージ後の復帰、バケツ内のインク、スピナー停止 |
| `runtime/bomb-motion.mjs` | 手元のボム、実際の投擲位置、予測軌道と放す姿勢 |
| `runtime/flow-motion.mjs` | フロー開始・延長・失効の粒子と外周表示、描画パスとリソースの分離 |
| `runtime/walk.mjs` | 足の接地・踏み出し・停止・方向転換、腰・上体の歩行校正 |
| `runtime/carry-motion.mjs` | シューターの歩行・待機・射撃・復帰で連続する両手の支持 |
| `runtime/jump-motion.mjs`, `runtime/landing-motion.mjs` | 通常ジャンプの脚と着地の圧縮・復帰 |
| `runtime/swim-motion.mjs`, `runtime/wall-motion.mjs` | 通常の泳ぎ・方向転換、壁登り・イカノボリの表示 |
| `runtime/form-motion.mjs` | ヒト・イカへの変形と中断時の復帰 |
| `runtime/squidroll-motion.mjs`, `runtime/superjump-motion.mjs` | 実際のアクション状態に従うイカロールとスーパージャンプ |
| `runtime/dualies-motion.mjs` | マニューバーのスライドと直後の構え |
| `runtime/roller.mjs` | ローラーの縦振り・横振り、振り下ろしと回復を射撃時刻へ同期 |
| `runtime/roller-detail-motion.mjs` | 横振りの巻き込み方向と、実際の攻撃終了後の姿勢 |
| `runtime/hit-spawn-motion.mjs` | 被弾・復活の表示と操作復帰に残る姿勢の補正 |
| `runtime/idle-motion.mjs`, `runtime/emotes-motion.mjs` | 待機の身振り、勝敗・メニューの姿勢と中断 |
| `runtime/special-motion.mjs`, `runtime/face-motion.mjs` | 既存スペシャルの表示復帰と、実際の照準に従う視線 |
| `runtime/weapons.mjs` | チャージ保持・貫通、縦振り、スライド後射撃、弾の減衰 |
| `runtime/swim-stealth.mjs` | 低速潜伏とイカニンジャの飛沫/表面跡、所有者/リモート表示の分離 |
| `runtime/gear.mjs` | 3 部位×4 スロット、AP、効果曲線、保存と装備画面 |
| `runtime/resources.mjs` | インク回復の待ち時間、敵インク、HP 回復 |
| `runtime/flow.mjs` | フローの発動・延長・失効。強化量等は暫定設定 |
| `runtime/scoring.mjs` | 壁を除く、露出した床の実面積による塗り判定 |
| `runtime/ui.mjs`, `runtime/render.mjs` | 公開版のメニュー・影無効時の起動不具合を補正 |
| `profile.json` | 挙動の設定、数値の出典との対応、未確認事項 |
| `reference/curated-numbers.json` | 抽出した値、JSON ポインター、出典ハッシュ、未知の項目 |
| `reference/numeric-status.json` | 各設定数値の出典・換算・校正状態 |
| `tests/` | 公開版の Actor、WeaponRunner、Projectiles を使う回帰試験 |

ギアは移動速度、メイン・サブ効率、回復、敵インク軽減、アクション強化、スペシャル増加・減少、復活・スーパージャンプ短縮、サブ性能の通常 12 種と、フク基本スロット専用のイカニンジャ。個別ブキのギア適用規則、追加のギア種類、サブ・スペシャル構成まで再現できたとは扱わない。

## 検証とビルド

Node.js 22 以降と esbuild が必要。サイトでは生成された出力ディレクトリを配信する。元の `inkwave-public/index.html` の直接配信にはパッチが含まれない。

```sh
node --experimental-vm-modules scripts/check-inkwave-patches.mjs
node scripts/build-inkwave.mjs inkwave-public _site
```

検証は接続先のハッシュ、数値の対応と換算、全設定数値の記録、変換後の構文、回帰試験を確認する。ビルドは検証した本体にだけ適用し、成功した出力だけで既存サイトを置き換える。`inkwave-build.json` に入力と配信ファイルのハッシュ、ビルドツールのバージョンを残す。パッチの読込失敗は起動エラーになる。

コード・設定・アセットは同じ `_versions/<ハッシュ>/` から読み込む。更新後に古いキャッシュのコードと新しい設定が混ざることを防ぐ。ビルド先は実際のパスを確認し、シンボリックリンク経由でも本体やパッチのディレクトリを上書きしない。

ブラウザ確認には Playwright 1.62.1 と Chromium を使用する。出力・証拠・ブラウザ用キャッシュには永続ストレージを指定する。

```sh
node scripts/check-inkwave-browser.mjs --site <ビルド出力> --evidence-dir <証拠ディレクトリ> --profile-dir <ブラウザ用ディレクトリ> --exact-source
```

`--exact-source` は入力を現在の Git コミットと照合する。未コミットの候補を試す場合はこのフラグを外し、結果の `sourceSha` が未確定であることを記録する。試験は実際に読み込むファイルのバイト列、起動、装備の保存と適用、幅 375 px の画面、歩行、20 Hz 相当の時間経過、実際の床への塗りを確認する。読み込んだ実ゲームのActor・WeaponRunner・Characterで、スライド後の構え、バケツの振り、リセット、フローの発光も確認する。位置を保持する表示試験は移動物理の証拠とは区別する。Chromium の確認を Switch や iOS の確認として扱わない。

## 本体を更新する手順

1. 新しい本体を別の永続ディレクトリへ取得する。比較元とローカルの変更を保存する。
2. `node scripts/review-inkwave-upstream.mjs <候補のディレクトリ>` で接続先の差分を調べる。これは読み取りのみで、ロックを書き換えない。
3. 変更のある接続先のコードと呼出順をレビューし、必要なら `adapter.mjs` と各パッチを修正する。ハッシュだけを更新して合格扱いにしない。
4. レビューした本体のコミットと接続先ハッシュを `upstream-lock.json` に記録する。
5. `node --experimental-vm-modules scripts/check-inkwave-patches.mjs --source <候補のディレクトリ>` を実行する。候補の実コードで試験する。
6. 候補をビルドし、その出力をブラウザで起動して移動・射撃・装備を確認する。配信成果物のハッシュを記録する。

CI の取得・検証・Pages ビルドもこの互換性チェックを通る。接続先が変更されている場合は自動取得の取り込みとビルドを止める。互換性が未確認の本体にパッチなしで切り替わることを防ぐ。

スプラトゥーン3の参照版を更新する際は、抽出値と公式変更点を確認し、`reference/`、数値の対応、設定を更新する。数値の変更をレビューした後に `node scripts/sync-inkwave-numeric-status.mjs --write` で記録を更新し、回帰試験を実行する。

## 未確認の境界

歩行・泳ぎの加減速、停止距離、反転、ジャンプ・着地、足運び、弾の制動・塗り形状、チャージの既定フレーム値、ギアの全適用規則、イカロールの発動閾値・防御、フローの発動閾値・強化量、復活とスーパージャンプの全経路、ジャイロ・通信・実機は未確認部分を含む。イカロール等のロジックは実装したが、本家の全数値とモーションに一致した証拠はまだない。

スピナーは第1段階 48 F・80 F の射撃、第2段階 72 F・160 F の射撃を使う。第2段階の時間を累積時間とする解釈、部分チャージの補間、キャンセル時のインク精算は引き続き実機確認が必要である。潜伏で溜めと射撃をキャンセルできるようにした。

`slam` は INKWAVE 固有のスペシャルであり、ウルトラチャクチの拳を含む動作を再現していない。既存の AI とオンライン通信も本家と同一のロジックではない。

詳しい値と根拠は [数値資料](reference/README.md)、差分の状態は [比較報告](../../reports/inkwave-splatoon3-behavior-2026-10-02.md) に記録する。

## モーションの比較

`runtime/walk.mjs` の表示設定は `profile.walkMotion` に集約する。[歩行参照](reference/walk-motion-2026-10-02.md)、[ローラー](roller-behavior.md)、[移動・回復](../../reports/inkwave-movement-resources-2026-10-02.md)、[ブキ・ギア・Flow](reference/weapons-gear-flow-audit-2026-10-02.md)を変更時に見直す。数値の根拠が得られるまで校正値を抽出済み値へ昇格しない。

通常ゲームのブラウザ確認に加え、同じビルドを `node scripts/check-inkwave-motion.mjs --site _site --evidence-dir <永続保存先> --profile-dir <専用プロファイル>` で描画する。小さな入力、前後・横移動、停止、方向転換、前後・横の移動射撃の10条件で、実際の膝・足首・靴底・IK値と画像を保存し、遊脚・接地・腰揺れの回帰を検出する。歩調の整合と後ろ脚の畳み方の数値は内部校正であり、公式の非公開関節曲線とは区別する。

2026-10-02 の追加確認では、各担当が任天堂の映像から実際の動作を比較し、別の担当が接続後の実コードを検証した。[イカ系の比較](reference/movement-motion-comparison-2026-10-02.md)、[ローラーの比較](reference/roller-motion-comparison-2026-10-02.md)、[その他ブキの比較](reference/weapon-motion-comparison-2026-10-02.md)に、ブキ・動作・確認できた状態と未知の関節曲線を分けて記録した。歩行では接地の歩調、後ろ脚の畳みと靴底の向きを修正した。

`tests/full-motion-install.test.mjs` は本番のインストーラーを一つのモジュール環境で適用し、全表示パッチを組み合わせた構え・握り・リセット・イカからの復帰を検査する。30/60/120 Hz の描画間隔でも、60 Hz のゲーム更新ごとに姿勢・銃口・髪のボーンが同じになることを確認する。公式映像には操作開始時刻・装備・収録版が揃わないものがあるため、内部の校正値を本家の確定値として扱わない。

各追加モーションの観察と未知の範囲は `reference/*-motion-comparison-2026-10-03.md` に記録する。[ボム](reference/bomb-motion-comparison-2026-10-02.md)、[フロー](reference/flow-motion-comparison-2026-10-02.md)、[ブキの詳細](reference/weapon-detail-motion-comparison-2026-10-02.md)、[両手の支持](reference/carry-motion-comparison-2026-10-03.md)も参照する。接地中の足首には遊脚用の短縮を適用せず、ネイティブ IK と接地位置の一致を保つ。各パッチは本体から分離し、接続先の変更時には同じ互換性チェックを通す。

`scripts/check-inkwave-motion-detail.mjs` はボム・フロー・各ブキの14条件を実際の WebGL で描画する。描画した頂点と手の距離、同じフレームでの表示・非表示の画素差、開始・延長・失効・リセットと解放後の資源を確認する。この表示用の診断入力は、実機の操作感や通常ゲームの移動物理とは別の証拠である。検証器自身の欠測・NaN・非表示・古い成功記録の反例も、通常のパッチ試験から実行する。
