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
