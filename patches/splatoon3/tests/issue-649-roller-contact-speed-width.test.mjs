// #649 production-path evidence. issue-649-roller-speed-width.test.mjs runs the
// model-less fallback (paintRollerMaximumWidth: three body bands + two rollFloor
// side bands). A real Roller with a drum mesh never takes that branch: the
// weapons-adapter queues fidelityRollerContactPaint first, and the contact
// stroke radius is the width that actually paints in play. This pins that path
// at the issue's four speeds (low roll, normal 0.108, just before the 90F dash,
// dash 0.132) with a drum stub standing in for the character mesh.
//
// Sourced: BodyParam.PaintParam SpeedMax 0.132 / WidthHalfMax 2.8 (Leanny/splat3
// 7280ff9, Ver. 11.3.0), roll speeds SpeedNormal 0.108 / SpeedDash 0.132.
// INKWAVE approximation, NOT a Nintendo curve: the zero-speed end (the native
// body-band half width) and the linear bridge to WidthHalfMax. Roll speeds, dash
// timing, contact-damage width (1.9) and ink use are not touched by this path.
// Logic-only (Node VM, production modules); no browser or Switch comparison.
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const EXPORTS = "export * from './patches/splatoon3/runtime/weapons-fidelity.mjs'; export * from './patches/splatoon3/runtime/roller-contact-paint.mjs';";
async function setup() {
  const f = await fixture({extraExports: EXPORTS});
  f.installWeaponsFidelity(f, f.profile);
  f.installRollerContactPaint({Hit: f.Hit, Actor: f.Actor}, () => {});
  return f;
}
function queue(f, speed, {ink = 100, stick = true} = {}) {
  const a = f.make('roller');
  a.isLocal = true; a.alive = true; a.grounded = true; a.ink = ink; a.yaw = 0;
  a.intent.move.set(0, 0, stick ? 1 : 0); a.vel.set(0, 0, speed);
  a.character = {weapon: {drum: {}, def: {drum: {}}}};
  const r = a.weaponRunner; r.rolling = true;
  const queued = f.fidelityRollerContactPaint(r, a.weapon, 1 / 60);
  return {a, r, queued, stroke: r.s3ContactPaint ?? null};
}

test('#649 production contact stroke widens with ground speed and reaches WidthHalfMax at SpeedMax', async () => {
  const f = await setup();
  const completion = f.profile.weaponsFidelityCompletion, source = completion.weapons.roller.BodyParam.PaintParam;
  assert.equal(source.SpeedMax, .132);
  assert.equal(source.WidthHalfMax, 2.8);
  assert.equal(completion.referenceHz, 60);
  assert.equal(completion.worldUnitsPerSourceUnit, 1);
  const probe = f.make('roller').weapon;
  assert.ok(Math.abs(probe.rollBaseSpeed - 6.48) < 1e-12 && Math.abs(probe.rollSpeed - 7.92) < 1e-12, 'normal 0.108 / dash 0.132 at 60 Hz');
  assert.equal(probe.rollWidth, 1.9, 'contact-damage width is a separate field');

  const max = source.WidthHalfMax * completion.worldUnitsPerSourceUnit;
  const base = probe.rollWidth * .33 + Math.sqrt(.62 ** 2 - .35 ** 2) * (.62 + .1 + .08 + .04); // native body-band half width
  const speeds = {low: 1, normal: probe.rollBaseSpeed, beforeDash: probe.rollBaseSpeed, dash: probe.rollSpeed, over: probe.rollSpeed * 1.5};
  const radius = {};
  for (const [name, speed] of Object.entries(speeds)) {
    const {queued, stroke} = queue(f, speed);
    assert.equal(queued, true, `${name}: physical contact path owns the paint`);
    assert.equal(stroke.pending, true, `${name}: stroke queued for the post-pose emission`);
    radius[name] = stroke.radius;
  }
  assert.ok(radius.low > base && radius.low < radius.normal, `low ${radius.low} between the body band ${base} and normal ${radius.normal}`);
  assert.ok(radius.normal < radius.dash, `normal ${radius.normal} < dash ${radius.dash}`);
  assert.equal(radius.normal, radius.beforeDash, 'the 90F boundary changes speed, not width, until the speed changes');
  assert.ok(Math.abs(radius.dash - max) < 1e-12, `dash reaches the sourced WidthHalfMax: ${radius.dash}`);
  assert.ok(Math.abs(radius.over - max) < 1e-12, 'speed above SpeedMax stays clamped');
  // INKWAVE linear bridge (approximation, not Nintendo's curve).
  for (const name of ['low', 'normal']) {
    const ratio = Math.min(1, speeds[name] / (source.SpeedMax * completion.referenceHz * completion.worldUnitsPerSourceUnit));
    assert.ok(Math.abs(radius[name] - (base + (max - base) * ratio)) < 1e-12, `${name}: linear bridge`);
  }
});

test('#649 production contact stroke queues nothing for a stopped drum or without stick input', async () => {
  const f = await setup();
  const stopped = queue(f, 0);
  assert.equal(stopped.queued, true);
  assert.equal(stopped.stroke, null, 'zero ground speed paints nothing');
  const noStick = queue(f, 6.48, {stick: false});
  assert.equal(noStick.stroke, null, 'ZR held without the left stick paints no contact stroke');
});
