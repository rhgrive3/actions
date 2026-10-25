# INKWAVE 統合候補の検証結果

コード: `94b035efca9e86fbb6431c568086426790536c00`
Tree: `bedb7a622685427293581037f1e788bfefa22a21`（8,267 leaves）
保存ブランチ: `validation/354f1c5-full-browser`
証拠ブランチ: `evidence/354f1c5-validation` の `reports/integration-validation-354f1c5/`

指定された元 commit `354f1c50955d60be5d3bc29c6f3712be505548f8` は GitHub connector と local git の両方で取得確認した。tree `20c42a28e4736dff4a190462a25594cd5f565015`、8,254 leaves、GitHub recursive tree の truncation 無し。別版の代用はしていない。

## 実施した変更

MobileInput の候補ソースと互換性 lock を整合。指示された Transport `f556a29d429184645ef49d560ed3cf1532787020`、GPU checker `6890cd67a8fc6287ab986bfca4595371013fbbd7` を公開 exact bytes の確認後に統合した。中央 journal は Transport の10行だけ追加した。

全件回帰で発見した旧 fixture を、実 constructor・実 helper・承認済み snapshot の生成経路へ整合させた。期待値、元 workload、caps、rates、receipt、anchor、epoch は緩めていない。native checker は実 context 所有者確認と単一の元180秒 gateを使い、prebuilt の正確な chunk に破損を注入する。髪・身体・武器形状の編集なし。main・PR更新・workflow dispatchなし。最後のコードcommitにCI skip指定なし。

## 合格した検査

| 検査 | 結果と証拠 |
|---|---|
| Node22本番ビルド | `build-native-complete.log`。minify/tree shaking有効、23 native stagesを正規LFS資産で構成。 |
| 厳密照合 | `identity-final-head.json`。manifest入力1,468＋pipeline/verifier＝1,470 source files、成果物2,164。 |
| revision外 native 資産 | `lfs-exact-final-head.json`。405ファイル・1,492,087,754 bytes。checkoutと出力の両方を最終commitのLFS SHA256/sizeへ照合。 |
| startup budget | `budget-native-complete.log`。決定的file/dependency検査であり実機速度の計測ではない。 |
| native minimap 実Canvas/実Game | `undertow-after-rematch/minimap-browser.json` と `undertow-minimap.png`。8 actors/7 bots、現navの所有、source floor/cover triangle、paint cell、owner/alpha検証。 |
| 実Input/MobileInput/HUD | `input-final/result.json` 5cases。さらに `mobile-native-events/result.json` 6cases、trusted touch/native resize/emulated orientation、29配信artifact hash確認。 |
| cosmetics 実描画 | `cosmetics-capture-receipt.json`、`cosmetics-after-rematch/manifest.json`。元13cases・全ticks・5viewsを残し、カタログ確認済Dualiesを1case追加。14cases/330画像、全800x450 PNG、exit0、pageerror/requestfailedログ無し。実描画のpresentation証拠であり、GPU上の共有pool所有権や左右socket座標の専用検査ではない。 |
| 共有 muzzle 等 emitted gameplay | `emitted-focused.log` 中の実emitted gameplay 9cases、およびsource関連回帰。混合run全体の合格とは扱わない（下記setup失敗あり）。 |
| 実Gameの読み込み取消 | `native-game-cancellation-after-rematch/component.json`。同時Hagglefish→Inkblotで最終owner/1 native root、Tidewater→Scorch→Tidewater全3切替のrender/finish、fingerprint正負例、pageerror0。独立componentでありnative-lifecycle全体の合格ではない。 |
| GPU idle-resource 全体 | `idle-isolated/idle-resources-result.json`。最終head exact-source、Chromium154/SwiftShader、3cloud themes/far transitions/pause/results/cold boot/context検証、errors0。元workload/timeout/閾値のまま。他の重い処理の完走後にPASS。 |
| GPU checker 実WebGL2関数 | `gpu-identity-native-probe/result.json`。capture/verify、trusted loss後拒否、両側cleanup。171/171 checker regressionも合格。 |
| Transport | `transport-final.log` 実Chromium/local WebSocket、`transport-emitted-focused.log` emitted4/4、source関連回帰合格。 |
| volume identity | `volume-identity-configured.log` 4/4、全34 decoded RGBA framesとsource VTF一致、腐敗/codec/cache gates。 |
| Canvas独立比較 | `canvas.log` Node22 14/14。legacy40条件/native90frames/negative controls。全Game描画の代替ではない。 |
| 再試合 | `rematch/rematch-lifecycle-result.json`。10/10周＋Range95秒＋次試合clock、errors/failures0。これは保存済み先行artifact `b235a57aba9ce93065056f876436fa915297d458cb0c9f2b32701f7e67a2d569` の結果。最終artifactのexact-head再試合受入とは区別する。 |

最終本番 contentHash: `f75205126dc2f9830e2d3db5fa837bb9ed404af93d5a781e44f678cb09207311`
inputHash: `1b3c82c25b5538e309c813ace3434d8532975331ab0c675d3c5a561929c325dc`

## 全件 source と残る不合格・未実行

全1117ファイル選択を完走。ordinary TAPは9,066 tests: **9,013 pass / 30 fail / 23 skip / cancelled0**、別途isolated Turf14/14 PASS。`source-full-summary.json`、`source-full-original.tap.gz`（原ログのdigest別添）、`patches-node22.log`に保存。

30件は旧fixture不整合だった。Mobile viewport/owner observer、Booyah addRaw、Inkjet cached attributes、Paint BufferAttribute owner、shape pool、remote accepted snapshotの整合を修正し、各対象のsource/minified回帰は合格した。Trizookaの同系fixtureも先回りして再現・修正した。各 `*-fixture*` / `roller-held-remote-fixed-source.log` を参照。製品コードは変えていない。全件runはfixture修正をまたぐ診断であり、30 failの結果を緑に置換していない。最終headからの全件fresh CIは親担当で未実行。

23 skipは既存のemitted-site/参照source/参照画像/before-build等の条件付き検査。手動skipや短縮workload追加なし。理由は `source-full-summary.json`。停止済み参照・旧圧縮資料への別経路取得なし。

正規native-lifecycle全体は **FAIL** を保持。prebuilt chunk破損はrequests1、既存level/paint/display保持は全true。ただしprebuilt integrity errorを正規sourceへfallbackする実装のため、外部source取得失敗がterminal `Failed to fetch` となり、元のintegrity-error assertionを満たさなかった。`native-lifecycle-complete-single-gate/`。後段mobile5stagesは未到達。source fallbackやoracleを書き換えて成功扱いしていない。取消の独立component PASSとは区別する。

emitted fixture setupの未実行: native minimapの内部 `rule-availability.mjs` とrollerの内部 `weapon-models/rollers.mjs` はstandalone公開されずENOENT。private loaderを直接importする独立probeも非公開entryのため404。依存の捏造・raw sourceの出力へのコピー・bundle改変によるPASS化なし。

初期の外部OBJ tunnel failure、Playwright browser download 403、負荷競合中の起動/cloud timeoutも削除せず保存した。正規repository LFS405件でnative資産不足を解消し、既存system Chromiumを指定した。別経路の外部raw asset/browser downloadは行っていない。

## 保存場所と範囲

全330枚は `/workspace/inkwave-validation-354f1c5/cosmetics-after-rematch/`（87,030,769 bytes）。全画像SHA256/sizeは `cosmetics-capture-receipt.json`。証拠ブランチにはmanifest/receiptと各case最初のtick・全5viewの代表70枚を保存する。全330枚の取得場所はこのtask workspace。成功/失敗画像と全ログも同root配下。

判定は上記scopeごと。全CI・全参照・全native-lifecycleの一括合格やSwitch/iPad実機性能・Splatoon3実機同条件一致は主張しない。main公開条件を緩めていない。
