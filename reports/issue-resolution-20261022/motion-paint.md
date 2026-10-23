# Motion / audio / paint issue review — 2026-10-22

対象は `rhgrive3/actions` の #1708 / #1565 / #952 / #997 / #1165 / #1116 / #1097。基準checkoutは `26a4db4123d23162a3dbf8a12150b1b5bc6ccf64`。並列作業中の共有working treeで検証したため、pristine main全体の受入とは扱わない。runtime変更・issue close・remote書込みは0件。

全7件の本文・全コメントと現行実装を照合した。既存修正を再実装せず、未取得のSplatoon 3 Ver.11.3.0曲線・録音・実機性能を推測で埋めなかった。機械可読の詳細は [motion-paint.json](motion-paint.json)。

| Issue | 現在あるもの | 残る受入・入力 |
| --- | --- | --- |
| #1708 | 追加11ブキに2022年同族ブキの音声を借りる明示的proxy。target本人の11.3.0固有録音ではない | 正当に取得した更新済みBARS等、event対応、version/hash、聴覚比較。転載許諾なしの音声binaryは追加しない |
| #1565 | source motion / IK / LOD / paint / FX、狭いgrate裏面照明修正と過去のChromium/WebKit証拠 | G0の固定build・全体A/B、#1434、物理iPad等の性能非劣化。条件付きPose Searchを先に有効化しない |
| #952 | `.05` を使う60Hz指数減速モデル。`.9` は未マップと明記 | 11.3.0の2値の式・単位・開始frame、実Actorに比較できる実機速度trace。値自体は既知 |
| #997 | 同一gait clock、弱斜めのcadence分離、Wii U source reference/retarget、trace | S3普通歩行clip/stateとplayback law、弱入力matrixの実機比較。Wii U資料をS3曲線と扱わない |
| #1165 | CPU/GPU共通の帯SDF、zero inset、回転cornerを覆うCPU候補探索範囲 | 成長中の描画rate sweep、bot/移動判定、僅差matchのJuddまでの受入。今回のbrowser sliceは下記 |
| #1116 | local family・ordinary/firing候補選択。load済みWii U retargetが全ブキの空中hips/legsを所有 | S3で本当に選ばれるJump/JumpShootと曲線・timing。大半は既存Nrml、SplatlingのみGlngという現実装を記録 |
| #1097 | native-upperのclass shaping、gameplay muzzle分離。source-upperはgeneric Damage one-shotで不可視class層をskip | S3 family hit曲線/chooser/timing、source-owned family、描画/network/deathまでの受入。長いWaitDamage/WalkDamage loopをhit代替にしない |

## 今回の #1165 WebGL 検証

[再実行用スクリプト](motion-paint-roller-gpu.mjs) は実際の `adaptBuildSource` 出力をlocalhostで配信し、実 `PaintSystem` をChromium 154 / SwiftShaderで動かす。全体ゲームbuildを作らず、元のterrain/ROMFS/録音の追加取得も行わない。配信した全moduleのSHA256を [JSON証拠](motion-paint-roller-gpu.json) に保存した。

- 半径0.3/0.62/1.0 × seed5種（π/60含む）× 方向4 × team2 = 120条件。
- 合成8×8平面を敵色で満たし、即時Roller stampで重ね塗り。GPU atlasの20,280セル位置を実readback。
- shader derivativeとtexel alignmentから算出したAA幅に入る694位置をhard ownership比較から分離。残り19,586位置でGPU/CPU不一致0。
- `sampleWorld` とgrid ownership、120条件のcoverageと生grid countの一致を確認。GL errorとpageerrorはいずれも0。

これは実WebGLの限定条件の証拠である。最終match/Judd・bot・通常移動・成長中の30/60/120/144Hz描画・物理端末・Switch比較は実行していない。full issueをcloseする根拠にはしない。再実行:

```sh
PLAYWRIGHT_MODULE=/opt/codex/cua_node/lib/node_modules/playwright/index.mjs CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node reports/issue-resolution-20261022/motion-paint-roller-gpu.mjs
```

## 既存最小回帰の再確認

Node 24.19.0、VM moduleが必要なtestは `--experimental-vm-modules --experimental-global-webcrypto`、heap上限256/384MiBで実行。

| 対象 | 結果 | 範囲 |
| --- | --- | --- |
| `audio-borrowed-recorded-mains.test.mjs` | 3/3 pass | proxy11種・variant・欠損時。正しい固有録音の証明ではない |
| `splatling-charge-decel-1188.test.mjs` | 4/4 pass | 現行モデル、30/60/120Hz、無関係経路。実機の式ではない |
| `legacy-walk-reference.test.mjs` 選択2件 | 2/2 pass | 世代provenanceとweak-diagonal trace |
| `jump-motion.test.mjs` 選択2件 | 2/2 pass | family/JumpShoot候補名。描画曲線の一致ではない |
| `issue-1097-hit-reaction.test.mjs` 選択3件 | 3/3 pass | class/state候補、damage gameplay同値、catalog ID独立 |
| `issue-1097-source-hit-owner.test.mjs` native-upper選択1件 | 1/1 pass | source-loaded Roller/Dualies/Slosherでclass層の実pose差が存在 |
| `issue-1165-roller-band-grid.test.mjs` | 3/3 pass | 238,140セル組合せ、π/60 witness、式接続 |

計18件pass。最初のsource-loaded hit全suite試行は、60秒timeoutで終了した。途中のsource-upper差0の出力はあるが、全suite passとして数えない。後続の#952はその試行ではserial待ちで未実行だったため、別processで4/4を確認した。

今回の新しい変更は検証scriptと証拠/reportだけであり、既存の未取得曲線や実機計測を解消済みとはしない。
