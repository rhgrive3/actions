// Finds mixed armies that beat each stage on three seeds and prints them as reference solutions.
// Usage: tsx tools/solve.ts [stageIds] [samples] [want]
import { DEFS, STAGES, armyCost, fightStage, unlockedThrough, type Army } from "./balance-lib";
import type { UnitKind } from "../src/game/units";

const only = process.argv[2] ? new Set(process.argv[2].split(",").map(Number)) : null;
const samples = Number(process.argv[3] ?? 150);
const want = Number(process.argv[4] ?? 3);
export const SEEDS = [7, 1, 2];

for (const stage of STAGES) {
  if (only && !only.has(stage.id)) continue;
  let rs = stage.id * 2654435761 >>> 0;
  const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
  const open = unlockedThrough(stage.id - 1).filter(k => DEFS[k].cost <= stage.budget);
  const found: Army[] = [];
  let tried = 0, first = 0;
  for (; tried < samples && found.length < want; tried++) {
    const n = 2 + Math.floor(rnd() * 3);
    const picks: UnitKind[] = [];
    while (picks.length < Math.min(n, open.length)) { const k = open[Math.floor(rnd() * open.length)]; if (!picks.includes(k)) picks.push(k); }
    const w = picks.map(() => 0.35 + rnd());
    const sum = w.reduce((a, b) => a + b, 0);
    const counts = picks.map((k, i) => Math.floor((stage.budget * w[i] / sum) / DEFS[k].cost));
    let left = stage.budget - picks.reduce((s, k, i) => s + counts[i] * DEFS[k].cost, 0);
    for (let g = 0; g < 60; g++) {
      const fit = picks.map((k, i) => [k, i] as const).filter(([k]) => DEFS[k].cost <= left);
      if (!fit.length) break;
      const [k, i] = fit[Math.floor(rnd() * fit.length)];
      counts[i]++; left -= DEFS[k].cost;
    }
    let total = counts.reduce((a, b) => a + b, 0);
    while (total > 50) { const i = counts.indexOf(Math.max(...counts)); counts[i]--; total--; }
    const army = picks.map((k, i) => [k, counts[i]] as [UnitKind, number]).filter(([, c]) => c > 0);
    if (army.length < 2) continue;
    if (!fightStage(stage, army, "ranks", SEEDS[0]).win) continue;
    first++;
    if (!SEEDS.slice(1).every(seed => fightStage(stage, army, "ranks", seed).win)) continue;
    const key = (a: Army) => a.map(([k]) => k).sort().join("+");
    if (found.some(f => key(f) === key(army))) continue;
    found.push(army);
  }
  console.log(`  ${stage.id}: ${JSON.stringify(found)}, // ${first}/${tried} sampled armies won; cost ${found.map(armyCost).join("/")} of ${stage.budget}`);
}
