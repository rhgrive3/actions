import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { FixedClock, STEP } from '../runtime/clock.mjs';

function baseSpread(runner) {
  const first = runner.a.weapon.spreadFirst ?? 0.45;
  const bloom = first + (1 - first) * runner.bloom;
  return runner.spread / bloom;
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: expected ${expected}, got ${actual}`);
}

async function beginNormalJump(f, actor) {
  f.tick(actor); // establish the runner's initial grounded firing state
  actor.intent.jump = true;
  f.tick(actor);
  actor.intent.jump = false;
}

test('Dualies holds jump spread through 25F and reaches the ground endpoint at 70F after landing', async () => {
  const f = await fixture(), a = f.make('dualies'), r = a.weaponRunner;
  const params = f.profile.weaponsFidelityCompletion.weapons.dualies.WeaponParam;
  const hold = params.Jump_DegBiasDecreaseStartFrame / f.profile.referenceHz;
  const end = params.Jump_DegBiasEndFrame / f.profile.referenceHz;
  assert.equal(params.Jump_DegBiasDecreaseStartFrame, 25);
  assert.equal(params.Jump_DegBiasEndFrame, 70);

  const jumps = [];
  f.on('actor:jump', event => { if (event.actor === a) jumps.push(event); });
  await beginNormalJump(f, a);
  assert.equal(jumps.length, 1);
  assert.equal(r.s3DualiesJumpSpreadAge, STEP);

  for (let frame = 2; frame <= 25; frame++) f.tick(a);
  close(r.s3DualiesJumpSpreadAge, hold, '25F age');
  close(baseSpread(r), a.weapon.spreadAir, '25F jump endpoint');

  a.grounded = true; // landing must not select spreadGround immediately
  f.tick(a);
  assert.ok(baseSpread(r) < a.weapon.spreadAir);
  assert.ok(baseSpread(r) > a.weapon.spreadGround);
  for (let frame = 27; frame <= 69; frame++) f.tick(a);
  assert.ok(baseSpread(r) > a.weapon.spreadGround, 'spread is still recovering before 70F');
  f.tick(a);
  close(r.s3DualiesJumpSpreadAge, end, '70F age');
  close(baseSpread(r), a.weapon.spreadGround, '70F ground endpoint');
});

test('30/60/120Hz rendering produces the same 60Hz Dualies recovery trace', async () => {
  async function traceAt(renderHz) {
    const f = await fixture(), a = f.make('dualies'), r = a.weaponRunner;
    await beginNormalJump(f, a);
    const trace = [baseSpread(r)];
    const clock = new FixedClock();
    for (let render = 0; trace.length < 70 && render < renderHz * 2; render++) {
      clock.advance(1 / renderHz, () => {
        if (trace.length < 70) {
          f.tick(a);
          trace.push(baseSpread(r));
        }
      });
    }
    assert.equal(trace.length, 70, `${renderHz}Hz render schedule delivered 70 fixed ticks`);
    close(trace[24], a.weapon.spreadAir, `${renderHz}Hz frame 25`);
    close(trace[69], a.weapon.spreadGround, `${renderHz}Hz frame 70`);
    return trace;
  }

  const at30 = await traceAt(30), at60 = await traceAt(60), at120 = await traceAt(120);
  assert.deepEqual(at30, at60);
  assert.deepEqual(at60, at120);
});

test('the actor-owned cone feeds shots in offline Range without changing Dualies cadence', async () => {
  const f = await fixture(), a = f.make('dualies'), r = a.weaponRunner;
  f.G.mode = 'range'; f.G.match.mode = 'range'; f.G.netm = null;
  await beginNormalJump(f, a);
  a.grounded = true;
  a.intent.fire = true;

  const shotFrames = [];
  for (let frame = 1; frame <= 16; frame++) {
    const before = f.shots.length;
    f.tick(a);
    if (f.shots.length > before) {
      shotFrames.push(frame);
      assert.equal(f.shots.at(-1).kind, 'dualies');
      assert.equal(f.shots.at(-1).spread, r.spread, 'projectile and runner/HUD share one spread value');
    }
  }
  assert.equal(shotFrames.length, 3);
  assert.deepEqual(shotFrames.slice(1).map((frame, i) => frame - shotFrames[i]), [5, 5]);
  assert.ok(Number.isFinite(r.s3DualiesJumpSpreadAge));
});

test('swim jump, dodge turret, runner reset, and another actor keep independent state', async () => {
  const f = await fixture(), a = f.make('dualies'), r = a.weaponRunner;
  a.groundTeam = 1;
  a.intent.squid = true; a.intent.jump = true;
  f.tick(a);
  a.intent.jump = false;
  assert.equal(a.form, 'squid');
  assert.equal(r.s3DualiesJumpSpreadAge, null, 'squid swim jump does not enter human Dualies recovery');

  a.intent.squid = false; f.tick(a);
  const other = f.make('dualies');
  f.tick(other);
  other.intent.jump = true; f.tick(other); other.intent.jump = false;
  assert.ok(Number.isFinite(other.weaponRunner.s3DualiesJumpSpreadAge));
  assert.equal(r.s3DualiesJumpSpreadAge, null, 'one actor cannot arm another runner');

  a.form = 'kid'; a.intent.fire = true; a.intent.move.set(0, 0, 1);
  r.s3DualiesJumpSpreadAge = 0.5;
  assert.equal(r.tryDodge(a.intent.move), true);
  while (r.dodge) r.update(STEP, { fire: true });
  assert.equal(r.s3Turret, true);
  assert.equal(r.s3DualiesJumpSpreadAge, null);
  assert.equal(r._spreadDeg(a.weapon), a.weapon.spreadLock, 'post-roll turret accuracy owns its cone');

  r.s3DualiesJumpSpreadAge = 0.5;
  r.reset();
  assert.equal(r.s3DualiesJumpSpreadAge, null);
  assert.equal(r.s3Turret, false);
  assert.ok(Number.isFinite(other.weaponRunner.s3DualiesJumpSpreadAge));
});

test('incoming projectile wire velocity stays verbatim for local and remote actor records', async () => {
  const f = await fixture();
  const projectiles = Object.create(f.Projectiles.prototype);
  projectiles.pool = []; projectiles.list = [];
  const wireVelocity = [7.125, -3.5, 2.25];

  for (const remote of [false, true]) {
    const owner = f.make('dualies'); owner.remote = remote;
    projectiles.ghostProjectile(owner, ['p', 1, 2, 'shot', 3, 1, 2, 3, ...wireVelocity, 0, 1, 0, 0.2, 0.1, 0, 0.2, 0, 0, 0.1, 0.8, 1.3, 0.03, 28, 0.3, 2]);
    assert.deepEqual(Array.from(projectiles.list.at(-1).vel.toArray()), wireVelocity);
  }
});
