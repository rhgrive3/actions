# f72 CIのHUD fixture 3失敗を修復

対象は[Validate39979261047 / shard2 job120502946814](https://github.com/rhgrive3/actions/actions/runs/39979261047/job/120502946814)で親が取得した3件の `this._clearReticleFeedback is not a function`。旧head **f72ccdb4b11cb76b01dd0567975924cbd6d83c60** を別worktreeへ保存し、同じ3失敗をローカルでも再現した。修復実装commit **fe7ac7a50912b23ad08ca56f415148367baed8c5** はf72を直接の親とする。PR1859/mainの更新は含まない。

## 原因と最小修復

実HUDには `_clearReticleFeedback` がある。#561の `hudRig` は `WALKED` にあるmethodだけから別の小さいclassを作り、#894が使う共有 `hud-fixture` もvisibility/judgeの部分methodだけからclassを作る。どちらもcleanup helperを抽出しないまま、現在の `_onSplatted` / `setVisible(false)` を呼んでいた。自己被撃破とwin/loss判定後のhideで、完全なHUDにはないfixture固有のTypeErrorになった。

変更は次のtest 3ファイルだけで、runtime / adapter / 原本 / composition / network / ACK購読には変更がない。

- `patches/splatoon3/tests/assist-presentation.test.mjs`: 実cleanup methodの抽出範囲と対象を追加。自己被撃破で既存の表示ゼロ・bookkeepingを保持し、実helperがpulseをcancelしkill cue / damage cacheを消すassertionを追加した。
- `patches/reliability/tests/hud-fixture.mjs`: composed sourceがcleanupを呼ぶ場合は、その実method本体も抽出する。raw upstreamは呼出しもhelperも持たないため従来どおり扱う。no-opやoptional呼出しへの置換ではない。
- `patches/splatoon3/tests/judd-result-scene.test.mjs`: 既存win/loss両ケースにin-flight pulse / kill cueを置き、結果画面へ渡した後のcleanupも確認。従来の結果回数、勝敗、overlay/FX解放assertionは維持した。

追加で有効にした既存built-site検証には、VM loaderが `three/addons/` をrelative pathとして扱う独立した解決漏れがあった。最初の `f72-before.tap.gz` の4件目はそのENOENTであり、公式CIの3件と混同しない。同じassist fixtureのloaderでbuild内 `vendor/three/jsm/` へ解決し、完全なemitted HUD prototypeを評価する。自己被撃破を実emitted `_onSplatted` へ渡し、helperの存在・cancel・表示ゼロも追加確認した。

## 再現と結果

| 記録 | pass | fail | skip | 範囲 |
| --- | ---: | ---: | ---: | --- |
| f72-ci-source-before | 17 | **3** | 1 | #561 no-credit/self、#894 win/lossが同じTypeError |
| fixed-ci-source-after | 20 | **0** | 1 | 上と同じコマンド、3件すべてpass |
| fixed-emitted-and-targeted | **33** | **0** | **0** | 上の2 suite＋実生成物reticle12件。うち実emitted HUDはassist1＋reticle12 |
| surrounding-source | **117** | **0** | 3 | 共有fixtureの全10 consumerとassist/reticle周辺 |

sourceコマンドの既存skipは、built-site環境変数未指定の条件付き検証である。skip条件やassertionを削除・追加・緩和していない。assistのbuilt-site検証は別の生成物実行で明示的に有効にしてpassした。周辺の残る2 skipは既存のemitted Match検証であり、今回の117 passには数えない。`validation.json` に名称を保存した。

通常esbuild-minify build成功、1420 canonical inputs / 2110 artifactsを再読し、全artifact bytesとGit入力を照合した。f72測定buildからの入力差分 **0**、出力差分 **0**、manifest全体もbyte一致。contentHashは **fb5f0fab676d92749db0e02f332770530eb930b6c6d7590ec0e926dd3715c5d7**。startup budget / 参照13 mappings / diff checkもpass。test-only修復なので通常browserは再測定せず、[f72の既存小型transport/HUD受入](https://github.com/rhgrive3/actions/blob/bb6c3958b4a874dfe77843eb03df298be0e9607e/reports/reticle-live-transport-20261023/README.md)と元のmain7e browser受入へ同一runtimeを対応付ける。

焦点実行ログでは `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING` は観測していない。NodeのExperimentalWarningは記録したまま。別CIのoptional motion warningを、この3 TypeErrorの原因・修復済み事項として扱わない。

`commands.txt` に実行コマンド、`validation.json` に件数・skip名・test source hash・原ログhashを保存。raw TAPはbytesを変えず `.tap.gz` へ可逆圧縮した。初回の4失敗、最初の21 passという中間結果も保持している。source/component、通常browser、実GPU/retail/live deployed relayの受入を区別し、後三者を今回再検証したとは主張しない。

新candidateの全required remote CIは未確認。親の独立差分確認前にPR1859/mainへ適用しない。公開ref/tree/blob読み戻しと最終SHAは親への最終報告を正とする。
