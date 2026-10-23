import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
function world() {
  const { G, THREE } = f;
  G.projectiles.clear(); G.scene ||= new THREE.Scene(); G.camera = new THREE.PerspectiveCamera();
  G.actors = []; G.netm = null; G.time = 0;
  G.match = { state: 'playing', playing: () => true, canRespawn: () => false };
  G.level = new f.Level({ bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
    spawnPads: [[-30, 0, 0], [30, 0, 0]], spawnBarrier: 0, half: [], single: [
      { kind: 'box', min: [-40, -.5, -40], max: [40, 0, 40] }] });
  G.physics = new f.Physics(G.level);
  const owner = f.make('blaster'), target = f.make(); target.team = 1; target.pos.set(0, 0, 10);
  G.projectiles.throwBomb(owner); const bomb = G.projectiles.bombs.at(-1); assert.ok(bomb);
  bomb.pos.set(0, .001, 0); bomb.vel.set(0, -1, 0);
  return { owner, target, bomb };
}

for (const hz of [30, 60, 120]) for (const respawn of [false, true]) {
  test(`native Autobomb distinguishes target movement from a new target life, ${hz}Hz/respawn=${respawn}`, () => {
    const { target, bomb } = world(), clock = new f.FixedClock();
    const frame = () => clock.advance(1 / hz, dt => { f.G.time += dt; f.G.projectiles._updateBombs(dt); });
    for (let i = 0; i < hz * 2 && bomb.s3Auto?.phase !== 'chasing'; i++) frame();
    assert.equal(bomb.s3Auto?.phase, 'chasing');
    assert.ok(bomb.s3Auto.target === target, 'control: native floor landing/acquisition picked the real actor');
    const before = target.netLife || 0, destination = new f.THREE.Vector3(-7, 0, 9);
    if (respawn) target.spawnAt(destination, 0); else target.pos.copy(destination);
    assert.equal(target.netLife || 0, before + Number(respawn));
    const time = f.G.time;
    for (let i = 0; i < 3 && f.G.time === time; i++) frame();
    assert.ok(f.G.time > time, 'at least one fixed simulation tick consumed the new target state');
    if (respawn) {
      assert.equal(bomb.s3Auto.phase, 'countdown', 'the unobserved intermediate death must not retarget the new life');
      assert.ok(bomb.fuse > .9 && bomb.fuse <= 1, 'uses the existing lost-target warning, without a new fuse constant');
      assert.equal(bomb.vel.x, 0); assert.equal(bomb.vel.z, 0);
    } else {
      assert.equal(bomb.s3Auto.phase, 'chasing'); assert.equal(bomb.fuse, -1);
      assert.ok(bomb.vel.x < 0, 'ordinary same-life movement still changes the walking direction');
    }
  });
}
