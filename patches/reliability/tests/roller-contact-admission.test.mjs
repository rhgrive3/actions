import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { combatWorld } from './combat-integration-fixture.mjs';

function placeRoller(world) {
  const { attacker, victim, G } = world;
  attacker.setWeapon('roller');
  attacker.isLocal = !attacker.remote;
  attacker.pos.set(0, 0, 0); attacker.vel.set(0, 0, 2); attacker.yaw = 0; attacker.grounded = true;
  victim.pos.set(0, 0, .8); victim.grounded = true;
  G.actors = [attacker, victim];
  return attacker.weaponRunner;
}

test('invulnerability rejection emits no generic feedback or Roller success debounce; vulnerable contact still kills', async () => {
  const f = await fixture(), { G, WEAPONS, Projectiles } = f;
  const attacker = f.make('roller'), victim = f.make('shooter');
  attacker.isLocal = true; attacker._nearCamera = () => false;
  victim.team = 1; victim.isLocal = true; victim._nearCamera = () => false;
  attacker.pos.set(0, 0, 0); attacker.vel.set(0, 0, 2); attacker.yaw = 0;
  victim.pos.set(0, 0, .8); victim.invuln = .01; G.paint.sample = () => 0;
  G.actors = [attacker, victim]; G.time = 1;
  const feedback = [], hits = [];
  G.audio = { play: (...args) => feedback.push(args), loop: () => ({ set(){}, stop(){} }) };
  f.on('hit', event => hits.push(event));
  G.projectiles = { applyHit: Projectiles.prototype.applyHit };
  const runner = attacker.weaponRunner;

  assert.equal(WEAPONS.roller.rollDamage, 140);
  assert.equal(runner._roller(1 / 60, { fire: true, firePressed: false }, WEAPONS.roller), undefined);
  assert.equal(victim.hp, 100);
  assert.equal(runner.rollHits.has(victim), false);
  assert.equal(hits.length, 0);
  assert.equal(feedback.filter(args => args[0] === 'ink_hit_body').length, 0);

  G.time += 1 / 60; victim.update(1 / 60);
  assert.equal(victim.invuln, 0, 'the real Actor.update expires the last partial protection tick');
  runner._roller(1 / 60, { fire: true, firePressed: false }, WEAPONS.roller);
  assert.equal(victim.hp, 0);
  assert.equal(victim.alive, false);
  assert.equal(runner.rollHits.has(victim), true);
  assert.equal(hits.length, 1);
  assert.equal(feedback.filter(args => args[0] === 'ink_hit_body').length, 1);
});

test('real victim update order around expiry does not leave failed-contact immunity; accepted cadence remains', async () => {
  for (const order of ['roller-first', 'victim-first']) {
    const f = await fixture(), { G, WEAPONS, Projectiles } = f;
    const attacker = f.make('roller'), victim = f.make('shooter');
    attacker.isLocal = victim.isLocal = true;
    attacker._nearCamera = victim._nearCamera = () => false;
    G.paint.sample = () => 0;
    victim.team = 1; victim.invuln = .01; victim.hp = 200;
    attacker.pos.set(0, 0, 0); attacker.vel.set(0, 0, 2); attacker.yaw = 0;
    victim.pos.set(0, 0, .8); G.actors = [attacker, victim]; G.time = 1;
    G.projectiles = { applyHit: Projectiles.prototype.applyHit };
    const runner = attacker.weaponRunner, dt = 1 / 60;

    if (order === 'roller-first') {
      runner._roller(dt, { fire: true, firePressed: false }, WEAPONS.roller);
      assert.equal(victim.hp, 200);
      assert.equal(runner.rollHits.has(victim), false);
      G.time += dt; victim.update(dt);
    } else {
      G.time += dt; victim.update(dt);
    }
    assert.equal(victim.invuln, 0);
    G.time += dt;
    runner._roller(dt, { fire: true, firePressed: false }, WEAPONS.roller);
    assert.equal(victim.hp, 60, `${order}: accepted Roller contact applies the existing 140 damage`);
    const acceptedAt = runner.rollHits.get(victim);
    assert.equal(acceptedAt, G.time);
    G.time += dt;
    runner._roller(dt, { fire: true, firePressed: false }, WEAPONS.roller);
    assert.equal(victim.hp, 60, `${order}: a real accepted contact keeps the existing debounce`);
    assert.equal(runner.rollHits.get(victim), acceptedAt);
  }
});

test('remote Roller contact waits for owner acceptance, retries after rejection, and confirms once over the existing event wire', async () => {
  const sender = await combatWorld('A', { network: true }), receiver = await combatWorld('B', { network: true });
  try {
    const runner = placeRoller(sender), { victim } = sender;
    sender.G.time = 1;
    victim.invuln = .1;
    const feedback = [];
    sender.G.audio = { play: (...args) => feedback.push(args), loop: () => ({ set(){}, stop(){} }) };
    const hits = [], rejected = [];
    sender.on('hit', event => hits.push(event));
    sender.on('hit:rejected', event => rejected.push(event));

    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 0, 'known remote invulnerability is rejected before send');
    assert.equal(runner.rollHits.has(victim), false);
    assert.equal(hits.length, 0);
    assert.equal(feedback.filter(args => args[0] === 'ink_hit_body').length, 0);

    victim.invuln = 0;
    victim.net.buf.push({ t: 1000, hp: 100, life: victim.netLife });
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 1);
    assert.equal(runner.rollHits.get(victim), Infinity, 'send is pending owner admission, not an accepted hit');
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 1, 'one hit remains in flight until the owner publishes a newer state');

    receiver.victim.invuln = .01;
    receiver.deliver('A', sender.wire[0].data);
    assert.equal(receiver.victim.hp, 100, 'victim owner rejects the still-protected contact');
    assert.equal(hits.length, 0);
    receiver.net._sendTick();
    const rejection = receiver.wire.at(-1).data;
    assert.ok(rejection.e?.some(event => event[1] === 'ev' && event[2] === 'hit:rejected'),
      'victim owner reports invulnerability rejection through the existing event schema');
    sender.deliver('B', rejection);
    assert.equal(rejected.length, 1);
    assert.equal(hits.length, 0);
    assert.equal(runner.s3PendingRollHits.has(victim), false);
    assert.equal(runner.rollHits.has(victim), false, 'rejection clears the in-flight marker without starting a success debounce');

    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 2, 'the rejection acknowledgement admits a retry without starting the 0.5-second debounce');
    assert.equal(runner.rollHits.get(victim), Infinity);
    assert.deepEqual(Object.keys(sender.wire[1].data).sort(), ['a', 'd', 'h', 'k', 'l', 'v', 'w']);

    receiver.victim.invuln = 0;
    receiver.victim.specialActive = { armor: true };
    receiver.deliver('A', sender.wire[1].data);
    const afterAccepted = { hp: receiver.victim.hp, deaths: receiver.victim.stats.deaths };
    assert.deepEqual(afterAccepted, { hp: 65, deaths: 0 });
    receiver.deliver('A', sender.wire[1].data);
    assert.deepEqual({ hp: receiver.victim.hp, deaths: receiver.victim.stats.deaths }, afterAccepted,
      'the existing owner/life/sequence gate applies the accepted packet only once');

    receiver.advance(); // owner tick/event timestamps stay monotonic across the rejection and accepted confirmation
    receiver.net._sendTick();
    const confirmation = receiver.wire.at(-1).data;
    assert.ok(confirmation.e?.some(event => event[1] === 'ev' && event[2] === 'hit'),
      'the victim owner reports accepted nonlethal damage through the existing event schema');
    sender.deliver('B', confirmation);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].damage, 140);
    assert.equal(hits[0].killed, false);
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 2, 'the owner acknowledgement turns acceptance into the existing contact cooldown');
    assert.equal(runner.s3PendingRollHits.has(victim), false);
    assert.equal(runner.rollHits.get(victim), sender.G.time);
    assert.equal(feedback.filter(args => args[0] === 'ink_hit_body').length, 0,
      'predicted body audio stays suppressed; accepted hit feedback arrives as the owner event');
  } finally {
    sender.dispose(); receiver.dispose();
  }
});
