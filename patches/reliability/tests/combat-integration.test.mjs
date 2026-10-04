import assert from 'node:assert/strict';
import test from 'node:test';
import { combatWorld } from './combat-integration-fixture.mjs';

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
    assert.equal(defender.attacker.stats.turf, 0, 'remote proxy never earns authoritative reward');
  } finally { shooter.dispose(); defender.dispose(); }
});

test('offline damage and death-burst rewards remain native with no network owner', async () => {
  const world = await combatWorld('A');
  try {
    world.net.dispose(); world.attacker.remote = world.victim.remote = false;
    world.G.projectiles.applyHit(world.attacker, world.victim, 30, 'shooter');
    assert.equal(world.victim.hp, 70); assert.equal(world.paint.length, 0);
    world.G.projectiles.applyHit(world.attacker, world.victim, 70, 'shooter');
    assert.equal(world.attacker.stats.turf, .123456789);
    assert.equal(world.attacker.special, .123456789);
    assert.equal(world.paint.length, 1);
  } finally { world.dispose(); }
});
