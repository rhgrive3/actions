// Equal-budget mono-vs-mono duels: shows which unit jobs counter which.
import { DEFS, duel, mono } from "./balance-lib";
import type { UnitKind } from "../src/game/units";
const kinds = (process.argv[2]?.split(",") ?? Object.keys(DEFS)) as UnitKind[];
const budget = Number(process.argv[3] ?? 1000);
const short = (k: string) => k.slice(0, 5).padEnd(5);
console.log("row beats col (W) at budget", budget);
console.log("      " + kinds.map(short).join(" ") + "  wins");
for (const a of kinds) {
  let line = short(a) + " ", wins = 0;
  for (const b of kinds) {
    if (a === b) { line += "  .   "; continue; }
    let w = 0;
    for (const seed of [1, 2]) if (duel(mono(a, budget), mono(b, budget), seed).win) w++;
    wins += w;
    line += (w === 2 ? "  W   " : w === 1 ? "  ~   " : "  -   ");
  }
  console.log(line + " " + wins);
}
