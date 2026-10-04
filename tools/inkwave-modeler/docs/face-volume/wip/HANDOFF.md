# INKWAVE V92 作業メモ（顎・首・口・目・肌）

最終更新: 2026-10-03。PR: https://github.com/rhgrive3/actions/pull/42（ブランチ `claude/inkwave-jawline-20261003`、**main にはまだ入れていない**）。

## 大事: 作業場所

- /tmp は再起動で消える（10/03 に 2 回消えた）。作業用リポジトリ・変更は消えない場所に置く。こまめにコミット・プッシュする。
- 道具: `/mnt/workspace/.dev-state/agent-work/scratch/jaw/tools/`（消えない）。
- Blender: `/mnt/workspace/.dev-state/agent-work/scratch/xbin/blender`。参照の絵: `evidence/inkwave-face-volume-20260929/tools/prof_cmp.py` の `P.SHEET`。
- バックグラウンドの処理は `setsid nohup ... < /dev/null &` で走らせる（そうしないとコマンドといっしょに止まる）。
- `rm -rf $変数` は安全チェックで止められる。`rm -f "/tmp/inkjaw-work/$N..."` のように決まった場所で書く。

## 容量（10/03 夜）

- /mnt/workspace には容量の上限がある（表示されない。使っていた量から見て約 100 GB）。いっぱいになると EDQUOT で書けず、ファイルが 0 バイトになる。
- 10/03 に消したもの（約 41 GB）: `agent-work/scratch/.*-00000000.so`（使い捨ての一時ファイル 1144 個、11.5 GB）、`evidence/inkwave-face-volume-20260929` の古い試し（V1〜V89 ほか）、プッシュ済みで変更のない作業用リポジトリ（ink-identity、ink-volume、inkwave-walk、jev の sealed 3 つ）、キャッシュ（inkwave-face-sapiens 4.4 GB、code-audit、pinpoint、huggingface、npm、pip、apt）、10/02 以前の他の作業の evidence。
- 残したもの: Blender 本体（`cache/inkwave-postmigration-refinement`）、J0/T0、`evidence/inkwave-face-volume-20260929/tools`・V90・V91・qa16〜18、`evidence/inkwave-blender-migration`、保存していない変更がある作業用リポジトリ（`checkouts/jev-realgame-final/hex-ida`、`checkouts/inkwave-improvement-loop-20261002`）、Hex 完成キャンペーンと jev の evidence、今日（10/03）のもの。
- 10/03 23:53 にユーザーの指示で消したもの: DOT 系（dot-transfer-20261001、dot-selected-*、dot-extra）5.7 GB、opencode の会話の記録（`xdg/data/opencode/opencode.db*`）6.1 GB、Codex の今日より前の sessions 0.6 GB。合計で約 53 GB あけた。Codex の `thread_history_1.sqlite`（1.3 GB）は Codex が動いているので残した。ユーザー: 「一旦これで削除系は終わり」。
- `checkouts/ink-volume` は /tmp/inkjaw への近道（シンボリックリンク）。evidence の道具がこの場所の参照の絵（sheet_5view.png）を読むため。
- `.so` の一時ファイルはまたたまる。ときどき `find .../agent-work/scratch -maxdepth 1 -name '.*-00000000.so' ! -newermt '<今日>' -delete`。

## 作業のしかた（10/03 夜から）

- 作業用リポジトリは /tmp/inkjaw（再起動で消える）。こまめにコミットして、GitHub の作業用ブランチ `claude/inkwave-jawline-wip` にプッシュする（`git push origin HEAD:refs/heads/claude/inkwave-jawline-wip`）。再起動したら、そのブランチから /tmp に作り直す。
- 道具は `/tmp/jawtools`（`scratch/jaw/tools` の写し、パスを書きかえたもの）。
- シェルの出力が表示されないときは、`{ ...; } > /dev/shm/x.txt 2>&1` にして Read で読む。
- 作業用ブランチの最新: c393171（口 mouth_up、下唇 own_max、below_lip 194、首 8.5 mm、横の光のコード）。このあと首のつなぎ目のすき間を直すコード（neck_widen で重なった点をそろえる）を入れた（まだコミットしていない）。

## プッシュ済み（PR #42、d56f144）

1. `eye_paint`: 目のテクスチャの白目の下（灰ピンク）を白に。ぼやけた光の点を消して、はっきりした白い点を参照の位置に描き直す。`eye_look.keep_white` [0.85, 0.95]、`catch_energy` 0、`cornea.specular` 0.03。
2. 唇の色 `paint_mouth.tint`（[1.064,1.124,1.404]、のちに変更）、`strength` 1.1、`mouth_line` 0.5 / 0.45 mm。
3. 肌の基本の色 [0.5785, 0.265, 0.1244]、ほお紅 max 0.40。
4. `jaw_tuck`: 顎の線（sideR でとった）より下の顔を Shrinkwrap（Nearest Surface Point、Outside Surface、1 mm）で首にのせる。`dive`（線から 4〜12 mm 下で Displace 4 mm 首の中へ、z_front [20,40]）。`jaw_line_smooth`、`jaw_notch_smooth`。
5. `neck_widen` 3 mm（のちに変更）。

## プッシュ前に消えた変更（入れ直すもの）

### コード（`scripts/inkwave_face_volume.py`）

1. `tint_map` の `own = np.clip(own, 0.5, 1.0) ** cfg.get('own', 1.0)` を
   `own = np.clip(own, 0.5, cfg.get('own_max', 1.0)) ** cfg.get('own', 1.0)` に（形がもともと明るい下唇も暗くできる）。
2. （任意）光: `soften_lights` に `energy` {名前: 値} と `side_suns` {energy, up, front, colour}（左右から太陽光を 2 つ足す。`restore_lights` で消す。`eye_look.suns` に名前を足して角膜に当てない）。まだ効果を確かめていない（下の「顔の色」）。
3. 使わないもの: `jaw_tuck.delta_smooth`（Corrective Smooth。うねりが悪化）、`neck_widen.side`（片側だけ太くするとこぶになる）。入れ直さない。

### 値（`analysis/face_volume/params.json`）

- 口:
  - 新しい手順 `mouth_up`（`neck_widen` の前）:
    `{"name":"mouth_up","kind":"warp","after_delta_smooth":true,"protect_lips":false,"vec_mm":[0,2.2,0],"bumps":[{"centre":[0.0,-67.0,108.0],"rx":22.0,"ry":5.0,"rz":12.0}]}`
    （口の切れ目が真ん中で 2 px 低かった。1.9 mm 上がる）
  - `paint_mouth`: `below_lip.y` 190 → 196（下唇がぬられていなかった）、`own_max` 1.3、`tint` [0.92, 1.05, 1.12]。
  - 結果（正面、下唇の Lab の参照との差）: V91 +1.9/+0.8/+4.8、PR 版 +4.1/-0.6/+2.5 → この値で -0.8/+1.4/-0.6。
  - **ユーザーの指摘: 下唇のまわりが少し黒い** → `below_lip.y` 196 は下唇の下の影までぬる。193〜194 をためす。
- 首:
  - `neck_widen` を **左右同じ 8.5 mm**、`y` [-122,-108,-72,-62]（えりの中まで太く。-112〜-100 で細くもどすと、顔のふちが首の外に出て白いかけらになった）。
  - 線を引いて測った首の幅（正面、y 450〜460）: 参照 196〜267 px（71 px）、V91 205〜262（57 px、約 14 mm 細い）、+8.5 mm で 197〜266。
  - 片側だけ（`neck_right` 6 mm）は、正面でこぶになった（ユーザーが指摘）。使わない。
- `jaw_notch_smooth` の強さ（j3）は、正面の輪郭も顎のうねりもほとんど変えなかった。元のまま（0.5 × 60、中心 [25,-95,50]、半径 16/10/16）でよい。

## ユーザーの指摘（10/03 夜）と状態

| 指摘 | 原因 | 状態 |
|---|---|---|
| 口が違う | 切れ目が低い、下唇がぬられていない | `mouth_up` + `below_lip` 196 + `own_max` で直った（入れ直す） |
| 下唇の色が違う | 同上 | 同上 |
| 下唇のまわりが少し黒い | `below_lip` 196 で下唇の下の影もぬった | 193〜194 をためす |
| 首にこぶ（正面） | 片側だけ太くした | 左右同じ 8.5 mm にする |
| 顎に折り目・ガタガタ | 首が細いので、顔を大きく首に引っぱっていた。顔の面のふちの段 | 首 8.5 mm で引っぱりが小さくなる。粘土表示で確かめる |
| 首と頭の間に線 | 顔の面と首の面が交わる所 | 色つきの絵ではうすい。粘土表示ではまだ見える |
| 顔の色が違う | 3/4・横で、ほおの下〜顎の横が参照より L で 5〜8 暗い（明るさの差の地図: 横を向いた面が暗く、前を向いた面が明るい）。光の当たり方の差。ほお紅・髪の影ではない（消してもためした） | 左右から光を足す試し（`sidelight.py`）: 1.4 では弱い、5.0 では明るすぎ。2.5 をためす途中で再起動 |

## 測り方（道具）

- `frontjaw.py DIR..`: 正面の顎の輪郭のずれ（行 422〜447。口の線の行は外す）。
- `border.sh NAME BLEND`: 3/4・横の顔と首のさかいめのうねり（なめらかな曲線からのずれ）。
- `lipmean.py DIR..`: 唇まわりの場所ごとの Lab の差。
- `skinwide.py DIR..`: 顔の肌の色（3 方向、上・中・下）。
- `hit.py -- VIEW x y ..`: カメラの点に何が見えるか（頭の座標）。
- `jt.sh NAME`: 試し（J0 から。色は正式なビルドと少しちがうので、色はくらべない）。`fbb.sh NAME`: 正式な手順で試し（色をくらべるときはこれ）。`final_qa.sh NAME`: V91 から正式なビルド + 全部の検査。
- `compose.py OUT A B`: 参照 | A | B の比較画像。

## 次にすること

1. 消えない場所に作業用リポジトリを作り直す（PR のブランチから）。
2. コード 1（`own_max`）と値（口・首 8.5 mm・y）を入れ直す。`below_lip` 193/194 をためす。
3. 顔の色: 横の光 2.5 をためす（`sidelight.py`）。よければコード 2 を入れる。
4. 正式なビルド + 検査（`final_qa.sh`）。線を引いた画像（首の幅、顎）と比較画像で確かめてから、ユーザーに見せる。
5. README の V92 の節に、口・首・光を書く。コミット・プッシュ。

## 10/04 未明: 首と顎（線を引いてくらべた結果）

道具: `docs/face-volume/wip/tools/trace.py`（参照=水色、モデル=赤の輪郭を重ねる。正面と横。参照は肌の色で切り出す。横のあごの下は列ごとに「いちばん下の肌」）、`neckcmp.py`（数で）。

- 正面の首（y 446〜454）: 参照 197 / 266 px。V91 205 / 271。首を左右同じに +8.5 mm（B0）では 197 / 279 → 絵の右（頭の x>0）が 13 px 外に出てこぶに見えた。
  → `neck_widen`: `lateral` 1.0（横の向きだけ）、`mm_side` [8.5, -5.0]（x<0 は太く、x>0 は細く）、`x_fade` 15。これで 197 / 266（参照と同じ）。
- 横: あごの下の輪郭は参照と同じ（x 2030 から前）。首の前のふち（456〜466 の行）は首ではなく服のえり（モデルのえりが参照より高い。服なので触らない）。
- 横で「90 度に曲がる」所: 参照のあごの下は首に近づくと下がる（x 2030: 446、2025: 448、2020: 454）。モデルは逆に上がっていた（447 / 445 / 444）。
  → 新しい手順 `chin_neck_fillet`（Warp、下へ、bump 中心 [0,-97,42]、半径 38/7/14、`front_only` false、`jaw_tuck` のあと）。9 mm で 2020: 448。12 / 15 mm をためし中（F12, F15）。
- 顎の角のするどい折れ目: `jaw_tuck.depth` 4 → 8（dive は from 8, len 8）でやわらかくなった（R1）。
- あごの下の小さなかけら（正面 205,440）は、首を前にもふくらませたときに出た。`lateral` で首の前をふくらませなければ出ない（要確認）。
- 首のつなぎ目のすき間: `neck_widen` で重なった点をそろえる処理を入れた（直った）。

作業用ブランチの最新: ebf282f（params は F9 の値）。
- 10/04: `chin_neck_fillet` 15 mm で横のあごの下が参照とほぼ同じ（x 2020: 453、参照 454）。でも `jaw_tuck` のあとに置くと、首の上の面まで下がって、うすい切れはしがギザギザに出た。`jaw_tuck` の前に置く（G15）と、いちばんきれい。dive z_front [35,55]（H15）は正面でひどいギザギザ。G15 の値を params に入れた。次: dive mm 7（G7、G7b）をためす。
- 10/04: G7（dive mm 7）が正面のあごの下でいちばんきれい。G7 の値を params に入れ、正式なビルドと検査（Q7）。
- 10/04: 正式な版 Q7（G7 の値）の正面で、あごの下に白っぽい帯とギザギザが出た（ユーザーも指摘「顎の下に変なん」）。原因は `chin_neck_fillet`（あごの下の面を下げると、前を向いて光り、首と交わる）。この方法はやめる。
- ユーザー指摘「正面で首が曲がっている」: 首の左のふちが下ほど内側（197 → 202）。`neck_widen` を下（えりの近く y -108〜-122）で弱めていたため。y を [-132,-118,-72,-62] にのばす試し（Y1、Y2）。
- 代わり: 首の前の上の方を前に出す（`neck_widen.lean` +8 / +12 mm、y [-102,-90]）。あごの下の面は動かさない（Z1、Z2）。
- 10/04: Z1（fillet なし、`neck_widen.lean` +8 mm y [-102,-90]、`neck_widen.y` [-132,-118,-72,-62]）がいちばん良い。正面: あごの下の帯・ギザギザなし、首の左のふちがまっすぐ（197）。横: あごの下 450/449/444（参照 454/448/446）。残り: 横の首の表面の小さなしわ（首を動かす量が向きで変わるため）→ `neck_widen.smooth`（Blender Smooth）をためす（Z1s 0.5×10、Z1t 0.5×30）。params は Z1。
- 10/04 朝（再起動のあと）: 作業用リポジトリは消えない場所 `/mnt/workspace/.dev-state/agent-work/checkouts/inkjaw`（/mnt/workspace/actions の worktree）。/tmp/inkjaw・/tmp/inkjaw-work・/tmp/jawtools はそこへのリンク（再起動で消えたら `ln -sfn` で作り直す。中身は消えない: 作業は `scratch/inkjaw-work`）。
- ユーザー: 「拡大するとまだガタガタ。線を引けば分かる。顎から首が滑らかなカーブじゃない」。新しい道具 `curve.py OUT DIR..`（頭の中の点から放射状に輪郭をとり、参照=水色・モデル=赤で描く。正面左右と横）。
- 原因: 首（BODY_torso）の輪が約 9 mm おき（辺 9 mm）。顎と首の角は首の上にあり、その輪でしか曲がれない（顔も jaw_tuck で首にのるので同じ）。
  → `neck_widen.subdivide` {levels, smooth}（編集モードの Subdivide、body_shape のおへそと同じやり方）と `neck_widen.cove` {mm}（首の点を、真上の顔の下面までの距離 h で、R - sqrt(R² - (R-h)²) だけ法線の向きに出す = 半径 R の丸い内角）。試し S1（細分化だけ）、C8、C12（lean のかわりに cove）。
- 10/04: Z1 を線でなぞった（curve.py）: 正面は顎の線と首のたての線が角でぶつかる。横は顎の下・首のすぐ前に HEAD_face のベロ（真ん中、y -100〜-107、z 45〜50）が首にのらずにたれている（idmap で確認）。
- 細分化の `smooth` 1.0（bmesh）は首にたてのしわとかけらを出した（S1、C8、C12 は失敗）。`smooth` 0 + `neck_widen.smooth` 0.5×10（S2）はきれい。首の法線（custom normals）は自動の法線と同じ（0.04 度）なので、細分化しても問題ない。
- 次: S2 + cove（CA 8 mm + lean、CB 12 mm + lean、CC 12 mm lean なし）。
- 10/04: cove + lean（CA、CB）はトゲが出る（首が顔をつきぬける）。CC（cove 12、lean なし）: 横のベロは消えた。でも 3/4 で首の横がでこぼこ、横で顎の線にそって段。高さ h（光線）がばらつくため → `cove.weight_smooth`（Blender の重みのならし）を足した。試し: CD（cove 16）、CE（ならし 30）、CF（重みならし 10）、CG（重みならし 30）。
- 10/04: ユーザー追加: 横で耳の下から首の前への線（顔の面のはしの段）が見える。参照は線がない。
  - `neck_normals`（新しい手順、いちばん最後）: Data Transfer で首の法線を顔の jaw_tuck の部分へ。効果は小さい。
  - `jaw_tuck.depth` 20（dive from 20）= N3: 3/4 の固い段の線がやわらかい影になり、横のあごの下のベロも消えた。今いちばん良い。
  - 正面の角: 角の上は顔（z 62）、下は首（z 23）。重なって角に見える → `floor_fillet`（新しい手順、jaw_tuck の前）: あごの底で首から d mm の点を R - sqrt(R² - (R-d)²) 下げる（Warp）。試し F8、F12、F12s（重みならし 5）。
- 10/04: `floor_fillet`（あごの底を下げる）は首にトゲ → やめる（コードは残すが使わない）。
- `neck_widen.lean.profile` "circle"（四分の一だ円）と `neck_widen.flare` {mm, y}（首の横を同じ形で広げる、|法線 x|）。K1（lean 8 [-104,-90] + flare 4 [-104,-92]）・K2（10 / 6）: 正面の角が丸くなった（frontL のうねり max 1.22 → 0.81 px）。3/4 もきれい。横の角は変わらない: あごの底は y -99〜-100 なのに lean の上のはしが -90。→ K4（lean 7 [-107,-99]）、K5（lean 10 [-110,-99]）。
- 10/04: 首と顔の色の段（横で 首が R+11 G+15 明るい）→ `neck_skin`（首のえりより上 y > -135、|x| < 70 に、顔の絵のさかいめの色と顔の材質の値をもつ材質 `skin_neck`）。段は G 14.5 → 5。params = K5 + neck_skin（5cf8b15）。正式なビルド Q1（V92 マスターの写し V92master.blend から、final_qa.sh は BASE / BASEGLB で土台を変えられる）。
- 大事: main の PR #42（e187c6a）は 10/03 09:35 に、前の版の V92（8240029）でマージされた。そのあとの直し（eye_paint、唇、肌、jaw_tuck dive、neck_widen）は main にない。次の PR（V93）で全部入れる。
- 10/04 午後: 正式な版 Q1 で neck_skin は首を赤くし、つや 1.0 で首のふちが光った。体の肌のまま（Q1n）が参照の首の色にいちばん近い（正面 167,112,78 / 参照 166,113,79）→ neck_skin はやめる。
- ユーザー（紫の線、2 枚目）: 「首と頭の境目が全然違う。頭蓋骨の構造を理解していない」。参照の境目 = 下あごの骨のふち: 耳たぶのすぐ下（sideR 1998,404 = 頭 z 23, y -64）からまっすぐ下（z 26, y -78）、顎の角、前へ（z 32,-86 → z 44,-94）。モデルは耳の後ろ（1940,407）から首の前へななめ 1 本（たてのふちと角がない）。
  - 見える境目は jaw_tuck の線ではなく、線から約 15 mm 下・後ろ（depth 20 の重みのため）。
  - 試し: J1（参照のふちを 10 mm 内へずらした線、depth 20）、J2（6 mm、depth 12）、J3（ずらさない、depth 20）。
- J3（線を参照のふちに置く、上は y -58 の横線、z_ramus [10,30]）はきれい。z_ramus [-10,0]（J4〜J6）は首にかけら。J8 = 線を 5 mm 内へ（上の横線は -58 のまま）、z_ramus [10,30]: 顎の後ろのたてのふちと角が参照の線（`jawborder.py`）にほぼ合う。首の下に小さなかけら → dive の試し J9（len 14）、J10（mm 12）、J11（from 14）。p_J8.json を wip に置いた。
- J9〜J11: かけら 1 つが残る（首の後ろ寄り、顔の面のくしゃっとした三角が法線の向きで外へ出る）。`jaw_tuck.dive.method` "shrinkwrap"（Shrinkwrap Above Surface、offset -mm = 首の法線で沈める）で消えた（J12 = J9 + これ）。J12 を params に入れた。使わないコード（cove、floor_fillet、neck_skin）は消した。正式なビルド Q2。
- 速さ（ユーザー: 1 回 15 分は遅い）: 色つき Cycles が 1 方向 6〜7 分。形は粘土（25 秒）で見る。`jtc.sh`（LOOKS=clay で粘土だけ）。提案中: 顎だけの切りぬき描画、顎の手前までの途中保存から始める。
- 大事: 試しのビルド（jt.sh、J0 から）は lash_rebuild をしないので、顔の材質が古い `INKWAVE_face_skin_lash`（古い肌の色・SSS 0.07・つや 1.0）のまま。正式なビルドは最後の lash_rebuild で顔を `skin_b27050`（首と同じ）にもどす。だから試しの色は正式とちがう。色の比較は正式なビルドでだけする。
- 正式な版で残った「耳の後ろから首へのななめの線」は色ではなく形の折れ目（顔が首にのり始める所、頭 |x| 35〜46、y -74〜-85、z -30〜21）→ 新しい手順 `ramus_back_smooth`（Smooth 0.5、中心 [40,-79,-5]、半径 14/14/36、150 回、jaw_tuck のあと）= R4。P1〜P3（上の線や depth_back を変える）は折れ目が強くなった。params = R4。正式なビルド Q3。
- 10/04 夕: ユーザー「首に参照にない起伏」= 首のたてのすじ。lateral / flare の重み |nx|（1 乗）が首の前の真ん中で V に折れるため → 2 乗（lateral 2、flare.power 2）+ smooth 30 = X2。params = X2。正式なビルド Q4。README に V93 の節。
- 10/04 夜: Q4（X2）を master V93 にして PR https://github.com/rhgrive3/actions/pull/316（ブランチ claude/inkwave-jaw-neck-v93、main から、wip なし）。マージはユーザーの OK 待ち。PR 用の作業ツリー: checkouts/inkjaw-pr。
- 10/04 夜（再起動のあと、ユーザー「go」= 試しを速く）: マシンがすいていればモデル作りは 39 秒（face_volume 34 + body_shape 5）。前の 5.5 分は同時に走らせた描画で混んでいたため → 途中から作り直す仕組みは作らない。時間の大部分は Cycles（1 方向 6〜7 分）。
  - `wide_render.py` に `JAWCROP=1`（Cycles を顎・首の枠だけ描く。絵の大きさは同じ、外は黒）。evidence/tools のものを直し、写しを wip/tools に置いた。
  - `fast.sh NAME`: ビルド + 3 方向の粘土（全体）と色つき（顎だけ）を同時に → 65 秒（前は 15〜20 分）。輪郭の数は全体描画と同じ（curve.py で確認）。`NOBEAUTY=1` で粘土だけ。
  - `stopjob.sh` は自分と呼んだシェルを止めない（前は名前がコマンドにあると自分を止めた）。
- 10/04 夜（ユーザー: 顔の色 / 鼻先の形 / 下唇の両はしが茶色）:
  - 速い試しの顔の材質を正式と同じに（`finalmat.py`、fast.sh の中）。描画の `CROP=face`（顔全体の枠）。`ldiff.py`（L/a/b の差の地図）、`score.py`（平均の差）、`lipzones.py`。
  - 顔の色: 上の方が明るくオレンジ、下の方が暗く色がうすい（光の色の片寄り: KEY が暖色、FILL と空が寒色）。`lights.colour`（KEY [1,0.97,0.94]、FILL 白）、`lights.world` 1.0（0.8）、`energy` KEY 2.0 FILL 1.0、`side_suns` 1.0（up -0.4、front 0.6 = 下の前から）。差の合計 10.0/12.9/11.5 → 8.2/11.6/10.9（正面/3/4/横）。光だけではこれ以上へらない（形と参照の光のちがい）。
  - 下唇の両はしの茶色 = 唇のぬり（板 HEAD_skin_08 を消すと消える）。`below_lip` rise 10、half_width 17、fade 6（U3）。`brighten`（ぬりで明るくする）はむらが出たのでやめた（コードも消した）。
  - 鼻先: `paint_nose` の spots をなくし floor 0.06、full 0.2、strength 1.3（N5）: 正面の小鼻の輪郭と鼻のまわりの影、3/4・横の小鼻の溝が出た。
  - params = N5。正式なビルド Q5。
- 10/04 夜: Q5 = master V94。PR https://github.com/rhgrive3/actions/pull/401（ブランチ claude/inkwave-skin-lips-nose-v94）。マージはユーザーの OK 待ち。
- 10/05: ユーザー「鼻の横に黒いシミ」= 小鼻のわきの灰色の影（paint_nose desaturate 0.7 で灰色）→ desaturate 0.4、strength 1.0（V2）。正式 Q6 で検査合格、PR #401 を更新。左ななめ前・左横の絵をユーザーに出した（顎のレビュー待ち）。
- 10/05: ユーザー「右から見たときにまだしみ」= 小鼻の上の面（鼻の穴の上）の暗いかたまり。正面から投影したぬりが、横を向いた小鼻の面ににじむ。→ paint_nose.facing [0.35,0.65] → [0.6,0.9]（正面を向いた面だけ）+ 新しい設定 facing_keep（鼻の穴 2 つと鼻先の下は向きに関係なくぬる。下を向いているので、facing だけだと鼻の穴がうすくなった）= K1。正式なビルド Q7。
- 10/05: ユーザー「まだある（右から）」: 鼻のぬりだけの差の地図（今の設定で paint_nose を V93 / なし にした NA・NB・NC）→ 鼻の穴から小鼻のふちへ上るすじ。正面の小鼻の輪郭のぬりが、右から見える小鼻の面にのる。spots を V93 にしても floor 0.06 だと鼻の穴のまわりの影の輪がぬられて残る（SA、SB）。→ paint_nose を V93 にもどす（すじなし）。facing_keep のコードは消した。
- ユーザー「首も直して」: 左横の首の後ろが 10〜14 px 後ろ。左横のはしは首の後ろの真ん中〜左寄り（x -4〜+20）、右横は真ん中〜右寄り（x -34〜-5）で、真ん中を共有 → 両方 0 にはできない（参照の左右の絵が少し合わない）。body_shape nape に `profile_left`（左半分の量、マイナス = 前）、`x_mix` [-18, 3]（真ん中で切りかえ）、`x_left` [45, 75]（左のよこへの弱まり）= NP8。ずれ（nape_gap.py）: 右 平均 1.9 → 3.2（最大 7.0）、左 9.7 → 3.9（最大 7.0）、全体の最大 14.3 → 7.0。正式なビルド Q8。
- 10/05: ユーザー「赤はまだ合ってない」: 前の比べ方（nape_gap.py）は、参照の線が手でなぞった古い値、モデルは刈り上げの髪の層なし。新しい道具 `nape2.py`（参照の輪郭を自動でとる。首の行は首の中から、上の行は刈り上げの髪の中から外へ。モデルは頭+首+HAIR_hair の形: wide_render k=2.2 LOOKS=mask_all ONLY_MASK_ALL=headnames）。これで見ると NP8 は左の刈り上げの所（y 380〜405）が 7〜13 px 前に入っていた（左の量を頭の後ろまで減らしていた）。→ 左の量を減らすのは首（頭の y -80 より下）だけ = NP9。右 首 -4〜+4 px、左 0〜+5 px、上の所は前の版と同じ。正式なビルド Q9。
