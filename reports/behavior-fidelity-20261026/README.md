# 追加ブキの挙動修正（2026-10-26 JST）

## 対象と根拠

PR #1878 の `dd90aa241aabd5f0b972cc3471386ba3d4da86dc` から派生した
`fix/inkwave-original-behavior-20261026`。元PR・mainへの直接の変更やマージはしない。
公開版 `inkwave-public/` と本番合成した `patches/splatoon3/` が対象。
比較版は従来と同じ **Splatoon 3 Ver.11.3.0**。本家実機の全挙動一致とは扱わない。

本家の数値は [Leanny固定抽出7280ff9c](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)
と、リポジトリの `main-weapon-catalog-data.mjs` に収録済みの同版の記録を使用。
[S-BLAST原典](https://raw.githubusercontent.com/Leanny/splat3/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponBlasterPrecision.game__GameParameterTable.json)
の通常／空中モードをWebでも再取得した。

## 修正した差分

| 差分・再現 | 変更前 | 修正と根拠 | 影響 |
| --- | --- | --- | --- |
| 追加ブラスター6種を高所／壁際で爆発 | 短い下向き床探索だけに塗りを委ね、近い床が無いと塗れない。球状塗りと落下滴を区別せず `SplashDropPaintRadius` で即座に床を塗る | 原典 `SplashPaintRadius` の爆心の球状塗りと `SplashDropPaintRadius` の落下滴を分離し、既存の落下滴キューに接続 | 高所からの塗りが実際に落下し、壁・近接面の塗りも既存PaintSystemで判定する |
| 同じブキで地形接触／直撃 | 空中爆発と同じ塗り寸法 | `SplashPaintShotColHitRadius` と `SplashDropPaintShotColHitRadius` を使用。壁接触の滴は壁の入射側へ出す。S-BLASTの通常／空中モードは別の原典行を使う | 直撃／接触の塗りが空中爆発の大きさに化けない |
| 地形／プレイヤーへ当てた弾の近くに別の相手 | 追加種は空中爆発の全範囲・全威力で別の相手も被弾 | `ShotCollisionHitRadiusRate` で対人範囲を縮め、既存nativeの「距離帯を縮小→半減→0.1HP単位」の処理と整合。直撃の相手は爆風から除外 | ノヴァ／ロング／S-BLASTの接触爆風は35～25、クラッシュ15、ラピッド系17.5の範囲へ。対物／Bossの独立した既存処理は保持 |
| パブロ／フィンセントで塗り進む | 半幅0.6／1.3へ余分な0.25倍が入り、0.15／0.325。ホクサイ0.9よりフィンセントが細い | `WeaponBrushMini/Heavy.BodyParam.PaintParam.WidthHalfMin/Max` の0.6／1.3をそのまま使う。ホクサイの既存0.9と同じ単位 | 全幅0.3→1.2／0.65→2.6。塗りの所有面積とそれに伴うポイントは変わる。ダメージ接触幅は変えない |
| パブロを下ろし、移動しながら敵インクを踏む | 通常の敵インク減速・床ダメージ・回復抑止に入る | `WeaponRollParam.NoOpInkEffect=true` を実移動と資源の処理へ接続。停止・振り・サブ・空中・特殊行動・空タンク・別フデは免除しない | パブロ固有の移動と敵インク耐性が有効になる |

| 追加58種でポイズンミストに入る | カタログのmoveSpeed上書きがinstallAllSubsの減速wrapperを落とし、標準7種にだけ霧の減速が効く | 各actionの速度決定後に既存toxicMistScaleを1回だけ適用。ギア耐性、同時の霧、味方・死亡済み・退出を区別 | 歩行・射撃・チャージ・塗り進みで、追加種も既存の霧の減速に従う。パブロの敵床免除は霧まで無効にしない |

塗り進み幅は、試し撃ちライン=5の既存規約でパブロ全幅1.2=0.24ラインと整合。
フデの形状・骨格・グリップや未取得の本家モーションは変更しない。

接触爆風の根拠は、固定抽出の半径率と
[ブラスター属の実測整理](https://wikiwiki.jp/splatoon3mix/ブキ/ブラスター属)、
[ノヴァ](https://wikiwiki.jp/splatoon3mix/ブキ/ノヴァブラスター)、
[クラッシュ](https://wikiwiki.jp/splatoon3mix/ブキ/クラッシュブラスター)、
[ラピッド](https://wikiwiki.jp/splatoon3mix/ブキ/ラピッドブラスター)、
[S-BLAST92](https://wikiwiki.jp/splatoon3mix/ブキ/S-BLAST92)。
範囲内の連続補間は既存INKWAVEモデルで、本家エンジンの式を復元したとは扱わない。

パブロの耐性は原典の明示フラグと
[本家S3の検証記録](https://wikiwiki.jp/splatoon3mix/ブキ/パブロ)
（敵インク上や壁へフデ先を押しつけて進む際、他のフデと異なり床ダメージ・減速を受けない）を照合した。
停止・ジャンプの境界時刻そのもののSwitch実測はしていない。

## 検証

最終集計とログのハッシュは `validation.json`。ログは同ディレクトリの `logs/`（元版の失敗対照だけはraw bytesをgzip保存）。
本番ビルド `f1c8893ce039a9eaf545c60961889ff0e8490e7c78ee511c2371931fccdad599` の全1,477宣言入力は実装コミット `3e4a6624450fd3e980562d04c6affdc7284be80a` と一致し、全2,174生成物のSHA256不一致も0。

- 新規4ファイル27試験。本番合成したActor／Runner／Projectiles／Physics／CPU所有格子を使用。最終生成物も27/27成功。
- 同じ27試験に元PRのmain-weapon-catalog/resourcesの完全な元バイト列を渡す対照は **4成功・23失敗**。既存assertionを緩和して合格させていない。
- 追加58種のidle/fire/charge/rollingと標準7種でミスト倍率を検証。敵床免除と霧／武器ダメージが独立していることも検証。既存の霧の係数とギア曲線を再利用し、新たな減速値は作っていない。
- 高所からの滴は実Level／Physicsへの落下、30/60/120Hzで同じ着地、直接命中は1回、remote/ghostは塗り・滴を生成しない。
- 最終ソース5ファイル57/57、関連塗り4ファイル45/45、ミスト関連4ファイル31/31成功。先行の既存関連9ファイル107/107、敵インク関連6ファイル44/44も成功。別実行で範囲が重なるため件数は合算しない。
- Chromiumで実Character／ソースモーション／Actor／Physics／CPU塗りを、フデ3種×8方向×30/60/120Hz=**72条件**で成功。これはGPUピクセル比較・Switch実機試験ではない。
- 同ブラウザスクリプトの既存全武器実行は、最初の標準ローラー30HzでgripL=0.06185055、gripR=0.02571301となり、既存の0.02／0.012の境界に失敗した。元PRのmain-weapon-catalog/resourcesへ戻したブラウザ対照でも左右とも完全に同じ数値で失敗した（rolling-browser-baseline.json）。判定は維持し、フデ成功をローラー成功へ読み替えない。
- ブラウザ検査のフデ上限に古い1/4幅が残っていたため、3種の明示原典値へ更新し、下限の一致も追加した。`--weapons` は検査対象を明記する任意フィルタ。既定の全8武器と既存の姿勢・接地・握り・周期一致の検査は保持。
- 最終ミスト修正後の `npm test` 全工程成功（互換・migration監査・直接ソース・quality・relay・account・backup・queue-recovery・memory）。新規の27試験は既定npm testとは別にsource/emittedで実行した。
- 本番minifiedビルド、起動予算、quick互換、差分検査成功。LFSの事前変換済みnative payloadは取得されておらず、ビルドは既存のブラウザ変換fallbackを使用した。

## 残る差分・限界

既存の未解決Issueを全件解消したとはしない。B保持ジャンプの正確な曲線、Splatling減速式、靴高、Bloblobber斜面反発、音声の真のイベント／未取得原音、SP換算、骨格・グリップの本家比較には未確認事項が残る。
ブラスターの地形着弾爆風の遅延、全ての壁垂れ／塗りマスク、対物・Bossの本家全比較も今回の完了範囲ではない。
原典フィールドが未使用というだけでは、不明な意味を推測して物理を変えていない。

Switch・実GPU・Safari/iPad・二端末ネット対戦は未実施。生成物の検証と実機一致は区別する。


## 独立レビュー後の壁押し付け補完

元 #1879 の最終head `7ee2625d2f3bcf5bd6270572167b94047de2f7a4` に対する追加差分。
上記の検証数値・元ログ・原典の固定11.3.0は維持する。

実Physicsの `Actor._resolve` は壁へ向かう水平速度を0にする。その後に呼ばれる
`resourceSurface` が、ZRと前進入力を保持しているパブロまで停止とみなして
敵床ダメージ／回復抑止へ戻す問題を独立レビューで再現した。これは上記の
パブロ検証資料にある「壁へフデ先を押し付けて進む」条件と整合しない。
`brush-roll-ink.mjs` で、実際の壁接触と有限な壁法線があり、移動入力が
その壁へ向かう（内積が負）場合だけ、水平速度0でも移動試行を継続中と判定する。
Physics、武器ダメージ、ミストの係数やその他の分岐は変更しない。

`inkbrush-enemy-ink-roll.test.mjs` の追加回帰は、fixtureの通常のintegration停止を
実 `Actor.prototype._integrate` に戻し、既にZRを保持した状態から実Level／Physicsの
床と壁へ進む。30/60/120Hzで壁が速度を0にした後も床ダメージ0とHP回復を確認し、
入力ゼロ・壁から離れる入力・接線入力では免除しない。空中・空タンク・サブ・振り・
別フデの除外、ミストの半減と実際の武器ダメージも検査する。
元7eeのhelperだけをloaderで戻す負例は、30Hz壁接触時に `onEnemy=true` となり失敗した。

追加後の新規4ファイルはsource 28/28、fresh minified生成物28/28成功。
関連enemy-ink／sub-ready／movement-resources／Mistの6ファイルも77/77成功（上記との件数は合算しない）。
本番ビルド、startup budget、quick互換、source migration監査も成功。
追加後のbuild contentHashは
`7ee9f176b0166eef0d84ef1f9347b49a6e798e2ff1e474496e48abf2e0c629f5`、
宣言入力1,477・生成物2,174。Node v24.19.0のlocal検証であり、元7eeの72条件ブラウザを
追加後のfresh browser受入へ読み替えない。新しい最終headの完全CIは別途必要。
