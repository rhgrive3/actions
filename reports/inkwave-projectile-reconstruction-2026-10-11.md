# INKWAVE 弾形状再構築 — 2026-10-11

本変更は、本番ビルドへ接続した描画専用の再構築である。本家11.3.0の原典数値と、原典不明の形状式を明確に分ける。Nintendo実機との完全一致、Android実機性能は未検証であり、Ready for Review／mainマージの条件を満たしたとは扱わない。

## 統合基点と変更範囲

- 最新mainを確認：`4ccbab16d94650bffaffe254927b91099ce37739`。
- 関連PR #1182／#1188／#1208／#1211／#1219を確認。重複変更を避け、統合PR #1182のhead `3a864f81ecf8ea3219f8209d0dbd803ca9e8b866` を基点とした積み上げ変更。#1182は未マージであり、この変更だけでmainが更新されたことにはならない。
- 凍結された `inkwave-public/` は変更せず、最終build adapterを既存6段階の後へ追加した。生成された `src/game/weapons.js`、`src/game/inkFlightRuntime.js`、`src/main.js` とcatalog runtimeが実際の接続箇所。
- シューター／マニューバー／スピナーの共有軌跡、ローラー横・縦振り、バケツ前4＋後5を対象。派生スロッシャーは泡、渦、爆発塊、三方向、二連の表示方式を分ける。既存special、未対応family、小飛沫、着弾FXは既存所有者を保持する。

## 確認できた原典

固定コミット：[`Leanny/splat3@7280ff9`](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)。65件の公開JSONを取得し、全65件のSHA-256、52ユニット、116のJSON pointerを既存カタログと照合した。詳細と全URLは [武器ソース監査](inkwave-projectile-weapon-source-audit-2026-10-11.md) と `patches/splatoon3/reference/projectile-visual-profiles.json` に記録。

| 原典ファイル | 確認できた値 | 確認できないもの |
| --- | --- | --- |
| [WeaponShooterNormal.game__GameParameterTable.json](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponShooterNormal.game__GameParameterTable.json) | 公開の弾パラメータ、通常ShooterにMaxLengthFrameの個別指定がないこと | 内部既定値、実メッシュ、銃口接続時間 |
| [WeaponRollerNormal.game__GameParameterTable.json](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponRollerNormal.game__GameParameterTable.json) | Wide主群0.3→0.3、Vertical主群0.36→0.36、ユニットごとのDrawSizeParam | 液膜の全幅・厚み・分離式 |
| [WeaponSlosherStrong.game__GameParameterTable.json](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSlosherStrong.game__GameParameterTable.json) | 4＋5、前0.5625→1.0／offset −0.05／−0.03、後0.6→0.6／offset −0.1／−0.1、Tail 0.5／4／5F | これらが形成する実メッシュ・実Emitter |

[`HoianViewer@89f23684`](https://github.com/nvnprogram/HoianViewer/tree/89f23684b9dede5da8207e5f9f1980150bec774a) のEsetb／VfxFile／Emitter／HistoryStripes／EffectFile／EffectPlaybackを解析。`.esetb.byml.zs` のzstd→BYML→PtclBin/Esets、VFXB v46、G3PR/PRMA primitive、EP02の履歴とHermite補間、描画とemission primitive IDの違いを確認した。EP01/EP03未描画などの制限を含む [VFXソース監査](inkwave-projectile-vfx-source-audit-2026-10-11.md) を参照。

対象武器のEmitterSet／Emitter／子Emitter／mesh／texture／shaderの実対応は、合法的にアクセスできるRomFS/VFX素材がなく未特定。添付RE v3 ZIPとDriveの公開ソース集も照合したが、Driveの復元manifestはゲームRomFSを含まないと明記する。S2の関数名は世代差のある参考であり、更新式の証拠ではない。Nintendoゲーム素材はこの変更・配布ZIPに同梱しない。

## 描画方式

実60Hzの物理更新点を、32標本のFloat64履歴へ記録する。粗いcatch-up更新も内部の各物理tickを観測する。描画FPS側だけが履歴を補間し、当たり判定、位置、速度、寿命、ダメージ、塗り、通信payloadを編集しない。

13断面×12頂点のCPUメッシュを単一の不透明batchへ書き込み、位置／法線／色とGPU更新範囲を再利用する。CPU頂点を用いるため、beauty／影／深度／AOの形状が一致する。Shooterは先端と末端を閉じた履歴ロッドと残留尾。Rollerは横振りの薄膜と同一volleyの隣接主弾間の距離制限付き接続、縦振りは細長い独立形状。Bucketは前弾の厚い頭と後弾の細い帯を分け、9発と既存ユニット別半径を保持する。

次は独自近似であり、本家仕様として確定しない：断面形状、薄膜厚み、ローブ、接続距離、材質、Hermite制限式、通常Shooter／Dualiesの暫定2F、既存width校正Shooter0.7／Bucket0.5。Splatlingの明示3Fはその原典の武器に限って使用する。根拠のない「0.1秒後に0.6mへ縮む」アニメーションは追加していない。

## 検証と未実施比較

- 最終adapterを使う実Projectiles/Physics/NetMatchの新規試験16/16成功（色転送前の複数更新・slot並び替えも検証）：原典値、形状別buffer、30/60/120Hz、4＋5、ローカル／受信、Splatling残留尾、13主弾Rollerのvolley分離、粗い30Hz更新、停止した受信弾の液膜、遅延出生のGround→Air速度を検証。
- 同じseedをVM起動前から与え、旧6段階／新最終adapterを対照比較。追加THREE資源のUUIDが12回の乱数を消費する回帰を修正し、起動時乱数回数と発射後の状態／通信が一致することを確認。
- 独立レビューで、Roller接続0件、粗い更新の出生時刻、衝突直後の履歴が壁を貫く問題、壁垂れ時計、描画多重更新、撮影時のsync漏れ、停止したperformance測定を発見し修正した。GPU転送前の複数色更新でdirty範囲が失われる問題と、履歴の厳密tick/EPS境界で接線が変わる最適化回帰も修正した。最新の [独立レビュー](inkwave-projectile-independent-review-2026-10-11.md) を参照。
- 本番の再ビルドは成功。packing testはコミット後の正確なblob照合を含め8/8成功。新ファイルを未追跡のまま検査した初回の失敗は保存し、追跡登録／コミット後に再実行した。容量上限は変更していない。
- 最初の無制限並列全suiteは8GiB環境でOOMを起こし中断。4workerで再実行し、4,449件中4,433成功／失敗0／条件付き16skip、787.6秒。品質／信頼性の別コマンドは1,815件中1,798成功／失敗0／条件付き17skip。
- 通信／loading／移動／試し撃ちの別コマンドは550件中542成功／3失敗／5skip。3件は既存worker fixtureの未準備パスで停止していた。パス準備後は2件成功、1件が明示production 68KiBのplanを渡さず旧64KiB fallbackを検査する不一致で失敗。明示68KiB契約を渡して既存68KiB負例を維持し、旧64KiB契約の別試験と合わせ5/5成功。実容量上限・負例の期待値は緩めない。

ローカルChromiumはsocket制限、headless_shellはWebGL command-buffer／udev失敗でSIGSEGVとなり、ローカルの成功スクリーンショットは0件。GitHub CI run 38115541415では本番起動の変更前44枚をGLエラー0で取得したが、壁条件を検出できず停止し、変更後と性能測定は未完了。撮影条件を実ステージ床・壁のraycastで検証する方式へ修正した。GitHub CIへ同じTidewaterの本番起動、F0/F5/F10/F15/F36、正面／横／肩越し、床／壁、連射、desktop／mobile emulationの変更前・後撮影を追加した。CIの完了結果は別の最終receiptに記録する。

本家映像は任天堂の60fps販促動画を取得・フレーム確認したが、版・色・角度・FOV・距離を統制できない。11.3.0との対応条件比較、IoU／輪郭誤差／透明度／寿命の実測は**未実施**。映像を内部仕様や完全一致の証拠として扱わない。

## 性能の範囲

新規batchは最大700形状／109,200頂点／201,600三角形、beauty draw最大1件追加。旧小飛沫batchの上限は別に保持する。CPU typed geometry 6,350,400bytes、GPU geometry同量、履歴2,508,800bytes、補助typed buffers40,200bytes（色cache追加16,800bytes）、共有module断面表3,408bytesを確保する。JS資源・ドライバbookkeepingはこの数値に含まない。700形状超過時の表示抑制は旧上限と同様に存在する。

初期CPU実装のNode VM計測では、20／100／700体で旧0.149／1.047／0.990msに対し新2.266／11.213／79.564msとなった。これはWebGL/FPSではなくbuffer生成の計測だが、大量弾で重大な負荷差があるため性能修正を実施し、直接Node／VM／実ブラウザを区別して再計測する。この初回値を成功扱いしない。旧700-body測定は上限によって139主弾＋556装飾飛沫のみを描いており、新700主弾とは対象数が異なる。最適化後の凍結snapshot（SHA-256 406c20264f87a643aa5bff35e3f70f4e42db151683f13a2734d34a49a472a9d1）では700主弾のVM 2.0682ms、host 1.3159〜1.3314ms。同じ主弾数に近い旧head-only695主弾は2.0365ms。これらはCPU単体の測定で、実ブラウザ・実GPU・FPSの代用ではない。

負荷差、FPS、GPU時間、GC頻度、実Androidはまだ合格を証明していない。静的な「1batch／固定buffer」は実端末の性能測定の代わりではない。CIのSwiftShader／mobile emulationも実Android GPUと区別する。

## 変更ファイル

`patches/splatoon3/projectile-visual-adapter.mjs`、`runtime/projectile-visuals.mjs`、`runtime/projectile-visual-source-data.mjs`、`runtime/main-weapon-catalog.mjs` のread-only observer、`runtime/weapons-fidelity.mjs` の近似表示注記、2件のreference JSON、新規native test、3件の監査report、本report、behavior reportの追補、共通build composition／build-only list／patch checker、実ゲーム撮影script、専用GitHub workflow。

コミットSHA、PR URL、CI結果、最終画像、全試験件数、マージ状態は最終の成果receiptへ追記する。完全な忠実度／端末負荷が未検証ならDraftのまま保持し、mainへ未完成変更をマージしない。
