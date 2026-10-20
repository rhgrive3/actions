// #541 production-path evidence. issue-541-roller-dry-roll.test.mjs drives the
// native stripe path (a model-less fixture) and asserts a dry hold paints nothing.
// A real Roller with a drum mesh paints through the physical contact stroke
// (fidelityRollerContactPaint -> queueRollerContactPaint -> Actor._finishFrame).
// A dry roll keeps Roller-down (rolling stays true), so this stroke gate is what
// keeps the empty tank from painting there: the S3 dry roll must neither paint
// turf nor resume until ink is back above the 0.5 roll threshold.
//
// Unconfirmed and NOT modelled here (no recovered Ver. 11.3.0 source): dry-roll
// movement speed/acceleration and the out-of-ink clunk audio.
// Logic-only (Node VM, production modules); no browser or Switch comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXPORTS = "export * from './patches/splatoon3/runtime/weapons-fidelity.mjs'; export * from './patches/splatoon3/runtime/roller-contact-paint.mjs';";

test('#541 physical-drum contact paint is gated by the 0.5 roll ink threshold while Roller-down persists', async () => {
  const f = await fixture({extraExports: EXPORTS});
  f.installWeaponsFidelity(f, f.profile);
  f.installRollerContactPaint({Hit: f.Hit, Actor: f.Actor}, () => {});
  const a = f.make('roller');
  a.isLocal = true; a.alive = true; a.grounded = true; a.yaw = 0;
  a.intent.move.set(0, 0, 1); a.vel.set(0, 0, 6.48);
  a.character = {weapon: {drum: {}, def: {drum: {}}}};
  const r = a.weaponRunner; r.rolling = true;
  const queue = ink => { a.ink = ink; return f.fidelityRollerContactPaint(r, a.weapon, 1 / 60); };

  assert.equal(queue(100), true);
  assert.equal(r.s3ContactPaint.pending, true, 'a paid roll queues its contact stroke');
  r.s3ContactPaint.pending = false; // what Actor._finishFrame does after emitting it

  for (const dry of [.5, .4, 0]) {
    queue(dry);
    assert.equal(r.s3ContactPaint.pending, false, `ink ${dry}: the dry hold queues no contact stroke`);
    assert.equal(r.rolling, true, `ink ${dry}: the paint gate does not tear down Roller-down`);
  }
  queue(.6);
  assert.equal(r.s3ContactPaint.pending, true, 'ink back above 0.5 paints again');
});
