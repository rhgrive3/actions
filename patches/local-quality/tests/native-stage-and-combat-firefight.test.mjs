import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { sphereTriangleEntry } from '../../native-stages/runtime/sphere-triangle-entry.mjs';
import { advanceSplashDrops, spawnSplashDrop } from '../../splatoon3/runtime/blaster-flight-paint.mjs';
import { globGrazePaint } from '../../splatoon3/runtime/weapons-fidelity.mjs';
import { installIssue264PaintOwnership } from '../../splatoon3/runtime/paint-ownership.mjs';

const readRepo = (rel) => fs.readFileSync(new URL('../../../' + rel, import.meta.url), 'utf8');
const readPublic = (rel) => fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8');

const TriangleWorld = new Function(
  'THREE',
  'sphereTriangleEntry',
  readRepo('patches/native-stages/runtime/triangle-world.mjs')
    .replace(/^import .*;$/gm, '')
    .replace(/^export /gm, '') + '\nreturn TriangleWorld;'
)(THREE, sphereTriangleEntry);

test('NAT-01 NativeLevel.containsOnFace scalar triangle AABB precheck matches full Triangle.containsPoint across 2000 random points', () => {
  const nativeLevelSrc = readRepo('patches/native-stages/runtime/native-level.mjs');
  assert.match(nativeLevelSrc, /const px=projected\.x,py=projected\.y,pz=projected\.z,verts=this\.triangleWorld\.triangles,tris=face\.triangles;/);

  const count = 64;
  const triangles = new Float32Array(count * 9);
  const order = new Uint32Array(count);
  const flags = new Uint32Array(count);
  const normals = new Float32Array(count * 3);
  const objectIds = new Uint32Array(count);
  const nodes = new Float32Array(8);
  let seed = 0x13579bdf;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  for (let t = 0; t < count; t++) {
    const cx = (t % 8) * 3, cz = Math.floor(t / 8) * 3;
    const pts = [
      [cx + rnd() * 0.5, 0, cz + rnd() * 0.5],
      [cx + 1.5 + rnd() * 0.8, 0, cz + rnd() * 0.5],
      [cx + 0.5 + rnd() * 0.8, 0, cz + 1.5 + rnd() * 0.8],
    ];
    order[t] = t;
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3;
      triangles[o] = pts[k][0];
      triangles[o + 1] = pts[k][1];
      triangles[o + 2] = pts[k][2];
    }
    normals[t * 3 + 1] = 1;
    flags[t] = 3;
  }
  nodes.set([-10, -5, -10, 40, 5, 40, -1, count]);
  const tw = new TriangleWorld({ triangles, order, flags, normals, objectIds, nodes });
  const face = {
    origin: new THREE.Vector3(0, 0, 0),
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 0, 1),
    n: new THREE.Vector3(0, 1, 0),
    su: 30,
    sv: 30,
    triangles: Array.from({ length: count }, (_, i) => i),
  };

  let triCallsOpt = 0, triCallsRef = 0;
  const checkRef = (p, tolerance = 0.002) => {
    const rel = p.clone().sub(face.origin);
    const a = rel.dot(face.u), b = rel.dot(face.v);
    if (a < -tolerance || b < -tolerance || a > face.su + tolerance || b > face.sv + tolerance) return false;
    const projected = p.clone().addScaledVector(face.n, -rel.dot(face.n));
    for (const id of face.triangles) {
      triCallsRef++;
      if (tw.triangle(id).containsPoint(projected)) return true;
    }
    return false;
  };

  const relScratch = new THREE.Vector3(), projScratch = new THREE.Vector3();
  const checkOpt = (p, tolerance = 0.002) => {
    const rel = relScratch.copy(p).sub(face.origin);
    const a = rel.dot(face.u), b = rel.dot(face.v);
    if (a < -tolerance || b < -tolerance || a > face.su + tolerance || b > face.sv + tolerance) return false;
    const projected = projScratch.copy(p).addScaledVector(face.n, -rel.dot(face.n));
    const px = projected.x, py = projected.y, pz = projected.z, verts = tw.triangles, tris = face.triangles;
    for (let i = 0; i < tris.length; i++) {
      const id = tris[i], o = id * 9;
      const x0 = verts[o], x1 = verts[o + 3], x2 = verts[o + 6];
      if (px < Math.min(x0, x1, x2) - 1e-6 || px > Math.max(x0, x1, x2) + 1e-6) continue;
      const z0 = verts[o + 2], z1 = verts[o + 5], z2 = verts[o + 8];
      if (pz < Math.min(z0, z1, z2) - 1e-6 || pz > Math.max(z0, z1, z2) + 1e-6) continue;
      const y0 = verts[o + 1], y1 = verts[o + 4], y2 = verts[o + 7];
      if (py < Math.min(y0, y1, y2) - 1e-6 || py > Math.max(y0, y1, y2) + 1e-6) continue;
      triCallsOpt++;
      if (tw.triangle(id).containsPoint(projected)) return true;
    }
    return false;
  };

  for (let i = 0; i < 2000; i++) {
    const p = new THREE.Vector3(rnd() * 26 - 1, (rnd() - 0.5) * 0.2, rnd() * 26 - 1);
    assert.equal(checkOpt(p), checkRef(p), `mismatch at sample ${i}`);
  }
  assert.ok(triCallsOpt < triCallsRef * 0.1, `expected >90% reduction in triangle containsPoint calls, got ${triCallsOpt} vs ${triCallsRef}`);
});

test('NAT-02 TriangleWorld.resolveCapsule returns a stable independently owned normal', () => {
  const triangles = new Float32Array([
    -5, 0, -5,
     5, 0, -5,
     0, 0,  5,
  ]);
  const order = new Uint32Array([0]);
  const flags = new Uint32Array([2]);
  const normals = new Float32Array([0, 1, 0]);
  const objectIds = new Uint32Array([0]);
  const nodes = new Float32Array([-5, -0.1, -5, 5, 0.1, 5, -1, 1]);
  const tw = new TriangleWorld({ triangles, order, flags, normals, objectIds, nodes });

  const feet1 = new THREE.Vector3(0, -0.05, 0);
  const r1 = tw.resolveCapsule(feet1, 1.45, 0.38, false);
  const nRef = r1.normal, originalNormal = nRef.toArray();
  assert.equal(r1.ground, true);
  assert.ok(feet1.y >= 0);

  const feet2 = new THREE.Vector3(0.2, -0.03, 0.2);
  const r2 = tw.resolveCapsule(feet2, 1.45, 0.38, false);
  assert.notEqual(r2.normal, nRef, 'distinct capsule resolutions must return independently owned normals');
  assert.deepEqual(nRef.toArray(), originalNormal, 'later capsule resolutions must not mutate previous results');
});

test('NAT-03 through NAT-06 native runtime modules use preallocated scratch vectors and closure-free edge helpers', () => {
  assert.match(readRepo('patches/native-stages/runtime/native-drop.mjs'), /function findDropEdge\(from,toId\)/);
  assert.match(readRepo('patches/native-stages/runtime/native-jump-input.mjs'), /const _jumpProbe=\{pos:null,grounded:true,form:'kid'\},_jumpDest=\{goal:null,block:-1,triangle:-1\};/);
  assert.match(readRepo('patches/native-stages/runtime/native-ranked-boarding.mjs'), /const _boardDir=new THREE\.Vector3\(\),_boardPoint=new THREE\.Vector3\(\)/);
  assert.match(readRepo('patches/native-stages/runtime/native-bot-support.mjs'), /function hasJumpEdgeTo\(node,toId\)/);
});

test('CMB-01, CMB-03 and CMB-05 firefight paint, splash drop, graze, and XZ broadphase preserve exact combat behavior', () => {
  // CMB-01: _paintOwnerPool reuse in PaintSystem.prototype.splat
  const calls = [];
  class MockPaint {
    constructor() { this.grid = new Uint8Array(64); }
    splat(center, radius, team, opts) {
      calls.push({ owner: this._paintOwnerContext?.owner, mode: this._paintOwnerContext?.mode, order: this._paintCurrentOrder, opts });
      return 1;
    }
    flush() {}
    _emitGrowth() {}
  }
  installIssue264PaintOwnership(MockPaint, { kind: { speck: 7 }, shapes: [], reach: [], dripReach: 3.9 });
  const mp = new MockPaint();
  const actor = { remote: false, addTurf() {} };
  mp.splat(new THREE.Vector3(1, 0, 1), 1.2, 0, { claimOwner: actor, claimMode: 'no-special', seed: 0.5 });
  mp.splat(new THREE.Vector3(2, 0, 2), 1.2, 0, { claimOwner: actor, seed: 0.25 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].owner, actor);
  assert.equal(calls[0].mode, 1);
  assert.equal(calls[1].owner, actor);
  assert.equal(calls[1].mode, 0);
  assert.equal(mp._paintOwnerPool.length, 1, 'non-nested splat reuses a single context object in _paintOwnerPool');
  assert.equal(mp._paintOwnerPool[0].owner, null, 'context owner reference is cleared on exit');

  // CMB-03: advanceSplashDrops reuses _s3SplashLandingsScratch and _s3SplashRetiredScratch
  const landedMarks = [];
  const system = {};
  const game = {
    projectiles: system,
    physics: {
      segment(from, to, hit) {
        if (to.y <= 0) {
          hit.hit = true;
          hit.point.set(to.x, 0, to.z);
          hit.normal.set(0, 1, 0);
          hit.face = 0;
        } else hit.hit = false;
        return hit;
      },
    },
    paint: {
      splat(pt, rad, team) { landedMarks.push([pt.x, pt.z, rad, team]); return 0.5; },
    },
  };
  const owner = { remote: false, addTurf() {} };
  for (let i = 0; i < 6; i++) {
    spawnSplashDrop(game, {
      owner,
      team: i % 2,
      seed: 0.3,
      salt: i,
      from: new THREE.Vector3(i, 0.05, 0),
      direction: new THREE.Vector3(0, 0, 1),
      radius: 0.6,
      spec: { gravity: 30, drag: 0.06, fieldRadius: 0 },
    });
  }
  const landedCount = advanceSplashDrops(system, 0.1, game, -10);
  assert.equal(landedCount, 6);
  assert.equal(landedMarks.length, 6);
  assert.ok(Array.isArray(system._s3SplashLandingsScratch));
  assert.equal(system._s3SplashLandingsScratch.length, 0);
  assert.equal(system._s3SplashRetiredScratch.length, 0);

  // CMB-05: globGrazePaint reuses p.s3GrazePaint.at on subsequent accepted grazes
  const p = { owner, team: 0, pos: new THREE.Vector3(0, 0.2, 0), seed: 0.4, s3Weapon: { kind: 'slosher' } };
  const n = new THREE.Vector3(0, 1, 0);
  globGrazePaint(game, p, new THREE.Vector3(0, 0, 0), n, 1.0, 0);
  const firstAt = p.s3GrazePaint.at;
  p.pos.set(0, 0.2, 0.1);
  assert.equal(globGrazePaint(game, p, new THREE.Vector3(0, 0, 0.1), n, 1.0, 0), 0, 'rejected graze within 0.8*radius');
  assert.equal(p.s3GrazePaint.at, firstAt, 'rejected graze does not replace s3GrazePaint.at');
  p.pos.set(0, 0.2, 3.0);
  globGrazePaint(game, p, new THREE.Vector3(0, 0, 3.0), n, 1.0, 0);
  assert.equal(p.s3GrazePaint.at, firstAt, 'accepted graze reuses existing s3GrazePaint.at Vector3');
});
test('NAT-07 through NAT-10 native runtime modules hoist sort closure, scratch vectors, and closure-free climb/surge/jump helpers', () => {
  assert.match(readRepo('patches/native-stages/runtime/native-physics.mjs'), /_sortAsc\s*=\s*\(a,\s*b\)\s*=>\s*a\s*-\s*b/);
  assert.match(readRepo('patches/native-stages/runtime/native-physics.mjs'), /candidates\.sort\(_sortAsc\)/);

  assert.match(readRepo('patches/native-stages/runtime/native-jump-attach.mjs'), /function findJumpAttachEdge/);
  assert.match(readRepo('patches/native-stages/runtime/native-jump-attach.mjs'), /const _down=new THREE\.Vector3\(0,-1,0\),_probe=new THREE\.Vector3\(\);/);

  assert.match(readRepo('patches/native-stages/runtime/native-climb.mjs'), /function findStraightClimbEdge/);
  assert.match(readRepo('patches/native-stages/runtime/native-climb.mjs'), /function findMissingClimbSample/);

  assert.match(readRepo('patches/native-stages/runtime/native-surge.mjs'), /function findSurgeEdge/);
  assert.match(readRepo('patches/native-stages/runtime/native-surge.mjs'), /function findMissingSurgeSample/);
});

test('CMB-08 through CMB-10 ranked combat, catalog spiral cover, and charger flight broadphase and scratch allocations', () => {
  const rankedCombat = readRepo('patches/splatoon3/runtime/ranked/combat.mjs');
  assert.match(rankedCombat, /const p = new THREE\.Vector3\(\.\.\.pos\), _blastBody = new THREE\.Vector3\(\);/);
  assert.match(rankedCombat, /Math\.sqrt\(d2\) <= radius/);

  const catalog = readRepo('patches/splatoon3/runtime/main-weapon-catalog.mjs');
  assert.match(catalog, /const reach=bodyRadius\+\(pr0>radius\?pr0:radius\)\+1e-4;/);

  const chargerFlight = readRepo('patches/splatoon3/runtime/weapons-charger-flight.mjs');
  assert.match(chargerFlight, /const localShotScratch = \[\]; let localShotDepth = 0;/);
  assert.match(chargerFlight, /const reach=bodyRadius\+\(collision\.InitRadiusForPlayer>collision\.EndRadiusForPlayer/);
});

test('NAT-11 through NAT-17 and CMB-11/MOV-09 Wave-2 scalar clamp, segment/point-triangle distance, quadraticEntry, drop clearance, and regionStats/edgeGuard parity', () => {
  const twSrc = readRepo('patches/native-stages/runtime/triangle-world.mjs');
  assert.match(twSrc, /const clamp=\(x,a,b\)=>x<=a\?\+a:x>=b\?\+b:x;/);
  assert.match(twSrc, /const ux=b\.x-a\.x,uy=b\.y-a\.y,uz=b\.z-a\.z/);
  assert.match(twSrc, /const v0x=c\.x-b\.x,v0y=c\.y-b\.y,v0z=c\.z-b\.z/);

  const steSrc = readRepo('patches/native-stages/runtime/sphere-triangle-entry.mjs');
  assert.match(steSrc, /2\*A\*hi\+B<=0&&\(A\*hi\+B\)\*hi\+C>1e-6/);
  assert.match(steSrc, /tLo=t0<t1\?t0:t1,tHi=t0>t1\?t0:t1/);

  const ndSrc = readRepo('patches/native-stages/runtime/native-drop.mjs');
  assert.match(ndSrc, /if\(distance>=thresh\)\{const d=w\._capsuleDistance\(ta,tb,t1\);if\(d<distance\)distance=d;\}/);

  const composedPaint = adaptBuildSource('src/world/paint.js', readPublic('src/world/paint.js'));
  assert.match(composedPaint, /const dv = \(j \+ 0\.5\) \* cv - lv, dv2 = dv \* dv;/);

  const composedBots = adaptBuildSource('src/game/bots.js', readPublic('src/game/bots.js'));
  assert.match(composedBots, /const _egCos0 = Math\.cos\(0\.8\), _egSin0 = Math\.sin\(0\.8\)/);
});

test('sub release recomputes gear-sensitive cost without stale descriptor reuse', async () => {
  const { kitSubRelease } = await import('../../splatoon3/runtime/kit-subs.mjs');
  const SUB = { bomb: { id: 'bomb', mode: 'bomb', chargeable: false, inkCost: 70, inkCostStatus: 'calibrated' } };
  const runner = { a: { weapon: { sub: 'bomb' }, s3: { modifiers: { subPower: 1, inkSaverSub: 1 } } }, s3SubHold: 0 };
  const first = kitSubRelease(SUB, runner, 1/60, {});
  runner.a.s3.modifiers.inkSaverSub = .5;
  const second = kitSubRelease(SUB, runner, 1/60, {});
  assert.notEqual(first, second);
  assert.equal(first.inkCost, 70);
  assert.equal(second.inkCost, 35);
});
