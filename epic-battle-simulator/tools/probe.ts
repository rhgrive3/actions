// Probe one enemy line-up with hand-written armies: tsx tools/probe.ts '<enemy "kind:n kind:n">' <budget> '<army>' '<army>' ...
import { DEFS, armyCost, positions, type Army } from "./balance-lib";
import { layoutEnemy } from "./design-layout";
import { BattleSimulation, FIXED_STEP } from "../src/game/simulation";
import { stagePositions } from "../src/game/campaign";
import type { UnitKind } from "../src/game/units";
const parse = (s: string): Army => s.trim().split(/\s+/).map(t => { const [k, n] = t.split(/[:x]/); return [k as UnitKind, Number(n)]; });
const [enemyS, budgetS, ...armies] = process.argv.slice(2);
const enemy = layoutEnemy(parse(enemyS));
for (const a of armies) {
  const army = parse(a);
  const res: string[] = [];
  for (const seed of [1, 2, 3]) {
    const sim = new BattleSimulation(seed);
    sim.reset(false); sim.sceneIndex = 1;
    for (const g of enemy) for (const p of stagePositions(g)) sim.spawn(1, g.kind, p.x, p.z);
    for (const p of positions(army, "ranks")) sim.spawn(0, p.kind, p.x, p.z);
    sim.begin();
    for (let i = 0; i < 150 * 60 && sim.phase === "playing"; i++) sim.advance(FIXED_STEP);
    const [h0, m0] = sim.teamHp(0), [h1, m1] = sim.teamHp(1);
    res.push(`${sim.result?.winner === 0 ? "WIN " : "lose"} ${Math.round(100 * h0 / m0)}%/${Math.round(100 * h1 / m1)}% t${Math.round(sim.time)}`);
  }
  console.log(`${String(armyCost(army)).padStart(5)}/${budgetS} ${a.padEnd(48)} ${res.join(" | ")}`);
}
void DEFS;
