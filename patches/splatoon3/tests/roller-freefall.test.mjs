import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url),'utf8'));
import { fixture } from './source-fixture.mjs';
import { adaptIssue479 } from '../issue-479-adapter.mjs';
import { FixedClock } from '../runtime/clock.mjs';

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
  close(a.weaponRunner.s3RollerAttack?.windup, profile.weapons.roller.verticalWindup, 'unpatched baseline sets vertical current vertical windup');
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
    close(a.weaponRunner.s3RollerAttack?.windup, profile.weapons.roller.verticalWindup, '26F attack has 26F vertical windup');
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
  close(a.weaponRunner.s3RollerAttack?.windup, profile.weapons.roller.verticalWindup, 'vertical jump flick has current vertical windup');
});

// --- Acceptance: negative scenario (jump input rejected by native admission remains horizontal) ---
test('jump input rejected by native admission remains horizontal in natural fall; accepted jump is immediate vertical', async () => {
  // A. Negative scenario: walked off ledge, coyote expired, jump input pressed -> rejected by native admission, remains horizontal
  {
    const f = await fixture({ adaptRuntime: adaptIssue479 });
    const a = f.make('roller');
    a.grounded = false;
    a.coyote = 0; // coyote expired
    f.tick(a, 5); // 5 ticks in natural free fall

    // Press jump (B) and fire (ZR) while airborne with coyote expired
    a.intent.jump = true;
    a.intent.fire = true;
    f.tick(a, 1); // 6th tick (well inside 25F grace)

    // Native jump admission failed: no jump event was emitted
    const jumpEvents = a.character.events.filter(e => e[0] === 'jump');
    assert.equal(jumpEvents.length, 0, 'native jump admission must fail and emit no jump trigger');
    assert.equal(a.s3JumpAirborne, false, 'rejected jump input must not count as accepted jump');

    // Roller must remain in horizontal flick inside 25F grace
    assert.equal(a.weaponRunner.s3FlickVertical, false, 'merely pressing B without native admission must remain horizontal');
    assert.equal(a.weaponRunner.s3RollerAttack?.vertical, false);
    close(a.weaponRunner.s3RollerAttack?.windup, 21 / 60, 'horizontal flick has 21F windup');
  }

  // B. Accepted jump scenario: normal jump from ground admitted by native update selects vertical immediately on 1F
  {
    const f = await fixture({ adaptRuntime: adaptIssue479 });
    const a = f.make('roller');
    a.grounded = true;
    a.intent.jump = true;
    a.intent.fire = true;
    f.tick(a, 1);

    const jumpEvents = a.character.events.filter(e => e[0] === 'jump');
    assert.ok(jumpEvents.length > 0, 'native jump admission must succeed from ground');
    assert.equal(a.s3JumpAirborne, true, 'accepted jump sets s3JumpAirborne');
    assert.equal(a.weaponRunner.s3FlickVertical, true, 'accepted jump selects vertical immediately');
    assert.equal(a.weaponRunner.s3RollerAttack?.vertical, true);
    close(a.weaponRunner.s3RollerAttack?.windup, profile.weapons.roller.verticalWindup, 'vertical flick has current vertical windup');
  }
});

// --- Acceptance: genuine movement launch (squid roll / surge) selects vertical ---
test('actual installMovement accepted launch (squid roll / surge) selects vertical, not mislabeled natural fall', async () => {
  // 1. Squid roll launch into air
  {
    const f = await fixture({ adaptRuntime: adaptIssue479 });
    const a = f.make('roller');
    a.intent.squid = true;
    a.form = 'squid';
    a.submerged = true;
    a.grounded = true;
    a.vel.set(10.0, 0, 0); // speed 10.0 >= roll minimumSpeed (9.216)
    a.intent.move.set(-1, 0, 0); // reversal in -X (meets roll angle)
    a.intent.jump = true;

    // Tick through Actor update which runs installMovement beforeActions launch
    f.tick(a, 1);

    assert.ok(a.s3?.roll || a.s3?.actions?.roll, 'squid roll must be launched by installMovement');
    assert.equal(a.s3JumpAirborne, true, 'genuine squid roll launch must be recognized as jump airborne');
    assert.equal(a.s3NaturalAirborne, false, 'squid roll launch must not be labeled natural fall');

    // Fire roller in the air during roll launch
    a.form = 'kid';
    a.intent.squid = false;
    a.kidT = 1.0;
    a.intent.jump = false;
    a.intent.fire = true;
    f.tick(a, 1);

    assert.equal(a.weaponRunner.s3FlickVertical, true, 'Roller fired after squid roll launch must be vertical');
    assert.equal(a.weaponRunner.s3RollerAttack?.vertical, true);
  }

  // 2. Squid surge launch over ledge into air
  {
    const f = await fixture({ adaptRuntime: adaptIssue479 });
    const a = f.make('roller');
    a.form = 'squid';
    a.intent.squid = true;
    a.climbing = true;
    a._updateClimb = () => {}; // keep attached state in mock raycast fixture
    a.wallN.set(0, 0, 1);
    // Charge surge (0.75s / 45 ticks for full charge)
    a.intent.jump = true;
    for (let i = 0; i < 45; i++) f.tick(a, 1);
    // Release surge to trigger burst
    a.intent.jump = false;
    f.tick(a, 1);

    assert.ok(a.s3?.surge || a.s3?.actions?.surge, 'squid surge burst must be active');
    // Pop over ledge into air
    a._ledgePop(new f.THREE.Vector3(0, 0, -1));

    assert.equal(a.s3JumpAirborne, true, 'squid surge ledge launch must be recognized as jump airborne');
    assert.equal(a.s3NaturalAirborne, false, 'squid surge must not be labeled natural fall');

    // Fire roller in the air
    a.form = 'kid';
    a.intent.squid = false;
    a.kidT = 1.0;
    a.intent.fire = true;
    f.tick(a, 1);

    assert.equal(a.weaponRunner.s3FlickVertical, true, 'Roller fired after squid surge launch must be vertical');
    assert.equal(a.weaponRunner.s3RollerAttack?.vertical, true);
  }
});

// --- Acceptance: non-roller actors guard and velocity preservation ---
test('non-roller actors (shooter, etc.) are guarded against freefall overhead and retain normal velocities', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue479 });
  const s = f.make('shooter');
  s.grounded = true;
  s.vel.set(1.5, 0, 2.0);
  f.tick(s, 2);

  assert.equal(s.s3JumpAirborne, undefined, 'shooter must not track roller freefall jump state');
  assert.equal(s.s3NaturalAirborne, undefined, 'shooter must not track roller freefall natural state');
  assert.ok(Number.isFinite(s.vel.x) && Number.isFinite(s.vel.z), 'normal movement velocities are fully preserved');
});

// --- Acceptance: mode latching across transitions ---
test('grounded ZR followed by later jump keeps its already-selected horizontal mode', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue479 });
  const a = f.make('roller');

  // Start horizontal attack while grounded
  a.intent.fire = true;
  f.tick(a, 1);
  assert.equal(a.weaponRunner.s3FlickVertical, false, 'grounded start is horizontal');

  // #1041 permits jump conversion through +3F; this latching control is later.
  f.tick(a, 3);
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
  f.tick(a, 16);
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

  // #1056 owns the first 5F landing conversion; later landing keeps this mode.
  f.tick(a, 6);
  a.grounded = true;
  a.intent.jump = false;
  a.intent.fire = false;
  f.tick(a, 1);
  assert.equal(a.weaponRunner.s3FlickVertical, true, 'mode remains vertical after landing');
  assert.equal(a.weaponRunner.s3RollerAttack?.vertical, true);

  // Preserve the current vertical windup; this root changes only mode selection.
  f.tick(a, Math.round(profile.weapons.roller.verticalWindup*60)-8);
  assert.equal(f.shots.length, 0, 'vertical shot must wait full current vertical windup despite landing');

  f.tick(a, 1);
  assert.equal(f.shots.length, 1, 'vertical shot releases at the current vertical windup');
  close(f.shots[0].windup, profile.weapons.roller.verticalWindup, 'released shot windup is vertical');
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

// --- Acceptance: focused counterexample for smaller dt invariance ---
test('focused counterexample: smaller dt (1/120s) uses elapsed time boundary without premature vertical transition at 30 sub-frames', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue479 });
  const a = f.make('roller');
  a.grounded = false; // natural free fall
  const dt = 1 / 120; // smaller dt

  // Advance 30 sub-frames at 120Hz (30 * 1/120 = 0.25 s, which exceeds 25 ticks count but is within 25/60s = 0.4167s)
  for (let i = 0; i < 30; i++) {
    f.G.time += dt;
    a.update(dt);
  }

  // Fire roller at 0.25 s elapsed natural fall
  a.intent.fire = true;
  f.G.time += dt;
  a.update(dt);

  // Must still select horizontal mode because elapsed air time (0.258s) is <= 25/60 s
  assert.equal(a.weaponRunner.s3FlickVertical, false, '0.25s natural fall at 120Hz must remain horizontal despite >25 sub-frames');
  assert.equal(a.weaponRunner.s3RollerAttack?.vertical, false);

  // Contrast with natural fall elapsed > 25/60 s (e.g. 55 sub-frames at 120Hz = ~0.458s)
  const aPast = f.make('roller');
  aPast.grounded = false;
  for (let i = 0; i < 55; i++) {
    f.G.time += dt;
    aPast.update(dt);
  }
  aPast.intent.fire = true;
  f.G.time += dt;
  aPast.update(dt);
  assert.equal(aPast.weaponRunner.s3FlickVertical, true, 'natural fall exceeding 25/60s transitions to vertical');
});

// Positive integration uses the production adapter order for native and patch modules.
test('production build chain preserves natural-fall selection and normal battle/Practice isolation', async () => {
  const { adaptSource } = await import('../adapter.mjs');
  const { adaptTouchLayout } = await import('../../touch-layout/adapter.mjs');
  const { adaptReliability } = await import('../../reliability/adapter.mjs');
  const { adaptQualitySource } = await import('../../local-quality/adapter.mjs');
  const production = (rel, code) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
  for (const practice of [false, true]) {
    const f = await fixture({ adaptNative: production, adaptRuntime: production });
    f.G.practice = practice ? { active: true } : null;
    const a = f.make('roller'); a.grounded = false; f.tick(a, 24);
    a.intent.fire = true; f.tick(a);
    assert.equal(a.weaponRunner.s3FlickVertical, false);
    close(a.weaponRunner.s3RollerAttack.windup, 21 / 60);
    const shot = a.weaponRunner.s3RollerAttack; f.tick(a, 24);
    assert.equal(shot.vertical, false, 'attack mode is latched past grace');
    const shooter = f.make('shooter'); shooter.intent.move.set(1,0,0); f.tick(shooter, 2);
    assert.equal(shooter.s3NaturalAirborne, undefined);
  }
});

test('partial Surge armor and Roller accepted-launch mode compose in the production battle and Practice paths', async () => {
  const { adaptSource } = await import('../adapter.mjs');
  const { adaptTouchLayout } = await import('../../touch-layout/adapter.mjs');
  const { adaptReliability } = await import('../../reliability/adapter.mjs');
  const { adaptQualitySource } = await import('../../local-quality/adapter.mjs');
  const production = (rel, code) => adaptQualitySource(rel, adaptReliability(rel, adaptTouchLayout(rel, adaptSource(rel, code))));
  for (const practice of [false, true]) {
    const f = await fixture({ adaptNative: production, adaptRuntime: production });
    f.G.practice = practice ? { active: true } : null;
    const a = f.make('roller'); a.form = 'squid'; a.intent.squid = true; a.intent.jump = true;
    a.climbing = true; a.grounded = false; a._updateClimb = () => {};
    f.tick(a, 1); a.intent.jump = false; f.tick(a, 1);
    assert.ok(!a.s3.surge || a.s3.surge.time <= 1e-10, 'short movement boost ended');
    assert.equal(a.s3.actions.armor, null, '#568 no shield while still on the wall');
    a._ledgePop(new f.THREE.Vector3(0, 0, -1));
    assert.ok(a.s3.actions.armor?.armorTime > 0, 'current independent shield remains alive');
    const hp = a.hp; a.damage(30, null, 'shooter'); assert.equal(a.hp, hp);
    assert.equal(a.s3.actions.armor.armorHP, Math.max(0,f.profile.movement.surge.armorHP-30));
    a.climbing = false; a.form = 'kid'; a.intent.squid = false; a.intent.fire = true; f.tick(a, 1);
    assert.equal(a.weaponRunner.s3RollerAttack.vertical, true, 'accepted partial Surge is a launch, never natural-fall grace');
    assert.equal(a.s3.surge, null, 'kid transition retires shield');
    a.reset(); assert.equal(a.s3.surge, null);
  }
});

test('catalog roller-vertical-land diagnostic launch path exercises native accepted launch and selects vertical mode', async () => {
  const f = await fixture({ adaptRuntime: adaptIssue479 });
  const a = f.make('roller');
  const ch = a.character;

  // Exercise catalog step and accepted jump launch
  f.tick(a, 10);
  a.grounded = false;
  a.pos.y = 0.4;
  a.vel.y = 7;
  ch.trigger('jump');
  f.emit('actor:jump', { actor: a, surface: a.groundTeam, swim: false });

  a.intent.fire = true;
  f.tick(a, 1);

  assert.equal(a.s3JumpAirborne, true, 'accepted jump launch sets s3JumpAirborne');
  assert.equal(a.weaponRunner.s3FlickVertical, true, 'catalog jump launch selects vertical flick mode immediately');
  assert.equal(a.weaponRunner.s3RollerAttack?.vertical, true);
  close(a.weaponRunner.s3RollerAttack?.windup, profile.weapons.roller.verticalWindup, 'vertical flick has current vertical windup');
});
