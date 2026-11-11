// Searches enemy line-ups for one stage: no single-kind army may win, random mixed armies should win sometimes.
// Usage: tsx tools/design.ts <stage> <enemyCost> <tries> <pool,comma> <must,comma> [seed]
import { DEFS, STAGES, fightStage, mono, unlockedThrough, type Army, type Layout } from "./balance-lib";
import type { UnitKind } from "../src/game/units";
import type { Stage } from "../src/game/campaign";
import { layoutEnemy } from "./design-layout";

const [idS, costS, triesS, poolS, mustS, seedS] = process.argv.slice(2);
const id = Number(idS), target = Number(costS), tries = Number(triesS);
const pool = poolS.split(",") as UnitKind[];
const must = (mustS ? mustS.split(",").filter(Boolean) : []) as UnitKind[];
let rs = Number(seedS ?? 1) * 7919 + id * 104729;
const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
const RATIO = Number(process.env.RATIO ?? 0.85);
const LAYOUTS: Layout[] = ["ranks", "wide", "clump", "back"];
const open = unlockedThrough(id - 1);
const scene = Math.ceil(id / 5);

function split(kinds: UnitKind[], budget: number): Army {
  const w = kinds.map(() => 0.35 + rnd());
  const sum = w.reduce((a, b) => a + b, 0);
  const counts = kinds.map((k, i) => Math.max(1, Math.floor((budget * w[i] / sum) / DEFS[k].cost)));
  let left = budget - kinds.reduce((s, k, i) => s + counts[i] * DEFS[k].cost, 0);
  for (let g = 0; g < 60; g++) {
    const fit = kinds.map((k, i) => [k, i] as const).filter(([k]) => DEFS[k].cost <= left);
    if (!fit.length) break;
    const [k, i] = fit[Math.floor(rnd() * fit.length)];
    counts[i]++; left -= DEFS[k].cost;
  }
  return kinds.map((k, i) => [k, counts[i]] as [UnitKind, number]);
}

function randomPlayer(budget: number): Army {
  const n = 2 + Math.floor(rnd() * 3);
  const fit = open.filter(k => DEFS[k].cost <= budget);
  const picks: UnitKind[] = [];
  while (picks.length < Math.min(n, fit.length)) { const k = fit[Math.floor(rnd() * fit.length)]; if (!picks.includes(k)) picks.push(k); }
  const a = split(picks, budget);
  // split() guarantees one of each, which can overspend tiny budgets: trim.
  let cost = a.reduce((s, [k, c]) => s + DEFS[k].cost * c, 0);
  while (cost > budget) { const i = a.findIndex(([, c]) => c > 0 && true); const j = a.reduce((b, [, c], q) => c > a[b][1] ? q : b, i); a[j][1]--; cost -= DEFS[a[j][0]].cost; }
  let total = a.reduce((s, [, c]) => s + c, 0);
  while (total > 50) { const j = a.reduce((b, [, c], q) => c > a[b][1] ? q : b, 0); a[j][1]--; total--; }
  return a.filter(([, c]) => c > 0);
}

const fmt = (a: Army) => a.map(([k, n]) => `${k}x${n}`).join(" ");
const GOOD = Number(process.env.GOOD ?? 99);
let good = 0;
for (let t = 0; t < tries && good < GOOD; t++) {
  const extra = pool.filter(k => !must.includes(k));
  const kinds = [...must];
  const want = Math.max(must.length, 3 + Math.floor(rnd() * 3));
  while (kinds.length < want && extra.length) kinds.push(extra.splice(Math.floor(rnd() * extra.length), 1)[0]);
  const army = split(kinds, target);
  if (army.reduce((s, [, c]) => s + c, 0) > 50) continue;
  const cost = army.reduce((s, [k, c]) => s + DEFS[k].cost * c, 0);
  const stage: Stage = { id, scene, name: "", hint: "", budget: Math.round((cost * RATIO) / 25) * 25, unlock: STAGES[id - 1].unlock, enemies: layoutEnemy(army) };
  let monoWin = "";
  outer: for (const k of open) {
    const m = mono(k, stage.budget);
    if (!m[0][1]) continue;
    for (const l of LAYOUTS) if (fightStage(stage, m, l, 7).win) { monoWin = `${k}/${l}`; break outer; }
  }
  if (monoWin) { console.log(`REJECT ${fmt(army)} :: mono ${monoWin}`); continue; }
  const N = 36;
  let wins = 0; const winners: string[] = [];
  for (let i = 0; i < N; i++) { const a = randomPlayer(stage.budget); if (fightStage(stage, a, "ranks", 7).win) { wins++; if (winners.length < 5) winners.push(fmt(a)); } }
  if (wins >= 4 && wins <= 22) good++;
  console.log(`OK rate ${wins}/${N} budget ${stage.budget}/${cost} :: ${fmt(army)} :: ${JSON.stringify(stage.enemies.map(g => [g.kind, g.count, g.x, g.z, g.pattern]))}`);
  for (const w of winners) console.log("    win: " + w);
}
