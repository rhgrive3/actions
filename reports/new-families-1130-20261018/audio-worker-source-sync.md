# DSP worker の生成元復元（2026-10-18）

基準は実 main `b84d77cb7172807ac28fb6df13cd4a0ecfc9af3a`。修正は `cbd3c127`。対象は catalog CI run `39119025702` / job `117651665914` の `DSP worker bundle is stale`。数値・ログhashは [JSON証跡](audio-worker-source-sync.json) に記録した。

## 原因と修正

PR #1580 の `08855b74` は、生成済み `render-worker.js` に別キット95件の基本ブキ音声ID対応表と `mainAudioSourceId` を含めた。しかし生成元 `weapon-recipes.mjs` にそのimport・exportがなく、同じ関数が再生側 `bank.mjs` に別定義されていた。生成器を実行すると95件の対応表と関数が消え、149行の差分が逆転するため、`--check` が失敗した。

生成済みworkerに記録されていたimport・関数を `weapon-recipes.mjs` に復元し、bankも同じexportをimport/re-exportする。生成器やDSP係数は変えていない。bankは従来どおり、基本ブキIDへ変換してからworkerへjobを送る。workerへ別キットIDを直接送る場合の拒否も維持する。sub・specialやゲームプレイ・通信上のkit IDは変換しない。

再生成結果は、PR #1580 が配信したworkerと**全163,668バイトが完全一致**する。worker SHA256は `1b529572b841c452ae80e015aadb70a8926f07a7c2b0f2c307c2a85ac59fb412`。生成元recipeのSHA256も、配信済みworkerのheaderにある `f00400a2079453cd5780aa3a9a4271aedcdb29b771e4b3e4b865217c54c0d504` と一致した。`render-worker.js` にコミット差分はない。

## 検証

- 修正前：生成器checkはexit 1、新規のsource-export回帰もmissing functionで失敗した。
- 修正後：再生成と `node tools/audio/build-worker.mjs --check` が成功。
- catalog audio：16/16成功。95 kitの同一変換関数、実bankから送るcanonical worker job、未登録・prototype・null・sub・specialの非変換を確認。隔離classic workerで全98 recipe・696 event（8 kHz、variant 0）のPCMがsource rendererとバイト一致する。
- 関連audio：102/102成功。全2,088 PCM variantの有限値・上限、録音済みsample優先、decode中の扱い、別キットのMP3共有、loopの継ぎ目・停止・遅延開始、listener・loop更新、死亡・切替・disposeを含む。
- 別担当の独立検証：95 kitの実bank→canonical dispatchとraw alias拒否95件。対象16 base＋25 kitの全event×variants 0/1/2、771 PCM比較（8 kHz）が一致。不正event・sample rateの拒否も確認。
- `git diff --check` 成功。

helperだけの小計測（Node 24、warmup後に前後を交互に7回、1回194万lookup）の中央値は旧60.55 ms・新63.95 ms。関数本体は同一で、JIT・スケジューリングを含む単独測定であり、速度改善やゲーム全体の負荷は示さない。DSP workerは実行バイト・サイズとも変化0。

録音優先、loop、パン、clipの実装を巻き戻していないことは、workerの完全同一性と関連回帰で検証した。本件は生成元と生成物の整合修正であり、Splatoon 3 Ver.11.3.0との音響上の一致を新たに認定するものではない。録音の収録版や原典不足の既存制約は継続する。PR・CI・main統合結果は親作業で追記する。
