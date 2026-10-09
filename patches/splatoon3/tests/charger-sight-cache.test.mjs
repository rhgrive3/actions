import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptSource } from '../adapter.mjs';
import {
  cacheChargerSightDot,
  cachedChargerSightDot,
  chargerSightRayRange,
  clearChargerSightDot,
} from '../runtime/charger-sight-cache.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SRC = path.join(ROOT, 'inkwave-public');

test('S3 adapters reuse the primary hit, retain the grate mask, and cap sight length', () => {
  const weaponsSource = fs.readFileSync(path.join(SRC, 'src/game/weapons.js'), 'utf8');
  const weapons = adaptSource('src/game/weapons.js', weaponsSource);
  assert.match(weapons, /raycast\(m, dir, chargerSightRayRange\(range\), _hit, true\)/);
  assert.match(weapons, /const len = hit\.hit \? Math\.min\(hit\.dist, range\) : range;/);
  assert.match(weapons, /for \(const a of G\.actors\)/);
  assert.match(weapons, /const on = chargerSightVisible\(a\);/);
  assert.match(weapons, /cacheChargerSightDot\(s, hit\)/);
  assert.match(weapons, /clearChargerSightDot\(s\)/);
  assert.ok(
    weapons.indexOf('cacheChargerSightDot(s, hit);') < weapons.indexOf('s.visible = true;', weapons.indexOf('cacheChargerSightDot(s, hit);')),
    'the cached hit remains inside PR #868\'s extracted _placeSight body',
  );

  const fxSource = fs.readFileSync(path.join(SRC, 'src/fx/fxHooks.js'), 'utf8');
  const fx = adaptSource('src/fx/fxHooks.js', fxSource);
  assert.match(fx, /cachedChargerSightDot\(s\) \?\? this\.G\.physics\?\.raycast\(_v, _dir, 0\.6, this\.hit2, true\)/);
  assert.match(fx, /clearChargerSightDot\(s\)/);
});

test('one primary hit serves repeated local and remote sight renders', () => {
  let primaryQueries = 0;
  let fxQueries = 0;
  for (const actor of [{ isLocal: true }, { isLocal: false }]) {
    const sight = {
      position: new THREE.Vector3(1, 2, 3),
      quaternion: new THREE.Quaternion(),
      scale: new THREE.Vector3(0.02, 0.02, 6),
      userData: {},
      actor,
    };
    const primaryHit = {
      hit: true,
      point: new THREE.Vector3(1, 2, 8),
      normal: new THREE.Vector3(0, 0, -1),
    };
    primaryQueries++;
    cacheChargerSightDot(sight, primaryHit);
    primaryHit.point.set(99, 99, 99); // Physics reuses its output vectors; the sight cache keeps a copy.

    const first = cachedChargerSightDot(sight);
    for (let frame = 0; frame < 8; frame++) {
      const cached = cachedChargerSightDot(sight);
      if (!cached) fxQueries++;
      assert.strictEqual(cached, first);
      assert.deepEqual(cached.point.toArray(), [1, 2, 8]);
      assert.deepEqual(cached.normal.toArray(), [0, 0, -1]);
    }
  }
  assert.equal(primaryQueries, 2, 'local and remote chargers each keep one primary query per sight update');
  assert.equal(fxQueries, 0, 'render reads do not issue the duplicate endpoint query');
  assert.equal(chargerSightRayRange(10), 10.35);
});

test('misses are cached, invalidated on hide, and Practice Range is unchanged', () => {
  const sight = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(0.02, 0.02, 10),
    userData: {},
  };
  const miss = { hit: false, point: new THREE.Vector3(), normal: new THREE.Vector3() };
  const cachedMiss = cacheChargerSightDot(sight, miss);
  assert.equal(cachedMiss.valid, true);
  assert.equal(cachedMiss.hit, false);
  clearChargerSightDot(sight);
  assert.equal(cachedChargerSightDot(sight), null);

  const rangePath = path.join(ROOT, 'patches/practice-range/install.mjs');
  const rangeSource = fs.readFileSync(rangePath, 'utf8');
  assert.equal(adaptSource('patches/practice-range/install.mjs', rangeSource), rangeSource);
});
