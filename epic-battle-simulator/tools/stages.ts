// Per-stage report: which mono armies win (should be none) and how often random mixed armies win.
import { DEFS, STAGES, armyCost, fightStage, mono, unlockedThrough, type Army, type Layout } from "./balance-lib";
import type { UnitKind } from "../src/game/units";

const only = process.argv[2] ? new Set(process.argv[2].split(",").map(Number)) : null;
const samples = Number(process.argv[3] ?? 60);
const LAYOUTS: Layout[] = ["ranks", "wide", "clump", "back"];

let rs = 12345;
const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };

export function randomArmy(open: UnitKind[], budget: number): Army {
  const n = 2 + Math.floor(rnd() * 3);
  const pool = [...open].filter(k => DEFS[k].cost <= budget);
  const picks: UnitKind[] = [];
  while (picks.length < Math.min(n, pool.length)) {
    const k = pool[Math.floor(rnd() * pool.length)];
    if (!picks.includes(k)) picks.push(k);
  }
  const w = picks.map(() => 0.3 + rnd());
  const sum = w.reduce((a, b) => a + b, 0);
  const counts = picks.map((k, i) => Math.floor((budget * w[i] / sum) / DEFS[k].cost));
  let left = budget - picks.reduce((s, k, i) => s + counts[i] * DEFS[k].cost, 0);
  for (let guard = 0; guard < 40; guard++) {
    const fit = picks.map((k, i) => [k, i] as const).filter(([k]) => DEFS[k].cost <= left);
    if (!fit.length) break;
    const [k, i] = fit[Math.floor(rnd() * fit.length)];
    counts[i]++; left -= DEFS[k].cost;
  }
  let total = counts.reduce((a, b) => a + b, 0);
  while (total > 50) { const i = counts.indexOf(Math.max(...counts)); counts[i]--; total--; }
  return picks.map((k, i) => [k, counts[i]] as [UnitKind, number]).filter(([, c]) => c > 0);
}

const fmt = (a: Army) => a.map(([k, n]) => `${k}x${n}`).join(" ");
for (const stage of STAGES) {
  if (only && !only.has(stage.id)) continue;
  const open = unlockedThrough(stage.id - 1);
  const monoWins: string[] = [];
  for (const k of open) {
    const army = mono(k, stage.budget);
    if (!army[0][1]) continue;
    const won = LAYOUTS.filter(l => fightStage(stage, army, l, 7).win);
    if (won.length) monoWins.push(`${k}(${won.join("/")})`);
  }
  let wins = 0;
  const winners: string[] = [];
  for (let i = 0; i < samples; i++) {
    const army = randomArmy(open, stage.budget);
    if (fightStage(stage, army, "ranks", 7).win) { wins++; if (winners.length < 4) winners.push(fmt(army)); }
  }
  const foe = stage.enemies.reduce((s, e) => s + DEFS[e.kind].cost * e.count, 0);
  console.log(`#${stage.id} ${stage.name} budget ${stage.budget}/${foe} open ${open.length} | mono wins: ${monoWins.join(", ") || "none"} | random mix ${wins}/${samples}`);
  for (const w of winners) console.log("     " + w);
}
void armyCost;
