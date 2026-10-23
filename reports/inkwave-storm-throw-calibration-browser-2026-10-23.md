# アメフラシ投擲：練習場の表示mでの3版実ブラウザ比較

**私有のinferred校正案の検証であり、正式な本家再現値・採用済みruntimeではない。** 固定branchのcommit `2cc81dead0f0d5b93eb3d7e49508432286187115` / tree `f54f53a6f049e270694e299057eef1eab3a1614a` を保護し、その別コピーで「before」「距離のみ」「距離＋contact」を作った。本commitは報告・計測資料・自作ゲーム画像のみ。アプリのruntime、境界候補、main、PRは更新しない。

## ソース・単位・条件

開始前に `kit-subs.mjs` と `storm-effects-adapter.mjs` を、指定基準 `a4e81347906c0d60ceef76a69f476261bf8d3f86` とbyte単位で照合し、両方一致。略称843はローカルrefとして特定できなかったため、843との独立一致は主張しない。提供patchはHTML escapeを復元した正規の全文で、距離patch SHA256 `c969d2581be06fbb954f1653090f130a34288d4b745868af5f1b2e8dba35535f`、contact patch `7a3e5ab187b457bbf53f71411eafc4eab68dfe2fcb111c97e4bb896a1d6fe119` が完全一致した。fuzz0のcontext確認後に別コピーへ適用。距離変更後 `kit-subs.mjs` は指定の `d96dcaa7b458119d16db54fb42d11dad5610fa913836b18e0569c0b6d19dbea3` と一致。

練習場の `stage/zones.mjs` は **1表示m＝1WU**、メジャー線と看板は5m刻み、射撃線z=0。これはINKWAVEの表示基準であり、本家内部単位との距離換算を確定する根拠ではない。通常ロングレーンの同じ射撃線、足元(6,0,0)、静止、yaw0、水平または上30度。GP0は全スロットnone、GP57は3 main＋9 subをspecialPowerへ実装のequip経路で装着し、実snapshotの8秒/throwScale1と10秒/1.5を確認した。位置・ゲージを制御するが、通常Q→Sub押下/解放を通す。ordinary aimingSubは発射時falseで、存在しないStorm用予告線は強制していない。

候補は提供されたMission/Rival同型generatorの生値による案（XZ抵抗0.05866、重力0.016×60×60）をそのまま使い、目標距離への追加調整をしていない。対戦既定値・重力/抵抗の読込と積分順・本家11.3.0での角度別直接計測は未確定。親提供のGP0約3line/GP57約5lineという目安との近さだけで本家一致とは認定しない。

## 通常レーン：水平投げ

足元からの水平距離。接触点・積分終点・雲の初期位置を別々に記録した。各版とも原点(6,1.45,0)。初速GP0=(0,14.4,67.2)、GP57=(0,14.4,100.8)、単位は表示m/秒。

| 版 | GP | 実際の接触距離 | 積分終点 | 雲の初期水平距離 | age |
| --- | ---: | ---: | ---: | ---: | ---: |
| before | 0 | なし | 海へ落ちて98.560000mで消滅 | 雲なし | 88tick / 1.466667秒 |
| before | 57 | なし | 海へ落ちて147.840000mで消滅 | 雲なし | 88tick / 1.466667秒 |
| 距離のみ | 0 | 15.709586m | 15.806620m | 15.806620m | 35tick / 0.583333秒 |
| 距離＋contact | 0 | 15.709586m | 15.806620m | 15.709586m | 35tick / 0.583333秒 |
| 距離のみ | 57 | 23.564379m | 23.709930m | 23.709930m | 35tick / 0.583333秒 |
| 距離＋contact | 57 | 23.564379m | 23.709930m | 23.564379m | 35tick / 0.583333秒 |

**通常レーンのbeforeは50m壁に当たらなかった。** 壁は中心(6,2.5,50.5)、半寸法(6,2.5,0.5)、高さ5m。GP0はage0.75秒で位置(6,5.35,50.4)となって壁上端を越えた。GP57も上端を越え、後ろに床がないため水面側へ落下した。前回の86.24m endpoint / 85.87122m contactは長い平地fixtureでの障害物なし診断値であり、通常レーンの看板まで到達した実画面ではない。今回、通常レーンをその値や壁衝突に見せる変更はしていない。

## 上30度と追加の壁・天井

上30度の通常レーンは次の結果。距離のみのGP57は床下まで積分してから雲位置を求めるため、高さもずれた。contact併用は実hit.pointへ戻す。角度の目標値へ距離を合わせ込む変更はしていない。

| 版 | GP | contact / 積分終点 | 雲位置(X,Y,Z) | age |
| --- | ---: | ---: | --- | ---: |
| before | 0 | 接触なし、200.587835mで水面消滅 | なし | 236tick / 3.933333秒 |
| before | 57 | 接触なし、424.505412mで水面消滅 | なし | 318tick / 5.300000秒 |
| 距離のみ | 0 | 13.600351 / 13.600711m | (6,4.6,13.600711) | 97tick / 1.616667秒 |
| 距離＋contact | 0 | 13.600351 / 13.600711m | (6,4.6,13.600351) | 97tick / 1.616667秒 |
| 距離のみ | 57 | 21.414399 / 21.414692m | (6,3.917685,21.414692) | 132tick / 2.200000秒 |
| 距離＋contact | 57 | 21.414399 / 21.414692m | (6,4.6,21.414399) | 132tick / 2.200000秒 |

壁1m/10mと天井は、実練習場のcollisionに追加boxを置き、同じLevelの描画geometryも作った**検査fixture**。通常レーンの壁と混同しない。

- 壁1m：hit.pointは全版1m。beforeの雲はGP0 1.12m / GP57 1.68m、距離のみは1.054301 / 1.581451m、contact併用は両方1m。いずれも1tickで接触。
- 壁10m：hit.pointは全版10m。beforeの雲は両方10.08m、距離のみはGP0 10.262736 / GP57 10.337520m、contact併用は両方10m。ageはbefore GP0 9tick / GP57 6tick、候補GP0 14tick / GP57 8tick。
- 天井：下端Y2.5、上端Y2.7、z1–15の箱へ上30度投げ。接触は全版2tick。距離候補のGP0 contact1.105259m / endpoint1.553248m、GP57は1.277755 / 2.439519m。contact併用はその実接触点を雲入力へ渡す。ただし既存 `_spawnCloud` の下向き地面探索で天井上面2.7を拾い、**雲Yは全版7.3m**になった。天井での本家らしい雲配置を解決したとは扱わない。

## 時刻・Hz・replay・回帰

90本（3版×GP0/57×水平/上30/壁1/壁10/天井×30/60/120配信Hz）の実ブラウザtraceを保存。30個の3-Hz組で、各simulation tickの位置・速度・sweep端点/接触・雲入力/位置がhash一致。simulationは既存の1/60秒。各版の操作はQ押下tick0、Q解放/Sub押下tick1、Sub解放と発射tick2、throw終了tick23で一致。投擲のロック・操作時刻は変更しない。ageは発射と同じtickの最初の積分を含むため、雲発生のtick差はageTicks−1になる。

Chromium内の同一版公開 `ghostBomb` と既存owner-clock catch-upを使い、別の180条件も照合。ownerの実入力から得た原点・初速・durationを渡し、0〜10 owner ticks遅れて再構築した。8430 replay ticks、9166チェック点で位置・速度の最大成分誤差0、終端・雲入力/位置も一致。一部の即時接触では遅延が0tickに丸められる。これは**公開replay methodと遅延clockの再構築検査**であり、2端末通信・受信admission・実際の途中参加を通したものではない。異版同士の一致を主張しない。

元版のkit-subs既存テストは38/38 pass。候補へ同じ38件を当てると37 pass、Storm重力24を固定した旧期待値だけが57.6に対してfail。元のテスト自体は変更せず、そのStorm固定期待値を明示除外した普通サブ等37件がpass。親の306trace/102組一致・16884tick・普通ボム不変の検証は親提供の証拠として区別する。

## 実画面・保存と未確認

[before GP0](evidence/inkwave-storm-throw-calibration-2026-10-23/before-GP0.png)、[before GP57](evidence/inkwave-storm-throw-calibration-2026-10-23/before-GP57.png)、[距離のみ GP0](evidence/inkwave-storm-throw-calibration-2026-10-23/distance-GP0.png)、[距離のみ GP57](evidence/inkwave-storm-throw-calibration-2026-10-23/distance-GP57.png)、[contact併用 GP0](evidence/inkwave-storm-throw-calibration-2026-10-23/both-GP0.png)、[contact併用 GP57](evidence/inkwave-storm-throw-calibration-2026-10-23/both-GP57.png)。ユーザーが今回明示許可した自作ゲームの代表画像のみ報告資料へ保存し、任天堂映像・素材や画像アーカイブは同梱しない。beforeの雲なし画面、候補の15/20/25m周辺の通常レーン画面を直接閲覧した。画像だけで0.1m差の判定はしない。

6枚とも実Game・実練習場・同じ足元(6,0,0)・通常followカメラ。発射はpitch0、その後に同じ通常カメラを−0.35へ向けた採取フレーム。HUDは射撃線から0.0mを示し、距離の根拠は実座標とm看板・5mグリッド。actorや缶を着地点へ移動して撮影していない。

最初の連続描画による各版の撮影は `page.screenshot: Timeout 30000ms exceeded`、PNG保存なし。GPU-finishを入れた再試行も最初の飛行でpendingとなり、該当私有プローブを停止した。最終90traceはGame._frameの配信dtを変えて**飛行中のrender submissionを抑制**し、代表フレームだけGPU完了を確認して正常撮影した。追加の水平描画試行では、Q/Sub発動〜発射の3tickを描画抑制し、その後の各配信フレームを描画してGPU完了を確認した。before30Hz GP0、距離のみ30Hz GP0、contact併用30Hz GP0/57・60Hz GP0の5条件は90traceの同条件と軌道一致。contact併用の[30Hz GP0画像](evidence/inkwave-storm-throw-calibration-2026-10-23/both-GP0-30Hz-rendered.png)と[30Hz GP57画像](evidence/inkwave-storm-throw-calibration-2026-10-23/both-GP57-30Hz-rendered.png)は撮影できたが、後続の撮影は同じ30000ms timeoutで終了した。水平18条件の連続描画マトリクスは未完了で、実時間での30/60/120GPU FPSも未計測。これを通常ゲーム実画面や実ブラウザ内の力学検証と分けて残す。

隣接JSONに3版のbuild/source hash、30組のtick hash、入力・初速・時間・全接触・代表画像hashを記録。下位evidenceには90本の生trace、180replay、実行プローブのテキストを保存した。source/emitted/artifactも照合し、beforeから距離版の入力差はkit-subsのみ、contact併用はそれとstorm-effects-adapterのみだった。元branchのruntimeは固定2cc81deadのまま。

Libraryと既知の拒否済み参照URLを再試行・迂回していない。本家の投擲角・版11.3.0対戦設定・直接距離計測は未確認。正確な対戦用既定gravity/dragの根拠と実機比較、実通信/途中参加、連続GPU描画が残件であり、候補runtimeは一般採用しない。
