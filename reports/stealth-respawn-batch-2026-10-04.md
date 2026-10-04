# 潜伏・イカニンジャ・復活短縮の4件

#229 / #296 / #260 / #205。基準main `0859bf4fab08edc74c25fcb790e662a748a91ec9` の公開 `inkwave-public → adapter → runtime/install.mjs` から独立実装。前の未merge PRのコードはコピーしない。

## 資料

参照版はSplatoon 3 Ver.11.3.0、閲覧日2026-10-04。任天堂実機の新規計測はしていない。

- [任天堂掲載 ギア選び](https://www.nintendo.com/jp/ichikara/av5ja/02.html): 2024-04-01時点。イカニンジャはフク専用の基本ギアで、泳ぎの飛沫を抑える。執筆はGameWithで、任天堂の詳細数値仕様書ではない。
- [任天堂 Ver.2.1.0更新履歴](https://www.nintendo.com/en-gb/Support/Nintendo-Switch/Game-Updates/Splatoon-3-Update-History-2358763.html): 変身後0.5秒の隠蔽待ちと、イカ速ギアの一部を打ち消す旧仕様の廃止。
- [S3検証Wiki イカニンジャ](https://wikiwiki.jp/splatoon3mix/%E3%82%AE%E3%82%A2/%E3%82%AE%E3%82%A2%E3%83%AF%E3%83%BC/%E5%88%86%E5%89%B23#ninja_squid): 泳速0.9倍、飛沫だけを抑え、泳ぎ跡・音は残す。
- [S3検証Wiki 半倒し](https://wikiwiki.jp/splatoon3mix/%E5%B0%8F%E3%83%86%E3%82%AF%E3%83%8B%E3%83%83%E3%82%AF#q07e8229): 有効最高泳速の6割以下では飛沫と泳ぎ跡を生成しない。イカ速ギアでも比率を維持。
- [S3検証Wiki 復活時間短縮](https://wikiwiki.jp/splatoon3mix/%E3%82%AE%E3%82%A2/%E3%82%AE%E3%82%A2%E3%83%AF%E3%83%BC/%E5%88%86%E5%89%B22#quick_respawn): 敵による死亡の間にトドメなしという条件、初回/環境死/相打ちの順序、両カメラの短縮表。
- [固定11.3抽出 params.json](https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/misc/params.json): `Dying_AroundFrm=[30,60,90]`、`Dying_ChaseFrm=[90,180,270]`。High/Mid/LowをAP曲線へ対応させ、各フェーズの残フレームを個別に切捨てる。

[復活短縮の補助検証記事](https://macarongamemo.com/entry/splatoon3-respawn_time)（2024-01-02）のGP表とも照合。ただし同記事のまとめ式はGP10等で掲載表と1Fずれるので、式を盲目的にコピーしない。相手の復活ペナルティアップ #116 は資料とIssue本文に食い違いがあるため、このPRへ含めない。

## 変更

### #229 低速潜伏

最高泳速の0.6以下で、Actorのwake粒子・FxHooksの旋回飛沫・SwimWakeの表面の跡をそれぞれ抑える。絶対速度2/0.8の判定だけに依存しない。ギアと既存Flowの泳速倍率を同じ計算から参照する。停止中も新規の跡は生成しない。既存の軌跡は瞬間消去せず、元の寿命で減衰する。潜伏開始/解除の一回限りの水しぶきはそのまま。

### #296 イカニンジャ

フクmainだけに装備可能。normalizeLoadoutとUI選択肢を同じslot規則で制限し、アタマ/クツ/subへは保存できない。泳速倍率0.9はイカ速のAPを打ち消さず、最終倍率へ1回だけ適用する。変身時点を記録し、0.5秒後は地面泳ぎの飛沫だけを抑える。静止して待ってから移動しても再待機させない。壁の水滴、表面の泳ぎ跡、音、敵マップやHP表示等の別の情報は隠さない。

所有者側の飛沫/軌跡の判断を、既存NetMatchのフラグに別々に格納してproxyへ渡す。配列長や時系列補間は変更しない。新フラグがない旧packetは元の局所判定へフォールバックし、古い隠蔽フラグを保持しない。これは実packActor/applyRemoteを使うCPU試験であり、複数実機ネットワークのレイテンシやホスト移譲時のギア同期を証明するものではない。

### #260 / #205 復活時間短縮

自分カメラとキルカメラの両方を短縮。GP0/3/6/10/20/30/57の削減は0/24/46/74/134/180/240F。固定演出・射出時間へ倍率はかけない。既知の基礎復活時間差 #91 は別範囲として残す。

敵に倒された時点を履歴の境界とし、以後トドメなしで再び敵に倒されたら発動する。キルを取った生存区間の次の無キル区間ですぐ有効になり、二度連続の無キル生存区間を要求しない。初回の敵死亡、環境死、アシスト、死後のトドメを区別。環境死は発動せず履歴も消さない。実respawnの内部resetでは履歴を保存し、新試合のresetでは消去する。死後に発生したトドメを過去の死亡へ遡及適用しない。

## 検証手順と制約

`node --experimental-vm-modules --test patches/splatoon3/tests/stealth-respawn-batch.test.mjs patches/splatoon3/tests/stealth-respawn-native.test.mjs`

- 実Actor/WeaponRunnerによる速度比、0.5秒境界、停止後移動、再変身、通常/味方/敵の表示条件。
- 実SwimWake.uniformとnative wake/旋回の呼出し、過去の跡の減衰、native network packet/proxy。
- 復短は実splat/respawn/resetと敵イベントを使い、初回、kill→death→no-kill→death、アシスト、死後トドメ、環境死を検査。
- 同じ60Hz入力で30/60/120Hz描画の結果を比較。
- 旧mainへテスト用export-loaderだけを足し、既存のnative導線に対して5症状が全て再現する負例を実行。新しいruntimeモジュールが存在しないことだけを失敗根拠にはしない。

0.6の境界と実際の見え方の最終較正、全ブキの元の泳速、実機音量、端末間/旧版混在は未確認。ローカル実ブラウザはUnix socket制限で未実行のため、PR最新headのGitHub CIで別途確認する。Nintendo実機との完全一致は主張しない。

## ローカル結果

- 専用18回帰は全pass。新モジュールに依存しない旧mainの負例5件は全fail。
- 最終全体patch gate: 51ファイル、760 pass / 0 fail / 0 skip。
- local-quality 8件、motion/workflow 10件成功。
- 原典11ファイル・127抽出値の完全バイト/値照合成功、14 unknown維持。
- 公開合成ビルド revision `579632e093c9` 成功。`git diff --check` 成功。
- 実GPU/複数端末ネットワーク/Nintendo実機は別検証。CIは最新headで追跡する。
