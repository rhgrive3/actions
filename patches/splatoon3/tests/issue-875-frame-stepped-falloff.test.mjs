import test from 'node:test';
import assert from 'node:assert/strict';
import { fidelityDamage } from '../runtime/weapons-fidelity.mjs';

const close = (actual, expected, msg = '', eps = 1e-6) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} != ${expected} (diff: ${Math.abs(actual - expected)}) ${msg}`);

test('#875 projectile damage falloff uses integer frame steps instead of continuous subframe values', () => {
  const weapon = {
    kind: 'shooter',
    damage: 35,
    damageMin: 17.5,
    damageReduceStart: 7 / 60,
    damageReduceEnd: 15 / 60,
  };

  const getDamageAtAge = (ageSeconds) => {
    return fidelityDamage({
      s3Weapon: weapon,
      damage: weapon.damage,
      age: ageSeconds,
    }, null, 1);
  };

  // Exact frames 0..7: full damage (35)
  close(getDamageAtAge(0 / 60), 35, '0F');
  close(getDamageAtAge(7 / 60), 35, '7F');

  // Subframe age near 7F rounds to 7F (no continuous intermediate reduction)
  close(getDamageAtAge(7.2 / 60), 35, '7.2F rounds to 7F');
  close(getDamageAtAge(7.49 / 60), 35, '7.49F rounds to 7F');

  // Subframe age 7.51F rounds to 8F
  const expected8F = 35 + (17.5 - 35) * (1 / 8); // 32.8125
  close(getDamageAtAge(7.51 / 60), expected8F, '7.51F rounds to 8F');
  close(getDamageAtAge(8.0 / 60), expected8F, '8.0F');

  // Frame 11 (midpoint of 7..15, step 4/8 = 0.5)
  const expected11F = 35 + (17.5 - 35) * 0.5; // 26.25
  close(getDamageAtAge(11.0 / 60), expected11F, '11F');
  close(getDamageAtAge(11.3 / 60), expected11F, '11.3F rounds to 11F');

  // Frame 15 and beyond: minimum damage (17.5)
  close(getDamageAtAge(15.0 / 60), 17.5, '15F');
  close(getDamageAtAge(20.0 / 60), 17.5, '20F');
});

test('#875 Splat Dualies frame-stepped damage matches verified integer frame milestones', () => {
  const weapon = {
    kind: 'dualies',
    damage: 30,
    damageMin: 15,
    damageReduceStart: 7 / 60,
    damageReduceEnd: 15 / 60,
  };

  const atFrame = f => fidelityDamage({ s3Weapon: weapon, damage: 30, age: f / 60 }, null, 1);

  close(atFrame(0), 30, '0F');
  close(atFrame(7), 30, '7F');
  close(atFrame(8), 28.125, '8F');
  close(atFrame(12), 20.625, '12F');
  close(atFrame(15), 15, '15F');
  close(atFrame(20), 15, '20F');
});


// Source oracle: 1130 WeaponSpinnerStandard DamageParam ReduceStartFrame=11,
// ReduceEndFrame=19, ValueMax=300 and ValueMin=150 (tenths of HP).
// The tests above exercise the helper; these exercise a real emitted native
// Heavy Splatling round and its accepted swept-collision subframe fraction.
import { fixture as realShotFixture } from '../../../scripts/weapons-fixture.mjs';
import { FixedClock } from '../runtime/clock.mjs';
async function heavyShot() {
  const f = await realShotFixture({ fidelity: true, floor: false });
  const actor = f.make('splatling');
  actor.vel.set(0, 0, 0);
  actor.aimDir.set(0, 0, 1);
  f.projectiles.fireSplatling(actor, actor.weapon, 0);
  const round = f.projectiles.list.at(-1);
  assert.ok(round, 'actual Projectiles emits a Splatling round');
  assert.equal(round.s3Weapon.kind, 'splatling');
  close(round.s3Weapon.damage, 30);
  close(round.s3Weapon.damageMin, 15);
  close(round.s3Weapon.damageReduceStart * 60, 11);
  close(round.s3Weapon.damageReduceEnd * 60, 19);
  return { f, round };
}

test('#875 real emitted Heavy Splatling shot loses exactly 1.875 HP only at 11..19F boundaries', async () => {
  const { f, round } = await heavyShot();
  const point = round.start.clone();
  for (let frame = 0; frame <= 22; frame++) {
    round.fidelityPrevAge = Math.max(0, frame - 1) / 60;
    round.age = frame / 60;
    const sourceExpected = 30 - 1.875 * Math.max(0, Math.min(8, frame - 11));
    for (const impactT of [0, 0.1, 0.5, 0.9, 1]) {
      close(f.fidelityDamage(round, point, impactT), sourceExpected,
        'age=' + frame + 'F, swept-impact fraction=' + impactT);
    }
    if (frame >= 12 && frame <= 19) {
      round.age = (frame - 1) / 60;
      close(f.fidelityDamage(round, point, 0.9) -
        f.fidelityDamage({ ...round, age: frame / 60 }, point, 0.1), 1.875,
        'discrete 1.875HP boundary at frame ' + frame);
    }
  }
});

test('#875 actual Splatling shot damage-age traces agree at 30/60/120Hz display updates', async () => {
  const traces = [];
  for (const hz of [30, 60, 120]) {
    const { f, round } = await heavyShot();
    const clock = new FixedClock(), point = round.start.clone();
    const trace = [];
    let tick = 0;
    for (let frame = 0; frame < hz * 0.4; frame++) clock.advance(1 / hz, () => {
      tick++;
      round.fidelityPrevAge = (tick - 1) / 60;
      round.age = tick / 60;
      trace.push([tick, f.fidelityDamage(round, point, 0.1),
        f.fidelityDamage(round, point, 0.9)]);
    });
    assert.equal(tick, 24);
    traces.push(trace);
  }
  assert.deepEqual(traces[0], traces[1]);
  assert.deepEqual(traces[1], traces[2]);
});


// The source-guided InkFlightRuntime is the REAL gameplay collision path for
// shooter-family heads. It bypasses the generic fidelityDamage helper. Before
// #875, it used previousAge + impactT/60 and changed damage inside one tick.
// Run actual owner bullet -> native ink-flight swept capsule -> applyHit.
test('#875 source-guided runtime damage is independent of 0.1/0.9 swept impact timing', async () => {
  const results = [];
  for (const startFrame of [10, 11, 12, 18, 19]) {
    const row = [];
    for (const contactT of [0.1, 0.9]) {
      const f = await realShotFixture({ fidelity: true, floor: false }), owner = f.make('splatling');
      const enemy = f.make('shooter', { team: 1, hp: 1000 });
      f.G.actors = [enemy];
      const hit = [];
      f.projectiles.applyHit = (attacker, victim, amount) => {
        assert.equal(attacker, owner);
        assert.equal(victim, enemy);
        hit.push(amount);
      };
      f.projectiles.fireSplatling(owner, owner.weapon, 0);
      const p = f.projectiles.list.at(-1);
      assert.equal(p.inkKey, 'splatling', 'emitted source-guided bullet, not synthetic helper');
      assert.ok(p.inkProfile);
      assert.equal(p.inkProfile.damage.startFrame, 11);
      p.inkFrame = startFrame;
      p.age = startFrame / 60;
      p.inkPhase = 1;
      p.pos.set(0, 1.05, 0);
      p.prev.copy(p.pos);
      p.vel.set(0, 0, 60);
      p.inkCarry = 0;
      const sweepStep = .64;
      const actorRadius = f.profile.player.s3HumanoidHurtRadius;
      enemy.pos.set(0, 0, actorRadius + p.inkPlayerRadius + sweepStep * contactT);
      const finished = f.projectiles.inkFlight.stepHead(p, 1 / 60);
      assert.equal(finished, true, 'native collision must actually accept swept contact');
      assert.equal(hit.length, 1, 'one authoritative damage callback');
      const endFrame = startFrame + 1;
      const expected = 30 - Math.max(0, Math.min(8, endFrame - 11)) * 1.875;
      close(hit[0], expected, 'native source-flight damage at fixed frame ' + endFrame);
      row.push(hit[0]);
    }
    assert.deepEqual(row.slice(0, 1), row.slice(1),
      'impact fraction cannot change HP within one committed 60Hz step');
    results.push(row[0]);
  }
  assert.deepEqual(results, [30, 28.125, 26.25, 15, 15]);
});
