import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const STEP = 1 / 60;

// Helper: establish stable swim in own ink
function startSwimming(f, a, ticks = 10) {
  a.groundTeam = 1;
  a.grounded = true;
  a.intent.squid = true;
  a.intent.move.set(0, 0, 1);
  f.tick(a, ticks);
  assert.equal(a.form, 'squid', 'precondition: actor in squid form');
  assert.equal(a.submerged, true, 'precondition: actor submerged in own ink');
}

test('#591 stable own-ink swim: 1-tick R press is not discarded and emerges to humanoid sub-hold', async () => {
  const f = await fixture();
  const a = f.make('shooter');
  startSwimming(f, a);

  // Single-tick R press
  a.intent.sub = true;
  f.tick(a, 1);

  assert.equal(a.form, 'kid', '1-tick R press from swim emerges to humanoid form');
  assert.equal(a.weaponRunner.aimingSub, true, 'aimingSub is entered on the first fixed tick');
});

test('#591 holding R from swim transitions into humanoid sub-hold; aimingSub reachable for 1/10/60 ticks', async () => {
  const f = await fixture();
  const a = f.make('shooter');
  startSwimming(f, a);

  a.intent.sub = true;

  // Check at 1 tick
  f.tick(a, 1);
  assert.equal(a.form, 'kid', 'tick 1: kid form');
  assert.equal(a.weaponRunner.aimingSub, true, 'tick 1: aimingSub is true');

  // Check at 10 ticks
  f.tick(a, 9);
  assert.equal(a.form, 'kid', 'tick 10: kid form retained');
  assert.equal(a.weaponRunner.aimingSub, true, 'tick 10: aimingSub still true');

  // Check at 60 ticks
  f.tick(a, 50);
  assert.equal(a.form, 'kid', 'tick 60: kid form retained');
  assert.equal(a.weaponRunner.aimingSub, true, 'tick 60: aimingSub still true');
});

test('#591 sub strafe: R + 180° direction change + return to swim cancels throw with 0 ink spent and 0 bombs', async () => {
  const f = await fixture();
  const a = f.make('shooter');
  a.ink = f.PLAYER.inkMax;
  const initialInk = a.ink;

  const thrownBombs = [];
  f.G.projectiles.throwBomb = (actor) => { thrownBombs.push(actor); };

  startSwimming(f, a, 15);
  const swimSpeedZ = a.vel.z;
  assert.ok(swimSpeedZ > 1.0, 'precondition: forward swim momentum');

  // Initiate sub strafe: press R and reverse stick 180 degrees
  a.intent.sub = true;
  a.intent.move.set(0, 0, -1);
  f.tick(a, 6);

  assert.equal(a.form, 'kid', 'emerged into kid form for inertia cancel');
  assert.equal(a.weaponRunner.aimingSub, true, 'aimingSub active during reversal');

  // Return to swim (cancelling the sub throw)
  a.intent.sub = false;
  a.intent.squid = true;
  f.tick(a, 1);

  assert.equal(a.form, 'squid', 'returned to swim form');
  assert.equal(a.weaponRunner.aimingSub, false, 'aimingSub cancelled upon returning to swim');
  assert.equal(thrownBombs.length, 0, 'no bomb spawned during sub strafe');
  assert.equal(a.ink, initialInk, '0 ink consumed by cancelled sub strafe');

  // Continue swimming in new direction
  f.tick(a, 10);
  assert.ok(a.vel.z < -1.0, 'redirected velocity into reversed direction');
  assert.equal(thrownBombs.length, 0, 'still 0 bombs thrown after continuing swim');
});

test('#591 committed sub throw: releasing R after humanoid sub hold throws exactly 1 bomb if ink sufficient', async () => {
  const f = await fixture();
  const a = f.make('shooter');
  a.ink = f.PLAYER.inkMax;
  const initialInk = a.ink;
  const bombCost = f.SUB.bomb.inkCost;

  const thrownBombs = [];
  f.G.projectiles.throwBomb = (actor) => { thrownBombs.push(actor); };

  startSwimming(f, a);

  // Emerge with R
  a.intent.sub = true;
  f.tick(a, 10);
  assert.equal(a.form, 'kid');
  assert.equal(a.weaponRunner.aimingSub, true);

  // Commit throw: release squid intent and release R
  a.intent.squid = false;
  a.intent.sub = false;
  f.tick(a, 1);

  assert.equal(thrownBombs.length, 1, 'exactly 1 bomb thrown on release');
  assert.equal(a.ink, initialInk - bombCost, 'bomb ink cost deducted');
  assert.equal(a.weaponRunner.aimingSub, false, 'aimingSub ended after throw');
});

test('#591 insufficient ink: sub emergence occurs but releasing R does not throw a bomb', async () => {
  const f = await fixture();
  const a = f.make('shooter');
  a.ink = 10; // less than bombCost (usually ~70)

  const thrownBombs = [];
  f.G.projectiles.throwBomb = (actor) => { thrownBombs.push(actor); };

  startSwimming(f, a);

  a.intent.sub = true;
  f.tick(a, 5);
  assert.equal(a.form, 'kid', 'still emerges to kid form');
  assert.equal(a.weaponRunner.aimingSub, true, 'aimingSub active even with low ink');

  // Release R
  a.intent.squid = false;
  a.intent.sub = false;
  f.tick(a, 1);

  assert.equal(thrownBombs.length, 0, 'insufficient ink cannot throw bomb');
  assert.ok(a.ink < f.SUB.bomb.inkCost, 'ink was not consumed for bomb');
});

test('#591 ordinary sub throw from humanoid form is preserved', async () => {
  const f = await fixture();
  const a = f.make('shooter');
  a.ink = f.PLAYER.inkMax;
  a.intent.squid = false;

  const thrownBombs = [];
  f.G.projectiles.throwBomb = (actor) => { thrownBombs.push(actor); };

  a.intent.sub = true;
  f.tick(a, 5);
  assert.equal(a.form, 'kid');
  assert.equal(a.weaponRunner.aimingSub, true);

  a.intent.sub = false;
  f.tick(a, 1);
  assert.equal(thrownBombs.length, 1, 'ordinary humanoid sub throw succeeds');
});

test('#591 Squid Roll admission remains independent; sub strafing does not grant roll armor', async () => {
  const f = await fixture();
  const a = f.make('shooter');
  startSwimming(f, a);

  // Execute sub strafe: R held, no jump button pressed
  a.intent.sub = true;
  a.intent.jump = false;
  a.intent.move.set(0, 0, -1);
  f.tick(a, 5);

  assert.equal(a.s3?.roll, null, 'no roll state granted by sub strafe');
  assert.equal(a.s3?.actions?.roll, null, 'no action roll granted by sub strafe');

  // Applying damage while sub strafing takes full damage without roll armor absorption
  const beforeHp = a.hp;
  a.damage(20, null, 'shooter');
  assert.equal(a.hp, beforeHp - 20, 'no roll armor damage absorption during sub strafe');
});

test('#591 30/60/120 Hz tick simulation produces deterministic sub emergence and aimingSub', async () => {
  for (const hz of [30, 60, 120]) {
    const f = await fixture();
    const a = f.make('shooter');
    const dt = 1 / hz;

    a.groundTeam = 1;
    a.grounded = true;
    a.intent.squid = true;
    for (let i = 0; i < Math.round(hz * 0.2); i++) {
      f.G.time += dt;
      a.update(dt);
    }
    assert.equal(a.form, 'squid', `${hz}Hz: swimming`);

    // Press R
    a.intent.sub = true;
    f.G.time += dt;
    a.update(dt);

    assert.equal(a.form, 'kid', `${hz}Hz: emerged to kid on R press`);
    assert.equal(a.weaponRunner.aimingSub, true, `${hz}Hz: aimingSub entered`);

    // Release R while holding squid intent (sub strafe cancel)
    a.intent.sub = false;
    f.G.time += dt;
    a.update(dt);

    assert.equal(a.form, 'squid', `${hz}Hz: returned to squid on cancel`);
    assert.equal(a.weaponRunner.aimingSub, false, `${hz}Hz: aimingSub cleared on cancel`);
  }
});

test('#591 local and network replication: once-only broadcast on committed throw, 0 on sub strafe cancel', async () => {
  const f = await fixture();
  f.G.scene = new f.THREE.Scene();
  f.G.projectiles = new f.Projectiles(f.G.scene);
  const a = f.make('shooter');
  a.ink = f.PLAYER.inkMax;

  const recBombs = [];
  f.G.netm = {
    recBomb: (b) => { recBombs.push(b); },
  };

  startSwimming(f, a);

  // 1. Cancelled sub strafe produces 0 recBomb broadcasts
  a.intent.sub = true;
  f.tick(a, 5);
  a.intent.sub = false;
  a.intent.squid = true;
  f.tick(a, 2);

  assert.equal(recBombs.length, 0, 'cancelled sub strafe broadcasts 0 bombs over network');

  // 2. A committed throw waits for the existing ready-time gate.
  a.intent.sub = true;
  f.tick(a, 15);
  a.intent.squid = false;
  a.intent.sub = false;
  f.tick(a, 1);

  assert.equal(recBombs.length, 1, 'committed throw broadcasts exactly 1 bomb to peers');

  // 3. Remote proxy actor never calls recBomb even if trigger fires
  const remote = f.make('shooter');
  remote.remote = true;
  remote.ink = f.PLAYER.inkMax;
  remote.weaponRunner.aimingSub = true;
  remote.weaponRunner.update(STEP, { sub: false, subReleased: true });
  assert.equal(recBombs.length, 1, 'remote actor never calls recBomb');
});
