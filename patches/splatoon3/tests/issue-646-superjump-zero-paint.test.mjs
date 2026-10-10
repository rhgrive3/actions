import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

function setupFixture(f) {
  f.G.physics.groundProbe = (_x, _y, _z, _up, _down, _r, gh) => {
    gh.hit = true;
    gh.y = 0;
    gh.normal.set(0, 1, 0);
    return gh;
  };
  f.G.physics.collideBody = () => ({});
  f.G.physics.waterCheck = () => false;
}

test('#646 ordinary Super Jump landing creates zero gameplay paint, adds 0 turf and charges 0 special', async () => {
  const f = await fixture();
  setupFixture(f);

  let splatCalls = 0;
  f.G.paint.splat = () => {
    splatCalls++;
    return 10;
  };

  const a = f.make();
  a.grounded = true;
  a.stats = a.stats || { turf: 0 };
  a.special = 0;
  const initialTurf = a.stats.turf;
  const initialSpecial = a.special;

  // Destination vector
  const dest = new f.THREE.Vector3(10, 0, 0);
  a.superJump(dest);
  assert.ok(a.superJumpState, 'super jump started');

  // Advance through charge phase into flight and landing
  for (let i = 0; i < 300 && a.superJumpState; i++) {
    f.tick(a);
  }

  assert.equal(a.superJumpState, null, 'super jump landing completed');
  assert.equal(splatCalls, 0, 'zero paint calls occurred from ordinary Super Jump landing');
  assert.equal(a.stats.turf, initialTurf, 'zero personal turf score added');
  assert.equal(a.special, initialSpecial, 'zero special gauge added');
});

test('#646 remote and enemy-turf Super Jump landings also create zero paint and score', async () => {
  const f = await fixture();
  setupFixture(f);

  let splatCalls = 0;
  f.G.paint.splat = () => { splatCalls++; return 10; };
  f.G.paint.sample = () => 2; // enemy turf

  const remoteActor = f.make();
  remoteActor.grounded = true;
  remoteActor.remote = true;
  remoteActor.stats = remoteActor.stats || { turf: 50 };
  remoteActor.special = 100;

  remoteActor.superJump(new f.THREE.Vector3(20, 0, 0));
  const initialTurf = remoteActor.stats.turf;
  const initialSpecial = remoteActor.special;
  for (let i = 0; i < 300 && remoteActor.superJumpState; i++) {
    f.tick(remoteActor);
  }

  assert.equal(remoteActor.superJumpState, null, 'remote landing completed');
  assert.equal(splatCalls, 0, 'no paint splat on enemy ground landing');
  assert.equal(remoteActor.stats.turf, initialTurf, 'turf remains unchanged');
  assert.equal(remoteActor.special, initialSpecial, 'special remains unchanged');
});
