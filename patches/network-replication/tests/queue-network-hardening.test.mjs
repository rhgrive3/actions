import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

test('future owner timestamp is rejected without poisoning the peer watermark', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me','Me'],['p2','P2']]));
  const remote = f.makeActor({ nid: 17, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [remote]);

  f.clock.set(1000);
  nm.onMessage('p2', { k:'t', ts:1000, u:100, a:[f.packActor(remote)] });
  const peer = nm._peer('p2');
  assert.equal(peer.lastTs, 1000);

  f.clock.advance(0.05);
  nm.onMessage('p2', { k:'t', ts:1e12, u:103, a:[f.packActor(remote)] });
  assert.equal(peer.lastTs, 1000, 'future tick advanced replay watermark');
  assert.equal(peer.physicsPoints?.at(-1), 100, 'future tick changed owner simulation clock');

  f.clock.advance(0.05);
  nm.onMessage('p2', { k:'t', ts:1000.1, u:106, a:[f.packActor(remote)] });
  assert.equal(peer.lastTs, 1000.1, 'valid follow-up was not accepted');
  assert.equal(peer.physicsPoints?.at(-1), 106);
});

test('implausible owner simulation tick is ignored while later valid ticks recover', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me','Me'],['p2','P2']]));
  const remote = f.makeActor({ nid: 17, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [remote]);

  f.clock.set(1000);
  nm.onMessage('p2', { k:'t', ts:1000, u:100, a:[f.packActor(remote)] });
  const peer = nm._peer('p2');
  assert.equal(peer.physicsPoints?.at(-1), 100);

  f.clock.advance(0.05);
  nm.onMessage('p2', { k:'t', ts:1000.05, u:Number.MAX_SAFE_INTEGER, a:[f.packActor(remote)] });
  assert.equal(peer.lastTs, 1000.05, 'valid enclosing owner timestamp should remain usable');
  assert.equal(peer.physicsPoints?.at(-1), 100, 'malformed simulation tick entered physics clock');

  f.clock.advance(0.05);
  nm.onMessage('p2', { k:'t', ts:1000.1, u:106, a:[f.packActor(remote)] });
  assert.equal(peer.physicsPoints?.at(-1), 106, 'valid simulation tick did not recover');
});

test('oversized event sequence cannot consume the replay watermark', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me','Me'],['p2','P2']]));
  const remote = f.makeActor({ nid: 17, owner: 'p2', remote: true, roller: false });
  let triggers = 0;
  remote.character._netTrig = () => { triggers++; };
  f.bind(nm, [remote]);

  f.clock.set(1000);
  nm.onMessage('p2', { k:'t', ts:1000, u:100, a:[f.packActor(remote)] });
  const peer = nm._peer('p2');

  f.clock.advance(0.05);
  nm.onMessage('p2', {
    k:'t', ts:1000.05, r:2, u:103, a:[f.packActor(remote)],
    e:[[1000.04,'unknown-event-type',103,Number.MAX_SAFE_INTEGER]],
  });
  peer.tr = 1000.05; peer.sim = 103;
  nm._playEvents();
  assert.equal(peer._lastEventSeq || 0, 0, 'malformed event poisoned replay sequence');
  assert.equal(peer.events.length, 0);

  f.clock.advance(0.05);
  nm.onMessage('p2', {
    k:'t', ts:1000.1, r:2, u:106, a:[f.packActor(remote)],
    e:[[1000.09,'tr',17,'spawn',{},106,2]],
  });
  peer.tr = 1000.1; peer.sim = 106;
  nm._playEvents();
  assert.equal(triggers, 1, 'valid event after rejected poison did not play');
  assert.equal(peer._lastEventSeq, 2);
});

test('ghost projectile birth rejects oversized life and catch-up work is bounded', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me','Me'],['p2','P2']]));
  const local = f.makeActor({ nid: 7, owner: 'me', remote: false, roller: false });
  const remote = f.makeActor({ nid: 17, owner: 'p2', remote: true, roller: false });
  f.bind(nm, [local, remote]);
  local.character.getMuzzle = (out) => out.copy(local.pos).add(new f.THREE.Vector3(0, 1.05, 0.3));

  nm.out.length = 0;
  f.projectiles.fireShooter(local, local.weapon, 0);
  const wire = nm.out.find((e) => e[1] === 'p');
  assert.ok(wire, 'owner did not publish shooter birth');
  f.projectiles.list.length = 0;

  const normal = wire.slice();
  normal[2] = remote.nid;
  normal._netSeq = 1;
  normal._netTick = wire._netTick ?? wire.at(-2);
  nm._peer('p2');
  nm._play('p2', normal);
  assert.equal(f.projectiles.list.length, 1, 'valid ghost projectile birth was rejected');

  const ghost = f.projectiles.list[0], peer = nm._peer('p2');
  peer.tr = normal[0] + 100; peer.lastTs = peer.tr; peer.sim = (ghost._netBornTick || 0) + 10000;
  f.projectiles.update(1 / 60);
  assert.ok(ghost._netSteps <= 30, `ghost catch-up exceeded per-update cap: ${ghost._netSteps}`);
  // A real shooter may expire or collide within 30 simulated frames. Bounded
  // catch-up must not turn it immortal or demand survival past its native life.
  assert.ok(ghost._netSteps > 0 && ghost._netSteps <= ghost._netMaxSteps,
    'bounded catch-up exceeded the finite projectile lifetime budget');

  f.projectiles.list.length = 0;
  const malformed = normal.slice();
  malformed[12] = 1e300;
  malformed._netSeq = 2;
  malformed._netTick = normal._netTick;
  nm._play('p2', malformed);
  assert.equal(f.projectiles.list.length, 0, 'oversized projectile lifetime allocated a ghost');
});
