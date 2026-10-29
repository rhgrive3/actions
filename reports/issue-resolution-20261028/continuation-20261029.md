# 継続修正 — 実機検証を除く完了条件での再判定

ユーザーの追加指示「実機検証はいりません」を適用した。実機がないこと自体を残件理由にしない。非公開sourceの意味・未取得model/音源・必須trusted authorityの欠如・厳格校正不合格は別の条件であり、値を推測で確定しない。

これは最終hosted CI開始前の固定snapshot。最新headの成功/失敗・確認後のIssue解消はPR #1908/#1907の本文と各Issueコメントを正とする。mainはマージせず、#401とMOV-08b保留を維持した。

## 実装と検証

- Boss proofのtarget/slot/無敵phase整合、controller legacy gain/yaw、request-owned Pointer Lock、Charger special中断/remote準備、Splatling反転操舵、表示muzzle/full-cover、Zipcaster成功20F、hidden hair/native重複query、composer例外/precision/世代rolesを修正。
- 共通版・最適化版のfresh buildで追加11file emitted回帰は各62/62、packaging各10/10、startup budgetが成功。ソース・生成物・browser・全体性能を区別する。旧成功headのCIを新head成功とは数えない。
- 実ゲームの訂正pointer試験は6cycle/12回のDOM/Input ownership成立、page error0。元の誤ったcanvas前提による失敗と、別の15秒charge未完了は保持する。
- Composer最終software検証48case、既存post-depth78caseのChromium/WPEで厳格pixel/実FBO資源/復帰guardを確認。新CIは11file emittedと短い通常RAF2stage、precision/hairの実browser検証を加え、既存8shard/7browser/fan-inを維持。

## 全28件の再判定

|Issue|固定snapshotの判定|根拠・具体的な残条件|
|---|---|---|
|[#1823](https://github.com/rhgrive3/actions/issues/1823)|未完了|S3持続チャージ音の原音/event graph/parameter曲線が未取得。既存Splatune2 phraseのlifecycleを修正したがS3音源の代用とはしない。|
|[#1814](https://github.com/rhgrive3/actions/issues/1814)|未完了|個別source omissionは修正済み。UnitDamageRateの意味、Blob反射、paint selector/default等の未解明なsource algorithmを含む総合課題。|
|[#1813](https://github.com/rhgrive3/actions/issues/1813)|未完了|UnitDamageRate=0の選択的既存処理は検証済みだがzero/sentinelのnative意味を示すsource/schemaがない。|
|[#1789](https://github.com/rhgrive3/actions/issues/1789)|未完了|坂分類/係数順序、.35の総速度・法線速度制限の意味、大bubbleの疎な.4既定値継承が未decoded。|
|[#1757](https://github.com/rhgrive3/actions/issues/1757)|未完了|outputを保つ追加CPU削減は実装。whole-gameの同値校正が拒否されており、通常Turf全体のp50/p95改善は未証明。|
|[#1708](https://github.com/rhgrive3/actions/issues/1708)|未完了|2022年以降11武器自身の11.3原音/出典hash/event mapping/公開利用権が不足。借用音をnative確認済みとしない。|
|[#1671](https://github.com/rhgrive3/actions/issues/1671)|未完了|CPU/query削減は実装。native8actor全体の校正済みframe-time改善は未完。実機は不要だがcomponent countをwhole-game時間としない。|
|[#1666](https://github.com/rhgrive3/actions/issues/1666)|未完了|同一Boss targetの二重証拠、slot上限借用、無敵body証拠消費を修正。現在wireのowner作成fire/hitだけでは真偽を識別できず、mandatory trusted入力/資源/全武器接触simulationがない。|
|[#1665](https://github.com/rhgrive3/actions/issues/1665)|未完了|native-admitted順序修正は保持。authenticated ownerが合法風fire+hitを自作でき、既存wireには発射/接触の独立した真実がない。互換性を保つ完全trusted authority契約が未実装。|
|[#1607](https://github.com/rhgrive3/actions/issues/1607)|未完了|成功hook20F最短を修正。失敗45Fとsource ShotFailedIntervalFrm20のphase合成の意味は未decodedで、正しい45F観測を20Fへ置換しない。|
|[#1565](https://github.com/rhgrive3/actions/issues/1565)|未完了|G0/G2の校正済みwhole-game同値・負荷基準が未達。source distance曲線/測定済み品質不足/差引CPU利得なしにG3 PoseSearchを本番有効化できない。|
|[#1434](https://github.com/rhgrive3/actions/issues/1434)|未完了|同一現公開f151の4fresh trialsで4番目の1pixel RGBが不一致。全state/workload一致でもstrict zero gateが拒否。旧music-worker条件のcurrent stream owner不適合は別diagnosticで修正調査中。ABBAは未実行。|
|[#1431](https://github.com/rhgrive3/actions/issues/1431)|最終CI後の解消候補|実表示hit muzzle/全cover segmentを修正、physical/net/paint不変のsourceとemitted回帰を実行。|
|[#1116](https://github.com/rhgrive3/actions/issues/1116)|未完了|出荷bankはWiiU由来。S3の武器class別jump selector/実clip trackが未取得で、名前一覧だけからchooserを作らない。|
|[#1097](https://github.com/rhgrive3/actions/issues/1097)|未完了|WiiU generic Damageと既存native-upper class layerを区別。S3武器別selector/joint曲線が未取得。|
|[#997](https://github.com/rhgrive3/actions/issues/997)|未完了|現在のcadence/stride/source bankは実装済み。S3弱入力斜め歩行のsource locomotion/selectorがなく、WiiUの2D合成をS3式と断定しない。|
|[#992](https://github.com/rhgrive3/actions/issues/992)|未完了|native paint/droplet/CPU turfは検証。7phase permutation、nearest-foot、droplet初期動力/height/default/空間変換のsource algorithmが不足。|
|[#956](https://github.com/rhgrive3/actions/issues/956)|未完了|256shoe catalogは能力/素材metadataでsole/foot座標を含まない。2足のsource model/sole/reference transformがなく、gear abilityから発射高を捏造しない。|
|[#952](https://github.com/rhgrive3/actions/issues/952)|未完了|チャージ中逆/直交入力でsolver減速を打ち消す不具合を修正。S3減速式/開始frameはsourceで未確認。|
|[#890](https://github.com/rhgrive3/actions/issues/890)|未完了|B tapとholdの別trajectory、buffer/coyote等は実装済み。既存5F/.7のexact S3 source calibrationが不足。|
|[#845](https://github.com/rhgrive3/actions/issues/845)|最終CI後の解消候補|既存offscreen budgetに加えhidden idle/special hair target遅延/first-draw同値復元、exact native ground重複除去を実装。|
|[#735](https://github.com/rhgrive3/actions/issues/735)|未完了|無限下方damageはfinite境界/DPS/owner回帰で解消済み。既存12WU ray/14WU foot境界はinternalで、追加のexact-source cutoff値/座標規約が不足。|
|[#725](https://github.com/rhgrive3/actions/issues/725)|未完了|既存gyro endpoint bridgeは暫定で、中間値のsource曲線/version/methodが不明。実機検証は完了条件から除外。|
|[#642](https://github.com/rhgrive3/actions/issues/642)|最終CI後の解消候補|composer例外退役とScreenFX active時precision維持、世代毎post/scene役割を修正。software pixels/実GL資源/復帰回帰を実行。|
|[#532](https://github.com/rhgrive3/actions/issues/532)|未完了|4+1WU/12F等既存挙動は検証済み。S3 easing/glide/dive/defaultと独立空間変換のsourceが不足。|
|[#287](https://github.com/rhgrive3/actions/issues/287)|未完了|legacy gain移行喪失と上位yaw重複を修正。S3 right-stick transfer curveは公開sourceに未取得、bridgeは明示的な暫定値。|
|[#226](https://github.com/rhgrive3/actions/issues/226)|未完了|RainNum72はpaint call数ではない。生成/reuse/lifetime/接地/paint writeのsource lifecycleが未decoded。|
|[#79](https://github.com/rhgrive3/actions/issues/79)|最終CI後の解消候補|既存live Splattershotのfloor/wall/impact-angle paint/independentdrop/CPU turf実装を再検証。|

## 担当と変更commit

|難易度|担当|明示spawn設定|統合commit|
|---|---|---|---|
|1|remaining_authority|gpt-6.1-sol / xhigh|04791865|
|2|remaining_weapons|gpt-6.1-sol / xhigh|2d78f4a8 / 80c92e43 / e6b523c7|
|3|remaining_performance|gpt-6.1-sol / xhigh|9581522e / 99dc3d61 / 63318773 / 2ae0a297 / 9e76b219 / d2f94838 / 0faf90be|
|4|remaining_motion|gpt-6.1-terra / xhigh|153c8fbd / a7fe9ff0|
|5|remaining_audio|gpt-6.1-terra / xhigh|02b1cb58 / 50987ae2|
|6|remaining_input|gpt-6.1-terra / xhigh|64f996ae / c759b496 / c18e2aa6 / c6d682aa / 01ffaedd / a0146463 / 391ba31c|
|統合|root|root|6f8be3d1 / 474e3e14 / c003c26b / a1a62353|

変更file全件、fullSHA、Issue対応は[機械可読ledger](continuation-20261029.json)。詳細は[weapon](remaining-weapons.md)、[authority](authority-remaining.md)、[audio](audio-followup.md)、[input](input-followup.md)およびperformance追加receiptを参照。#1767は前回、既にmainにあるfix/native/必要CIを確認して解消した既存修正であり、今回の新実装には数えない。

新headの必要CIが成功するまでは候補Issueを閉じない。旧historyの赤やcancelledを消さず、未実装のauthority、未確定source、校正拒否を成功に変えない。

両combined buildの追加browser検証も各compositor48/48・hair first-draw3/3が成功。共通版の新しい通常RAFは2stage・計2cycle、各5秒combat・8actors・Crab退役released・errors0。root/optのRenderer/Input生成物hashは同一で、全1522/1523入力＋build scriptおよび各2229artifactをGitから照合した。raw結果は[圧縮receipt](continuation-evidence/receipts.json)、[runtime readback](continuation-evidence/runtime-readback.json)へ保存。ここから全体FPS・長期leak解消・最終hosted CIの成功は推定しない。
