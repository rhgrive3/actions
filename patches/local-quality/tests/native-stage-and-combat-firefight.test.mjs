import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { compactModuleStrings } from '../../../scripts/lib/inkwave-source-compaction.mjs';
import { sphereTriangleEntry } from '../../native-stages/runtime/sphere-triangle-entry.mjs';
import { advanceSplashDrops, spawnSplashDrop } from '../../splatoon3/runtime/blaster-flight-paint.mjs';
import { globGrazePaint } from '../../splatoon3/runtime/weapons-fidelity.mjs';
import { installIssue264PaintOwnership } from '../../splatoon3/runtime/paint-ownership.mjs';
import { fixture as chargerFixture } from '../../splatoon3/tests/source-fixture.mjs';

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
  const NativeLevel = new Function('THREE', 'Level', nativeLevelSrc
    .replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nreturn NativeLevel;')(THREE, class {});

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
  const triangle = tw.triangle.bind(tw);
  const subject = Object.assign(Object.create(NativeLevel.prototype), { triangleWorld: tw });
  tw.triangle = id => { triCallsOpt++; return triangle(id); };
  const checkRef = (p, tolerance = 0.002) => {
    const rel = p.clone().sub(face.origin);
    const a = rel.dot(face.u), b = rel.dot(face.v);
    if (a < -tolerance || b < -tolerance || a > face.su + tolerance || b > face.sv + tolerance) return false;
    const projected = p.clone().addScaledVector(face.n, -rel.dot(face.n));
    for (const id of face.triangles) {
      triCallsRef++;
      if (triangle(id).containsPoint(projected)) return true;
    }
    return false;
  };

  // Exercise the actual current method, including the later scalar projection
  // and barycentric implementation, against Three's independent triangle API.
  const checkOpt = (p, tolerance = 0.002) => subject.containsOnFace(face, p, tolerance);

  const samples = [];
  for (let i = 0; i < 2000; i++) {
    const p = new THREE.Vector3(rnd() * 26 - 1, (rnd() - 0.5) * 0.2, rnd() * 26 - 1);
    samples.push(p);
    assert.equal(checkOpt(p), checkRef(p), `mismatch at sample ${i}`);
  }
  for (const id of face.triangles) {
    const t = triangle(id), vertices = [t.a.clone(), t.b.clone(), t.c.clone()];
    const boundaries = vertices.concat(vertices.map((p,i) => p.clone().lerp(vertices[(i+1)%3],.5)));
    for (const p of boundaries) assert.equal(checkOpt(p),checkRef(p),'exact triangle vertex/edge boundary');
  }
  assert.ok(triCallsOpt < triCallsRef * 0.1, `expected >90% reduction in triangle containsPoint calls, got ${triCallsOpt} vs ${triCallsRef}`);
  // Assert that a broken production acceptance is rejected by the independent Three oracle.
  const methodSource = NativeLevel.prototype.containsOnFace.toString();
  assert.equal(methodSource.split('return true;').length, 2, 'one positive production acceptance');
  const tampered = new Function('return ({' + methodSource.replace('return true;', 'return false;') + '}).containsOnFace;')();
  assert.throws(() => {
    for (const p of samples) assert.equal(tampered.call(subject, face, p, 0.002), checkRef(p), 'tampered production triangle acceptance');
  }, /tampered production triangle acceptance/);
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
  tw.resolveCapsule(new THREE.Vector3(0, 3, 0), 1.45, 0.38, false);
  assert.deepEqual(nRef.toArray(), originalNormal, 'a later miss cannot clear a retained result');
});

test('NAT-03 through NAT-06 native runtime modules use preallocated scratch vectors and closure-free edge helpers', () => {
  assert.match(readRepo('patches/native-stages/runtime/native-drop.mjs'), /function findDropEdge\(from,toId\)/);
  assert.match(readRepo('patches/native-stages/runtime/native-jump-input.mjs'), /const _jumpProbe=\{pos:null,grounded:true,form:'kid'\},_jumpDest=\{goal:null,block:-1,triangle:-1\};/);
  assert.match(readRepo('patches/native-stages/runtime/native-ranked-boarding.mjs'), /const _boardDir=new THREE\.Vector3\(\),_boardPoint=new THREE\.Vector3\(\)/);
  assert.match(readRepo('patches/native-stages/runtime/native-bot-support.mjs'), /function hasJumpEdgeTo\(node,toId\)/);
});

test('CMB-01 through CMB-06 firefight paint, splash drop, graze, and native scans preserve exact combat behavior', () => {
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

  // CMB-04 & CMB-06: retain native scans; executable parity and unsafe negative
  // controls live in combat-native-scan-parity.test.mjs.
  const composedFlight = adaptBuildSource('src/game/inkFlightRuntime.js', readPublic('src/game/inkFlightRuntime.js'));
  assert.doesNotMatch(composedFlight, /segBoundsReady/);
  assert.match(composedFlight, /const bodyRadius = hurtboxRadius\(actor, PLAYER\)/);
  const composedBots = adaptBuildSource('src/game/bots.js', readPublic('src/game/bots.js'));
  assert.match(composedBots, /const d = e\.pos\.distanceTo\(a\.pos\);/);
  assert.doesNotMatch(composedBots, /const awSq = aw \* aw/);

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

test('CMB-08 through CMB-10 ranked combat, catalogue cover, and exact Charger scan with owned scratch', () => {
  const rankedCombat = readRepo('patches/splatoon3/runtime/ranked/combat.mjs');
  assert.match(rankedCombat, /const scratch = _blastFrames\[depth\]/);
  assert.match(rankedCombat, /Math\.sqrt\(d2\) <= radius/);
  assert.match(rankedCombat, /Math\.sqrt\(body\.distanceToSquared\(p\)\) <= radius/);

  const catalog = readRepo('patches/splatoon3/runtime/main-weapon-catalog.mjs');
  assert.match(catalog, /const reach=bodyRadius\+\(pr0>radius\?pr0:radius\)\+1e-4;/);

  const chargerFlight = readRepo('patches/splatoon3/runtime/weapons-charger-flight.mjs');
  assert.match(chargerFlight, /const localShotScratch = \[\]; let localShotDepth = 0;/);
  // Do not reintroduce the rejected broadphase: it dropped candidate scans.
  // Preserve the exact swept capsule for every actor and reuse only the
  // existing depth-guarded local shot scratch.
  assert.doesNotMatch(chargerFlight, /const reach=bodyRadius\+\(collision\.InitRadiusForPlayer>collision\.EndRadiusForPlayer/);
  assert.match(chargerFlight, /const t=capsuleEntry\(job\.prev,end,job\.base,hurtboxRadius\(actor,PLAYER\),hurtboxHeight\(actor,PLAYER\),/);
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
  const sparse = { ...SUB, sparse: { id: 'sparse', mode: 'bomb', chargeable: false } };
  runner.a.weapon.sub = 'sparse';
  assert.equal(kitSubRelease(sparse, runner, 1/60, {}).inkCost, SUB.bomb.inkCost, 'missing authored cost retains native bomb fallback');
});

const CHARGER_REL = 'patches/splatoon3/runtime/weapons-charger-flight.mjs';
const chargerCanonical = readRepo(CHARGER_REL);
const builtRoot = process.env.INKWAVE_BUILT_SITE && path.resolve(process.env.INKWAVE_BUILT_SITE);
const chargerProfile = JSON.parse(builtRoot
  ? fs.readFileSync(path.join(builtRoot, 'patches/splatoon3/profile.json'), 'utf8')
  : readRepo('patches/splatoon3/profile.json'));
let chargerCompiler;
async function chargerSubject(change = source => source) {
  let source = change(chargerCanonical), expected = chargerCanonical;
  if (builtRoot) {
    chargerCompiler ??= import('esbuild').then(({ transformSync }) => text => compactModuleStrings(
      transformSync(adaptBuildSource(CHARGER_REL, text), {
        loader: 'js', format: 'esm', minify: true, charset: 'utf8', legalComments: 'inline', sourcefile: CHARGER_REL,
      }).code).code);
    const compile = await chargerCompiler, actual = fs.readFileSync(path.join(builtRoot, CHARGER_REL), 'utf8');
    assert.equal(compile(chargerCanonical), actual, 'counterfactual starts from exact actual emitted Charger bytes');
    expected = actual;
    source = source === chargerCanonical ? actual : compile(source);
  }
  // The existing VM loader resolves the browser's bare-three import map and
  // preserves every other actual source/emitted module. Only this subject may
  // change in a control; neither gameplay nor module resolution is replaced.
  let observed = 0;
  const transform = (rel, text) => {
    if (rel !== CHARGER_REL) return text;
    observed++;
    assert.equal(text, expected, 'subject is the selected actual source/emitted module');
    return source;
  };
  const f = await chargerFixture({ productionComposition: true,
    extraExports: `export { installChargerFlight } from './${CHARGER_REL}';`,
    adaptRuntime: transform, adaptEmittedRuntime: transform });
  assert.equal(observed, 1, 'real installer subject is consumed exactly once');
  return f;
}

function chargerRig(subject) {
  const install = subject.installChargerFlight;
  let allocations = 0;
  class Vector3 extends THREE.Vector3 { constructor(...args) { super(...args); allocations++; } }
  class Hit {}
  class Projectiles {
    constructor() { this.beams = []; this.calls = []; }
    // These methods are captured by the real installer BEFORE instrumentation
    // hooks run. Replacing them afterward would disable the native fast path.
    _muzzle(actor, out) {
      this.calls.push({ kind: 'muzzle', actor, out, before: out.toArray() });
      out.copy(actor.muzzle); this.onMuzzle?.(actor, out); return out;
    }
    _aimFrom(actor, origin, out) {
      this.calls.push({ kind: 'aim', actor, origin, out, before: out.toArray() });
      out.copy(actor.aimDir); this.onAim?.(actor, origin, out); return out;
    }
    _ghostBeam() { this.beams.push({ mesh: { scale: {}, material: { uniforms: { uLen: {} } } } }); }
    ghostFire() {}
    update() {}
    clear() {}
  }
  const events = [], actors = new Set(), G = { physics: { raycast(_from, _dir, _length, hit) { hit.hit = false; return hit; }, los: () => true } };
  // The production composition borrows vectors at emit() and snapshots them
  // inside the actual dispatcher. A raw collector would bypass that contract.
  subject.on('weapon:fire', event => { if (actors.has(event.actor)) events.push(event); });
  const weapon = { id: 'charger', kind: 'charger', ...chargerProfile.weapons.charger };
  const api = { Projectiles, THREE: { ...THREE, Vector3 }, Hit, G, PLAYER: chargerProfile.player,
    WEAPONS: { charger: weapon }, emit: subject.emit };
  const completion = chargerProfile.weaponsFidelityCompletion;
  install(api, completion);
  const system = new Projectiles();
  const actor = (x = 3) => { const a = { pos: new THREE.Vector3(), muzzle: new THREE.Vector3(x, 1.05, 4),
    aimDir: new THREE.Vector3(0, 0, 1), form: 'kid', team: 0, alive: true, isLocal: true,
    weaponRunner: { chargeT: 1 }, character: {}, addTurf() {} }; actors.add(a); return a; };
  return { system, actor, events, weapon, allocations: () => allocations,
    fire(a) { system.fireCharger(a, weapon, 1); },
    reinstall() { install(api, completion); } };
}
const callFor = (calls, actor, kind) => calls.find(call => call.actor === actor && call.kind === kind);
const xyz = vector => [vector.x, vector.y, vector.z];
const shotGeometry = (job, event, muzzle, aim) => {
  assert.deepEqual(xyz(job.origin), muzzle, 'flight retains its own muzzle');
  assert.deepEqual(xyz(event.muzzle), muzzle, 'event retains its own muzzle');
  assert.deepEqual(xyz(job.dir), aim, 'flight retains its own aim');
  assert.deepEqual(xyz(event.dir), aim, 'event retains its own aim');
};
function warmCharger(install) {
  const h = chargerRig(install), a = h.actor(), before = h.allocations();
  h.fire(a);
  const cold = h.allocations() - before, first = h.system.calls.slice(), firstJob = h.system._fidelityChargerFlights[0];
  const oldMuzzle = a.muzzle.toArray(), oldAim = a.aimDir.toArray();
  a.muzzle.set(9, 2, 7); a.aimDir.set(1, 0, 0);
  first[0].out.set(100, 100, 100); first[1].out.set(200, 200, 200);
  const at = h.allocations(); h.fire(a);
  const warm = h.allocations() - at, second = h.system.calls.slice(2);
  assert.equal(second[0].out, first[0].out, 'warm native local muzzle reuses its scratch');
  assert.equal(second[1].out, first[1].out, 'warm native local aim reuses its scratch');
  assert.deepEqual(second.map(call => call.before), [[0, 0, 0], [0, 0, 0]], 'each output is reset before native callbacks');
  assert.equal(cold - warm, 3, 'warming saves the three scratch constructors; flight/event snapshots still allocate');
  shotGeometry(firstJob, h.events[0], oldMuzzle, oldAim);
  shotGeometry(h.system._fidelityChargerFlights[1], h.events[1], a.muzzle.toArray(), a.aimDir.toArray());
  assert.notEqual(firstJob.origin, first[0].out, 'published flight cannot retain mutable scratch');
  assert.notEqual(h.events[0].dir, first[1].out, 'published event cannot retain mutable scratch');
}
function nestedCharger(install) {
  for (const trigger of ['onMuzzle', 'onAim']) {
    const h = chargerRig(install), outer = h.actor(3), inner = h.actor(8);
    inner.aimDir.set(1, 0, 0);
    h.system[trigger] = actor => { if (actor === outer) h.fire(inner); };
    let previous;
    for (let cycle = 0; cycle < 2; cycle++) {
      const at = h.system.calls.length; h.fire(outer);
      const calls = h.system.calls.slice(at), slots = [];
      for (const kind of ['muzzle', 'aim']) {
        const a = callFor(calls, outer, kind), b = callFor(calls, inner, kind);
        assert.notEqual(a.out, b.out, 'nested native shots require different live depth scratch');
        assert.deepEqual(a.before, [0, 0, 0]); assert.deepEqual(b.before, [0, 0, 0]);
        slots.push(a.out, b.out);
      }
      if (previous) slots.forEach((slot, i) => assert.equal(slot, previous[i], 'each warmed depth reuses its own slot'));
      previous = slots;
      const jobs = h.system._fidelityChargerFlights.slice(cycle * 2);
      shotGeometry(jobs[0], h.events[cycle * 2], inner.muzzle.toArray(), inner.aimDir.toArray());
      shotGeometry(jobs[1], h.events[cycle * 2 + 1], outer.muzzle.toArray(), outer.aimDir.toArray());
    }
  }
}
function installedCharger(install) {
  const left = chargerRig(install), right = chargerRig(install), a = left.actor(3), b = right.actor(8);
  const fire = left.system.fireCharger; left.reinstall();
  assert.equal(left.system.fireCharger, fire, 'duplicate installation is idempotent');
  left.system.onAim = () => right.fire(b); left.fire(a);
  for (const kind of ['muzzle', 'aim']) assert.notEqual(
    callFor(left.system.calls, a, kind).out, callFor(right.system.calls, b, kind).out,
    'different installations cannot share live scratch');
  shotGeometry(left.system._fidelityChargerFlights[0], left.events[0], a.muzzle.toArray(), a.aimDir.toArray());
  shotGeometry(right.system._fidelityChargerFlights[0], right.events[0], b.muzzle.toArray(), b.aimDir.toArray());
}
function callbackCharger(install) {
  for (const mode of ['remote', 'muzzle', 'aim']) {
    const h = chargerRig(install), a = h.actor(); h.fire(a);
    const native = h.system.calls.slice(), owned = new THREE.Vector3(2, 0, 0), custom = [];
    if (mode === 'remote') a.isLocal = false;
    else if (mode === 'muzzle') {
      a.weaponRunner.s3KeepMuzzleFiring = true;
      const off = new THREE.Object3D(); off.position.set(0, 1.05, 0); off.updateMatrixWorld(true);
      a.character.weapon = { off };
      h.system._muzzle = (_actor, out) => { custom.push(out); return owned; };
    } else h.system._aimFrom = (_actor, _origin, out) => { custom.push(out); return owned; };
    const borrowed = [];
    for (let i = 0; i < 2; i++) {
      const at = h.system.calls.length; h.fire(a);
      const calls = h.system.calls.slice(at);
      const muzzle = mode === 'muzzle' ? custom.at(-1) : callFor(calls, a, 'muzzle').out;
      const aim = mode === 'aim' ? custom.at(-1) : callFor(calls, a, 'aim').out;
      assert.notEqual(muzzle, native[0].out, 'remote/custom callbacks cannot borrow native muzzle scratch');
      assert.notEqual(aim, native[1].out, 'remote/custom callbacks cannot borrow native aim scratch');
      if (i) { assert.notEqual(muzzle, borrowed[0]); assert.notEqual(aim, borrowed[1]); }
      borrowed.splice(0, borrowed.length, muzzle, aim);
      assert.deepEqual(owned.toArray(), [2, 0, 0], 'custom callback retains its returned vector, including kept-origin retargeting');
      const job = h.system._fidelityChargerFlights.at(-1), event = h.events.at(-1);
      if (mode === 'muzzle') {
        assert.ok(job.origin.x < 0 && job.origin.z > .8, 'kept origin uses the actual calibrated gun transform');
        shotGeometry(job, event, job.origin.toArray(), [0, 0, 1]);
      } else shotGeometry(job, event, a.muzzle.toArray(), mode === 'aim' ? [1, 0, 0] : [0, 0, 1]);
    }
  }
}
test('CMB-10 native local Charger warming reuses reset scratch while flight/event geometry stays independent', async () => {
  warmCharger(await chargerSubject());
});
test('CMB-10 nested native muzzle/aim callbacks keep distinct reusable depth leases', async () => {
  nestedCharger(await chargerSubject());
});
test('CMB-10 a throwing native callback restores the scratch depth before the next shot', async () => {
  const install = await chargerSubject();
  for (const trigger of ['onMuzzle', 'onAim']) {
    const h = chargerRig(install), a = h.actor(), error = new Error('native callback failure');
    h.system[trigger] = () => { throw error; };
    assert.throws(() => h.fire(a), e => e === error);
    assert.equal(h.system._fidelityChargerFlights, undefined); assert.equal(h.events.length, 0);
    const first = h.system.calls[0].out; h.system[trigger] = null; h.fire(a);
    assert.equal(h.system.calls.findLast(call => call.kind === 'muzzle').out, first, 'exception releases depth zero');
    shotGeometry(h.system._fidelityChargerFlights[0], h.events[0], a.muzzle.toArray(), a.aimDir.toArray());
  }
});
test('CMB-10 independent Charger installations own their scratch and duplicate install is inert', async () => {
  installedCharger(await chargerSubject());
});
test('CMB-10 remote and each custom callback retain independent outputs and returned-vector ownership', async () => {
  callbackCharger(await chargerSubject());
});
function changeOnce(source, before, after) {
  assert.equal(source.split(before).length, 2, 'counterfactual changes exactly one current subject expression');
  return source.replace(before, after);
}
test('CMB-10 ownership and warming oracles reject controlled subject regressions', async t => {
  const cases = [
    ['always-new output vectors', source => changeOnce(source,
      'const scratch = reuse ? (localShotScratch[depth] || (localShotScratch[depth] = { muzzle: new THREE.Vector3(), aim: new THREE.Vector3(), kept: new THREE.Vector3() })) : null;',
      'const scratch = null;'), warmCharger, /warm native local muzzle reuses its scratch/],
    ['one slot for all nested depths', source => {
      assert.equal(source.split('localShotScratch[depth]').length, 3);
      return source.replaceAll('localShotScratch[depth]', 'localShotScratch[0]');
    }, nestedCharger, /nested native shots require different live depth scratch/],
    ['one module-global pool for independent installs', source => changeOnce(changeOnce(source,
      '  const localShotScratch = []; let localShotDepth = 0;', '  let localShotDepth = 0;'),
      'export function installChargerFlight(api,completion) {',
      'const localShotScratch = [];\nexport function installChargerFlight(api,completion) {'), installedCharger,
    /different installations cannot share live scratch/],
    ['unconditional reuse for remote/custom callbacks', source => changeOnce(source,
      'reuse = actor.isLocal && this._muzzle === nativeMuzzle && this._aimFrom === nativeAimFrom', 'reuse = true'),
    callbackCharger, /remote\/custom callbacks cannot borrow native muzzle scratch/],
  ];
  for (const [name, change, oracle, expected] of cases) await t.test(name, async () => {
    const install = await chargerSubject(change);
    assert.throws(() => oracle(install), expected, 'the same positive oracle must reject the isolated regression');
  });
});
