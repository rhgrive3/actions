// #913: real composed BotBrain._tail/_edgeGuard (+ real Actor) over a synthetic deck with a water edge. groundHeight() is
// counted; the stage broadphase itself is a stub. Logic-only: it compares guard decisions and probe counts between the
// per-tick build and the cached build; it is not a browser CPU profile and not an S3 comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptSource } from '../../splatoon3/adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource, replaceOnce } from '../adapter.mjs';
import { adaptBotEdgeGuard } from '../bot-edge-guard-adapter.mjs';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

const composed = (rel, code) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
const EDGE = 20;   // deck: x < EDGE (z unbounded); water beyond

async function world({ baseline, speed = 6, weapon = 'shooter' }) {
  const f = await fixture({ adapt: baseline ? adaptSource : composed, extraExports: "export * from './inkwave-public/src/game/bots.js';" });
  const stats = { calls: 0 };
  f.G.level.groundHeight = (x) => { stats.calls++; return x < EDGE ? 0 : -Infinity; };
  const a = f.make(weapon); a.pos.set(0, 0, 0); a.grounded = true;
  const brain = new f.BotBrain(a, 'normal'); a.bot = brain; brain.path = [0]; brain.mode = 'paint';
  const dt = 1 / 60, move = new f.THREE.Vector3(), trace = [];
  const drive = (yaw, ticks, { onTick } = {}) => {
    for (let i = 0; i < ticks; i++) {
      brain.t += dt; brain.mvYaw = brain.mvYaw ?? yaw;
      move.set(Math.sin(yaw), 0, Math.cos(yaw));
      brain._tail(dt, move, yaw, 0, 6, true);
      const it = a.intent.move;
      a.vel.set(it.x * speed, 0, it.z * speed);
      a.pos.x += a.vel.x * dt; a.pos.z += a.vel.z * dt;
      trace.push({ x: a.pos.x, z: a.pos.z, mx: it.x, mz: it.z, calls: stats.calls });
      onTick?.(i);
    }
  };
  return { f, a, brain, stats, drive, trace, dt };
}
const sameMoves = (a, b) => a.length === b.length && a.every((e, i) => Math.abs(e.mx - b[i].mx) < 1e-12 && Math.abs(e.mz - b[i].mz) < 1e-12);

test('#913 straight safe path: identical movement, >=60% fewer groundHeight probes (7 bots x 10 s)', async () => {
  let before = 0, after = 0, tracesBefore = [], tracesAfter = [];
  for (const baseline of [true, false]) for (let bot = 0; bot < 7; bot++) {
    const w = await world({ baseline, speed: 4 + bot });
    w.brain.mvYaw = 0; w.brain.mvMag = 1;
    w.a.pos.set(-100 + bot, 0, 0); w.drive(0, 600);
    if (baseline) { before += w.stats.calls; tracesBefore.push(w.trace); } else { after += w.stats.calls; tracesAfter.push(w.trace); }
  }
  assert.ok(before >= 7 * 600 * 2 - 14, `baseline probes ~2 per moving grounded tick (${before})`);
  assert.ok(after <= before * 0.37, `patched probes ${after} vs ${before} (${(100 * (1 - after / before)).toFixed(0)}% fewer)`);
  tracesBefore.forEach((t, i) => assert.ok(sameMoves(t, tracesAfter[i]), `bot ${i} steering is identical`));
});

for (const [speed, yaw] of [[3, Math.PI / 2], [6, Math.PI / 2], [9, Math.PI / 2], [6, Math.PI / 2 - 0.5], [7, Math.PI / 2 + 0.7]]) {
  test(`#913 deck edge at speed ${speed}, heading ${yaw.toFixed(2)} rad: never leaves the deck; edge response stays within a few ticks of the per-tick guard`, async () => {
    const run = async baseline => {
      const w = await world({ baseline, speed }); w.a.pos.set(10, 0, 0); w.brain.mvYaw = yaw; w.brain.mvMag = 1;
      w.drive(yaw, 60 * 8); return w;
    };
    const b = await run(true), p = await run(false);
    for (const t of [b.trace, p.trace]) assert.ok(t.every(e => e.x < EDGE), 'no position ever past the deck edge');
    const firstChange = t => t.findIndex(e => Math.abs(Math.atan2(e.mx, e.mz) - yaw) > 1e-6 || Math.hypot(e.mx, e.mz) < 0.5);
    const fb = firstChange(b.trace), fp = firstChange(p.trace);
    assert.ok(fb > 0 && fp > 0, 'the guard engaged in both builds');
    assert.ok(Math.abs(fb - fp) <= 4, `first redirect within 4 ticks (baseline ${fb}, patched ${fp})`);
    assert.ok(Math.abs(b.trace[fb].x - p.trace[fp].x) < 0.35, 'and within 0.35 m of the same place');
    assert.ok(Math.abs(b.a.pos.x - p.a.pos.x) < 0.5 && Math.abs(b.a.pos.z - p.a.pos.z) < 6, 'the slide along the edge ends in the same place (+-)');
  });
}

test('#913 unsafe probes are never cached: while the guard is redirecting every tick probes at the full rate', async () => {
  const w = await world({ baseline: false, speed: 6 }); w.a.pos.set(19.5, 0, 0); w.brain.mvYaw = Math.PI / 2; w.brain.mvMag = 1;
  const start = w.stats.calls; w.drive(Math.PI / 2, 30);
  assert.ok(w.stats.calls - start >= 30 * 2, `redirecting probes every tick (${w.stats.calls - start})`);
  assert.ok(w.trace.every(e => e.x < EDGE));
});

test('#913 invalidation: displacement/teleport, heading change, speed-up, respawn reset, airborne landing and age all force a fresh probe', async () => {
  const w = await world({ baseline: false, speed: 6 }); w.brain.mvYaw = 0; w.brain.mvMag = 1;
  const probes = fn => { const s = w.stats.calls; fn(); return w.stats.calls - s; };
  const prime = () => { w.a.pos.set(0, 0, 0); w.a.vel.set(0, 0, 6); w.brain.t += 1; w.brain._edgeGuard(w.a, w.f.THREE.Vector3 ? new w.f.THREE.Vector3(0, 0, 1) : null); };
  const guard = (mv) => w.brain._edgeGuard(w.a, mv);
  const V = (x, z) => new w.f.THREE.Vector3(x, 0, z);
  prime(); assert.equal(probes(() => guard(V(0, 1))), 0, 'same place, heading and speed: reused');
  w.a.pos.set(0, 0, 0.1); assert.equal(probes(() => guard(V(0, 1))), 0, 'small displacement: reused');
  w.a.pos.set(0, 0, 0.5); assert.equal(probes(() => guard(V(0, 1))), 2, 'displacement beyond the window: probed');
  prime(); w.a.pos.set(18, 0, 0); assert.equal(probes(() => guard(V(0, 1))), 2, 'teleport / respawn displacement: probed');
  prime(); assert.equal(probes(() => guard(V(Math.sin(0.3), Math.cos(0.3)))), 2, 'abrupt heading change (waypoint switch): probed');
  prime(); w.a.vel.set(0, 0, 12); assert.equal(probes(() => guard(V(0, 1))), 2, 'speed-up grows the stopping-distance lookahead: probed');
  prime(); w.a.vel.set(0, 0, 3); assert.equal(probes(() => guard(V(0, 1))), 0, 'slower than the probed lookahead: reused');
  prime(); w.brain.t += 0.2; assert.equal(probes(() => guard(V(0, 1))), 2, 'stale: probed');
  prime(); w.brain.reset(); assert.equal(probes(() => guard(V(0, 1))), 2, 'respawn reset: probed');
  prime(); w.a.grounded = false; w.brain.mvMag = 1; w.brain._tail(1 / 60, V(0, 1), 0, 0, 6, true); w.a.grounded = true;
  assert.equal(probes(() => guard(V(0, 1))), 2, 'a tick in the air invalidates the all-clear: landing probes afresh');
});

test('#913 stopping distance is still speed dependent and no safe heading still stops the bot', async () => {
  for (const baseline of [true, false]) {
    const near = await world({ baseline, speed: 0.1 }), fast = await world({ baseline, speed: 10 });
    for (const [w, x] of [[near, 19.2], [fast, 19.2]]) { w.a.pos.set(x, 0, 0); w.brain.mvYaw = Math.PI / 2; w.brain.mvMag = 1; w.brain.t = 1; }
    const m1 = new near.f.THREE.Vector3(1, 0, 0), m2 = new fast.f.THREE.Vector3(1, 0, 0);
    near.a.vel.set(0.1, 0, 0); fast.a.vel.set(10, 0, 0);
    near.brain._edgeGuard(near.a, m1); fast.brain._edgeGuard(fast.a, m2);
    assert.ok(m1.x > 0.5, `slow bot 0.8 m from the edge keeps going (${baseline ? 'baseline' : 'patched'})`); assert.ok(m2.x < 0.5, 'fast bot is turned by its longer stopping distance');
    const trap = await world({ baseline }); trap.f.G.level.groundHeight = () => -Infinity; trap.a.pos.set(0, 0, 0); trap.brain.t = 1; trap.a.vel.set(0, 0, 5);
    const mv = new trap.f.THREE.Vector3(0, 0, 1); trap.brain._edgeGuard(trap.a, mv); assert.equal(Math.hypot(mv.x, mv.z), 0);
  }
});

test('#913 adapter connects each hook once and fails closed on drift', () => {
  const raw = fs.readFileSync('inkwave-public/src/game/bots.js', 'utf8'), out = adaptBotEdgeGuard('src/game/bots.js', raw, replaceOnce);
  assert.equal(adaptBotEdgeGuard('src/game/actor.js', 'x', replaceOnce), 'x');
  assert.throws(() => adaptBotEdgeGuard('src/game/bots.js', out, replaceOnce));
  assert.throws(() => adaptBotEdgeGuard('src/game/bots.js', raw.replace('    if (!bad(dx, dz)) return;\n', ''), replaceOnce));
});
