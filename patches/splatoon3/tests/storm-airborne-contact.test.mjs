// #246: an Ink Storm device must deploy its cloud at the first real
// terrain/object contact, not from elapsed air time. This exercises the actual
// built module (adaptSource applied to inkwave-public/src/game/weapons.js), so a
// missing/rewritten adapter connection fails here rather than passing against a
// mirror of the fix. No renderer, second engine or gameplay value is introduced.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// A device thrown upward from y=1.45 never contacts terrain while the stub
// reports no hit, and stays above PLAYER.waterY (=-1.6) through ~1.57s.
function throwUpward(f, ps, { pitch = 1.0, team = 0 } = {}) {
  const a = f.make('shooter');
  a.pos.set(0, 0, 0); a.vel.set(0, 0, 0); a.aimYaw = 0; a.aimPitch = pitch; a.team = team;
  ps.throwStorm(a);
  const b = ps.bombs.at(-1);
  assert.equal(b.kind, 'storm');
  assert.equal(b.fuse, -1, 'storm devices never use the bomb fuse');
  return b;
}

function noContactPhysics(f) {
  f.G.physics.segment = (_from, _to, hit) => { hit.hit = false; return hit; };
  f.G.physics.raycast = (_from, _dir, _distance, hit) => { hit.hit = false; return hit; };
}

test('an un-contacted Ink Storm device does not deploy a cloud after 1.1s of air time', async () => {
  const f = await fixture();
  noContactPhysics(f);
  const waterY = f.PLAYER.waterY;
  try {
    const ps = new f.Projectiles(new f.THREE.Scene());
    const b = throwUpward(f, ps);
    // 67 fixed 60Hz ticks = 1.11667s, just past the removed age>1.1 boundary.
    for (let i = 0; i < 67; i++) ps._updateBombs(1 / 60);
    assert.ok(b.age > 1.1, 'the sourced-removed boundary has elapsed');
    assert.equal(ps.clouds.length, 0, 'no cloud may come from elapsed air time alone');
    assert.equal(ps.bombs.length, 1, 'the un-contacted device survives the 1.1s tick');
    // Keep flying longer than the old boundary while still airborne.
    for (let i = 0; i < 23; i++) ps._updateBombs(1 / 60);
    assert.ok(b.pos.y > waterY - 1.8, 'the negative control is still airborne, not water-culled');
    assert.equal(ps.clouds.length, 0);
    assert.equal(ps.bombs.length, 1);
  } finally { f.PLAYER.waterY = waterY; }
});

test('the first terrain contact deploys exactly one cloud and consumes the device', async () => {
  const f = await fixture();
  noContactPhysics(f);
  const waterY = f.PLAYER.waterY;
  try {
    const ps = new f.Projectiles(new f.THREE.Scene());
    const b = throwUpward(f, ps);
    for (let i = 0; i < 30; i++) ps._updateBombs(1 / 60);   // 0.5s: still flying
    assert.equal(ps.clouds.length, 0);
    f.G.physics.segment = (_from, _to, hit) => {
      hit.hit = true; hit.point.set(0, 0, 0); hit.normal.set(0, 1, 0); return hit;
    };
    ps._updateBombs(1 / 60);
    assert.equal(ps.clouds.length, 1, 'contact deploys the cloud once');
    assert.equal(ps.bombs.length, 0, 'the device is consumed by contact');
    for (let i = 0; i < 10; i++) ps._updateBombs(1 / 60);
    assert.equal(ps.clouds.length, 1, 'no duplicate cloud on later ticks');
    void b;
  } finally { f.PLAYER.waterY = waterY; }
});

test('a remote ghost storm device still carries its ghost flag through contact deployment', async () => {
  const f = await fixture();
  noContactPhysics(f);
  const waterY = f.PLAYER.waterY;
  try {
    const ps = new f.Projectiles(new f.THREE.Scene());
    throwUpward(f, ps);
    ps.bombs[0].ghost = true;
    for (let i = 0; i < 30; i++) ps._updateBombs(1 / 60);
    assert.equal(ps.clouds.length, 0);
    f.G.physics.segment = (_from, _to, hit) => { hit.hit = true; return hit; };
    ps._updateBombs(1 / 60);
    assert.equal(ps.clouds.length, 1);
    assert.equal(ps.clouds[0].ghost, true, 'ghost ownership is preserved by the contact path');
  } finally { f.PLAYER.waterY = waterY; }
});

test('water or void discard of an un-contacted device produces no cloud', async () => {
  const f = await fixture();
  noContactPhysics(f);
  const waterY = f.PLAYER.waterY;
  try {
    const ps = new f.Projectiles(new f.THREE.Scene());
    const b = throwUpward(f, ps);
    b.vel.set(0, 0, 0);
    b.pos.y = waterY - 5;   // below the native water removal threshold, with no upward motion
    ps._updateBombs(1 / 60);
    assert.equal(ps.clouds.length, 0, 'a submerged device must not rain');
    assert.equal(ps.bombs.length, 0, 'the device is released');
  } finally { f.PLAYER.waterY = waterY; }
});

test('a never-contacting device is discarded by a non-gameplay memory guard, still without a cloud', async () => {
  const f = await fixture();
  noContactPhysics(f);
  const waterY = f.PLAYER.waterY;
  f.PLAYER.waterY = -1e6;   // isolate the memory guard from the water rule
  try {
    const ps = new f.Projectiles(new f.THREE.Scene());
    throwUpward(f, ps);
    for (let i = 0; i < 1801; i++) ps._updateBombs(1 / 60);   // > 30s
    assert.equal(ps.clouds.length, 0, 'the guard is not a deployment path');
    assert.equal(ps.bombs.length, 0, 'the never-contacting device is released');
  } finally { f.PLAYER.waterY = waterY; }
});
