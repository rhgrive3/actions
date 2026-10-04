import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptIssue479 } from '../issue-479-adapter.mjs';
import { FixedClock } from '../runtime/clock.mjs';

const EPS = 1e-9;
const close = (actual, expected, msg) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${msg || 'Value mismatch'}: expected ${expected}, got ${actual}`);

// --- Adapter tests ---
test('issue-479 adapter transform applies cleanly and fails closed on anchor mismatches', () => {
  const dummy = 'export function installRollerLogic({ WeaponRunner }, _profile) {\n' +
    '    const starting = this.flick < 0 && inp.firePressed && this.cooldown <= EPS && a.ink >= (!a.grounded ? w.verticalInk : w.flickInk);\n' +
    '    if (starting) {\n' +
    '      this.cooldown = Math.min(0, this.cooldown);\n' +
    '      this.s3FlickVertical = !a.grounded;\n';

  const transformed = adaptIssue479('patches/splatoon3/runtime/roller.mjs', dummy);
  assert.ok(transformed.includes('selectRollerFlickVertical'));
  assert.ok(transformed.includes('installActorFreefallHooks'));
  assert.ok(!transformed.includes('!a.grounded ? w.verticalInk'));

  // Non-target files remain untouched
  assert.equal(adaptIssue479('src/game/actor.js', dummy), dummy);
  assert.equal(adaptIssue479('patches/splatoon3/runtime/weapons.mjs', dummy), dummy);

  // Missing anchor throws fail-closed error
  assert.throws(() => adaptIssue479('patches/splatoon3/runtime/roller.mjs', 'invalid code'), /conflict/);
});

// --- Negative control test ---
test('negative control: unpatched baseline selects vertical immediately on 1F natural fall', async () => {
  const unpatched = await fixture(); // baseline without adaptIssue479
  const a = unpatched.make('roller');
  // Walk off ledge without jumping
  a.grounded = false;
  a.intent.fire = true;
  unpatched.tick(a, 1);

  // Unpatched baseline erroneously selects vertical immediately on the first airborne frame
  assert.equal(a.weaponRunner.s3FlickVertical, true, 'unpatched baseline selects vertical immediately on 1F');
  assert.equal(a.weaponRunner.s3RollerAttack?.vertical, true);
  close(a.weaponRunner.s3RollerAttack?.windup, 26 / 60, 'unpatched baseline sets vertical 26F windup');
});

// --- Acceptance: early representative points (1F, 10F, 20F) ---
test('deterministic natural free fall at 1F, 10F, and 20F all select horizontal mode', async () => {
  for (const targetTick of [1, 10, 20]) {
    const f = await fixture({ adaptRuntime: adaptIssue479 });
    const a = f.make('roller');
    // Walk off ledge without jumping
    a.grounded = false;
    if (targetTick > 1) {
      f.tick(a, targetTick - 1);
    }
    a.intent.fire = true;
    f.tick(a, 1);

    assert.equal(a.weaponRunner.s3FlickVertical, false, `natural fall at ${targetTick}F must select horizontal`);
    assert.equal(a.weaponRunner.s3RollerAttack?.vertical, false);
    close(a.weaponRunner.s3RollerAttack?.windup, 21 / 60, 'horizontal flick has 21F windup');
  }
});

// --- Acceptance: boundary around 25F reference free-fall grace ---
test('natural free fall boundary: 25F is horizontal, 26F transitions to vertical', async () => {
  // Test boundary point 25F: still inside grace -> horizontal
  {
    const f = await fixture({ adaptRuntime: adaptIssue479 });
    const a = f.make('roller');
    a.grounded = false;
    f.tick(a, 24); // 24 ticks elapsed in natural fall
    a.intent.fire = true;
    f.tick(a, 1); // 25th tick in natural fall

    assert.equal(a.weaponRunner.s3FlickVertical, false, 'natural fall at 25F is within grace and selects horizontal');
    assert.equal(a.weaponRunner.s3RollerAttack?.vertical, false);
    close(a.weaponRunner.s3RollerAttack?.windup, 21 / 60, '25F attack has 21F horizontal windup');
  }

  // Test boundary point 26F: grace expired -> vertical
  {
    const f = await fixture({ adaptRuntime: adaptIssue479 });
    const a = f.make('roller');
    a.grounded = false;
    f.tick(a, 25); // 25 ticks elapsed in natural fall
    a.intent.fire = true;
    f.tick(a, 1); // 26th tick in natural fall (after 25F grace)

    assert.equal(a.weaponRunner.s3FlickVertical, true, 'natural fall at 26F exceeds grace and selects vertical');
    assert.equal(a.weaponRunner.s3RollerAttack?.vertical, true);
    close(a.weaponRunner.s3RollerAttack?.windup, 26 / 60, '26F attack has 26F vertical windup');
  }
});

// --- Acceptance: normal B jump selects vertical immediately ---
test('normal B jump followed by ZR selects vertical immediately on 1F', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue479 });
  const a = f.make('roller');
  // Jump from ground
  a.intent.jump = true;
  a.intent.fire = true;
  f.tick(a, 1);

  assert.equal(a.weaponRunner.s3FlickVertical, true, 'normal jump selects vertical immediately on 1F');
  assert.equal(a.weaponRunner.s3RollerAttack?.vertical, true);
  close(a.weaponRunner.s3RollerAttack?.windup, 26 / 60, 'vertical jump flick has 26F windup');
});

// --- Acceptance: mode latching across transitions ---
test('grounded ZR followed by later jump keeps its already-selected horizontal mode', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue479 });
  const a = f.make('roller');

  // Start horizontal attack while grounded
  a.intent.fire = true;
  f.tick(a, 1);
  assert.equal(a.weaponRunner.s3FlickVertical, false, 'grounded start is horizontal');

  // Jump during windup on next frame
  a.intent.jump = true;
  a.intent.fire = false;
  f.tick(a, 1);
  assert.equal(a.weaponRunner.s3FlickVertical, false, 'mode remains horizontal after jumping');
  assert.equal(a.weaponRunner.s3RollerAttack?.vertical, false);

  // Land during windup
  a.grounded = true;
  a.intent.jump = false;
  f.tick(a, 1);
  assert.equal(a.weaponRunner.s3FlickVertical, false, 'mode remains horizontal after landing');
  assert.equal(a.weaponRunner.s3RollerAttack?.vertical, false);

  // Advance until horizontal shot releases (21F windup = 0.35 s)
  f.tick(a, 19);
  assert.equal(f.shots.length, 1, 'shot released at 21F horizontal windup');
  close(f.shots[0].windup, 21 / 60, 'released shot windup is horizontal');
  assert.equal(a.weaponRunner.s3RollerAttack.vertical, false);
});

test('landing during an already-selected airborne vertical attack keeps its vertical mode', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue479 });
  const a = f.make('roller');

  // Start vertical attack in air via jump
  a.intent.jump = true;
  a.intent.fire = true;
  f.tick(a, 1);
  assert.equal(a.weaponRunner.s3FlickVertical, true, 'jump start is vertical');

  // Land during windup on next frame
  a.grounded = true;
  a.intent.jump = false;
  a.intent.fire = false;
  f.tick(a, 1);
  assert.equal(a.weaponRunner.s3FlickVertical, true, 'mode remains vertical after landing');
  assert.equal(a.weaponRunner.s3RollerAttack?.vertical, true);

  // 24 more ticks (total 26 ticks from start): vertical windup is 26 ticks
  f.tick(a, 24);
  assert.equal(f.shots.length, 0, 'vertical shot must wait full 26F windup despite landing');

  f.tick(a, 1);
  assert.equal(f.shots.length, 1, 'vertical shot releases at 26F');
  close(f.shots[0].windup, 26 / 60, 'released shot windup is vertical');
  assert.equal(a.weaponRunner.s3RollerAttack.vertical, true);
});

// --- Acceptance: windup, projectile distribution, ink cost parity ---
test('correct mode selects windup, projectile count and ink cost without duplication', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue479 });
  const system = new f.Projectiles(new f.THREE.Scene());

  // Horizontal attack inside free-fall grace (10F)
  const aH = f.make('roller');
  aH.grounded = false;
  f.tick(aH, 9);
  aH.intent.fire = true;
  f.tick(aH, 1);
  assert.equal(aH.weaponRunner.s3FlickVertical, false);

  system.list.length = 0;
  system.fireFlick(aH, aH.weapon);
  // Horizontal Roller has 12 fan drops + 1 near unit = 13 projectiles
  assert.equal(system.list.length, 13, 'horizontal flick spawns 13 projectile units');
  close(aH.ink, 100 - 8.5, 'spends exact flickInk (8.5) once');

  // Vertical attack after free-fall grace (26F)
  const aV = f.make('roller');
  aV.grounded = false;
  f.tick(aV, 25);
  aV.intent.fire = true;
  f.tick(aV, 1);
  assert.equal(aV.weaponRunner.s3FlickVertical, true);

  system.list.length = 0;
  system.fireFlick(aV, aV.weapon);
  // Vertical Roller has 5 narrow drops
  assert.equal(system.list.length, 5, 'vertical flick spawns 5 projectile units');
  close(aV.ink, 100 - 8.5, 'spends exact verticalInk (8.5) once');
});

// --- Acceptance: 30, 60, 120 Hz render schedule parity ---
test('test behavior is identical under fixed simulation at 30, 60, and 120 Hz render cadence', async () => {
  const testTicks = [1, 10, 20, 25, 26, 30];
  const resultsByCadence = {};

  for (const hz of [30, 60, 120]) {
    resultsByCadence[hz] = [];
    for (const testTick of testTicks) {
      const f = await fixture({ adaptRuntime: adaptIssue479 });
      const a = f.make('roller');
      a.grounded = false; // natural free fall
      const clock = new FixedClock();
      let simTick = 0;
      let selectedVertical = null;

      const dt = 1 / hz;
      const renderFrames = Math.ceil(35 / 60 * hz);
      for (let i = 0; i < renderFrames; i++) {
        clock.advance(dt, () => {
          simTick++;
          a.intent.fire = (simTick === testTick);
          f.tick(a, 1);
          if (simTick === testTick) {
            selectedVertical = a.weaponRunner.s3FlickVertical;
          }
        });
        if (simTick >= testTick && selectedVertical !== null) break;
      }
      resultsByCadence[hz].push({ tick: testTick, vertical: selectedVertical });
    }
  }

  // Verify that results at 30Hz, 60Hz, and 120Hz are completely identical
  assert.deepEqual(resultsByCadence[30], resultsByCadence[60], '30Hz and 60Hz render schedules must yield identical simulation');
  assert.deepEqual(resultsByCadence[60], resultsByCadence[120], '60Hz and 120Hz render schedules must yield identical simulation');

  // Verify the exact progression: 1, 10, 20, 25 are horizontal (false), 26 and 30 are vertical (true)
  assert.deepEqual(resultsByCadence[60], [
    { tick: 1, vertical: false },
    { tick: 10, vertical: false },
    { tick: 20, vertical: false },
    { tick: 25, vertical: false },
    { tick: 26, vertical: true },
    { tick: 30, vertical: true },
  ]);
});
