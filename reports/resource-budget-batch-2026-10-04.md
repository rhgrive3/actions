# 公開 INKWAVE 資源上限バッチ（2026-10-04）

## 対象と根拠

- base main: `0859bf4fab08edc74c25fcb790e662a748a91ec9`。
- #266 / #274 / #283 / #314 の4件。`inkwave-public/` は変更せず、既存の gameplay → touch → reliability → local-quality 合成経路の最後へ接続。
- PR #184 head `2a103fcfa60680b46304e56767bb65b8d92d96a1` の11ファイルを確認。メニュー停止・選択枠・性能証跡の修正であり、今回の4つの資源所有者は変更していない。adapter/workflow の同一ファイルに独立追加はあるため、後日のマージ時に競合確認が必要。
- スプラトゥーン3のメモリ配分、Canvasキャッシュ、反射解像度は公開根拠がない。本変更の資源上限は INKWAVE 独自の明示的な性能ポリシーであり、本家数値への一致とは呼ばない。移動・射撃・ダメージ・試合時間の数値は変更しない。

実装根拠:
- [公開 Match](https://github.com/rhgrive3/actions/blob/0859bf4fab08edc74c25fcb790e662a748a91ec9/inkwave-public/src/game/match.js#L157-L159)
- [公開 ShadowCache](https://github.com/rhgrive3/actions/blob/0859bf4fab08edc74c25fcb790e662a748a91ec9/inkwave-public/src/core/shadowcache.js#L88-L111)
- [公開 Environment](https://github.com/rhgrive3/actions/blob/0859bf4fab08edc74c25fcb790e662a748a91ec9/inkwave-public/src/world/environment.js#L1640-L1714)
- [公開 Showcase](https://github.com/rhgrive3/actions/blob/0859bf4fab08edc74c25fcb790e662a748a91ec9/inkwave-public/src/game/showcase.js#L2849-L2878)
- 同梱 Three.js `WebGLShadowMap` / `WebGLTextures`: 通常 directional shadow は UnsignedInt depth texture、DEPTH_COMPONENT24。Float/UnsignedShort の深度形式もコピー先と一致させる。RenderTarget の count は1以上を要求するため count:0 を利用しない。
- [WebGL 2.0 仕様・2026-06-30 Editor's Draft](https://registry.khronos.org/webgl/specs/latest/2.0/): framebuffer、readBuffer/drawBuffers、深度 blit。色アタッチメントを持たない私有FBOを使用し、実 framebuffer completeness と描画比較を別途必須にした。

## 変更と受入

### #266: attract履歴

- attract の `_onSplatted()` だけ履歴保存を省略。イベント発火・購読、死亡処理、演出、スコアは変えない。
- 通常対戦は元の時刻・victim/attacker参照を保持。Match.dispose()で履歴参照を解放。
- 実公開メソッドに10,000 splat: 基準版10,000件 → 修正版0件。通常90秒fixtureの残85秒では t=5 と同一参照を保持。
- OS/ブラウザの実ヒープ測定は未実施。削除した保持経路の件数を確認したもので総ヒープが一定という主張ではない。

### #274: depth-only shadow cache

- キャッシュ専用 WebGL2 FBO + depth renderbuffer。色 texture を一切生成しない。read/draw buffer はNONE。Threeの通常shadow targetには触れず、既存depth blit/静的・動的判定を維持。
- サイズ/深度型に応じた再作成、FBO不完全・context loss時の失敗閉鎖、context restoreで再生成されたThree.shadowMapへの再接続、明示disposeでGPU資源とフックを解放。
- 2048²では色16MiB、4096²では色64MiB分の要求を除去する計算。ドライバの実VRAM常駐量とは区別。
- CPUテストだけでは解決判定しない。新しい必須CI `check-inkwave-resource-render.mjs` は実WebGL2で 2048/4096 FBO完全性、色attachment NONE、texture生成0を測定。
- 9場面のキャッシュ有効出力を同じシーンの全shadow再描画とRGBA完全比較。影を消す負例は20pixel超の差が必要。静的移動のdynamic降格、stage roots、光源、解像度、画面外actor、context loss/restore、disposeも検査。
- Chromium software GPU の実描画成功待ち。iOS/Android実機ドライバ互換性は未確認。承認されたローカル環境ではChromium起動がUnix socket制限で拒否されるため、同制限を迂回せずGitHub CIを使う。

### #283: effective反射ポリシー

- desktop LOW/MEDIUM/HIGH/ULTRA: scale 0/.28/.4/.5、間隔1frame、ULTRAのみactorsを含む。既存設定維持。
- touch: scale最大.2、間隔2frame、actors除外。既存effectiveQualityが唯一の決定元。
- スキップ時はtextureと反射matrixを対で保持。リサイズ・品質変更・再有効化・frame clockリセットは強制更新。水面下/LOW/非marinaは反射無効。mipmap・clipplane・far cubeは変更しない。
- 2frame間隔は自前性能ポリシー。動く反射の時間解像度が下がるため、端末実機で見た目と熱・消費電力を評価する必要がある。
- GPU CIは実Environmentメソッド+HDR RTによる6frameの反射回数をdesktop6/touch3/LOW0と比較し、描画coverage、解像度、非marina復帰、renderer状態復元を確認する。診断シーンであり全Halyard実機プロファイルではない。

### #314: portrait pixel budget

- mobile cache上限524,288pixel（通常RGBA換算最大2MiB）、desktopは従来96×224²pixelかつ96件。大きな任意サイズもpixel上限で制限。
- FIFO eviction時とhide/他Showcase画面移動時のmobile cacheを解放。disposeは両端末で解放。非lockerや古いepochの非同期readbackが再保持しない。
- canvasはUIに既存方式でコピーする。DOM所有のコピーを破壊せず、キャッシュ所有のsourceだけ0×0へ解放。サイズを変えたり同期GPU readbackを足さない。
- completionの全コールバックに画像を渡した後で保持判断するため、最初のcallbackが画面移動しても後続の画像コピーが壊れない。
- native portrait request/cache hit/cancel/遅延完了/hide-reopen/コールバック中navigationを検証。1,000件の混合176/224サイズで上限を維持。
- 端末の総Canvas/GPU/DOMメモリはこのcache予算に含めない。実mobileメモリプロファイルは未実施。

## 検証

- `node --experimental-vm-modules scripts/check-inkwave-patches.mjs`: 742/742成功（最終コードで再実行）。
- local-quality: 18/18成功。
- motion/workflow/resource検証器: 12/12成功。GPU受入証跡の欠落・不一致12負例を拒否。
- pinned primary numeric source: Ver.11.3.0、11files、126 extracted、14 unknownを維持。
- 公開ビルド成功: revision prefix `93ca913d4d2b`、133 modulepreloads。build入力/artifact hashの全照合成功。
- 新GPU検証は未実行のため、本書時点で#274の実描画受入は未達。CI結果が確定するまでDraftを維持し、失敗時は修正と再検証を続ける。


## CI検証器のcontext-loss順序修正

head c6aac63c の run37191742187 は既存のgame/motion/detail/Flow/Wall描画とcatalogを通過し、新resource検証はcontext restore待機で10秒timeout。そこまでの8影比較・色attachment検査・反射回数/coverage検査に例外なしで到達したが、全GPU受入は未達。

[WEBGL_lose_context確定仕様・Revision15](https://registry.khronos.org/webgl/extensions/WEBGL_lose_context/)は、lossイベントが完了する前のrestoreContextを禁止する。元検証器はイベント内でresolveしたPromiseをawait後に直ちにrestoreし、Chromiumのevent microtask checkpointでdispatch完了前に実行できた。0ms timerの次taskへrestoreを移し、単体テストでmicrotask中に呼ばれないことを確認。無効化・条件緩和はせず、実復元イベントと復元後pixel比較を引き続き要求する。失敗時のJSON/PNGも専用artifactへ保持する。
