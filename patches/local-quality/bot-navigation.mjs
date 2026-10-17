import * as THREE from 'three';
import { G } from '../../src/core/ctx.js';
import { PLAYER } from '../../src/config.js';
import { Hit } from '../../src/game/physics.js';

// All policy durations/distances are INKWAVE tuning, not measured Nintendo AI.
export function rememberBotGoalFailure(brain, nav, id) {
  if (!nav?.nodes[id]) return;
  const failed = brain._failedGoals || (brain._failedGoals = []);
  const existing = failed.find(f => f.nav === nav && f.id === id);
  if (existing) { existing.until = brain.t + 8; return; }
  if (failed.length >= 6) failed.shift();
  failed.push({ nav, id, until: brain.t + 8 });
}

export function botGoalAllowed(brain, nav, node) {
  if (!brain._failedGoals) return true;
  for (const failure of brain._failedGoals) {
    if (failure.nav !== nav || failure.until <= brain.t) continue;
    const n = nav.nodes[failure.id];
    if (n && Math.abs(n.y - node.y) < 1.2 && (n.x - node.x) ** 2 + (n.z - node.z) ** 2 < 9) return false;
  }
  return true;
}

const grateNodes = new WeakMap();

export function botTravelForm(brain) {
  const a = brain.a, it = a.intent, nav = G.nav, L = G.level;
  // Native source transitions paint and qualify their own wall corridors and
  // deliberate grate drops. Do not override those state machines.
  if (L?.native || !it.squid || !a.alive || !a.grounded || a.climbing || a.superJumpState || a.specialActive) return;
  if (a.ground?.grate) { it.squid = false; return; }
  if (!nav || !G.physics?.raycast || it.move.lengthSq() < 0.01) return;
  let probe = brain._travelProbe;
  if (!probe) probe = brain._travelProbe = { origin: new THREE.Vector3(), dir: new THREE.Vector3(), hit: new Hit() };
  let grates = grateNodes.get(nav);
  if (!grates) { grates = new Int8Array(nav.nodes.length); grateNodes.set(nav, grates); }
  // Static support classification is lazy and shared by all brains on this
  // graph. One support ray per visited route node, never a per-tick scan.
  for (let k = Math.max(0, brain.pi - 1); brain.path && k < Math.min(brain.path.length, brain.pi + 2); k++) {
    const n = nav.nodes[brain.path[k]];
    if (!n || Math.abs(n.y - a.pos.y) > 0.6 || Math.hypot(n.x - a.pos.x, n.z - a.pos.z) > 2) continue;
    if (!grates[n.id]) {
      const h = G.physics.raycast(probe.origin.set(n.x, n.y + 0.1, n.z), probe.dir.set(0, -1, 0), 0.25, probe.hit);
      grates[n.id] = h.hit && L.blocks[h.block]?.grate ? 1 : -1;
    }
    if (grates[n.id] === 1) { it.squid = false; return; }
  }
  const next = nav.nodes[brain.path?.[brain.pi]];
  if (!next || (next.y - a.pos.y <= 0.4 && brain.noProg < 0.2)) return;
  // Only screen a stalled/rising approach. Ordinary travel adds no wall rays.
  probe.dir.copy(it.move).normalize();
  for (const lift of [0.3, 0.85]) {
    const h = G.physics.raycast(probe.origin.set(a.pos.x, a.pos.y + lift, a.pos.z), probe.dir, PLAYER.radius + 0.45, probe.hit);
    if (h.hit && Math.abs(h.normal.y) < 0.5 && (h.face < 0 || G.paint.sample(h.face, h.u, h.v) !== a.team + 1)) {
      it.squid = false;
      return;
    }
  }
}
