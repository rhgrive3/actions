> 2026-10-23 継続更新: 比較元mainは現在 `726e338a`（32件の既存PRを統合）。今回の最終差分はBrella拒否済みpacket、Quad初回予測銃口、native足元query再利用の3箇所です。[PR #1852](https://github.com/rhgrive3/actions/pull/1852)で統合後の検証を進めています。以下の初回実行のbuild/hash/失敗は当時のsourceに対する履歴として保持し、最新mainの検証結果と混ぜません。
>
> #1767の時計修正・BodyBalance・音声などは新しいmainに取り込まれています。Charger初回Squid Spawn再実行は[別の実験ブランチ](https://github.com/rhgrive3/actions/tree/fix/native-charger-initial-spawn-20261023)に追加し、receiver24件とinput/replay/実Worker quota39件が成功しています。必須damage gate、残64main、過去Match/world順序・後続life・移管は未完です。

# 全29 issue の継続対応（2026-10-23 JST）

**全件解消ではない。** 全29件を調査対象にし、確定できる修正を専用ブランチへ統合・追加した。本家原典・物理端末受入と、未完成のtrusted attack authorityは残っている。issueを根拠なく閉じていない。

基準mainは`26a4db41`。既存 #1833/#1842/#1845/#1846 の履歴を保持して統合した`4e8fc320`を経て、新しいruntime修正は`f292a305`。他の統合PRやmainを変更していない。

## 新たな修正

- Brella: nativeが拒否したreplayから、過去の受理済snapshotにカサ表示だけを後付けできる経路を遮断。修正前の失敗と正常packetの正例を保存。
- Quad: 初回右手のnative aim predictionも、物理出生を保ったまま実際の描画銃口へFX・弾尾を接続。遮蔽fallback、ghost、足元offset、遅延出生は従来のまま。
- Charger: 既存の音源追加前修正を抽出し、加工したHoldNoise繰返しを取り除く。開始と合法keep復帰で1回ずつ発音し、2回目のnative復帰も再武装する。追加音声はない。

## 各issueの到達点

| Issue | 実施した作業 | 未完了の条件 |
|---|---|---|
| [#79](https://github.com/rhgrive3/actions/issues/79) | 実射撃の床・壁・角度・ターフ処理を再検証 | break/free 高度selector、原作の面積・形状比較 |
| [#226](https://github.com/rhgrive3/actions/issues/226) | 雨の生成候補・地面到達・paint呼出を区別した会計を再検証 | RainNum=72と再利用・塗り更新の対応を示す原典 |
| [#287](https://github.com/rhgrive3/actions/issues/287) | −5…+5 UI、移行、30/60/120 Hz応答を再検証 | 設定別の原作yaw/pitch実測。暫定曲線を本家値としない |
| [#532](https://github.com/rhgrive3/actions/issues/532) | 4+1 WU、実地形、周期別の既存roll処理を再検証 | 原作のcore/glide曲線、DU/WU換算、空中の校正 |
| [#642](https://github.com/rhgrive3/actions/issues/642) | composerのlazy allocation、解放、fallbackを再検証 | 物理iOS/Android GPU memory・画質・context安定性 |
| [#725](https://github.com/rhgrive3/actions/issues/725) | 端点と低速sensor積分の周期一致を再検証 | S3 11.3.0の中間設定と実controller/mobile sensor校正 |
| [#735](https://github.com/rhgrive3/actions/issues/735) | 内部の有限下限と24 HP/s、境界・周期対照を再検証 | 原作の下方向到達距離。内部14 WUは本家値ではない |
| [#845](https://github.com/rhgrive3/actions/issues/845) | native triangle穴・dynamic supportを誤ってOBB支持にしない既存修正を統合し、offscreen回帰を再検証 | pelvis/muzzle依存のnative leg/ground処理の追加最適化、実描画reentryと端末CPU受入 |
| [#890](https://github.com/rhgrive3/actions/issues/890) | B保持/早離し、buffer、form、地形境界を再検証 | 原作の保持閾値・頂点・上昇曲線。6F/.7は暫定モデル |
| [#952](https://github.com/rhgrive3/actions/issues/952) | Heavy Splatling charge減速の現行モデル・周期一致を再検証 | Bias=.9/DownRt=.05の原作積分式と開始frame |
| [#956](https://github.com/rhgrive3/actions/issues/956) | gear能力と物理的靴高が別の入力であること、既存原典調査と追加model viewer資料を確認 | 靴2種以上のsource model/足基準/装備時Actor高。武器の固定muzzle offsetで代用しない |
| [#992](https://github.com/rhgrive3/actions/issues/992) | native InkFlight/独立droplet/実着弾paintを再検証 | 原作の7位相選択・default・height合成・粒子動力学 |
| [#997](https://github.com/rhgrive3/actions/issues/997) | 歩行clock・接地・足clearanceを再検証 | S3の弱い斜め入力の同期済み足・骨盤・歩行曲線 |
| [#1097](https://github.com/rhgrive3/actions/issues/1097) | 武器別hit reactionの既存実装を再検証 | S3 runtime clip選択、idle/move別の関節曲線・時刻 |
| [#1116](https://github.com/rhgrive3/actions/issues/1116) | source-loaded武器族jump選択と既存通常jumpを再検証 | S3の実再生clipと各族の曲線。Wii U bankをS3証拠としない |
| [#1431](https://github.com/rhgrive3/actions/issues/1431) | 既存Explosher authored lip/Quad native volume修正を統合。新たに初回右手predictionも表示接続し、物理・RNG・wire不変を検証 | 原作のQuad開口部・frame同等性。runtimeの表示接続と原作認証は別 |
| [#1434](https://github.com/rhgrive3/actions/issues/1434) | 固定4e8fc320 production buildに対する4 fresh-process CBBC同一版校正を実行 | 厳密なpixel/workload一致を満たしてからABBA/BAAB測定。診断toolはwork内のみで本番へ入れない |
| [#1565](https://github.com/rhgrive3/actions/issues/1565) | 既存の接地・歩行・pose処理を再検証し、採用ゲートを維持 | 実機baseline/G0と非劣化測定。未評価のpose searchを本番有効化しない |
| [#1607](https://github.com/rhgrive3/actions/issues/1607) | 実Actor/Physicsのmiss/近床/有効壁retryを20/30/60/120 Hzで再検証。現45Fは公開実測表とも一致 | 原典ShotFailedIntervalFrm=20と追加phaseの対応。根拠なく45→20へ変更しない |
| [#1665](https://github.com/rhgrive3/actions/issues/1665) | 既存のhit上限・life/owner・接触/LOS/provenance回帰を再検証。Charger実験版の残境界も確認 | 未実装: trusted authorityによる全main/sub/special攻撃の生成・資源・衝突と初回spawn/移管の統合。自己申告eventを証明とみなさない |
| [#1666](https://github.com/rhgrive3/actions/issues/1666) | Boss/crabletの既存provenance正例・拒否・lifecycle回帰を再検証 | 未実装: hostの全攻撃生成とBoss弱点/無敵/接触/移管の一貫した決済。単なるpayload capでは完了しない |
| [#1671](https://github.com/rhgrive3/actions/issues/1671) | 30秒/4000frame/4MiB有限captureとnative支持判定修正を統合し回帰を再検証 | 実iPadのnative stage profileとdominant CPU処理の等価修正・実測 |
| [#1708](https://github.com/rhgrive3/actions/issues/1708) | 接続Driveを再検索し2022集とScratch候補の出典を再確認。既存音声provenanceを再検証 | 追加11種自身の11.3.0録音/イベント・source hash。既存別ブキ音や候補名を原音認証にしない |
| [#1757](https://github.com/rhgrive3/actions/issues/1757) | 既存の描画/resource/offscreen回帰を再検証 | 同じiPad mini 6・通常Turf条件のbefore/after frame time・memory |
| [#1767](https://github.com/rhgrive3/actions/issues/1767) | fresh nonce owner-clock修正を統合。実2context/Worker relayでcold/rematch/reconnectの3局面6方向が成功 | main統合と適用されるCI。実機の発生頻度やdeployed relay性能は別 |
| [#1789](https://github.com/rhgrive3/actions/issues/1789) | Bloblobberの既存flat/down45/launch sweep回帰を再検証 | 原作のslope分類・BounceAfterMaxSpeed・法線/接線反発の式と実測 |
| [#1813](https://github.com/rhgrive3/actions/issues/1813) | Dynamoのpositive unitをdevice/傘/Big Bubblerで決済する既存修正を統合し実contact/CPU paintを再検証 | 原作UnitDamageRate=0の意味とunit単独実機比較。零unitの塗りは保持 |
| [#1814](https://github.com/rhgrive3/actions/issues/1814) | 既存catalogue source/depletion修正と受理済tick装備同期を統合。新たにBrella replayによる表示snapshot追記を修正 | 65main完全な原作挙動認証と#1813の原典解釈。個別修正済ticketと区別 |
| [#1823](https://github.com/rhgrive3/actions/issues/1823) | 7c96d754/32eebaf9の音源追加前6pathを抽出し、誤ったHoldNoiseループを1回の開始/keep復帰へ修正 | S3固有の持続上昇音とSLINKイベント。S2録音追加なし。原作認証と混同しない |

## 検証の読み方

個別source/VM fixture、source-loaded実Actor、emitted production、実WebGL/通信、Nintendo実機、物理iPadを区別する。各runは同一の1回の全体CIではない。開発中の分野別回帰、修正後の追加回帰、生成物検証を別々に記録する。source fixtureの任意motion dynamic-import警告を、実source-loaded bankやブラウザの成功に読み替えない。

`verification.json` と同directoryのraw archiveに、各実行・失敗対照・SHA256を記録する。初回emitted選択ではsource-only counterfactualをemitted側で無効化できず1件失敗した。emitted import aliasから接続installer呼出だけをVM内で置換するfixtureを追加し、元の全assertionを保って再検証する。生成物は書き換えない。

起動サイズ検査をbuild完了前に誤って起動したENOENTと、誤った完全SHAによる初回browser入場拒否も保持する。いずれも後続の完了済build/正しいSHAの実行と区別する。

性能診断のsoftware WebGL、1pixel readback、同一版の4process校正は物理端末FPSでも改善率でもない。source回帰が一部同時実行されているため、CPU時刻を公平なA/Bの代用にしない。厳密pixel/workload条件を緩めない。

## 参照資料の再確認

Google DriveのSplatoon、11.3.0、RomFS検索とsource folderを確認。2022 SFX集、公開source ZIP、Scratch候補の入手記録があり、現時点の検索では追加11main全ての認証済11.3.0音声や校正済実機測定は得られなかった。公開HoianViewerはmodel/bone接続の資料となるが、未取得の靴モデルや実ゲーム装備時の足高を代替しない。

- [Drive音声入手状況](https://drive.google.com/file/d/1rabG82rAFZXQbjh7lu3IOkW9Ysg3VtYE/view)
- [公開source資料folder](https://drive.google.com/drive/folders/1iAhs_iWB0jfPkAB3lgUT9le95T-B323b)
- [Zipcaster検証表](https://wikiwiki.jp/splatoon3mix/ブキ/スペシャルウェポン/ショクワンダー)
- [Splatling数値](https://sendou.ink/params/ballpoint-splatling)
- [HoianViewer](https://github.com/nvnprogram/HoianViewer/tree/89f23684b9dede5da8207e5f9f1980150bec774a)

本家の非公開の式・座標・音声を推測で確定していない。比較詳細は`reports/inkwave-splatoon3-behavior-2026-10-02.md`の2026-10-23節。


## 今回の確定結果

- 分野別source: 43ファイル244試験、失敗/skip 0。追加のsecurityは62、歩行/接地は50、Bloblobber/keepは8、録音APIは23が成功。重複を含む別実行なので、合算した単一suiteとして扱わない。
- 新たなBrella replay対照は修正前1失敗→修正後2成功。Quadの新prediction対照は修正前1失敗→source/実volumeの5成功。
- 生成物の25個別caseは、初回24成功/1失敗（emitted counterfactual未接続）と、fixture補正後のpose file全4成功を分けて保存。初回aggregateが失敗だったことは維持する。
- runtime f292 build: 1,362宣言input＋builderの1,363 Git照合と2,016 artifact SHA256が一致。通常production build、startup budget、source migration audit、quick compatibilityが成功。最初の未完了buildに対するENOENTも保存。
- owner-clockの実Game/2context/Worker relayは4e8 sourceでcold/rematch/reconnectの3局面6方向成功。後続sourceの時計・relayのbytesは同じだが、新しい全game browser実行とは称さない。
- 最終Quad browserは30/60/120 Hz×open/wallの6条件、720 fixed ticks、84 births、27実draw、page error 0。初回右predictionのFX/描画socket誤差0、実back誤差3.75e-7 WU、実rod誤差1.04e-7 WU。予測前の初弾とsteadyに加え、1Fだけのtailをfixed tick直後の追加診断drawで観測。通常30Hzの次フレームでは既にdetachしており、最初の3回の観測失敗も保存した。寿命・物理・元のfirst/steady検査は変更していない。
- Chromiumの実OfflineAudioContextで4 Charger系統の既存MP3をdecodeし、同じbuffer・1倍速・source1個・loop=false・録音終了後の完全な無音を確認。実機試聴・WebKit・S3上昇レイヤーの受入ではない。診断scriptの初回import path誤りも別logへ保存した。
- 全体性能の同一版4 fresh-process校正は、全4回とも8 actor/入力/状態/処理量を保持したが、C/Bの画像が厳密一致せず`rejected-native-self-control`。許容差は導入せず、改善率を主張しない。

全件の未完了条件は上表と`issues.json`に残す。#1665/#1666は単なる実機待ちではなく、trusted authorityの実装・統合が未完了である。
