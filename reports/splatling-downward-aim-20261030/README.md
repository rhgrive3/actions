# スピナーの下向きチャージ照準

基準は `5d6480b2e2c1a8afa789bcc1415bae586e3156cb`。専用 worktree は `/workspace/actions-splatling-aim`、ブランチは `fix/splatling-downward-charge-aim-20261030`。公開版 `inkwave-public/` と通常ビルドの production composition を対象にする。

## 原因と修正

下向きにチャージすると、スピナーの HUD ガイドが床を通り抜けた11フレーム先の点を投影していた。`computeShotGuide()` は Shooter だけに実弾と同じ衝突 query を行い、同じ helper を使う Splatling は衝突を省略していた。照準が実際の床・壁の着弾点から離れる。今回、双方のガイドを、既存の同じ発射初期値・飛行 integrator・球体対地形の接触で止める。11F は最大予測時間のままで、画面に都合のよい別座標を作らない。

さらに、ガイドの初速と照準補正の射程が前回の `fidelitySplatlingCharge` を常に優先していた。連射終了後の次のチャージでも前回の値が残るため、現在のチャージに合わない予測になる。連射中だけ保存した放出チャージを使い、チャージ中は現在の `charge` を使う。修正対象は表示予測で、実弾の発射、ダメージ、インク、チャージ時間、カメラの操作値、PRNG は変更しない。

変更箇所は `runtime/weapons-fidelity.mjs` の予測と `weapons-adapter.mjs` の `_nominalInkGuide()`。関連 open PR は [#1939](https://github.com/rhgrive3/actions/pull/1939)（軽量スピナーの音声）を確認。照準機能の重複はなく、統合時に共有 adapter のハンクを確認する。

## 本家と揃えた条件・根拠

- 比較参照は Splatoon 3 Ver.11.3.0、バレルスピナー、ギア追加なし、ヒト、静止、平面の床、部分・1周・フルチャージ、ZR保持→放出→次チャージ。
- [任天堂 Ver.11.3.0 更新履歴](https://support.nintendo.com/jp/switch/software_support/av5ja/1130.html) を2026-10-30に HTTP 200で取得。これは版の確認であり、下向きのガイド solver の資料ではない。旧公式ブキページ `/jp/switch/av5ja/weapon/index.html` と `/jp/games/switch/av5ja/weapon/index.html` は HTTP 404。
- 既存固定参照 [Leanny/splat3 `7280ff9c`](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon/WeaponSpinnerStandard.game__GameParameterTable.json) の `ShotGuideFrame=11` と、既存 profile のチャージ・初速・飛行値を保持。[ガイド項目の説明](https://wikiwiki.jp/splatoon3mix/検証/パラメータ情報/メイン) はコミュニティ資料として扱う。
- 角度は INKWAVE の操作範囲にある pitch `-.25/-.45/-.8/-1.05 rad`、yaw `0/π/2`。本家のカメラ感度・角度範囲・ピクセル変位の測定値ではない。動的な同条件の Switch キャプチャ、任天堂内部の collision/guide solver、画面端 clamp 幅は未確認。既存の第三者静止画 `splatling-reticle-reference.json` は形の根拠に限り、下向き動作の一致の証拠にしない。

## 回帰と再現

```sh
node --experimental-vm-modules --test patches/splatoon3/tests/splatling-downward-guide.test.mjs
node --experimental-vm-modules --test --test-concurrency=2 \
  patches/splatoon3/tests/shot-guide-frame.test.mjs \
  patches/splatoon3/tests/shooter-dualies-projection.test.mjs \
  patches/splatoon3/tests/shooter-shot-guide-cache.test.mjs \
  patches/splatoon3/tests/splatling-startup-phases.test.mjs \
  patches/splatoon3/tests/issue-94-muzzle-feedback.test.mjs
INKWAVE_BUILT_SITE=_site-splatling-after node --experimental-vm-modules --test patches/splatoon3/tests/splatling-downward-guide.test.mjs
node scripts/check-inkwave-patches.mjs --quick
node scripts/check-inkwave-startup-budget.mjs _site-splatling-after
node scripts/inkwave-source-migration-audit.mjs --all
```

追加3件は修正前に3件すべて失敗。修正後はソース3/3、通常 minify 配信物3/3で成功した。4角度×2方位×4チャージ×30/60/120 Hz飛行の96条件で、ゼロ拡散・中央値初速の実際に発射した head とガイドの初回床接触が `1e-8` world単位以内で一致する。壁、床の移動直後、前回フル放出から次の部分チャージ、連射中の減るメーターから初速が独立する状態、開けた空中での正確な11F飛行も確認した。予測時のRNG消費は0、照準点・方向・インク・チャージ・標的判定・時間・弾数は不変。

既存関連43件は成功。最初の実行で42/43、1件は保存放出値を設定しつつ非連射のままの旧 fixture だった。放出の試験に `streaming=true` を明示し、現在チャージを試す2箇所は `charge` に設定した後、同ファイル20/20が成功した。値や許容誤差を緩めていない。ソースVMの Character は既存の optional dynamic import callback 警告を出すため、ソースモーションの描画はブラウザ検証と区別する。

quick互換性、起動予算、全対象 source migration audit は成功。起動予算は初期JS146要求、preload145、初期JS1,832,414 bytes。これは決定的な配信物の検査であり、実機性能の測定ではない。

## ブラウザの取得手順

```sh
node reports/splatling-downward-aim-20261030/check-browser.mjs _site-splatling-before .browser-evidence/splatling-before-matched --focused
node reports/splatling-downward-aim-20261030/check-browser.mjs _site-splatling-after .browser-evidence/splatling-after-matched --focused --expect-fixed
```

`?range&skipTitle` から公開版の練習場を起動し、ネイティブ PlayerController・CameraRig・Actor/WeaponRunner・ソースモーション Character・Projectiles・HUD と通常WebGL描画を使う。設定は800×450、Chromium SwiftShader、低品質、影/bloom/照準アシストなし、追加ギアなし。固定入力でフルチャージ→放出→次のチャージを270tick進める。`--focused` は60 Hzの更新だけを選び、24/48/72/95/251tickでWebGLを描画して画像を採る。初回の9条件連続描画はSwiftShaderで時間がかかりすぎたため中断し、選択tickの描画へ絞った。ブラウザでの30/120 Hz連続描画・実機FPSの証拠にはしない。ソースでの96条件と区別する。

## ブラウザ結果と比較画像

通常 minify ビルドの修正前・修正後それぞれで3角度×270tickが成功した。最終採取では同じスクリプト、同じキャラクター名/seed/服装、同じチーム色 `#10d2e6 / #ff4150`、同じギアとカメラ条件を照合した。両方のソースモーション状態は `ready`。初回の採取は起動時の色が異なっていたため、比較画像には固定色で再取得したものを使う。

810tickすべてで、実際のActor位置・照準点/方向・カメラ位置/回転・インク・チャージ・クールダウン・飛行中の弾状態が完全一致した。さらに123回の実際の発射イベントの銃口/方向と、123回の実弾の地形接触点も完全一致した。表示予測の変更が攻撃や照準入力へ逆流していないことを確認した。

| 条件 | 修正前の画面座標 | 修正後の画面座標 |
| --- | --- | --- |
| 下向き -1.05 rad、フルチャージ、tick72 | (574.279, 40.000)、上端に clamp | (356.552, 309.719)、実際の球体対地形の接触点 |
| 下向き -0.45 rad、フルチャージ、tick72 | (419.281, 127.179) | (388.281, 299.214)、実際の球体対地形の接触点 |

練習場の床端は丸い球体との接触になるため、接触点のyは平面中央の0と異なる場合がある。ブラウザ確認はyを0へ強制する検査ではなく、ネイティブ接触queryとガイドの一致を検査する。HUDの登場アニメーション中の拡大/縮小は別の表示時計なので、画面座標との照合は落ち着いた48/72/251tickに限定し、誤差0.2 CSS px以内で成功した。

| 保存した条件 | 修正前 | 修正後 |
| --- | --- | --- |
| 下向きフルチャージ | [画像](before-pitch--1.05-tick-72.png) | [画像](after-pitch--1.05-tick-72.png) |
| 次の部分チャージ | [画像](before-pitch--0.45-tick-251.png) | [画像](after-pitch--0.45-tick-251.png) |

数値・条件・同一性のdigest・画像hashは [verification.json](verification.json)。完全なローカルreceiptは worktree内 `.browser-evidence/splatling-{before,after}-matched/receipt.json` に保存した。ビルドは修正前 contentHash `35ff67f65c2387ab9035e88edd4bdf6ea0bf48492c94202d3377c01a85c6ba67`、修正後 `229b3e400e341bc8208b62685a8fd042edd3e2a579fc1ec80b2006b8a6bd8987`。修正後の1556入力ファイルすべてを、manifestのSHA256・ディスク・実装コミット `166f9d152578c6df6e65de2579169d696fd4b04a` のGit blobと照合した。Chromiumの描画をNintendo実機や本家のピクセル一致に読み替えない。

## 共有比較レポートへの追記案

2026-10-30 — スピナーの下向きチャージでHUDが床下の11F先へ飛ぶ不具合を修正。Splatlingだけ省略されていた実弾と同じ地形接触をガイドへ適用し、再チャージ中の古い放出チャージ混入も除いた。96条件の実弾接触比較、壁・地形変化・再チャージ回帰、通常minify生成物を確認。固定色・同じネイティブカメラのChromium比較で照準の正常化を描画確認し、810tickのゲーム状態と123発射/接触も完全一致。本家参照はVer.11.3.0・バレルスピナー・ギアなし。Switchの同条件動的キャプチャとカメラの完全一致は未確認。詳細は `reports/splatling-downward-aim-20261030/README.md`。
