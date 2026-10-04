// Combat-life admission through the production adapters and native wire path.
import assert from 'node:assert/strict';
import test from 'node:test';
import { combatWorld } from './combat-integration-fixture.mjs';

const tick = (world) => {
  world.advance();
  world.net._sendTick();
  return world.wire.at(-1).data;
};

test('stale life hit is dropped, matching life hit damages the same life', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 30, 'shooter');
    const fresh = shooter.wire.at(-1).data;
    assert.equal(typeof fresh.l, 'number', 'parent hit carries observed life');
    defender.victim.splat(null, 'water');
    defender.victim.respawn();
    defender.victim.invuln = 0;
    const before = { hp: defender.victim.hp, deaths: defender.victim.stats.deaths };
    defender.net.onMessage('A', fresh);
    assert.deepEqual(
      { hp: defender.victim.hp, deaths: defender.victim.stats.deaths },
      before,
      'stale life hit must not damage the respawned life',
    );
    shooter.net.onMessage('B', tick(defender));
    const peer = shooter.net.peers.get('B');
    peer.tr = defender.wire.at(-1).data.ts;
    peer.sim = Number.MAX_SAFE_INTEGER;
    shooter.net._sample(shooter.victim, peer.tr, 1 / 60);
    shooter.net.applyRemote(shooter.victim, 1 / 60);
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 30, 'shooter');
    const admitted = shooter.wire.at(-1).data;
    defender.net.onMessage('A', admitted);
    assert.equal(defender.victim.hp, before.hp - 30);
    assert.equal(defender.victim.stats.deaths, before.deaths);
  } finally { shooter.dispose(); defender.dispose(); }
});

test('dead then respawned hit window expires without damaging the new life', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 100, 'shooter');
    const lethal = shooter.wire.at(-1).data;
    defender.net.onMessage('A', lethal);
    assert.equal(defender.victim.alive, false);
    const held = structuredClone(lethal);
    const deaths = defender.victim.stats.deaths;
    defender.net.onMessage('A', { ...held, h: held.h + 1 });
    assert.equal(defender.victim.hp, 0);
    assert.equal(defender.victim.stats.deaths, deaths);
    defender.victim.respawn();
    defender.victim.invuln = 0;
    const hp = defender.victim.hp;
    defender.net.onMessage('A', held);
    assert.equal(defender.victim.hp, hp, 'replayed lethal old-life hit cannot touch new life');
    assert.equal(defender.victim.alive, true);
  } finally { shooter.dispose(); defender.dispose(); }
});

test('missing or malformed hit life metadata is rejected', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 30, 'shooter');
    const fresh = shooter.wire.at(-1).data;
    const before = defender.victim.hp;
    defender.net.onMessage('A', { ...fresh, l: undefined });
    for (const epoch of [-1, 1.5, NaN, Infinity, fresh.l + 1]) {
      defender.net.onMessage('A', { ...fresh, l: epoch });
    }
    const noField = { ...fresh };
    delete noField.l;
    defender.net.onMessage('A', noField);
    assert.equal(defender.victim.hp, before);
    defender.net.onMessage('foreign', shooter.wire.at(-1).data);
    assert.equal(defender.victim.hp, before, 'hit from non-owner channel is rejected');
  } finally { shooter.dispose(); defender.dispose(); }
});

test('superjump teleport counter stays independent of the life epoch', async () => {
  const world = await combatWorld('A');
  try {
    const life = world.victim.netLife;
    const tp = world.victim.netTp ?? 0;
    world.victim.respawn();
    assert.equal(world.victim.netLife, life + 1, 'respawn advances life exactly once');
    assert.equal(world.victim.netTp, tp + 1, 'respawn advances teleport counter exactly once');
    const before = world.victim.netLife;
    world.victim.netTp += 1;
    assert.equal(world.victim.netLife, before, 'teleport-only movement must not mint a life');
  } finally { world.dispose(); }
});

test('adopted owner keeps continuity across the accepted snapshot epoch', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    // Victim is owned by B, so only defender's tick carries its snapshot.
    shooter.net.onMessage('B', tick(defender));
    const accepted = shooter.victim.net.lastLife;
    assert.ok(accepted >= 0, 'accepted owner snapshot records life');
    // Stale local epoch must not survive adoption: continuity takes the max.
    shooter.victim.netLife = 0;
    shooter.victim.remote = false;
    shooter.victim.owner = shooter.net.myId;
    shooter.net._adopt(shooter.victim);
    assert.equal(
      shooter.victim.netLife,
      Math.max(0, accepted ?? 0),
      'adopted owner continues from the accepted life, never below it',
    );
    assert.equal(shooter.victim.owner, shooter.net.myId);
    assert.equal(shooter.victim.remote, false);
  } finally { shooter.dispose(); defender.dispose(); }
});

test('reordered owner snapshots keep the highest accepted life', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    const first = tick(defender);
    defender.victim.respawn();
    defender.victim.invuln = 0;
    const second = tick(defender);
    assert.ok(second.ts > first.ts, 'fixture needs strictly ordered ticks');
    shooter.net.onMessage('B', structuredClone(second));
    const accepted = shooter.victim.net.lastLife;
    assert.equal(accepted, defender.victim.netLife);
    shooter.net.onMessage('B', structuredClone(first));
    assert.equal(
      shooter.victim.net.lastLife,
      accepted,
      'reordered earlier-timestamp snapshot with older life cannot regress acceptance',
    );
  } finally { shooter.dispose(); defender.dispose(); }
});

test('hit application restores a thrown _applyingHit flag', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 30, 'shooter');
    const fresh = shooter.wire.at(-1).data;
    defender.net._applyingHit = 'outer';
    const real = defender.G.projectiles.applyHit;
    defender.G.projectiles.applyHit = () => { throw new Error('boom'); };
    try {
      assert.throws(() => defender.net.onMessage('A', fresh), /boom/);
    } finally {
      defender.G.projectiles.applyHit = real;
    }
    assert.equal(defender.net._applyingHit, 'outer', 'failed hit must restore the outer flag');
    assert.equal(defender.victim.hp, 100);
    defender.net._applyingHit = undefined;
    defender.net.onMessage('A', { ...fresh, h: fresh.h + 1 });
    assert.equal(defender.victim.hp, 70);
    assert.equal(defender.net._applyingHit, undefined, 'successful hit restores an unset flag');
  } finally { shooter.dispose(); defender.dispose(); }
});

test('a newer buffered life does not label the older life still being rendered', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    const first = tick(defender);
    shooter.net.onMessage('B', first);
    defender.victim.respawn(); defender.victim.invuln = 0;
    shooter.net.onMessage('B', tick(defender));
    assert.equal(shooter.victim.net.lastLife, defender.victim.netLife);
    const peer = shooter.net.peers.get('B'); peer.tr = first.ts;
    shooter.net._sample(shooter.victim, peer.tr, 1 / 60);
    shooter.net.applyRemote(shooter.victim, 1 / 60);
    assert.equal(shooter.victim.netLife, defender.victim.netLife - 1);
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 20, 'shooter');
    const hit = shooter.wire.at(-1).data;
    assert.equal(hit.l, shooter.victim.net.cur.life);
    defender.net.onMessage('A', hit);
    assert.equal(defender.victim.hp, 100);
  } finally { shooter.dispose(); defender.dispose(); }
});

test('native owner leave and host adoption keep valid current-life hits admissible', async () => {
  const shooter = await combatWorld('A'), owner = await combatWorld('B'), host = await combatWorld('C');
  try {
    const current = tick(owner); host.net.onMessage('B', current);
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 20, 'shooter');
    const held = shooter.wire.at(-1).data;
    host.net.s.hostId = 'C'; host.net.onLeave('B', false);
    assert.equal(host.victim.owner, 'C');
    assert.equal(host.victim.remote, false);
    assert.equal(host.victim.netLife, held.l);
    host.net.onMessage('A', held);
    assert.equal(host.victim.hp, 80);
    host.net.onMessage('A', held);
    assert.equal(host.victim.hp, 80);
  } finally { shooter.dispose(); owner.dispose(); host.dispose(); }
});

test('named life metadata stays independent of an unrelated appended actor tuple field', async () => {
  const shooter = await combatWorld('A'), defender = await combatWorld('B');
  try {
    const msg = tick(defender);
    for (const actor of msg.a) actor.push(9); // e.g. PR #328 special-use counter at slot21
    shooter.net.onMessage('B', msg);
    assert.equal(shooter.victim.net.lastLife, defender.victim.netLife);
    const peer = shooter.net.peers.get('B'); peer.tr = msg.ts;
    shooter.net._sample(shooter.victim, peer.tr, 1 / 60);
    shooter.net.applyRemote(shooter.victim, 1 / 60);
    assert.equal(shooter.victim.netLife, defender.victim.netLife);
    shooter.G.projectiles.applyHit(shooter.attacker, shooter.victim, 20, 'shooter');
    defender.net.onMessage('A', shooter.wire.at(-1).data);
    assert.equal(defender.victim.hp, 80);
    const missing = tick(defender); delete missing.l;
    for (const actor of missing.a) actor.push(defender.victim.netLife);
    const before = shooter.victim.net.buf.length;
    shooter.net.onMessage('B', missing);
    assert.equal(shooter.victim.net.buf.length, before, 'tuple field cannot substitute for required life identity');
  } finally { shooter.dispose(); defender.dispose(); }
});
