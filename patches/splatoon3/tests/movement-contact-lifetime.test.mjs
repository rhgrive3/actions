import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './source-fixture.mjs';

// Run the actual production Actor/owners. Loading the tested runtime explicitly
// also permits the same tests in the small review overlay without a repo clone.
const movement = fs.readFileSync(new URL('../runtime/movement.mjs', import.meta.url), 'utf8');
async function wall() {
  const f = await fixture({ productionComposition: true,
    adaptRuntime: (rel, source) => rel === 'patches/splatoon3/runtime/movement.mjs' ? movement : source });
  f.G.paint.sample = () => 1;
  f.G.physics.raycast = (_p, _d, _n, h) => {
    h.hit = true; h.normal.set(0, 0, 1); h.face = 0; h.u = h.v = .5; return h;
  };
  return f;
}
function cling(f, a = f.make()) {
  a.form = 'squid'; a.alive = true; a.climbing = true; a.grounded = false;
  a.wallN.set(0, 0, 1); a.intent.move.set(0, 0, 0); a.intent.jump = false;
  a.climbExit = 0;
  return a;
}
function age(f, a) { for (let k = 0; k < 30; k++) a._updateClimb(1 / 60, true); }

test('#253 reset retires the prior wall-contact descent clock', async () => {
  const f = await wall(), a = cling(f);
  age(f, a); assert(a.s3NeutralWallSlideT > 0);
  a.reset(); assert.equal(a.s3NeutralWallSlideT, 0);
  cling(f, a); a._updateClimb(1 / 60, true);
  assert.equal(a.vel.y, -(1 / 60) * f.profile.movement.neutralWallSlide.acceleration);
});

test('#253 explicit detach and immediate reattachment begin a fresh descent', async () => {
  const f = await wall(), a = cling(f);
  age(f, a); assert.equal(a.vel.y, -f.profile.movement.neutralWallSlide.terminalSpeed);
  a._setClimb(false); assert.equal(a.s3NeutralWallSlideT, 0);
  cling(f, a); a._updateClimb(1 / 60, true);
  assert.equal(a.vel.y, -(1 / 60) * f.profile.movement.neutralWallSlide.acceleration);
  // A redundant detached-state call must also clear stale adopted state.
  a.climbing = false; a.s3NeutralWallSlideT = .25; a._setClimb(false);
  assert.equal(a.s3NeutralWallSlideT, 0);
});

test('#253 active uninterrupted contact retains its descent ramp', async () => {
  const f = await wall(), a = cling(f);
  a._updateClimb(1 / 60, true); const before = a.s3NeutralWallSlideT;
  a._setClimb(true); assert.equal(a.s3NeutralWallSlideT, before);
  a._updateClimb(1 / 60, true); assert.equal(a.s3NeutralWallSlideT, 2 / 60);
});

test('#253 splatting retires the wall clock even though native death assigns climbing directly', async () => {
  const f = await wall(), a = cling(f);
  age(f, a); a.splat(null, 'weapon');
  assert.equal(a.alive, false); assert.equal(a.climbing, false);
  assert.equal(a.s3NeutralWallSlideT, 0);
});

test('#253 contact lifetime matches at 30/60/120 Hz with a mid-run detach', async () => {
  const results = [];
  for (const hz of [30, 60, 120]) {
    const f = await wall(), a = cling(f), clock = new f.FixedClock(), rows = [];
    for (let frame = 0; frame < hz / 2; frame++) clock.advance(1 / hz, dt => {
      if (rows.length === 18) { a._setClimb(false); cling(f, a); }
      a._updateClimb(dt, true); rows.push([a.vel.y, a.s3NeutralWallSlideT]);
    });
    assert.equal(rows[18][0], -(1 / 60) * f.profile.movement.neutralWallSlide.acceleration);
    results.push(rows);
  }
  assert.deepEqual(results[0], results[1]); assert.deepEqual(results[1], results[2]);
});
