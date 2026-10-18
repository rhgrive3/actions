# CIの旧画面パネル誤判定を修正

HEAD `d88f058a` の responsive CIでは14条件中13成功、WebKit26.5/390×844のlockerパネル判定のみ失敗した。[失敗artifact](https://github.com/rhgrive3/actions/actions/runs/39108737494/artifacts/12129893013)は保持する。武器ロジック・JS例外・ブラウザクラッシュの失敗ではない。

公開production Menus/CSSを使った独立した実DOM検査で、透明な旧loadoutの`.iw-wd`が`.is-leaving`のまま残り、left=-13.31499958・right=339.3150053となる状態を取得した。退場animationは280ms、旧画面の削除は別の340ms timerであり、animation完了待ちとDOM所有者の退場完了は別である。この時点の現lockerはviewport内だった。旧画面が退場した後の現panelは16..374で合格する。

`check-inkwave-responsive-core.mjs` のcapture冒頭で `.iw-screen.is-leaving` のDOM消滅を待つ。元の全panel・±1px境界assertはそのままで、対象を隠すfilter、広い許容範囲、固定sleep、合否のskipを追加していない。既存`checkResultContinuation.ready()`も同じ所有者退場のbarrierを使う。アプリのメニュー・レイアウト・武器・ランタイム生成物は変更しない。

実DOMの負対照では、現panelを500px幅にするとright=516で既存境界判定が失敗し、復元後に成功した。退場しない旧画面を保持するとbarrierがTimeoutErrorで失敗する。現画面のはみ出しやライフサイクル不全を合格に変えていない。

既存fixture試験に、退場を待ってから全panelを測ること、現panelが1.01pxはみ出す時は失敗すること、所有者が退場しない時は失敗することを追加した。同じ試験は変更前2成功/3失敗、変更後は関連workflow policyを含む38成功/0失敗。CIの既存verifierリストへこのfixture試験を追加し、元の検査を保持する。修正後WebKit実画面と最終HEAD CIの結果はPR #1577の最終受領で記録する。
