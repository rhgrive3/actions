# アメフラシ境界：遮蔽形状の共有と再構築予算

一般採用は引き続き保留。局所のCPU・保持量は改善したが、実原典ステージの取得失敗と本家映像の未閲覧は未解消。Cargo中央では既存の切断予算を超えて境界全体を隠すため、全ステージで常に表示できるとは扱わない。

指定基準は `a4e81347906c0d60ceef76a69f476261bf8d3f86` / tree `34236683e6776aac9d8b1d4ae0b8a1b31d3f2df2`。初版1949434、遮蔽修正67cbdbaf、投擲計測8b350a5aを保護し、本変更の親は `8b350a5a91c6b090955dfecbaa41fd736c762801`。専用公開branch `inkwave/storm-boundary-codex-20261023` だけを更新する。

## 修正

`storm-boundary-cache.mjs` の専用キャッシュに、完成した遮蔽形状を保存する。同じステージ・Physics・雲高・基準半径で、中心がアンカーから0.75WU以内なら共有できる。面上の形状はワールド座標で共通、色・中心・実半径・alphaは雲ごとのmaterial/uniformに残す。既存の1WU余白で共有・移動範囲を覆う。横方向は引き続き実行コードと同じ `SPECIALS.storm.radius * cloud.group.scale.x`。成熟時10WU、成長・終了時は既存のscaled rainの範囲に従う。

衝突箱の位置・軸・半寸法、solid/paint/hidden、受け面のpaintable/ceilingを正確な数値列で検証する。ハッシュだけには依存しない。nativeの静的三角形はTriangleWorld/配列/face配列のidentity、選択面の属性を照合する。原典の静的配列は既存の不変データ契約に従い、ステージ交換で破棄する。全チャート走査は復活させない。遮蔽が変われば共有中の全雲から古いgeometryを外し、誤った輪郭を残さない。

再構築は実Gameの1描画配信フレームにつき最大1件。30Hzの同フレーム内に60Hz simulationが2回進んでも予算を共有する。異なる形状はFIFOで処理し、完成するまでその雲の境界全体を非表示にする。8個の異なる形状の初回完成には、30Hzで8配信フレーム（約267ms）、60Hzで8（約133ms）、120Hzで16（simulationが進む8回、約133ms）がかかった。内部で未完成ポリゴンを表示する処理はない。移動により再構築が集中した場合にも表示の空白はあり得る。

最大12geometry、最後の利用から120simulation ticksで失効。容量が埋まれば未使用の最古を捨て、全て使用中なら追加を非表示にする。1形状の既存上限8192頂点から、position bufferの理論上限は合計1,179,648B。これはJS全ヒープの上限ではない。Projectiles.clear時にgeometry・待機参照・placeholderを解放し、雲ごとのmaterialは通常のreleaseで解放する。

共有ファイルの所有範囲は `special-motion.mjs` 内のStorm専用 `_updateClouds` / `_releaseCloud` とcache清掃用 `clear` wrapperのみ。新規cache、既存boundary/occlusionの専用関数を編集。塗り・攻撃・Physics・通信・投擲・重力・接触・操作ロック、他スペシャル、共通シェーダー／材質、モデルは変更しない。投擲contact-only修正は親の別担当の範囲。

## 実測

Chromiumの既存許可済み起動経路、SwiftShader WebGL2。同じGL contextで保護した8b350a5aの未共有版と新候補を別々の段階で実行。30回の8雲生成→描画→破棄、1段階120回の安定更新を測った。下表は他のブラウザ計測を同時に走らせず、fallback理由を含めて保存した最終run。p95は30標本の29番目で、機種横断の保証値ではない。

| ローカル手続きレイアウト | 未共有8雲 median / p95 | 共有8雲 median / p95 / max | 安定8雲/更新 | レイ/構築 | position保持量 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 試し撃ち | 3.4 / 8.1ms | 0.6 / 3.3 / 5.4ms | 0.0158ms | 112→14 | 43,776→5,472B |
| Tidewater | 8.1 / 14.8ms | 1.3 / 4.0 / 4.2ms | 0.0117ms | 384→48 | 117,504→14,688B |
| Cargo中央 | 11.5 / 24.0ms | 1.6 / 3.6 / 8.1ms | 0.0208ms | 368→46 | 0B（clip-budget） |

Cargo中央は切断4097で既存4096予算を超過し、8雲とも全非表示。描画成功や単なる高速化として評価しない。離れた8雲では、完成まで8フレームに分けた各フレームの最大構築更新が試し撃ち0.8ms、Tidewater 2.2ms、Cargo 1.5msだった。再生成時に同じ位置の8形状を再利用すると照合レイ0本。

試し撃ちの8雲は描画8calls/1216三角形で未共有版と同じ。Tidewaterは8calls/3264三角形。共有でdraw数は増減しない。全3レイアウトの各30生成破棄と安定更新後、追跡した31個の候補geometryが各1回disposeされ、追加GPU geometry/program、残留境界meshは0。ステージを同一scope内で9回交換し、9geometryを解放、最終cache/GPU geometry/programは0。実ゲームでも移動する8雲を2秒ずつ30/60/120Hzで更新し、最大12entries、再構築最大1/配信フレーム、全uniformが雲の現在位置に一致、clear後のentries/pending/境界meshが0。全ゲームのCPU時間は専用処理の計測とは分けてJSONに記録する。

合成のnative collision grid 131,072三角形では近傍候補200・BVH訪問288、全chart getter読み取り0。8雲は1geometry、8424B、1レイ、cold中央値0.7ms / p95 1.8msだった。密集32,768三角形は513候補目で停止し、全非表示、0draw/0position B。これは合成データの成功であり、取得失敗した実原典ステージの代替ではない。

最初の同時計測runではTidewaterのp95 28.3ms / max38.1msが出た。通常ゲーム計測と並行しており、最終の単独測定と区別して `.ci-scratch/storm-evidence/cache-browser/` に保護した。後続の単独runはp95 5.0ms、最終runは4.0ms。GCやOS schedulingの上限は保証しない。総JS heap・hardware GPU・携帯機のCPUは未計測。

## 回帰と実画面

- 関連ロジック52件（boundary/cache18件を含む）、source ownership/identity16件、buildとstartup budget、artifact/source hashの読み戻しが通過。
- 屋根なし・完全遮蔽・一部遮蔽・幅0.02WUの屋根・移動遮蔽物、壁床、非塗布面、雲より上、12WU到達外、開始/終了/再利用/死亡、半径と実塗り/Actorの内外を検証。変化時の全共有ユーザー失効、FIFO、容量上限、120tick失効、待機中release/clearもテスト。
- 通常試し撃ちのQ→Sub入力で撮影した10時点はsimulation frame。元のa4実装を戻したnegative controlに対して、通常状態・30/60/120Hzのtraceと塗りhashは同一、元版は新しい境界の存在要件を満たさない。新候補は終了後消え、死亡後に展開済みの雲は既存通り存続する。
- 新候補の通常ゲーム simf90を実際に閲覧し、床上の細線、左側の壁面への連続を確認した。境界だけを隠す検査では3818画素の差。屋根fixtureは通常ゲームと区別した検査表示。
- 保護した未共有版8bとの検査画面は、同位置8雲で8fixture全て画素差0。中心を最大0.35WUずらして同じ形状を共有すると、open276、一部遮蔽10、narrow47、壁383画素が閾値8を超えて変化。他は0。三角形の分割と補間が変わるためAA差という推定であり、完全画素一致とは扱わない。候補・controlの一部遮蔽画像を直接閲覧し、大域の欠落や屋根下の誤表示は確認しなかった。形状の遮蔽そのものはPhysicsと幾何テストで別に検証する。

原典比較は親のencoded 30fps f173–183観察が対象。本担当は本家画像を閲覧していない。版・入力時刻・ギア・native FPSは不明で、本家比較完了とは称さない。境界の垂直マスクは既存の表面塗りレイ条件に従い、Actorの3D体積全体の保証ではない。

## 再現・保存・残件

生成ビルドcontentHashは `37cdb283fc69c08f34a562f9b30c6b1b29fedcfaba36242b2516e536f332f96b`、未共有controlは `adc14699526a24f35e9489d67118fb68c82718392f88fe8ae29b1a6dd7b8b298`。数値、shape別fallback、source/artifact照合、50画像のSHA256は隣接JSONに保存。映像・画像はGitへ同梱しない。

```sh
node scripts/build-inkwave.mjs inkwave-public .ci-scratch/storm-cache-site
node scripts/check-inkwave-storm-boundary-browser.mjs .ci-scratch/storm-cache-site .ci-scratch/storm-evidence/cache-normal
node scripts/check-inkwave-storm-boundary-browser.mjs .ci-scratch/storm-cache-site .ci-scratch/storm-evidence/cache-production --budget-only --cache-production
node scripts/check-inkwave-storm-boundary-cache-browser.mjs .ci-scratch/storm-cache-site .ci-scratch/storm-occlusion-delivery-site .ci-scratch/storm-evidence/cache-final
node scripts/check-inkwave-storm-boundary-bvh-budget.mjs .ci-scratch/storm-cache-site .ci-scratch/storm-evidence/cache-bvh
node scripts/check-inkwave-storm-boundary-cache-evidence.mjs .ci-scratch/storm-cache-site .ci-scratch/storm-occlusion-delivery-site .ci-scratch/storm-evidence reports/inkwave-storm-boundary-cache-2026-10-23.json
```

実原典OBJの正規GETは前回 `net::ERR_TUNNEL_CONNECTION_FAILED`、loader `Failed to fetch` で失敗。今回は再試行・別経路取得をしていない。Libraryの準備済み複数ファイルupload手順は、前回の許可された1度の再試行も `hosted apps tools/list request failed: network`。upload未開始、library_file_idなし。今回は再試行・署名URL使用・接続変更を行わず、画像をローカルに保護した。親がworkspaceを直接読めない制約は残る。画像のユーザー向け受け渡し、実原典ステージのCPU/画面と本家フレーム比較の補完が必要。
