# 下り坂のローラー接触・歩行表示・泳ぎ飛沫（2026-10-26）

基点: `48511150bbaeab182dd04c712d39bd5b26df18f3`。独立ローカルブランチ
`fix/roller-walk-swim-20261026`。この担当は push、PR作成、CI起動、mergeを行わない。
open PR #1882/#1889/#1890を確認。#1882のローラー接触候補は数学的な零判定の
最適化のみだった。候補も歴史的な未公開候補も取り込んでいない。
`roller-contact-paint.mjs` と `weapons-fidelity.mjs` は無変更。

## 修正と再現

- 標準ローラーで45度の下り坂をZRと前進入力を保持して進む。
  従来の支持判定は前方の床と足元の高さ差7.5cmを要求したため、連続する坂を
  崖と判定した。既存の塗り処理が使う衝突ポリゴンの連続区間追跡を
  `rolling-floor.mjs` に抽出し、ローラーの支持判定でも使う。
  地面の隙間、段差の不連続、上方の別床へ投影しない条件は保持。
  共有 `main-weapon-catalog.mjs` は import と `rollingPaint` の抽出接続だけ。
  フデは同じ塗り追跡を引き続き使い、幅・速度・武器分岐は変えない。
- 歩行の段差表示は半陰的Euler法のスプリングを解析的な臨界減衰へ変更。
  30Hzで符号を交互に変える補正を防ぎ、30/60/120Hzの減衰を一致させる。
  ソース歩行に渡す移動速度には24/sの短い表示フィルターを置く。
  実Actorの位置・速度・衝突、接地目標の実移動速度は変更しない。
  フィルターは通常の接地歩行のみ。変身・空中・manual・teleportでは実速度へ戻す。
- 普通の泳ぎの飛沫から2m/sの足切り・低速の完全非表示と壁除外を除去。
  サイズは実表面速度から連続的に増える。壁押し付けの法線方向速度は除外。
  根元は床faceの平面／実wallHitの平面へ配置し、Actorの床・壁からの離隔で
  浮かせない。広い膜を3本の小さいカールと8個の短い弾道滴へ置換。
  1人635頂点、1描画メッシュ、最大4人。各滴の誕生ごとの形と周期をずらす。
  視野外更新の省略、別カメラのpre-render再開、clear/disposeを保持。
  Ninja Squidと明示的なremote splash抑止は維持。音声・通信の判定は無変更。

キャラクターの形状・髪・骨格・衣服は編集していない。飛沫だけのジオメトリを変更。

## 本家の根拠と限界

Nintendo公式の[イカとヒトの説明](https://www.nintendo.com/jp/switch/av5ja/index.html)
は今回も取得し、インク中の床・壁移動が対象であることを確認した。
既存比較は `patches/splatoon3/reference/walk-motion-2026-10-02.md` と
`swim-motion-comparison-2026-10-03.md` を参照した。
比較対象として記録されていた公式動画
`https://www.nintendo.com/jp/switch/av5ja/assets/images/index/ikatohito/movie/modal_pc.mp4`
の新規取得はHTTP 403で拒否された。迂回せず、Nintendoの動画・画像を同梱しない。

したがって、新しい飛沫の個数・寸法・低速曲線や歩行フィルターはINKWAVEの校正値。
今回の描画を原作映像との一致・Switch Ver.11.3.0の実機比較として扱わない。
本家の入力整列済みの微入力・最高速・加速・停止距離・90度旋回・反転・移動射撃・
坂／段差・足運び、壁登りの飛沫とNinja Squid境界の実測は未確認。

## 検証

詳細なログ・生成物ハッシュ・ブラウザ受領記録は `validation.json` と
同ディレクトリの証拠を参照。ソース回帰とGPU描画を区別する。

- `roller-downhill-contact.test.mjs`: 実Actor/Runner/Character/Physics/CPU所有格子。
  通常の「ZR保持→振り→塗り進み」で下り45度を進み、30/60/120Hzの描画入力を
  60Hz FixedClockで処理。修正版は各60/60 tick接触・継続的な塗り所有を確認。
  旧基点の `roller.mjs` だけを戻す対照は各0/60 tickとなり3件すべて失敗。
- 歩行の段差の単調減衰、表示速度ノイズの低減、停止端点、実ソース歩行の接続を検査。
  実Actorの微入力・加速・90度旋回・反転・射撃・停止・小段差を、旧表示フィルターと
  新表示フィルターで同じ入力列に通し、位置・速度・yaw・ground face・HP・インク・
  cooldownを比較する。
- 低速～高速、床／壁、品質low/high、30/60/120Hz、stealth、空中、壁押し付け、
  最大4枠、破棄、視野外の再開を検査。形状・法線の有限性と境界球も確認。
- 既存#847の厳格な入力固定は、新しいimportと連続支持fallbackだけを正確に
  逆変換して旧 `121d3ae7…` SHA256へ一致することを追加した。元の3つのfault
  controls・missing/modified input拒否・歴史的fixtureは保持。10件成功。
- `check-inkwave-locomotion-surface.mjs`: emitted modulesをChromium/SwiftShaderで
  描画。ローラーは実Actor入力・Physics・実GPU塗りatlas。飛沫は制御した床／壁の
  Actor状態を使うVFX fixtureで、表示／非表示の実ピクセル差を取得。
  本番試合UI／pointer lockの操作試験には読み替えない。

音声コード・音声イベントは変更していないため、新しい音声一致の主張はしない。
iOS/iPad・実GPU・二端末対戦・Switch実機、親担当の統合PR/CIは未実施。
