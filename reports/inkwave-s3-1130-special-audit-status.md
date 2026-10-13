# INKWAVE スペシャル19種 11.3.0 検証台帳

基準: [Leanny/splat3, pinned 7280ff9c](https://github.com/Leanny/splat3/tree/7280ff9cde8bb1c5dcef46c700c326471584d2e6/data/parameter/1130/weapon)、各ブキの S3 検証Wiki、実際の production-composition で読み込まれるゲームコード。

**注記:** 「19/19種がレジストリに存在して初期発動テストを実行できる」ことと、「実機 11.3.0 の全挙動と完全一致」は別です。後者を確定したブキはまだありません。状態は、ソース照合・実装・検証を繰り返すための作業台帳です。

| # | スペシャル | 実装/照合先 | 検証の主眼 |
|---:|---|---|---|
| 1 | ウルトラショット | `kit-trizooka.mjs` / `WeaponSpUltraShot` | 3発、55F、直撃・爆風、移動・壁 |
| 2 | グレートバリア | `kit-big-bubbler.mjs` / `WeaponSpGreatBarrier` | 外殻/弱点HP、ドローン、貫通、ビーコン |
| 3 | ショクワンダー | `all-specials.mjs` / `WeaponSpSuperHook` | ワイヤー速度・距離、使用中の射撃禁止、12F待機 |
| 4 | マルチミサイル | `all-specials.mjs` / `WeaponSpMultiMissile` | 1～5対象、発射数10/5/4、4F間隔、標的なし |
| 5 | ジェットパック | `all-specials.mjs` / `WeaponSpJetpack` | 450/480/510F、60F連射、噴射、帰還 |
| 6 | アメフラシ | `storm-effects.mjs` / `WeaponSpInkStorm` | 雨の持続時間・HP回復、ゲージロック |
| 7 | ナイスダマ | `all-specials.mjs` / `WeaponSpNiceBall` | 30F発動、アーマー、チャージ・応援、600F自動投擲 |
| 8 | ウルトラハンコ | `all-specials.mjs` / `WeaponSpUltraStamp` | 初動・振り間隔・空中振り・投げ前隙 |
| 9 | メガホンレーザー5.1ch | `all-specials.mjs` / `WeaponSpMicroLaser` | 6本、5Fごとのダメージ、発動後40F入力制限 |
| 10 | キューインキ | `kit-ink-vac.mjs` / `WeaponSpBlower` | 17F発動、吸収範囲・消耗・20F転換、220直接 |
| 11 | カニタンク | `all-specials.mjs` / `WeaponSpChariot` | 耐久500、方向別移動、75F砲撃、転がり・命中 |
| 12 | サメライド | `all-specials.mjs` / `WeaponSpSkewer` | 38F準備、54F滑走、15Fキャンセル、38F爆発・28F硬直 |
| 13 | トリプルトルネード | `all-specials.mjs` / `WeaponSpTripleTornado` | 3投、33F投間隔、82F降下、51F攻撃 |
| 14 | エナジースタンド | `support-cooler.mjs` / `WeaponSpEnergyStand` | 15秒設置、17～25秒ドリンク、複数人・死亡処理 |
| 15 | デコイチラシ | `all-specials.mjs` / `WeaponSpFirework` | 12個、108F飛翔・210F爆発、地形と所有塗り |
| 16 | テイオウイカ | `all-specials.mjs` / `WeaponSpCastle` | 35Fチャージ・ダッシュ、1.5径の全経路当たり判定 |
| 17 | スミナガシート | `all-specials.mjs` / `WeaponSpChimney` | 60F展開、560F移動、60F消滅、40ダメージ・デバフ |
| 18 | ホップソナー | `all-specials.mjs` / `WeaponSpShockSonar` | 90/240/390F、マーキング4/10/18F曲線、装置・ウェーブ |
| 19 | ウルトラチャクチ | `triple-slam-fists.mjs` / `WeaponSpPogo` + Wiki11.3 | こぶし距離6.54、半径6.4/9.6、15F遅延、スーパージャンプ発動 |

## 追加済みの実修正

- ホップソナー：マーキング補間の10F/0.40中間点
- テイオウイカ：ダッシュ移動全区間の接触判定
- カニタンク：転がり当たり判定1.45、攻撃方向別速度、75F砲撃、フレーム境界の丸め
- マルチミサイル：実標的のみ、5対象対応、4F間隔
- デコイチラシ：12個のデコイ、元データの飛行・爆発タイミング
- サメライド：38F準備、54Fの直進加速、38F爆発準備と28F硬直
- トリプルトルネード：投擲・降下・持続時間
- ジェットパック：ZRホールド中の連射
- ナイスダマ：発動・チャージ・投擲状態
- メガホンレーザー：6本の構成を保持しつつ40Fの操作制限
- ショクワンダー：フック移動中の通常射撃抑止
- ウルトラハンコ：振り・投げのフレーム管理

## 本家一致と判定する前の条件

各ブキの実装に対して、**ダメージ、塗り所有、発射イベント、攻撃・移動判定、アニメーション、実音源とイベント、通信同期、毎フレームの遷移、実際の負荷**を独立に比較してください。既存のテストが成功していても、ゲーム側の固有モーション・VFX・音源イベントが欠けていれば「完全一致」と判定しません。

このPRのCIは重要な回帰保証ですが、実機とのA/B実測を代替しません。未確認部分を推測で「検証済み」に塗り替えないでください。
