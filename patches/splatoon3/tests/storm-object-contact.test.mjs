import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { objectDamageScale } from '../runtime/sub-resistance.mjs';

const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < 1e-7, message || `${actual} != ${expected}`);

async function setup() {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const p = f.G.projectiles;
  const owner = f.make('shooter'), enemy = f.make('shooter');
  owner.team = 0; owner.remote = false; owner.alive = true;
  enemy.team = 1; enemy.remote = false; enemy.alive = true;
  const group = new f.THREE.Group(); group.position.set(0, 5, 0);
  const cloud = { owner, team: 0, group, t: 1, dur: 20, dir: new f.THREE.Vector3(), rainT: 1, ghost: false };
  p.clouds.push(cloud);
  const wall = { subId: 'splashWall', phase: 'deployed', dead: false, team: 1, owner: enemy,
    pos: new f.THREE.Vector3(0, 0, 4), hp: 10000, yaw: 0, spec: { wallWidth: 8, wallHeight: 4 } };
  const wave = { id: 'waveBreaker', kind: 'wave', dead: false, team: 1, owner: enemy,
    pos: new f.THREE.Vector3(0, 0, 5), hp: 10000, maxHp: 10000 };
  const outside = { subId: 'splashWall', phase: 'deployed', dead: false, team: 1, owner: enemy,
    pos: new f.THREE.Vector3(f.SPECIALS.storm.radius + 0.2, 0, 0), hp: 10000, yaw: 0,
    spec: { wallWidth: 8, wallHeight: 4 } };
  const above = { id: 'waveBreaker', kind: 'wave', dead: false, team: 1, owner: enemy,
    pos: new f.THREE.Vector3(0, 5.01, 0), hp: 10000, maxHp: 10000 };
  p._s3SubObjects = [wall, outside];
  p._s3AllSpecialObjects = [wave, above];
  return { f, p, owner, cloud, wall, wave, outside, above };
}

test('the continuous Storm cloud tick damages devices with InkStorm source rates at 30/60/120 Hz', async () => {
  const expected = [];
  for (const hz of [30, 60, 120]) {
    const { f, p, owner, cloud, wall, wave, outside, above } = await setup();
    assert.equal(typeof p.s3DamageSubObjects, 'function');
    assert.equal(typeof p.s3DamageSpecialObjects, 'function');
    assert.equal(objectDamageScale(owner, 'splashWall', 'InkStorm'), 3);
    assert.equal(objectDamageScale(owner, 'waveBreaker', 'InkStorm'), 3);
    assert.equal(objectDamageScale(owner, 'splashWall', 'InkStormRain'), 0,
      'the droplet row does not describe the active cloud tick');
    assert.equal(objectDamageScale(owner, 'waveBreaker', 'InkStormRain'), 0);
    const sightRays = [];
    const nativeLos = f.G.physics.los;
    f.G.physics.los = (from, to) => { sightRays.push([[from.x,from.y,from.z],[to.x,to.y,to.z]]); return nativeLos(from,to); };
    for (let i = 0; i < hz; i++) {
      f.G.time += 1 / hz;
      p._updateClouds(1 / hz);
    }
    const stormRate = f.SPECIALS.storm.dps;
    const wallDamage = 10000 - wall.hp, waveDamage = 10000 - wave.hp;
    close(wallDamage, stormRate * 3, `${hz} Hz Splash Wall follows InkStorm ×3 (got ${wallDamage})`);
    close(waveDamage, stormRate * 3, `${hz} Hz Wave Breaker follows InkStorm ×3 (got ${waveDamage})`);
    assert.equal(outside.hp, 10000, 'outside the active horizontal rain cylinder');
    assert.equal(above.hp, 10000, 'above the cloud is excluded');
    assert.ok(sightRays.some(([from,to]) => Math.abs(from[1] - 1.2) < 1e-9 && Math.abs(to[1] - 4.4) < 1e-9),
      'device visibility uses the same body-to-cloud-top LOS endpoints as actor contact');

    const before = [wall.hp, wave.hp];
    f.G.physics.los = () => false;
    f.G.time += 1 / hz; p._updateClouds(1 / hz);
    assert.deepEqual([wall.hp, wave.hp], before, 'a blocking surface prevents cloud object contact');
    expected.push([wallDamage, waveDamage]);
    p.clear();
  }
  close(expected[0][0], expected[1][0]); close(expected[1][0], expected[2][0]);
  close(expected[0][1], expected[1][1]); close(expected[1][1], expected[2][1]);
});
