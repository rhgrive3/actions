# Source contact filter: settled Hermite arithmetic

対象: 公開 INKWAVE、base `d5265f73d9dad69f1afd9690e374caee45195f11`。`inkwave-public/` は変更しない。

`ContactTransition.advance` の正規化時間が 1 のとき、既存の quintic Hermite 係数 4 個はすべて正のゼロになる。この場合だけ累乗と係数式を省く。元の時間更新、clamp、未完了区間の演算順、最後のベクトル加算はそのまま保つ。ゼロを掛ける加算も残すため、符号付きゼロや非有限 offset の扱いを変えない。duration/offset の参照は、この filter が所有する既存フィールドをローカル変数へ束縛する。

新しいキャッシュ、位相時計、アニメーション検索、補間データ、間引き、地面問い合わせ、IK、骨格・モデル変更はない。これは処理量の削減であり、モーションの見た目や Nintendo との一致を改善したという主張ではない。PR #1498 の FK 削減とは別の、既存 contact filter 内の処理を対象とする。

変更は既存の build-only `motion-fk-hotpath-adapter.mjs` に統合する。新しい製品モジュール、identity field、manifest entry は追加しない。

## 実際の所有関係

`Character.update` は root/state 更新の後で optional source controller を進める。source が有効な通常の非 Roller キャラクターでは native `_updateFeet` を呼ばず、`SourceMotionController.applyBody` → `HumanRetarget.apply` → `ground` が脚・接地を担当する。`SourcePose` は元 BFRES の全 helper を含む local TRS と FK world 変換であり、描画先 Character の骨行列とは別物である。

`ground` は既存の source contact envelope、実 host の可到達性、固定 anchor、`ContactTransition`、骨盤制約、解析脚 IK を使う。`walk.mjs` の legacy curve / native contact path は source 無効・未読込・エラー時、Roller、および source が所有権を返すアクションの fallback である。`walk.mjs` だけの検証では default source 所有者の検証にならない。

## 検証

実行コマンド:

```sh
node --experimental-vm-modules --test patches/local-quality/tests/source-contact.test.mjs
PLAYWRIGHT_MODULE=/workspace/actions/node_modules/playwright/index.mjs node scripts/check-inkwave-source-contact.mjs --before-head d5265f73d9dad69f1afd9690e374caee45195f11 --before-site BASELINE --site CANDIDATE --evidence-dir EVIDENCE --profile-dir PROFILE
```

単体比較は実 Three.js Vector3 と本体 ContactTransition を使用し、進行中/完了/再 transition、pause、負 dt、符号付きゼロ、非有限 offset と duration を含む。source-loaded 比較は本番 adapter、lossless source pack、実 Actor/Runner/Physics を用い、Player00/Player01 と 30/60/120 Hz、0/100 ms/144 Hz tick、微入力・加速・横移動射撃・反転・停止・ジャンプ/着地を対象とする。native/source の全 pose、描画骨行列、contact、muzzle を比較し、追加の地面問い合わせ/IK がないことと実 indexed/skinned shoe の同一性を検証する。

source fixture は `sourceOnly:true` であり、`INKWAVE_BUILT_SITE` が指定されても emitted 検証へ切り替わらない。全 pose の比較は JSON 正規化後の数値比較であり、符号付きゼロと非有限値の厳密比較は別の単体 350 ケースで実行する。

ブラウザ用 harness は emitted module と source bank の実読込を待ち、前後の全 pose、muzzle、indexed shoe と接写ピクセルを比較する。平面は native Physics、斜面は明示した解析平面 fixture。これらは実機・Nintendo の入力計測や whole-game FPS の代用ではない。

結果と原資料:

| 確認 | 結果 |
| --- | --- |
| 厳密な component 比較 | 350 ケース一致。既存 adapter の統合 guard も通過 |
| source-only Actor 比較 | 1,118 frame 一致。idle/move/air/land、settled contact 1,380 samples。地面問い合わせ/IK と各足 3,833 indexed/skinned vertices も一致 |
| Chromium / WebKit の emitted 比較 | 各 9 条件、789 idle + 324 実 Actor 移動/射撃/ジャンプ frame。全 pose・muzzle・contact・geometry・問い合わせ/IK 回数が一致 |
| 接写 PNG | 各 engine の 3 組すべて前後 byte-identical。6 unique images を保存 |
| committed-source binding | 各側 1,274 input files を Git blob と照合。base `d5265f73`、code `b061bbd7`。builder、verifier と helper の SHA も照合。未登録ファイルの配信は拒否 |
| パッケージ | artifact 1,860 件 + manifest 1 件のまま。manifest は双方 513,914 bytes、全出力は 125,946,377 → 125,946,350 bytes |

[照合情報と image aliases](inkwave-source-contact-2026-10-17/evidence-binding.json)、[source log](inkwave-source-contact-2026-10-17/node-test.log)、[統合 guard log](inkwave-source-contact-2026-10-17/integration-test.log)、[Chromium receipt](inkwave-source-contact-2026-10-17/chromium/receipt.json.gz)、[WebKit receipt](inkwave-source-contact-2026-10-17/webkit/receipt.json.gz) に原資料を保存する。PNG の前後は同一 SHA のため after だけ保存し、before の alias を照合情報へ記録する。

source-only 1,118 frame は adapter を既存ファイルへ統合する前に実行した。統合後の emitted filter は検証済み layout と同じ SHA-256 `16343f10cfee0ed47d6ab12853440e0f8e637b4f88914daad5389985c49447a9` であり、統合 guard と厳密な 350 ケースを再確認した。最後の両 browser は統合後の committed code に束縛されている。WebKit の GPU 名は browser の自己申告値であり、Apple 実機や物理 GPU の証拠には使わない。

## コストの測定範囲

350 ケースの単体比較では clamp は `350 → 350` 回、Hermite 累乗・係数ブロックへの進入は `350 → 273` 回だった。進行中の式は演算順を変えず、飽和した場合だけ 17 乗算・11 加減算・1 除算を省く。local binding のほかに保持状態は増やさない。

実 Three.js と本体 filter の component benchmark（Node v24.19.0、AMD EPYC 9V74、50 万 advance/window、ABBA × 2、各版 4 window）では wall 中央値 `111.199 → 106.968 ms`、process CPU 中央値 `115.0005 → 110.6485 ms`。約 3.8% の差はこの小さな component だけの診断値であり、少数 window のばらつきと JIT の影響を含む。whole-game CPU/GPU、frame pacing、FPS、実機性能の改善や非劣化の証明には使わない。

module の production minified JavaScript source bytes は `1009 → 996`、gzip は `424 → 456`。source は 13 bytes 減る一方、この module の圧縮転送は 32 bytes 増える。V8 bytecode、JIT code heap、peak/global heap の減少や非劣化を測定した値ではない。構造上、新しい object/state/cache と manifest entry は追加しないが、実 global heap は未検証である。モデル、texture、animation pack は変更しない。

## 採用しなかった見た目の変更

旧 base `85acc45d0ab23a95161b599d4287fd8142e8145b` では、完全に荷重された足でも ground の smooth-max が heel/ball proxy を地面から `0.005` host 座標単位浮かせていた。既存の滑らかな weight で envelope 幅をゼロに近づける案は、この proxy 誤差を消し、idle の上体/muzzle と地面/IK 呼び出しを維持した。

しかし実 indexed/skinned shoe（各足 3,833 vertices）を測ると、足の mesh の既存めり込みを `0.005` 悪化させた。60 Hz 平面の右足最小 y は `-0.0043734453 → -0.0093734453`、傾斜 `y=.08x+.032z` では `-0.0083308243 → -0.0133308243` だった。30/60/120 Hz × 平面/正負傾斜の 9 条件で、proxy のみの成功は mesh の安全性を保証しなかった。

その見た目の変更は不採用とし、製品 adapter には含めない。owned shoe は toe spring と toe skinning を持ち、ground の固定 heel/ball だけでは全形状の支持を表さない。推測した support 座標や任天堂の未公開数値へ置換しない。current main の新しい体格・ready stance と旧 base の数値も混同しない。

Nintendo の比較対象は既存の公式 Splatoon 3 素材と比較記録に限定する。Wii U の source curve は Splatoon 3 の実行時 cadence/contact/状態機械の証拠ではなく、版・ブキ・ギア・入力条件の未計測項目を今回解決済みにしない。
