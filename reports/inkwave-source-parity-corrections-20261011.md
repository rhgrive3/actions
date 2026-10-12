# INKWAVE サブ・スペシャルの性能照合と修正（2026-10-11）

対象は公開版 `inkwave-public/` のサブ14種・スペシャル19種。モデリングと本格的なアニメーションは依頼の範囲外。名称は本家の日本語名を暫定使用する。参照はDriveの公開資料アーカイブとSplatoon 3 11.3.0のパラメータ、およびWikiの条件付き測定値。主武器の追加機能は今回の目的ではないが、サブ・スペシャルの装甲に対する命中倍率の経路を確認するため関連する命中処理も修正した。

## 根拠

- Driveフォルダ: https://drive.google.com/drive/folders/1iAhs_iWB0jfPkAB3lgUT9le95T-B323b
- `Splatoon-public-sources-part-02-of-19.zip` SHA256: `1a4fe5b48f47de60426a474034cf3e2aa61acf5f7eaf4b947a9e502e7d52ef66`。
- 公開パラメータ: https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130
- 全33種のファイル照合記録: `reports/catalogue-1130-receipt.json`。
- 設置物・装甲倍率表: `misc/spl__DamageRateInfoConfig.pp__CombinationDataTableData.json` SHA256 `eb536e1c2cf4bb280c2898fdd9882fe3eb6c8f7a47c5302f0ff7fe755b6ef64a`。115行×9対象に加え、グレートバリアの外殻・弱点の115行×2対象を固定フィクスチャと全セル照合。WeaponInfoMainの65武器のDefault/ExtraInfo選択行も資料と照合。
- 距離の単位: Wikiのシステム詳細仕様は50DU=5m=試し撃ちライン1本と定義する。Point Sensorのraw6mとWiki1.2ラインは一致する。MistのWiki1.05ラインは5.25mへ変換し、1.05mと取り違えない。根拠: https://wikiwiki.jp/splatoon3mix/システム詳細仕様
- Wiki性能表はバージョン・ギアAP・条件を区別し、raw値と矛盾する場合は差分を残す。例: トーピードの軽減はBombH、クイックボム・タンサンボムはBombL。Point Sensor GP30は838F。

## 実際の処理に反映した修正

| 変更 | 実装 | 操作・再現 | プレイへの影響 | 検証状態 |
|---|---|---|---|---|
| サブごとのインク節約・軽減・マーキング曲線、Mist時間・移動/ジャンプ、Wall400F/HP減衰、段階ダメージ、飛行塗り | all-subs / sub-resistance | AP0/30/57で発動、30/60/120Hzで進行 | インク消費・持続・被弾・設置物破壊の違いを是正 | 詳細はsubs-parity-20261011.md。世界座標・標的選択等の未確認を残す |
| Point Sensor時間をimpactから計算、GP表floor、遅れて入った敵の残時間、投げた時のlifeを通信 | support-recon / kit-support | 衝突後にエリアへ入る、投げ手復活、旧lifeを偽る | マーキング過延長・life混同を防ぐ | ロジック・本番形式の通信テスト。実機距離一致は未確認 |
| 既知のQuick Bomb直撃25→1F後35/25、Autobomb爆発待ち・飛行重力/抵抗、Mist5.25m | all-subs | 直撃、接地探索、範囲境界を30/60/120Hzで進行 | 即時爆発・標的への瞬間移動・5倍の距離誤差を修正 | 22/22サブ専用テスト。未公開の標的選択等は別扱い |
| native Trizooka SPU塗り、Bubbler単位変換、Vac45F到達拡大、Curling/Suction投げ係数 | kit-* / sub-special-fidelity | AP別射撃、設置、投げる、吸う | 10倍誤差・射出/持続の差を是正 | native-parity-20261011.md参照 |
| Vac設置物吸引20raw/10=2HP/60Hzフレーム、BlowerInhale倍率 | kit-ink-vac / 両設置物API | 生きたWall・WaveBreakerを吸引、LOS遮蔽、30/60/120Hz | Exhaleの0倍率が吸引にも適用されていた漏れを修正 | 実際の両オブジェクト配列を通す測定。フラスタムの意味は未確認 |
| Storm雲の設置物ダメージ、InkStorm行 | storm-effects / composed adapter | 雲内外と遮蔽を両設置物APIで測定 | Rain行の0倍率と雲接触処理の漏れを是正 | native実APIの30/60/120Hzテスト。雨粒の未公開ダメージは推測しない |
| 攻撃別115×11倍率と対物攻撃力アップを1回だけ適用 | sub-resistance / all-subs / all-specials | 直接命中・爆風・ギア有無 | 一律倍率から攻撃別倍率へ | 全セル照合に加えて実命中経路・ghost/通信を確認 |
| 追加武器IDのnative通信許可、220HP Vac基準の上限 | reliability/net-hit-payload-adapter | 追加IDで相手へ命中 | 受信側でダメージが捨てられる不具合を解消 | 正常/過大/偽装/重複テスト |
| 直撃と爆風、チャージ、ローラー接触等のraw攻撃行を受信側装甲まで保持 | main-weapon-catalog / sub-resistance | Inkjet100爆風→装甲200、ChargerFull_Long100→135、異武器の行偽装 | 装甲に対する倍率の経路を是正 | nativeJSON、再送、実projectile→Actor境界をテスト |
| Crab通常弾・砲弾直撃Default、砲弾爆風Chariot_Cannon、転がりChariot_Body | all-specials / sub-resistance | 自分と通信相手の装甲へ各攻撃で命中 | 架空のShooter行扱いと通信での位相消失を修正 | source selectorと実JSONの装甲減少を確認 |
| ソースを保つESM文字列共有とPNG可逆圧縮 | build / scripts/lib | ESM循環import、export、全PNG画素と非IDATチャンクを比較 | 容量制限の中で機能を配信 | 各専用テストと配信ビルドで確認。画素変更なし |

## 完全一致の判定

公開された値を保持していること、実行コードが値を消費すること、Nintendoの実機で同じ結果になることは別の検証である。`source-parity-coverage-20261011.json` にraw葉・監査済みの消費箇所・未確認の意味を残した。モデル等の対象外の項目も含むため、raw葉の総数を不足機能数として扱わない。

完全一致はまだ認定していない。世界距離の換算、飛行・接地・壁/パネルとの反応、標的選択、塗り形状、および未公開のパラメータ解釈に未確認がある。既知の数値消費の漏れを直したことを、全実機挙動の完全一致に読み替えない。Switch実機の比較映像は取得していない。

統合・CIの最終結果は最終コミットで追記する。

## 最終統合の追加確認

NiceBall／UltraStampの射出・重力・抵抗、Crabの通常弾と砲弾の段階移動、Zipcasterのフック到達時間、Reefsliderのrut塗りとInkjet／Reefsliderの周辺塗り速度を実行処理へ反映。実際に発射した4種類の弾を30/60/120Hzで進めた座標・速度の一致を確認。周辺塗りの着地位置・引き寄せ・地形等の未公開解釈は引き続き較正値として記録する。

最新mainのPR1237を取り込み、対物ギアを靴メインおよび受信済みowner/lifeの情報で判定。設置物への通信はrawダメージ・攻撃行・ギアの識別を送り、受信側で倍率を1回適用する。統合37/37、対物ギア25/25実行ケース、追加弾道テストが通過。配信ビルドとstartup容量チェック通過（initial JS 3,346,254B、worker 64,626B）。全体診断4557件で見つかった旧準備時間・旧API等の10失敗は修正済み。最終GitHub CIの結果はPRに紐付ける。

### 最新mainの追加統合（2026-10-12）

main `90b4fea7` の装備引き継ぎ・被害者側マーキング軽減・ネイティブスプリンクラーのSPU・武器モデル・ガチルール・塗り処理を保持して統合。サブ/マーキング/軽減91件、共有攻撃倍率/通信67件、3者通信とnative Sprinkler39件、スペシャル/斜面塗り51件が各フォーカス検証で通過（スコープに重複あり）。実ゲームで全サブ14種・スペシャル19種が起動し、選択メニューとブラウザエラーなしを確認。ウルトラショットの旧検証失敗はintro中にループを停止した検証条件の誤りで、実際のplaying状態を待って確認した。

ナイスダマは6Fで同じ最終塗り片を順次1回だけ送るよう修正し、156から62パケットへ削減。既存の65パケット上限、地形の穴0、上階への混入0、実JSONと30/60/120Hz一致を保つ。容量上限は最新mainのまま（worker68KiB）；暫定ビルドはinitial JS3,131,504B、worker68,427Bで通過。最終nativeデバイス照合と同一headのCIを続行する。

最新mainのネイティブ版スプリンクラーは別のbomb配列を使うため、そこにも同じ攻撃行×対物ギアを1回適用し、共通の爆風・吸引・ビーム処理へ接続した。元の出生・所有者・life・順序/再送・破壊通知は維持。native装置12件、既存スプリンクラー権限3件、関連96件が通過（重複あり）。
