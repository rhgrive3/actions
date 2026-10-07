import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const THROW_MAX_TICKS = Math.ceil(.35 * 60) + 1;
function armThrow(f,a) {
  assert.equal(a.specialActive?.phase,'hold');
  a.intent.special=false;a.intent.sub=true;f.tick(a);
  assert.equal(a.specialActive.phase,'hold');assert.equal(a.specialActive.subArmed,true);
  a.intent.sub=false;
}

const close = (actual, expected, msg = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-5, `${actual} != ${expected} (diff: ${Math.abs(actual - expected)}) ${msg}`);

function setupActor(f, { special = 'storm', grounded = true, onEnemy = true } = {}) {
  f.G.projectiles.throwStorm = () => {};
  f.G.physics.collideBody = () => ({});
  f.G.physics.groundProbe = (_x, _y, _z, _up, _down, _r, gh) => {
    gh.hit = grounded;
    gh.normal.set(0, 1, 0);
    return gh;
  };
  const a = f.make();
  a.weapon = { ...a.weapon, special };
  a.special = 200;
  a.grounded = grounded;
  f.G.paint.sample = () => (onEnemy ? 2 : 1);
  return a;
}

test('vulnerable Storm throw-state window applies normal passive enemy-ink damage across its 0.35s duration', async () => {
  const f = await fixture();
  const a = setupActor(f);

  // 1. One ordinary tick before activation: takes 0.3 HP damage
  f.tick(a);
  close(a.hp, 99.7);
  close(a.damageFromInk, 0.3);
  close(a.s3.enemyInkTime, 1 / 60);

  // 2. Activate special
  a.intent.special = true;
  f.tick(a);
  assert.equal(a.specialActive?.id, 'storm');
  assert.equal(a.specialActive?.armor, false);

  armThrow(f,a);
  // 3. The first update consumes a real R release; the existing throw lifetime is bounded.
  let stormTicks = 0;
  const hpStart = a.hp;
  for (let tick=0; a.specialActive && tick<THROW_MAX_TICKS; tick++) {
    stormTicks++;
    const prevHp = a.hp;
    const prevTime = a.s3.enemyInkTime;
    f.tick(a);
    close(a.hp, prevHp - 0.3);
    close(a.s3.enemyInkTime, prevTime + 1 / 60);
  }

  assert.equal(a.specialActive,null,'throw ends within the native .35s boundary');
  // 21-22 ticks elapsed, continuous damage applied
  assert.ok(stormTicks >= 21 && stormTicks <= 22);
  close(hpStart - a.hp, stormTicks * 0.3);
});

test('#624 Storm resource update runs once on activation, first/last lock, and first end tick at 30/60/120 Hz', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = setupActor(f);
    const clock = new f.FixedClock();
    a.intent.special = true;
    const rows = [];

    // The real Actor.update runs at 60 Hz under each render cadence.
    for (let frame = 0; frame < hz / 2; frame++) clock.advance(1 / hz, dt => {
      a.intent.sub = clock.ticks === 1;
      const before = a.specialActive?.id ?? null;
      const beforePhase = a.specialActive?.phase ?? null;
      const hpBefore = a.hp;
      const damageBefore = a.damageFromInk;
      const timeBefore = a.s3?.enemyInkTime || 0;
      f.G.time += dt;
      a.update(dt);
      rows.push({
        before, beforePhase, afterPhase:a.specialActive?.phase??null,
        after: a.specialActive?.id ?? null,
        hpDelta: hpBefore - a.hp,
        damageDelta: a.damageFromInk - damageBefore,
        timeDelta: (a.s3?.enemyInkTime || 0) - timeBefore,
      });
    });

    assert.equal(clock.ticks, 30, `${hz}Hz produces 30 fixed gameplay ticks`);
    assert.equal(rows[0].before, null);
    assert.equal(rows[0].after, 'storm', 'first real Actor.update activates Storm');
    close(rows[0].hpDelta, 0.3, 'activation tick applies one normal enemy-ink tick');
    close(rows[0].damageDelta, 0.3);
    close(rows[0].timeDelta, 1 / 60);

    const activeRows = rows.filter(row => row.beforePhase === 'throw' || row.afterPhase === 'throw');
    assert.ok(activeRows.length >= 21 && activeRows.length <= 22, `observed ${activeRows.length} Storm update ticks`);
    close(activeRows[0].damageDelta, 0.3, 'first active tick runs once');
    close(activeRows[0].timeDelta, 1 / 60);
    const lastLockIndex = rows.findIndex(row => row.before === 'storm' && row.after === null);
    assert.notEqual(lastLockIndex, -1, 'the last active tick clears the lock');
    close(rows[lastLockIndex].damageDelta, 0.3, 'last active tick runs once');
    close(rows[lastLockIndex].timeDelta, 1 / 60);
    const firstEndTick = rows[lastLockIndex + 1];
    assert.deepEqual([firstEndTick.before, firstEndTick.after], [null, null], 'next tick uses the ordinary Actor.update path');
    close(firstEndTick.damageDelta, 0.3, 'first end tick runs once');
    close(firstEndTick.timeDelta, 1 / 60);

    for (const [i, row] of rows.entries()) {
      close(row.hpDelta, 0.3, `tick ${i + 1} HP delta`);
      close(row.damageDelta, 0.3, `tick ${i + 1} damage accumulator`);
      close(row.timeDelta, 1 / 60, `tick ${i + 1} exposure time`);
    }
    close(a.hp, 100 - 30 * 0.3);
    close(a.damageFromInk, 30 * 0.3);
    close(a.s3.enemyInkTime, 0.5);
    assert.equal(f.profile.resources.enemyInkDps, 18);
    assert.equal(f.profile.resources.enemyInkDamageCap, 40);
    assert.equal(f.profile.resources.enemyInkGrace, 0);
    traces.push(rows);
  }
  assert.deepEqual(traces[1], traces[0], '60Hz fixed-tick trace matches 30Hz');
  assert.deepEqual(traces[2], traces[0], '120Hz fixed-tick trace matches 30Hz');
});

test('genuine invulnerability prevents passive enemy-ink damage during Storm throwlock', async () => {
  const f = await fixture();
  const a = setupActor(f);

  a.invuln = 2.0;
  a.intent.special = true;
  f.tick(a); // activation
  armThrow(f,a);

  for (let tick=0; a.specialActive && tick<THROW_MAX_TICKS; tick++) {
    f.tick(a);
    close(a.hp, 100);
    close(a.damageFromInk, 0);
  }
  assert.equal(a.specialActive,null,'throw terminates within the native bound');
});

test('airborne actor during Storm throwlock does not take grounded enemy-ink damage', async () => {
  const f = await fixture();
  const a = setupActor(f, { grounded: false });

  a.intent.special = true;
  f.tick(a); // activation
  armThrow(f,a);

  for (let tick=0; a.specialActive && tick<THROW_MAX_TICKS; tick++) {
    f.tick(a);
    close(a.hp, 100);
    close(a.damageFromInk, 0);
  }
  assert.equal(a.specialActive,null,'throw terminates within the native bound');
});

test('Ink Resistance Up grace period delays damage accumulation across Storm throwlock', async () => {
  const f = await fixture();
  f.profile.gearExtra.enemyInkGraceFrames = [3,3,3]; // Equip the current modifier owner with a 3F test grace.
  const a = setupActor(f);

  // Step 1: activation
  a.intent.special = true;
  f.tick(a);

  // Activation and the next two lock ticks reach the same continuous 3-tick grace.
  close(a.s3.enemyInkTime, 1 / 60);
  a.intent.sub=true;f.tick(a); // real R press, exposure 2/60
  close(a.hp, 100);
  a.intent.sub=false;f.tick(a); // real R release, exposure 3/60, grace boundary
  close(a.hp, 100);
  f.tick(a); // exposure 4/60
  close(a.hp, 99.7, 'damage starts on the first tick beyond activation-inclusive grace');
  close(a.damageFromInk, 0.3);
  close(a.s3.enemyInkTime, 4 / 60);
});

test('Storm throwlock does not grant armor against weapon hits', async () => {
  const f = await fixture();
  const a = setupActor(f, { onEnemy: false }); // dry/friendly ground

  a.intent.special = true;
  f.tick(a); // activation
  assert.equal(a.specialActive?.id, 'storm');
  assert.equal(a.specialActive?.armor, false);
  armThrow(f,a);f.tick(a);assert.equal(a.specialActive.phase,'throw');

  const dealt = a.damage(40, null, 'weapon');
  assert.equal(dealt, false);
  close(a.hp, 60, 'Storm user takes full weapon damage without armor reduction');
});

// #624 admits only Storm, preserving Slam activation and rise resource gates.
test('#624 Storm-only resource admission preserves HP and ink gates during Slam activation and rise', async () => {
  const f = await fixture();
  const a = setupActor(f, { special: 'slam', grounded: false, onEnemy: false });
  a.hp = 80; a.ink = 50; a.lastDamage = 10; a.lastFire = 10;
  a.intent.special = true;
  f.tick(a);
  assert.equal(a.specialActive?.id, 'slam');
  close(a.hp, 80, 'Slam activation does not run Storm resource processing');
  close(a.ink, 50);
  f.tick(a);
  assert.equal(a.specialActive?.id, 'slam');
  close(a.hp, 80, 'unrelated Slam HP recovery remains unchanged');
  close(a.ink, 50, 'unrelated Slam ink refill remains unchanged');
});

test('Storm activation uses the existing enemy-ink damage cap', async () => {
  const f = await fixture();
  const a = setupActor(f);
  a.damageFromInk = 39.9; a.hp = 60.1; // Current cap uses total HP loss, not this diagnostic accumulator.
  a.intent.special = true;
  f.tick(a);
  close(a.damageFromInk, 40, 'activation tick clamps at the existing 40 HP cap');
  close(a.hp, 60);
  f.tick(a);
  close(a.damageFromInk, 40, 'active tick does not exceed the cap');
  close(a.hp, 60);
});
