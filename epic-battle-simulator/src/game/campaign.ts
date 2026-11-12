import { DEFS, type UnitKind } from "./units";

export type Pattern = "line" | "block" | "wedge" | "flank" | "arc";

export interface EnemyGroup { kind: UnitKind; count: number; x: number; z: number; pattern: Pattern }
export interface Stage {
  id: number;
  scene: number;
  name: string;
  hint: string;
  budget: number;
  unlock: UnitKind[];
  enemies: EnemyGroup[];
}

export interface SceneInfo { id: number; name: string; sub: string; color: string }
export const SCENES: SceneInfo[] = [
  { id: 1, name: "辺境の荒野", sub: "不死の軍勢", color: "#9fc27a" },
  { id: 2, name: "裂け谷", sub: "蛮族の襲撃", color: "#e48a4a" },
  { id: 3, name: "霜の峠", sub: "神秘の守護者と機械兵", color: "#b58cff" },
  { id: 4, name: "王都決戦", sub: "全軍総力戦", color: "#e0503f" },
];

/** Available before clearing stage 1. */
export const STARTER_UNITS: UnitKind[] = ["spear", "guardian", "archer"];

type Roster = [UnitKind, number][];

/** One uniform rule for every stage: the player always gets this share of the enemy army's cost. */
export const BUDGET_RATIO = 0.9;

/**
 * Every enemy army deploys by the same drill, so the player can read it at a glance:
 * shield wall first, polearms behind it, other foot behind them, shooters and casters at the back,
 * healers last, and hunters (assassins, cavalry) split onto both wings.
 */
function formation(army: Roster): EnemyGroup[] {
  const row = (k: UnitKind) => {
    const d = DEFS[k];
    if (d.hunter) return "wing";
    if (d.heal && !d.shield) return "support";
    if (d.ranged) return "shot";
    if ((d.shield ?? 0) >= 0.5) return "wall";
    return d.brace ? "pole" : "foot";
  };
  const out: EnemyGroup[] = [];
  let x = 8;
  for (const r of ["wall", "pole", "foot"]) {
    for (const [kind, count] of army) {
      if (row(kind) !== r) continue;
      const block = r === "foot" && DEFS[kind].radius < 0.9 && count >= 6;
      out.push({ kind, count, x, z: 0, pattern: block ? "block" : "line" });
      x += block ? Math.ceil(Math.sqrt(count)) * 2.3 + 0.6 : 2.8;
    }
  }
  let back = Math.max(22, x + 7);
  for (const r of ["shot", "support"]) {
    for (const [kind, count] of army) {
      if (row(kind) !== r) continue;
      out.push({ kind, count, x: back, z: 0, pattern: "line" });
      back += 3;
    }
  }
  for (const [kind, count] of army) if (row(kind) === "wing") out.push({ kind, count, x: 10, z: 0, pattern: "flank" });
  return out.map(e => ({ ...e, x: Math.round(e.x * 2) / 2 }));
}

const stage = (id: number, name: string, hint: string, unlock: UnitKind[], army: Roster): Stage => {
  const cost = army.reduce((sum, [k, n]) => sum + DEFS[k].cost * n, 0);
  return { id, scene: Math.min(4, Math.ceil(id / 5)), name, hint, unlock, enemies: formation(army), budget: Math.round((cost * BUDGET_RATIO) / 25) * 25 };
};

export const STAGES: Stage[] = [
  // ---- Scene 1: Borderland Wastes (Undead) ----
  stage(1, "墓地の夜", "骨弓兵の矢は盾兵が止める。ただし盾兵は敵を倒せない。壁の後ろに槍と弓を置き、役割を分けよう。", ["swordsman"], [["zombie", 6], ["skeleton", 8], ["orc", 3], ["bonearcher", 4]]),
  stage(2, "霧の街道", "足の速いスケルトンが射手に取り付くと、弓は撃てなくなる。爆弾は盾を無視して密集を吹き飛ばす。", ["zombie", "skeleton"], [["skeleton", 8], ["orc", 3], ["bonearcher", 4], ["bomber", 2]]),
  stage(3, "廃村の包囲", "オークの大斧は隣の兵まで巻き込む。爆弾兵が2人いるので、固まりすぎず、射手で先に削ろう。", ["crossbow"], [["skeleton", 10], ["orc", 4], ["bonearcher", 4], ["bomber", 3]]),
  stage(4, "朽ちた関所", "呪術師の呪いは範囲内の移動と攻撃を鈍らせる。数で押す骨の群れに、単発の重い矢は間に合わない。", ["cleric"], [["shaman", 1], ["skeleton", 10], ["zombie", 6], ["orc", 2], ["bonearcher", 4], ["bomber", 1]]),
  stage(5, "闇の主", "吸血鬼は斬るたびに回復する。弱い前衛は餌になるだけ。盾で受け、火力を一体に集めて落とせ。", ["halberdier", "bonearcher", "necromancer"], [["vampire", 2], ["skeleton", 16], ["bonearcher", 5], ["bomber", 2]]),

  // ---- Scene 2: Rift Canyon (Warband) ----
  stage(6, "峡谷の哨戒", "投槍は射程こそ短いが盾兵を転ばせる。転んだ兵に盾は効かない。投槍兵に届く手を用意しよう。", ["orc"], [["orc", 7], ["javelin", 6], ["berserker", 2], ["bomber", 1]]),
  stage(7, "赤土の野営", "狂戦士は駆け込んでくる。その速さは槍衾の餌食だ。後衛まで走らせないよう長柄で受け止めよ。", ["javelin"], [["orc", 6], ["berserker", 5], ["javelin", 5], ["shaman", 1], ["bomber", 1]]),
  stage(8, "火薬庫", "爆弾兵が4人。盾も密集も無意味になる。散らして置くか、撃たれる前に爆弾兵を黙らせる手を。", ["berserker", "sapper"], [["orc", 8], ["berserker", 6], ["bomber", 4], ["javelin", 2]]),
  stage(9, "再生する巨体", "トロールは削っても再生する。少しずつ殴るのは無駄だ。重い一撃を集めて一気に倒せ。", ["bomber"], [["troll", 2], ["orc", 6], ["javelin", 5], ["berserker", 4]]),
  stage(10, "巨人の谷", "巨人は歩兵を隊列ごと叩き飛ばす。殴り合わず、弩や投槍の重い射撃を壁の後ろから浴びせよう。", ["shaman", "pirate"], [["giant", 1], ["orc", 6], ["berserker", 4], ["javelin", 4], ["bomber", 2], ["shaman", 1]]),

  // ---- Scene 3: Frost Pass (Mystic) ----
  stage(11, "雪林の関", "エルフはこちらの弓より遠くから射ってくる。ロボットの装甲に軽い矢は通らない。刺客は後衛を狙う。", ["monk"], [["monk", 8], ["robot", 2], ["elf", 6], ["assassin", 4], ["mage", 2]]),
  stage(12, "氷結の坂", "盾壁の後ろから氷と炎が飛ぶ。足を止められた軍は的になる。刺客に張り付かれる前に後衛を守れ。", ["elf"], [["guardian", 4], ["monk", 6], ["robot", 2], ["assassin", 5], ["frost", 2], ["mage", 2], ["elf", 4]]),
  stage(13, "霧隠れの峠", "刺客が7人、両翼から射手を狩りに来る。魔術師は密集を焼く。護衛を付け、隊列は詰めすぎるな。", ["assassin"], [["monk", 8], ["robot", 2], ["mage", 4], ["assassin", 7], ["elf", 4]]),
  stage(14, "魔導陣", "盾・ロボット・僧侶で粘り、魔法で削る持久の陣。回復が追いつかない火力か、後衛を崩す手が要る。", ["mage"], [["guardian", 4], ["monk", 6], ["robot", 2], ["mage", 3], ["frost", 2], ["cleric", 2], ["assassin", 5], ["elf", 3]]),
  stage(15, "氷峰の祭壇", "ゼウスの雷は兵から兵へ走る。数で押すほど被害が増える。ロボットには重い一撃を、雷神には速い刃を。", ["frost", "knight"], [["robot", 4], ["monk", 6], ["zeus", 1], ["mage", 3], ["cleric", 1], ["assassin", 4], ["elf", 3]]),

  // ---- Scene 4: Royal Citadel (All Factions) ----
  stage(16, "外郭門", "王国の正規軍。大盾の壁に矢は通らず、弩と弓が後ろから撃ってくる。壁を壊すのは爆発か回り込みだ。", ["robot", "paladin"], [["guardian", 8], ["halberdier", 5], ["crossbow", 6], ["archer", 6], ["knight", 2], ["cleric", 1]]),
  stage(17, "燃える広場", "重騎兵4騎が後衛へ突っ込んでくる。槍衾なしでは止まらない。爆弾と魔法も密集を狙っている。", ["vampire", "troll"], [["guardian", 6], ["swordsman", 4], ["spear", 6], ["knight", 4], ["bomber", 3], ["mage", 2], ["archer", 6]]),
  stage(18, "王宮回廊", "聖騎士が前線を癒やし、電磁砲が縦列を貫く。縦に並ぶな。刺客6人と騎兵が両翼から来る。", ["king"], [["paladin", 2], ["guardian", 6], ["halberdier", 5], ["railgun", 2], ["assassin", 6], ["knight", 2], ["archer", 4], ["crossbow", 3]]),
  stage(19, "玉座の前", "王の周囲は3割強くなる。戦車の装甲は軽い攻撃を通さない。王と戦車、どちらから崩すか決めて組め。", ["railgun"], [["king", 1], ["tank", 1], ["guardian", 6], ["halberdier", 5], ["spear", 4], ["knight", 2], ["assassin", 5], ["archer", 4], ["crossbow", 4], ["mage", 2], ["cleric", 1]]),
  stage(20, "王都決戦", "王・雷神・大盾・槍衾・騎兵・刺客・弩。弱点のない軍はない。敵のどの兵に何を当てるか、全てを使え。", ["catapult"], [["king", 1], ["zeus", 1], ["guardian", 8], ["spear", 8], ["halberdier", 4], ["knight", 3], ["assassin", 4], ["crossbow", 6], ["cleric", 1]]),

  // ---- Extra: beyond the throne ----
  stage(21, "奈落の門", "樽爆兵は盾壁ごと吹き飛ばし、死霊術師は骨を呼び続け、投石機は遠くから隊列を潰す。待てば負ける。何から黙らせる？", ["giant", "tank", "zeus"],
    [["guardian", 8], ["spear", 8], ["halberdier", 4], ["sapper", 4], ["knight", 3], ["assassin", 4], ["necromancer", 2], ["crossbow", 7], ["elf", 3], ["catapult", 1], ["cleric", 1]]),
];

/** Units usable once `cleared` stages are done (0 = nothing cleared yet). */
export function unlockedThrough(cleared: number): UnitKind[] {
  const set = new Set<UnitKind>(STARTER_UNITS);
  for (let i = 0; i < Math.min(cleared, STAGES.length); i++) for (const k of STAGES[i].unlock) set.add(k);
  return [...set];
}

export function stagePositions(gr: EnemyGroup): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const n = gr.count;
  const sp = 2.3;
  switch (gr.pattern) {
    case "line":
      for (let i = 0; i < n; i++) out.push({ x: gr.x, z: gr.z + (i - (n - 1) / 2) * sp });
      break;
    case "block": {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      for (let i = 0; i < n; i++) out.push({ x: gr.x + Math.floor(i / cols) * sp, z: gr.z + (i % cols - (cols - 1) / 2) * sp });
      break;
    }
    case "wedge": {
      let rank = 0, placed = 0;
      while (placed < n) {
        const inRank = Math.min(n - placed, rank + 1);
        for (let i = 0; i < inRank; i++) out.push({ x: gr.x + rank * sp, z: gr.z + (i - (inRank - 1) / 2) * sp });
        placed += inRank;
        rank++;
      }
      break;
    }
    case "flank": {
      const half = Math.ceil(n / 2);
      for (let i = 0; i < n; i++) {
        const side = i < half ? -1 : 1;
        const idx = i < half ? i : i - half;
        const per = i < half ? half : n - half;
        out.push({ x: gr.x + (idx % 3) * sp, z: side * 16 + (Math.floor(idx / 3) - (Math.ceil(per / 3) - 1) / 2) * sp });
      }
      break;
    }
    case "arc": {
      const spread = Math.min(Math.PI * 0.9, 0.34 * n);
      for (let i = 0; i < n; i++) {
        const a = n === 1 ? 0 : -spread / 2 + (i / (n - 1)) * spread;
        out.push({ x: gr.x + Math.abs(Math.sin(a)) * 6, z: gr.z + Math.cos(a) * 12 });
      }
      break;
    }
  }
  return out;
}

export function enemyCost(stage: Stage): number {
  return stage.enemies.reduce((sum, e) => sum + DEFS[e.kind].cost * e.count, 0);
}

/** Enemy head-count per kind, in deployment order, for the pre-battle briefing. */
export function enemyRoster(stage: Stage): [UnitKind, number][] {
  const m = new Map<UnitKind, number>();
  for (const e of stage.enemies) m.set(e.kind, (m.get(e.kind) ?? 0) + e.count);
  return [...m];
}

/* ---- progress persistence ---- */

const KEY = "ebs.story.cleared";
let memoryCleared = 0;

export function loadCleared(): number {
  try {
    if (typeof window !== "undefined" && "localStorage" in window && window.localStorage) {
      const raw = window.localStorage.getItem(KEY);
      if (raw !== null) {
        const n = parseInt(raw, 10);
        if (Number.isFinite(n)) {
          memoryCleared = Math.max(memoryCleared, Math.max(0, Math.min(STAGES.length, n)));
        }
      }
    }
  } catch {
    /* storage blocked or unavailable — fall back to in-memory state */
  }
  return memoryCleared;
}

export function saveCleared(cleared: number) {
  const clamped = Number.isFinite(cleared) ? Math.max(0, Math.min(STAGES.length, Math.floor(cleared))) : 0;
  memoryCleared = Math.max(memoryCleared, clamped);
  try {
    if (typeof window !== "undefined" && "localStorage" in window && window.localStorage) {
      window.localStorage.setItem(KEY, String(memoryCleared));
    }
  } catch {
    /* storage blocked or unavailable — progress remains preserved in memoryCleared */
  }
}
