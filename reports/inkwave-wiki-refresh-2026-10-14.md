# INKWAVE Wiki再監査・改善（2026-10-14 JST）

現行main `14f9f913a8438353d0e462a0e74e17d8af876230` を基準に、4種類のルールとメイン65種類の個別Wikiを再確認した。確認できた4件を公開版のビルド用overlayへ修正した。調査・実装・検証はこの作業環境で行い、外部CIの完了待ちを検証の代用にしていない。

## 根拠と修正

| 条件・再現 | 旧挙動と影響 | 修正 | 根拠・確認の範囲 |
| --- | --- | --- | --- |
| ホコの開いたゴールに接地して到着 | 接触した瞬間に0となり、ゴール直前の防衛攻撃が無効になる | 1のまま30F待ち、死亡・持ち時間切れ・離脱・接地喪失を先に処理。保持中のnative入力を抑え、攻撃の被害判定は維持する | [S3mixホコ](https://wikiwiki.jp/splatoon3mix/ガチホコバトル)の直上到着30F。現在の平坦なローカル接触条件に採用。側面37F/イカノボリ60Fの分類・台座頂点・掲げる骨格動作は未確認 |
| 60Hzの投擲軌道がアサリ取得球をかすめる | sweepで交差を検出しても、前の位置で再判定して取得を拒否。味方へのパスを取り逃がす | 同じ軌道上の接触点で所持・チーム・スペシャル制約を評価 | [S3mixアサリ](https://wikiwiki.jp/splatoon3mix/ガチアサリ)の空中取得・パス。ローカルの接触半径/投擲軌道を実機相当とは認定しない |
| 自陣側にある無人ヤグラが4.9秒→5.1秒となる | 所有中の帰還に全dtを使い、中立化後の残りdtも加算。戻り距離が過大 | 5秒を境に時間を分割し、各区間を一度だけ加算 | [S3mixヤグラ](https://wikiwiki.jp/splatoon3mix/ガチヤグラ)の5秒中立化。約0.8倍という既存のWiki近似速度は維持 |
| エリアを失って9秒ほど経ってから時間切れ | 直前喪失による延長開始時に中立時計を0へ戻し、もう10秒を与える | 連続している中立時間を引き継ぐ。再確保すればリセットする既存動作は維持 | [S3mixエリア](https://wikiwiki.jp/splatoon3mix/ガチエリア)と[Inkipedia延長](https://splatoonwiki.org/wiki/Overtime)の中立10秒。直前喪失の延長開始条件は両資料の説明に差があり、既存条件を変更していない |

実装は `patches/splatoon3/runtime/ranked/`。凍結された `inkwave-public/`、武器数値・モデル・一般移動係数には変更を加えていない。ゴール状態はホスト所有snapshotの残時間として継承し、異常値を拒否する。旧snapshotは保持無しとして読み込める。

## 今回再取得したWikiと数値の扱い

[JSON記録](inkwave-wiki-refresh-2026-10-14.json)に65ページのURL・今回の性能表表示版・前回表示版・抜粋から抽出した458数値欄を保存した。65件すべてで正規化した版表示が前回と一致した。これは各ページの全記述・全数値が変わっていないという証明ではない。458欄には射程、威力/減衰フレーム、連射、インク、射撃移動等の抜粋を含み、空欄は推測で補わない。

現行カタログ65件のsourceActor・source SHA-256が前回監査記録と一致することも検査した。7つの基礎ブキの保存パラメータについて、既存の出典検証63明示値と、完全ミラー1045数値葉/38結合検証を再実行した。これはモデルの全性能への接続やSwitch上の測定の証明ではない。前回の206項目照合を、今回新たに206項目すべて測定したものとして数え直さない。

同一Wiki内でも世代・版・測定/推定の区分がある。今回の表示版は7.1.0〜11.3.0にまたがる。ホコの退行倍率3倍/4倍、延長猶予10秒/15秒、エリアペナルティ丸め、アサリ半カウント精度の資料差は未決のまま。任天堂公式の[ルール紹介](https://www.nintendo.com/jp/bankara-king/index.html)は基本目標の裏付けであり、非公開の細かなフレーム値の裏付けには使わない。

## 検証

- 変更前の既存ルールセット: 201件中200成功・1既存optional skip・失敗0。
- 変更前への不具合対照: 新規17ケース中15失敗。エリア境界は追加の独立した失敗対照を確認。
- 新規接触/ゴール/境界: ソース18/18、実生成済みminifiedルール18/18成功。両チーム・30/60/120Hz caller、終了フレームの死亡/時間切れ、離脱、チェックポイント制約、pending射撃、snapshot復元/悪意入力、敵Power・壁・特殊状態の拒否を含む。
- 実Actor組合せ: 新規2ケース成功。保持中のnative入力抑制、インク・武器の通常所有者への復帰、native致死ダメージによるゴール阻止を確認。既存統合を含む生成済みセット13/13成功。source-fixtureは描画・移動積分をstubするため、描画ブラウザの代替としない。
- 最適化productionビルド: 成功。contentHash `b32be739e33e`（完全値はビルドmanifest）。全artifact hash/依存graph/起動・precache・worker予算の既存検査も成功。
- 既存ルール・カタログ・通信セット: 702件中701成功・1既存optional skip・失敗0。committed-inputのemitted packaging: 9/9成功。確認用のassertionや許容誤差は緩めていない。

再現コマンド:

```sh
node --experimental-vm-modules --test --test-concurrency=2 patches/splatoon3/tests/ranked-*.test.mjs patches/splatoon3/tests/main-weapon-catalog.test.mjs patches/network-replication/tests/*.test.mjs
node scripts/build-inkwave.mjs inkwave-public /tmp/inkwave-wiki-site
INKWAVE_WIKI_AUDIT_SITE=/tmp/inkwave-wiki-site node --test patches/splatoon3/tests/ranked-wiki-contact.test.mjs
INKWAVE_BUILT_SITE=/tmp/inkwave-wiki-site node --experimental-vm-modules --test patches/splatoon3/tests/ranked-integration.test.mjs
node scripts/check-inkwave-startup-budget.mjs /tmp/inkwave-wiki-site
```

ローカルPlaywright Chromium取得は、取得ZIPが空/不正で失敗した。権限やネットワーク制限を変更していない。新たなレンダリングブラウザ、実WebSocket 2クライアント、公開URL、本家Switchでの確認は未実施。このPRはその確認を含む完全再現・公開済みの主張ではない。

## 残る差分

スコープズーム、バレルの40発/41発という端点の差、スクリューの渦、壁垂れ、チャージ量/空中/不足インク時の全時系列、対物相互作用、ヤグラ上の設置物追従と寿命、実機の塗りラスタ/射程・キャラクター寸法・台座判定・ステージごとの数値を未確認として維持する。既存の[全メイン監査](inkwave-main-weapons-wiki-audit-2026-10-11.md)と[ルール研究](inkwave-ranked-research-2026-10-11.md)の未解決項目を、テスト成功だけで解消済みにしていない。
