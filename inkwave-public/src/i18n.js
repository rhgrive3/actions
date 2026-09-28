// INKWAVE — localisation. Japanese is the default; English stays available (settings → ゲーム → 言語).
//
//   t(text, vars)   English source text → current language. Unknown strings pass through unchanged, so a missing
//                   entry can never break the UI. `{name}` placeholders are filled from `vars`.
//   Touch-aware:    entries in TOUCH_* are used instead while the player is on a touch screen (no [SHIFT] / [TAB]
//                   keycaps on a phone or iPad).
//   localizeData()  renames the shared content tables (weapons, stages, specials, looks…) in place at boot.
import { WEAPONS, SUB, SPECIALS, MAPS, DIFFICULTY, TEAM_PALETTES, COLORBLIND_PALETTE, TEAM_NAMES } from './config.js';
import * as LOOK from './game/character-style.js';
import { touchPrimary } from './core/device.js';

const readLang = () => {
  try { const s = JSON.parse(localStorage.getItem('inkwave.settings') || 'null'); if (s && (s.lang === 'en' || s.lang === 'ja')) return s.lang; } catch { /* private mode */ }
  return 'ja';
};
export const LANG = readLang();
export const isJa = LANG === 'ja';
if (typeof document !== 'undefined') document.documentElement.lang = LANG;

/** Current prompt style: 'touch' | 'kbm' | 'pad' (the input layer keeps this in sync with the last-used device). */
export const TXT = { mode: touchPrimary ? 'touch' : 'kbm' };
export function setTextMode(mode) { if (mode === 'touch' || mode === 'kbm' || mode === 'pad') TXT.mode = mode; }

// ------------------------------------------------------------------------------------------------ Japanese
const JA = {
  // ---- boot / loading
  'Mixing ink…': 'インクをまぜています…', 'Mixing the ink…': 'インクをまぜています…', 'Building the plaza…': 'ステージをつくっています…',
  'Filling the harbor…': '港に海水を入れています…', 'Teaching squids to swim…': 'イカに泳ぎを教えています…', 'Tuning the tentacles…': 'ゲソを整えています…',
  'Warming up…': 'ウォーミングアップ中…', 'Ready!': '準備OK！', 'TIP': 'ヒント',
  'Something went wrong while loading: ': '読み込み中にエラーが発生しました: ',
  // ---- tips
  'Swim in your own ink to zip around and refill your tank.': '自分のインクの中をイカで泳ぐと、すばやく動けてインクも回復するぞ。',
  'Hold [SHIFT] to dive into your ink — you are nearly invisible while swimming.': '[SHIFT] 長押しでインクにもぐれる。泳いでいる間は相手からほとんど見えないぞ。',
  'Enemy ink slows you down and chips away at your health. Paint over it!': '相手のインクの上では足が遅くなり、ダメージも受ける。塗り返そう！',
  'Swim up any wall you have inked to reach high ground.': '自分で塗った壁はイカで登れる。高台を取りに行こう！',
  'Only turf counts when time runs out. Splats just buy you space.': '勝敗を決めるのは塗った面積だけ。相手をたおすのは塗る場所を確保するためだ。',
  'Your special gauge fills as you ink. Press [F] when it glows!': '塗るとスペシャルゲージがたまる。光ったら [F] で発動！',
  'A Splat Bomb costs most of your tank — throw it where it claims the most turf.': 'スプラッシュボムはインクを大きく使う。いちばん多く塗れる場所に投げよう。',
  'Chargers splat in one fully-charged shot. Keep moving and use cover.': 'チャージャーはフルチャージ一発でたおしてくる。止まらず物陰を使おう。',
  'Rollers paint huge stripes. Flick the roller to splash foes at range.': 'ローラーは太い帯で塗れる。振ると離れた相手にもインクが届くぞ。',
  'Low on ink? Dive in, refill, then push again.': 'インクが少ない？ もぐって回復してから攻めなおそう。',
  'Hold [TAB] to open the big map and spot unpainted turf.': '[TAB] 長押しでマップを開いて、塗れていない場所を探そう。',
  // ---- common
  'Select': '決定', 'Back': 'もどる', 'Title': 'タイトル', 'Adjust': '調整', 'Tabs': 'タブ切替', 'Move': '移動', 'Default': '初期値',
  'ON': 'ON', 'OFF': 'OFF', 'On': 'ON', 'Off': 'OFF', 'VIEW': '見る', 'YOU': 'あなた', 'READY': 'OK', 'READY!': 'OK!', 'GO': 'GO', 'VS': 'VS',
  // ---- title / main
  'PRESS ANY BUTTON': 'ボタンを押してスタート', 'PRESS ANY KEY': 'キーを押してスタート', 'or click to start': 'またはクリック',
  'TAP TO START': 'タップしてスタート', ' · an original turf-war shooter': ' ・ オリジナルのナワバリ系シューター',
  'PLAY': 'バトル', 'Turf War · 4 v 4': 'ナワバリバトル ・ 4対4', 'LOADOUT': 'ブキ', 'LOCKER': 'ロッカー', 'SETTINGS': 'オプション',
  'HOW TO PLAY': 'あそびかた', 'CREDITS': 'クレジット', 'LV': 'Lv', 'WINS': '勝利', 'MATCHES': 'バトル', 'NEXT RANK': '次の称号',
  'CURRENT LOADOUT': 'いまのブキ',
  'Pick a stage, day or dusk, and jump into a 4 v 4 Turf War': 'ステージと時間帯を選んで、4対4のナワバリバトルへ！',
  'Choose your weapon: stats, sub and special for every kind': 'ブキを選ぼう。性能・サブ・スペシャルをチェック',
  'Choose your squidkid — tentacles, headgear, eyes, skin and outfit': 'キャラの見た目を変えよう（ヘア・アタマ・目・肌・ふく）',
  'Controls, video, audio and gameplay options': '操作・画質・サウンド・ゲームの設定',
  'The rules in 30 seconds, plus every control': '30秒でわかるルールと操作方法',
  'The squidkids and code behind INKWAVE': 'INKWAVE をつくった仲間たち',
  // ---- ranks
  'Fresh Recruit': 'ルーキー', 'Turf Scrapper': 'ナワバリファイター', 'Ink Slinger': 'インクスリンガー', 'Splat Veteran': 'ベテラン', 'Tide Legend': 'レジェンド',
  // ---- setup
  'DAY': '昼', 'DUSK': '夕方', 'Bright sun, crisp shadows.': '明るい日ざしと、くっきりした影。', 'Low sun, long shadows, harbour lights.': '傾いた夕日に長い影、港に灯るあかり。',
  'LAYOUT': '全体図', 'TIME OF DAY': '時間帯', 'BOT SKILL': 'ボットの強さ', 'MATCH LENGTH': 'バトルの時間', 'WEAPON': 'ブキ', 'SQUIDKID': 'キャラ',
  'START!': 'スタート！', 'TURF WAR': 'ナワバリバトル', 'Pick a stage and the time of day · 4 v 4 against bots': 'ステージと時間帯を選ぼう ・ ボットと4対4',
  'STAGES': 'ステージ', 'Stage': 'ステージ', 'Day · Dusk': '昼・夕方', 'STAGE': 'ステージ',
  'Relaxed bots with shaky aim. Great for learning the ropes.': 'エイムがゆるいのんびりボット。操作に慣れるのにぴったり。',
  'Balanced bots that push turf and fight back.': '塗りも撃ち合いもこなすバランス型のボット。',
  'Sharp, aggressive bots that punish mistakes. Bring your A-game.': 'スキを見逃さない攻撃的なボット。本気でいこう。',
  '{n} SEC': '{n}秒', '{n} MIN': '{n}分',
  // ---- locker
  'SQUIDKIDS': 'キャラ', 'HAIR': 'ヘア', 'FACE': 'かお', 'OUTFIT': 'ふく', 'HAT': 'アタマ', 'EYES': '目', 'BROWS': 'まゆ', 'SKIN': '肌',
  'TENTACLE STYLE': 'ヘアスタイル', 'HEADGEAR': 'アタマ', 'SKIN TONE': '肌の色', 'NAME': 'なまえ', 'WEARING': 'そうび中', 'SHUFFLE': 'おまかせ',
  'DONE': '完了', 'Saves automatically': '自動で保存されます', 'DRAG TO SPIN': 'ドラッグで回転', 'SPIN': '回転',
  'Choose your squidkid, then make it yours': 'キャラを選んで、自分らしくカスタマイズしよう', 'Wear': 'そうび', 'Shuffle': 'おまかせ', 'Done': '完了',
  'CHOOSE YOUR SQUIDKID': 'キャラを選ぶ', '{n} LOOKS': '全{n}種', '{n} OPTIONS': '全{n}種', '{i} of {n}': '{n}種中 {i}番目',
  // ---- loadout
  'EQUIPPED': 'そうび中', 'vs ': 'くらべる: ', 'SUB WEAPON': 'サブウェポン', 'SPECIAL': 'スペシャル', 'NEW!': 'NEW!',
  'Costs {n}% of your ink tank. Hold to aim, release to throw.': 'インクタンクの{n}%を使う。長押しでねらい、はなすと投げる。',
  'Turf points to fill the special gauge': 'スペシャル発動に必要な塗りポイント',
  '{n} weapons · every one comes with a sub and a special': '全{n}種 ・ どれもサブとスペシャルつき', 'Equip': 'そうび', 'Browse': 'えらぶ',
  'Range': '射程', 'Damage': '攻撃力', 'Fire rate': '連射力', 'Mobility': '機動力', 'Ink coverage': '塗り性能',
  // ---- settings
  'Controls': '操作', 'Video': '画質', 'Audio': 'サウンド', 'Gameplay': 'ゲーム', 'Touch': 'タッチ',
  'Mouse sensitivity': 'マウス感度', 'How far the camera turns for each bit of mouse movement.': 'マウスを動かしたときにカメラが回る量。',
  'Controller sensitivity': 'Rスティック感度', 'Camera turn speed with the right stick.': '右スティックでカメラが回る速さ。',
  'Invert vertical look': '上下操作のリバース', 'Push up to look down, like a flight stick.': '上に動かすと下を向く、飛行機のような操作にします。',
  'Aim assist (controller)': 'エイムアシスト（コントローラー・タッチ）',
  'Gently slows and steers your aim onto nearby rivals when you play with a controller.': 'コントローラーやタッチ操作のとき、近くの相手に照準が少しだけ吸いつきます。',
  'Aim assist for mouse': 'マウスでもエイムアシスト', 'Also apply a lighter aim assist when aiming with a mouse. Off by default.': 'マウス操作にも弱めのエイムアシストをかけます（初期設定はOFF）。',
  'Controls reference': '操作方法の一覧', 'Every keyboard, mouse and controller binding in one place.': 'キーボード・マウス・コントローラー・タッチの操作をまとめて確認。',
  'Graphics quality': '画質', 'Low': '低', 'Med': '中', 'High': '高', 'Ultra': '最高',
  'Resolution scale, shadow detail, anti-aliasing and particle counts.': '解像度・影・アンチエイリアス・エフェクト量をまとめて調整します。',
  'Field of view': '視野角', 'Wider shows more of the turf around you.': '広くするとまわりがよく見えます。',
  'Shadows': '影', 'Soft sun shadows. Turn off for extra speed on older machines.': '太陽のやわらかい影。古い端末ではOFFにすると軽くなります。',
  'Bloom glow': '光のにじみ', 'A soft glow around bright ink and specials.': '明るいインクやスペシャルがふんわり光ります。',
  'Show FPS counter': 'FPSを表示', 'Displays frames per second in the corner during matches.': 'バトル中、画面の端にフレームレートを表示します。',
  'Master volume': '全体の音量', 'Overall loudness of everything.': 'すべての音の大きさ。', 'Music': '音楽', 'Menu and battle soundtrack.': 'メニューとバトルのBGM。',
  'Sound effects': '効果音', 'Weapons, splats, voices and menu sounds.': 'ブキ・インク・ボイス・メニューの音。',
  'Camera shake': '画面の揺れ', 'Screen shake from explosions, slams and hits.': '爆発や攻撃を受けたときの画面の揺れ。',
  'Vibration': '振動', 'Controller rumble for hits, splats, bombs and specials. Only while you play with a controller.': 'ヒット・ボム・スペシャルで振動します（コントローラー・対応スマホ）。',
  'Colorblind-safe inks': '色覚サポート', 'Always use high-contrast yellow vs. blue team inks.': 'いつも見分けやすい黄色と青のインクで戦います。',
  'Minimap': 'ミニマップ', 'Show the turf minimap in the corner during matches.': 'バトル中、画面の端に小さなマップを表示します。',
  'Default bot skill': 'ボットの強さ', 'Starting difficulty for new matches.': 'バトルを始めるときの相手の強さ。',
  'Default match length': 'バトルの時間', 'How long each Turf War lasts.': 'ナワバリバトル1回の長さ。',
  'Language': '言語 / Language', 'Menu and HUD language. The game reloads to apply it.': 'メニューと画面表示の言語。切り替えると再読み込みします。',
  'Look speed, invert, aim assist and the full control reference.': 'カメラ感度・リバース・エイムアシストと操作一覧。',
  'Quality tier, field of view and screen effects.': '画質・視野角・画面効果。', 'Master, music and sound-effect levels.': '全体・音楽・効果音の音量。',
  'Shake, vibration, colour-safe inks, minimap and match defaults.': '揺れ・振動・色覚サポート・ミニマップ・バトルの初期値・言語。',
  'Gyro aim, swipe speed and the on-screen buttons.': 'ジャイロ操作・スワイプ感度・画面ボタンの配置と大きさ。',
  'RESET TO DEFAULTS': '初期設定にもどす', 'PRESS AGAIN TO CONFIRM': 'もう一度押すとリセット', 'Changes save automatically': '変更は自動で保存されます',
  'Saved!': '保存しました！', 'Changes apply instantly': '変更はすぐに反映されます', 'Reset': 'リセット',
  'Restore every setting to its original value.': 'すべての設定を最初の状態にもどします。',
  // ---- touch / gyro settings
  'Gyro aim': 'ジャイロ操作', 'Tilt and turn the device to aim, like Splatoon handheld mode. Swipes still work.': '本体を傾けたり回したりして照準を動かします（Switch携帯モードのジャイロと同じ感覚）。スワイプ操作も併用できます。',
  'Gyro sensitivity': 'ジャイロ感度', 'Same scale as the Switch game: 0 = 132° of device turn per 360°, +5 = 110°, −5 = 278°.': '本家と同じ −5〜+5 の目盛り。0 で本体を132°回すと一周、+5 で110°、−5 で278°。',
  'Gyro vertical': 'ジャイロ上下', 'Normal: tilt the top toward you to look up (like a window). Invert flips it.': 'ノーマル：本体の上側を手前に倒すと上を向きます（窓をのぞくような操作）。リバースで逆になります。',
  'Gyro horizontal': 'ジャイロ左右', 'Normal: turn the device left to look left.': 'ノーマル：本体を左に回すと左を向きます。',
  'Normal': 'ノーマル', 'Invert': 'リバース',
  'Swipe sensitivity': 'スワイプ感度', 'How far the camera turns when you drag on the right side of the screen.': '画面右側をドラッグしたときにカメラが回る量。',
  'Button size': 'ボタンの大きさ', 'Scales every on-screen control. Fine-tune single buttons in the layout editor.': '画面ボタン全体の大きさ。ボタンごとの調整はレイアウト編集で。',
  'Button opacity': 'ボタンの不透明度', 'How solid the on-screen controls look.': '画面ボタンの見え方の濃さ。',
  'Move stick': '移動スティック', 'Floating: the stick appears wherever your left thumb lands. Fixed: it stays put.': 'フリー：左側のどこを触ってもそこにスティックが出ます。固定：決まった位置に出ます。',
  'Floating': 'フリー', 'Fixed': '固定',
  'Aim while firing': '撃ちながらエイム', 'Slide your thumb on the FIRE button to aim while you shoot.': 'ブキボタン（イカ・サブも）を押したまま指をスライドすると、撃ちながら照準を動かせます。',
  'Edit button layout': 'ボタン配置の編集', 'Drag buttons where you want them and resize them. Saved per device.': 'ボタンをドラッグして好きな位置へ。大きさも個別に変えられます。端末ごとに保存。',
  'EDIT': '編集', 'Gyro permission was denied. Allow motion access in Safari settings.': 'ジャイロの使用が許可されませんでした。Safariの設定で「モーションと画面の向き」へのアクセスを許可してください。',
  'Gyro is not available on this device.': 'この端末ではジャイロを使えません。',
  // ---- how to play
  'Aim': 'ねらう', 'Fire': 'インクを撃つ', 'Swim · squid form': 'イカになって泳ぐ', 'hold': '長押し', 'Jump': 'ジャンプ',
  'Aim bomb · release to throw': 'ボムをねらう・はなして投げる', 'Special': 'スペシャル', 'Map': 'マップ', 'Pause': 'ポーズ', 'or': 'または',
  'Ink the turf': 'ナワバリを塗ろう', 'Paint the ground in your team’s color. When time runs out, the team with the most turf wins.': '地面を自分のチームの色で塗ろう。時間切れのとき、多く塗っていたチームの勝ち！',
  'Swim to refill': '泳いでインク回復', 'Dive into your own ink as a squid to move fast, hide and refill your ink tank.': 'イカになって自分のインクにもぐると、速く動けて、隠れられて、インクも回復する。',
  'Avoid enemy ink': '相手のインクに注意', 'Enemy ink slows you down and hurts. Paint over it to take the ground back.': '相手のインクの上では遅くなり、ダメージも受ける。塗り返して取り戻そう。',
  'Climb inked walls': '塗った壁を登る', 'Ink a wall, then swim straight up it as a squid to reach high ground.': '壁を塗ったら、イカになってそのまま登れる。高い場所を取ろう。',
  'KEYBOARD & MOUSE': 'キーボード＆マウス', 'CONTROLLER': 'コントローラー', 'TOUCH': 'タッチ', 'Turf War in 30 seconds': '30秒でわかるナワバリバトル',
  'CONTROLS': '操作方法', 'Switch controls': '操作の切り替え',
  'Left side · drag': '左側をドラッグ', 'Right side · drag / gyro': '右側をドラッグ／ジャイロ', 'FIRE button': 'ブキボタン（右下）', 'SQUID button': 'イカボタン',
  'JUMP button': 'ジャンプボタン', 'SUB button': 'サブボタン', 'SP button': 'スペシャルボタン', 'MAP button': 'マップボタン', 'Ⅱ button': 'ポーズボタン',
  // ---- credits
  'An original 4 v 4 turf-war shooter.': 'オリジナルの4対4ナワバリシューター。', 'Made with': 'つくりかた',
  'Procedural everything — squidkids, weapons, stage, ink, music and sound are all generated in code.': 'キャラ・ブキ・ステージ・インク・音楽・効果音、すべてコードから生成しています。',
  'Rendering': 'レンダリング', 'by the three.js authors & contributors': 'three.js の作者とコントリビューターのみなさん', 'Typography': 'フォント',
  'Starring the squidkids': '出演', 'Special thanks': 'スペシャルサンクス', 'Everyone who ever painted a wall': '壁を塗ったすべての人',
  'Every bot that got splatted in testing': 'テストでたおされたすべてのボット', 'And you, for playing': 'そして、遊んでくれたあなた', 'Hold to speed up': '長押しで早送り',
  // ---- pause
  'RESUME': 'つづける', 'QUIT MATCH': 'バトルをやめる', 'QUIT MATCH?': 'バトルをやめますか？',
  'You will leave this Turf War and head back to the lobby. Your turf will not count.': 'このナワバリバトルをぬけてロビーにもどります。塗ったポイントは記録されません。',
  'KEEP PLAYING': 'つづける', 'QUIT': 'やめる', 'LEFT': 'のこり', 'TURF': '塗り', 'SPLATS': 'たおした', 'SPLATTED': 'やられた',
  'YOUR MATCH': 'あなたの戦績', 'YOUR TEAM': '味方', 'RIVALS': '相手', 'QUICK CONTROLS': '操作', '{name} bots': 'ボット：{name}', 'Turf War': 'ナワバリバトル',
  'PAUSED': 'ポーズ', 'Resume': 'つづける', 'LAYOUT EDIT': 'ボタン配置',
  // ---- results
  'VICTORY!': 'WIN!', 'DEFEAT': 'LOSE...', 'YOUR MEDALS': 'もらった表彰', '{map} · Turf War': '{map} ・ ナワバリバトル', 'WIN': 'WIN',
  'Turf inked': '塗りポイント', 'Splats': 'たおした数', 'Times splatted': 'やられた数', 'LEVEL UP!': 'ランクアップ！', 'WIN BONUS': '勝利ボーナス',
  'MATCH': 'バトル参加', '{n} XP to next level': '次のランクまで {n} XP', 'REMATCH': 'もう一度', 'MAIN MENU': 'メニューへ', 'Skip · Select': 'スキップ・決定',
  'TURF KING': '塗りキング', 'TOP SPLATTER': 'たおしキング', 'TOP INKER': 'チーム塗りトップ', 'UNTOUCHABLE': 'ノーデス', 'SURVIVOR': 'サバイバー',
  'PURE PAINTER': 'ピュアペインター', 'PHOTO FINISH': '大接戦', 'LANDSLIDE': '圧勝',
  'Best all-round score on the winning team': '勝ったチームでいちばん活躍', 'Most turf inked in the match': 'バトルでいちばん多く塗った',
  'Most splats in the match': 'バトルでいちばん多くたおした', 'Most turf inked on their team': 'チームでいちばん多く塗った', 'Never got splatted': '一度もやられなかった',
  'Splatted the fewest times': 'やられた回数がいちばん少ない', 'Top-3 turf without splatting anyone': '誰もたおさずに塗りトップ3',
  '{n}p inked': '{n}p 塗った', '{n} splat': '{n}回たおした', '{n} splats': '{n}回たおした', 'Never splatted': 'ノーデス', 'Splatted {n}×': '{n}回やられた',
  '{n}p · 0 splats': '{n}p ・ たおし0', 'Top all-round score': '総合トップ', '{n}% margin': '差 {n}%',
  // ---- HUD
  'LOW INK': 'インク不足', 'MAP': 'マップ', 'SUPER JUMP': 'スーパージャンプ', 'Base': 'リスポーン地点', 'Pick a landing spot': '着地点を選ぼう',
  'Press [1] – [4] or click · release [TAB] to cancel': '[1]〜[4] かクリックでジャンプ ・ [TAB] をはなすとキャンセル',
  'READY?': 'Ready?', 'GO!': 'GO!', '1 minute left!': 'のこり1分！', "TIME'S UP!": 'しゅうりょう！', 'SPECIAL!': 'スペシャル！',
  "IT'S A TIE!": '引き分け！', '{team} WINS!': '{team}チームの勝ち！', 'JUDGING': 'ジャッジ中', 'SPLATTED BY': 'たおされた相手', 'SPLATTED!': 'やられた！',
  'RESPAWN': '復活まで', 'Hold [TAB] to plan a Super Jump': '[TAB] 長押しでスーパージャンプ先を選べる',
  'DOUBLE SPLAT!': '2連続たおし！', 'TRIPLE SPLAT!': '3連続たおし！', 'QUAD SPLAT!': '4連続たおし！', 'WIPEOUT!': '全滅させた！',
  'The whole team is splatted': '相手チームを全員たおした', 'FIRST SPLAT!': 'ファーストキル！', 'REVENGE!': 'リベンジ！', 'SHUTDOWN!': '連続キル阻止！',
  "Ended {name}'s streak": '{name}の連続キルを止めた', 'SPLAT STREAK ×{n}': '{n}連続たおし！', 'ASSIST': 'アシスト', 'Squidkid': 'イカ', 'BUSY': 'ジャンプ不可',
  'STAGE MAP': 'ステージマップ', 'BASE': 'リスポーン', 'Right stick to point · A or D-pad to Super Jump · release VIEW to close': '右スティックで選択 ・ A か十字キーでスーパージャンプ ・ VIEW をはなすと閉じる',
  'You splatted {name}!': '{name}をたおした！', '{victim} was splatted by {attacker}': '{victim}が{attacker}にやられた', '{victim} was splatted': '{victim}がやられた',
  '{attacker} splatted {victim}': '{attacker}が{victim}をたおした', 'the sea': '海', 'enemy ink': '相手のインク',
  'Low ink! Hold SHIFT in your ink to refill': 'インク不足！ [SHIFT] 長押しで自分のインクにもぐって回復',
  'Special ready! Press F': 'スペシャル発動OK！ [F] で使おう', 'Hold SHIFT to swim in your ink and refill': '[SHIFT] 長押しでインクにもぐって回復',
  'Paint the ground — most turf wins!': '地面を塗ろう！ 多く塗ったチームの勝ち！', 'Gyro ON': 'ジャイロ ON', 'Gyro OFF': 'ジャイロ OFF',
  'Tap a pin to Super Jump · tap MAP to close': 'ピンをタップでスーパージャンプ ・ マップボタンで閉じる', 'Super Jump to a teammate': '味方へスーパージャンプ',
  'Point + click a pin': 'ピンをクリック', 'release': 'はなして閉じる',
  'Tap GYRO to turn on gyro aim': 'ジャイロボタンをタップするとジャイロ操作がONになります', '{name}!': '{name}！', 'Player': 'プレイヤー',
  // ---- previews (settings side card)
  'Full-stick 360° turn in <b>{s} s</b>': 'スティックを倒しきると <b>{s} 秒</b>で一周', '<b>{n} px</b> of mouse travel per 360° turn': 'マウスを <b>{n} px</b> 動かすと一周',
  'Push up <b>→ look DOWN</b>': '上に動かす <b>→ 下を向く</b>', 'Push up <b>→ look UP</b>': '上に動かす <b>→ 上を向く</b>',
  '<b>{n} of {m}</b> squidkids in view': '視界に <b>{m}人中 {n}人</b>', 'Pixel density': '解像度', 'up to {n}×': '最大 {n}倍', 'Shadow map': '影の精細さ',
  'Anti-aliasing': 'アンチエイリアス', 'Ink detail': 'インクの精細さ', '{n}K atlas': '{n}K', 'Ambient occlusion': '環境光の陰影', 'Particles': 'エフェクト量',
  'Soft sun shadows <b>ON</b>': 'やわらかい影 <b>ON</b>', 'Shadows <b>OFF</b> — faster on older machines': '影 <b>OFF</b> ・ 古い端末で軽くなります',
  'Bright ink and specials <b>glow</b>': '明るいインクやスペシャルが<b>光る</b>', 'Glow <b>OFF</b>': '光のにじみ <b>OFF</b>',
  'Frame counter <b>shown</b> in matches': 'バトル中にFPSを<b>表示</b>', 'Frame counter <b>hidden</b>': 'FPSは<b>非表示</b>',
  'Turf minimap <b>in the corner</b>': 'ミニマップを<b>画面の端に表示</b>', 'Minimap <b>hidden</b> — hold TAB for the big map': 'ミニマップ<b>非表示</b> ・ 全体マップはいつでも開けます',
  'Screen shake <b>OFF</b>': '画面の揺れ <b>OFF</b>', 'Shake strength <b>{n}%</b>': '揺れの強さ <b>{n}%</b>', 'Overall output <b>{n}%</b>': '全体の音量 <b>{n}%</b>',
  'Heard at <b>{n}%</b> after master volume': '全体の音量をかけて <b>{n}%</b>', 'Aim assist <b>OFF</b>': 'エイムアシスト <b>OFF</b>', 'Pull strength <b>{n}%</b>': '吸いつく強さ <b>{n}%</b>',
  'Assist on <b>controller and mouse</b> (lighter on mouse)': '<b>コントローラーとマウス</b>でアシスト（マウスは弱め）', 'Assist on <b>controller only</b>': '<b>コントローラーのみ</b>アシスト',
  'Vibration <b>OFF</b>': '振動 <b>OFF</b>', 'Rumble strength <b>{n}%</b>': '振動の強さ <b>{n}%</b>', 'STANDARD INKS · rotate each match': 'ふつうのインク ・ バトルごとに変わる',
  'COLORBLIND-SAFE · always': '色覚サポート ・ いつも同じ', 'A quick <b>sprint</b> — every second counts': 'さくっと<b>短期決戦</b> ・ 1秒もムダにできない',
  'The full <b>turf war</b> — room for comebacks': '本格<b>ナワバリバトル</b> ・ 逆転のチャンスあり',
  'Every binding for <b>keyboard, mouse and controller</b>': '<b>キーボード・マウス・コントローラー・タッチ</b>の操作一覧',
  'Press twice to restore <b>every setting</b> on every tab': '2回押すと<b>すべての設定</b>を初期状態にもどします', 'ASSIST': 'アシスト', 'BOOM': 'ドカン',
  '<b>{n}°</b> of device turn = one full turn': '本体を <b>{n}°</b> 回すと一周',
  'Buttons at <b>{n}%</b> size': 'ボタンの大きさ <b>{n}%</b>', 'Buttons at <b>{n}%</b> opacity': 'ボタンの濃さ <b>{n}%</b>',
  '<b>{n} px</b> of swipe per 360° turn': '<b>{n} px</b> スワイプすると一周',
  'The stick appears under your thumb': '親指を置いた場所にスティックが出る', 'The stick stays in one place': 'スティックはいつも同じ場所',
  'Hold FIRE and slide to aim': '発射ボタンを押したまま指をずらしてエイム', 'FIRE only shoots · aim on the right side': '発射ボタンは撃つだけ ・ エイムは画面右側で',
  'Drag to move · pinch to resize': 'ドラッグで移動 ・ ピンチで大きさ変更',
};

// Touch variants (no keycaps on a phone / tablet).
const JA_TOUCH = {
  'Hold [SHIFT] to dive into your ink — you are nearly invisible while swimming.': 'イカボタン長押しでインクにもぐれる。泳いでいる間は相手からほとんど見えないぞ。',
  'Your special gauge fills as you ink. Press [F] when it glows!': '塗るとスペシャルゲージがたまる。光ったらスペシャルボタンで発動！',
  'Hold [TAB] to open the big map and spot unpainted turf.': 'マップボタンで全体マップを開いて、塗れていない場所を探そう。',
  'Press [1] – [4] or click · release [TAB] to cancel': 'ジャンプ先をタップ ・ マップボタンで閉じる',
  'Hold [TAB] to plan a Super Jump': 'マップボタンでスーパージャンプ先を選べる',
  'Low ink! Hold SHIFT in your ink to refill': 'インク不足！ イカボタン長押しで自分のインクにもぐって回復',
  'Special ready! Press F': 'スペシャル発動OK！ スペシャルボタンで使おう',
  'Hold SHIFT to swim in your ink and refill': 'イカボタン長押しでインクにもぐって回復',
  'Minimap <b>hidden</b> — hold TAB for the big map': 'ミニマップ<b>非表示</b> ・ マップボタンで全体マップ',
};
const EN_TOUCH = {
  'Hold [SHIFT] to dive into your ink — you are nearly invisible while swimming.': 'Hold SQUID to dive into your ink — you are nearly invisible while swimming.',
  'Your special gauge fills as you ink. Press [F] when it glows!': 'Your special gauge fills as you ink. Tap SP when it glows!',
  'Hold [TAB] to open the big map and spot unpainted turf.': 'Tap MAP to open the big map and spot unpainted turf.',
  'Press [1] – [4] or click · release [TAB] to cancel': 'Tap a landing spot · tap MAP to close',
  'Hold [TAB] to plan a Super Jump': 'Tap MAP to plan a Super Jump',
  'Low ink! Hold SHIFT in your ink to refill': 'Low ink! Hold SQUID in your ink to refill',
  'Special ready! Press F': 'Special ready! Tap SP',
  'Hold SHIFT to swim in your ink and refill': 'Hold SQUID to swim in your ink and refill',
  'PRESS ANY KEY': 'TAP TO START',
  'Minimap <b>hidden</b> — hold TAB for the big map': 'Minimap <b>hidden</b> — tap MAP for the big map',
};

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** Translate English source text. */
export function t(s, vars) {
  if (typeof s !== 'string' || !s) return s;
  let out;
  if (TXT.mode === 'touch') out = isJa ? JA_TOUCH[s] : EN_TOUCH[s];
  if (out == null && isJa) out = JA[s];
  return fill(out == null ? s : out, vars);
}
/** Translate only when an entry exists (used by the DOM helper for arbitrary text nodes). */
export function tx(s) {
  if (typeof s !== 'string' || s.length < 1) return s;
  if (TXT.mode === 'touch') { const v = isJa ? JA_TOUCH[s] : EN_TOUCH[s]; if (v != null) return v; }
  if (!isJa) return s;
  const v = JA[s];
  return v == null ? s : v;
}

// ------------------------------------------------------------------------------------------------ content tables
const DATA_JA = {
  weapons: {
    shooter: ['スプリッツァー', 'シューター', '連射が得意な万能ブキ。インクの弾をテンポよく撃ち出す。'],
    roller: ['スウェルローラー', 'ローラー', '転がして太い帯で塗る。振ればインクを大きく飛ばせる。'],
    charger: ['グリントチャージャー', 'チャージャー', '長押しでチャージ、はなすと遠くまで貫く一撃。フルチャージなら一発でたおせる。'],
    blaster: ['ポッパーブラスター', 'ブラスター', '空中で爆発する弾を撃つ。直撃すれば一発でたおせる。'],
    dualies: ['ツインフィンマニューバー', 'マニューバー', '二丁拳銃で交互に撃つ。撃ちながらジャンプでスライド、そのあと足を止めて撃ちまくれ。'],
    slosher: ['タイドバケツスロッシャー', 'スロッシャー', 'インクを放物線状にぶちまける。物陰の向こうや段差の上にも届き、着地点を太く塗る。'],
    splatling: ['ジャイアスピナー', 'スピナー', '長押しで回転チャージ、はなすと高速連射。チャージするほど長く撃てる。'],
  },
  sub: { bomb: 'スプラッシュボム' },
  specials: {
    slam: ['タイダルスラム', '高く跳び上がって叩きつけ、大きなインクの衝撃波を起こす。'],
    storm: ['インクテンペスト', '雨雲を投げて、下の地面をインクの雨で塗りつぶす。'],
  },
  maps: {
    tidewater: ['タイドウォーター広場', '海に面した、陽ざしあふれる港の広場。'],
    kelpline: ['ケルプライン埠頭', '金網の通路、くぼんだ溝、鉄骨のクレーン台があるコンテナヤード。'],
    halyard: ['ハリヤードマリーナ', '浮き桟橋に陸揚げされたタグボート、中央にはカーフェリー。水に落ちないように注意。'],
  },
  difficulty: { easy: 'ゆるめ', normal: 'ふつう', hard: 'つよい' },
  palette: { Tangerine: 'オレンジ', Cobalt: 'コバルト', Bubblegum: 'ピンク', Mint: 'ミント', Lemon: 'レモン', Grape: 'グレープ', Aqua: 'アクア', Cherry: 'チェリー', Lime: 'ライム', Magenta: 'マゼンタ', Sun: 'サン', Sea: 'シー', Alpha: 'アルファ', Bravo: 'ブラボー' },
  look: {
    SKIN_NAMES: ['ローズ', 'ピーチ', 'タン', 'ココア', 'ポーセリン', 'ハニー', 'オリーブ', 'チェスナット', 'エボニー'],
    OUTFIT_NAMES: ['ベーシックリンガー', 'ナイトピンストライプ', 'ラグランランナー', 'シェブロンT', 'ボーダーT', 'スプラッターT', 'スプラ迷彩', 'ディップダイT', 'プロジャージ', 'トラックトップ'],
    IRIS_NAMES: ['アンバー', 'ラグーン', 'バイオレット', 'ライム', 'ローズ', 'ヘーゼル', 'フロスト', 'エンバー'],
    HAIR_STYLE_NAMES: ['タイド', 'スパイク', 'ツイン', 'ボブ', 'ポニー', 'クレスト', 'おだんご', 'スウープ'],
    HAT_NAMES: ['なし', 'スナップバック', 'ニット帽', 'バケットハット'],
    BROW_NAMES: ['クラシック', 'ふとめ', 'アーチ', 'ストレート'],
  },
  presets: {
    rookie: 'フェリーから降りたての新人。ボーダーTに長いゲソ。', dash: 'ツンツン頭のトラックトップ・スプリンター。',
    pip: 'ツインテールにボーダーT。いつもいちばんにフェリーの甲板へ。', coral: 'ディップダイで、いつもマイペース。',
    marlo: 'ポニーテールにジャージ、気合いは十分。', riptide: 'モヒカンにスプラッターT。とにかく目立つ。',
    nori: 'バケットハットに低めのおだんご、スプラ迷彩。気長なチャージャー使い。', suki: 'サイドに流した髪。ロビーでもクール。',
    kelp: '一年中ニット帽。', skipper: 'スナップバックにラグラン。港の常連。',
  },
};

let localized = false;
/** Rename the shared content tables in place (idempotent). */
export function localizeData() {
  if (localized || !isJa) return;
  localized = true;
  for (const [id, [name, cls, blurb]] of Object.entries(DATA_JA.weapons)) { const w = WEAPONS[id]; if (w) { w.name = name; w.class = cls; w.blurb = blurb; } }
  for (const [id, name] of Object.entries(DATA_JA.sub)) if (SUB[id]) SUB[id].name = name;
  for (const [id, [name, blurb]] of Object.entries(DATA_JA.specials)) if (SPECIALS[id]) { SPECIALS[id].name = name; SPECIALS[id].blurb = blurb; }
  for (const m of MAPS) { const d = DATA_JA.maps[m.id]; if (d) { m.name = d[0]; m.blurb = d[1]; } }
  for (const [id, name] of Object.entries(DATA_JA.difficulty)) if (DIFFICULTY[id]) DIFFICULTY[id].name = name;
  const P = DATA_JA.palette;
  for (const p of [...TEAM_PALETTES, COLORBLIND_PALETTE]) if (p.names) p.names = p.names.map((n) => P[n] || n);
  for (let i = 0; i < TEAM_NAMES.length; i++) TEAM_NAMES[i] = P[TEAM_NAMES[i]] || TEAM_NAMES[i];
  for (const [k, arr] of Object.entries(DATA_JA.look)) { const dst = LOOK[k]; if (Array.isArray(dst)) arr.forEach((v, i) => { if (i < dst.length) dst[i] = v; }); }
  if (Array.isArray(LOOK.PRESETS)) for (const p of LOOK.PRESETS) { const b = DATA_JA.presets[p.id]; if (b) p.blurb = b; }
}
localizeData();
