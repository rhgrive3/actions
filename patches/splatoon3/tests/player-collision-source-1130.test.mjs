import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fixture } from './weapon-edgecases-fixture.mjs';

const read = rel => fs.readFileSync(new URL(rel, import.meta.url));
const sourceId = 'data/parameter/1130/misc/SplPlayer.game__GameParameterTable.json';

test('pinned 11.3.0 squid collision receipt is exact and its explicit fields drive profile bindings', () => {
  const receipt = read('../reference/player-collision-1130.json');
  assert.equal(createHash('sha256').update(receipt).digest('hex'),
    'afece0e3e2016a895ba79483bfa63489b334c372293417b3b0ef072993bcb660');
  const collision = JSON.parse(receipt).GameParameters.spl__PlayerCollisionParam;
  const profile = JSON.parse(read('../profile.json'));
  const curated = JSON.parse(read('../reference/curated-numbers.json'));
  for (const [target, field, value] of [
    ['s3SwimHurtRadius', 'ColBullet_Radius_Squid', .675],
    ['s3SwimHurtSegmentHeight', 'ColBullet_Height_Squid', 0],
  ]) {
    const key = `${sourceId}#/GameParameters/spl__PlayerCollisionParam/${field}`;
    assert.equal(collision[field], value);
    assert.equal(curated.parameters[key].value, value);
    assert.equal(curated.parameters[key].status, 'extracted');
    assert.equal(profile.bindings[`player.${target}`].parameter, key);
    assert.equal(profile.player[target], collision[field] * profile.bindings[`player.${target}`].factor);
  }
  // An absent human constructor value is not evidence for the existing
  // project calibration, or for a cylinder fitted by a paper's researcher.
  assert.equal(Object.hasOwn(collision, 'ColBullet_Radius_Human'), false);
  assert.equal(Object.hasOwn(collision, 'ColBullet_Height_Human'), false);
  assert.equal(profile.bindings['player.s3HumanoidHurtRadius'], undefined);
  assert.equal(profile.bindings['player.s3HumanoidHurtHeight'], undefined);
});

test('actual squid bullet sweep remains a .675 sphere when the terrain capsule height/radius changes', async () => {
  const f = await fixture();
  f.G.physics.segment = (_a, _b, hit) => { hit.hit = false; return hit; };
  const system = new f.Projectiles(new f.THREE.Scene()), owner = f.make('shooter'), target = f.make();
  target.team = 1; target.form = 'squid'; target.pos.set(0, 0, 0); target.invuln = 0;
  owner.pos.set(-2, 0, 0); f.G.actors = [target];
  const sweep = (y, z, bullet) => f.fidelityProjectileTargets(system, {
    prev: new f.THREE.Vector3(-2, y, z), pos: new f.THREE.Vector3(2, y, z),
    owner, team: 0, wid: 'shooter', size: bullet, age: .1,
  }).length;
  for (const terrain of [{ radius: .38, squidHeight: .55 }, { radius: 3, squidHeight: 10 }]) {
    Object.assign(f.PLAYER, terrain);
    for (const bullet of [0, .08, .2]) {
      assert.equal(sweep(.675, .675 + bullet - .0001, bullet), 1);
      assert.equal(sweep(.675, .675 + bullet + .0001, bullet), 0);
      assert.equal(sweep(1.35 + bullet - .0001, 0, bullet), 1);
      assert.equal(sweep(1.35 + bullet + .0001, 0, bullet), 0);
      assert.equal(sweep(-bullet + .0001, 0, bullet), 1);
      assert.equal(sweep(-bullet - .0001, 0, bullet), 0);
    }
  }
});
