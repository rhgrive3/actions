import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { combatWorld } from './combat-integration-fixture.mjs';

function placeRoller(world) {
  const { attacker, victim, G } = world;
  attacker.setWeapon('roller');
  attacker.isLocal = !attacker.remote;
  attacker.pos.set(0, 0, 0); attacker.vel.set(0, 0, 2); attacker.yaw = 0; attacker.grounded = true;
  attacker.intent.move.set(0, 0, 1);
  victim.pos.set(0, 0, .8); victim.grounded = true;
  G.actors = [attacker, victim];
  return attacker.weaponRunner;
}

test('invulnerability rejection emits no generic feedback or Roller success debounce; vulnerable contact still kills', async () => {
  const f = await fixture(), { G, WEAPONS, Projectiles } = f;
  const attacker = f.make('roller'), victim = f.make('shooter');
  attacker.isLocal = true; attacker._nearCamera = () => false;
  victim.team = 1; victim.isLocal = true; victim._nearCamera = () => false;
  attacker.pos.set(0, 0, 0); attacker.vel.set(0, 0, 2); attacker.yaw = 0; attacker.grounded = true;
  attacker.intent.move.set(0, 0, 1);
  victim.pos.set(0, 0, .8); victim.invuln = .01; G.paint.sample = () => 0;
  G.actors = [attacker, victim]; G.time = 1;
  const feedback = [], hits = [];
  G.audio = { play: (...args) => feedback.push(args), loop: () => ({ set(){}, stop(){} }) };
  f.on('hit', event => hits.push(event));
  G.projectiles = { applyHit: Projectiles.prototype.applyHit };
  const runner = attacker.weaponRunner;

  assert.equal(WEAPONS.roller.rollDamage, 125);
  assert.equal(runner._roller(1 / 60, { fire: true, firePressed: false }, WEAPONS.roller), undefined);
  assert.equal(victim.hp, 100);
  assert.equal(runner.rollHits.has(victim), false);
  assert.equal(hits.length, 0);
  assert.equal(feedback.filter(args => args[0] === 'ink_hit_body').length, 0);

  G.time += 1 / 60; victim.update(1 / 60);
  assert.equal(victim.invuln, 0, 'the real Actor.update expires the last partial protection tick');
  runner._roller(1 / 60, { fire: true, firePressed: false }, WEAPONS.roller);
  assert.ok(victim.hp <= 0, 'lethal damage has been recorded before the deferred splat');
  assert.equal(victim.alive, true, 'current damage owner schedules lethal for the next Actor tick');
  G.time += 1 / 60; victim.update(1 / 60);
  assert.equal(victim.alive, false);
  assert.equal(victim.hp, 0);
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
    attacker.pos.set(0, 0, 0); attacker.vel.set(0, 0, 2); attacker.yaw = 0; attacker.grounded = true;
    attacker.intent.move.set(0, 0, 1);
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
    assert.equal(victim.hp, 75, `${order}: accepted Roller contact applies the existing 125 damage`);
    const acceptedAt = runner.rollHits.get(victim);
    assert.equal(acceptedAt, G.time);
    G.time += dt;
    runner._roller(dt, { fire: true, firePressed: false }, WEAPONS.roller);
    assert.equal(victim.hp, 75, `${order}: a real accepted contact keeps the existing debounce`);
    assert.equal(runner.rollHits.get(victim), acceptedAt);
  }
});

test('remote Roller retries on native cadence after lost confirmation and ignores late ACK for a newer request', async () => {
  const sender = await combatWorld('A', { network: true }), receiver = await combatWorld('B', { network: true });
  try {
    const runner = placeRoller(sender), { victim } = sender, { victim: ownedVictim } = receiver;
    sender.G.time = 1;
    victim.hp = ownedVictim.hp = 500;
    const feedback = [];
    sender.G.audio = { play: (...args) => feedback.push(args), loop: () => ({ set(){}, stop(){} }) };

    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    const first = sender.wire[0].data;
    assert.equal(first.h, 1);
    assert.equal(first.l, victim.netLife);
    receiver.deliver('A', first);
    receiver.deliver('A', first);
    assert.equal(ownedVictim.hp, 375, 'the owner applies the first h/l packet once despite replay');
    receiver.net._sendTick();
    const lateFirstAck = receiver.wire.at(-1).data;
    assert.ok(lateFirstAck.e?.some(event => event[1] === 'ev' && event[2] === 'hit'));

    sender.G.time = 1.4 - 1e-6;
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 1, 'the existing contact gate remains closed before the 0.4-second boundary');

    // sendHit returns true when tr/sendTo is absent. Let this native-cadence
    // retry disappear, then prove another retry can still reach the owner.
    sender.net.s.tr = null;
    sender.G.time = 1.4;
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 1);
    assert.equal(runner.rollHits.get(victim), sender.G.time, 'the transport-absent request keeps the native finite retry timestamp');
    assert.equal(runner.s3RollHitConfirmDisabled.has(victim), true,
      'the second attempt retires ambiguous ACK matching even though no transport sent it');

    const transport = { sendTo: (to, data) => sender.wire.push({ to, data: JSON.parse(JSON.stringify(data)) }) };
    sender.net.s.tr = transport;
    sender.G.time = 1.8;
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 2, 'ongoing contact recovers after the configured 0.4-second debounce');
    const second = sender.wire[1].data;
    assert.equal(second.h, 3, 'the current confirmed-hit owner reserves a sequence before transport delivery');
    assert.equal(second.l, first.l, 'the retry targets the same owner life');
    const secondSentAt = runner.rollHits.get(victim);
    assert.equal(secondSentAt, sender.G.time);
    assert.equal(feedback.filter(args => args[0] === 'ink_hit_body').length, 0,
      'no hit-body feedback is predicted while the owner confirmation is undelivered');

    sender.deliver('B', lateFirstAck);
    assert.equal(runner.rollHits.get(victim), secondSentAt,
      'an old same-owner/same-life ACK cannot resolve or extend the newer contact request');
    receiver.deliver('A', second);
    receiver.deliver('A', second);
    assert.equal(ownedVictim.hp, 250, 'the owner applies the newer h/l packet once despite replay');
    receiver.net._sendTick();
    sender.deliver('B', receiver.wire.at(-1).data);
    assert.equal(runner.rollHits.get(victim), secondSentAt,
      'current owner confirmation does not replace the native retry timestamp');
    assert.equal(feedback.filter(args => args[0] === 'ink_hit_body').length, 0);

    victim.netLife++;
    sender.G.time += 1 / 60;
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 3, 'a new victim life clears the previous contact timestamp immediately');
    assert.equal(sender.wire[2].data.l, victim.netLife);
    victim.owner = 'C';
    sender.G.time += 1 / 60;
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 4, 'an ownership change clears the previous contact timestamp immediately');
    assert.equal(sender.wire[3].to, 'C');

    runner.reset();
    sender.G.time += 1 / 60;
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 5, 'runner reset clears contact cooldown and request state');
  } finally {
    sender.dispose(); receiver.dispose();
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
    assert.equal(runner.rollHits.get(victim), sender.G.time,
      'the native contact timestamp remains finite while owner admission is pending');
    runner._roller(1 / 60, { fire: true, firePressed: false }, sender.WEAPONS.roller);
    assert.equal(sender.wire.length, 1, 'native contact cadence blocks a same-tick duplicate');

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
    assert.equal(sender.wire.length, 2, 'the rejection acknowledgement admits a retry without starting the configured 0.4-second debounce');
    assert.equal(runner.rollHits.get(victim), sender.G.time);
    assert.deepEqual(Object.keys(sender.wire[1].data).sort(), ['a', 'd', 'h', 'k', 'l', 'rp', 'seq', 'v', 'w']);
    assert.equal(sender.wire[1].data.rp, false, 'ordinary contact carries the accepted equipment flag without inventing Punisher');

    receiver.victim.invuln = 0;
    receiver.victim.specialActive = { armor: true };
    receiver.deliver('A', sender.wire[1].data);
    const afterAccepted = { hp: receiver.victim.hp, deaths: receiver.victim.stats.deaths };
    assert.deepEqual(afterAccepted, { hp: 68.8, deaths: 0 });
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
    assert.equal(hits[0].damage, 125);
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


test('reset keeps stale-ACK suppression without strongly retaining prior victims', async () => {
  const f = await combatWorld('A');
  try {
    const r=placeRoller(f), victim=f.victim;
    r.s3PendingRollHits.set(victim,{owner:victim.owner,life:victim.netLife});
    const weak=r.s3RollHitConfirmDisabled;
    assert.equal(Object.prototype.toString.call(weak),'[object WeakSet]');
    r.reset();
    assert.equal(r.s3RollHitConfirmDisabled,weak);
    assert.equal(weak.has(victim),true,'late events remain disabled for the same surviving object');
    assert.equal(r.s3PendingRollHits.size,0);assert.equal(r.s3RollHitEpochs.size,0);
  } finally {f.dispose();}
});
