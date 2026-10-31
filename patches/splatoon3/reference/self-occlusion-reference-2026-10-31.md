# 自キャラと照準が重なるときの透過

## 比較対象と根拠

- 対象：公開版 `inkwave-public/`、ローカルプレイヤーのヒト状態。下向き照準、および壁際でカメラが体へ近づく状況。
- 本家の比較資料：スプラトゥーン3の投稿者本人による実機キャプチャ、ホットブラスターカスタム。記事画像だけでは撮影時のゲームバージョン・ギア・カメラ角度・透過率は確定しない。
- 記事：[李夜「スプラトゥーン3 ホッカス解説」](https://note.com/eleonor/n/n7394e3178ba0)、2024年7月28日。
- [自キャラ透過を確認できる原画像（1280×720）](https://assets.st-note.com/img/1721913036201-3DWzWgfzM6.png)
- [HoianViewerの公開シェーダー・メタデータ（固定コミット）](https://github.com/nvnprogram/HoianViewer/blob/8a1eeb215a65ddc74d7cb9f07f2cf0c707f9d4d1/PlayerViewer/Shaders/Resources/UberReachSpiral.txt)

実機画像では、プレイヤーの体・ブキ越しに箱の表面を確認できる。記事では小ブロックへ最大ジャンプで飛び乗るときの最高高度の説明に使われており、足が透けていることにも言及している。カメラ側の灰色の円と着弾側の色付き円も別位置に存在する。この画像は上向きに近いカメラなので、下向き時の透過開始角度を測る資料としては扱わない。カメラ接近だけが透過の原因とも断定しない。

公開シェーダー資料には `camera_xlu_type`、`camera_xlu_dither_type`、`is_camera_xlu_use_overlook_alpha`、`is_camera_xlu_custom_use_near_alpha`、`is_overlook_xlu_only_below_camera` がある。これらはカメラ依存の透過機構が存在する根拠であり、この特定のプレイヤー描画に適用される値、しきい値、画素パターンの証明ではない。

**本家の内部の開始角度・最低透過率・時間曲線・ディザー式は未確認。今回の数値と画素パターンはINKWAVE側の視覚校正値である。**

## 実装

`runtime/self-occlusion.mjs` の `installSelfOcclusion(api)` を、既存のキャラクター・カメラ実装へ接続する。必要なAPIは `THREE`、`Character`、`CameraRig`、`PlayerController`、`G`。`install.mjs` では既存 `installShotGuide(api, profile)` の直後に置く。この順序で復活コートなどの既存shader hookを保持し、`computeAim` の終了時に更新された最新着弾ガイドを同じフレームで読む。

1. 頭と胸の画面投影範囲を、見えている照準へ照合する。Blasterは未遮断弾道のaim円と地形接触のimpact円を両方使い、印のない固定画面中央は判定へ加えない。射程外でimpact円が非表示のときはaim円だけを使う。従来の他武器では固定中央の判定を下向き時に使う。実照準の重なりはジャンプ中などの上向き時も含め、見えている大きさに応じて重なり始める前から透過する。
2. カメラが壁に押されて体へ寄った場合には、上下の向きに依存しない近接透過も適用する。
3. Shooter/Splatlingは `controller.shotGuide` を既存 `projectShotGuide` と同じ裏側反転・画面端40 CSS pxの制限で投影する。BlasterはHUDと同じ `G.projectiles.s3BlasterReticleGuides(actor, actor.weapon, gameCam, width, height)` の `aim` と `impact` を使う。pairがない場合およびSlosherは従来の `s3WeaponGuide` を読み、こちらのHUDの規則である通常投影・裏側なら中央復帰を使う。カタログ・カスタム武器も実際の `actor.weapon` を渡す。`computeAim(false)` の終了時にだけ武器guideを問い合わせ、カメラ更新時の同じ開始透過率・同じ経過時間から再計算する。後続のHUDは既存cacheの同一点を再利用し、照準用の弾道エンジンは追加しない。`computeAim(true)` のシミュレーションtickでは武器guideを問い合わせず、透過の時計も進めない。
4. 自分のメッシュだけに専用マテリアルを用意し、全パーツが同じ画素を抜くスクリーンドア方式で背景を見せる。敵・味方へ共有している元マテリアルのopacityや色は変えない。
5. 既存の色、被弾、復活コート、LOD、イカの透明表現、武器ランプ等のuniformを保持する。ShaderMaterialで新規uniformを加える場合も、元の共有uniform mapの形を変えない。
6. LODによるマテリアル変更、後から加わるメッシュ、配列マテリアル、パーツの取り外しに追従する。dispose時にはプロパティ・イベント購読を復元し、専用マテリアルだけを解放する。
7. 通常の影のdepth/distance描画は保持する。GTAOの法線パスだけは透過が進んだ自分を一時的に除外し、半透明の体に不透明なAOの輪郭が残るのを避ける。ほぼ不透明な境界でAOだけ消えないよう、不透明度0.90未満で除外を開始し、0.96以上で復元する。この区間では影の再描画を止め、例外があっても元の可視状態と影フラグへ戻す。
8. 死亡、非表示、イカ、マップ、観戦、所有者変更、アトラクト、disposeでは透過状態を解除する。反射・ポートレート等の別カメラは通常のキャラクター表示を保つ。

当たり判定、HP、射撃方向、弾道、塗り、スコア、ネットワーク情報へ書き込まない。通常フレームでシーン全体の探索・DOM計測・マテリアル複製・shader再生成を行わない。

投影球の頭半径0.27、胸半径0.28はINKWAVEのモデル寸法を基にした校正値。素の頭の半径約0.178と既存の頭身補正、髪の厚みを考慮し、実描画で頭の輪郭から離れた照準に不要な透過が始まるのを抑えた。重なり0.001以下は数値境界として透過を始めない。GTAOの除外は画素単位の透過と同一ではなく、上記の開始・復元範囲を持つ視覚上の近似である。

## 単独検証

`tests/self-occlusion.test.mjs` による22件の検証を実行。実機画像比較とは区別する。

- 下向き重なり時の透過、前向きへ戻したときの復元。
- 画面中央は空いていて、実着弾照準だけが体へ重なるケース。
- 最新ガイドの同フレーム反映、render queryの重複や固定tickで時計が二重に進まないこと。
- 上向きの近接カメラ。
- 上向きカメラで着弾照準だけが体と重なる状況。
- controller側guideがnullのBlaster/Slosher、カタログ・カスタムprofileの実guide経路、HUDとのcache入力一致、二重の重い予測を増やさないこと。
- Blasterのaimだけ・impactだけが体に重なるそれぞれの場合、印のない固定中央が体を覆っても誤って透過しない場合、pair不在fallback、nearとの共存、共有pairを変えないこと。
- Blaster/Slosherでは画面外guideをShooterの端へクランプせず、裏側の点はHUDと同じ中央へ戻すこと。
- 30/60/120 Hzで同じ経過時間の透過率が一致すること。
- アスペクト比・DPR・動的解像度による不要な変動がないこと。
- 共有マテリアル、動的色・opacity・version、両面描画の一時side変更の分離。
- 既存shader hookとuniform、Flowの空fragment、RawShaderMaterialのversion/precision順序。
- ShaderMaterialの共有uniform mapを汚染しないこと。
- 後付けメッシュ、LODのmaterial割当、material配列の変更、取り外し、dispose。
- 死亡、イカ、マップ、観戦、違う所有者、アトラクトの復元。
- GTAOの法線パス限定の除外、および例外時の可視・影フラグ復元。
- ほぼ不透明な端でのAO保持、除外・復元の別しきい値、ライフサイクルでの除外状態解除。
- 二重インストール防止とGPU資源・共有元リスナーの後片付け。

## 独立したブラウザ検証

既存の合成済みアプリへ候補runtimeを注入して、ネイティブのCharacter・CameraRig・PlayerController・GTAOPassを使う描画検証を別担当が実施した。これは最新mainから新しく合成したビルドの検証ではない。ドナーの `contentHash` は `c9bf67fbd892348c581641b77b4bd4c31dcfa86cd1e4ad71e3bbe82beb5501e0`。

条件は1280×720、Chromium/SwiftShader、Practice RangeのB Target Gallery、`setWeapon('blaster')`、位置(-14.6, 0.04, 0)、yaw 0、無敵なし、移動ターゲット無効・bot停止。ブキの内部ID、ギア、髪型は記録していないため、本家の同一条件との数値比較には使わない。

- ローカルの18マテリアル・174ノードへ適用し、11体の非ローカルキャラには透過状態を作成しなかった。
- 通常の下向き操作で透過し、前向きへ戻すと不透明へ復元。髪・体・服・ブキで同じ画素の抜け方を目視確認した。
- マップ・イカ・死亡・非表示で、その更新内に透過率1へ復元した。
- 実GTAOを既存 `applySettings` のhigh設定で生成して検証。法線パスの1回だけモデルが非表示となり、終了後は表示を復元した。PNGで背景が透け、固いAOシルエットが残らないことを確認した。その他の条件はshadows=false、bloom=false。
- JavaScriptのpage/console errorとシェーダーのcompile/link errorは0件。

半径とAOしきい値を調整したruntime（武器別guide接続の追加前）でも独立担当が再確認した。通常前向きと、頭から照準が離れたpitch -1.35の双方が不透明度1・重なり0・AO除外なしとなった。実モデルの頭位置へcontrolled guideを置くと不透明度約0.10・重なり1になり、実GTAOの法線パス1回だけ非表示となる。guideを解除すると不透明度1・法線パスでの表示へ復元し、page/console/shaderエラーは0件だった。このguideは投影と描画を検証するためのfixtureであり、実弾の着弾位置の測定ではない。Blaster/Slosherの実guide接続とカタログ武器guideの追加は最終合成ビルドでも確認する。

## 継続的な検証の入口

既存 `scripts/lib/inkwave-test-shards.mjs` の `discoverSourceTestFiles()` が `patches/splatoon3/tests/**/*.test.mjs` を再帰検出し、`scripts/check-inkwave-patches.mjs` がCPU shardへ振り分ける。このため専用testファイルの追加だけで既存CIの対象となり、workflowや別suiteへの重複登録は不要。`--quick` は互換性・数値契約のみを確認するので、単独検証には `node --test patches/splatoon3/tests/self-occlusion.test.mjs` を使う。

最新mainに対する最終合成ビルド、ブラウザ検証、main反映の結果は統合担当の記録で確認する。この単独検証だけで「本家とピクセル単位の完全一致」や「main反映済み」と判定しない。
