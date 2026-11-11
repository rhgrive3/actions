import { Vector3 } from "three";
import {
  DEFS, FIELD, MAX_PER_TEAM, MAX_TOTAL, SANDBOX_BUDGET, START_GOLD, pierceFor,
  type ProjectileStyle, type TeamId, type UnitDef, type UnitKind,
} from "./units";
import { STAGES, stagePositions, unlockedThrough, type Stage } from "./campaign";
import { terrainClear, terrainObstacles } from "./terrain";

export type Phase = "menu" | "setup" | "playing" | "paused" | "over";
export type Order = "auto" | "move" | "hold" | "attack";
export type Formation = "box" | "line" | "wedge" | "scatter";
export const FIXED_STEP = 1 / 60;
export const DEPLOY_EDGE = -3;
export const RESULT_DELAY = 3;
export const CORPSE_TIME = 4.4;

export interface CombatUnit {
  id: number;
  kind: UnitKind;
  team: TeamId;
  position: Vector3;
  velocity: Vector3;
  knock: Vector3;
  lastHit: Vector3;
  hp: number;
  maxHp: number;
  targetId: number | null;
  supportId: number | null;
  destination: Vector3 | null;
  order: Order;
  windup: number | null;
  cooldown: number;
  healCd: number;
  supportTimer: number;
  animation: number;
  thinkTimer: number;
  facing: number;
  gait: number;
  flinch: number;
  slowT: number;
  charge: number;
  chargeReady: boolean;
  chargeRun: number;
  /** A shooter with an enemy on top of it has dropped the bow for a knife. */
  sidearm: boolean;
  /** Smoothed movement speed: how much momentum the unit carries into contact. */
  pace: number;
  /** Knockdown state. */
  airborne: boolean;
  downTime: number;
  getUp: number;
  spin: number;
  spinAxis: number;
  dead: boolean;
  deathTime: number;
  /** Per-unit combat telemetry for MVP & inspector. */
  kills: number;
  damageDealt: number;
  scratch: Vector3;
}

export interface Projectile {
  id: number;
  team: TeamId;
  style: ProjectileStyle;
  /** Shooter unit id & pierce count so piercing works even if shooter dies mid-flight. */
  attackerId: number;
  pierce: number;
  /** Remaining extra targets for chain lightning / piercing shots. */
  chains: number;
  /** Targets already hit (piercing shots keep going through these). */
  hitIds: number[];
  position: Vector3;
  velocity: Vector3;
  targetId: number;
  damage: number;
  impact: number;
  slow: number;
  aoe: number;
  speed: number;
  gravity: number;
  life: number;
  scratch: Vector3;
  scratch2: Vector3;
}

export interface BattleEvent {
  type:
    | "spawn" | "swing" | "arrow" | "quarrel" | "bolt" | "bomb" | "boom" | "hit"
    | "launch" | "land" | "death" | "charge" | "heal" | "block"
    | "pistol" | "rail" | "lightning";
  position: Vector3;
  team: TeamId;
  value?: number;
  /** Optional second point (for lightning arcs and ranged impacts). */
  target?: Vector3;
}

export interface MvpStats {
  id: number;
  kind: UnitKind;
  team: TeamId;
  kills: number;
  damage: number;
}

export interface EndStats {
  winner: TeamId | null;
  time: number;
  kills: [number, number];
  losses: [number, number];
  spawned: [number, number];
  damageDealt?: [number, number];
  mvp?: MvpStats | null;
}

export interface DeployResult {
  count: number;
  reason: "funds" | "limit" | "zone" | "inactive" | "occupied" | "locked" | null;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const radius = (u: CombatUnit) => DEFS[u.kind].radius;
const centerHeight = (u: CombatUnit) => DEFS[u.kind].height * 0.55;
const planarDistanceSq = (a: Vector3, b: Vector3) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
/** Side and rear hits. */
export const FLANK_MULT = 1.3;
/** Flat armour can never absorb more than this share of a hit. */
export const ARMOR_FLOOR = 0.3;
/** Shields at or above this frontal block are tower shields: wide enough to cover the rank behind. */
export const TOWER_SHIELD = 0.5;
/** Hunters treat shooters, casters and healers as this much closer (squared distance weight). */
const HUNTER_WEIGHT = 0.08;
/** Braced polearms gain nothing against walkers and their full bonus against a gallop. */
export const BRACE_MIN_PACE = 3.6;
export const BRACE_FULL_PACE = 6.0;
/** Seconds of open gallop a rider needs before the lance is couched again. */
export const CHARGE_REARM_RUN = 1.2;
/** Armies keep formation until first blood, or until opposing units are this close. */
export const ENGAGE_DISTANCE = 12;
/** A blast is full strength at its centre and fades to this share at its rim. */
export const BLAST_RIM = 0.5;
/** An enemy this close pins a shooter: no shots, only a weak knife. */
export const SIDEARM_LOCK = 6.0;
const SIDEARM_REACH = 2.2;
const PIN_MAX_RADIUS = 0.8;
export const SIDEARM_DAMAGE = 3;
const SIDEARM_WINDUP = 0.6;
const SIDEARM_COOLDOWN = 1.0;
const GRAVITY: Record<ProjectileStyle, number> = {
  arrow: 8, quarrel: 4, bolt: 0, bomb: 18, javelin: 11, pistol: 2, cannon: 14, rail: 0,
};

// The simulation owns no DOM, meshes, audio, or wall-clock timers.
export class BattleSimulation {
  phase: Phase = "menu";
  speed = 1;
  time = 0;
  units: CombatUnit[] = [];
  projectiles: Projectile[] = [];
  /** Fixed budget. Nothing is earned during a battle. */
  gold: [number, number] = [START_GOLD, START_GOLD];
  kills: [number, number] = [0, 0];
  losses: [number, number] = [0, 0];
  spawned: [number, number] = [0, 0];
  damageDealt: [number, number] = [0, 0];
  result: EndStats | null = null;
  eliminationTime = 0;
  /** Kinds the player may deploy. */
  unlocked: Set<UnitKind> = new Set(unlockedThrough(0));
  /** Custom mode allows placing both sides & battle reinforcements. */
  allowBattleDeploy = true;
  customSetup = false;
  sceneIndex = 0;

  private accumulator = 0;
  private nextId = 1;
  private randomState = 1;
  private events: BattleEvent[] = [];
  private deploymentHistory: number[][] = [];
  private grid = new Map<string, CombatUnit[]>();
  private byId = new Map<number, CombatUnit>();
  private avoidSides = new Map<string, number>();
  /** Until the lines meet, each army advances at the pace of its slowest fighter so it arrives as one formation. */
  private marchSpeed: [number, number] = [Infinity, Infinity];
  engaged = false;

  constructor(seed = 2026) {
    this.randomState = seed >>> 0;
  }

  private random() {
    this.randomState = (this.randomState + 0x6d2b79f5) >>> 0;
    let t = this.randomState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private clearAvoidSides(id: number) {
    const prefix = `${id}:`;
    for (const key of this.avoidSides.keys()) {
      if (key.startsWith(prefix)) this.avoidSides.delete(key);
    }
  }

  /** Custom battle: preset demo armies with free budget and all units. */
  setupSandbox() {
    this.reset(false);
    this.customSetup = true;
    this.allowBattleDeploy = true;
    this.unlocked = new Set(Object.keys(DEFS) as UnitKind[]);
    this.gold = [SANDBOX_BUDGET, SANDBOX_BUDGET];
    const rows: [TeamId, UnitKind, number, number][] = [
      [0, "spear", -24, 8], [0, "archer", -32, 4],
      [0, "elf", -36, 2], [0, "knight", -23, 1], [0, "mage", -38, 1],
      [1, "orc", 24, 6], [1, "zombie", 20, 4],
      [1, "archer", 32, 4], [1, "knight", 23, 1], [1, "mage", 38, 1],
    ];
    for (const [team, kind, x, count] of rows) {
      for (let i = 0; i < count; i++) {
        const z = kind === "knight" ? -18 : kind === "mage" ? 13 : (i - (count - 1) / 2) * 3.3;
        this.spawn(team, kind, x, z);
      }
    }
    this.events = [];
  }

  /** Clears both armies in custom battle setup so players can build from scratch. */
  clearUnits() {
    if (this.phase !== "setup" || !this.allowBattleDeploy) return false;
    this.units = [];
    this.byId.clear();
    this.avoidSides.clear();
    this.projectiles = [];
    this.deploymentHistory = [];
    this.grid.clear();
    this.gold = [SANDBOX_BUDGET, SANDBOX_BUDGET];
    this.kills = [0, 0];
    this.losses = [0, 0];
    this.spawned = [0, 0];
    this.damageDealt = [0, 0];
    this.events = [];
    return true;
  }

  clearArmies() {
    return this.clearUnits();
  }

  /** Story: fixed budget, unlocked roster, and the stage's enemy layout. */
  setupStage(stage: Stage, cleared: number) {
    this.reset(false);
    this.sceneIndex = stage.scene;
    this.allowBattleDeploy = false;
    this.unlocked = new Set(unlockedThrough(cleared));
    this.gold = [stage.budget, stage.budget];
    for (const group of stage.enemies) {
      for (const p of stagePositions(group)) this.spawn(1, group.kind, p.x, p.z);
    }
    this.events = [];
  }

  reset(withArmies = true) {
    this.phase = "setup";
    this.speed = 1;
    this.time = 0;
    this.accumulator = 0;
    this.nextId = 1;
    this.customSetup = false;
    this.sceneIndex = 0;
    this.units = [];
    this.byId.clear();
    this.avoidSides.clear();
    this.projectiles = [];
    this.events = [];
    this.deploymentHistory = [];
    this.grid.clear();
    this.gold = [START_GOLD, START_GOLD];
    this.kills = [0, 0];
    this.losses = [0, 0];
    this.spawned = [0, 0];
    this.damageDealt = [0, 0];
    this.result = null;
    this.eliminationTime = 0;
    if (!withArmies) return;
  }

  /** Every unit type lined up facing the camera, for inspecting designs. */
  showcase() {
    this.reset(false);
    this.allowBattleDeploy = false;
    this.unlocked = new Set(Object.keys(DEFS) as UnitKind[]);
    const kinds = Object.keys(DEFS) as UnitKind[];
    kinds.forEach((kind, i) => {
      const x = (i - (kinds.length - 1) / 2) * 3.1;
      for (const team of [0, 1] as const) this.spawn(team, kind, x, team === 0 ? -4.5 : 5).facing = 0;
    });
    this.events = [];
  }

  begin() {
    if (this.phase !== "setup" || this.count(0) === 0 || this.count(1) === 0) return false;
    this.engaged = false;
    for (const team of [0, 1] as const) {
      let slowest = Infinity;
      for (const u of this.units) {
        const d = DEFS[u.kind];
        if (u.dead || u.team !== team || d.ranged || (d.heal && !d.shield)) continue;
        slowest = Math.min(slowest, d.speed);
      }
      this.marchSpeed[team] = slowest;
    }
    this.phase = "playing";
    this.accumulator = 0;
    return true;
  }

  togglePause() {
    if (this.phase === "playing") this.phase = "paused";
    else if (this.phase === "paused") this.phase = "playing";
    this.accumulator = 0;
  }

  count(team: TeamId) {
    let n = 0;
    for (const u of this.units) if (!u.dead && u.team === team) n++;
    return n;
  }

  /** Total current HP and max HP for a team, used by the live battle power bar. */
  teamHp(team: TeamId): [number, number] {
    let cur = 0, max = 0;
    for (const u of this.units) {
      if (u.team !== team) continue;
      max += u.maxHp;
      if (!u.dead) cur += Math.max(0, u.hp);
    }
    return [Math.round(cur), Math.round(max)];
  }

  get canUndo() {
    return this.phase === "setup" && this.deploymentHistory.length > 0;
  }

  getUnit(id: number | null) {
    if (id === null) return undefined;
    const u = this.byId.get(id);
    return u && !u.dead ? u : undefined;
  }

  /** True while the unit is flying or on the ground and unable to act. */
  isDown(u: CombatUnit) {
    return u.airborne || u.downTime > 0 || u.getUp > 0;
  }

  spawn(team: TeamId, kind: UnitKind, x: number, z: number) {
    const u: CombatUnit = {
      id: this.nextId++, kind, team,
      position: new Vector3(
        Number.isFinite(x) ? clamp(x, -FIELD.x + 1, FIELD.x - 1) : 0,
        0,
        Number.isFinite(z) ? clamp(z, -FIELD.z + 1, FIELD.z - 1) : 0,
      ),
      velocity: new Vector3(), knock: new Vector3(), lastHit: new Vector3(0, 0, 1),
      hp: DEFS[kind].hp, maxHp: DEFS[kind].hp,
      targetId: null, supportId: null, destination: null, order: "auto", windup: null,
      cooldown: this.random() * 0.25, healCd: 0, supportTimer: 0, animation: -1, thinkTimer: 0,
      facing: team === 0 ? Math.PI / 2 : -Math.PI / 2,
      gait: this.random() * Math.PI * 2, flinch: 0, slowT: 0,
      charge: 1, chargeReady: true, chargeRun: 0,
      pace: 0, sidearm: false,
      airborne: false, downTime: 0, getUp: 0, spin: 0, spinAxis: 1,
      dead: false, deathTime: 0, kills: 0, damageDealt: 0, scratch: new Vector3(),
    };
    this.units.push(u);
    this.resolveTerrain(u);
    this.byId.set(u.id, u);
    this.spawned[team]++;
    this.emit("spawn", u.position, team);
    return u;
  }

  isDeployPosition(x: number, z: number, team: TeamId = 0) {
    return Number.isFinite(x) && Number.isFinite(z)
      && Math.abs(x) <= FIELD.x - 2 && Math.abs(z) <= FIELD.z - 2
      && (team === 0 ? x <= DEPLOY_EDGE : x >= -DEPLOY_EDGE)
      && terrainClear(this.sceneIndex, x, z, 0.55);
  }

  deploy(kind: UnitKind, x: number, z: number, requested = 1, team: TeamId = 0): DeployResult {
    if ((this.phase !== "setup" && this.phase !== "playing")
      || (this.phase === "playing" && (!this.allowBattleDeploy || this.count(team) === 0))) return { count: 0, reason: "inactive" };
    if (team === 1 && (!this.allowBattleDeploy || this.phase !== "setup")) return { count: 0, reason: "inactive" };
    if (team === 0 && !this.unlocked.has(kind)) return { count: 0, reason: "locked" };
    if (!this.isDeployPosition(x, z, team)) return { count: 0, reason: "zone" };
    if (!Number.isFinite(requested) || requested < 1) return { count: 0, reason: "inactive" };
    const cost = DEFS[kind].cost;
    const capacity = Math.min(MAX_PER_TEAM - this.count(team), MAX_TOTAL - this.count(0) - this.count(1));
    if (capacity <= 0) return { count: 0, reason: "limit" };
    const count = Math.min(Math.floor(requested), 5, Math.floor(this.gold[team] / cost), capacity);
    if (count === 0) return { count: 0, reason: "funds" };
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      const spot = this.findSpawnPosition(x, z, kind, team);
      if (!spot) break;
      const u = this.spawn(team, kind, spot.x, spot.z);
      this.gold[team] -= cost;
      ids.push(u.id);
    }
    if (this.phase === "setup" && ids.length) this.deploymentHistory.push(ids);
    return { count: ids.length, reason: ids.length ? null : "occupied" };
  }

  /**
   * Fills the remaining budget with a generic textbook formation: a wall in front, reach weapons behind it,
   * shooters at the back and one specialist group. It reads nothing about the enemy, so it is a starting
   * point to edit, not an answer: stages that punish the textbook still need the player to adapt.
   */
  autoDeploy(team: TeamId = 0): number {
    if (this.phase !== "setup") return 0;
    if (team === 1 && !this.allowBattleDeploy) return 0;
    const available = team === 0 ? [...this.unlocked] : (Object.keys(DEFS) as UnitKind[]);
    if (!available.length) return 0;
    const sign = team === 0 ? -1 : 1;
    const per = (f: (d: UnitDef) => number) => (a: UnitKind, b: UnitKind) => f(DEFS[b]) / DEFS[b].cost - f(DEFS[a]) / DEFS[a].cost;
    const dps = (d: UnitDef) => d.dmg / (d.windup + d.cooldown);
    const foot = available.filter(k => !DEFS[k].ranged && !DEFS[k].hunter && !(DEFS[k].heal && !DEFS[k].shield));
    const wall = [...foot].sort(per(d => d.hp / (1 - (d.shield ?? 0))))[0];
    const reach = foot.filter(k => DEFS[k].brace).sort(per(dps))[0] ?? [...foot].filter(k => k !== wall).sort(per(dps))[0];
    const shooter = available.filter(k => DEFS[k].ranged && !DEFS[k].aoe).sort(per(d => dps(d) * Math.min(d.range, 30)))[0];
    const caster = available.filter(k => DEFS[k].ranged && DEFS[k].aoe).sort(per(dps))[0];
    const healer = available.filter(k => DEFS[k].heal && !DEFS[k].shield)[0];
    const hunter = available.filter(k => DEFS[k].hunter).sort(per(d => dps(d) * d.hp))[0];

    const budget = this.gold[team];
    const batchIds: number[] = [];
    const placeLine = (kind: UnitKind | undefined, spend: number, x: number, wings = false) => {
      if (!kind) return;
      const count = Math.floor(Math.min(spend, this.gold[team]) / DEFS[kind].cost);
      const step = Math.max(2.4, DEFS[kind].radius * 2 + 1.2);
      for (let i = 0; i < count; i++) {
        if (this.gold[team] < DEFS[kind].cost) break;
        const cap = Math.min(MAX_PER_TEAM - this.count(team), MAX_TOTAL - this.count(0) - this.count(1));
        if (cap <= 0) break;
        const perRow = 14;
        const row = Math.floor(i / perRow), col = i % perRow, inRow = Math.min(perRow, count - row * perRow);
        const z = wings
          ? (i % 2 ? 1 : -1) * (20 + Math.floor(i / 2) * 3)
          : clamp((col - (inRow - 1) / 2) * step, -44, 44);
        const spot = this.findSpawnPosition(sign * (x + row * 2.6), z, kind, team);
        if (!spot) continue;
        const u = this.spawn(team, kind, spot.x, spot.z);
        this.gold[team] -= DEFS[kind].cost;
        batchIds.push(u.id);
      }
    };

    const special = budget >= 600 ? 0.15 : 0;
    placeLine(wall, budget * 0.35, 9);
    placeLine(reach, budget * 0.25, 11.8);
    if (special) {
      const picks = [caster, healer, hunter].filter((k): k is UnitKind => !!k);
      for (const k of picks) placeLine(k, Math.max(DEFS[k].cost, (budget * special) / picks.length), k === hunter ? 12 : k === healer ? 29 : 25.5, k === hunter);
    }
    placeLine(shooter, this.gold[team], 21);
    // Whatever is left goes to the cheapest of the chosen kinds, front first.
    const chosen = [wall, reach, shooter].filter((k): k is UnitKind => !!k).sort((a, b) => DEFS[a].cost - DEFS[b].cost);
    const cheapest = [...available].sort((a, b) => DEFS[a].cost - DEFS[b].cost)[0];
    for (const k of [...chosen, cheapest]) {
      if (this.gold[team] >= DEFS[k].cost) placeLine(k, this.gold[team], DEFS[k].ranged ? 23.8 : 14.4);
    }

    if (batchIds.length > 0) this.deploymentHistory.push(batchIds);
    return batchIds.length;
  }

  private findSpawnPosition(x: number, z: number, kind: UnitKind, team: TeamId) {
    const r = DEFS[kind].radius;
    for (let i = 0; i < 96; i++) {
      const distance = i === 0 ? 0 : Math.sqrt(i) * 1.4;
      const angle = i * 2.399963;
      const p = new Vector3(x + Math.cos(angle) * distance, 0, z + Math.sin(angle) * distance);
      if (!this.isDeployPosition(p.x, p.z, team)) continue;
      if (!terrainClear(this.sceneIndex, p.x, p.z, r)) continue;
      if (this.units.every(u => u.dead || planarDistanceSq(u.position, p) > (radius(u) + r + 0.4) ** 2)) return p;
    }
    return null;
  }

  undoDeploy() {
    if (!this.canUndo) return false;
    const ids = new Set(this.deploymentHistory.pop());
    this.units = this.units.filter(u => {
      if (!ids.has(u.id)) return true;
      this.gold[u.team] += DEFS[u.kind].cost;
      this.spawned[u.team]--;
      this.byId.delete(u.id);
      this.clearAvoidSides(u.id);
      return false;
    });
    return true;
  }

  command(ids: Iterable<number>, order: Order, point?: Vector3, targetId?: number, formation: Formation = "box") {
    if (this.phase !== "setup" && this.phase !== "playing") return;
    const group = [...ids].map(id => this.getUnit(id)).filter((u): u is CombatUnit => !!u && u.team === 0);
    if (!group.length) return;
    if (order === "move" && (!point || !point.toArray().every(Number.isFinite))) return;
    const target = this.getUnit(targetId ?? null);
    if (order === "attack" && (!target || target.team === 0)) return;
    const n = group.length;
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / Math.max(1, cols));
    const halfX = (rows - 1) * 1.4, halfZ = (cols - 1) * 1.4;
    const centerX = point ? clamp(point.x, -FIELD.x + 2 + halfX, FIELD.x - 2 - halfX) : 0;
    const centerZ = point ? clamp(point.z, -FIELD.z + 2 + halfZ, FIELD.z - 2 - halfZ) : 0;
    const obstacles = terrainObstacles(this.sceneIndex);
    group.sort((a, b) => a.position.z - b.position.z || a.id - b.id);
    group.forEach((u, i) => {
      u.order = order;
      u.targetId = order === "attack" ? target!.id : null;
      if (order === "move" && point) {
        let dx = (Math.floor(i / cols) - (rows - 1) / 2) * 2.8;
        let dz = (i % cols - (cols - 1) / 2) * 2.8;
        if (formation === "line") {
          const lineCols = Math.max(1, Math.min(12, n));
          const lineRows = Math.ceil(n / lineCols);
          dx = (Math.floor(i / lineCols) - (lineRows - 1) / 2) * 2.6;
          dz = (i % lineCols - (lineCols - 1) / 2) * 2.4;
        } else if (formation === "wedge") {
          const rank = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2);
          const firstInRank = (rank * (rank + 1)) / 2;
          const posInRank = i - firstInRank;
          const countInRank = Math.min(rank + 1, n - firstInRank);
          dx = -rank * 2.4;
          dz = (posInRank - (countInRank - 1) / 2) * 2.6;
        } else if (formation === "scatter") {
          dx *= 1.65;
          dz *= 1.65;
        }
        let tx = clamp(centerX + dx, -FIELD.x + 2, FIELD.x - 2);
        let tz = clamp(centerZ + dz, -FIELD.z + 2, FIELD.z - 2);
        const r = radius(u);
        for (const o of obstacles) {
          const min = o.radius + r + 0.35;
          const ox = tx - o.x, oz = tz - o.z;
          const dist = Math.hypot(ox, oz);
          if (dist < min) {
            const ang = dist > 0.001 ? Math.atan2(oz, ox) : (i * 2.399963);
            tx = clamp(o.x + Math.cos(ang) * min, -FIELD.x + 2, FIELD.x - 2);
            tz = clamp(o.z + Math.sin(ang) * min, -FIELD.z + 2, FIELD.z - 2);
          }
        }
        u.destination = new Vector3(tx, 0, tz);
      } else {
        u.destination = null;
      }
      u.windup = null;
      u.animation = -1;
      u.thinkTimer = 0;
      if (order === "hold") u.velocity.set(0, 0, 0);
    });
  }

  nearestEnemy(unit: CombatUnit, range = Infinity) {
    return this.nearestOpponent(unit.position, unit.team, range);
  }

  private nearestOpponent(position: Vector3, team: TeamId, range: number, excludeId = -1, excludeList?: number[]) {
    let best: CombatUnit | undefined;
    let distance = range * range;
    for (const candidate of this.units) {
      if (candidate.dead || candidate.team === team || candidate.id === excludeId) continue;
      if (excludeList && excludeList.includes(candidate.id)) continue;
      const d = planarDistanceSq(position, candidate.position);
      if (d <= distance) { distance = d; best = candidate; }
    }
    return best;
  }

  /**
   * Target choice is deliberately simple and readable: everyone goes for the nearest enemy.
   * Hunters (assassin, cavalry) weigh shooters, casters and healers as if they were much closer,
   * so they dive the back line when a path around the front exists.
   */
  private pickTarget(u: CombatUnit, d: UnitDef) {
    if (u.order === "hold") return this.nearestEnemy(u, d.range);
    let best: CombatUnit | undefined;
    let bestScore = Infinity;
    for (const c of this.units) {
      if (c.dead || c.team === u.team) continue;
      let score = planarDistanceSq(u.position, c.position);
      if (d.hunter) {
        const cd = DEFS[c.kind];
        if (cd.ranged || cd.heal) score *= HUNTER_WEIGHT;
      }
      if (c.id === u.targetId) score *= 0.8;
      if (score < bestScore) { bestScore = score; best = c; }
    }
    return best;
  }

  /** Sum of the damage-buff auras covering a unit (King's presence). */
  buffFor(unit: CombatUnit): number {
    if (unit.kind === "king") return 0;
    let buff = 0;
    for (const a of this.units) {
      if (a.dead || a.team !== unit.team || a === unit) continue;
      const d = DEFS[a.kind];
      if (!d.buff) continue;
      if (planarDistanceSq(a.position, unit.position) > d.buffRange! * d.buffRange!) continue;
      buff = Math.max(buff, d.buff);
    }
    return buff;
  }

  /**
   * The whole damage model, in order:
   *  1. hits from the side or rear deal FLANK_MULT;
   *  2. a shield cuts frontal hits by its percentage (never explosions, never while knocked down);
   *  3. flat armour is subtracted from every hit, but a hit always keeps ARMOR_FLOOR of its strength.
   * Nothing else scales damage: no formation checks, no unit-vs-unit tables.
   */
  damage(unit: CombatUnit, amount: number, sourceTeam: TeamId, from?: Vector3, impact = 0, attackerId?: number, isAoE = false, melee = false): number {
    if (unit.dead || sourceTeam === unit.team || !Number.isFinite(amount) || amount <= 0) return 0;
    const def = DEFS[unit.kind];
    let dirMult = 1;
    let blocked = false;
    let nx = 0, nz = 0;
    if (from) {
      const dx = unit.position.x - from.x, dz = unit.position.z - from.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        nx = dx / len;
        nz = dz / len;
        unit.lastHit.set(nx, 0, nz);
        // Vector from defender toward attacker compared with defender's facing (+Z rotated by yaw).
        const dot = (-nx * Math.sin(unit.facing) + -nz * Math.cos(unit.facing));
        if (dot > 0.05) {
          if (def.shield && !this.isDown(unit) && !isAoE) {
            dirMult = 1 - def.shield;
            blocked = true;
          }
        } else {
          dirMult = FLANK_MULT;
        }
      }
    }
    const raw = amount * dirMult;
    const dealt = Math.min(unit.hp, Math.max(raw * ARMOR_FLOOR, raw - def.armor));
    // A melee blow staggers a shooter: the draw / reload starts over.
    if (melee && def.ranged && unit.windup !== null) unit.windup = def.windup;
    unit.hp = Math.max(0, unit.hp - dealt);
    unit.flinch = 0.26;
    this.damageDealt[sourceTeam] += dealt;
    this.engaged = true;
    const attacker = attackerId !== undefined ? this.byId.get(attackerId) : undefined;
    if (attacker) attacker.damageDealt += dealt;

    const power = Math.min(impact / def.mass, 15);
    if (from && (nx !== 0 || nz !== 0)) {
      if (power > 2.6 && !this.isDown(unit)) {
        // Proper launch: mostly horizontal, enough lift to clear the ground, and
        // the strength caps so a giant's blow never throws a man into orbit.
        const horiz = clamp(power * 1.55, 3, 15);
        const vert = clamp(2.1 + power * 0.5, 2.8, 8.5);
        unit.knock.set(nx * horiz, vert, nz * horiz);
        unit.airborne = true;
        unit.spin = 0;
        unit.spinAxis = 1;
        unit.windup = null;
        unit.animation = -1;
        unit.getUp = 0;
        unit.downTime = 0;
        this.emit("launch", unit.position, unit.team, power);
      } else {
        if (this.isDown(unit)) unit.downTime = Math.max(unit.downTime, 0.3);
        const push = blocked ? power * 1.0 : power * 1.7;
        unit.knock.x += nx * push;
        unit.knock.z += nz * push;
        unit.knock.clampLength(0, 10);
        if (power >= 1.5 && !def.ranged && -(unit.velocity.x * nx + unit.velocity.z * nz) > 0) {
          unit.velocity.multiplyScalar(0.35);
          unit.chargeRun = 0;
        }
      }
    }
    this.emit(blocked ? "block" : "hit", unit.position, unit.team, Math.round(dealt));
    if (unit.hp > 0) return dealt;

    // Fatal blow: let the corpse keep its launch/knockback momentum!
    unit.dead = true;
    unit.deathTime = 0;
    unit.velocity.set(0, 0, 0);
    unit.targetId = null;
    unit.windup = null;
    unit.animation = -1;
    unit.downTime = 0;
    unit.getUp = 0;
    if (!unit.airborne && (nx !== 0 || nz !== 0) && power > 1.8) {
      unit.knock.set(nx * Math.min(10, power * 1.1), Math.min(6.5, 1.6 + power * 0.45), nz * Math.min(10, power * 1.1));
      unit.airborne = true;
      unit.spin = 0;
      unit.spinAxis = nx * Math.sin(unit.facing) + nz * Math.cos(unit.facing) >= 0 ? 1 : -1;
    }
    this.kills[sourceTeam]++;
    this.losses[unit.team]++;
    if (attacker) attacker.kills++;
    this.emit("death", unit.position, unit.team);
    return dealt;
  }

  private heal(target: CombatUnit, amount: number) {
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    this.emit("heal", target.position, target.team, Math.round(target.hp - before));
  }

  advance(realSeconds: number) {
    if (this.phase !== "playing" || !Number.isFinite(realSeconds) || realSeconds <= 0) return;
    // Substeps keep combat and collision identical at 0.5x, 1x, 2x, and 4x.
    this.accumulator = Math.min(0.5, this.accumulator + Math.min(realSeconds, 0.25) * this.speed);
    while (this.accumulator + 1e-9 >= FIXED_STEP && this.phase === "playing") {
      this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
      this.step(FIXED_STEP);
    }
  }

  private step(dt: number) {
    this.time += dt;
    this.rebuildGrid();
    if (!this.engaged) this.engaged = this.linesHaveMet();
    for (const u of this.units) {
      if (u.dead) {
        u.deathTime += dt;
        if (u.airborne) {
          const prevX = u.position.x, prevZ = u.position.z;
          u.knock.y -= 18 * dt;
          const drag = Math.exp(-0.9 * dt);
          u.knock.x *= drag;
          u.knock.z *= drag;
          u.position.addScaledVector(u.knock, dt);
          u.position.y = clamp(u.position.y, 0, 16);
          if (!Number.isFinite(u.position.x)) u.position.x = prevX;
          if (!Number.isFinite(u.position.z)) u.position.z = prevZ;
          this.clampFieldAndSweepTerrain(u, prevX, prevZ);
          u.spin += dt * 7;
          if (u.position.y <= 0) {
            u.position.y = 0;
            u.airborne = false;
            u.knock.y = 0;
            u.knock.multiplyScalar(0.4);
            this.emit("land", u.position, u.team, u.knock.length());
          }
        } else {
          this.slide(u, dt, 7);
        }
        continue;
      }
      if (DEFS[u.kind].regen && u.hp < u.maxHp) {
        u.hp = Math.min(u.maxHp, u.hp + DEFS[u.kind].regen! * dt);
      }
      if (u.slowT > 0) u.slowT = Math.max(0, u.slowT - dt);
      this.updateKnockback(u, dt) || this.updateUnit(u, dt);
    }
    this.resolveBodyCollisions();
    this.updateProjectiles(dt);
    this.units = this.units.filter(u => {
      if (u.dead && u.deathTime >= CORPSE_TIME) {
        this.byId.delete(u.id);
        this.clearAvoidSides(u.id);
        return false;
      }
      return true;
    });
    this.checkEnd(dt);
  }

  /**
   * Physical non-overlapping body collision resolution:
   * Units occupy real physical space (radius) and cannot stack inside each other's bodies.
   * Frontline units actively engaged in melee brace their footing so rear ranks cannot shove them inside enemies.
   */
  private resolveBodyCollisions() {
    const n = this.units.length;
    for (let i = 0; i < n; i++) {
      const u = this.units[i];
      if (u.dead || u.airborne) continue;
      const ru = radius(u);
      const mu = DEFS[u.kind].mass;
      const uBraced = u.order === "hold" || (!DEFS[u.kind].ranged && (u.windup !== null || u.cooldown > 0));
      for (let j = i + 1; j < n; j++) {
        const other = this.units[j];
        if (other.dead || other.airborne) continue;
        const ro = radius(other);
        const minDist = ru + ro + 0.24;
        const dx = u.position.x - other.position.x;
        if (dx >= minDist || dx <= -minDist) continue;
        const dz = u.position.z - other.position.z;
        if (dz >= minDist || dz <= -minDist) continue;
        const dSq = dx * dx + dz * dz;
        if (dSq >= minDist * minDist) continue;
        const dist = Math.sqrt(dSq);
        let nx = 1, nz = 0;
        if (dist > 1e-4) {
          nx = dx / dist;
          nz = dz / dist;
        } else {
          const ang = (u.id * 2.399963) % (Math.PI * 2);
          nx = Math.cos(ang);
          nz = Math.sin(ang);
        }
        const overlap = (minDist - dist) * 0.8;
        const mo = DEFS[other.kind].mass;
        const oBraced = other.order === "hold" || (!DEFS[other.kind].ranged && (other.windup !== null || other.cooldown > 0));
        let uShare = mo / ((mu + mo) || 1);
        let oShare = mu / ((mu + mo) || 1);
        if (uBraced && !oBraced) { uShare = 0.06; oShare = 0.94; }
        else if (oBraced && !uBraced) { uShare = 0.94; oShare = 0.06; }
        const ux = u.position.x, uz = u.position.z;
        const ox = other.position.x, oz = other.position.z;
        u.position.x += nx * overlap * uShare;
        u.position.z += nz * overlap * uShare;
        other.position.x -= nx * overlap * oShare;
        other.position.z -= nz * overlap * oShare;
        this.clampFieldAndSweepTerrain(u, ux, uz);
        this.clampFieldAndSweepTerrain(other, ox, oz);
      }
    }
  }

  /** True once any two opposing units are within ENGAGE_DISTANCE: formations break and everyone fights at full speed. The first wound does the same. */
  private linesHaveMet() {
    for (const u of this.units) {
      if (u.dead || u.team !== 0) continue;
      for (const o of this.nearby(u.position, ENGAGE_DISTANCE)) {
        if (!o.dead && o.team === 1 && planarDistanceSq(u.position, o.position) <= ENGAGE_DISTANCE * ENGAGE_DISTANCE) return true;
      }
    }
    return false;
  }

  /** Flying / lying down. Returns true when it consumed the unit's frame. */
  private updateKnockback(u: CombatUnit, dt: number): boolean {
    if (u.airborne) {
      // Ballistic flight: gravity pulls down, air drag eases travel, the body
      // tumbles with a speed proportional to the blow instead of hopping.
      const prevX = u.position.x, prevZ = u.position.z;
      u.knock.y -= 18 * dt;
      const drag = Math.exp(-0.7 * dt);
      u.knock.x *= drag;
      u.knock.z *= drag;
      u.position.addScaledVector(u.knock, dt);
      u.position.y = clamp(u.position.y, 0, 16);
      if (!Number.isFinite(u.position.x)) u.position.x = prevX;
      if (!Number.isFinite(u.position.z)) u.position.z = prevZ;
      this.clampFieldAndSweepTerrain(u, prevX, prevZ);
      u.spin += dt * (4 + Math.hypot(u.knock.x, u.knock.z) * 1.3);
      u.velocity.set(0, 0, 0);
      if (u.position.y <= 0) {
        const landing = Math.hypot(u.knock.x, u.knock.z);
        u.position.y = 0;
        u.airborne = false;
        u.knock.y = 0;
        u.knock.multiplyScalar(0.45); // touchdown skid
        u.downTime = clamp(0.4 + landing * 0.08, 0.4, 2.2);
        this.emit("land", u.position, u.team, landing);
      }
      return true;
    }
    if (u.downTime > 0) {
      this.slide(u, dt, 9); // bleed the touchdown skid quickly, never walk
      u.downTime -= dt;
      if (u.downTime <= 0) u.getUp = 0.5;
      return true;
    }
    if (u.getUp > 0) {
      u.getUp -= dt;
      u.spin *= Math.exp(-9 * dt);
      return true;
    }
    return false;
  }

  private slide(u: CombatUnit, dt: number, decay: number) {
    if (u.knock.lengthSq() < 1e-4) { u.knock.set(0, 0, 0); return; }
    const prevX = u.position.x, prevZ = u.position.z;
    u.position.addScaledVector(u.knock, dt);
    if (!Number.isFinite(u.position.x)) u.position.x = prevX;
    if (!Number.isFinite(u.position.z)) u.position.z = prevZ;
    if (!u.airborne) u.position.y = 0;
    this.clampFieldAndSweepTerrain(u, prevX, prevZ);
    u.knock.multiplyScalar(Math.exp(-decay * dt));
  }

  private updateUnit(u: CombatUnit, dt: number) {
    const d = DEFS[u.kind];
    const slow = u.slowT > 0 ? 0.55 : 1;
    const actionDt = dt * slow;
    u.cooldown = Math.max(0, u.cooldown - actionDt);
    u.pace += (u.velocity.length() - u.pace) * (1 - Math.exp(-dt / 0.5));
    u.healCd = Math.max(0, u.healCd - actionDt);
    u.flinch = Math.max(0, u.flinch - dt * 2.4);
    this.slide(u, dt, 8);
    // Berserkers accelerate as hurt; slowed units windup/recover slower via actionDt.
    const rate = d.rage ? 0.45 + 0.55 * (u.hp / u.maxHp) : 1;
    const cycle = d.windup * rate + 0.3;
    if (u.animation >= 0) {
      u.animation += actionDt / cycle;
      if (u.animation >= 1) u.animation = -1;
    }

    // Paladin (frontline aura healer): heals all wounded nearby allies while fighting or advancing.
    if (d.heal && u.kind !== "cleric") {
      this.updatePaladin(u, d);
    }

    if (u.order === "move" && u.destination) {
      const delta = u.scratch.copy(u.destination).sub(u.position);
      delta.y = 0;
      const remaining = delta.length();
      if (remaining < 0.6) {
        u.destination = null;
        u.order = "hold";
        u.velocity.set(0, 0, 0);
      } else {
        delta.divideScalar(remaining);
        this.move(u, delta, Math.min(d.speed * slow, remaining * 5), dt);
        return;
      }
    }
    // Dedicated backline support AI is strictly for clerics.
    if (u.kind === "cleric" && this.updateSupport(u, d, dt, slow)) return;

    let target = this.getUnit(u.targetId);
    if (!target || target.team === u.team) {
      u.targetId = null;
      u.windup = null;
      if (u.order === "attack") u.order = "auto";
      target = undefined;
    }
    u.thinkTimer -= dt;
    if ((!target || u.thinkTimer <= 0) && u.order !== "attack" && u.windup === null) {
      const next = this.pickTarget(u, d);
      target = next;
      u.targetId = next?.id ?? null;
      u.thinkTimer = 0.25 + (u.id % 5) * 0.04;
    }
    // Shooters and casters cannot work once the enemy is among them: they drop to a sidearm until the ground is clear.
    // (War machines and titans are too big to be bothered.)
    const pinned = d.ranged && d.radius < PIN_MAX_RADIUS ? this.nearestEnemy(u, SIDEARM_LOCK) : undefined;
    if (pinned) {
      if (!u.sidearm) { u.sidearm = true; u.windup = null; u.animation = -1; }
      target = pinned;
      u.targetId = pinned.id;
    } else if (u.sidearm) {
      u.sidearm = false;
      u.windup = null;
    }
    if (!target) { u.scratch.set(0, 0, 0); this.move(u, u.scratch, 0, dt); return; }
    const delta = u.scratch.copy(target.position).sub(u.position);
    delta.y = 0; // chasing a flying target must not lift the chaser off the ground
    const distance = delta.length();
    this.face(u, Math.atan2(delta.x, delta.z), dt);

    // Cavalry re-arms its charge by sprinting across open ground again.
    if (d.charge) {
      if (!u.chargeReady && distance > d.range + 2.0 && u.velocity.length() > d.speed * 0.65) {
        u.chargeRun += dt;
        if (u.chargeRun >= CHARGE_REARM_RUN) { u.chargeReady = true; u.chargeRun = 0; }
      } else {
        u.chargeRun = 0;
      }
    }

    // Braced polearms start their thrust early against anything running onto the points.
    const baseReach = pinned ? SIDEARM_REACH : d.range;
    let reach = baseReach;
    if (d.brace) {
      const closing = -(target.velocity.x * delta.x + target.velocity.z * delta.z) / (distance || 1);
      if (closing > 2) reach += closing * (u.windup ?? d.windup * rate) * 0.85;
    }
    if (distance > reach + (u.windup !== null ? 0.8 : 0)) {
      u.windup = null;
      if (u.order === "hold") { u.scratch.set(0, 0, 0); this.move(u, u.scratch, 0, dt); }
      else {
        delta.divideScalar(distance || 1);
        const march = this.engaged || u.order !== "auto" ? Infinity : this.marchSpeed[u.team];
        this.move(u, delta, Math.min(d.speed * slow, march, Math.max(0.4, distance - baseReach + 0.2) * 4), dt);
      }
      return;
    }

    const approachSpeed = u.velocity.length();
    if (u.windup === null && u.cooldown <= 0) {
      u.windup = (pinned ? SIDEARM_WINDUP : d.windup * rate);
      if (d.charge && u.chargeReady) {
        u.charge = 1 + d.charge * clamp(approachSpeed / d.speed, 0, 1);
      }
      u.animation = 0;
      if (!d.ranged) this.emit("swing", u.position, u.team);
    }

    // Cavalry keeps riding through the windup so it hits at speed; everyone else plants their feet.
    if (d.charge && u.chargeReady && u.charge > 1.01 && u.windup !== null && distance > 1.6) {
      delta.divideScalar(distance);
      this.move(u, delta, d.speed * slow, dt);
    } else {
      u.scratch.set(0, 0, 0);
      this.move(u, u.scratch, 0, dt);
    }

    if (u.windup !== null) {
      u.windup -= actionDt;
      if (u.windup <= 0) {
        u.windup = null;
        u.cooldown = pinned ? SIDEARM_COOLDOWN : d.cooldown * rate;
        if (pinned) this.damage(target, SIDEARM_DAMAGE * (0.9 + this.random() * 0.2), u.team, u.position, 1, u.id, false, true);
        else if (d.ranged) this.fire(u, target);
        else if (distance <= d.range + 0.8) this.strike(u, d, target);
      }
    }
  }

  private updatePaladin(u: CombatUnit, d: UnitDef) {
    if (u.healCd > 0 || !d.heal || !d.healRange) return;
    let healed = false;
    const rangeSq = d.healRange * d.healRange;
    for (const ally of this.units) {
      if (ally.dead || ally === u || ally.kind === "paladin" || ally.team !== u.team || ally.hp >= ally.maxHp) continue;
      if (planarDistanceSq(u.position, ally.position) > rangeSq) continue;
      this.heal(ally, d.heal);
      healed = true;
    }
    if (healed) u.healCd = 1.6;
  }

  private strike(u: CombatUnit, d: UnitDef, target: CombatUnit) {
    let mult = 1;
    let isChargeHit = false;
    if (d.charge && u.chargeReady) {
      const liveMult = 1 + d.charge * clamp(u.velocity.length() / d.speed, 0, 1);
      mult = Math.max(u.charge, liveMult);
      isChargeHit = true;
      u.chargeReady = false;
      u.charge = 1;
      u.chargeRun = 0;
      u.velocity.multiplyScalar(0.25);
      this.emit("charge", target.position, u.team, mult);
    }
    // Brace: the faster the victim was moving, the harder it lands on the point. A solid hit stops a charge dead.
    if (d.brace && !this.isDown(target)) {
      const momentum = clamp((target.pace - BRACE_MIN_PACE) / (BRACE_FULL_PACE - BRACE_MIN_PACE), 0, 1);
      if (momentum > 0) {
        mult *= 1 + d.brace * momentum;
        if (momentum >= 0.5) {
          target.velocity.set(0, 0, 0);
          target.pace = 0;
          target.chargeReady = false;
          target.charge = 1;
          target.chargeRun = 0;
        }
      }
    }
    const buffMult = 1 + this.buffFor(u);
    const dmg = d.dmg * mult * buffMult * (0.9 + this.random() * 0.2);
    const impact = d.charge && !isChargeHit ? 2.0 : d.impact * (isChargeHit ? mult : 1);
    const dealt = this.damage(target, dmg, u.team, u.position, impact, u.id, false, true);
    if (d.lifesteal && dealt > 0) u.hp = Math.min(u.maxHp, u.hp + dealt * d.lifesteal);
    const cleaveRad = isChargeHit ? Math.max(d.cleave ?? 0, 2.1) : (d.cleave ?? 0);
    if (cleaveRad > 0) {
      for (const o of this.nearby(target.position, cleaveRad + 1.2)) {
        if (o === target || o.dead || o.team === u.team) continue;
        if (planarDistanceSq(target.position, o.position) <= (cleaveRad + radius(o)) ** 2) {
          const cleaveDealt = this.damage(o, dmg * 0.6, u.team, u.position, impact * 0.7, u.id, false, true);
          if (d.lifesteal && cleaveDealt > 0) u.hp = Math.min(u.maxHp, u.hp + cleaveDealt * d.lifesteal);
        }
      }
      this.emit("boom", target.position, u.team, 0);
    }
  }

  /** Clerics: tend to the nearest wounded ally, otherwise trail behind the army. */
  private updateSupport(u: CombatUnit, d: UnitDef, dt: number, slow: number): boolean {
    if (u.order !== "auto") return false;
    let patient = this.getUnit(u.supportId);
    if (patient && (patient.team !== u.team || patient === u || patient.hp >= patient.maxHp * 0.97)) patient = undefined;
    u.supportTimer -= dt;
    if (!patient || u.supportTimer <= 0) {
      patient = undefined;
      let best = 60 * 60;
      for (const a of this.units) {
        if (a.dead || a.team !== u.team || a === u || a.kind === "cleric" || a.hp >= a.maxHp * 0.94) continue;
        const dist = planarDistanceSq(u.position, a.position);
        if (dist < best) { best = dist; patient = a; }
      }
      u.supportId = patient?.id ?? null;
      u.supportTimer = 0.4;
    }
    if (patient && patient.kind !== "cleric") {
      const delta = u.scratch.copy(patient.position).sub(u.position);
      delta.y = 0;
      const dist = delta.length();
      this.face(u, Math.atan2(delta.x, delta.z), dt);
      if (dist <= d.healRange! && u.healCd <= 0 && u.animation < 0) {
        this.heal(patient, d.heal!);
        for (const extra of this.units) {
          if (extra.dead || extra.team !== u.team || extra === patient || extra === u || extra.kind === "cleric" || extra.hp >= extra.maxHp) continue;
          if (planarDistanceSq(patient.position, extra.position) <= 3.8 * 3.8) {
            this.heal(extra, Math.round(d.heal! * 0.35));
          }
        }
        u.healCd = 1.5;
        u.animation = 0;
      }
      const threat = this.nearestEnemy(u, 9.5);
      if (threat && dist <= d.healRange!) {
        const away = u.scratch.copy(u.position).sub(threat.position);
        away.y = 0;
        const aLen = away.length() || 1;
        away.divideScalar(aLen);
        this.move(u, away, d.speed * slow, dt);
      } else if (dist > d.healRange! * 0.82) {
        delta.divideScalar(dist || 1);
        this.move(u, delta, d.speed * 1.2 * slow, dt);
      } else {
        u.scratch.set(0, 0, 0);
        this.move(u, u.scratch, 0, dt);
      }
      return true;
    }
    let follow: CombatUnit | undefined;
    let fd = Infinity;
    for (const a of this.units) {
      if (a.dead || a.team !== u.team || a === u || a.kind === "cleric" || DEFS[a.kind].ranged) continue;
      const dist = planarDistanceSq(u.position, a.position);
      if (dist < fd) { fd = dist; follow = a; }
    }
    if (!follow) {
      for (const a of this.units) {
        if (a.dead || a.team !== u.team || a === u || a.kind === "cleric") continue;
        const dist = planarDistanceSq(u.position, a.position);
        if (dist < fd) { fd = dist; follow = a; }
      }
    }
    if (!follow) return false;
    if (this.nearestEnemy(u, 3.5)) return false;
    const delta = u.scratch.copy(follow.position).sub(u.position);
    delta.y = 0;
    const dist = delta.length();
    if (dist > 6.5) {
      this.face(u, Math.atan2(delta.x, delta.z), dt);
      delta.divideScalar(dist);
      this.move(u, delta, d.speed * slow, dt);
    } else {
      u.scratch.set(0, 0, 0);
      this.move(u, u.scratch, 0, dt);
    }
    return true;
  }

  private face(u: CombatUnit, angle: number, dt: number) {
    const delta = Math.atan2(Math.sin(angle - u.facing), Math.cos(angle - u.facing));
    u.facing += delta * Math.min(1, dt * 12);
  }

  private rebuildGrid() {
    this.grid.clear();
    for (const u of this.units) {
      if (u.dead) continue;
      const key = `${Math.floor(u.position.x / 4)}:${Math.floor(u.position.z / 4)}`;
      const cell = this.grid.get(key);
      if (cell) cell.push(u);
      else this.grid.set(key, [u]);
    }
  }

  private *nearby(position: Vector3, range: number) {
    const cx = Math.floor(position.x / 4), cz = Math.floor(position.z / 4);
    const cells = Math.ceil(range / 4);
    for (let x = -cells; x <= cells; x++) {
      for (let z = -cells; z <= cells; z++) {
        const list = this.grid.get(`${cx + x}:${cz + z}`);
        if (list) yield* list;
      }
    }
  }

  private move(u: CombatUnit, direction: Vector3, speed: number, dt: number) {
    const desired = this.desiredScratch.set(direction.x, 0, direction.z).multiplyScalar(speed);
    // Steer toward a side waypoint before reaching a rock or column, rather than walking into it.
    if (speed > 0.1) {
      let closest = Infinity;
      const obstacles = terrainObstacles(this.sceneIndex);
      for (let oi = 0; oi < obstacles.length; oi++) {
        const o = obstacles[oi];
        const dx = o.x - u.position.x, dz = o.z - u.position.z;
        const ahead = dx * direction.x + dz * direction.z;
        const expanded = o.radius + radius(u) + 0.65;
        const cross = direction.x * dz - direction.z * dx;
        const key = `${u.id}:${oi}`;
        if (ahead <= 0 || ahead > o.radius + radius(u) + 4.5 || Math.abs(cross) >= expanded) {
          if (ahead < -0.5 || Math.abs(cross) > expanded + 0.5) this.avoidSides.delete(key);
          continue;
        }
        if (ahead >= closest) continue;
        closest = ahead;
        let side = this.avoidSides.get(key);
        if (!side || Math.abs(cross) > 0.35) {
          side = Math.abs(cross) > 0.08 ? -Math.sign(cross) : (u.id % 2 ? 1 : -1);
          const candidateZ = o.z + direction.x * expanded * side;
          if (Math.abs(candidateZ) > FIELD.z - 2) side = -side;
          this.avoidSides.set(key, side);
        }
        const wx = o.x - direction.z * expanded * side - u.position.x;
        const wz = o.z + direction.x * expanded * side - u.position.z;
        const len = Math.hypot(wx, wz) || 1;
        desired.set((wx / len) * speed, 0, (wz / len) * speed);
      }
    }
    const reach = Math.max(3, radius(u) * 2 + 2);
    const repulse = this.repulseScratch.set(0, 0, 0);
    for (const other of this.nearby(u.position, reach)) {
      if (other === u || other.dead) continue;
      const apart = this.apartScratch.copy(u.position).sub(other.position);
      apart.y = 0;
      let distance = apart.length();
      const spacing = radius(u) + radius(other) + 0.25;
      if (distance >= spacing) continue;
      if (distance < 0.001) {
        const a = u.id < other.id ? 0 : Math.PI;
        apart.set(Math.cos(a), 0, Math.sin(a));
        distance = 1;
      }
      repulse.addScaledVector(apart, Math.max(0.1, spacing - distance) * 6 / distance);
    }
    repulse.clampLength(0, DEFS[u.kind].speed * 1.05);
    desired.add(repulse);
    desired.clampLength(0, DEFS[u.kind].speed * 1.1);
    u.velocity.lerp(desired, 1 - Math.exp(-14 * dt));
    u.velocity.y = 0;
    if (u.velocity.lengthSq() < 0.0001) u.velocity.set(0, 0, 0);
    const prevX = u.position.x, prevZ = u.position.z;
    u.position.addScaledVector(u.velocity, dt);
    if (!u.airborne) u.position.y = 0;
    this.clampFieldAndSweepTerrain(u, prevX, prevZ);
    u.gait += u.velocity.length() * dt * 3;
    if (speed > 0.1) this.face(u, Math.atan2(direction.x, direction.z), dt);
  }

  private clampFieldAndSweepTerrain(u: CombatUnit, prevX: number, prevZ: number) {
    const margin = Math.max(1, radius(u));
    const maxX = FIELD.x - margin, maxZ = FIELD.z - margin;
    if (u.position.x < -maxX) {
      u.position.x = -maxX;
      if (u.knock.x < 0) u.knock.x *= -0.25;
      if (u.velocity.x < 0) u.velocity.x = 0;
    } else if (u.position.x > maxX) {
      u.position.x = maxX;
      if (u.knock.x > 0) u.knock.x *= -0.25;
      if (u.velocity.x > 0) u.velocity.x = 0;
    }
    if (u.position.z < -maxZ) {
      u.position.z = -maxZ;
      if (u.knock.z < 0) u.knock.z *= -0.25;
      if (u.velocity.z < 0) u.velocity.z = 0;
    } else if (u.position.z > maxZ) {
      u.position.z = maxZ;
      if (u.knock.z > 0) u.knock.z *= -0.25;
      if (u.velocity.z > 0) u.velocity.z = 0;
    }
    this.resolveTerrainSweep(u, prevX, prevZ);
    u.position.x = clamp(u.position.x, -maxX, maxX);
    u.position.z = clamp(u.position.z, -maxZ, maxZ);
  }

  private resolveTerrainSweep(u: CombatUnit, prevX: number, prevZ: number) {
    const segX = u.position.x - prevX, segZ = u.position.z - prevZ;
    const segLenSq = segX * segX + segZ * segZ;
    for (const o of terrainObstacles(this.sceneIndex)) {
      if (u.airborne && u.position.y > o.height + 0.5) continue;
      const min = o.radius + radius(u) + 0.12;
      let cx = u.position.x, cz = u.position.z;
      if (segLenSq > 1e-6) {
        const t = clamp(((o.x - prevX) * segX + (o.z - prevZ) * segZ) / segLenSq, 0, 1);
        const qx = prevX + segX * t, qz = prevZ + segZ * t;
        if (Math.hypot(qx - o.x, qz - o.z) < min) {
          cx = qx;
          cz = qz;
        }
      }
      const dx = cx - o.x, dz = cz - o.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= min) continue;
      let nx: number, nz: number;
      if (distance > 0.001) {
        nx = dx / distance;
        nz = dz / distance;
      } else {
        const backDist = Math.hypot(prevX - o.x, prevZ - o.z);
        if (backDist > 0.001) {
          nx = (prevX - o.x) / backDist;
          nz = (prevZ - o.z) / backDist;
        } else {
          nx = u.id % 2 ? 1 : -1;
          nz = 0;
        }
      }
      u.position.x = o.x + nx * min;
      u.position.z = o.z + nz * min;
      const knockIn = u.knock.x * nx + u.knock.z * nz;
      if (knockIn < 0) {
        u.knock.x -= 1.3 * knockIn * nx;
        u.knock.z -= 1.3 * knockIn * nz;
      }
      const velIn = u.velocity.x * nx + u.velocity.z * nz;
      if (velIn < 0) {
        u.velocity.x -= velIn * nx;
        u.velocity.z -= velIn * nz;
      }
    }
  }

  resolveTerrain(u: CombatUnit) {
    this.clampFieldAndSweepTerrain(u, u.position.x, u.position.z);
  }

  resolveAllTerrain() {
    for (const u of this.units) this.resolveTerrain(u);
  }

  private desiredScratch = new Vector3();
  private repulseScratch = new Vector3();
  private apartScratch = new Vector3();
  private aimScratch = new Vector3();

  fire(source: CombatUnit, target: CombatUnit) {
    if (source.dead || target.dead || source.team === target.team) return;
    const d = DEFS[source.kind];
    if (!d.ranged) return;
    const style = d.proj ?? "arrow";
    const speed = d.projSpeed ?? 26;
    const gravity = GRAVITY[style];
    const position = source.position.clone().add(this.aimScratch.set(0, d.height * 0.72, 0));
    const travel = Math.max(0.08, Math.sqrt(planarDistanceSq(position, target.position)) / speed);
    const aim = target.position.clone().addScaledVector(target.velocity, Math.min(travel * 0.55, 0.42));
    aim.y = style === "bomb" ? 0.3 : centerHeight(target);
    const velocity = aim.sub(position).divideScalar(travel);
    if (gravity > 0) velocity.y += 0.5 * gravity * travel;
    const buffMult = 1 + this.buffFor(source);
    this.projectiles.push({
      id: this.nextId++, team: source.team, style, position, velocity,
      attackerId: source.id,
      pierce: pierceFor(source.kind),
      chains: d.chain ?? 0,
      hitIds: [],
      targetId: target.id, damage: d.dmg * buffMult, impact: d.impact, slow: d.slow ?? 0,
      aoe: d.aoe ?? 0, speed, gravity,
      life: Math.min(4, travel + 1.5),
      scratch: new Vector3(), scratch2: new Vector3(),
    });
    const evType: BattleEvent["type"] =
      style === "bomb" || style === "cannon" ? "bomb"
      : style === "bolt" ? "bolt"
      : style === "quarrel" ? "quarrel"
      : style === "pistol" ? "pistol"
      : style === "rail" ? "rail"
      : "arrow";
    this.emit(evType, position, source.team);
  }

  /** The unit type that fired a projectile (used for pierce counts). */
  private projectileOwner(p: Projectile): UnitKind {
    for (const u of this.units) {
      if (u.team === p.team && DEFS[u.kind].ranged && DEFS[u.kind].proj === p.style) return u.kind;
    }
    return "spear";
  }

  private explode(p: Projectile, impact: Vector3, kind: "bolt" | "boom") {
    for (const u of this.nearby(impact, p.aoe + 1.4)) {
      if (u.dead || u.team === p.team) continue;
      const dist = Math.sqrt(planarDistanceSq(impact, u.position));
      if (dist <= p.aoe + radius(u)) {
        const falloff = 1 - (1 - BLAST_RIM) * clamp((dist - radius(u)) / p.aoe, 0, 1);
        this.damage(u, p.damage * falloff, p.team, impact, p.impact * falloff, p.attackerId, true);
        if (p.slow) u.slowT = Math.max(u.slowT, p.slow);
      }
    }
    this.emit(kind, impact, p.team, p.aoe);
  }

  private updateProjectiles(dt: number) {
    this.projectiles = this.projectiles.filter(p => {
      const before = p.scratch.copy(p.position);
      p.life -= dt;
      if (p.style === "bolt") {
        const target = this.getUnit(p.targetId) ?? this.nearestOpponent(p.position, p.team, 8, -1, p.hitIds);
        if (target && target.team !== p.team) {
          const aim = p.scratch2.copy(target.position);
          aim.y = centerHeight(target);
          p.velocity.lerp(aim.sub(p.position).normalize().multiplyScalar(p.speed), 1 - Math.exp(-8 * dt));
        }
      } else p.velocity.y -= p.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);

      // Sweep the whole segment, not only the end point, to avoid tunneling.
      const segment = p.scratch2.copy(p.position).sub(before);
      const lengthSq = segment.lengthSq();
      let hit: CombatUnit | undefined;
      let first = Infinity;
      for (const u of this.nearby(p.position, segment.length() + 3)) {
        if (u.dead || u.team === p.team || p.hitIds.includes(u.id)) continue;
        const cx = u.position.x, cy = centerHeight(u) + (u.airborne ? u.position.y : 0), cz = u.position.z;
        let t = 0;
        if (lengthSq > 0) {
          t = clamp(((cx - before.x) * segment.x + (cy - before.y) * segment.y + (cz - before.z) * segment.z) / lengthSq, 0, 1);
        }
        const qx = before.x + segment.x * t, qy = before.y + segment.y * t, qz = before.z + segment.z * t;
        // Bodies are upright cylinders, so a tall or wide unit physically covers whoever stands behind it.
        // A raised tower shield is wider than the man holding it.
        const ud = DEFS[u.kind];
        const base = u.airborne ? u.position.y : 0;
        const wall = !p.aoe && (ud.shield ?? 0) >= TOWER_SHIELD && !this.isDown(u) ? 0.45 : 0;
        const hitRadius = radius(u) + 0.3 + wall;
        if ((qx - cx) ** 2 + (qz - cz) ** 2 <= hitRadius ** 2 && qy >= base - 0.2 && qy <= base + ud.height + 0.2 && t < first) {
          hit = u;
          first = t;
        }
      }
      if (hit) {
        const from = new Vector3(hit.position.x - p.velocity.x, 0, hit.position.z - p.velocity.z);
        const impact = before.addScaledVector(segment, first);
        if (!p.hitIds.includes(hit.id)) p.hitIds.push(hit.id);
        if (p.aoe) this.explode(p, impact, p.style === "bomb" || p.style === "cannon" ? "boom" : "bolt");
        else {
          this.damage(hit, p.damage, p.team, from, p.impact, p.attackerId);
          if (p.slow) hit.slowT = Math.max(hit.slowT, p.slow);
          // Piercing shots (railgun, cannon) keep going through the line.
          const pierce = p.pierce ?? pierceFor(this.projectileOwner(p));
          if (pierce > 0 && p.hitIds.length <= pierce) {
            p.targetId = -1;
            p.life = Math.max(p.life, 0.6);
            return true;
          }
        }
        // Chain lightning (Zeus) arcs to nearby extra enemies, preferring un-hit targets first.
        if (p.chains > 0) {
          const next = this.nearestOpponent(hit.position, p.team, 8, hit.id, p.hitIds)
            ?? this.nearestOpponent(hit.position, p.team, 8, hit.id);
          if (next) {
            p.chains--;
            const idx = p.hitIds.indexOf(next.id);
            if (idx >= 0) p.hitIds.splice(idx, 1);
            p.targetId = next.id;
            p.style = "bolt";
            p.gravity = 0;
            p.speed = 70;
            p.aoe = 0;
            p.damage *= 0.65;
            p.life = Math.max(p.life, 0.4);
            p.position.set(hit.position.x, centerHeight(hit), hit.position.z);
            p.velocity.set(
              next.position.x - p.position.x,
              centerHeight(next) - p.position.y,
              next.position.z - p.position.z,
            );
            const vLen = p.velocity.length() || 1;
            p.velocity.multiplyScalar(p.speed / vLen);
            this.emit("lightning", next.position, p.team, undefined, hit.position);
            return true;
          }
        }
        return false;
      }
      if ((p.style === "bomb" || p.style === "cannon" || p.style === "javelin") && p.position.y <= 0.15) {
        p.position.y = 0.2;
        if (p.aoe) this.explode(p, p.position, "boom");
        return false;
      }
      return p.life > 0 && p.position.y > 0 && Math.abs(p.position.x) < FIELD.x + 8 && Math.abs(p.position.z) < FIELD.z + 8;
    });
  }

  private checkEnd(dt: number) {
    if (this.phase === "over" || this.result !== null) return;
    const blue = this.count(0), red = this.count(1);
    if (blue > 0 && red > 0) { this.eliminationTime = 0; return; }
    this.eliminationTime += dt;
    if (this.eliminationTime + 1e-9 < RESULT_DELAY) return;
    this.phase = "over";
    this.accumulator = 0;
    const winner = blue === 0 && red === 0 ? null : red === 0 ? 0 : 1;
    let mvp: MvpStats | null = null;
    let bestScore = -1;
    for (const u of this.units) {
      if (winner !== null && u.team !== winner) continue;
      const sc = u.kills * 120 + u.damageDealt;
      if (sc > bestScore && (u.kills > 0 || u.damageDealt > 0)) {
        bestScore = sc;
        mvp = { id: u.id, kind: u.kind, team: u.team, kills: u.kills, damage: Math.round(u.damageDealt) };
      }
    }
    this.result = {
      winner,
      time: this.time,
      kills: [...this.kills],
      losses: [...this.losses],
      spawned: [...this.spawned],
      damageDealt: [Math.round(this.damageDealt[0]), Math.round(this.damageDealt[1])],
      mvp,
    };
  }

  private emit(type: BattleEvent["type"], position: Vector3, team: TeamId, value?: number, target?: Vector3) {
    if (this.events.length < 1024) {
      this.events.push({
        type,
        position: position.clone(),
        team,
        value,
        ...(target ? { target: target.clone() } : {}),
      });
    }
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }
}

export { STAGES };
