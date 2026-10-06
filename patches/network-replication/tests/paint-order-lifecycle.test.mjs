import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

test('negative baseline control: without canonical order keys, opposing splats diverge by arrival order', async () => {
  const f = await fixture();
  const paintA = f.makePaint();
  const paintB = f.makePaint();

  const center = new f.THREE.Vector3(0, 0, 0);
  const radius = 2.0;

  // Vanilla behavior: _currentNetKey is undefined
  // Client A receives team 0 first, then team 1
  paintA.splat(center, radius, 0, { instant: true, skipPuff: true });
  paintA.splat(center, radius, 1, { instant: true, skipPuff: true });

  // Client B receives team 1 first, then team 0
  paintB.splat(center, radius, 1, { instant: true, skipPuff: true });
  paintB.splat(center, radius, 0, { instant: true, skipPuff: true });

  let diffCount = 0;
  for (let i = 0; i < paintA.grid.length; i++) {
    if (paintA.grid[i] !== 0 && paintA.grid[i] !== paintB.grid[i]) {
      diffCount++;
    }
  }
  assert.ok(diffCount > 0, 'negative baseline control confirms divergence when order keys are absent');
  const covA = paintA.coverage();
  const covB = paintB.coverage();
  assert.notEqual(covA[0], covB[0], 'coverage differs between clients in negative baseline control');
});

test('simultaneous opposing splats converge to identical turf ownership regardless of arrival order (#365, #369)', async () => {
  const fA = await fixture();
  const paintA = fA.makePaint();
  const nmA = fA.makeNetMatch(fA.makeSession('p1', 'p1', [['p1', 'Player 1'], ['p2', 'Player 2']]));
  const a1 = fA.makeActor({ nid: 1, owner: 'p1', remote: false });
  const a2 = fA.makeActor({ nid: 2, owner: 'p2', remote: true });
  fA.bind(nmA, [a1, a2]);
  fA.G.paint = paintA;

  const fB = await fixture();
  const paintB = fB.makePaint();
  const nmB = fB.makeNetMatch(fB.makeSession('p2', 'p1', [['p1', 'Player 1'], ['p2', 'Player 2']]));
  const b1 = fB.makeActor({ nid: 1, owner: 'p1', remote: true });
  const b2 = fB.makeActor({ nid: 2, owner: 'p2', remote: false });
  fB.bind(nmB, [b1, b2]);
  fB.G.paint = paintB;

  const center = new fA.THREE.Vector3(0, 0, 0);
  const radius = 2.0;

  // On Client A: Local splat from team 0 at tick 100
  fA.clock.set(100);
  fA.G.time = 100 / 60;
  paintA.splat(center, radius, 0, { instant: true, skipPuff: true, seed: 0.42 });
  const localOutA = nmA.out.find(m => m[1] === 's');
  assert.ok(localOutA, 'local splat packet produced on Client A');

  // On Client B: Local splat from team 1 at tick 100
  fB.clock.set(100);
  fB.G.time = 100 / 60;
  paintB.splat(center, radius, 1, { instant: true, skipPuff: true, seed: 0.42 });
  const localOutB = nmB.out.find(m => m[1] === 's');
  assert.ok(localOutB, 'local splat packet produced on Client B');

  // Client A receives packet from Client B
  nmA.onMessage('p2', { k: 't', ts: 100, r: 2, u: 100, e: [localOutB] });
  nmA.peers.get('p2').tr = 100;
  nmA.update(1 / 60);

  // Client B receives packet from Client A
  nmB.onMessage('p1', { k: 't', ts: 100, r: 2, u: 100, e: [localOutA] });
  nmB.peers.get('p1').tr = 100;
  nmB.update(1 / 60);

  // Bit-identical grid comparison
  assert.equal(paintA.grid.length, paintB.grid.length);
  for (let i = 0; i < paintA.grid.length; i++) {
    assert.equal(paintA.grid[i], paintB.grid[i], `grid cell ${i} must match identically between clients`);
    assert.equal(paintA.gridOrder[i], paintB.gridOrder[i], `gridOrder cell ${i} must match identically`);
  }

  const covA = [...paintA.coverage()];
  const covB = [...paintB.coverage()];
  assert.deepEqual(covA, covB, 'coverage percentages must match exactly across clients');
});

test('late and out-of-order splats do not overwrite higher canonical key (#365, #369)', async () => {
  const f = await fixture();
  const paint = f.makePaint();
  const nm = f.makeNetMatch(f.makeSession('me', 'p1', [['me', 'Me'], ['p1', 'P1'], ['p2', 'P2']]));
  const p1Actor = f.makeActor({ nid: 1, owner: 'p1', remote: true });
  const p2Actor = f.makeActor({ nid: 2, owner: 'p2', remote: true });
  f.bind(nm, [p1Actor, p2Actor]);
  f.G.paint = paint;

  const center = new f.THREE.Vector3(0, 0, 0);
  const radius = 2.0;

  // Higher key splat arrives first: tick 120, seq 1, team 0
  const pktHigh = [120, 's', center.x, center.y, center.z, radius, 0, 0.5, 0, 0, 0, 0, 0, 120, 1];
  nm.onMessage('p1', { k: 't', ts: 120, r: 2, u: 120, e: [pktHigh] });
  nm.peers.get('p1').tr = 120;
  nm.update(1 / 60);

  const covHigh = paint.coverage();
  assert.ok(covHigh[0] > 0, 'team 0 claimed turf');

  // Stale / lower key splat arrives later: tick 80, seq 1, team 1
  const pktLow = [80, 's', center.x, center.y, center.z, radius, 1, 0.5, 0, 0, 0, 0, 0, 80, 1];
  nm.onMessage('p2', { k: 't', ts: 120, r: 2, u: 120, e: [pktLow] });
  nm.peers.get('p2').tr = 120;
  nm.update(1 / 60);

  const covAfterStale = paint.coverage();
  // Lower key splat cannot overwrite higher key cells
  assert.deepEqual(covAfterStale, covHigh, 'stale splat does not overwrite higher canonical order key');
});

test('swapped peer iteration order yields identical paint state on observer (#365, #369)', async () => {
  const runObserver = async (peerOrder) => {
    const f = await fixture();
    const paint = f.makePaint();
    const peers = peerOrder.map(id => [id, id.toUpperCase()]);
    peers.unshift(['obs', 'Observer']);
    const nm = f.makeNetMatch(f.makeSession('obs', 'p1', peers));
    const actors = peerOrder.map((id, idx) => f.makeActor({ nid: idx + 1, owner: id, remote: true }));
    f.bind(nm, actors);
    f.G.paint = paint;

    const center = new f.THREE.Vector3(0, 0, 0);
    const radius = 2.0;

    // Both peers fire at tick 100, seq 1
    const pkt1 = [100, 's', center.x, center.y, center.z, radius, 0, 0.5, 0, 0, 0, 0, 0, 100, 1];
    const pkt2 = [100, 's', center.x, center.y, center.z, radius, 1, 0.5, 0, 0, 0, 0, 0, 100, 1];

    for (const p of peerOrder) {
      if (p === 'p1') {
        nm.onMessage('p1', { k: 't', ts: 100, r: 2, u: 100, e: [pkt1] });
        nm.peers.get('p1').tr = 100;
      }
      if (p === 'p2') {
        nm.onMessage('p2', { k: 't', ts: 100, r: 2, u: 100, e: [pkt2] });
        nm.peers.get('p2').tr = 100;
      }
    }
    nm.update(1 / 60);
    return { grid: Array.from(paint.grid), coverage: [...paint.coverage()] };
  };

  const res1 = await runObserver(['p1', 'p2']);
  const res2 = await runObserver(['p2', 'p1']);

  assert.deepEqual(res1.grid, res2.grid, 'observer grid must be identical regardless of peer arrival/iteration order');
  assert.deepEqual(res1.coverage, res2.coverage, 'observer coverage must be identical regardless of peer iteration order');
});

test('GPU growing quads align with CPU canonical order without lingering visual inversion (#365, #369)', async () => {
  const f = await fixture();
  const paint = f.makePaint();
  const nm = f.makeNetMatch(f.makeSession('obs', 'p1', [['obs', 'Obs'], ['p1', 'P1'], ['p2', 'P2']]));
  const a1 = f.makeActor({ nid: 1, owner: 'p1', remote: true });
  const a2 = f.makeActor({ nid: 2, owner: 'p2', remote: true });
  f.bind(nm, [a1, a2]);
  f.G.paint = paint;

  const center = new f.THREE.Vector3(0, 0, 0);
  const radius = 2.0;

  // Deliver lower key splat then higher key splat
  const pkt1 = [100, 's', center.x, center.y, center.z, radius, 0, 0.5, 0, 0, 0, 0, 0, 100, 1];
  const pkt2 = [105, 's', center.x, center.y, center.z, radius, 1, 0.5, 0, 0, 0, 0, 0, 105, 1];

  nm.onMessage('p1', { k: 't', ts: 100, r: 2, u: 100, e: [pkt1] });
  nm.peers.get('p1').tr = 100;
  nm.update(1 / 60);

  nm.onMessage('p2', { k: 't', ts: 105, r: 2, u: 105, e: [pkt2] });
  nm.peers.get('p2').tr = 105;
  nm.update(1 / 60);

  const maxKey = Math.max(...paint.gridOrder);
  assert.ok(maxKey > 0, 'canonical grid order key recorded');
  assert.ok(paint._recentSplats.length > 0, 'recent splats tracked for GPU alignment');
  const highestSplat = paint._recentSplats.reduce((a, b) => (a._netKey > b._netKey ? a : b));
  assert.equal(highestSplat.team, 1, 'highest canonical splat matches team 1 in GPU tracking');
});

test('splatted timeline event rejected when sent by non-owner (#599)', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p1', [['me', 'Me'], ['p1', 'P1'], ['p2', 'P2']]));
  const victim = f.makeActor({ nid: 42, owner: 'p1', remote: true });
  f.bind(nm, [victim]);
  assert.equal(victim.alive, true);

  // Non-owner 'p2' attempts to splat actor 42 owned by 'p1'
  const event = [1000, 'ev', 'splatted', { victim: { n: 42 }, attacker: { n: 10 }, victimOwner: 'p2', victimLife: 0, burstArea: '20' }, 60000, 1];
  nm.onMessage('p2', { k: 't', ts: 1000, r: 2, u: 60000, e: [event] });
  nm.peers.get('p2').tr = 1000;
  nm.update(1 / 60);

  assert.equal(victim.alive, true, 'actor must not be killed by foreign sender');
  assert.equal(victim._netDeathLife, undefined, 'no death epoch stamped');
});

test('splatted timeline event rejected when claiming local player is victim (#599)', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p1', [['me', 'Me'], ['p1', 'P1']]));
  const localActor = f.makeActor({ nid: 1, owner: 'me', remote: false });
  f.bind(nm, [localActor]);
  assert.equal(localActor.alive, true);

  // Remote peer 'p1' claims local player is splatted
  const event = [1000, 'ev', 'splatted', { victim: { n: 1 }, attacker: { n: 2 }, victimOwner: 'p1', victimLife: 0, burstArea: '20' }, 60000, 1];
  nm.onMessage('p1', { k: 't', ts: 1000, r: 2, u: 60000, e: [event] });
  nm.peers.get('p1').tr = 1000;
  nm.update(1 / 60);

  assert.equal(localActor.alive, true, 'local player cannot be killed by remote splatted timeline event');
});

test('legitimate owner splatted event kills actor and sets death life (#599)', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p1', [['me', 'Me'], ['p1', 'P1']]));
  const victim = f.makeActor({ nid: 42, owner: 'p1', remote: true });
  f.bind(nm, [victim]);
  victim.netLife = 3;
  victim.net.lastLife = 3;
  victim.net.cur = { life: 3 };

  // Legitimate owner 'p1' reports victim splatted in life epoch 3
  const event = [1000, 'ev', 'splatted', { victim: { n: 42 }, attacker: { n: 1 }, victimOwner: 'p1', victimLife: 3, burstArea: '20' }, 60000, 1];
  nm.onMessage('p1', { k: 't', ts: 1000, r: 2, u: 60000, l: { 42: 3 }, e: [event] });
  nm.peers.get('p1').tr = 1000;
  nm.update(1 / 60);

  assert.equal(victim.alive, false, 'actor is marked dead by true owner');
  assert.equal(victim._netDeathLife, 3, 'death life matches epoch 3');
});

test('stale splatted event from prior life epoch rejected after respawn (#599)', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p1', [['me', 'Me'], ['p1', 'P1']]));
  const victim = f.makeActor({ nid: 42, owner: 'p1', remote: true });
  f.bind(nm, [victim]);
  victim.netLife = 0;
  victim.net.lastLife = 0;
  victim.net.cur = { life: 0 };

  // Victim died in epoch 0
  const deathEvent = [1000, 'ev', 'splatted', { victim: { n: 42 }, victimOwner: 'p1', victimLife: 0, burstArea: '20' }, 60000, 1];
  nm.onMessage('p1', { k: 't', ts: 1000, r: 2, u: 60000, l: { 42: 0 }, e: [deathEvent] });
  nm.peers.get('p1').tr = 1000;
  nm.update(1 / 60);
  assert.equal(victim.alive, false);
  assert.equal(victim._netDeathLife, 0);

  // Victim respawns, transitioning to life epoch 1
  nm._remoteRespawn(victim);
  assert.equal(victim.alive, true);
  assert.equal(victim._netDeathLife, null, 'respawn clears death life');
  victim.net.lastLife = 1;
  victim.netLife = 1;
  victim.net.cur = { life: 1 };

  // Stale duplicate/late splatted event from epoch 0 arrives
  const staleEvent = [1005, 'ev', 'splatted', { victim: { n: 42 }, victimOwner: 'p1', victimLife: 0, burstArea: '20' }, 60005, 2];
  nm.onMessage('p1', { k: 't', ts: 1005, r: 2, u: 60005, l: { 42: 1 }, e: [staleEvent] });
  nm.peers.get('p1').tr = 1005;
  nm.update(1 / 60);

  assert.equal(victim.alive, true, 'actor remains alive; stale epoch 0 splatted event rejected');
  assert.equal(victim._netDeathLife, null);
});

test('duplicate splatted event in same life epoch is idempotent (#599)', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'p1', [['me', 'Me'], ['p1', 'P1']]));
  const victim = f.makeActor({ nid: 42, owner: 'p1', remote: true });
  f.bind(nm, [victim]);
  victim.netLife = 0;
  victim.net.lastLife = 0;
  victim.net.cur = { life: 0 };

  const event1 = [1000, 'ev', 'splatted', { victim: { n: 42 }, victimOwner: 'p1', victimLife: 0, burstArea: '20' }, 60000, 1];
  const event2 = [1000, 'ev', 'splatted', { victim: { n: 42 }, victimOwner: 'p1', victimLife: 0, burstArea: '20' }, 60000, 2];

  nm.onMessage('p1', { k: 't', ts: 1000, r: 2, u: 60000, e: [event1] });
  nm.peers.get('p1').tr = 1000;
  nm.update(1 / 60);
  assert.equal(victim.alive, false);

  // Deliver duplicate
  nm.onMessage('p1', { k: 't', ts: 1000.01, r: 2, u: 60001, e: [event2] });
  nm.peers.get('p1').tr = 1000.01;
  nm.update(1 / 60);
  assert.equal(victim.alive, false, 'stays dead without error or corruption');
});

test('owner departure and adoption resets death life authority (#599)', async () => {
  const f = await fixture();
  const nm = f.makeNetMatch(f.makeSession('me', 'me', [['me', 'Me'], ['p1', 'P1']]));
  const victim = f.makeActor({ nid: 42, owner: 'p1', remote: true });
  f.bind(nm, [victim]);
  victim._netDeathLife = 2;

  nm.onLeave('p1', false);
  assert.equal(victim.owner, 'me');
  assert.equal(victim._netDeathLife, null, 'adoption clears previous owner death life');
});
