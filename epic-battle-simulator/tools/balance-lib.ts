// Headless battle helpers shared by the balance tools and the balance tests.
import { BattleSimulation, FIXED_STEP } from "../src/game/simulation";
import { DEFS, type TeamId, type UnitKind } from "../src/game/units";
import { STAGES, unlockedThrough, type Stage } from "../src/game/campaign";

export type Army = [UnitKind, number][];
export type Layout = "ranks" | "line" | "clump" | "wide" | "back";

export function armyCost(army: Army) {
  return army.reduce((s, [k, n]) => s + DEFS[k].cost * n, 0);
}

type Row = "wall" | "melee" | "pole" | "shot" | "support" | "wing";
export function rowOf(kind: UnitKind): Row {
  const d = DEFS[kind];
  if (d.hunter) return "wing";
  if (d.heal && !d.shield) return "support";
  if (d.ranged) return "shot";
  if ((d.shield ?? 0) >= 0.5) return "wall";
  if (d.brace) return "pole";
  return "melee";
}
const ROW_X: Record<Row, number> = { wall: 8, melee: 10.5, pole: 11.5, shot: 22, support: 28, wing: 11 };

/** Positions (player side, x<0) for an army in a named layout. */
export function positions(army: Army, layout: Layout): { kind: UnitKind; x: number; z: number }[] {
  const out: { kind: UnitKind; x: number; z: number }[] = [];
  const flat: UnitKind[] = army.flatMap(([k, n]) => Array<UnitKind>(n).fill(k));
  if (layout === "ranks") {
    const rows = new Map<Row, UnitKind[]>();
    for (const k of flat) rows.set(rowOf(k), [...(rows.get(rowOf(k)) ?? []), k]);
    const hasWall = rows.has("wall");
    let widest = 0;
    for (const [row, list] of rows) {
      if (row === "wing") continue;
      const per = 14;
      list.forEach((k, i) => {
        const r = Math.floor(i / per), c = i % per, inRow = Math.min(per, list.length - r * per);
        const sp = Math.max(2.3, DEFS[k].radius * 2 + 1.1);
        const z = (c - (inRow - 1) / 2) * sp;
        widest = Math.max(widest, Math.abs(z));
        // Without a wall the melee line is the front.
        const base = !hasWall && (row === "melee" || row === "pole") ? ROW_X[row] - 2.5 : ROW_X[row];
        out.push({ kind: k, x: -(base + r * 2.6), z });
      });
    }
    const wing = rows.get("wing") ?? [];
    wing.forEach((k, i) => {
      const side = i % 2 ? 1 : -1;
      out.push({ kind: k, x: -ROW_X.wing - Math.floor(i / 6) * 3, z: side * (widest + 7 + (Math.floor(i / 2) % 3) * 3) });
    });
    return out;
  }
  const n = flat.length;
  if (layout === "line" || layout === "wide" || layout === "back") {
    const sp = layout === "wide" ? 4.6 : 2.5;
    const per = Math.max(1, Math.min(n, Math.floor(92 / sp)));
    flat.forEach((k, i) => {
      const r = Math.floor(i / per), c = i % per, inRow = Math.min(per, n - r * per);
      out.push({ kind: k, x: -((layout === "back" ? 34 : 10) + r * 2.8), z: (c - (inRow - 1) / 2) * sp });
    });
    return out;
  }
  const cols = Math.ceil(Math.sqrt(n));
  flat.forEach((k, i) => out.push({ kind: k, x: -(10 + Math.floor(i / cols) * 2.5), z: (i % cols - (cols - 1) / 2) * 2.5 }));
  return out;
}

export interface Outcome { win: boolean; time: number; left: number; enemyLeft: number }

function run(sim: BattleSimulation, limit = 150): Outcome {
  sim.begin();
  sim.speed = 1;
  const steps = Math.ceil(limit / FIXED_STEP);
  for (let i = 0; i < steps && sim.phase === "playing"; i++) sim.advance(FIXED_STEP);
  return { win: sim.result?.winner === 0, time: sim.time, left: sim.count(0), enemyLeft: sim.count(1) };
}

/** Player army against a campaign stage. Units are bought through the real deploy path. */
export function fightStage(stage: Stage, army: Army, layout: Layout = "ranks", seed = 2026, checkRules = true): Outcome {
  const sim = new BattleSimulation(seed);
  sim.setupStage(stage, stage.id - 1);
  if (checkRules) {
    if (armyCost(army) > stage.budget) throw new Error(`stage ${stage.id}: army costs ${armyCost(army)} > ${stage.budget}`);
    const open = new Set(unlockedThrough(stage.id - 1));
    for (const [k] of army) if (!open.has(k)) throw new Error(`stage ${stage.id}: ${k} is locked`);
  }
  for (const p of positions(army, layout)) sim.spawn(0, p.kind, p.x, p.z);
  return run(sim);
}

/** Two free armies on open ground, both in the same layout. */
export function duel(a: Army, b: Army, seed = 2026, layout: Layout = "ranks"): Outcome {
  const sim = new BattleSimulation(seed);
  sim.reset(false);
  for (const p of positions(a, layout)) sim.spawn(0, p.kind, p.x, p.z);
  for (const p of positions(b, layout)) sim.spawn(1 as TeamId, p.kind, -p.x, p.z);
  return run(sim);
}

/** The largest single-kind army the budget and the 50-unit cap allow. */
export function mono(kind: UnitKind, budget: number): Army {
  return [[kind, Math.min(50, Math.floor(budget / DEFS[kind].cost))]];
}

export { STAGES, DEFS, unlockedThrough };
