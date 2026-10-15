# キンメダイ美術館 — 固定ソース上のローカル検証

対象は `Vss_Pivot03`。11.3.0 の `VersusSceneInfo` と `SceneInfo` ではステージ名・内部名の対応のみ確認した。KiTrix の独自英名マップは取り違えを含むため識別根拠に使わない。公開 OBJ の固定表示配置でローカル対戦を実行する。回転機構の動的状態・配置、本家のスポーン・ルール配置、ネイティブ衝突・塗り・シェーダー、実機の速度・FPS は未確認で、`version1130Verified: false` を維持する。

## 固定入力と配置の根拠

- KiTrix commit: `0611f51b35c9736ee986fb2218461e2585b7875e`、stage tree: `777211951cc54e036f9770990476f968bf5a1a33`。
- OBJ: 41,209,929 bytes、SHA-256 `ffe207e9b3d3eb4fc482ca45887fea1f1a131fdb2e2a0403535e1f281453bad1`。隔離した Git LFS smudge は `Resource not accessible by integration` で失敗し、同じ固定コミットの公開 media URL から取得して期待 OID とサイズを確認した。
- 全 234 件の MTL/PNG（parts 内の同一 MTL を含む）は固定 Git blob の SHA-1 とサイズを確認。実際に派生表示で使用する 212 テクスチャのバイト列も元 PNG と一致。
- 独立した元 OBJ のテキスト走査と派生バッファを照合し、361,197 頂点の float32 位置・法線・UV と 241,259 三角形の uint32 面インデックスが完全一致。最大位置差 0。変換器の結果を同じ変換器で比較するだけの検証ではない。
- フィールド範囲は実ソースの GroundFuchi と Pnt 床を含む X ±66、Z ±55。対向するローカルパッド `[-42,16.5,-51]` / `[42,16.5,51]` は GroundFuchi の実三角形 64755 / 67143 に支持され、プレイヤーのカプセルに余裕がある。本家のスポーン座標とは主張しない。
- 追加の名前推定は `^FldObj_Pivot03_PackPnt_Obj_GeneralBoxNoPaint_30x15x15_Blitz_1__FenceVinyl$` の塗り除外だけ。名前に明示された NoPaint、範囲 X ±19.5 / Y 13–14.5 / Z ±42.5 が根拠。表示・衝突を保持し、元頂点・面インデックスを変更しない。Pnt/他ルールの選別は共通変換器の名前推定であり本家フラグとは区別する。

## 挙動、再現と実装差分

| 条件・再現 | 根拠と実装 | 確認状態・影響 |
| --- | --- | --- |
| 両パッドからローカルの Zones / Rainmaker / Clams 目標へ進む | `native-nav.mjs` / `native-ranked.mjs`、実ソース支持・カプセル・有向経路 | 両側とも同じ 4,831 ノードに到達。各側の 14 目標への経路を確認。ローカル較正であり 11.3.0 ルール配置は未確認。 |
| 初回 Squid Spawn、ニュートラル照準・射撃、shooter・標準ギア、30/60/120 Hz | 実 `Actor` / `respawn-lifecycle.mjs` / `NativePhysics`。対向両チームの人間操作と全 4 ボット枠 | 元の屋根を保持して自然に着地。CPU 30 条件で着地後も全 14 目標への経路がある。ブラウザー 30 条件では通常移動で目標方向へ最低 3.6811 units / 1 s 進んだ。実機フレーム・飛行軌道の一致は未確認。 |
| 上向きの初回発射の着地 | Y≈35 の実屋根へ向かうと飛行末尾の上向き速度から通常の重力・衝突へ引き継ぐ | 実実装は約 1.55 s で正常に着地。共通 CPU テストの no-op `_integrate` と 75/83 フレーム固定仮定が失敗原因。検証器のみ実積分・状態待ちへ修正し、製品の速度・屋根・パッドは変更しない。 |
| 実ブキから壁へ射撃・塗り、壁泳ぎと敵インク解除、塗りマスク穴、30/60/120 Hz の接地 | `native-projectile-sweep.mjs` / `native-physics.mjs` / `native-paint.mjs` と実 Actor / WeaponRunner / Projectiles | 実 shooter / WeaponShooterNormal の通常発射で 30/60/120 Hz の 3 条件とも実壁への衝突・4 件の自然な壁塗り・所有権を確認。ネイティブ塗り・衝突マスクや本家ギア条件の一致は未確認。 |
| Tower の全デッキ・支柱・ライダー掃引と通常操作での乗車 | 受理済み共通 Tower 修正のステージ固有結果を使用 | 18 点・各区間 3 内点・138 件の実カプセル支持、全幅掃引、両陣営方向 ±10.4211 の経路を確認。半幅 1.2、ローカル lift 1.2、W/Space の通常操作で 30/60/120 Hz 全条件の乗車を確認。 |

## 検証と公開範囲

`museum-verification.json` に最終 foundation、ビルド指紋、全 CPU / Chromium / 実 WebSocket / 描画ピクセル / ライフサイクル検証の数値を記録する。 最終ソース有効 CPU 行列は 65 tests / 61 pass / 4 skip / 0 fail。単一並列度と共通 heavy-asset lock で実行した。実 WebSocket は production `RoomDurableObject`、塗り一致は実キューが収束した後の CPU 全グリッドで確認する。公開版では実メニュー、固定クロスオリジン取得、キャッシュ再利用、改変 OBJ 拒否と元ワールド保持を確認する。

スクリーンショット（ゲーム・俯瞰・元表示のみ）は私的に目視確認した。モデル・PNG・MTL・派生バッファ・画像はすべて ignored のローカル証拠に保持し、PR に含めない。公開ビルドには第三者モデルを同梱せず、私的準備ビルドは配布しない。描画・CPU 時間は Chromium SwiftShader の診断値で、他の CPU 検証が同時実行される条件を含む。物理モバイル GPU / Switch の FPS として扱わない。

最終ブラウザーは 8 actors / 7 bots と Turf / Zones / Tower / Rainmaker / Clams の全 5 ルールを確認した。実 WebSocket の 5 モードで 1,514 packets を通し、Luna の半径 3.84 の塗りキューが 210 フレーム後に収束した時点で両 peer の CPU 全グリッド SHA-256 が一致。公開取得の再利用では追加 OBJ ダウンロード 0、改変 OBJ と派生 vertices.bin の両方を拒否して旧ワールドを保持した。品質変更・キャンセル・native→legacy→native→legacy の後も権威とリソース数を確認し、844×390 の touch 表示・8 actors・接地も確認した。

描画は actual original single ink mesh と同一状態を比較し、gameplay / center / overhead の A/A・B/B・A/B がすべて差分 0。12 移動カメラでは 12 回の index 更新を含めて計測した。gameplay の ink triangles は 77,947→65,919 に減るが、その測定の drain p50 は 5.1→7.8 ms で時間改善を示さない。CPU frame p50/p95 は 10.3/35.5 ms、touch は 10.1/31.2 ms。この条件でハードウェア FPS の改善は主張しない。

残る制約は動的回転状態・本家配置・マスク・シェーダー・単位と実機の挙動。自由照準で実屋根へ発射でき、その視点では元の foliage がカメラを遮る場合もある。元ソースを消したり透明化したりせず記録した。ボットはその自由照準とは別に、実高さを保持して共通の塗り/ルール領域へ進めるソース着地点を選ぶ受理済み共有方針を使用する。
