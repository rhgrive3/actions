// Practice Range UI text. The game's dictionary (src/i18n.js) is not extensible from outside, so the range keeps its
// own small table and follows the same language switch (isJa); English is the source text.
import { isJa } from '../../../src/i18n.js';

const JA = {
  'PRACTICE RANGE': '試し撃ちラボ',
  'Range, damage, paint, movement, bombs and specials — measured on a world-scale grid.': '射程・ダメージ・塗り・移動・ボム・スペシャルを、ワールド座標の目盛りで確かめよう。',
  'TRAINING': 'トレーニング', 'SOLO': 'ひとりで', '9 TEST ZONES': '9つのテストゾーン', 'NO TIMER': '時間無制限',
  'Stand on a pad to use it': 'パッドに乗って使う',
  'SWITCHING WEAPON': 'ブキを持ちかえ中', 'RESETTING PAINT': '塗りをリセット中', 'RESETTING TARGETS': 'ターゲットをリセット中',
  'INKING THE SWIM COURSE': 'スイムコースを塗っています', 'RESUPPLY': 'インク・スペシャル補給',
  'Paint reset': '塗りをリセットしました', 'Targets reset': 'ターゲットをリセットしました', 'Back to the start': 'スタート地点にもどりました',
  'Swim course inked': 'スイムコースを自分のインクで塗りました', 'Ink and special refilled': 'インクとスペシャルを補給しました',
  'Now using {name}': '{name} に持ちかえました',
  'RESET PAINT': '塗りリセット', 'RESET TARGETS': 'ターゲットリセット', 'INK COURSE': 'コースを塗る', 'REFILL': '補給',
  'SPEED': '速度', 'ZONE': 'ゾーン', 'DOWNRANGE': '射撃線から', 'FROM WALL': '壁から', 'LAST HIT': '最後のヒット',
  'COMBO': '合計', 'HITS': 'ヒット', 'SPLAT IN': 'たおすまで', 'TIME': '時間', 'FROM': '距離', 'TARGET': 'ターゲット',
  'ENDURANCE': '耐久', 'never pops': 'たおれない', 'PAINTED': '塗り面積', 'of the 400 m² test floor': '／テスト床 400 m²',
  'Target': 'ターゲット', 'Endurance target': '耐久ターゲット', 'Rail target': '移動ターゲット',
  'RESUME': 'つづける', 'WEAPON': 'ブキ', 'TRAVEL': 'ワープ', 'RESETS': 'リセット', 'LEAVE RANGE': 'ラボを出る',
  'RETURN TO START': 'スタートへもどる', 'SETTINGS': 'オプション', 'MOVING TARGETS': '移動ターゲット',
  'LEAVE THE RANGE?': 'ラボを出る？', 'You will head back to the lobby.': 'ロビーにもどります。', 'STAY': 'のこる', 'LEAVE': '出る',
  'Spawn deck': 'スタート台', 'Rail target speed = run speed': '移動ターゲットの速さ＝ヒト移動の最高速',
  'Every mark is a world coordinate: 1 m on the floor = 1.000 game unit.': '目盛りはすべてワールド座標：床の 1 m = ゲーム内 1.000 単位。',
  'Choose a zone to jump straight to its reference stand.': 'ゾーンを選ぶと、その基準位置へ直接移動します。',
  'ON': 'ON', 'OFF': 'OFF', 'Back': 'もどる', 'Select': '決定', 'Weapon': 'ブキ',
  'R': 'R', 'T': 'T', 'G': 'G',
  'Reset paint': '塗りリセット', 'Reset targets': 'ターゲットリセット', 'Back to start': 'スタートへ',
  'Hub': 'ハブ', 'Long Lane': 'ロングレーン', 'Target Gallery': 'ターゲットギャラリー', 'Paint Test': '塗りテスト',
  'Roller Court': 'ローラーコート', 'Dodge Pad': 'スライドパッド', 'Swim Course': 'スイムコース', 'Wall Lab': 'カベラボ',
  'Bomb Pit': 'ボムピット', 'Special Arena': 'スペシャルアリーナ',
  'Range · damage at distance': '射程・距離ごとのダメージ', 'Paint distance · long shots · bomb throw': '塗り距離・長射程・ボムの飛距離',
  '400 m² floor · paint coverage': '400 m² の床・塗り面積', 'Rolling · flicks · curves': '転がし・振り・カーブ',
  'Dodge rolls · fire after rolling': 'スライド・スライド後の射撃', 'Swim speed · turns · slopes': '泳ぎの速さ・旋回・坂',
  'Paint height · climbing · ledges': '塗りの高さ・壁のぼり・段差', 'Throws · bounces · blast radius': '投てき・跳ね返り・爆発範囲',
  'Special radius · endurance targets': 'スペシャルの範囲・耐久ターゲット', 'Where you started': 'スタート地点',
  'WELCOME TO THE RANGE': '試し撃ちラボへようこそ',
};

export const L = (s, vars) => {
  let out = isJa && JA[s] != null ? JA[s] : s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
};
export { isJa };
