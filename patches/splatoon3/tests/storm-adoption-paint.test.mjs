import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';

// #905: a replayed (ghost) Ink Storm paints nothing locally because the owner's client authors its turf.
// When the owner leaves and this host adopts the Actor (NetMatch._adopt sets remote=false) the live cloud must
// author the rest of the rain; peers that still see the Actor as remote keep a visual-only ghost.
async function storm({ ghost = true, remote = true } = {}) {
  const f = await fixture();
  const { G, THREE } = f; G.scene = new THREE.Scene(); G.netm = null; G.actors = [];
  const p = G.projectiles = new f.Projectiles(G.scene), owner = f.make(); owner.team = 0; owner.remote = remote;
  const boss = [], paints = [];
  G.fx = { rain() {} }; G.boss = { rain: () => boss.push(1) };
  G.physics.raycast = (origin, _dir, _len, hit) => { hit.hit = true; hit.point.copy(origin).setY(0); hit.normal.set(0, 1, 0); hit.dist = origin.y; return hit; };
  G.paint.splat = (pos, size) => { paints.push([pos.x, pos.z]); return size; };
  const c = { t: 1, dur: 8, team: 0, ghost, owner, dir: new THREE.Vector3(), rainT: 0, group: new THREE.Group() };
  c.group.position.set(0, 5, 0); p.clouds.push(c);
  return { f, p, c, boss, paints, owner };
}
const ticks = (s, n) => { for (let i = 0; i < n; i++) s.p._updateClouds(1 / 60); };

test('#905 control: ghost cloud of a still-remote owner never paints or scores', async () => {
  const s = await storm(); ticks(s, 30);
  assert.equal(s.paints.length, 0); assert.equal(s.boss.length, 0); assert.equal(s.owner.stats.turf, 0);
});
test('#905 after the owner is adopted (remote=false) the same live ghost cloud paints, scores and rains for the adopted Actor', async () => {
  const s = await storm(); ticks(s, 10); assert.equal(s.paints.length, 0);
  s.owner.remote = false; // NetMatch._adopt
  const turf = s.owner.stats.turf; ticks(s, 30);
  assert.ok(s.paints.length > 0, 'remaining Storm rain paints turf'); assert.ok(s.boss.length > 0);
  assert.ok(s.owner.stats.turf > turf, 'turf credited to the adopted Actor'); assert.equal(s.p.clouds.length, 1, 'still the single cloud');
});
test('#905 a peer that still sees the Actor as remote stays ghost-only, and a locally owned cloud is unchanged', async () => {
  const peer = await storm({ ghost: true, remote: true }); ticks(peer, 120); assert.equal(peer.paints.length, 0);
  const own = await storm({ ghost: false, remote: false }); ticks(own, 30); assert.ok(own.paints.length > 0);
});
test('#905 the paint stream after adoption is identical at 30/60/120 render rates', async () => {
  const runs = [];
  for (const hz of [30, 60, 120]) {
    const s = await storm(); let n = 0; s.f.setRandom(() => ((n++ * 0.6180339887) % 1)); s.owner.remote = false;
    const clock = new FixedClock();
    for (let i = 0; i < hz; i++) clock.advance(1 / hz, dt => s.p._updateClouds(dt));
    runs.push(s.paints);
  }
  assert.ok(runs[1].length > 0); assert.deepEqual(runs[0], runs[1]); assert.deepEqual(runs[2], runs[1]);
});
