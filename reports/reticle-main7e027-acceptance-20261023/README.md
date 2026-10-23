# HUD候補＋main7e027：別コピーでの追加受入

原候補 `c74a2d6011777eae7e001297c018ffcecaa263e7` とPR #1859 headは変更していない。別worktreeへ、公式main `7e027ac2ff7eea31c04155e0ee1e0d3e5604ed51` の `static-menu-adapter.mjs` と `static-menu-art.test.mjs` の2 leafだけを正確にコピーした。main / PR1854 / 他PRへのmergeはしていない。local-references checker/pinsにも変更なし。

公式compareは `official-diff.json`。取り込んだ2 blobはそれぞれ `e9ec35da5e1f96d9e312ba18f89585c0222e26cc` / `46288013ecf23a02a67e4837623a6d5746d201e9` と一致。HUDには新しいcomposition登録を追加しておらず、既存の `adaptS3HudLook` 経路を維持している。#1858の置換点（Gameのworld-frame gate / static menu CSS）とHUDの置換点（hit payload / HUD method / hud.css）は合成上も競合しない。

## 終了した確認

- 合成source 30/30、実minify生成物のHUD fixture 12/12、startup budget pass（raw `.tap.gz` / `budget.json`）。
- 通常buildは1420 inputs / 2110 artifacts。全artifactを再hash。原候補のbuildとの差分入力は `local-quality/static-menu-adapter.mjs` の1つだけ（テストはruntime input外）。合成済み `src/ui/hud.js` / `styles/hud.css` / HUD adapter出力は原候補の生成物とbyte一致。`composition-proof.json`。
- desktop1280×720 / touch phone844×390でmain→locker→main→settings→mainをtrusted click/tapから実行。main/settingsはcanvas hidden、lockerはvisibleで実character 1体が描画され、context lossなし。全検査panelのbackdrop-filterはnone。原メニュー負荷改善を保持している。
- 同じ通常アプリのPLAY→PRACTICE RANGEでcanvasがvisibleへ戻り、実弾36/36/36の3発目killを確認。HUDも可視。
- desktop1280×720 / 1920×1080 / phone844×390の計15点（四隅40px＋中心から離れた点）で、表示照準・命中マークの原点が指定guide点に一致。最大座標誤差0px。次のguideへ切り替えても確定済みマークは元位置に残る。これは実HUDにframeを与えるcomponent診断であり、実弾impact点の計測ではない。
- muzzle-block indicationだけではhitを出さない。正当なzero-damage killはkill cueのみでdamage pulseを出さない。
- 実際のRange BOMB_BLOCK（x[-15.4,-13.4], z[45,47], height1.2）の奥へ実Actorの的をfixture内で配置。射撃の実collision/update経路でLOS=false、的HP100→100、hit0、marker0をdesktop/phone両方で確認した。fixture外の形状・射撃・damageを変更していない。

`browser-v2/receipt.json` とPNGが最終ブラウザ証拠。例: [phone locker](browser-v2/phone-locker.png)、[desktop occlusion](browser-v2/desktop-occluded-range.png)。`browser/` の初回はHUD entranceの可視性確定前に検査して失敗した。次の版は可視性を待つ条件を追加し、元のassertionを保った。初回の失敗も保存した。

Chromium/SwiftShaderによる確認で、physical GPU / Safari / Switch / retail動的忠実度のacceptanceではない。本家映像403は迂回しておらず、新たなNintendo参照メディアを保存・公開していない。全CIの完了待ちは行っていない。

## 非致死remote ACKの追加調査（修正前報告）

`reproduce-reticle-remote-confirmation.mjs` は既存source fixtureで実際のcomposed NetMatch / Actor / Projectilesを二端末分起動する。native main birthを転送し、受信側が本当に10 HPを適用して発行したACKを、送信側の通常onMessageへ届ける。HUDは実際の `_bindBus` と、composed mainの実 `on('hit')` 登録を使い、marker呼出しだけspyで数える。transportはbounded sink、HUD dispatchはsource/VM診断であり、実relayやremote browser描画の証明ではない。

最終証拠は `remote-confirmation-repro-final.json` / `.log`。

| 段階 | combat:confirmed | hit | マーク呼出し |
| --- | ---: | ---: | ---: |
| 実発射後、未受理pending | 0 | 0 | 0 |
| 未認証owner / 別match / 別victim life / 別attackerのACK | 0 | 0 | 0 |
| 所有側HP100→90、正当な非致死ACKを受理 | 1 | 0 | 0 |
| 同じACKを再送 | 1 | 0 | 0 |
| その後、通常owner clockを進めて既存hitイベントを再生 | 1 | 1 | 1 |

原因はACKが `combat:confirmed`、既存main/HUDの命中表示が `hit` 購読であること。**ACK受理だけの経路に表示gapはあるが、remote命中が常に欠落するとは言えない。** 所有側は非致死 `hit` も通常イベント列へ転送しており、それが届けばマークが1回出る。ACKを単に追加購読すると同じ一命中に2回出る。legacy転送payloadにはattacker/victim/damage/weaponIdがあるが、ACKの `h` は無いので、時刻やdamageだけの推測dedupは採用しない。

### 別incrementの最小案（未適用）

HUD表示のproducerを明示的に分ける案を検討する。localで受理された `hit` と既存zero-damage splatは維持し、既存request/ACK方式のmain攻撃の非致死表示だけを `combat:confirmed` へ接続する。同方式のlegacy remote hitからは重複するmarker呼出しだけを外す。ACKを使わないbomb / special / ranked等は既存表示経路を維持する。network protocol / authority / damage / packetには変更しない。

必要なidentity条件は、attackerがHUD local Actorそのもの・isLocal・生存・非remoteであること、現在のNetMatchとG.matchが一致すること、現在のregistry/rosterの同じActor参照であること、helperLife / victimLifeが現在lifeに一致すること、敵の正の非致死damageであること。native ACK receiptのonce-only判定を再実装せず利用し、victim ownerの交代は既存の受理済みACK判定へ委ねる（旧ownerという理由だけで誤拒否しない）。

適用前にrequest/ACK方式の対象をsourceで固定し、ACK先行・legacy先行・片方欠落・双方再送、同一victimへの連続h、local/direct hit、zero-damage kill、別の有効attacker、life/match切替を検証する必要がある。現調査は接続案までであり、**この追加修正はまだ一切適用していない**。親の独立reviewへこの再現とrouting案を返す。

初期repro v2/v3は追加export不足、owner-clock advance不足、fixtureのisLocal初期化不足を直す途中の記録で、正常なlegacy転送が欠落する根拠に数えない。最終版は実mainと同じisLocalを初期化し、native owner clockを進めた上でhit=1を観測した。
