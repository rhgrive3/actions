import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

async function rig(hz, { remote = false } = {}) {
  const api = await fixture();
  const a = api.make('shooter');
  a.isLocal = !remote; a.remote = remote;
  a._surface = () => { a.grounded = true; a.groundTeam = 1; };
  const jumps = [], rolls = [];
  const offJump = api.on('actor:jump', event => jumps.push(event));
  const offRoll = api.on('actor:squidroll', event => rolls.push(event));
  const dt = 1 / hz;
  const step = input => {
    if (input.move) a.intent.move.fromArray(input.move);
    for (const key of ['jump', 'squid', 'fire']) if (key in input) a.intent[key] = input[key];
    api.G.time += dt; a.update(dt);
  };
  return { api, a, step, jumps, rolls, close() { offJump(); offRoll(); } };
}

async function fullCancel(hz, options = {}) {
  const r = await rig(hz, options), { a, api, step } = r;
  try {
    step({ squid: true, jump: false, fire: false, move: [0, 0, 1] });
    assert.equal(a.form, 'squid'); assert.equal(a.submerged, true);
    a.vel.set(0, 0, 11.52);
    const preFire = { x: a.vel.x, z: a.vel.z };
    step({ squid: true, fire: true, jump: false, move: [0, 0, 1] });
    assert.equal(a.form, 'kid', 'Fire wins the existing form arbitration');
    assert.ok(a.s3.actions.fullCancelCandidate, 'the fire-winning form transition retains its roll context');
    step({ squid: true, fire: false, jump: true, move: [0, 0, -1] });

    const roll = api.profile.movement.roll;
    const launchSpeed = Math.max(roll.minimumSpeed, Math.hypot(preFire.x, preFire.z));
    assert.equal(a.form, 'kid', 'the full-cancel remains humanoid');
    assert.equal(a.s3.actions.roll, null, 'the full-cancel grants no Squid Roll armor');
    assert.equal(a.vel.y, roll.jumpVelocity, 'the existing roll jump launch is admitted');
    assert.ok(Math.abs(a.vel.z + launchSpeed) < 1e-9, 'the existing roll launch reverses captured pre-pop-out momentum');
    assert.equal(a.s3.actions.chain, 1, 'the existing shared roll chain advances once');
    assert.equal(r.jumps.length, 1, 'the native jump event is emitted exactly once');
    assert.equal(r.rolls.length, 0, 'the full-cancel does not emit a Squid Roll action event');
    const result = { velocity: a.vel.toArray(), form: a.form, jumps: r.jumps.length, rolls: r.rolls.length };
    step({ squid: true, fire: false, jump: true, move: [0, 0, -1] });
    assert.equal(a.s3.actions.chain, 1, 'holding B does not admit a second roll chain');
    assert.equal(r.jumps.length, 1, 'holding B does not emit a second jump');
    assert.equal(r.rolls.length, 0, 'holding B does not create roll armor or an action event');
    return result;
  } finally { r.close(); }
}

test('Fire then fresh B admits one non-armored full-cancel from existing roll state at 30/60/120 Hz and for remote actors', async () => {
  const results = [];
  for (const hz of [30, 60, 120]) results.push(await fullCancel(hz));
  results.push(await fullCancel(60, { remote: true }));
  for (const result of results) {
    assert.equal(result.form, 'kid'); assert.equal(result.jumps, 1); assert.equal(result.rolls, 0);
    assert.equal(result.velocity[1], results[0].velocity[1]);
    assert.equal(result.velocity[2], results[0].velocity[2]);
  }
});

test('B then Fire remains a normal armored Squid Roll followed by its separate form-cancel', async () => {
  const r = await rig(60), { a, step } = r;
  try {
    step({ squid: true, jump: false, fire: false, move: [0, 0, 1] });
    a.vel.set(0, 0, 11.52);
    step({ squid: true, jump: true, fire: false, move: [0, 0, -1] });
    assert.ok(a.s3.actions.roll, 'B first admits the normal Squid Roll');
    step({ squid: true, jump: false, fire: true, move: [0, 0, -1] });
    assert.equal(a.form, 'kid');
    assert.equal(a.s3.actions.roll, null, 'Fire after launch keeps the separate normal attack-cancel path');
    assert.equal(a.s3.actions.fullCancelJumpVelocity ?? null, null, 'post-launch Fire does not schedule a full-cancel jump');
  } finally { r.close(); }
});

test('below-speed Fire-before-B falls through to the ordinary humanoid jump', async () => {
  const r = await rig(60), { a, api, step } = r;
  try {
    step({ squid: true, jump: false, fire: false, move: [0, 0, 1] });
    a.vel.set(0, 0, api.profile.movement.roll.minimumSpeed - 1);
    step({ squid: true, jump: false, fire: true, move: [0, 0, 1] });
    step({ squid: true, jump: true, fire: false, move: [0, 0, -1] });
    assert.equal(a.form, 'kid'); assert.equal(a.s3.actions.roll, null);
    assert.equal(a.vel.y, api.PLAYER.jumpVel, 'invalid roll input remains an ordinary jump');
    assert.equal(r.jumps.length, 1); assert.equal(r.rolls.length, 0);
  } finally { r.close(); }
});

test('shallow input and a turn below the sourced angle threshold do not full-cancel', async () => {
  for (const move of [[0, 0, -0.2], [Math.sqrt(0.75), 0, 0.5]]) {
    const r = await rig(60), { a, api, step } = r;
    try {
      step({ squid: true, jump: false, fire: false, move: [0, 0, 1] });
      a.vel.set(0, 0, 11.52);
      step({ squid: true, jump: false, fire: true, move: [0, 0, 1] });
      step({ squid: true, jump: true, fire: false, move });
      assert.equal(a.form, 'kid'); assert.equal(a.s3.actions.roll, null);
      assert.equal(a.vel.y, api.PLAYER.jumpVel, 'invalid input remains the ordinary humanoid jump');
      assert.equal(a.s3.actions.chain, 0, 'invalid input does not advance the shared roll chain');
      assert.equal(r.jumps.length, 1); assert.equal(r.rolls.length, 0);
    } finally { r.close(); }
  }
});

async function composedBufferedAttack(weapon, hz, fullCancel) {
  const api = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  api.setRandom(() => 0.5);
  const { G, PLAYER } = api, a = api.make(weapon), dt = 1 / hz;
  a.isLocal = true;
  const horizontalChecks = [], originalHorizontal = a._horizontal;
  a._horizontal = function (...args) {
    const guarded = this.s3?.actions?.fullCancelJumpVelocity != null;
    const before = [this.vel.x, this.vel.z], result = originalHorizontal.apply(this, args);
    if (guarded) horizontalChecks.push({ before, after: [this.vel.x, this.vel.z] });
    return result;
  };
  const fireEvents = [], jumps = [], rolls = [];
  const offFire = api.on('weapon:fire', event => {
    if (event.actor === a) fireEvents.push({ at: G.time, grounded: a.grounded,
      vertical: weapon === 'roller' ? a.weaponRunner.s3FlickVertical ?? null : null });
  });
  const offJump = api.on('actor:jump', event => { if (event.actor === a) jumps.push(event); });
  const offRoll = api.on('actor:squidroll', event => { if (event.actor === a) rolls.push(event); });
  const step = input => {
    a.intent.move.fromArray(input.move || [0, 0, 1]);
    for (const key of ['jump', 'squid', 'fire', 'special']) if (key in input) a.intent[key] = input[key];
    G.time += dt; a.update(dt);
  };
  try {
    step({ squid: true, jump: false, fire: false, move: [0, 0, 1] });
    a.vel.set(0, 0, 11.52);
    step({ squid: true, fire: true, jump: false, move: [0, 0, 1] });
    const fireAt = G.time;
    if (fullCancel) step({ squid: true, fire: false, jump: true, move: [0, 0, -1] });
    const afterB = { form: a.form, grounded: a.grounded, vy: a.vel.y, vz: a.vel.z,
      armor: a.s3?.actions?.roll?.armorTime ?? 0, chain: a.s3?.actions?.chain ?? 0 };
    let pendingStart = null, firstPostLaunch = null;
    for (let i = 0; i < 180 && fireEvents.length === 0; i++) {
      step({ squid: true, fire: false, jump: false, move: [0, 0, fullCancel ? -1 : 1] });
      if (fullCancel && i === 0) firstPostLaunch = [a.vel.x, a.vel.y, a.vel.z];
      const runner = a.weaponRunner;
      if (pendingStart === null && (runner.flick >= 0 || runner.slosh >= 0)) {
        pendingStart = { age: G.time - fireAt, grounded: a.grounded,
          vertical: weapon === 'roller' ? runner.s3FlickVertical ?? null : null };
      }
    }
    const owned = G.projectiles.list.filter(projectile => projectile.owner === a);
    const scheduledOrigin = owned[0]?.start?.clone?.().sub(a.pos).toArray?.() ?? null;
    const projectileStats = owned.map(p => [p.damage, p.dmgFar, p.radius, p.life, p.grav, p.drag, p.size, p.s3Vertical]);
    return { api, a, fireAt, afterB, pendingStart, firstPostLaunch, horizontalChecks, fireEvents, jumps, rolls, owned, scheduledOrigin,
      projectileStats, context: a.s3?.actions?.fullCancelGroundAttack ?? null, fireBuffer: PLAYER.fireBuffer };
  } finally { offFire(); offJump(); offRoll(); }
}

async function pendingFullCancelCandidate() {
  const api = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const { G } = api, a = api.make('roller'), dt = 1 / 60;
  a.isLocal = true;
  const step = input => {
    a.intent.move.fromArray(input.move || [0, 0, 1]);
    for (const key of ['jump', 'squid', 'fire', 'special']) if (key in input) a.intent[key] = input[key];
    G.time += dt; a.update(dt);
  };
  step({ squid: true, fire: false, jump: false, move: [0, 0, 1] });
  a.vel.set(0, 0, 11.52);
  step({ squid: true, fire: true, jump: false, move: [0, 0, 1] });
  assert.ok(a.s3.actions.fullCancelCandidate);
  return { api, a, step };
}

async function pendingFullCancelContext() {
  const { api, a, step } = await pendingFullCancelCandidate();
  step({ squid: true, fire: false, jump: true, move: [0, 0, -1] });
  assert.ok(a.s3.actions.fullCancelGroundAttack);
  return { api, a, step };
}

test('full-cancel keeps the first buffered Roller flick grounded through the production runner and projectile path', async () => {
  for (const hz of [30, 60, 120]) {
    const control = await composedBufferedAttack('roller', hz, false);
    const cancel = await composedBufferedAttack('roller', hz, true);
    assert.equal(control.fireEvents.length, 1);
    assert.equal(control.fireEvents[0].vertical, false, 'the normal grounded Roller attack is horizontal');
    assert.ok(control.owned.length > 0);
    assert.equal(cancel.afterB.form, 'kid');
    assert.equal(cancel.afterB.grounded, false, 'the attack starts while the full-cancel actor is airborne');
    assert.equal(cancel.afterB.armor, 0);
    assert.equal(cancel.afterB.chain, 1);
    assert.ok(cancel.horizontalChecks.length > 0, 'the full-cancel jump guard is present while horizontal movement runs');
    assert.deepEqual(cancel.horizontalChecks[0].before, cancel.horizontalChecks[0].after,
      'the horizontal wrapper preserves reversed launch momentum in the launch frame');
    assert.ok(cancel.horizontalChecks[0].after[1] < 0);
    assert.ok(cancel.firstPostLaunch[2] < 0, 'reversed momentum remains after the launch frame');
    assert.equal(cancel.a.s3.actions.fullCancelJumpVelocity, null, 'the one-frame launch marker is consumed after horizontal handling');
    assert.equal(cancel.jumps.length, 1);
    assert.equal(cancel.rolls.length, 0);
    assert.equal(cancel.pendingStart.vertical, false, 'the buffered attack retains its grounded mode');
    assert.ok(cancel.pendingStart.age <= cancel.fireBuffer, 'the existing native fire buffer schedules the attack');
    assert.equal(cancel.fireEvents.length, 1, 'the actual WeaponRunner dispatches one attack');
    assert.equal(cancel.fireEvents[0].grounded, false);
    assert.equal(cancel.fireEvents[0].vertical, false);
    assert.ok(cancel.owned.length > 0);
    assert.equal(cancel.scheduledOrigin[1], control.scheduledOrigin[1],
      'the first projectile uses the grounded attack height in the actual scheduled origin');
    assert.equal(cancel.owned[0].s3Vertical, false);
    assert.equal(JSON.stringify(cancel.projectileStats), JSON.stringify(control.projectileStats),
      'the full-cancel uses the existing grounded Roller damage and projectile profile');
    assert.ok(Math.abs((control.fireEvents[0].at - control.fireAt) -
      (cancel.fireEvents[0].at - cancel.fireAt)) < 1e-9, 'grounded attack timing stays on the existing buffered clock');
    assert.equal(cancel.context, null, 'the one-shot grounded context is consumed by the first flick');
  }
});

test('full-cancel buffering reaches Slosher once without inventing a ground/air variant', async () => {
  for (const hz of [30, 60, 120]) {
    const control = await composedBufferedAttack('slosher', hz, false);
    const result = await composedBufferedAttack('slosher', hz, true);
    assert.equal(result.afterB.grounded, false);
    assert.ok(result.pendingStart.age <= result.fireBuffer);
    assert.equal(result.fireEvents.length, 1);
    assert.equal(control.fireEvents.length, 1);
    assert.ok(result.owned.length > 0);
    assert.equal(result.fireEvents[0].vertical, null);
    assert.equal(result.context, null);
    assert.equal(result.fireEvents[0].at - result.fireAt, control.fireEvents[0].at - control.fireAt,
      'the Slosher keeps its existing delayed firing clock');
    assert.equal(result.scheduledOrigin[1], control.scheduledOrigin[1]);
    assert.equal(JSON.stringify(result.projectileStats), JSON.stringify(control.projectileStats));
  }
});

test('ordinary airborne Roller attacks still select the airborne variant', async () => {
  const ground = await composedBufferedAttack('roller', 60, false);
  const api = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  api.setRandom(() => 0.5);
  const a = api.make('roller'), dt = 1 / 60;
  a.isLocal = true; a.kidT = api.PLAYER.emergeDelay;
  a._surface = () => { a.grounded = false; a.groundTeam = 0; a.submerged = false; };
  const fireEvents = [], off = api.on('weapon:fire', event => { if (event.actor === a) fireEvents.push(api.G.time); });
  a.intent.fire = true;
  api.G.time += dt; a.update(dt);
  assert.equal(a.weaponRunner.s3FlickVertical, true);
  a.intent.fire = false;
  for (let i = 0; i < 180 && fireEvents.length === 0; i++) { api.G.time += dt; a.update(dt); }
  const owned = api.G.projectiles.list.filter(projectile => projectile.owner === a);
  const scheduledOrigin = owned[0]?.start?.clone?.().sub(a.pos).toArray?.() ?? null;
  off();
  assert.equal(fireEvents.length, 1);
  assert.ok(owned.length > 0);
  assert.equal(owned[0].s3Vertical, true);
  assert.notEqual(scheduledOrigin[1], ground.scheduledOrigin[1],
    'ordinary airborne and grounded Roller modes retain their different scheduled origin heights');
});

test('pending Roller attack context clears on special, superjump, death, reset and buffer expiry', async () => {
  {
    const { a } = await pendingFullCancelCandidate();
    assert.equal(a.superJump(a.pos.clone()), true);
    assert.equal(a.s3.actions.fullCancelCandidate, null, 'superjump cannot retain a stale pre-B candidate');
  }
  {
    const { a, step } = await pendingFullCancelContext();
    a.special = 1; a.specialReady = () => true;
    step({ squid: false, fire: false, jump: false, special: true });
    assert.equal(a.s3.actions.fullCancelGroundAttack, null);
  }
  {
    const { a, api } = await pendingFullCancelContext();
    assert.equal(a.superJump(a.pos.clone()), true);
    assert.equal(a.s3.actions.fullCancelGroundAttack, null);
  }
  {
    const { a } = await pendingFullCancelContext();
    a.splat(null, 'test');
    assert.equal(a.s3.actions.fullCancelGroundAttack, null);
  }
  {
    const { a } = await pendingFullCancelContext();
    a.reset();
    assert.equal(a.s3.actions?.fullCancelGroundAttack ?? null, null);
  }
  {
    const { a, api, step } = await pendingFullCancelContext();
    a.weaponRunner.cooldown = 10;
    for (let i = 0; i < Math.ceil(api.PLAYER.fireBuffer * 60) + 3; i++) {
      step({ squid: true, fire: false, jump: false });
    }
    assert.equal(a.s3.actions.fullCancelGroundAttack, null);
  }
});

test('the received remote actor:jump packet does not apply the movement impulse a second time', async () => {
  const api = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const a = api.make('roller');
  a.nid = 513; a.owner = 'peer'; a.remote = true; a.isLocal = false; a._nearCamera = () => false;
  a.vel.set(3.25, api.profile.movement.roll.jumpVelocity, -11.52);
  const before = a.vel.toArray(), received = [];
  const off = api.on('actor:jump', event => { if (event.actor === a) received.push(event); });
  const nm = Object.create(api.NetMatch.prototype);
  nm.byNid = new Map([[a.nid, a]]);
  try {
    nm._playEvent('actor:jump', { actor: { n: a.nid }, surface: 1, swim: false });
    assert.deepEqual(a.vel.toArray(), before, 'the authoritative snapshot keeps ownership of remote velocity');
    assert.equal(received.length, 1, 'the owner jump packet forwards one presentation event');
  } finally { off(); }
});
