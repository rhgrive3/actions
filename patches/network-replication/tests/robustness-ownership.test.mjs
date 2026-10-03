// Ownership, reconnect and late-join robustness against the ACTUAL adapted
// NetMatch. Every event is validated against the sender that owns the actor, so
// a forged or stale sender cannot spawn ghosts; leaving players hand their
// squidkid over without a pop, and session disposal retires its own ghosts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

test('an event naming a local or foreign-owned actor is dropped, not replayed', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'host', [['me', 'Me'], ['host', 'Host'], ['p2', 'P2']]));
  const mine = f.makeActor({ nid: 7, owner: 'me', remote: false, roller: false });
  const theirs = f.makeActor({ nid: 8, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [mine, theirs]);
  nm.peers.set('host', { tr: 1000 });
  const before = f.projectiles.list.length;
  // 'host' claims to own actor 7 (actually local) and actor 8 (actually p2)
  nm._play('host', [1000, 'p', 7, 'shot', 'shooter', 0, 0, 2, 0, 0, 0, 0, 1, 0, 0.1, 0.1, 1, 0, 0, 0, 0.1, 0.8, 1.3, 0.03, 26, 0.3, 3, 0, 0.5, 11]);
  nm._play('host', [1000, 'p', 8, 'shot', 'shooter', 0, 0, 2, 0, 0, 0, 0, 1, 0, 0.1, 0.1, 1, 0, 0, 0, 0.1, 0.8, 1.3, 0.03, 26, 0.3, 3, 0, 0.5, 12]);
  assert.equal(f.projectiles.list.length, before, 'a foreign/local-owned event spawned a ghost');
  // the real owner still works
  nm.peers.set('p2', { tr: 1000 });
  nm._play('p2', [1000, 'p', 8, 'shot', 'shooter', 0, 0, 2, 0, 0, 0, 0, 1, 0, 0.1, 0.1, 1, 0, 0, 0, 0.1, 0.8, 1.3, 0.03, 26, 0.3, 3, 0, 0.5, 13]);
  assert.equal(f.projectiles.list.length, before + 1, 'the true owner could not spawn');
});

test('a departed non-host owner is reassigned to the host and glides onto its new path', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'host', [['me', 'Me'], ['host', 'Host'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true });
  f.bind(nm, [a]);
  a.net.buf.push({ t: 1000, x: 1, y: 0, z: 1, vx: 0, vy: 0, vz: 0, yaw: 0, aimYaw: 0, aimPitch: 0, f: 0, hp: 100, ink: 100, sp: 0, ch: 0, turf: 0, tp: 0, wx: 0, wy: 0, wz: 1, lock: 0 });
  nm.onLeave('p2', false);
  assert.equal(a.owner, 'host', 'ownership did not move to the host');
  assert.equal(a.remote, true, 'the actor is still remote to us');
  assert.equal(a.net.buf.length, 0, 'the old sender path was not cleared');
  assert.equal(a.net.handoff, true, 'handoff was not requested');
});

test('the host adopts a departed player as a bot from where it was drawn, without a pop', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true });
  f.bind(nm, [a]);
  a.net.tp = 4;                                   // teleport counter everyone has already seen
  a.net.err.set(0.5, 0, 0.5);                     // a live correction offset
  nm.onLeave('p2', false);
  assert.equal(a.owner, 'me');
  assert.equal(a.remote, false, 'the host did not take local ownership');
  assert.equal(a.isBot, true, 'no bot brain was attached');
  assert.equal(a.bot?.a, a);
  assert.equal(a.netTp, 4, 'the teleport counter was reset (would snap on every screen)');
  assert.deepEqual([a.net.err.x, a.net.err.y, a.net.err.z], [0, 0, 0], 'correction offset was not cleared');
  assert.deepEqual([a.intent.move.x, a.intent.move.z], [0, 0]);
});

test('a host migration clears the follower flag and restarts the state clock', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me']]));
  nm.match = { actors: [], state: 'playing', time: 0, follower: true, removeActor() {} };
  nm.clockT = 5;
  nm.onLeave('p2', true);
  assert.equal(nm.match.follower, false);
  assert.equal(nm.clockT, 0);
});

test('dispose retires every session ghost so no detached playback clock keeps animating', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me'], ['p2', 'P2']]));
  const a = f.makeActor({ nid: 7, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [a]);
  f.projectiles.ghostProjectile(a, [0, 'p', 7, 'shot', 'shooter', 0, 0, 2, 0, 0, 0, 0, 1, 0, 0.1, 0.1, 1, 0, 0, 0, 0.1, 0.8, 1.3, 0.03, 26, 0.3, 3, 0, 0.5, 21]);
  const g = f.projectiles.list.find((p) => p.ghost);
  nm.dispose();
  assert.equal(g._netEnded, true);
  assert.equal(g._qualityDead, true);
  assert.equal(f.G.netm, null);
});

test('removing a departed owner retires that owner\'s ghosts only', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me'], ['p2', 'P2'], ['p3', 'P3']]));
  const gone = f.makeActor({ nid: 7, owner: 'p2', remote: true, roller: false });
  const stay = f.makeActor({ nid: 8, owner: 'p3', remote: true, roller: false });
  f.bind(nm, [gone, stay]);
  const shot = (nid) => [0, 'p', nid, 'shot', 'shooter', 0, 0, 2, 0, 0, 0, 0, 1, 0, 0.1, 0.1, 1, 0, 0, 0, 0.1, 0.8, 1.3, 0.03, 26, 0.3, 3, 0, 0.5, nid];
  f.projectiles.ghostProjectile(gone, shot(7));
  f.projectiles.ghostProjectile(stay, shot(8));
  const ghosts = f.projectiles.list.filter((p) => p.ghost);
  assert.equal(ghosts.length, 2);
  nm._remove(gone);
  const ended = ghosts.filter((p) => p._netEnded);
  assert.equal(ended.length, 1, 'removal did not retire exactly the departed owner\'s ghost');
  assert.equal(ended[0].owner, gone);
  assert.equal(nm.byNid.has(7), false);
  assert.equal(nm.byNid.has(8), true);
});

test('late join keeps a valid remote actor and its ownership intact', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me']]));
  const late = f.makeActor({ nid: 9, owner: 'p2', remote: true });
  f.bind(nm, [late]);
  assert.equal(nm.byNid.get(9), late);
  assert.equal(late.owner, 'p2');
  assert.equal(nm.match.actors.includes(late), true);
});
