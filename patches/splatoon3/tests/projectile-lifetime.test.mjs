// #622: pooled projectile records survive match transitions inside the persistent
// G.projectiles pool. A recycled record must never keep a strong reference to a
// disposed-match Actor through `owner`. The fixture boots the ACTUAL public
// Projectiles class through the real build adapter chain; the composition test
// proves every installed recycle site (native + network ghost) routes through
// the owner-severing helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fixture } from './weapon-edgecases-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptNetworkSource } from '../../network-replication/adapter.mjs';

async function rig(kind = 'roller') {
  const f = await fixture();
  const a = f.make(kind);
  f.G.camera = { position: new f.THREE.Vector3(0, 20, 0) };
  f.G.actors = [a];
  f.G.match.canRespawn = () => false;
  const ps = new f.Projectiles(new f.THREE.Scene());
  f.G.projectiles = ps;
  f.setRandom(() => 0.5);
  return { f, a, ps };
}

test('#622 clear() severs Actor owners before pooled records wait across matches', async () => {
  const { a, ps } = await rig('roller');
  ps.fireFlick(a, a.weapon);
  assert.ok(ps.list.length > 0, 'the volley must exist');
  assert.ok(ps.list.every((p) => p.owner === a), 'live records keep their shooter while active');
  ps.clear();
  assert.equal(ps.list.length, 0, 'clear() empties the live list');
  assert.ok(ps.pool.length > 0, 'clear() returns records to the pool');
  assert.ok(ps.pool.every((p) => p.owner === null),
    'pooled records must not retain the disposed-match Actor');
  const before = ps.pool.length;
  const reused = ps._new();
  assert.equal(ps.pool.length, before - 1, 'pool reuse behavior is unchanged');
  assert.equal(reused.owner, null, 'a reused record must not inherit a stale owner');
});

test('#622 a normally completed projectile releases its Actor before it is pooled', async () => {
  const { f, a, ps } = await rig('roller');
  const V = f.THREE.Vector3;
  const block = {
    id: 0, solid: true, center: new V(0, -0.1, 0), half: new V(100, 0.1, 100),
    axes: [new V(1, 0, 0), new V(0, 1, 0), new V(0, 0, 1)], faces: [-1, -1, -1, -1, -1, -1],
  };
  const level = {
    blocks: [block],
    queryBlocks: (_x, _z, _xx, _zz, out) => { out.length = 0; out.push(0); return out; },
  };
  f.G.level = level;
  f.G.physics = new f.Physics(level);
  ps.fireFlick(a, a.weapon);
  const near = ps.list.find((p) => p.s3FlickUnit === 1);
  assert.ok(near, 'the real flick volley produced its near glob');
  ps.list.splice(0, ps.list.length, near);
  assert.equal(near.owner, a, 'the live glob keeps its shooter');
  for (let i = 0; i < 200 && ps.list.length; i++) ps.update(1 / 60);
  assert.equal(ps.list.length, 0, 'the glob must finish on the floor');
  assert.ok(ps.pool.includes(near), 'the finished record returns to the pool');
  assert.equal(near.owner, null,
    'normal completion must sever the Actor reference before pooling');
});

test('#622 every installed recycle site routes through the owner-severing helper', () => {
  const file = fileURLToPath(new URL('../../../inkwave-public/src/game/weapons.js', import.meta.url));
  const composed = adaptNetworkSource('src/game/weapons.js',
    adaptSource('src/game/weapons.js', fs.readFileSync(file, 'utf8')));
  // native update() completion + native clear() + the composed network ghost branch
  const sites = composed.match(/this\._recycle\(p\)/g) || [];
  assert.ok(sites.length >= 3,
    `expected the native and network ghost recycle sites to route through _recycle, got ${sites.length}`);
  assert.ok(!/list\.pop\(\); this\.pool\.push\(p\)/.test(composed),
    'no recycle site may bypass the helper and re-pool an owner');
  // Both network branch insertions (fidelity/non-fidelity) must route through the helper.
  const netAdapter = fs.readFileSync(
    fileURLToPath(new URL('../../network-replication/adapter.mjs', import.meta.url)), 'utf8');
  assert.ok(!/list\.pop\(\); this\.pool\.push\(p\)/.test(netAdapter),
    'network ghost completion must not re-pool an owner directly');
});
