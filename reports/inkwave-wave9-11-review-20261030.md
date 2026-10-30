# INKWAVE Wave 9–11 GPUレビュー（2026-10-30）

Driveの[累積パッチ](https://docs.google.com/document/d/1g8RWUlg7bj_MxSz-RZ7H-IkcSvovzdCm13MPgFLF16A/edit)と[技術レポート](https://docs.google.com/document/d/1eYNauevgpBlj62XZjjmhKb3RofKISzSMQw7sEFmKjCU/edit)を確認し、現在のmainとPRのWave 6/7・テクスチャ所有権修正を維持して統合した。入力patchの正規化後SHA256は `bcd3679e7d7dd1cab901947aa980f6384bf20bf35a936bfc0af406141a3dba0d`。元案の「完全一致」「116箇所」を、そのまま品質や実際のGPU命令数・FPSの証明にはしていない。ユーザーの指定に従い、目視で分かりにくい微差を許容する。

実装commitは `b5b2a782e604614c382e6d93b954dba462a3731d`、tree `95b1a5e3d4b094c39837399b980422a8a9572acd`。最新main（45f5d98b）のカメラ・sweep・モデル更新を保持し、build-only一覧の新しいカメラadapterも残した。変更コードは、ローカルでテスト・通常ビルドした `f0951e3ed5e77d15549ed4798bcbdde1eb7f17e3` を起点とする。新mainに合わせたbuild-only一覧の合成に加え、後述の弱法線近似を除外し、透明裏面の向き・ロビーの勾配・cone作成時の一時allocationも補修した。関連するcache key・テストを更新した。統合前に成功した119件と、これら最終変更のCI結果は区別する。ゲームロジック、衝突、塗り判定、8人対戦、解像度、テクスチャ上限・全ミップ、影、描画scaleは維持する。

修正した主な問題は次の通り。

- 先行するWaveの後ではインクの粗さ・反射用の置換2箇所が不一致となり、同梱テストが失敗した。現在の0.034/0.026、顔料specular抑制0.97、F90 0.02/0.45と雲の細い反射帯を保った。
- 正式なビルド経路ではさらに10箇所が不一致だった。実際の合成後の形に限定した置換を追加し、鼻・虹彩の色、パンツの前後面、泳ぎの波の半径・幅を保った。波紋は既存のrevision管理された密なactive tableを利用し、冗長なuRipCountを追加しない。
- mainの監査済みWave 6/7との重複を整理した。塗りhashが依存する多項式を変更せず、必要な水面・都市ガラス・泳ぎ・粒子の寄与範囲の分岐だけを合成した。厳格な置換チェックを残し、合成後の再適用と式の破損の拒否をテストした。
- 泳ぎの距離減衰、虹彩LOD、ガラス目盛り、インク反射帯の微分を画素マスク分岐の前で求める。未知の泳ぎshaderでは、移動できていない局所変数を削除しない。
- ロビー床の中央と近傍4回のマスク参照は、分岐の外でclamp後／近傍用のUV勾配を求め、分岐内でtextureGradを使う。分岐内の暗黙LODを避ける。生ソース7置換・再適用・勾配所有権を実際のadapterで確認した。
- cone作成のindex検証では、三角形ごとの一時配列とcallbackを避ける。400メッシュで変更前後のcone byteが一致することを実際の関数で確認した。
- 法線の強度が負の場合や、基底法線が単位長でない場合も向きと正規化を保つ。加算VFXで照明を飛ばす2箇所は戻した。
- 不正確なキャラクターの固定fillベクトルを元の定数normalizeへ戻した。粒子の一部の頂点だけを画面外へ移す処理は三角形を変形させるため除外し、元のfragment単位の除外を保った。
- 先行候補の弱い法線マップ向け拡散光補間は除外した。normalScaleだけではsampled normalのZ成分を証明できず、ソフトウェアWebKitでも悪化した候補に含まれていた。すべての法線マップ付きネイティブ材質で、環境光・直接光・反射を画素ごとに保つ。
- 法線マップを持たないネイティブ材質の広い環境光では、視線と頂点法線のconeから使われない半球が証明できる場合だけ、反対側の環境光計算を省く。coneは全incident三角形から保守的に求め、byteを上向き丸めして余裕を加える。輪郭・反転法線・極細三角形・未知の幾何・特殊カメラでは従来の両面計算へ戻す。追加GPU属性は頂点あたり1byteで、CPU側の属性配列は転送後に解放する。形状、UV、index順序は変えない。透明なDoubleSide材質をBackSide/FrontSideの2回で描く際は、ThreeのFLIP_SIDEDによる法線・front-faceの反転も判定へ反映する。
- idleなKTX2/Basis Workerの解放は既存PRの修正を保持する。同じrendererで次回loadした際の全ミップの寸法・画素・破棄回数を検証する同時更新のテストも維持した。監査済みWave 6/7のbuild用transformerはブラウザへ配信しない。

統合前ベースの関連ソース検証は129件中119成功・失敗0・10件skip。最新mainとの結合後の確認はCIで再実行する。skipは既存の私的アセット依存、または配信siteを指定して別実行する検証で、成功には数えていない。統合前の通常の最適化ビルドも完了した。最終の弱法線除外後はCIのビルドを待つ。実装そのものを抽出した追加の形状property検証では1,500メッシュ・46,272三角形corner・8,059件の表裏省略の判定に対して誤判定0。これはGPU rasterや性能の証拠ではない。coneのテストは共有頂点、表裏、輪郭、非一様・負スケール、反転法線、極細・未使用頂点、転送後の解放とfallbackを含む。

先行候補 `c0ca4b9` では、Robo/WebKitとMako/Chromiumの7視点の最大RGB平均差がそれぞれ0.093390/255、0.091693/255、p99は1/255、alphaと最終の8人・塗り状態が一致した。20材質・VFXを含む32プログラムのリンクも両ブラウザで成功した。ただしこれは最新cone版の最終画像確認ではない。

同じ先行候補のiPad/highソフトウェア計測は、0cc5ce37比でChromiumが **+12.36%**、WebKitが **-4.82%**。WebKitの悪化を受けてcone版へ変更し、さらに弱法線近似を除外した。最新WebKit基準CF4の3区間は0.354145 / 0.357731 / 0.312930fps。cone版は最初の区間0.353382fpsを確認したが、実行環境が利用不可になり、最終結果を回収できていない。この1区間を速度合格として扱わない。

最終の速度・画像・配信engine検証は[専用GitHub Actions](../.github/workflows/inkwave-wave-native-gpu-validation.yml)へ移した。候補と比較専用の共通main基準（desktop/medium/Chromium）、最新main 45f5d98b（iPad/high/WebKit）をそれぞれ通常ビルドし、全生成物・ソース入力をSHAへ照合する。新mainの開始カメラは旧版より長いため、旧ゲーム全体との直接比較は行わない。desktopの比較基準 6ae5b34493e0744a7334025ba09b810f034194e8 は45f5d98bを親とし、native-render・native-ink-chunks・composer-format-adapterの3ファイルだけを0cc5ce37の正確なblobへ戻した比較専用branchである。カメラ、対戦、塗り、他のmain更新は候補と共通に保つ。WebKitは既にP1を含む最新mainに対する追加効果を測る。新しい578フレームの導入演出に合わせ、準備を925フレーム（演出後の347フレームは旧条件と同じ）、試射を演出後77フレームへ調整した。同一条件の本番フレームを3区間、GPU完了待ち込みで順に測る。Chromiumは30%以上、WebKitは悪化しないことを要求する。RoboとMakoの7視点、全員の位置・速度・HP・インク・生存状態、塗りgrid/counts/coverage、cold shaderとGLエラーも確認する。画像閾値はRGB平均差1.25・p99差3以下、alpha完全一致。計測中にテスト・ビルド・別ブラウザを並行実行しない。LFSは必要な2 stageと4 packのpointerだけを直接展開し、全payloadのSHA256とsizeを照合する。JSONだけをartifactとして残し、モデル・画像・ブラウザprofileは公開しない。

**最新候補で30%以上の高速化とWebKitの非悪化は、現時点では未確認。** [以前のdesktop +45.409%](inkwave-native-render-performance-20261030.md)を最新Wave版の結果へ読み替えない。今回の環境には実GPUがなく、Linux WebKitの「Apple GPU」という文字列もiPad実機の証拠ではない。実機Safari/Metalでの60fpsは未確認。

[数値・検証状態](inkwave-wave9-11-review-20261030/results.json)。再現用の[全フレーム計測](../scripts/benchmark-inkwave-native-render.mjs)、[画像・状態・速度比較](../scripts/compare-inkwave-native-render.py)、[材質リンク確認](../scripts/check-inkwave-wave-gpu-materials.mjs)を含む。[スプラトゥーン3との既存挙動差分](inkwave-splatoon3-behavior-2026-10-02.md)を今回の描画検証で解消済みとは扱わない。
