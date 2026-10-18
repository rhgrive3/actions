# 途中更新されたmainとの統合

検証中にPR #1574（Charger organic paint）がmain `57de1208f313a18631969303b6a690258cd34b16`へマージされたため、最新mainを取り込んだ。統合runtimeは`5129d50d6b699b2a88988e5b3e48affecb86f129`、production contentHashは`5e2894c7198ea9a3c7e54b99b615fc18df5551529bf2ab2befadfb93eb56e106`。自動mergeで競合はなく、独立レビューでblockingなし。

共有catalogの差分は`family==='charger'`のtravel paintへの接続、network adapterはCharger用3kindの追加のみ。既存5塗りprofileの先頭2560bytesは完全一致、texture128×8は同じ、対象16種のfootprint mappingも全件同じ。今回追加した斬撃・弓tilt・傘sidecar・スライド状態への競合変化はなかった。

再ビルドしたminified productionで75系統回帰＋7 footprint＝82件成功。さらにnative #532/#992の24件成功。6F遅延の実2ブラウザリレーは130件対応、最大位置誤差.007587、速度誤差0。source/builtのGPU maskは各124条件＋878 body条件、CPU-only/GPU-only=0、境界同値17。145 preload、初期JS2,704,031Bで配信予算内。

機械可読結果は[integration-main-57de.json](integration-main-57de.json)。本改修だけの141条件/423試行と前後性能データは、元の基準main9ef6335と改修runtime c597a70のビルドに結び付く履歴であり、後から取得したChargerの性能改善として数えない。最終HEADの全CI・全16種ブラウザ検査を再実行し、PR1577へ最終受領結果を追記する。マージ後mainのbuild/readbackと8人同時射撃も別に確認する。
