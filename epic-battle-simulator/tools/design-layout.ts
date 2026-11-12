// Turns an enemy head-count into deployment groups: wall, reach, foot, then shooters, support and flankers.
import { DEFS, rowOf, type Army } from "./balance-lib";
import type { EnemyGroup } from "../src/game/campaign";

export function layoutEnemy(army: Army): EnemyGroup[] {
  const out: EnemyGroup[] = [];
  let x = 8;
  const order = ["wall", "pole", "melee"] as const;
  for (const row of order) {
    for (const [k, n] of army) {
      if (rowOf(k) !== row) continue;
      const big = DEFS[k].radius >= 0.9;
      const block = row === "melee" && !big && n >= 6;
      out.push({ kind: k, count: n, x, z: 0, pattern: block ? "block" : "line" });
      x += block ? Math.ceil(Math.sqrt(n)) * 2.3 + 0.6 : 2.8;
    }
  }
  let back = Math.max(22, x + 7);
  for (const [k, n] of army) if (rowOf(k) === "shot") { out.push({ kind: k, count: n, x: back, z: 0, pattern: "line" }); back += 3; }
  for (const [k, n] of army) if (rowOf(k) === "support") { out.push({ kind: k, count: n, x: back + 1, z: 0, pattern: "line" }); back += 3; }
  for (const [k, n] of army) if (rowOf(k) === "wing") out.push({ kind: k, count: n, x: 10, z: 0, pattern: "flank" });
  return out.map(g => ({ ...g, x: Math.round(g.x * 2) / 2 }));
}

