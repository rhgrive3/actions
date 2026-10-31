# テイオウイカのジャンプ回転と関連モーション修正

## 参照と確認範囲

比較対象は公開版 INKWAVE の Kraken Royale。参照パラメータは既存の Splatoon 3 Ver.11.3.0 固定データを維持する。調査日は2026-10-31。

- 任天堂公式更新履歴の3.0.0説明は、Bのジャンプ攻撃、ZR保持からの突進、変身前後の隙を区別している。6.1.0の壁際発動アニメーション、7.0.0の次回発動へ終了演出が残る不具合も確認対象とした。 https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/Splatoon-3-Update-History-2358763.html
- 攻略・検証Wikiのテイオウイカ項目は、ジャンプのきりもみ回転と、発動60F・基本持続480F中の活動420Fを説明している。これは外部検証資料であり、今回のSwitch実機測定ではない。 https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/テイオウイカ
- 既存固定参照は `patches/splatoon3/reference/kraken-input-surfaces-1130.json`。Leanny/splat3 commit `7280ff9cde8bb1c5dcef46c700c326471584d2e6` の WeaponSpCastle。速度・チャージ時間・当たり判定を変更していない。

本家の映像をフレームごとにデコードして関節軌跡を測定したものではない。0.45秒の1回転、0.16秒の着地回復、縮みの係数はINKWAVEの手続き的な較正であり、本家抽出値・完全一致ではない。

## 修正

| 差分 | 実装と再現条件 | 確認状態 |
| --- | --- | --- |
| ジャンプの光跡はあるが本体が回転しない | `special-presentation.mjs` と `kraken-jump-motion.mjs`。発動後、実際に成立したジャンプ攻撃を読み、進行方向に沿った本体軸で1回転。チャージ中のジャンプにも適用。 | 実THREEモデルと実装済み描画wrapperのCPU姿勢検査で回転を確認。 |
| 着地用の潰れが離陸イベントだけで再生される | 離陸と実接地を別状態にし、着地時の短い復元を追加。突進・終了・壁・死亡は回転対象外。 | 接地遷移、途中解除、通常落下の負の検査に成功。 |
| 同じスペシャルを再発動したとき古い姿勢が残る | 同じIDでも発動tokenが変われば旧モデルと時計を廃棄。非表示・死亡・dispose・クリアでも保持しない。 | 再発動、旧発動イベント、重複イベントの検査に成功。 |
| ジャンプの傾きが描画周期に左右される | 既存60Hz応答を時間に基づく補間へ置換。回転も経過時間で進行し、dt=0や非有限値で時計を進めない。 | 回転の30/60/120Hz・不規則周期・試合経過時間の検査に成功。 |
| オンライン時にFXの有無で体の演出が失われる | 承認済み `specialModelsReplay` だけを読む私有WeakMapを追加。未承認のremoteバス行、重複・旧発動の行では回転しない。 | FX directorを持たないremoteモデルで承認経路を検査。ネットワークプロトコルは不変。 |
| 空中へ出た突進が、遠隔側では回転しない | 突進が接地面を離れて60ダメージの空中攻撃へ移る瞬間、ローカルは `jumpAttack` で回転するが `jump` イベントを出さなかったため、承認済み印を必要とする遠隔側が回転できなかった（CodeRabbit指摘）。`all-specials.mjs` の同遷移で、通常ジャンプと同じ形式（`damage:60`、単調増加の `index`）の `jump` を1回だけ発行する。ダメージ・移動・塗り・プロトコルは不変。 | `kraken-movement-paint-1130.test.mjs` に追加した検査で、接地突進では発行されず、離地の1回だけ発行されることを確認。修正を外すと同検査が失敗する（負の対照）。 |

本体の姿勢だけを変え、Actorの位置・速度、ジャンプ/突進のダメージ、塗り、移動・終了硬直、ステージ、既存mainの並行変更は維持する。空中の接地高さ補正は回転角を使わず、ヒレの回転が上下移動を生まないようにする。

## 変身直後に前進できない件

現行の開始処理は発動から1秒未満をstartupとして移動を抑える。発動前から前入力を押し続ける試験では、30/60/120Hzすべてで1秒時点のactive移行後に再入力なしで前進した。開始硬直自体は上記資料と整合するため削除していない。1秒を越えて停止し続ける現象をこの試験で再現したわけではない。

`tools/kraken-motion-qa/startup.mjs` は実Actor/Physics/Levelと実all-specialsを使う。Characterと塗りの入出力は試験用であり、全production adapterを合成したゲームや実GPU測定ではない。ギアは試験用Actorの既定、ブキはshooterのspecial選択のみKrakenへ差し替え、水平な塗れる床で前入力を保持する。

最新main `bee246c53af447a096bcfa650ce03e420ebc2ec6` の all-specials blob `c99a8597946c855eceef7466da0a18ac9bd96fa4` に合わせて再実行した。

| 更新周期 | 1秒時点のphase | 前入力維持 | 最初のactive更新後のZ座標 |
| --- | --- | --- | --- |
| 30Hz | active | true | 0.0898835180679749 |
| 60Hz | active | true | 0.023966722743754082 |
| 120Hz | active | true | 0.006191329436964693 |

上記はそれぞれ長さの異なる最初の1更新分であり、位置が異なることを速度の不一致として比較しない。

## 再現・回帰

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/kraken-arm-motion.test.mjs
node --experimental-vm-modules tools/kraken-motion-qa/startup.mjs
```

前者は既存のsource/emitted special-fidelity CIの入口から新しいbody-spinテストも読み込む。ローカルNode v22.16.0では既存2件＋新規17件、計19件成功・失敗0・スキップ0。実モデルの回転軸、非攻撃対照、姿勢復帰、ゲーム状態不変、死亡・非表示・再発動・遠隔イベントを検査した。ネイティブ移動の3条件も成功。

ローカル復元は全リポジトリの完全checkoutではないため、全production合成・ビルドの成功とは扱わない。ローカルChromiumのlocalhostアクセスは管理ポリシーで拒否され、別のオフライン描画試行でもWebGLコンテキストを取得できなかった。このため今回のGPU描画比較・本家映像のフレーム単位比較・iPad実機FPSは未確認。ポリシーを迂回せず、CPU姿勢検査と区別する。GitHub hosted CIの結果は当該PRのチェック欄が一次記録であり、待機中を成功としない。
