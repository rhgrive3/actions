# ナワバリ開始カメラ（2026-10-30）

基準: main `5b722cba888cb86a7a21f29596bd54eaf16b01fd`。対象は公開版の Game / CameraRig / Match と配信時の合成。ナワバリ開始を、上空から自分の背後へ3.6秒で横断し4.2秒で開始する一つの経路から、味方紹介、相手紹介、自陣発射待機視点の3カットへ変更する。

## 本家の資料とフレーム

任天堂公式 [nawabari_pc.mp4](https://www.nintendo.com/jp/switch/av5ja/assets/images/index/movie/nawabari_pc.mp4)。996×560、60/1 fps、1526フレーム、SHA-256 `5e933a5ce4b6695ca07b12777298ad5bf5eee82b5ce50ba0f90141382d5e8640`。全PTSを取得し、先頭600フレームについて切替前後を含む画像を確認した。[取得と観測値](turf-intro-camera-20261030/reference.json)、[フレームごとのPTS](turf-intro-camera-20261030/source-frame-pts.csv)。番号は映像の先頭を0とする。

| フレーム | 秒 | 観測 |
| --- | --- | --- |
| 0–208 | 0–3.4667 | 黄色の味方チーム紹介。ゲーム開始後のローカル側も黄色。 |
| 209–398 | 3.4833–6.6333 | 紫の相手チームへハードカット。209Fはscene差分でも検出。 |
| 399 | 6.65 | 味方のスポナー後方・上からステージ方向へカット。HUDが出る。 |
| 436 | 7.2667 | READYの最初の文字が出る。435Fは未表示。 |
| 578 | 9.6333 | 開始の発射・放射状エフェクトが出る。577Fは待機。 |
| 580 / 581 | 9.6667 / 9.6833 | 白フラッシュ / GO文字。 |

取得: `curl -fL <上記URL> -o nawabari_pc.mp4`。解析: `ffprobe -select_streams v:0 -show_frames -show_entries frame=best_effort_timestamp_time,pkt_duration_time -of json`、`ffmpeg -vf "select='gt(scene,0.25)',showinfo"`。436F・578Fは隣接フレームを抽出して目視した。209Fと399Fはscene検出と目視の両方。

この映像は版・ギア・操作開始時刻が不明。公式サイトの販促映像で、冒頭はチーム紹介から始まる。前段のルール／ステージカードはこの資料から復元しない。578Fは開始エフェクトの観測であり、Nintendo内部で操作を受け付ける厳密なtickの証明ではない。

## 実装と比較

- `runtime/turf-intro-camera.mjs` が Match.stateT を直接サンプルする。209Fで相手、399Fで自陣へ切り替える。チーム番号ではなくローカルの所属を起点にする。
- 両陣のパッドから前方向を計算し、Z軸に沿わない原典ステージとBravo側にも対応する。カメラだけを変え、Actor座標・発射・衝突・塗り・通信を変更しない。
- ポートレートは正面斜めから緩やかに寄る。自陣カットではスポナー群の後方から前方へ進み、味方の頭が照準を覆わない発射待機視点へ移る。3Dの距離・角度・35度のポートレート画角・456Fの収束・0.35秒の発射後blendは**INKWAVEの表示調整値**。映像から抽出したNintendoのカメラ数値ではない。
- READY/HUDは既存のpause-awareな `intro-presentation.mjs` を使う。既存の安全に文字列化されたSplashtag・名前・番号・バッジを保持し、撮影中のチームだけを画面下の一列へ並べる。209Fで相手へ切り替え、399Fで取り除く。Bossのカードと演出は維持する。
- Matchは578Fでplayingへ入る。GO後の初期待機中も同じ光学視点を保ち、初回発射時に通常の追従へ戻す。マップは既存のdioramaを使う。同tickの照準には既存の `recordAimPose` を更新する。
- QAのintro終了待ちは現在のMatchのフレーム予算を読む。壁時計の既存締切、所有権・paused・live-frame・UI/CSSの拒否条件は保持する。現行UI fixtureは実際の新しいintro関数と名札を実行し、取り除けない名札の負例も残す。

再現: ナワバリを通常開始し、入力せず開始演出を見る。両陣営・回転したパッド配置・30/60/120Hzと途中ポーズ、試合差し替え、GOから初期発射への復帰を検証する。

## 検証

- `node --experimental-vm-modules --test` で開始カメラ・初期スポーン・照準・画角・Splashtag・Opening・intro寿命・Turf leadの関連回帰87件がskipなしで成功。
- 配信生成物に `INKWAVE_BUILT_SITE` を指定し、CameraRig / Match / 照準 / 画角 / 初期スポーン36件を再実行し、skipなしで成功。
- introを実行する撮影用fixtureの契約58件と、実ChromiumのDOM/CSS/所有権・締切の負例8件が成功。
- quick checks、通常の最適化ビルド、startup budgetが成功。
- `node scripts/capture-inkwave-turf-intro.mjs --site _site --map wahoo --evidence-dir <永続保存先>` で実配信Game/Match/CameraRigを16時点で撮影。seed112358、1280×720、low、SwiftShader。専用のsandbox有効ブラウザを使い、生成物全ハッシュを開始前に照合する。比較元main 5b722cba8も同一Wahoo・同じseedで16時点を撮影した。キャプチャは試合をfreezeしたうえで実Game._frameを1/60ずつ実行し、撮影時だけdt=0で描画するため、GPU実時間性能の証拠ではない。

画像と最終集計は `turf-intro-camera-20261030/` に保存する。ソースの論理回帰、配信生成物、実ブラウザは別々の証拠である。

## 残る差分

本家の3Dカメラ・各ステージの個別カメラデータは未取得。キャラクター／スポナーの入場・インクからの変形モーション、名前表示、音楽、GOの図形や飛沫も完全一致を認定していない。現在版のSwitch実機との制御された比較、全原典ステージ・実端末・実オンラインの開始同期は未確認。カットと観測時刻の修正を、本家イントロ全体の完全再現と呼ばない。

[公式映像の要点](turf-intro-camera-20261030/reference.jpg) / [原典Wahooの16時点](turf-intro-camera-20261030/native-after.jpg) / [実ブラウザ数値](turf-intro-camera-20261030/native-after.json) / [集計](turf-intro-camera-20261030/validation.json)。原典16画像を確認し、ページエラー0、578Fでplaying、初期aimからflight／通常追従へ復帰することを確認した。全画面の画素一致や実機FPSの主張ではない。

追加レビュー: 名札の既存セキュリティ処理・メタデータを保持し、表示チームと寿命だけをカメラへ接続。source87／emitted36、intro契約58、実ブラウザUI8、HTTPヘッダー保持4、CI runner契約119が成功した。#1915のHTTPヘッダー検証は既存sealをそのまま残し、新しいintro待ち関数だけを別sealで正確に逆変換して従来の全ファイル検証へ渡す。不完全・重複・無関係の変更とヘッダー後退の負例は失敗する。main #1922の独立したshader代数最適化もmergeで取り込み済み。

[同一Wahooの変更前後](turf-intro-camera-20261030/before-after.jpg) / [基準版の数値](turf-intro-camera-20261030/native-before.json)。これは同一映像時刻のカット構成の比較で、旧版は4.2秒でplayingとなるため後半の試合状態は異なる。画素差や速度を評価する比較ではない。
