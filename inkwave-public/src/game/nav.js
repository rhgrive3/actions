import { buildNativeNav, buildNativeNavAsync } from '../../patches/native-stages/runtime/engine.mjs';
// Navigation graph auto-generated from the level: 1 m grid of walkable samples on every floor/platform/ramp,
// connected by walk / jump-up / drop-down edges. A* with a binary heap.
import * as THREE from 'three';
import { PLAYER } from '../config.js';

const RING = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)];
});
const _p = new THREE.Vector3(), _d = new THREE.Vector3();

export class NavGraph {
  constructor(level, physics, { deferBuild = false } = {}) {
    this.level = level; this.physics = physics;
    this.step = 1.0;
    this.nodes = [];
    if (!deferBuild) this._build();
  }

  static async createNative(level, physics, options) {
    const graph = new this(level, physics, { deferBuild: true });
    await buildNativeNavAsync(graph, options);
    return graph;
  }

  _build() {
    if (this.level.native) return buildNativeNav(this);
    const L = this.level, B = L.bounds, st = this.step;
    this.x0 = B.minX + st / 2; this.z0 = B.minZ + st / 2;
    this.nx = Math.floor((B.maxX - B.minX) / st); this.nz = Math.floor((B.maxZ - B.minZ) / st);
    this.cells = new Array(this.nx * this.nz);
    const ids = [];
    for (let iz = 0; iz < this.nz; iz++) {
      for (let ix = 0; ix < this.nx; ix++) {
        const x = this.x0 + ix * st, z = this.z0 + iz * st;
        const heights = [];
        L.queryBlocks(x - 0.01, z - 0.01, x + 0.01, z + 0.01, ids);
        for (const id of ids) {
          const b = L.blocks[id];
          if (!b.solid || b.axes[1].y < 0.6 || b.roof || b.rail || b.noNav) continue;   // (roofs: off limits; rail tops: no route runs along them)
          const n = b.axes[1];
          const top = _p.copy(b.center).addScaledVector(n, b.half.y);
          const y = top.y - (n.x * (x - top.x) + n.z * (z - top.z)) / n.y;
          _d.set(x, y - 0.02, z);
          if (!L.pointInBlock(b, _d, 0.001)) continue;
          if (heights.some((h) => Math.abs(h - y) < 0.15)) continue;
          heights.push(y);
        }
        const list = [];
        for (const y of heights) {
          // headroom + clearance (not inside geometry, not hugging walls)
          if (!this._clear(x, y, z)) continue;
          const node = { id: this.nodes.length, x, y, z, ix, iz, nb: [], zone: -1 };
          // No global spawn-radius navigation exclusion in the S3 composition.
          this.nodes.push(node);
          list.push(node.id);
        }
        this.cells[iz * this.nx + ix] = list;
      }
    }
    // The eight grid offsets have only two horizontal lengths.
    const cardinalFlat = Math.hypot(1, 0) * this.step, diagonalFlat = Math.hypot(1, 1) * this.step;
    // edges
    for (const n of this.nodes) {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const jx = n.ix + dx, jz = n.iz + dz;
        if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
        for (const mid of this.cells[jz * this.nx + jx]) {
          const m = this.nodes[mid];
          const dy = m.y - n.y;
          const flat = dx && dz ? diagonalFlat : cardinalFlat;
          if (Math.abs(dy) <= 0.5) {
            if (dx && dz) { // diagonal: both orthogonal neighbours must exist at similar height
              if (!this._has(n.ix + dx, n.iz, n.y) || !this._has(n.ix, n.iz + dz, n.y)) continue;
            }
            n.nb.push({ to: mid, cost: flat, type: 'walk' });
          } else if (dy > 0.5 && dy <= 1.25 && !(dx && dz)) {
            n.nb.push({ to: mid, cost: flat + 2.5, type: 'jump' });
          } else if (dy < -0.5 && dy >= -3.4 && !(dx && dz)) {
            n.nb.push({ to: mid, cost: flat + 0.8, type: 'drop' });
          }
        }
      }
    }
    // keep only the largest connected component (walk edges, both directions)
    this._prune();
  }

  _has(ix, iz, y) {
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return false;
    return this.cells[iz * this.nx + ix].some((id) => Math.abs(this.nodes[id].y - y) <= 0.5);
  }

  _clear(x, y, z) {
    const L = this.level;
    const r = PLAYER.radius + 0.08;
    const ids = L.queryClearanceBlocks?.(x, z, r, this._clearIds || (this._clearIds = []));
    const blocked = (px, py, pz) => {
      _p.set(px, py, pz);
      if (!ids) return L.pointInside(_p, 0);
      for (const id of ids) {
        const b = L.blocks[id];
        if (b.solid && L.pointInBlock(b, _p, 0)) return true;
      }
      return false;
    };
    // lowest probe at knee height: anything shorter is a step-up, and a 0.15 m probe clipped the surface of any ramp
    // steeper than ~17° (they got no nodes at all)
    for (const h of [0.32, 0.8, 1.4]) {
      if (blocked(x, y + h, z)) return false;
      for (let k = 0; k < 8; k++) {
        if (blocked(x + RING[k][0] * r, y + h, z + RING[k][1] * r)) return false;
      }
    }
    return true;
  }

  _prune() {
    // undirected reachability from a spawn-adjacent node using all edges both ways
    const N = this.nodes.length;
    const parent = new Int32Array(N), size = new Int32Array(N).fill(1);
    for (let i = 0; i < N; i++) parent[i] = i;
    const root = (id) => { while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; } return id; };
    for (const n of this.nodes) for (const edge of n.nb) {
      let a = root(n.id), b = root(edge.to);
      if (a === b) continue;
      if (size[a] < size[b]) [a, b] = [b, a];
      parent[b] = a; size[a] += size[b];
    }
    // Scan in node order to preserve the old first-component tie winner.
    let best = -1, bestSize = 0;
    for (let i = 0; i < N; i++) { const component = root(i); if (size[component] > bestSize) { best = component; bestSize = size[component]; } }
    this.valid = new Uint8Array(N);
    for (let i = 0; i < N; i++) this.valid[i] = root(i) === best ? 1 : 0;
    this.validIds = this.nodes.filter((n) => this.valid[n.id]).map((n) => n.id);
  }

  nearest(pos, maxUp = 0.8) {
    const ix = Math.round((pos.x - this.x0) / this.step), iz = Math.round((pos.z - this.z0) / this.step);
    // An owned node is already an exact zero-distance goal. Preserve nearest's
    // first-in-cell tie winner, including duplicated supports and maxUp gates.
    if (this.nodes[pos.id] === pos && this.valid[pos.id] && maxUp >= 0 && Number.isFinite(pos.x + pos.y + pos.z)
      && ix >= 0 && iz >= 0 && ix < this.nx && iz < this.nz) {
      for (const id of this.cells[iz * this.nx + ix]) {
        const n = this.nodes[id];
        if (this.valid[id] && n.y <= pos.y + maxUp && n.x === pos.x && n.y === pos.y && n.z === pos.z) return id;
      }
    }
    let best = -1, bd = Infinity;
    for (let r = 0; r <= 3; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const jx = ix + dx, jz = iz + dz;
        if (jx < 0 || jz < 0 || jx >= this.nx || jz >= this.nz) continue;
        for (const id of this.cells[jz * this.nx + jx]) {
          if (!this.valid[id]) continue;
          const n = this.nodes[id];
          if (n.y > pos.y + maxUp) continue;
          const d = (n.x - pos.x) ** 2 + (n.z - pos.z) ** 2 + ((n.y - pos.y) * 2.5) ** 2;
          if (d < bd) { bd = d; best = id; }
        }
      }
      if (best >= 0) return best;
    }
    return best;
  }

  // A* from node a to node b; `team` blocks the enemy spawn zone. Returns array of node ids (incl. a and b) or null.
  // One synchronous planning pass owns this memo. Graph topology is immutable
  // after publication; callback-qualified native routes always run uncached.
  withPathMemo(run, owner, value) {
    if (this.path !== CANONICAL_NAV_PATH || this._pathUncached !== CANONICAL_NAV_PATH_UNCACHED) return run.call(owner, value);
    const previous = this._pathMemo;
    const pool = this._pathMemoPool || (this._pathMemoPool = []);
    const memo = pool.pop() || [];
    this._pathMemo = memo;
    try { return run.call(owner, value); }
    finally { this._pathMemo = previous; memo.length = 0; if (pool.length < 4) pool.push(memo); }
  }

  path(a, b, team, maxIter = 6000, acceptEdge = null) {
    const memo = this._pathMemo;
    if (!memo || acceptEdge) return this._pathUncached(a, b, team, maxIter, acceptEdge);
    for (const row of memo) if (row.a === a && row.b === b && row.team === team && row.maxIter === maxIter) return row.path ? row.path.slice() : null;
    const path = this._pathUncached(a, b, team, maxIter, acceptEdge);
    if (memo.length < 32) memo.push({ a, b, team, maxIter, path: path ? path.slice() : null });
    return path;
  }

  _pathUncached(a, b, team, maxIter = 6000, acceptEdge = null) {
    if (a < 0 || b < 0) return null;
    const N = this.nodes.length;
    if (!this._g || this._g.length !== N) { this._h = new Float64Array(N); this._g = new Float32Array(N); this._from = new Int32Array(N); this._seen = new Uint32Array(N); this._closed = new Uint32Array(N); this._stamp = 0; }
    const heuristic = this._h;
    const g = this._g, from = this._from, seen = this._seen, closed = this._closed;
    const st = ++this._stamp;
    const nodes = this.nodes, goal = nodes[b];
    const h = (n) => Math.hypot(n.x - goal.x, n.z - goal.z) + Math.abs(n.y - goal.y) * 0.5;
    const heap = this._heap || (this._heap = new Heap()); heap.clear();
    g[a] = 0; from[a] = -1; seen[a] = st;
    heap.push(a, heuristic[a] = h(nodes[a]));
    let it = 0;
    while (heap.size && it++ < maxIter) {
      const cur = heap.pop();
      if (cur === b) break;
      if (closed[cur] === st) continue;
      closed[cur] = st;
      const n = nodes[cur];
      for (const e of n.nb) {
        if (acceptEdge && !acceptEdge(e)) continue;
        const m = nodes[e.to];
        if (m.zone >= 0 && m.zone !== team) continue;
        const ng = g[cur] + e.cost;
        if (seen[e.to] !== st || ng < g[e.to]) {
          if (seen[e.to] !== st) heuristic[e.to] = h(m);
          seen[e.to] = st; g[e.to] = ng; from[e.to] = cur;
          heap.push(e.to, ng + heuristic[e.to]);
        }
      }
    }
    if (seen[b] !== st) return null;
    const out = [];
    for (let k = b; k !== -1; k = from[k]) { out.push(k); if (out.length > 4000) break; }
    return out.reverse();
  }

  edgeType(a, b) {
    for (const e of this.nodes[a].nb) if (e.to === b) return e.type;
    return 'walk';
  }
}

class Heap {
  constructor() { this.ids = []; this.pr = []; this.n = 0; }
  clear() { this.n = 0; }
  get size() { return this.n; }
  push(id, p) {
    const ids = this.ids, pr = this.pr;
    let i = this.n++; ids[i] = id; pr[i] = p;
    while (i > 0) { const j = (i - 1) >> 1; if (pr[j] <= p) break; ids[i] = ids[j]; pr[i] = pr[j]; i = j; }
    ids[i] = id; pr[i] = p;
  }
  pop() {
    const ids = this.ids, pr = this.pr;
    const top = ids[0];
    const n = --this.n, lid = ids[n], lp = pr[n];
    if (n) {
      let i = 0;
      while (true) {
        let l = i * 2 + 1, r = l + 1, m = i;
        let mp = lp;
        if (l < n && pr[l] < mp) { m = l; mp = pr[l]; }
        if (r < n && pr[r] < mp) { m = r; mp = pr[r]; }
        if (m === i) break;
        ids[i] = ids[m]; pr[i] = pr[m]; i = m;
      }
      ids[i] = lid; pr[i] = lp;
    }
    return top;
  }
}

const CANONICAL_NAV_PATH = NavGraph.prototype.path;
const CANONICAL_NAV_PATH_UNCACHED = NavGraph.prototype._pathUncached;
