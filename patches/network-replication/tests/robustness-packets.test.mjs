// Packet robustness against the ACTUAL adapted NetMatch. Delayed, duplicated,
// missing, stale and non-finite packets must not corrupt the playback clock,
// duplicate ghosts, resurrect finished projectiles, or run an unbounded catch-up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

function sender(f) {
  const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true });
  f.bind(nm, [a]);
  return { nm, a };
}
// deliver one tick on the sender clock and advance the receiver one frame
function step(f, nm, from, ts, msg = {}) {
  f.tick(nm, from, ts, msg);
  f.clock.advance(1 / 60);
  nm.update(1 / 60);
}

test('duplicate and stale ticks are rejected without rewinding the playback clock', async () => {
  const f = await fixture();
  const { nm, a } = sender(f);
  step(f, nm, 'p2', 1000.05, { a: [f.packActor(a, { z: 0.5 })] });
  const peer = nm.peers.get('p2');
  assert.equal(nm.stats.in, 1);
  assert.equal(a.net.buf.length, 1);
  assert.equal(peer.lastTs, 1000.05);

  // exact replay and an older packet must both be dropped
  step(f, nm, 'p2', 1000.05, { a: [f.packActor(a, { z: 0.5 })] });
  step(f, nm, 'p2', 1000.02, { a: [f.packActor(a, { z: 0.2 })] });
  assert.equal(nm.stats.in, 1, 'replayed/stale ticks were accepted');
  assert.equal(a.net.buf.length, 1);
  assert.equal(a.net.buf[0].z, 0.5, 'stale sample overwrote the newest');
  assert.equal(peer.lastTs, 1000.05);
});

test('a non-finite timestamp is discarded and cannot corrupt the peer clock', async () => {
  const f = await fixture();
  const { nm, a } = sender(f);
  step(f, nm, 'p2', 1000.05, { a: [f.packActor(a, { z: 0.5 })] });
  const peer = nm.peers.get('p2');
  const before = { in: nm.stats.in, off: peer.off, want: peer.want, buf: a.net.buf.length };
  step(f, nm, 'p2', NaN, { a: [f.packActor(a, { z: 9 })] });
  assert.equal(nm.stats.in, before.in, 'NaN timestamp was counted');
  assert.equal(a.net.buf.length, before.buf, 'NaN timestamp buffered a sample');
  assert.equal(peer.off, before.off);
  assert.equal(peer.want, before.want);
  assert.ok(Number.isFinite(peer.tr));
});

test('out-of-order delayed ticks are dropped, and a genuinely newer late tick is accepted', async () => {
  const f = await fixture();
  const { nm, a } = sender(f);
  step(f, nm, 'p2', 1000.10, { a: [f.packActor(a, { z: 1.0 })] });
  // a packet that was in flight longer than the one after it arrives last
  step(f, nm, 'p2', 1000.07, { a: [f.packActor(a, { z: 0.7 })] });
  assert.equal(a.net.buf.length, 1);
  assert.equal(a.net.buf[0].z, 1.0);
  // the next truly-newer sample is still accepted
  step(f, nm, 'p2', 1000.15, { a: [f.packActor(a, { z: 1.5 })] });
  assert.equal(a.net.buf.length, 2);
  assert.equal(a.net.buf.at(-1).z, 1.5);
});

test('missing packets extrapolate a bounded distance and then hold, never diverge', async () => {
  const f = await fixture();
  const { nm, a } = sender(f);
  step(f, nm, 'p2', 1000.0, { a: [f.packActor(a, { z: 0, vz: 2 })] });
  step(f, nm, 'p2', 1000.05, { a: [f.packActor(a, { z: 0.1, vz: 2 })] });
  const startZ = a.net.cur.z;
  for (let i = 0; i < 240; i++) { f.clock.advance(1 / 60); nm.update(1 / 60); }   // 4 s of silence
  assert.ok(nm.stats.extrap > 0, 'no extrapolation was exercised');
  assert.ok(Number.isFinite(a.net.cur.z) && Number.isFinite(a.net.cur.x));
  // ballistic extrapolation is capped (~0.18 s at 2 m/s) — a dropped sender must not teleport the actor
  assert.ok(Math.abs(a.net.cur.z - startZ) < 1.0, `extrapolation ran away: ${a.net.cur.z}`);
  assert.ok(a.net.buf.length <= 40, 'sample buffer grew unbounded');
});

test('a replayed projectile event cannot create a second ghost or resurrect an ended one', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [a]);
  const peer = { tr: 1000 };
  nm.peers.set('p2', peer);
  a.remote=false;a.owner='me';a.character.getMuzzle=o=>o.copy(a.pos).setY(30);f.projectiles.fireShooter(a,a.weapon,0);
  const shot=JSON.parse(JSON.stringify(nm.out.find(e=>e[1]==='p')));assert.equal(shot.length,36);assert(Number.isSafeInteger(shot[32]));
  f.projectiles.clear();a.remote=true;a.owner='p2';
  nm._play('p3',shot);assert.equal(f.projectiles.list.length,0,'a different sender cannot claim the recorded birth');
  nm._play('p2', shot);
  assert.equal(f.projectiles.list.length, 1, 'first event did not spawn');
  nm._play('p2', shot);                                    // exact replay (same netId)
  assert.equal(f.projectiles.list.length, 1, 'replay duplicated the projectile');

  // let it finish, then replay the terminal event and the birth again
  peer.tr = shot[0]+shot[11]+shot[12]+1;
  f.projectiles.update(1 / 60);
  assert.equal(f.projectiles.list.length, 0);
  f.G.time=1;nm._rec(['pe',a.nid,shot[32],0]);const end=nm.out.at(-1);nm._play('p2',end);nm._play('p2',end);
  nm._play('p2', shot);
  assert.equal(f.projectiles.list.length, 0, 'a finished projectile was resurrected');
});

test('projectile catch-up is bounded by immutable lifetime + delay, not the current clock', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [a]);
  const peer = { tr: 1000 };
  nm.peers.set('p2', peer);
  // delay 0.4 s, life 0.2 s: the ghost must never step more than ceil((life+delay)*60)+2 frames
  const shot = [1000, 'p', 7, 'shot', 'shooter', 0, 30, 2, 0, 0, 1, 0.4, 0.2, 0, 0.1, 0.1, 1, 0, 0, 0, 0.1, 0.8, 1.3, 0.03, 26, 0.3, 3, 0, 0.5, 42];
  nm._play('p2', shot);
  const g = f.projectiles.list[0];
  assert.equal(g._netMaxSteps, Math.ceil((g.life + Math.max(0, g.delay)) * 60) + 2);
  peer.tr = 1000.5;                                        // half a second behind
  f.projectiles.update(1 / 60);
  assert.ok(g._netSteps <= g._netMaxSteps, 'ghost exceeded its lifetime budget');
  assert.equal(f.projectiles.list.length, 1, 'ghost froze or vanished mid-flight');
  peer.tr = 1001;                                          // past life + delay
  f.projectiles.update(1 / 60);
  assert.equal(f.projectiles.list.length, 0, 'ghost never retired');
  assert.equal(f.projectiles.pool.at(-1)._qualityDead, true);
});


test('malformed owner snapshots are rejected before interpolation can poison remote actors', async () => {
  const f = await fixture();
  const { nm, a } = sender(f);

  step(f, nm, 'p2', 1000.05, { a: [f.packActor(a, { x: 4, z: 0.5, vx: 0 })] });
  const before = a.net.buf.length;
  assert.equal(before, 1);

  const badType = f.packActor(a, { x: 4.5, z: 0.75, vx: 0 });
  badType[4] = 'bad';
  step(f, nm, 'p2', 1000.10, { a: [badType] });
  assert.equal(a.net.buf.length, before, 'string velocity entered the interpolation buffer');

  const huge = f.packActor(a, { x: 5, z: 1, vx: 0 });
  huge[1] = 1e308;
  step(f, nm, 'p2', 1000.15, { a: [huge] });
  assert.equal(a.net.buf.length, before, 'physically unbounded position entered the interpolation buffer');

  const truncated = f.packActor(a, { x: 5.5, z: 1.25, vx: 0 }).slice(0, 10);
  step(f, nm, 'p2', 1000.20, { a: [truncated] });
  assert.equal(a.net.buf.length, before, 'truncated actor record entered the interpolation buffer');

  step(f, nm, 'p2', 1000.25, { a: [f.packActor(a, { x: 6, z: 1.5, vx: 1 })] });
  assert.equal(a.net.buf.length, before + 1, 'next valid owner snapshot did not recover');
  for (let i = 0; i < 6; i++) {
    f.clock.advance(1 / 60);
    nm.update(1 / 60);
    assert.ok(Number.isFinite(a.pos.x) && Number.isFinite(a.pos.y) && Number.isFinite(a.pos.z));
    assert.ok(Number.isFinite(a.vel.x) && Number.isFinite(a.vel.y) && Number.isFinite(a.vel.z));
  }
});
