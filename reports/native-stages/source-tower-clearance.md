# 原典ステージの局所ヤグラ経路・入力搭乗

表示メッシュから推定する INKWAVE のヤグラは、全経路で source 三角形への衝突を避け、通常のプレイヤーの走行・ジャンプで搭乗できる支持床を持つ。対向する source スポーンから導く方向を局所目的物に使用する。原典頂点を回転・移動せず、接地と乗員資格の条件を維持する。11.3.0 の実際の経路、リフト高さ、チェックポイント、スポーン transform は未確認。

`nativeTowerClearance` は BVH から候補を得て三角形 SAT を行い、deck の全回転、人体半径、足元から頭上、pole と segment 間の移動体積を保守的に検査する。中心点だけの ray に代え、狭い roof と途中にある ceiling を検出する。source の ceiling や OBJ 属性を削除して通過させない。

`nativeTowerBoarding` は両チームから到達できる実 source 床を選び、live Actor のジャンプ初速・重力・走行・ledge assist を使って通常の入力による局所 approach を推定する。経路の各 node に `tower.boarding.approaches` を保存する。既存 lift3.3 を満たせなければ、支持床と全 sweep が確認できる局所 lift1.2/.4、deck half-size1.2/.8 を順に検討する。これは RankedWorld の既存サイズ範囲内のローカル調整であり、本家数値の再現ではない。vehicle が通る経路から human-only `type:'climb'` を除く。中央の両側に移動区間を要求する。

物理による deck 支持と、床からの入力搭乗を区別する。単体検証は通常 Actor の移動・ジャンプを30/60/120Hzで実行し、初期速度0の source 床から deck に着地する。実ブラウザ checker は通常 Playwright キーボード W・Space を使い、接地・ground hit・deck block・controlling team を確認する。再現のため床上に置くが、deck 上への直接配置や上昇速度の注入を搭乗証拠にしない。全 waypoint と各 segment の3中間地点での直接 capsule 支持は別の補助検証である。

## ヤガラ市場の限定的な Tower 非対応

固定 KiTrix の `Vss_Yagara` は135オブジェクトで、Pnt/Var/Vlf/Vgl/Vcl/Tcl として選べるルール層がない。Vlf + common の比較は元選択と同じ stream を保持し、別の ranked geometry を回収できなかった。原点付近の float boat/buoy/debris は配置未確認の reusable object 候補であり、除外実験を source placement の確定として出荷していない。

float object 衝突を外す私的比較でも、元の対向高床スポーンは現行歩行グラフで別成分になる。最近接候補は水平5.83・高さ差4.5 source units。paintable wall と単独ジャンプの証拠はあるが、複合 jump/climb の人間経路や本家 arena が物理的に分断していることを証明しない。双方を同じ岸に移す校正は採用しない。原典 buffer、対向 pad、他4モードを保ち、現在の source-derived walking/tower route を確認できない Tower だけ `supported:false / source-route-unverified` とする。

画面は理由を表示し、map/rule の変更で START 状態を更新する。offline/public API/menu/direct online/host/incoming start は live world・actors・match flow・authoritative room を変更する前に拒否する。incoming refusal は接続を閉じない。未宣言の runtime failure を skip しない。一般 checker は、この厳密な catalog 状態のみ明示的な負の証拠として扱い、その他のステージに5モードの成功を要求する。

検証の数値と、直接配置による支持検証・通常入力による搭乗検証の区別は [source-tower-clearance-verification.json](source-tower-clearance-verification.json)。全ての原典対応ステージの現行支持ルールが実対戦を通り、Hagglefish の負の検証は通常 quit→main→PLAY→ルール・ステージの物理クリックで行った。

## 比較範囲と検証

本家参照版はスプラトゥーン3 11.3.0。ブキ・ギアは既存 INKWAVE profile のままで、移動、泳ぎ、塗り、跳躍値を変更していない。変更は推定する動的目標物の配置・経路と availability の制御である。本家の歩行微入力、加速、停止、反転、射撃中速度、ジャンプ、壁登り、カメラ、搭乗時間、通信や実機 FPS は未計測。Node、SwiftShader ブラウザ、本家実機の証拠を区別する。

再現は `patches/native-stages/tests/tower-source-clearance.test.mjs`、`tower-input-boarding.test.mjs`、`native-ranked-basis.test.mjs`、`source-rule-start.test.mjs` と `scripts/check-inkwave-native-{stages,online}.mjs`。private prepared source が必要な検証では `INKWAVE_NATIVE_STAGE_ASSETS` を設定する。browser GPU 検証は共通 lock の下で直列に行う。元 assets と screenshot は ignored storage にのみ保存する。
