// Issue #394 (lane cl7, test-only): parent owns combat-life / combat-credit
// adapters; this file only exercises the integrated parent combat-life
// adapter plus the parent combat-integration fixture. Shared adapter and
// fixture copies in this worktree are uncommitted test dependencies.
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
    defender.net.onMessage('A', tick(defender));
    shooter.net.onMessage('B', defender.wire.at(-1).data);
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
    tick(shooter);
    const first = shooter.wire.at(-1).data;
    shooter.victim.respawn();
    shooter.victim.invuln = 0;
    tick(shooter);
    const second = shooter.wire.at(-1).data;
    assert.ok(second.ts > first.ts, 'fixture needs strictly ordered ticks');
    defender.net.onMessage('A', structuredClone(second));
    const accepted = defender.victim.net.lastLife;
    defender.net.onMessage('A', structuredClone(first));
    assert.equal(
      defender.victim.net.lastLife,
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
    defender.net.onMessage('A', fresh);
    assert.equal(defender.victim.hp, 70);
    assert.equal(defender.net._applyingHit, undefined, 'successful hit restores an unset flag');
  } finally { shooter.dispose(); defender.dispose(); }
});
