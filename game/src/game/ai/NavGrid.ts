import * as THREE from "three";
import { World } from "../physics/World";
import { InkSystem } from "../ink/InkSystem";

export const NAV_CELL = 2;

export interface NavNode { i: number; x: number; z: number; y: number; walkable: boolean; danger: number; edges: { to: number; cost: number; climb: boolean }[] }

/** Grid nav built by sampling the collision world. Edge traversal costs are re-weighted per query by ink ownership. */
export class NavGrid {
  nodes: NavNode[] = [];
  w: number; h: number;
  x0: number; z0: number;
  private open: number[] = [];
  private gScore: Float32Array; private fScore: Float32Array; private came: Int32Array; private closed: Uint8Array;

  constructor(private world: World, private ink: InkSystem) {
    const b = world.bounds;
    this.x0 = b.min.x; this.z0 = b.min.z;
    this.w = Math.ceil((b.max.x - b.min.x) / NAV_CELL); this.h = Math.ceil((b.max.z - b.min.z) / NAV_CELL);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = this.x0 + (i + 0.5) * NAV_CELL, z = this.z0 + (j + 0.5) * NAV_CELL;
      const y = world.groundHeight(x, z);
      const walkable = isFinite(y) && y >= 1 && y <= 9 && world.canStandAt(x, y, z, 0.35, 1.5);
      this.nodes.push({ i: j * this.w + i, x, z, y, walkable, danger: 0, edges: [] });
    }
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const n of this.nodes) {
      if (!n.walkable) continue;
      const ci = n.i % this.w, cj = Math.floor(n.i / this.w);
      for (const [dx, dz] of dirs) {
        const ni = ci + dx, nj = cj + dz;
        if (ni < 0 || nj < 0 || ni >= this.w || nj >= this.h) continue;
        const m = this.nodes[nj * this.w + ni];
        if (!m.walkable) continue;
        if (dx && dz) { // diagonal requires both orthogonals
          if (!this.nodes[cj * this.w + ni].walkable || !this.nodes[nj * this.w + ci].walkable) continue;
        }
        const res = this.traversable(n, m);
        if (res === "no") continue;
        const dist = Math.hypot(dx, dz) * NAV_CELL;
        n.edges.push({ to: m.i, cost: dist + (res === "climb" ? 6 : 0), climb: res === "climb" });
      }
    }
    const N = this.nodes.length;
    this.gScore = new Float32Array(N); this.fScore = new Float32Array(N); this.came = new Int32Array(N); this.closed = new Uint8Array(N);
  }

  /** Sample along the segment: upward steps > 0.6 m block (unless climbable wall ≤ 4.5 m), drops are one-way fine (≤ 7 m). */
  private traversable(a: NavNode, b: NavNode): "yes" | "no" | "climb" {
    const steps = 6; let prev = a.y; let climb = false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps; const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const y = this.world.groundHeight(x, z);
      if (!isFinite(y)) return "no";
      const dh = y - prev;
      if (dh > 0.62) {
        if (dh <= 4.5) { const box = this.world.boxAt(x, y - 0.1, z); if (box && box.paintWalls) { climb = true; } else return "no"; }
        else return "no";
      }
      if (dh < -7) return "no";
      prev = y;
    }
    return climb ? "climb" : "yes";
  }

  nearest(p: THREE.Vector3, ignoreY = false): NavNode | null {
    const i = Math.floor((p.x - this.x0) / NAV_CELL), j = Math.floor((p.z - this.z0) / NAV_CELL);
    let best: NavNode | null = null, bd = Infinity;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= this.w || jj >= this.h) continue;
      const n = this.nodes[jj * this.w + ii];
      if (!n.walkable || (!ignoreY && Math.abs(n.y - p.y) > 3.5)) continue;
      const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2 + (ignoreY ? 0 : (n.y - p.y) ** 2 * 0.5);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  decayDanger(dt: number) { for (const n of this.nodes) if (n.danger > 0) n.danger = Math.max(0, n.danger - dt * 0.4); }
  addDanger(p: THREE.Vector3, amount: number) {
    const n = this.nearest(p); if (!n) return;
    n.danger += amount;
    for (const e of n.edges) this.nodes[e.to].danger += amount * 0.5;
  }

  inkCost(n: NavNode, team: number): number {
    const t = this.ink.floorTeamAt(n.x, n.z);
    return t === team ? 0.5 : t < 0 ? 1.0 : 2.6;
  }

  /** A* with ink-weighted costs. Returns node path (excluding start). */
  findPath(from: THREE.Vector3, to: THREE.Vector3, team: number, out: NavNode[], maxExpand = 2500): boolean {
    out.length = 0;
    const s = this.nearest(from) ?? this.nearest(from, true), g = this.nearest(to, true);
    if (!s || !g) return false;
    if (s === g) { out.push(g); return true; }
    const N = this.nodes.length;
    this.gScore.fill(Infinity); this.fScore.fill(Infinity); this.came.fill(-1); this.closed.fill(0);
    this.open.length = 0; this.open.push(s.i); this.gScore[s.i] = 0; this.fScore[s.i] = this.heur(s, g);
    let expanded = 0;
    while (this.open.length && expanded < maxExpand) {
      // pick lowest f (linear scan; open list stays small on a 30x62 grid)
      let bi = 0; for (let k = 1; k < this.open.length; k++) if (this.fScore[this.open[k]] < this.fScore[this.open[bi]]) bi = k;
      const cur = this.open[bi]; this.open[bi] = this.open[this.open.length - 1]; this.open.pop();
      if (cur === g.i) { this.reconstruct(g.i, out); return true; }
      this.closed[cur] = 1; expanded++;
      const n = this.nodes[cur];
      for (const e of n.edges) {
        if (this.closed[e.to]) continue;
        const m = this.nodes[e.to];
        const c = e.cost * this.inkCost(m, team) + m.danger * 3;
        const ng = this.gScore[cur] + c;
        if (ng < this.gScore[e.to]) {
          this.gScore[e.to] = ng; this.fScore[e.to] = ng + this.heur(m, g); this.came[e.to] = cur;
          if (!this.open.includes(e.to)) this.open.push(e.to);
        }
      }
    }
    void N;
    return false;
  }
  private heur(a: NavNode, b: NavNode) { return Math.hypot(a.x - b.x, a.z - b.z) * 0.5; }
  private reconstruct(goal: number, out: NavNode[]) {
    let c = goal; const tmp: NavNode[] = [];
    while (c >= 0) { tmp.push(this.nodes[c]); c = this.came[c]; }
    tmp.pop(); // drop start
    for (let i = tmp.length - 1; i >= 0; i--) out.push(tmp[i]);
  }
  isClimbEdge(a: NavNode, b: NavNode) { return a.edges.some((e) => e.to === b.i && e.climb); }
}
