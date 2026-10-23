# 29 issue継続作業の最終検証（2026-10-23）

修正は[PR #1852](https://github.com/rhgrive3/actions/pull/1852)へpush済み。**全29件解消ではありません。** main `726e338a`を取り込み、productionの追加差分はQuad初回銃口接続、Brella拒否replayの表示更新遮断、未描画native botの重複足元query再利用の3ファイルです。

検証の中心はsource `421fb93320021e619c88271a56137c0f92e6b8d9`。その後mainの参照チェック追随漏れの修正`def8b30d`を取り込み、PR headは`005f2c52c56b6543a6c10c32a8b68a21268f24bb`です。この間のゲーム・runtime・builder変更はなく、後者についても1421 Git入力と2110生成物の一致を再確認しました。[後続headの同一性](post-ci-migration-build-identity.json)。

| 検証 | 結果 | 範囲 |
|---|---|---|
| Node22全network回帰 | **131ファイル820/820、fail/skip/cancel 0** | production Worker・source/native Actorなど各試験の対象。実機全体ではない |
| 通常minify生成物の対象回帰 | **6/6成功** | Quad pose/volume、native foot memo |
| Quad実WebGL | **6/6成功** | 30/60/120Hz×open/wall、診断materialで実draw。画質・実機FPS認定ではない |
| native時計同期の実ブラウザ | **3条件、双方向6経路成功** | 起動・再戦・再接続。実Game/Match/Actor/Character、WSとproduction Workerのローカルplatform shim |
| 時計probe・workflow契約 | **35/35成功** | legacy/stamped envelope、実Worker往復、元packet bytes保持 |
| main参照移行後の追加確認 | **10/10成功、13参照の生成物一致** | [TAP](post-ci-migration-focused.tap)、[参照結果](post-ci-migration-references.json) |

通常build、quick、source migration audit、startup budgetも成功。build inputHashは`7d497d34aa804706b237e39bac414b17345f95b13dc81a3c4e2a21535210a239`、contentHashは`24be9651e9e1e798888677f6fed55269f41819cd0e6814c61ca82e082efc0026`です。時計browserのsourceは`dd31b8c6`で、後続は検証器のnull拒否とCI登録の変更です。同じproduction入力であることと、ブラウザ実行時のsourceを区別します。

## 修正した範囲と制約

足元queryは既存のoffscreen grounded budget内で、同じ同期Character.updateの完全一致座標・rootY・physicsのみ再利用します。native三角形の穴とdynamic足場を使い、30/60/120Hzで全bone/skin/接地/銃口が対照と一致。query数は229→209、439→399、870→788でした。実NativePhysicsの単独query列（1試行1,317,000問、ABBA×2）の平均CPUは5100.857→4716.320ms、約7.54%減。これは合成地形上のcomponent計測で、全ゲームや物理iPadの改善率ではありません。

Quadはnative aim predictionで初回右手に発生する表示の切断を補正します。物理出生、速度、wire、paint/RNGを維持します。元の遮蔽・offset・ghost・遅延出生のguardも保持。通常30Hzでは短いtailが次の描画前にdetachするため、fixed tick直後の診断drawも追加して実volumeを観測しました。

Brellaはnative watermarkが実際に進んだ呼出だけ表示sidecarを更新します。最新mainのactor-count上限を保持し、通常1 actor registryではoversized 129行packetが拒否されることを確認。その後128個の実Actorを追加した大きなregistryの防御stressで、受理済snapshotに拒否replayが表示を追記できないことを確認しました。通常8人roomに新しい攻撃経路があるという主張ではありません。

## 実機がなくても残っている作業

- **#1665/#1666:** [別実験](https://github.com/rhgrive3/actions/blob/fix/native-charger-initial-spawn-20261023/reports/issue-resolution-20261023/initial-spawn-continuation/README.md)で初回Squid Spawnからnative Chargerを再実行。receiver24/24、input/replay/実Worker quota39/39成功。30/60/120Hzで待機・操舵・着地・初回full shot、native inkと一度限りのlaunch receiptを確認。**必須damage gate、残64main、sub/special、過去Match/world順序、後続life、late join・移管は未完成。** receiverがすでにplayingのときに過去intro列を遅れて受信する場合も、現状はbody mismatchで証明を失効させます。productionへ強制適用していません。
- **#1434:** 同一build・入力・状態・処理量で2画素各1byteの差が残ります。診断GL.DITHER無効でも再現し、この仮説だけでは解消できません。比較可能な最初の2試行で反例が出たため残りを中断。4試行完走でも性能受入でもなく、原rawの未完了状態を保持しています。176 shader source hashは一致、composer/2 color targetだけGPU hashが異なり、depthは未観測。unused zero-instance meshのuniform差から原因を断定していません。pixel許容差やguardは緩めていません。
- **#845:** 今回の重複query除去は完了。残るleg/ground CPU経路全体の最適化は別作業です。
- **CI:** [PR #1853](https://github.com/rhgrive3/actions/pull/1853)でmainのlocal reference追随漏れを修正し、#1852にも同じcommitを統合しました。変更元commit・旧新hash・改変拒否33/33を保存。全必須remote CIはまだ完了していません。mainのbrowser active失敗はrunner shutdown後の中断で、成功として扱いません。

## 原作資料・実機で残る作業

全29件の残条件は[一覧](../README.md)と[issues.json](../issues.json)。原作11.3.0の移動/gyro曲線、塗り形状、雨/雲の対応、靴のsource modelと装備高、11武器の認証済音声などが不足しています。Driveも再確認しましたが、新しい確定資料は得られていません。

#1823の旧報告は追加音声前のsourceに対する記録です。現在のmainには暫定Splatune2 phraseを含む後続音声変更が入っており、それを保持しています。S3固有のCharger上昇layerの出典・対応を証明したものではありません。#642/#1565/#1671/#1757の物理GPU memory、端末FPSと操作・描画の受入も未確認。software WebGLをiPad/Switchの実測とは扱いません。#1767は修正がmainに入っていますが、main必須CIが失敗しているため、受入完了として閉じていません。

## 証拠と失敗履歴

[verification.json](verification.json)にsource・hash・結果・制約、[raw-evidence.tar.gz](raw-evidence.tar.gz)に56個の生ログ/JSON/診断script、[raw-hashes.json](raw-hashes.json)にhashを保存。画像・RGBAは容量のためlocal保存とし、[local-images.json](local-images.json)はそのhash一覧だけです。ブラウザprofile/Cookieや外部asset本体は含めません。後続CI移行の10件と同一性/参照記録は上記の個別ファイルです。

統合前の789/789と最終820/820を分けています。初回source-focused 28pass/1failはmainのactor-count上限に古いstress fixtureが拒否されたもので、fixture補正後のBrellaと全820件は成功。初回emitted-groundはbundleで消えるleafを参照して失敗し、出荷engine.mjsのexportを使って成功。以前の必須CIはcanonical job変更で固定hash検査に失敗しましたが、元job bytesを戻し、追加probeを独立jobへ移しました。承認hashの変更による通過はしていません。過去の失敗を合算して全成功に書き換えていません。
