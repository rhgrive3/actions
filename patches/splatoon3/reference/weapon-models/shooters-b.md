# シューター（グループB）モデル記録 — Splatoon 3 Ver.11.3.0

対象: プライムシューター、.96ガロン、ジェットスイーパー、スペースシューター、L3リールガン、H3リールガン、ボトルガイザー。
実装: `patches/splatoon3/runtime/weapon-models/shooters-b.mjs`（手続き的ジオメトリ。本家メッシュは含まない）。

- 形状の原典: Inkipedia「S3 Weapon Main <名前>.png」（本家3Dレンダー、400px、銃口右）の輪郭をなぞった。回転動画は .96ガロン以外ほぼ未使用。
- 縮尺: グリップ（握り部）を 0.11 m とし、画像上の長さから m/px を決定（画像からの推定）。
- 内部モデル名: Leanny/splat3（7280ff9）`ActorInfo` の Fmdb。
- 銃口（弾の発生位置）を全7種で各ノズル出口へ移した（ゲームプレイ上の変更。実機比較は未確認）。

| ID | 内部モデル | 輪郭IoU 前→後 | 残差・確認状態 |
|---|---|---|---|
| s3-shooter-expert | Wmn_Shooter_Expert | 0.339→0.617 | 細部（フィン・文字）簡略。画像から推定 |
| s3-shooter-heavy | Wmn_Shooter_Heavy | 0.391→0.777 | 前方ブラケットを左手で握るため構えを胴へ寄せた（hold上書き、画像から推定）。粒状キャニスターの質感は未再現 |
| s3-shooter-long | Wmn_Shooter_Long | 0.280→0.708 | 長銃身の持ち方は在来シューターのまま（未確認） |
| s3-shooter-quicklong | Wmn_Shooter_QuickLong | 0.423→0.777 | 白黒の模様は形状の塗り分けのみ |
| s3-shooter-triplequick | Wmn_Shooter_TripleQuick | 0.395→0.640 | リールの回転動作は未実装（未確認） |
| s3-shooter-triplemiddle | Wmn_Shooter_TripleMiddle | 0.343→0.693 | 縦横比 5〜10% ずれ。リール動作未実装 |
| s3-shooter-flash | Wmn_Shooter_Flash | 0.426→0.818 | ボトルの縞・ネットは簡略 |

未確認（実機計測が必要）: 各ブキの射撃時の左手位置、構えの高さ、リールガンの可動部、銃口位置の厳密な一致。
