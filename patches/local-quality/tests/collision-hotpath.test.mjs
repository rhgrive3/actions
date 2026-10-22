import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { adaptCollisionHotpath } from '../collision-hotpath-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = path => fs.readFileSync(new URL('../../../inkwave-public/' + path, import.meta.url), 'utf8');
const LEVEL = read('src/world/level.js'), PHYSICS = read('src/game/physics.js');
const once = (s, a, b, label) => {
  assert.equal(s.split(a).length - 1, 1, 'unique protected anchor: ' + label);
  return s.replace(a, b);
};
const OPT_LEVEL = adaptCollisionHotpath('src/world/level.js', LEVEL, once);
const OPT_PHYSICS = adaptCollisionHotpath('src/game/physics.js', PHYSICS, once);

// Minimal vector with the same Number arithmetic/order as THREE.Vector3 for
// native Level/Physics method execution. The production module itself is parsed
// separately. A counting vector exposes skipped OBB work without FPS guesses.
let dotCalls = 0;
class V {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { return this.set(v.x, v.y, v.z); }
  clone() { return new V(this.x, this.y, this.z); }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  dot(v) { dotCalls++; return this.x * v.x + this.y * v.y + this.z * v.z; }
  addScaledVector(v, k) { this.x += v.x * k; this.y += v.y * k; this.z += v.z * k; return this; }
  multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }
}
const THREE = { Vector3: V };
const load = (source, name) => {
  const plain = source.replace(/^import .*;\s*$/gm, '').replace(/\bexport /g, '');
  return new Function('THREE', 'PATTERN', plain + '\nreturn ' + name + ';')(THREE, { plain: 0 });
};
const Native = { Level: load(LEVEL, 'Level'), Physics: load(PHYSICS, 'Physics'), Hit: load(PHYSICS, 'Hit') };
const Faster = { Level: load(OPT_LEVEL, 'Level'), Physics: load(OPT_PHYSICS, 'Physics'), Hit: load(OPT_PHYSICS, 'Hit') };
function random(seed = 12) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const rng = random(0x9876cafe);
const spec = Array.from({ length: 850 }, (_, i) => {
  const x = -62 + rng() * 124, y = -8 + rng() * 45, z = -62 + rng() * 124;
  const sx = .15 + rng() * 4, sy = .1 + rng() * 3.5, sz = .2 + rng() * 3;
  const yaw = (rng() - .5) * Math.PI * .9, tilt = (rng() - .5) * .5;
  const ca = Math.cos(yaw), sa = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  const axes = [new V(ca, 0, sa), new V(-sa * st, ct, ca * st), new V(-sa * ct, -st, ca * ct)];
  const min = new V(), max = new V();
  for (const [k, axis] of axes.entries()) {
    const extent = [sx, sy, sz][k];
    for (const key of ['x', 'y', 'z']) {
      min[key] -= Math.abs(axis[key]) * extent;
      max[key] += Math.abs(axis[key]) * extent;
    }
  }
  min.x += x; min.y += y; min.z += z;
  max.x += x; max.y += y; max.z += z;
  return { id: i, solid: i % 29 !== 0, grate: i % 17 === 0, center: new V(x, y, z),
    half: new V(sx, sy, sz), axes, aabbMin: min, aabbMax: max, faces: Array(6).fill(i) };
});
function make({ Level, Physics, Hit }) {
  const level = Object.create(Level.prototype);
  level.bounds = { minX: -64, maxX: 64, minZ: -64, maxZ: 64 };
  level.blocks = spec.map(b => ({ ...b })); level.faces = spec.map(b => ({
    origin: b.center, u: b.axes[0], v: b.axes[2],
  }));
  level._stamp = 1; level._buildHash();
  return { level, physics: new Physics(level), hit: new Hit() };
}
const sameHit = (a, b) => {
  assert.equal(b.hit, a.hit);
  assert.equal(b.dist, a.dist);
  assert.equal(b.block, a.block);
  assert.equal(b.face, a.face);
  if (a.hit) {
    assert.deepEqual([b.point.x, b.point.y, b.point.z], [a.point.x, a.point.y, a.point.z]);
    assert.deepEqual([b.normal.x, b.normal.y, b.normal.z], [a.normal.x, a.normal.y, a.normal.z]);
    assert.equal(b.u, a.u); assert.equal(b.v, a.v);
  }
};
test('protected source adapters compose into production and are build-only', () => {
  assert.equal(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/collision-hotpath-adapter.mjs'), true);
  assert.match(OPT_LEVEL, /x0 === x1 && z0 === z1/);
  assert.match(OPT_LEVEL, /this\.blockStamp\[ids\[i\]\] = st/);
  assert.match(OPT_PHYSICS, /b\.aabbMin\?\.y > yHi/);
  for (const [path, raw] of [['src/world/level.js', LEVEL], ['src/game/physics.js', PHYSICS]]) {
    const composed = adaptBuildSource(path, raw);
    assert.doesNotThrow(() => new vm.SourceTextModule(composed), path);
    assert.match(composed, path.includes('level.js') ? /x0 === x1 && z0 === z1/ : /aabbMax\?\.y < yLo/);
    assert.equal(composed.split('b.aabbMin?.y > yHi').length - 1, path.includes('physics') ? 1 : 0);
  }
  assert.equal(adaptCollisionHotpath('src/fx/fx.js', PHYSICS, once), PHYSICS);
  assert.throws(() => adaptCollisionHotpath('src/world/level.js', OPT_LEVEL, once));
  assert.throws(() => adaptCollisionHotpath('src/game/physics.js', OPT_PHYSICS, once));
});
test('single-cell fast path preserves point hits, multi-cell boundaries, stamps and candidate order', () => {
  const n = make(Native), f = make(Faster), rand = random(453);
  const points = Array.from({ length: 40000 }, (_, i) => ({
    x: -68 + rand() * 136, z: -68 + rand() * 136, y: -10 + rand() * 49,
    pad: i % 13 === 0 ? .25 : 0, exclude: i % 59 === 0 ? i % spec.length : -1,
  }));
  // Explicitly test 0.01m neighborhoods of hash cell boundaries.
  for (let k = -60; k <= 60; k += 4) for (const shift of [-.011, -.01, -.000001, 0, .000001, .01, .011]) {
    points.push({ x: k + shift, y: 0.05, z: k - shift, pad: 0, exclude: -1 });
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i], a = n.level.pointInside(p, p.pad, p.exclude), b = f.level.pointInside(p, p.pad, p.exclude);
    assert.equal(b, a, 'point ' + i);
  }
  assert.equal(f.level._stamp, n.level._stamp, 'stamp increments identical for every probe');
  assert.deepEqual(f.level.blockStamp, n.level.blockStamp, 'blockStamp updated for all candidates');
  for (let i = 0; i < 2000; i++) {
    const x = -68 + rand() * 136, z = -68 + rand() * 136;
    const size = i % 4 === 0 ? 8 : .05;
    assert.deepEqual(f.level.queryBlocks(x - size, z - size, x + size, z + size, []),
      n.level.queryBlocks(x - size, z - size, x + size, z + size, []));
  }
});
test('height-pruned native raycast preserves hit, distance, face, normal, uv and all boundary states', () => {
  const n = make(Native), f = make(Faster), rand = random(27182);
  const rays = Array.from({ length: 18000 }, (_, i) => {
    const origin = new V(-62 + rand() * 124, -10 + rand() * 49, -62 + rand() * 124);
    let dx = rand() * 2 - 1, dy = i % 5 === 0 ? (rand() - .5) * .25 : rand() * 2 - 1, dz = rand() * 2 - 1;
    const len = Math.hypot(dx, dy, dz) || 1;
    return { origin, dir: new V(dx / len, dy / len, dz / len), max: 1 + rand() * 68, skip: i % 7 === 0 };
  });
  // Negative/null-style and perfectly horizontal / vertical boundary probes.
  for (const x of [-64, -60, 0, 60, 64]) for (const y of [-8, 0, 1, 12, 37]) {
    rays.push({ origin: new V(x, y, 0), dir: new V(1, 0, 0), max: 75, skip: false });
    rays.push({ origin: new V(x, y, 0), dir: new V(0, 1, 0), max: 50, skip: true });
    rays.push({ origin: new V(x, y, 0), dir: new V(0, -1, 0), max: 50, skip: false });
  }
  for (let i = 0; i < rays.length; i++) {
    const r = rays[i];
    n.physics.raycast(r.origin, r.dir, r.max, n.hit, r.skip);
    f.physics.raycast(r.origin, r.dir, r.max, f.hit, r.skip);
    sameHit(n.hit, f.hit);
  }
  // AABB guard must be inert for synthetic fixtures with no bounds.
  const b = spec[1], copy = { ...b, aabbMin: undefined, aabbMax: undefined };
  for (const pair of [n, f]) {
    pair.level.blocks[1] = copy;
    pair.physics.raycast(new V(b.center.x - 5, b.center.y, b.center.z), new V(1, 0, 0), 10, pair.hit, false);
  }
  sameHit(n.hit, f.hit);
});
test('raycast height rejection avoids OBB dot-products without dropping visible shots', () => {
  const n = make(Native), f = make(Faster), rand = random(9738);
  const rays = Array.from({ length: 3000 }, () => ({
    origin: new V(-40 + rand() * 80, 1.3, -40 + rand() * 80),
    dir: new V(0.83, .02, .557).multiplyScalar(1 / Math.hypot(.83, .02, .557)), max: 35,
  }));
  dotCalls = 0;
  let hits = 0;
  for (const r of rays) hits += n.physics.raycast(r.origin, r.dir, r.max, n.hit).hit ? 1 : 0;
  const nativeDots = dotCalls;
  dotCalls = 0;
  let changedHits = 0;
  for (const r of rays) changedHits += f.physics.raycast(r.origin, r.dir, r.max, f.hit).hit ? 1 : 0;
  const prunedDots = dotCalls;
  assert.equal(changedHits, hits);
  assert.ok(prunedDots < nativeDots * .6, 'actual expensive OBB dot operations: ' + nativeDots + ' -> ' + prunedDots);
});

const groundOut=()=>({hit:false,y:0,normal:new V(0,1,0),block:-1,face:-1,u:0,v:0,center:false,grate:false});
function sameGround(a,b,label){for(const key of ['hit','y','block','face','u','v','center','grate'])assert.equal(b[key],a[key],label+' '+key);assert.deepEqual([b.normal.x,b.normal.y,b.normal.z],[a.normal.x,a.normal.y,a.normal.z],label+' normal');}
test('batched ground columns preserve all fields and exact ray ordering on seams, slopes, ledges and grates',()=>{
 const n=make(Native),f=make(Faster),rand=random(352432),a=groundOut(),b=groundOut();let originalQueries=0,optimizedQueries=0,batches=0;
 for(const [fixture,count]of [[n,()=>originalQueries++],[f,()=>optimizedQueries++]]){const next=fixture.level._nextQueryStamp;fixture.level._nextQueryStamp=function(){count();return next.call(this);};}
 const batch=f.level.queryGroundColumns;f.level.queryGroundColumns=function(...args){batches++;return batch.apply(this,args);};
 for(let i=0;i<20000;i++){
  const x=i%3===0?-64+(i%33)*4:rand()*140-70,z=i%5===0?-64+(i%33)*4:rand()*140-70,y=rand()*45-8,foot=i%11===0?-rand()*2:rand()*2;
  const up=.1+rand()*4,down=.1+rand()*6,skip=i%7===0,step=rand()*.5;
  n.physics.groundProbe(x,y,z,up,down,foot,a,skip,step);f.physics.groundProbe(x,y,z,up,down,foot,b,skip,step);sameGround(a,b,'probe'+i);
 }
 assert.equal(originalQueries,180000);assert.equal(optimizedQueries,0);assert.equal(batches,20000);assert(f.physics._groundColumns.every(v=>v===null));
 // Equal-height, duplicated support surfaces deliberately choose the last
 // block in the original bucket, and grates still participate by caller flag.
 for(const pair of [n,f]){pair.level.blocks=[...spec.slice(0,2)].map((_,id)=>({id,solid:true,grate:id===1,center:new V(0,0,0),half:new V(3,1,3),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],aabbMin:new V(-3,-1,-3),aabbMax:new V(3,1,3),faces:Array(6).fill(-1)}));pair.level._buildHash();}
 for(const skip of [false,true]){n.physics.groundProbe(0,1,0,.5,2,.8,a,skip);f.physics.groundProbe(0,1,0,.5,2,.8,b,skip);sameGround(a,b,'tie');assert.equal(b.block,skip?0:1);}
 // No cached column survives a moving support/hash rebuild.
 for(const pair of [n,f]){for(const block of pair.level.blocks){block.center.y=-2;block.aabbMin.y=-3;block.aabbMax.y=-1;}pair.level._buildHash();}
 n.physics.groundProbe(0,1,0,.5,4,.8,a);f.physics.groundProbe(0,1,0,.5,4,.8,b);sameGround(a,b,'moved');assert.equal(b.y,-1);
});
test('overridden raycast/query and subclass/native ownership retain ordinary nine calls',()=>{
 for(const kind of ['raycast','queryBlocks','subclass']){
  const f=make(Faster);let calls=0;
  if(kind==='raycast'){const original=f.physics.raycast;f.physics.raycast=function(...args){calls++;return original.apply(this,args);};}
  if(kind==='queryBlocks'){const original=f.level.queryBlocks;f.level.queryBlocks=function(...args){calls++;return original.apply(this,args);};}
  if(kind==='subclass'){class Other extends Faster.Level{};Object.setPrototypeOf(f.level,Other.prototype);const next=f.level._nextQueryStamp;f.level._nextQueryStamp=function(){calls++;return next.call(this);};}
  f.physics.groundProbe(0,1,0,1,3,.5,groundOut());assert.equal(calls,9,kind);
 }
});
