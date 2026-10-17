# Projectile capture の全 Actor 固定と厳密比較

## 問題と変更範囲

PR #1512 の既存 paired capture は、local Actor の位置と入力を固定していた一方、残る 7 人を `freezeBots()` の入力停止だけに任せていた。この native debug API は非 local bot の更新関数で移動・射撃入力を止めるが、Actor の位置・速度・起動中の Squid Spawn 状態・ギアや武器の clock を初期化しない。native の projectile collision は味方も含む `G.actors` を読むため、起動時間が違う二つの build は異なる当たり判定条件になり得た。

歴史的な run [38996621669](https://github.com/rhgrive3/actions/actions/runs/38996621669) の artifact では、両 capture が成功し、6 scenario の native fire RNG は一致していたが、48 組のうち horizontal Roller F15 の 3 視点で projectile 数が一致しなかった。13 発の出生位置・速度・seed・unit は一致していた。非 local Actor の配置差が画像にあり、旧側で消えた弾には world-hit receipt がなかった。これは native の味方接触による消費と整合するが、当時の記録に actor-contact 証拠がないため、特定の bot が当該弾を遮ったとは断定しない。

この変更は **CI capture harness と比較器**に限定する。native の Actor、武器、床、ギア、当たり判定は捕捉対象 build から読み込み、ゲームへ新しい runtime module を配信しない。味方を collision list から外したり、カプセルや接触判定を無効にしたりしない。

## 再現条件と記録

通常の native Turf startup を完了させた Tidewater の offline 8 人戦を使用する。frozen 状態を要求し、既存 Actor の identity、team、slot、local/bot、owner、nid と配列順を維持する。各 scenario の開始時に次を行う。

- 既存 team spawn pad の x offset `[0, -3, 3, 6]` で実際の native `groundProbe` を実行し、歩行可能な中心床ヒットを確認する。
- slot ごとに Shooter / Roller / Charger / Slosher を native `Actor.setWeapon` で設定し、`Actor.spawnAt` / `Actor.reset` で全員の life と weapon clock を再初期化する。
- native `emptyLoadout` と `s3RefreshGear` で 0 AP を設定する。移動と射撃等の入力・前入力を中立にし、速度と無敵時間を 0 にする。
- 同じ build の `markActorMotionDiscontinuity` と `coherentMotionStart` で、起動時の motion interval が当たり判定へ残っていないことを確認する。
- local Actor を wall scenario 用の床へ移す既存手順の後にも、native gear refresh を通す。

`scripts/lib/inkwave-projectile-ci-roster.mjs` は Playwright が serialize する関数として実装した。import の起点は `document.baseURI` であり、capture 対象の immutable build 配下の config / hurtbox / motion / gear を読む。candidate の定義を reference へ渡す経路はない。

provenance、6 scenario の setup、48 screenshot の runtime に全員の roster を保存する。記録するのは実際の位置・速度・root 位置、aim、全 loadout / AP / modifier、life・入力・weapon clock、native `hurtboxRadius` / `hurtboxHeight` に基づく capsule endpoints、coherent motion start、および reset 時と現在位置の native 床ヒットである。現在の床ヒットは snapshot ごとに probe するため、wall setup で移した local Actor の記録も古い spawn point のままにはならない。

## 比較条件と負対照

`scripts/compare-inkwave-projectile-captures.py` は canonical / scenario / runtime の全 roster をそのまま厳密比較する。`--require-complete` は全 8 人の identity・有限の capsule・aim・gear・life・入力・clock・床・motion 証拠を必須にする。双方から同じ証拠が欠落している場合も complete 判定は成功しない。

既存の物理条件を削除していない。特に `impacts.surfaceHits.paintReceipts.result`、`impactState.paintCoverage`、`impactState.catalogSteps.paintReceipts.result`、`impactEvidence.impactPaintContact.result` は全て比較対象のままである。独立 unit control では面積 `3.0625 → 3.125`、coverage `+0.0001`、味方の位置・ギア・カプセル、および numeric firing RNG を個別に変え、いずれも physical gate が失敗して正しい field path を示すことを確認する。

失敗時の stdout に最初の 8 件までの field path と短い値を出す。大きい配列・辞書は件数と先頭要素に限定する。完全な差分は引き続き JSON receipt に保持し、診断表示によって比較値や合否は変更しない。

synthetic driver は従来の 14 controls を保持し、canonical teammate pose、scenario teammate gear、runtime native capsule、scored paint area の 4 controls を追加して 18 とした。これらは元 capture JSON のコピーを使った検出能力の確認であり、実ブラウザの paired capture 自体とは別である。

## 確認状態と本家との関係

- Native source fixture の roster 3 tests：異なる warmup から全 8 人の結果一致、scenario reset の再現性、native capsule 値の変更を記録に保持、identity / remote / live window / 床の拒否を確認。
- Python comparator 5 tests：正常 complete、証拠欠落や不正条件の拒否、画像 hash と capture directory の検査、roster / RNG / 4 種の塗り面積条件、bounded diagnostics を確認。
- 実ブラウザ 48 場面と native performance window は別の paired capture job で確認する。Node fixture は renderer / audio を代替し、実ブラウザや Nintendo Switch の測定結果の代用にしない。
- native pool の `fidelitySloshIndex` 初期化は独立した runtime 不具合であり、専用 regression / report で扱う。この harness 修正にゲームの物理差分を混ぜない。

リポジトリの本家参照は既存の Splatoon 3 **11.3.0** profile を維持する。この作業は INKWAVE 内の比較条件と証拠を正すもので、本家の内部座標変換・hurtbox 寸法・Roller field 解釈を新しく確定するものではない。本家実機との比較は未実施のままとする。
