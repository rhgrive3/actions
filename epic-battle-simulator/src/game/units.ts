import * as THREE from "three";

// Original unit roster. Designs and stats are this project's own.

export type UnitKind =
  // kingdom
  | "spear" | "guardian" | "archer" | "crossbow" | "swordsman" | "halberdier" | "knight" | "paladin" | "king"
  // warband
  | "orc" | "berserker" | "javelin" | "bomber" | "shaman" | "troll" | "giant" | "pirate" | "sapper"
  // mystic
  | "elf" | "monk" | "assassin" | "mage" | "frost" | "cleric" | "zeus"
  // undead
  | "zombie" | "skeleton" | "bonearcher" | "vampire" | "necromancer"
  // machines
  | "robot" | "tank" | "railgun" | "catapult";
export type TeamId = 0 | 1;
export type Faction = "kingdom" | "warband" | "mystic" | "undead" | "machine";
export type ProjectileStyle = "arrow" | "quarrel" | "bolt" | "bomb" | "javelin" | "pistol" | "cannon" | "rail";

export interface UnitDef {
  kind: UnitKind;
  faction: Faction;
  name: string;
  en: string;
  role: string;
  cost: number;
  hp: number;
  dmg: number;
  range: number;
  speed: number;
  windup: number;
  cooldown: number;
  aggro: number;
  ranged: boolean;
  radius: number;
  height: number;
  /** Flat damage removed from every hit (a hit always keeps 30% of its strength). */
  armor: number;
  /** Share of a frontal, non-explosive hit that the shield stops. */
  shield?: number;
  /** Polearm set against a charge: bonus damage share against fast-moving victims, and it stops their charge. */
  brace?: number;
  /** Cavalry charge: bonus damage share on the first hit at full gallop. */
  charge?: number;
  /** Knockback this unit delivers. */
  impact: number;
  /** Resistance to being knocked around. */
  mass: number;
  projSpeed?: number;
  proj?: ProjectileStyle;
  aoe?: number;
  cleave?: number;
  heal?: number;
  healRange?: number;
  hunter?: boolean;
  rage?: boolean;
  slow?: number;
  lifesteal?: number;
  regen?: number;
  /** Aura buff: +damage% applied to allies within range. */
  buff?: number;
  buffRange?: number;
  /** Chain lightning: jumps to nearby extra enemies. */
  chain?: number;
  /** Pierces the first N targets it hits. */
  pierce?: number;
  /** Carries a powder keg: its one attack blows itself up, and it also goes off when killed. */
  detonate?: boolean;
  /** Raises a skeleton this often (seconds), up to SUMMON_LIMIT per caster. */
  summon?: number;
  /** Cannot aim at anything closer than this. */
  minRange?: number;
  desc: string;
  icon: string;
}

const D = (u: UnitDef) => u;

/*
 * Balance notes
 * -------------
 * Stats follow each unit's job, not per-stage difficulty. The whole counter web comes from six
 * physical rules in simulation.ts (shield arc, flat armour, blast, brace, charge, flank):
 *   - shields stop arrows and blades from the front, never explosions or hits from behind;
 *   - flat armour shrugs off many weak hits, so armoured targets want heavy single blows;
 *   - blasts and cleaves punish tight ranks and cheap swarms, and waste themselves on lone big targets;
 *   - braced polearms punish whatever arrives fast (cavalry, assassins, berserkers);
 *   - fast hunters reach shooters and casters, who are helpless once a blade is on them;
 *   - shooters shred slow unshielded bodies, giants included.
 */
export const DEFS: Record<UnitKind, UnitDef> = {
  spear: D({ kind: "spear", faction: "kingdom", name: "槍兵", en: "SPEARMAN", role: "槍衾", cost: 50, hp: 70, dmg: 16, range: 3.2,
    speed: 3.7, windup: 0.80, cooldown: 1.40, aggro: 16, ranged: false, radius: 0.52, height: 2.3, armor: 0, impact: 1.8, mass: 1.0, brace: 1.5,
    desc: "長い槍で味方の肩越しに突く。走り込んでくる敵ほど深く刺さり、騎兵の突撃を止める。", icon: "spear" }),
  guardian: D({ kind: "guardian", faction: "kingdom", name: "盾兵", en: "SHIELD GUARD", role: "壁", cost: 60, hp: 150, dmg: 5, range: 1.8,
    speed: 3.0, windup: 0.90, cooldown: 1.30, aggro: 14, ranged: false, radius: 0.62, height: 2.4, armor: 0, shield: 0.65, impact: 1.8, mass: 1.9,
    desc: "大盾で正面の矢と刃を7割止める壁。攻撃力はほぼ無く、爆発と背後からの攻撃は防げない。", icon: "shield" }),
  archer: D({ kind: "archer", faction: "kingdom", name: "弓兵", en: "ARCHER", role: "射撃", cost: 70, hp: 45, dmg: 12, range: 24,
    speed: 3.4, windup: 0.80, cooldown: 0.90, aggro: 22, ranged: true, radius: 0.5, height: 2.3, armor: 0, impact: 1.0, mass: 0.8,
    projSpeed: 34, proj: "arrow",
    desc: "軽い矢を速く射る。盾と装甲には通りにくく、斬り込まれると何もできない。", icon: "bow" }),
  crossbow: D({ kind: "crossbow", faction: "kingdom", name: "弩兵", en: "CROSSBOWMAN", role: "重射撃", cost: 100, hp: 55, dmg: 46, range: 26,
    speed: 3.1, windup: 1.40, cooldown: 2.20, aggro: 24, ranged: true, radius: 0.54, height: 2.3, armor: 0, impact: 2.6, mass: 0.9,
    projSpeed: 50, proj: "quarrel",
    desc: "装填は遅いが一発が重く、装甲を貫く。大物狩り向きで、群れには手数が足りない。", icon: "crossbow" }),
  swordsman: D({ kind: "swordsman", faction: "kingdom", name: "剣士", en: "SWORDSMAN", role: "歩兵", cost: 60, hp: 95, dmg: 12, range: 1.95,
    speed: 3.8, windup: 0.50, cooldown: 0.70, aggro: 17, ranged: false, radius: 0.54, height: 2.3, armor: 0, shield: 0.25, impact: 1.8, mass: 1.05,
    desc: "小盾と手数で押す万能歩兵。一対一に強いが、範囲攻撃も長射程も持たない。", icon: "sword" }),
  halberdier: D({ kind: "halberdier", faction: "kingdom", name: "戟兵", en: "HALBERDIER", role: "長柄", cost: 90, hp: 90, dmg: 26, range: 3.0,
    speed: 3.6, windup: 0.90, cooldown: 1.00, aggro: 17, ranged: false, radius: 0.56, height: 2.4, armor: 0, impact: 2.2, mass: 1.25, cleave: 1.5, brace: 1.0,
    desc: "斧槍で複数の敵を薙ぎ払う。群れと突撃に強いが、盾が無く矢に弱い。", icon: "halberd" }),
  knight: D({ kind: "knight", faction: "kingdom", name: "重騎兵", en: "HEAVY CAVALRY", role: "突撃", cost: 200, hp: 200, dmg: 40, range: 2.6,
    speed: 6.4, windup: 0.2, cooldown: 1.50, aggro: 22, ranged: false, radius: 1.05, height: 3.1, armor: 4, impact: 10.5, mass: 2.2, hunter: true, charge: 0.5,
    desc: "助走をつけた初撃で隊列ごと吹き飛ばし、後衛を狩る。槍衾に突っ込むと止められて死ぬ。", icon: "horse" }),
  paladin: D({ kind: "paladin", faction: "kingdom", name: "聖騎士", en: "PALADIN", role: "英雄", cost: 220, hp: 360, dmg: 26, range: 2.2,
    speed: 3.6, windup: 0.80, cooldown: 1.00, aggro: 18, ranged: false, radius: 0.72, height: 2.7, armor: 4, shield: 0.3, impact: 2.4, mass: 2.0,
    heal: 10, healRange: 6.5,
    desc: "重装で前線に立ち、周囲の味方を少しずつ癒やす。軽い攻撃では倒れない。", icon: "paladin" }),
  king: D({ kind: "king", faction: "kingdom", name: "王", en: "THE KING", role: "指揮官", cost: 300, hp: 380, dmg: 28, range: 2.3,
    speed: 3.5, windup: 0.90, cooldown: 1.10, aggro: 16, ranged: false, radius: 0.82, height: 3.0, armor: 4, shield: 0.25, impact: 2.5, mass: 2.3,
    buff: 0.3, buffRange: 11,
    desc: "王の威光で周囲の味方が30%強く戦う。大軍の中心に置いてこそ価値が出る。", icon: "crown" }),

  orc: D({ kind: "orc", faction: "warband", name: "オーク戦士", en: "ORC WARRIOR", role: "前衛", cost: 60, hp: 125, dmg: 15, range: 2.0,
    speed: 3.7, windup: 0.85, cooldown: 0.95, aggro: 16, ranged: false, radius: 0.66, height: 2.7, armor: 0, impact: 2.1, mass: 1.35, cleave: 1.2,
    desc: "タフな体と大斧の力押し。盾が無いので射撃には素通しで撃たれる。", icon: "axe" }),
  berserker: D({ kind: "berserker", faction: "warband", name: "狂戦士", en: "BERSERKER", role: "速攻", cost: 80, hp: 95, dmg: 13, range: 1.95,
    speed: 5.2, windup: 0.50, cooldown: 0.55, aggro: 18, ranged: false, radius: 0.58, height: 2.5, armor: 0, impact: 1.8, mass: 1.1, rage: true, cleave: 1.1,
    desc: "駆け足で斬り込み、傷つくほど攻撃が速くなる。その勢いが槍衾には仇になる。", icon: "axes" }),
  javelin: D({ kind: "javelin", faction: "warband", name: "投槍兵", en: "JAVELINEER", role: "投擲", cost: 70, hp: 55, dmg: 30, range: 13,
    speed: 3.7, windup: 1.00, cooldown: 2.00, aggro: 20, ranged: true, radius: 0.54, height: 2.4, armor: 0, impact: 5.5, mass: 0.9,
    projSpeed: 22, proj: "javelin",
    desc: "射程は短いが重い投げ槍。装甲に通り、盾兵の体勢を崩す。", icon: "javelin" }),
  bomber: D({ kind: "bomber", faction: "warband", name: "爆弾兵", en: "BOMBER", role: "爆破", cost: 110, hp: 50, dmg: 34, range: 15,
    speed: 3.3, windup: 1.25, cooldown: 2.2, aggro: 20, ranged: true, radius: 0.52, height: 2.3, armor: 0, impact: 6.8, mass: 0.85,
    projSpeed: 16, proj: "bomb", aoe: 2.9,
    desc: "爆弾は盾を無視して密集隊形を吹き飛ばす。弾が遅く、散開した敵や速い敵には当たらない。", icon: "bomb" }),
  shaman: D({ kind: "shaman", faction: "warband", name: "呪術師", en: "SHAMAN", role: "呪い", cost: 120, hp: 60, dmg: 14, range: 17,
    speed: 3.2, windup: 1.20, cooldown: 1.30, aggro: 20, ranged: true, radius: 0.52, height: 2.5, armor: 0, impact: 1.8, mass: 0.9,
    projSpeed: 20, proj: "bolt", aoe: 3.0, slow: 3.0,
    desc: "呪いの弾で範囲内の敵の移動と攻撃を鈍らせる。威力は低く、味方の火力が要る。", icon: "shaman" }),
  troll: D({ kind: "troll", faction: "warband", name: "トロール", en: "TROLL", role: "再生", cost: 250, hp: 420, dmg: 34, range: 2.5,
    speed: 2.9, windup: 1.30, cooldown: 1.40, aggro: 18, ranged: false, radius: 0.9, height: 4.2, armor: 1, impact: 5.0, mass: 4.2, regen: 5,
    cleave: 1.8,
    desc: "傷が再生し続ける巨体。ちまちま削っても戻るので、火力を集めて一気に落とす。", icon: "fist" }),
  giant: D({ kind: "giant", faction: "warband", name: "巨人", en: "GIANT", role: "超重量", cost: 320, hp: 700, dmg: 45, range: 2.8,
    speed: 2.6, windup: 1.05, cooldown: 1.30, aggro: 18, ranged: false, radius: 0.95, height: 4.6, armor: 3, impact: 14.0, mass: 6.5, cleave: 2.4,
    desc: "大棍棒の一振りで歩兵を隊列ごと叩き飛ばす。足が遅く的が大きいので、重い射撃の的になる。", icon: "giant" }),
  pirate: D({ kind: "pirate", faction: "warband", name: "海賊", en: "PIRATE", role: "銃砲", cost: 130, hp: 75, dmg: 60, range: 18,
    speed: 3.6, windup: 1.10, cooldown: 2.40, aggro: 20, ranged: true, radius: 0.56, height: 2.4, armor: 0, impact: 3.0, mass: 0.95,
    projSpeed: 60, proj: "pistol",
    desc: "火縄銃の一発は装甲も大物も撃ち抜く。再装填が長く、群れに囲まれると終わる。", icon: "pirate" }),

  elf: D({ kind: "elf", faction: "mystic", name: "エルフ狩人", en: "ELVEN HUNTRESS", role: "長射程", cost: 90, hp: 45, dmg: 11, range: 32,
    speed: 4.2, windup: 0.70, cooldown: 0.65, aggro: 24, ranged: true, radius: 0.48, height: 2.3, armor: 0, impact: 0.9, mass: 0.78,
    projSpeed: 38, proj: "arrow",
    desc: "誰よりも遠くから速射する。矢は軽く、盾と装甲の前では無力に近い。", icon: "leafbow" }),
  monk: D({ kind: "monk", faction: "mystic", name: "修道武僧", en: "MARTIAL MONK", role: "拳闘", cost: 75, hp: 100, dmg: 10, range: 1.95,
    speed: 4.6, windup: 0.40, cooldown: 0.45, aggro: 17, ranged: false, radius: 0.52, height: 2.4, armor: 0, shield: 0.2, impact: 2.6, mass: 1.15,
    desc: "素早い連撃で押し返す武道家。一撃が軽いので装甲には弾かれる。", icon: "fist" }),
  assassin: D({ kind: "assassin", faction: "mystic", name: "影の刺客", en: "SHADOW BLADE", role: "暗殺", cost: 85, hp: 80, dmg: 26, range: 1.95,
    speed: 6.6, windup: 0.40, cooldown: 0.70, aggro: 36, ranged: false, radius: 0.48, height: 2.2, armor: 0, impact: 1.5, mass: 0.8, hunter: true,
    desc: "前線を無視して射手・術師・僧侶へ走る。打たれ弱く、護衛の槍や剣に捕まると脆い。", icon: "dagger" }),
  mage: D({ kind: "mage", faction: "mystic", name: "魔術師", en: "WIZARD", role: "範囲魔法", cost: 135, hp: 50, dmg: 32, range: 20,
    speed: 3.1, windup: 1.20, cooldown: 1.60, aggro: 20, ranged: true, radius: 0.52, height: 2.9, armor: 0, impact: 2.2, mass: 0.85,
    projSpeed: 25, proj: "bolt", aoe: 2.7,
    desc: "追尾する魔弾が着弾点の敵をまとめて焼く。盾は効かない。本人は紙のように脆い。", icon: "orb" }),
  frost: D({ kind: "frost", faction: "mystic", name: "氷の術師", en: "FROST WEAVER", role: "足止め", cost: 130, hp: 55, dmg: 18, range: 18,
    speed: 3.1, windup: 1.15, cooldown: 1.25, aggro: 20, ranged: true, radius: 0.52, height: 2.8, armor: 0, impact: 1.6, mass: 0.85,
    projSpeed: 24, proj: "bolt", aoe: 2.8, slow: 3.2,
    desc: "氷の魔弾で範囲内の敵を鈍らせる。突撃や速攻を止め、射撃の時間を稼ぐ。", icon: "frost" }),
  cleric: D({ kind: "cleric", faction: "mystic", name: "僧侶", en: "CLERIC", role: "回復", cost: 100, hp: 70, dmg: 4, range: 2.4,
    speed: 3.6, windup: 0.8, cooldown: 0.9, aggro: 14, ranged: false, radius: 0.52, height: 2.5, armor: 0, impact: 1.0, mass: 0.9,
    heal: 18, healRange: 13.5,
    desc: "後方から負傷した味方を回復する。硬い前衛と組むと粘るが、自分では戦えない。", icon: "cross" }),
  zeus: D({ kind: "zeus", faction: "mystic", name: "ゼウス", en: "ZEUS", role: "雷神", cost: 500, hp: 260, dmg: 60, range: 22,
    speed: 2.9, windup: 1.40, cooldown: 2.00, aggro: 22, ranged: true, radius: 0.82, height: 3.5, armor: 2, impact: 2.4, mass: 1.4,
    projSpeed: 62, proj: "bolt", aoe: 1.1, chain: 5,
    desc: "雷霆が次々と敵を走る。数で押す軍を焼き払うが、撃つ間隔が長く護衛が要る。", icon: "zeus" }),

  robot: D({ kind: "robot", faction: "machine", name: "戦闘ロボット", en: "BATTLE ROBOT", role: "重装甲", cost: 150, hp: 240, dmg: 26, range: 2.0,
    speed: 4.1, windup: 0.80, cooldown: 1.10, aggro: 18, ranged: false, radius: 0.62, height: 2.6, armor: 8, impact: 2.1, mass: 1.9,
    desc: "鋼の装甲が矢や短剣を弾く。弩・銃・戟のような重い一撃でしか止まらない。", icon: "robot" }),
  tank: D({ kind: "tank", faction: "machine", name: "蒸気戦車", en: "STEAM TANK", role: "重砲", cost: 340, hp: 480, dmg: 42, range: 24,
    speed: 2.4, windup: 1.40, cooldown: 2.20, aggro: 24, ranged: true, radius: 1.25, height: 2.8, armor: 9, impact: 7.5, mass: 3.6,
    projSpeed: 28, proj: "cannon", aoe: 2.2, pierce: 1,
    desc: "分厚い装甲と榴弾。軽い攻撃はほぼ通らないが、鈍重で一発ずつしか撃てない。", icon: "tank" }),
  railgun: D({ kind: "railgun", faction: "machine", name: "電磁砲兵", en: "RAILGUNNER", role: "狙撃", cost: 260, hp: 70, dmg: 110, range: 34,
    speed: 2.6, windup: 2.20, cooldown: 3.00, aggro: 30, ranged: true, radius: 0.62, height: 2.5, armor: 1, impact: 6.5, mass: 1.4,
    projSpeed: 62, proj: "rail", pierce: 3,
    desc: "列ごと貫く超長射程の一撃。大物と縦列に絶大だが、装填が長く群れには間に合わない。", icon: "railgun" }),

  sapper: D({ kind: "sapper", faction: "warband", name: "樽爆兵", en: "KEG RUNNER", role: "自爆", cost: 90, hp: 55, dmg: 70, range: 1.9,
    speed: 5.0, windup: 0.25, cooldown: 1.0, aggro: 18, ranged: false, radius: 0.56, height: 2.4, armor: 0, impact: 9.0, mass: 1.0,
    aoe: 3.4, detonate: true,
    desc: "火薬樽を抱えて走り込み、敵陣のど真ん中で自爆する。倒されてもその場で爆発する。届く前に撃ち落とせ。", icon: "bomb" }),
  necromancer: D({ kind: "necromancer", faction: "undead", name: "死霊術師", en: "NECROMANCER", role: "召喚", cost: 150, hp: 60, dmg: 12, range: 18,
    speed: 3.0, windup: 1.10, cooldown: 1.40, aggro: 20, ranged: true, radius: 0.52, height: 2.8, armor: 0, impact: 1.2, mass: 0.85,
    projSpeed: 22, proj: "bolt", summon: 5,
    desc: "戦っている間じゅうスケルトンを呼び出し続ける。本人は弱い。長引くほど不利になるので真っ先に討て。", icon: "skull" }),
  catapult: D({ kind: "catapult", faction: "machine", name: "投石機", en: "CATAPULT", role: "攻城", cost: 280, hp: 200, dmg: 60, range: 42,
    speed: 1.8, windup: 2.40, cooldown: 4.00, aggro: 40, ranged: true, radius: 1.2, height: 2.6, armor: 3, impact: 12.0, mass: 3.5,
    projSpeed: 20, proj: "cannon", aoe: 3.6, minRange: 12,
    desc: "戦場の端から大岩を放り込み、隊列を丸ごと吹き飛ばす。弾は遅く、12m以内には撃てない。懐に入れば無力。", icon: "tank" }),

  zombie: D({ kind: "zombie", faction: "undead", name: "ゾンビ", en: "ZOMBIE", role: "物量", cost: 20, hp: 50, dmg: 7, range: 1.9,
    speed: 2.5, windup: 0.90, cooldown: 0.80, aggro: 13, ranged: false, radius: 0.52, height: 2.2, armor: 0, impact: 1.3, mass: 0.9,
    desc: "遅くて弱いが、とにかく安い。単発の重い攻撃を無駄撃ちさせる肉の壁。", icon: "skull" }),
  skeleton: D({ kind: "skeleton", faction: "undead", name: "スケルトン", en: "SKELETON", role: "軽歩兵", cost: 30, hp: 50, dmg: 9, range: 1.95,
    speed: 4.0, windup: 0.55, cooldown: 0.65, aggro: 15, ranged: false, radius: 0.5, height: 2.4, armor: 0, impact: 1.5, mass: 0.85,
    desc: "足の速い骨の剣士。数で囲んで背後を突くが、薙ぎ払いと爆発で一掃される。", icon: "bone" }),
  bonearcher: D({ kind: "bonearcher", faction: "undead", name: "骨弓兵", en: "BONE ARCHER", role: "射撃", cost: 55, hp: 38, dmg: 11, range: 20,
    speed: 3.3, windup: 1.00, cooldown: 1.00, aggro: 21, ranged: true, radius: 0.5, height: 2.4, armor: 0, impact: 0.9, mass: 0.6,
    projSpeed: 28, proj: "arrow",
    desc: "安く揃う骸骨の射手。射程も威力も弓兵に劣るが、数が出る。", icon: "boneshot" }),
  vampire: D({ kind: "vampire", faction: "undead", name: "吸血鬼", en: "VAMPIRE", role: "吸血", cost: 180, hp: 190, dmg: 24, range: 2.1,
    speed: 4.8, windup: 0.60, cooldown: 0.70, aggro: 20, ranged: false, radius: 0.58, height: 2.5, armor: 1, impact: 2.1, mass: 1.2, lifesteal: 0.4, cleave: 1.25,
    desc: "斬るたびに体力を吸う。弱い前衛を餌にして回復するので、盾か集中火力で止める。", icon: "vampire" }),
};

/** Pierce count for a unit kind (how many bodies a shot passes through). */
export function pierceFor(kind: UnitKind): number {
  return DEFS[kind].pierce ?? 0;
}

export interface FactionInfo { id: Faction; name: string; en: string; color: string; units: UnitKind[] }
export const FACTIONS: FactionInfo[] = [
  { id: "kingdom", name: "王国軍", en: "KINGDOM", color: "#6aa7f5", units: ["spear", "guardian", "archer", "swordsman", "crossbow", "halberdier", "knight", "paladin", "king"] },
  { id: "warband", name: "蛮族", en: "WARBAND", color: "#e48a4a", units: ["orc", "berserker", "javelin", "bomber", "shaman", "troll", "giant", "pirate", "sapper"] },
  { id: "mystic", name: "神秘", en: "MYSTIC", color: "#b58cff", units: ["elf", "monk", "assassin", "mage", "frost", "cleric", "zeus"] },
  { id: "undead", name: "不死", en: "UNDEAD", color: "#9fc27a", units: ["zombie", "skeleton", "bonearcher", "vampire", "necromancer"] },
  { id: "machine", name: "機械", en: "MACHINE", color: "#8fa2b8", units: ["robot", "tank", "railgun", "catapult"] },
];
export const FACTION_UNITS: Record<Faction, UnitKind[]> = Object.fromEntries(FACTIONS.map(f => [f.id, f.units])) as Record<Faction, UnitKind[]>;
export const DEPLOY: UnitKind[] = FACTIONS.flatMap(f => f.units);
export const ALL_KINDS: UnitKind[] = DEPLOY;

export const TEAM_COLORS = [0x3f7fd6, 0xd0453a];
export const TEAM_COLORS_CSS = ["#5f9bea", "#e8604f"];
export const START_GOLD = 600;
export const GOLD_CAP = 3000;
export const SANDBOX_BUDGET = 3000;
export const MAX_PER_TEAM = 50;
export const MAX_TOTAL = 100;
export const FIELD = { x: 78, z: 52 };

/* ============ shared geometry & materials ============ */

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.SphereGeometry(1, 12, 9),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 10),
  quadCone: new THREE.ConeGeometry(1, 1, 4),
  dome: new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
  tor: new THREE.TorusGeometry(1, 0.11, 6, 14, Math.PI),
  ring: new THREE.TorusGeometry(1, 0.06, 6, 20),
};

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function M(color: number, rough = 0.85, metal = 0.08): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}|${metal}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    matCache.set(key, m);
  }
  return m;
}
