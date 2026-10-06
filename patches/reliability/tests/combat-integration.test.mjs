import assert from 'node:assert/strict';
import test from 'node:test';
import { combatWorld } from './combat-integration-fixture.mjs';

const flushLethal = (world, actor = world.victim) => {
  world.G.time += 1 / 60;
  actor.update(1 / 60);
};

test('combined wire path rejects a held lethal old-life hit and admits a new-life hit', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const held = shooter.wire.find(x => x.to === 'B').data;
    defender.victim.splat(null, 'water'); defender.victim.respawn(); defender.victim.invuln = 0;
    const before = { hp: defender.victim.hp, deaths: defender.victim.stats.deaths, splats: defender.attacker.stats.splats, paint: defender.paint.length };
    defender.net.onMessage('A', held);
    assert.deepEqual({ hp: defender.victim.hp, deaths: defender.victim.stats.deaths, splats: defender.attacker.stats.splats, paint: defender.paint.length }, before);
    // Real owner snapshot publishes the new life to the sender before its next hit.
    defender.advance(); defender.net._sendTick();
    shooter.net.onMessage('B', defender.wire.at(-1).data);
    const peer = shooter.net.peers.get('B'); peer.tr = defender.wire.at(-1).data.ts;
    shooter.net._sample(shooter.victim, peer.tr, 1/60);
    shooter.net.applyRemote(shooter.victim, 1/60);
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 30, 'shooter');
    defender.net.onMessage('A', shooter.wire.at(-1).data);
    assert.equal(defender.victim.hp, before.hp - 30);
  } finally { shooter.dispose(); defender.dispose(); }
});

test('combined lethal owner hit transfers exact original burst credit once through native tick/event playback', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    defender.net.onMessage('A', shooter.wire.at(-1).data);
    assert.equal(defender.victim.alive, true, 'lethal hit is pending on its receive tick');
    flushLethal(defender);
    assert.equal(defender.victim.alive, false);
    assert.equal(defender.paint.length, 1, 'one authoritative death-burst paint');
    defender.net._sendTick(); const terminal = defender.wire.at(-1).data;
    shooter.deliver('B', terminal);
    assert.equal(shooter.attacker.stats.turf, .123456789);
    assert.equal(shooter.attacker.special, .123456789);
    assert.equal(shooter.attacker.stats.splats, 1);
    assert.equal(shooter.paint.length, 1, 'one replicated world paint, no repaint for scoring');
    shooter.deliver('B', terminal);
    assert.equal(shooter.attacker.stats.turf, .123456789, 'duplicate terminal confirmation never scores twice');
    assert.equal(shooter.attacker.stats.splats, 1);
    assert.equal(shooter.victim.stats.deaths, 1);
    assert.equal(shooter.paint.length, 1, 'duplicate tick cannot repaint previously accepted ink');
    assert.equal(defender.attacker.stats.turf, 0, 'remote proxy never earns authoritative reward');
    assert.deepEqual(JSON.parse(JSON.stringify(shooter.paint[0])), JSON.parse(JSON.stringify(defender.paint[0])), 'same world death-burst geometry and team');

  } finally { shooter.dispose(); defender.dispose(); }
});

test('reverse ownership retains the exact same splat reward', async () => {
  const shooter = await combatWorld('B'), defender = await combatWorld('A');
  try {
    shooter.G.projectiles.applyHit(shooter.victim, shooter.attacker, 100, 'shooter');
    defender.net.onMessage('B', shooter.wire.at(-1).data);
    flushLethal(defender, defender.attacker);
    defender.net._sendTick(); shooter.deliver('A', defender.wire.at(-1).data);
    assert.equal(shooter.victim.stats.turf, .123456789);
    assert.equal(shooter.victim.special, .123456789);
    assert.equal(shooter.victim.stats.splats, 1);
    assert.equal(defender.victim.stats.turf, 0);
  } finally { shooter.dispose(); defender.dispose(); }
});

test('snapshot/death presentation does not swallow pending reward or suppress its once-only attribution', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    defender.net.onMessage('A', shooter.wire.at(-1).data);
    flushLethal(defender);
    shooter.victim.alive = false; shooter.victim.hp = 0;
    shooter.attacker.specialActive = { id: 'storm' };
    defender.net._sendTick(); shooter.deliver('B', defender.wire.at(-1).data);
    assert.equal(shooter.attacker.stats.turf, .123456789);
    assert.equal(shooter.attacker.special, 0, 'native scorer suppression applies on its owner');
    assert.equal(shooter.attacker.stats.splats, 1);
  } finally { shooter.dispose(); defender.dispose(); }
});

test('#599 native late terminal keeps reward but cannot splat a newer owner life', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    // Move the owner through native spawnAt epochs, then publish life 4 as a real tick.
    while (defender.victim.netLife < 4) defender.victim.spawnAt(new defender.THREE.Vector3(), 0);
    defender.victim.invuln = 0; // The fixture's native spawn protection has elapsed before this combat case.
    assert.equal(defender.victim.netLife, 4);
    defender.advance(); defender.net._sendTick();
    const baseline = defender.wire.at(-1).data;
    assert.equal(baseline.l[2], 4);
    shooter.net.onMessage('B', baseline);
    shooter.advance(); shooter.net.update(1 / 20);
    shooter.net.applyRemote(shooter.victim, 1 / 20);
    assert.equal(shooter.victim.net.cur.life, 4);
    assert.equal(shooter.victim.netLife, 4);

    // The real hit packet reaches the victim owner and its native splat queues terminal credit.
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const hit = shooter.wire.find(x => x.to === 'B' && x.data.k === 'hit').data;
    assert.equal(hit.l, 4);
    defender.net.onMessage('A', hit);
    assert.equal(defender.victim.alive, false);
    assert.equal(defender.victim.stats.deaths, 1);
    defender.advance(); defender.net._sendTick();
    const terminal = defender.wire.at(-1).data;
    const splat = terminal.e.find(e => e[1] === 'ev' && e[2] === 'splatted');
    assert.ok(splat);
    assert.equal(splat[3].victimOwner, 'B');
    assert.equal(splat[3].victimLife, 4);
    shooter.net.onMessage('B', terminal);

    // Life 5 is alive in the newest owner packet while playback still samples life 4.
    defender.victim.respawn();
    assert.equal(defender.victim.netLife, 5);
    defender.advance(); defender.net._sendTick();
    const current = defender.wire.at(-1).data;
    const currentActor = current.a.find(a => a[0] === 2);
    const respawn = current.e.find(e => e[1] === 'ev' && e[2] === 'respawn');
    assert.equal(current.l[2], 5);
    assert.ok(currentActor[10] & 1, 'latest owner snapshot says alive');
    assert.ok(respawn, 'owner emits the native respawn event');
    shooter.net.onMessage('B', current);
    assert.equal(shooter.victim.net.lastLife, 5);
    assert.equal(shooter.victim.net.cur.life, 4);
    const peer = shooter.net.peers.get('B');
    const queued = peer.events.length;
    shooter.net.onMessage('B', terminal);
    assert.equal(peer.events.length, queued, 'duplicate old terminal tick is rejected');

    // A different sender cannot relabel the victim owner to pass the terminal admission filter.
    shooter.net.onMessage('C', {
      k: 't', ts: current.ts + 0.01, a: [],
      e: [[splat[0], 'ev', 'splatted', { ...splat[3], victimOwner: 'C' }]],
    });
    assert.equal(shooter.net.peers.get('C').events.length, 0);

    // NetMatch.update advances its native playback clock through the old terminal time only.
    shooter.advance(); shooter.net.update(1 / 20);
    assert.ok(peer.tr >= splat[0] && peer.tr < respawn[0], 'sample clock reaches old splat before respawn');
    assert.equal(shooter.victim.net.cur.life, 4);
    assert.equal(shooter.victim.alive, true);
    assert.equal(shooter.victim.hp, 100);
    assert.equal(shooter.victim.stats.deaths, 0);
    assert.equal(shooter.attacker.stats.turf, .123456789);
    assert.equal(shooter.attacker.stats.splats, 1);
    assert.equal(shooter.paint.length, 1, 'owner paint event is replayed once without a scoring repaint');
    assert.equal(peer.events.filter(e => e[1] === 'ev' && e[2] === 'respawn').length, 1);

    // The newer respawn event still takes effect on its own playback frame.
    shooter.advance(); shooter.net.update(1 / 20);
    shooter.net.applyRemote(shooter.victim, 1 / 20);
    assert.equal(shooter.victim.alive, true);
    assert.equal(shooter.victim.stats.deaths, 0);
    assert.equal(shooter.attacker.stats.turf, .123456789);
    assert.equal(shooter.attacker.stats.splats, 1);
    assert.equal(shooter.paint.length, 1);
  } finally { shooter.dispose(); defender.dispose(); }
});

test('unbound sender and malformed, missing or unobserved victim epochs cannot authorize hits or rewards', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 30, 'shooter');
    const hit = shooter.wire.at(-1).data;
    defender.net.onMessage('foreign', hit);
    for (const epoch of [undefined, -1, 1.5, NaN, Infinity, hit.l + 1])
      defender.net.onMessage('A', { ...hit, l: epoch });
    assert.equal(defender.victim.hp, 100);
    const fake = { k: 't', ts: 1001, e: [[1001, 'ev', 'splatted', { victim: {n:2}, attacker: {n:1}, victimOwner:'B', victimLife:1, burstArea:'20' }]] };
    shooter.deliver('foreign', fake);
    assert.equal(shooter.attacker.stats.turf, 0);
    shooter.deliver('B', { ...fake, ts:1002, e:[[1002,'ev','splatted',{...fake.e[0][3],victimLife:999}]] });
    assert.equal(shooter.attacker.stats.turf, 0);
    assert.equal(shooter.victim.alive, true);
  } finally { shooter.dispose(); defender.dispose(); }
});

test('offline damage and death-burst rewards remain native with no network owner', async () => {
  const world = await combatWorld('A');
  try {
    world.net.dispose(); world.attacker.remote = world.victim.remote = false;
    world.G.projectiles.applyHit(world.attacker, world.victim, 30, 'shooter');
    assert.equal(world.victim.hp, 70); assert.equal(world.paint.length, 0);
    world.G.projectiles.applyHit(world.attacker, world.victim, 70, 'shooter');
    assert.equal(world.victim.alive, true);
    flushLethal(world);
    assert.equal(world.attacker.stats.turf, .123456789);
    assert.equal(world.attacker.special, .123456789);
    assert.equal(world.paint.length, 1);
  } finally { world.dispose(); }
});

// Ordered room transport may retry the same message; each hit is a transaction.
test('one hit packet applies once while subsequent same-life hits still apply', async () => {
  const a = await combatWorld('A'), b = await combatWorld('B');
  try {
    a.G.projectiles.applyHit(a.attacker, a.victim, 20, 'shooter');
    const hit = a.wire.at(-1).data;
    b.net.onMessage('A', hit); b.net.onMessage('A', hit);
    assert.equal(b.victim.hp, 80);
    a.G.projectiles.applyHit(a.attacker, a.victim, 20, 'shooter');
    b.net.onMessage('A', a.wire.at(-1).data);
    assert.equal(b.victim.hp, 60);
    b.net.onMessage('A', hit);
    assert.equal(b.victim.hp, 60);
  } finally { a.dispose(); b.dispose(); }
});

test('nonlethal hits and environmental splats cannot create attacker paint rewards', async () => {
  const a = await combatWorld('A'), b = await combatWorld('B');
  try {
    a.G.projectiles.applyHit(a.attacker, a.victim, 20, 'shooter');
    b.net.onMessage('A', a.wire.at(-1).data);
    b.net._sendTick(); a.deliver('B', b.wire.at(-1).data);
    assert.equal(a.attacker.stats.turf, 0);
    assert.equal(a.attacker.stats.splats, 0);
    assert.equal(b.paint.length, 0);
    b.victim.splat(null, 'water'); b.advance(); b.net._sendTick();
    a.deliver('B', b.wire.at(-1).data);
    assert.equal(a.victim.alive, false);
    assert.equal(a.attacker.stats.turf, 0);
    assert.equal(a.attacker.special, 0);
    assert.equal(a.attacker.stats.splats, 0);
    assert.equal(a.paint.length, 0);
  } finally { a.dispose(); b.dispose(); }
});

test('malformed terminal area cannot consume the legitimate credit for that life', async () => {
  const a = await combatWorld('A'), b = await combatWorld('B');
  try {
    a.G.projectiles.applyHit(a.attacker, a.victim, 100, 'shooter');
    b.net.onMessage('A', a.wire.at(-1).data);
    flushLethal(b);
    b.net._sendTick(); const original = b.wire.at(-1).data;
    const packed = original.e.find(e => e[1] === 'ev' && e[2] === 'splatted');
    let time = original.ts;
    for (const area of [undefined, -1, '-1', 'NaN', 'Infinity', {}]) {
      time += .05;
      a.deliver('B', { k: 't', ts:time, e:[[time, 'ev', 'splatted', {...packed[3], burstArea:area}]] });
      assert.equal(a.attacker.stats.turf, 0);
      assert.equal(a.attacker.stats.splats, 0);
    }
    time += .05;
    a.deliver('B', { ...original, ts:time });
    assert.equal(a.attacker.stats.turf, .123456789);
    assert.equal(a.attacker.stats.splats, 1);
  } finally { a.dispose(); b.dispose(); }
});

test('remote scorer proxy converges through the native integer-precision reward snapshot', async () => {
  const area = 12.123456789;
  const a = await combatWorld('A', { paintArea:area }), b = await combatWorld('B', { paintArea:area });
  try {
    a.G.projectiles.applyHit(a.attacker, a.victim, 100, 'shooter');
    b.net.onMessage('A', a.wire.at(-1).data); flushLethal(b); b.net._sendTick();
    a.deliver('B', b.wire.at(-1).data);
    assert.equal(a.attacker.stats.turf, area);
    assert.equal(a.attacker.special, area);
    assert.equal(b.attacker.stats.turf, 0);
    a.net._sendTick(); const owned = a.wire.at(-1).data;
    b.net.onMessage('A', owned);
    const peer = b.net.peers.get('A'); peer.tr = owned.ts;
    b.net._sample(b.attacker, peer.tr, 1 / 60); b.net.applyRemote(b.attacker, 1 / 60);
    assert.equal(b.attacker.stats.turf, Math.round(area));
    assert.equal(b.attacker.special, Math.round(area));
    assert.equal(a.attacker.stats.turf, area, 'owner preserves original fractional reward');
    assert.equal(a.paint.length, 1); assert.equal(b.paint.length, 1);
  } finally { a.dispose(); b.dispose(); }
});
