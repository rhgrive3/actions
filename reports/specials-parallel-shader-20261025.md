# スペシャルのRibbonPool末尾コピー軽量化

基準はPR #1876 head `6dacd47095352cfd600f9c83012c71a2f298a460`。独立worktreeで調査・実装・テストを実施し、Actions、GitHubへの書込み、配信はしていない。並行PR #1870（確認head `8e539eac1e5fe4a6412d3e5852d7f5eaa5d0c1da`）の同ファイル差分はSpritePoolの属性配列とShapePoolに限定され、このRibbonPool最適化を含まない。

## 変更と適用範囲

`special-vfx-kit.mjs` のRibbonPoolは、48点／40点の固定バッファで実際の点より後ろを最後の頂点対で埋め、アルファを0にしている。これまではその各点に対して34要素のコピーと2要素のアルファ再設定をJSで繰り返していた。

候補は、最後の有効頂点対を1回コピーしてアルファを0にし、そのブロックを倍々に `Float32Array.copyWithin` で広げる。頂点・色・法線方向・リボンパラメーターの**全バッファのバイト列**、index、draw range、upload rangeとversion、公開point/sample record、RNG列を変えない。新しい配列やgeometry/material、フレーム間キャッシュを加えず、逃げたhandleやtyped arrayを再利用しない。満杯のtrailには末尾コピーがない。

2点だけ生きている48点trailでは、実際の属性配列をProxyで観測したJSスカラー代入は**1724回→70回**。35回のネイティブコピー（1564 Float32要素）で同じバイト列を作る。これはCPU作業量の証拠であり、速度・GPU・実機FPSの改善率ではない。タイミングは親の統合工程で他laneを止めた状態の交互ベンチマークにより判定する。

このプールはマルチミサイル、ジェットパック、ナイスダマ、投げハンコ、カニタンクの弾・球体移動、ウルトラショット、キューインキ、トリプルトルネードのマーカー、デコイチラシ、サメライド、ショクワンダー、テイオウイカの表示から使われる。各special固有のemit周期・粒子数・形・material・shader・寿命は変更しない。

## 検証結果

```sh
node --test \
  patches/splatoon3/tests/special-ribbon-tail-block.test.mjs \
  patches/local-quality/tests/queue-30-ribbons.test.mjs
```

**8件PASS、fail/skipなし**。全ての部分長を2/3/8/40/48点容量、通常／additiveで比較した。30/60/120Hzの移動camera、sampleの合流、リングバッファoverflow、末尾の失効、end、clear、公開optionやpointの書換え、NaN／無限大／符号付きゼロも比較した。全5属性の全Float32バイト列、indexと描画・upload範囲、RNG回数を固定基準実装と照合する。

```sh
node --experimental-vm-modules --test --test-concurrency=1 \
  patches/splatoon3/tests/special-crab-ribbon-lifetime.test.mjs \
  patches/splatoon3/tests/zipcaster-trail-lifecycle.test.mjs \
  patches/splatoon3/tests/special-vfx-pool-capacity.test.mjs
```

このグループは**7 PASS / 2 FAIL**。Zipcasterのsource/emitted lifecycleとpool容量・資源解放は成功。Crabのsource/transformedの2件は、基準・候補の両方で `RangeError: Invalid array length` を再現した。既存のfake ribbonが `pts` だけを持ち、実際のring bufferに必要な `samples/head/count` を持たず、`pts.length = undefined` に到達するためである。元のRibbonPoolクラスを差し戻した診断でも同じ2件が失敗した。PR #1870に当該fixtureの修正が既にあるため、本laneでは複製・検査緩和・skipを加えない。

ローカルログは `.ci-scratch/ribbon-tail-tests.log`、`.ci-scratch/ribbon-tail-integration.log`、`.ci-scratch/crab-ribbon-baseline.log`。`node --check` と `git diff --check` はPASS。full buildと実ブラウザは統合担当で実施する。

## 再現可能な計測

```sh
node scripts/benchmark-inkwave-ribbon-tail.mjs \
  --output .ci-scratch/ribbon-tail-serial.json
```

実際のproduction RibbonPoolクラスと固定基準クラスを使う。4/40 trails × 2/12/48生存点、各200 warm-up、3000更新×11回を前後交互に測定し、終了後の全属性バイト列の同一性も検査する。Node/CPU、各回の生時間、source SHA256と最終buffer SHA256を出力する。共有環境の他テストが実行中のタイミングは性能受入には使わない。本laneでは6scenarioの1更新×3回の起動・一致確認だけを実行し、その時間は測定結果から除外した。

固定基準のクラス全文は `tests/fixtures/ribbon-pool-before-tail-block-20261025.txt`。SHA256: `880d2baf11524344edaee90f94753a19d68c5002023b2b755c8d58bf600c2953`。

## 本家との比較と未確認範囲

既存のSplatoon 3 Ver.11.3.0比較と `reference/special-vfx.md` を継承する。再現操作は上記specialを発動し、弾・マーカー・移動時のtrailの開始から退場までを観察すること。計算方法だけの変更で、INKWAVE内の表示出力とゲームロジックの差は増減しない。本家映像の新規照合、実機/Safari/iPad、GPU timingやFPS、通常対戦の全体性能を検証したという意味ではない。本家との既存の未確認値・表示差は未解消のまま残す。
