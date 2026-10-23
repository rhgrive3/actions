# ローラー縦振りの発射後接続：部分修正候補

**追加判定: cf9とweighted別候補は、ともに実画面の回復軌道を採用不可。** 下記matched比較を優先する。source検査の成功を実画面／本家一致の承認に使わない。

本家一致の完了報告ではない。通常ローラーの発射後、着地やZR解除で回復先が切り替わる瞬間の姿勢ジャンプを修正した。継続中の振り抜き・戻り全体の軌道、本家映像と同じカメラ・照準・動作位相での新規比較は未完。マージしない。

基準は公式 main `726e338ac256ba9609086ce65e25a68ddd99df85`。作業枝は `fix/roller-vertical-recovery-20261023`、runtime候補を最初に保存したcommitは `51dcd0e5ffd5c5488741900610d183eb874a6e17`。通常のCodex cloud `/workspace/actions` で作業し、Workやサブエージェントは使用していない。#1854 `2e8d90b8afb6aac057edfbb988fae789ef36cfd3`、#1852、#1853を事前に読み、変更していない。ヒッセンの床飛沫、髪・キャラクター形状・skin・meshも対象外。

## 実装と再現

通常ローラーでジャンプ縦振り→40tickに着地→ZRを48tickで離す。`roller.mjs` は毎回の `holdRoll` をそのまま `verticalRollerPose` へ渡していた。回復終盤の同じ経過時刻でも、末尾キーが ROLL/READY 間で変わり、腕の目標位置・角度・合成重みが不連続になった。既存の `roller-vertical-curve.test.mjs` は各曲線内の連続性を検査するが、途中で曲線の宛先が変わる条件を検査していなかった。

`roller-vertical-recovery.mjs` は Character ごとの WeakMap に表示用補正を持つ。発射後に宛先が変わった時点で、旧曲線の位置・速度との差を取得し、既存の戻り区間と各ブキの終了時刻の範囲内でHermite補正をゼロへ戻す。変更がなければ元の姿勢値と同じ。新しい攻撃identity、時刻巻き戻し、ブキ変更、resetでは旧補正を破棄する。`roller.mjs` の縦振り表示呼び出しとキャンセル接続だけに取り付け、横振り・既存の左右握り／接地IKは変更していない。

新しい本家の関節角や発生時間は追加していない。補正時間の上限は既存の `VERTICAL_ROLLER_SWING.ret` であり、攻撃全体を同じ長さへ置き換えるものではない。通常型31/56tick、カーボン12/33、ダイナモ55/76、ヴァリアブル42/63という現在の個別ゲーム時計を維持する。既存ダイナモ表示の終了86tickも維持する。これらは固定データと現在のINKWAVE実装の値で、今回実機から測った値ではない。

発射、インク、移動、サブ・変身・着地・キャンセルの許可、弾のbirth・威力・射程、network serializationには変更を加えていない。2つのruntime入力だけが変わったことを [verification.json](verification.json) に記録した。

## 参照アクセスの境界

通常のHTTPS GETは次の2件で **HTTP 403 / denied** となった。拒否後の再試行、Referer/認証の追加、別経路による同じ動画の取得はしていない。

- `https://www.nintendo.com/jp/ichikara/av5ja/index_en.html`
- `https://media-assets.apps-jp.nintendo.com/contents/embed/NablZy7jqxO`

既存の [2026-10-21比較記録](../inkwave-splatoon3-behavior-2026-10-02.md) は公式動画のデコード425–426付近に放出、430–440に低い振り抜き、442–448に構えへの戻りを記録している。映像のゲーム版、ギア、入力開始tick、編集速度、FOVは不明である。この記録を新規映像確認や今回の角度・時間の合格根拠には使わない。**デコード番号426は、INKWAVEの入力後31tickと別の座標系**である。任天堂メディアはリポジトリに含めていない。

## 確認できたこと

- 元の本番minify生成物に、新しい本番pose hook回帰を当てると姿勢channel54で失敗する: [old-fails.tap](old-fails.tap)。候補はソース4/4、実minify生成物4/4: [source](source.tap)、[emitted](emitted.tap)。元ビルドに新runtimeを注入した試験ではない。
- 通常・カーボン・ダイナモ・ヴァリアブル×30/60/120Hz、各120tickの実Actor/Runner/Character、両握り、空中・着地・保持・解除・reset・再押下を確認。固定60Hzのpose列がrender cadence間で一致し、元／候補の記録したインク・クールダウン・攻撃時計・rollingが一致した。CPU試験のsource-motion動的読込はVMで実行しないため、ブラウザとの区別を維持する。
- 既存の縦曲線・ローラー本体・detail中断・holding pivot・発射後入力ゲート・振り中移動は39/39成功: [focused.tap](focused.tap)。既存閾値を緩めていない。
- 生成物をcommitの全入力blobへ照合するpackagingは10/10成功: [packaging.tap](packaging.tap)。新moduleのcommit前は「untracked build input」で失敗し、commit後に再実行した。テスト側の判定は変更していない。
- quick compatibility check、本番build、startup budget成功。CIの既存コマンドを維持し、新しいsource/emitted回帰を追加した。workflow契約33/33成功: [ci-contracts.tap](ci-contracts.tap)。リモートCIとは別である。
- [load.json](load.json) は8万回のsampler操作／宛先切替のABBA smoke。baseline約31–36ms、候補約45–55ms。有限値と有界動作の確認で、全ゲームFPS、hardware GPU、メモリ長時間耐久の合格値ではない。geometry・particle・装飾処理は増やしていない。

### 最初の60Hz実ブラウザ比較

Chromium/SwiftShaderの実練習場、実Actor/Runner/Character/IK/Projectiles、800×600、水平照準、root相対カメラ(3,1.8,4)、40tick着地、48tick ZR解除。制御した飛行経路で、実機ジャンプの計測ではない。初回の [元receipt](before/initial-60hz-receipt.json.gz) と [候補receipt](candidate/initial-60hz-receipt.json.gz) は保存するが、作業中にcheckerファイルが更新されたため、その中の終了時script hashを実行時コードの厳密な証明には使わない。最終行列の別receiptを参照する。

| tick | 元のドラム中心の1tick移動 | 候補 |
| --- | ---: | ---: |
| 48 | 0.3076 | 0.0509 |
| 49 | 1.1057 | 0.1744 |
| 50 | 0.7190 | 0.7776 |
| 51 | 0.7139 | 0.9095 |
| 56 | 0.0361 | 0.0418 |

値はINKWAVEの座標単位であり、実測メートルではない。切替直後のジャンプは減るが、その後の大きな戻りは残る。改善した2tickだけで全軌道の一致を主張しない。

| 元49tick | 候補49tick |
| --- | --- |
| ![元](before/tick-49.png) | ![候補](candidate/tick-49.png) |

## 残る確認と再実行

1. 正規にアクセスできるSplatoon 3映像／実機で、通常ローラーの発射後のpivot・軌道・両腕・振り抜き・減速・戻りを同じカメラ／照準／動作位相で照合する。現状 **denied** の参照アクセスが阻害要因。
2. 継続入力での回復曲線と接地補正の引き渡しを調べる。今回の部分修正でも後半に大きなドラム移動が残る。ダイナモ縦の既存形状も本家照合が必要。
3. 公開する正確なheadのリモートCIと全体ブラウザ受入を完了する。ローカルのfocus検査を代用にしない。

```
node scripts/build-inkwave.mjs inkwave-public work/roller-candidate
node --experimental-vm-modules --test patches/splatoon3/tests/roller-vertical-recovery.test.mjs
INKWAVE_BUILT_SITE=work/roller-candidate node --experimental-vm-modules --test patches/splatoon3/tests/roller-vertical-recovery.test.mjs
node scripts/check-inkwave-roller-recovery-browser.mjs work/roller-candidate work/roller-browser matrix
```

元は別checkoutのmain `726e338a`から `work/roller-before` へbuildし、同じcheckerをそれぞれに使用する。出力先を共用しない。最初の行列はscreenshot timeoutで中断した記録をローカル `.roller-recovery/before/matrix*` に残し、合格に数えない。最終行列と公式ref/tree/blob読み戻しの結果は後続の証拠に記録する。13:27 UTC時点では最終行列は進行中。旧検証器の30/60Hz計6条件成功は記録し、120Hz撮影timeoutを合格にしない。各描画でGPU完了を待つ修正版を別出力先で実行している。

### 検証器の失敗と訂正

初回の新規CPU検証器は、catalogueにstub projectileを渡したため `_muzzle` がなく、observerが開始済みの `swingCount` から参加したため別ブキのattack recordも取れなかった。実Projectilesへ置き換え、実runnerのidleを先に更新して `swingCount=0` を観察してから攻撃するよう訂正した（[初回失敗](initial-harness-failure.tap)、[observer失敗](harness-catalog-observer-failure.tap)）。元の宛先差が0.5を超える代表点は48tickではなく52tickとし、閾値を下げずに終盤の再現点を訂正した。productionの時計・既存のテスト閾値は変更していない。

公式読み戻しの初回記録は [cf9c9d8](official-readback-cf9c9d8.json)。branch ref、commit tree、全23 changed blob SHA、およびruntime2本・回帰・checker・workflowの5本文が一致した。6274 blob leaves、6558 tree entries、truncated=false。ここに記録したCIは取得時点のqueued/in_progress/skippedであり、passではない。


## 追加の同条件比較と不採用判定

[matched/comparison.json](matched/comparison.json) は、元main・PR1856 cf9・別weighted候補を同じcheckerで比較した結果。列挙した条件に差はなかった: 名前 `Roller Recovery QA`、名前由来seed `3564230742`、既存style `{hair:0,skin:2,outfit:0,eyes:0,hat:0,brows:0}`、3装備とも能力none、既存Aqua/Cherry `#10d2e6/#ff4150`、基本roller、25 geometryの属性内容hash `b984d502777fda1948cef806a72e952639d709432fab328283ae48ab0c739f56`、服色uniforms、初期pose・時計、origin(0,0,0)、FOV/射影行列、カメラ(3,1.8,4)。同じ66 native ticks、40tick着地、48tick ZR解除。弾・ink・cooldown・攻撃時計・rollingも一致した。比較用には既存Characterを同じ既存選択から再構築して初期状態を揃えた。geometry定義を編集せず、髪・skin・meshの新設計はしていない。原作のカメラ／実機との一致ではない。

初回60Hz画像にはavatar/gear/paletteの一致記録がなく、完全な同条件A/Bの承認証拠として使わない。上記の列挙条件を検証したmatched比較とは区別する。

| 50–56tickのドラム中心移動 | 元main | cf9 | weighted別候補 |
| --- | ---: | ---: | ---: |
| 最大1tick移動 | 0.717140 | 0.908254 | 0.753777 |
| 移動総量 | 2.661387 | 3.739439 | 3.776749 |

cf9の51/52/53tickは0.908/0.882/0.653で、元0.713/0.570/0.372より大きい。weightedはraw角度とweightの独立補正によるlate catch-upを避け、重み付き目標を既存deadlineへ直接接続する試み。sourceの表示角速度ピークは改善したが、実ドラムの後半最大移動と総量は元より大きい。**weightedも採用しない。** 元のcf9 branch/commitと両ビルドを保護し、別枝 `experiment/roller-vertical-return-weighted-20261023` に不採用実験として保存する。共有grip・接地solver・横振り・respawn/resetのinput/runner初期化へ範囲を広げない。

元/cf9/weightedのraw receiptは [before](matched/before.json.gz)、[cf9](matched/cf9.json.gz)、[weighted](matched/weighted-rejected.json.gz)。51tick画像は [元](matched/before-51.png)、[cf9](matched/cf9-51.png)、[weighted](matched/weighted-rejected-51.png)。

weightedはsource5/5、実minify生成物5/5、既存focused39/39が成功した。凍結したcf9 helperを負対照として後半の表示角速度回帰を追加したが、これは実ドラムの軌道承認の代わりにはならない。最初のweighted回帰は同時刻の丸め差で1件失敗し、閾値を緩めず切替瞬間の既存値を保持して訂正した。各TAPはmatched配下に保存した。

cf9のCI patch_tests(3)の失敗は `issue-847-roller-drum-support.test.mjs` のcurrent-source入力SHA固定がroller.mjs差分に未追随のためだった。別枝では、当該差分が表示helper接続のみで、stick/support/physical-paintの3故障注入anchorが不変と照合し、SHAをc694...へ追随した。歴史的b34 fixture、故障注入と閾値は維持し8/8成功。実装のshared gripやcontact admissionは編集していない。cf9のPR head自体は変更しておらず、そちらのCI失敗は解消済みと扱わない。

## session39616とtimeoutの区別

session39616はexit0。freshな候補120Hzの1条件は66 simulation ticks/132 renders、発射31tick、page errorなしで完了した: [receipt](fresh-candidate-120.json.gz)、[log](fresh-candidate-120.log)。これは [元の連続コンテキストtimeout](before-reused-context-timeout.log) とは別の実行であり、120Hz全条件の受入を意味しない。元の連続実行は30/60Hzの6条件を終え、120Hz released-edgeの最後の `page.screenshot` が60000msでtimeoutし、最終画像とreceiptが保存されなかった。失敗をpassに数えない。今回のmatched比較は既存checkerのChromium flags・60000ms撮影timeout・描画方式を維持した。
