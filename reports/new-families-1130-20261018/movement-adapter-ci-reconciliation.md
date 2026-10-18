# main移動ゲートのテスト整合

基準はmain `1f459722a5417fbdef0396ed2520d7ea145ea465`。最終main CIの
[validate_core job](https://github.com/rhgrive3/actions/actions/runs/39122315599/job/117661071243)
は、`movement-smoke.test.mjs` がadapted Actor内の
`rollingMovementActive(this)` 呼出しを要求する箇所で失敗した。

履歴と実行経路を確認した結果、速度判定の欠落ではなかった。
[#1584](https://github.com/rhgrive3/actions/pull/1584) の `b1c550c5` は、転がし中の向きを
速度方向から照準yawへ意図的に変更し、実Actorの `issue-857-roller-heading.test.mjs`
も同時に更新した。地上速度は引き続き Actor `_horizontal` → Runner `moveSpeed` →
`rollingMovementActive(this.a)` → `rollingMovementSpeed(this)` を通る。
向きの開始遷移を、接地した基本ローラーだけに適用する速度判定へ戻してはいけない。

修正はテストと本追補のみ。adapterとruntimeは変更しない。古いActor内呼出しの要求を、
実際の委譲経路の確認とadapter出力メソッドの実行へ置き換えた。

- 通常転がし6.48、90F以降7.92、逆向き入力時の目標6.48をRunnerとActorの速度で検査。
- 転がし解除、振り、サブ構え、非接地、イカ、スペシャル、スーパージャンプ、別ブキ、
  スライド後ロックの各経路と、残る表示用振り硬直中の正当な転がしを検査。
- admission helperを常にfalse／trueへ置換し、速度profileを定速へ置換する3負対照は
  すべて失敗する。インポートだけ残る実装を合格にはしない。
- 実adapted `_face` を実行し、基本ローラーと追加ローラー／筆の保持開始、イカ化、
  スペシャル、スーパージャンプ、通常射撃／移動、サブ構えを分離する。

ローカル旧smokeは6成功・1失敗を再現。修正後、CIと同じ
`node --test patches/movement-physics/tests/*.test.mjs` は11成功・失敗0。
別途、実Actor・ドラム・塗り・リモート再生を扱う既存 #857 は2成功・失敗0。
scalar fixtureだけで全ゲームの移動を立証したとは扱わない。

同じproductionビルド手順を再実行し、既に検証した `/workspace/lobe-main-site` と比較した。
全1900生成物と `inkwave-build.json` は実バイト同一だった。

- content: `b93bfef0f3aa97806999ccc4ca8b4f248029b5b973a7f957b142e3a5e6d4833d`
- input: `3f563580197e7629dcd534d9f97e2fa66660388192c521c83411d642b2010fcf`
- manifest SHA-256: `66ffafb7d4a204febdaa7db49ca26f50006e2bb1acd8f5cf4124b53334d84ca9`

外部受領記録は `/workspace/movement-ci-fix-verification.json`。
既存705条件、mask、通信、長時間stressは同じproduction bytesへの検証として保持できる。
変更後CIの成功は別途確認する。進行中 #1592 の変更ファイルにmovement adapter／testは
なく、同PRのaim／roster／reliability修正は本変更へ含めていない。
