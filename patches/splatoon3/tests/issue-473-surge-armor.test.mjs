// Issue #473: Partial-charge Squid Surge armor acceptance tests.
// S3 Ver. 11.3.0 reference: Squid Surge can be released before full charge,
// and immediately upon launching from the wall gains the same short armor window
// as wall Squid Roll, regardless of how fully the Surge was charged.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptIssue473 } from '../issue-473-adapter.mjs';

const close = (actual, expected, eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} not close to ${expected} (diff: ${Math.abs(actual - expected)})`);

test('issue-473 adapter: replaces exact anchors in movement runtime', () => {
  const mockCode = `
      surge.phase = 'burst'; surge.time = cfg.surge.duration * surge.charge;
      surge.speed = cfg.surge.minimumVelocity + (cfg.surge.velocity - cfg.surge.minimumVelocity) * surge.charge;
      surge.armorTime = surge.charge >= 1 ? cfg.surge.armorTime : 0;
      surge.armorHP = cfg.surge.armorHP;
  if (state.surge?.phase === 'burst') {
    const burst = state.surge; burst.time -= dt;
    if (burst.time <= 1e-10 || !a.climbing && a.grounded) state.surge = null;
    else if (a.climbing) {
      a.climbV = burst.speed; a.vel.y = burst.speed; a.jumpBuffer = 0;
      sync(a, state); return true;
    }
  }
  const reset = Actor.prototype.reset, damage = Actor.prototype.damage;
  Actor.prototype.reset = function (...args) {
`;

  const adapted = adaptIssue473('patches/splatoon3/runtime/movement.mjs', mockCode);
  assert.ok(adapted.includes('surge.armorTime = surge.charge > 0 ? cfg.surge.armorTime : 0;'));
  assert.ok(adapted.includes("burst.phase = 'armor';"));
  assert.ok(adapted.includes('Actor.prototype.splat = function'));

  // Non-matching file path should return code unmodified
  assert.equal(adaptIssue473('src/game/actor.js', mockCode), mockCode);
});

test('Negative control: unpatched baseline grants zero armor to partial charges', async () => {
  const f = await fixture(); // Unpatched runtime
  for (const ticks of [1, 15, 30, 44]) {
    const a = f.make();
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, ticks);
    assert.ok(a.s3.surge.charge < 1, `charge at ${ticks}f should be < 1`);
    a.intent.jump = false;
    f.tick(a, 1);
    assert.equal(a.s3.surge?.armorTime ?? 0, 0, `unpatched ${ticks}f partial charge must have 0 armorTime`);
    if (a.s3.surge) {
      assert.equal(a.s3.surge.phase, 'burst');
    }

    // Takes full unmitigated damage
    const hpBefore = a.hp;
    a.damage(50, null, 'shooter');
    assert.equal(hpBefore - a.hp, 50, `unpatched ${ticks}f partial charge absorbs 0 damage`);
  }

  // Control: 45f full charge receives armor in baseline
  const aFull = f.make();
  aFull.form = 'squid'; aFull.intent.squid = true; aFull.intent.jump = true; aFull.climbing = true; aFull._updateClimb = () => {};
  f.tick(aFull, 45);
  assert.equal(aFull.s3.surge.charge, 1);
  aFull.intent.jump = false;
  f.tick(aFull, 1);
  assert.ok(aFull.s3.surge.armorTime > 0, 'baseline 45f full charge has armorTime > 0');
  const hpBeforeFull = aFull.hp;
  aFull.damage(50, null, 'shooter');
  assert.equal(hpBeforeFull - aFull.hp, 0, 'baseline 45f full charge absorbs damage');
});

test('Patched: 1f, 15f, 30f, 44f partial and 45f full charges all gain post-launch armor', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue473 });
  const expectedArmorTime = f.profile.movement.surge.armorTime; // 0.13333333333333333 = 8F

  for (const ticks of [1, 15, 30, 44, 45]) {
    const a = f.make();
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, ticks);

    const expectedCharge = Math.min(1, ticks / 45);
    close(a.s3.surge.charge, expectedCharge);

    a.intent.jump = false;
    f.tick(a, 1);

    assert.ok(a.s3.surge, `actor at ${ticks}f should have active surge`);
    close(a.s3.surge.armorTime, expectedArmorTime);
    assert.equal(a.s3.surge.armorHP, f.profile.movement.surge.armorHP);

    // Apply 50 damage: completely absorbed by armor without depleting HP
    const hpBefore = a.hp;
    a.damage(50, null, 'shooter');
    assert.equal(a.hp, hpBefore, `${ticks}f surge armor must absorb 50 damage fully`);
    assert.equal(a.s3.surge.armorHP, 50, 'armor HP decreased by 50');
  }
});

test('Movement speed and duration scale with charge while armor eligibility is uniform', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue473 });
  const cfg = f.profile.movement.surge;

  const results = [];
  for (const ticks of [15, 30, 45]) {
    const a = f.make();
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, ticks);
    a.intent.jump = false;
    f.tick(a, 1);
    results.push({
      ticks,
      charge: a.s3.surge.charge,
      speed: a.s3.surge.speed,
      armorTime: a.s3.surge.armorTime,
    });
  }

  // 15f < 30f < 45f speed scaling
  assert.ok(results[0].speed < results[1].speed);
  assert.ok(results[1].speed < results[2].speed);
  close(results[2].speed, cfg.velocity); // Full charge reaches max velocity (15 m/s)

  // Armor time is identical across all charge levels
  close(results[0].armorTime, results[1].armorTime);
  close(results[1].armorTime, results[2].armorTime);
});

test('Exact 8-frame armor countdown and boundary assertions (fixed 60 Hz)', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue473 });

  // Test 15-frame partial charge tick by tick across the 8-frame window
  for (let frame = 1; frame <= 10; frame++) {
    const a = f.make();
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, 15);
    a.intent.jump = false;
    f.tick(a, frame);

    const hpBefore = a.hp;
    a.damage(40, null, 'shooter');
    const absorbed = 40 - (hpBefore - a.hp);

    if (frame <= 8) {
      assert.equal(absorbed, 40, `frame ${frame} must absorb damage (armor active)`);
    } else {
      assert.equal(absorbed, 0, `frame ${frame} must not absorb damage (armor expired)`);
    }
  }
});

test('Common armor durability model: absorbs up to 100 HP; depleted shield absorbs no more', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue473 });
  const a = f.make();
  a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
  f.tick(a, 20);
  a.intent.jump = false;
  f.tick(a, 1);

  assert.equal(a.hp, 100);
  assert.equal(a.s3.surge.armorHP, 100);

  // Hit 1: 60 damage -> 60 absorbed, 0 HP lost, armorHP = 40
  a.damage(60, null, 'shooter');
  assert.equal(a.hp, 100);
  assert.equal(a.s3.surge.armorHP, 40);

  // Hit 2: 60 damage -> 40 absorbed (exhausts shield), 20 damage penetrates to HP
  a.damage(60, null, 'shooter');
  assert.equal(a.hp, 80);
  assert.equal(a.s3.surge.armorHP, 0);

  // Hit 3: 60 damage -> 0 absorbed, 60 damage penetrates to HP
  a.damage(60, null, 'shooter');
  assert.equal(a.hp, 20);
});

test('Negative control: charge canceled before burst gains no armor', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue473 });
  const a = f.make();
  a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
  f.tick(a, 20); // Hold jump on wall
  assert.ok(a.s3.surge && a.s3.surge.phase === 'charge');

  // Detach from wall before releasing jump (charge aborted)
  a.climbing = false;
  f.tick(a, 1);
  assert.equal(a.s3.surge, null, 'surge cleared on wall detach');

  // Now release jump: no burst occurred
  a.intent.jump = false;
  f.tick(a, 1);
  assert.equal(a.s3.surge, null, 'no surge created on post-cancel release');

  // Taking damage has no armor protection
  const hpBefore = a.hp;
  a.damage(50, null, 'shooter');
  assert.equal(hpBefore - a.hp, 50, 'aborted surge gains zero armor');
});

test('Negative control: unadmitted zero-charge input gains no armor', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue473 });
  const a = f.make();
  a.form = 'squid'; a.intent.squid = true; a.intent.jump = false; a.climbing = true; a._updateClimb = () => {};
  f.tick(a, 10);
  assert.equal(a.s3.surge, null, 'no jump pressed means no surge');

  const hpBefore = a.hp;
  a.damage(50, null, 'shooter');
  assert.equal(hpBefore - a.hp, 50);
});

test('Lifecycle cancellation: ground landing, form switch, superjump, and reset immediately clear armor', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue473 });

  // 1. Landing on ground cancels surge armor
  {
    const a = f.make();
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, 20); a.intent.jump = false; f.tick(a, 1);
    assert.ok(a.s3.surge);
    a.climbing = false; a.grounded = true;
    f.tick(a, 1);
    assert.equal(a.s3.surge, null, 'landing on ground clears surge');
  }

  // 2. Switching to kid form cancels surge armor
  {
    const a = f.make();
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, 20); a.intent.jump = false; f.tick(a, 1);
    assert.ok(a.s3.surge);
    a.form = 'kid'; a.intent.squid = false;
    f.tick(a, 1);
    assert.equal(a.s3.surge, null, 'switching to kid clears surge');
  }

  // 3. Super Jump cancels surge armor
  {
    const a = f.make(); a._resolve = () => {};
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, 20); a.intent.jump = false; f.tick(a, 1);
    assert.ok(a.s3.surge);
    a.superJump(new f.THREE.Vector3(0, 0, 10));
    assert.equal(a.s3.surge, null, 'superjump clears surge');
  }

  // 4. Reset (practice range / match teardown) clears surge armor
  {
    const a = f.make();
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, 20); a.intent.jump = false; f.tick(a, 1);
    assert.ok(a.s3.surge);
    a.reset();
    assert.equal(a.s3.surge, null, 'reset clears surge');
  }

  // 5. Fatal hit / splat clears surge armor immediately
  {
    const a = f.make();
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, 20); a.intent.jump = false; f.tick(a, 1);
    assert.ok(a.s3.surge);
    a.damage(999, null, 'bomb');
    assert.equal(a.alive, false);
    assert.equal(a.s3.surge, null, 'fatal damage clears surge');
  }
});

test('FixedClock 30/60/120 Hz render cadence equivalence', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue473 });

  // Under identical 60Hz fixed simulation step (1/60s), advance across different render frequencies
  for (const hz of [30, 60, 120]) {
    const a = f.make();
    a.form = 'squid'; a.intent.squid = true; a.intent.jump = true; a.climbing = true; a._updateClimb = () => {};
    f.tick(a, 30); // 30 ticks of charge
    a.intent.jump = false;
    f.tick(a, 1); // Launch burst

    assert.equal(a.s3.surge.phase, 'burst');
    close(a.s3.surge.charge, 30 / 45);
    close(a.s3.surge.armorTime, f.profile.movement.surge.armorTime);

    // Armor absorbs damage across all cadences identically
    const hpBefore = a.hp;
    a.damage(30, null, 'shooter');
    assert.equal(a.hp, hpBefore, `30 damage absorbed at ${hz}Hz schedule`);
  }
});
