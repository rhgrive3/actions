import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { adaptPaintHotpath } from '../paint-hotpath-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const SOURCE = path.join(ROOT, 'inkwave-public/src/world/paint.js');
const ORIGINAL = fs.readFileSync(SOURCE, 'utf8');
const once = (code, old, next, reason) => {
  assert.equal(code.split(old).length, 2, reason + ': one protected source anchor');
  return code.replace(old, next);
};
const FIXED = adaptPaintHotpath('src/world/paint.js', ORIGINAL, once);

const indicesFromProduction = code => {
  const begin = code.indexOf('    const idx = new Uint32Array(MAX_QUADS * 6);');
  const end = code.indexOf('    const mk = ', begin);
  assert.ok(begin >= 0 && end > begin, 'native _initGPU index initialization');
  return new Function('MAX_QUADS', code.slice(begin,end) + '\nreturn idx;')(6000);
};

test('one-time 6000-quad index buffer is bit-identical without 6000 short-lived JS Arrays', () => {
  const old = indicesFromProduction(ORIGINAL), fresh = indicesFromProduction(FIXED);
  assert.equal(old.length, 36000);
  assert.deepEqual(Array.from(fresh), Array.from(old));
  assert.equal((ORIGINAL.match(/idx\.set\(\[/g)||[]).length, 1);
  assert.equal((FIXED.match(/idx\.set\(\[/g)||[]).length, 0);
  for(let i=0;i<6000;i+=317) {
    assert.deepEqual(Array.from(fresh.subarray(i*6,i*6+6)),[i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3]);
  }
});
test('static five-attribute GPU update list is the exact original order',()=>{
  const original=ORIGINAL.match(/for \(const name of (\['aPos', 'aLocal', 'aSplat', 'aStretch', 'aGrow'\])\)/);
  const fixed=FIXED.match(/PAINT_GPU_ATTRIBUTE_NAMES = Object.freeze\((\['aPos', 'aLocal', 'aSplat', 'aStretch', 'aGrow'\])\)/);
  assert.ok(original&&fixed);
  assert.equal(original[1],fixed[1]);
  assert.match(FIXED,/for \(const name of PAINT_GPU_ATTRIBUTE_NAMES\)/);
});
async function loadNative(code) {
  const ctx=vm.createContext({console,performance,URL,Math,Float32Array,Uint8Array,Uint32Array});
  const modules=new Map();
  const moduleFor=id=>{
    if(modules.has(id))return modules.get(id);
    const source=id===SOURCE?code:fs.readFileSync(id,'utf8');
    const mod=new vm.SourceTextModule(source,{context:ctx,identifier:id,initializeImportMeta(meta){meta.url=pathToFileURL(id).href;}});
    modules.set(id,mod);return mod;
  };
  const entry=new vm.SourceTextModule(
    "export { PaintSystem } from './inkwave-public/src/world/paint.js'; export * as THREE from 'three';",
    {context:ctx,identifier:path.join(ROOT,'paint-hotpath-fixture.mjs')});
  await entry.link((specifier,ref)=>specifier==='three'
    ?moduleFor(path.join(ROOT,'inkwave-public/vendor/three/build/three.module.js'))
    :moduleFor(path.resolve(path.dirname(ref.identifier),specifier)));
  await entry.evaluate();
  vm.runInContext("globalThis.__checks=0; const priorInt=Number.isInteger; Number.isInteger=function(v){globalThis.__checks++;return priorInt(v);}",ctx);
  return {exports:entry.namespace,ctx};
}
function fakePaint(ns,blocks=32) {
  const V3=ns.THREE.Vector3;
  const faces=Array.from({length:6},(_,id)=>({id,atlas:{},wall:false,
    origin:new V3(0,0,0),n:new V3(0,1,0),u:new V3(1,0,0),v:new V3(0,0,1),su:50,sv:50}));
  const bb={aabbMin:new V3(-5,-5,-5),aabbMax:new V3(50,50,50),faces:[0,1,2,3,4,5]};
  const ids=Array.from({length:blocks},(_,i)=>i);
  const accepted=[];
  const paint={level:{faces,blocks:Array.from({length:blocks},()=>bb),queryBlocks:()=>ids},
    _kind:()=>0,_cpuSplat:(face)=>{accepted.push(face.id);return 1;},
    _rippledNear:()=>true,_emitGrowth:()=>{},growing:[],_wetUntil:0,clock:0,
    ripple(){throw Error('unexpected ripple');}};
  return {paint,accepted,V3};
}
test('native splat keeps identical face selection, claimed turf and spread-queue across valid faces',async()=>{
  const [before,after]=await Promise.all([loadNative(ORIGINAL),loadNative(FIXED)]);
  for(const f of [undefined,0,1,3,5,-1,1.5,'1',null,999]){
    for(const cosmetic of [false,true]){
      const rows=[];
      for(const candidate of [before,after]){
        const h=fakePaint(candidate.exports);
        candidate.ctx.__checks=0;
        const opts={face:f,seed:0.25,cosmetic};
        const covered=candidate.exports.PaintSystem.prototype.splat.call(h.paint,new h.V3(1,.25,1),.9,0,opts);
        rows.push({covered,accepted:h.accepted,growing:h.paint.growing.length,
          entries:h.paint.growing[0]?.entries?.length??0,checks:candidate.ctx.__checks});
      }
      assert.deepEqual(rows[1].accepted,rows[0].accepted,'face='+String(f));
      for(const key of ['covered','growing','entries'])assert.equal(rows[1][key],rows[0][key],key+' face='+String(f));
      assert.ok(rows[1].checks<=1, 'one integer check per splat (or none for no candidate)');
      assert.ok(rows[0].checks>=rows[1].checks);
    }
  }
  const a=fakePaint(before.exports,60),b=fakePaint(after.exports,60);
  before.ctx.__checks=after.ctx.__checks=0;
  before.exports.PaintSystem.prototype.splat.call(a.paint,new a.V3(1,.25,1),1,0,{seed:.2});
  after.exports.PaintSystem.prototype.splat.call(b.paint,new b.V3(1,.25,1),1,0,{seed:.2});
  assert.equal(before.ctx.__checks,360,'six inner face checks across 60 blocks');
  assert.equal(after.ctx.__checks,1,'one hoisted check per 60-block splat');
});
test('native GPU quad submission preserves attribute uploads, render sequence and draw count',async()=>{
  const [original,optimized]=await Promise.all([loadNative(ORIGINAL),loadNative(FIXED)]);
  const go=realm=>{
    const calls=[];
    const attributes=Object.fromEntries(['aPos','aLocal','aSplat','aStretch','aGrow'].map(name=>[name,{
      itemSize:({aPos:2,aLocal:3,aSplat:4,aStretch:3,aGrow:4})[name],
      clearUpdateRanges(){calls.push(name+':clear');},
      addUpdateRange(a,b){calls.push(name+':add:'+a+':'+b);},
      set needsUpdate(v){calls.push(name+':dirty:'+v);}
    }]));
    const obj={quads:3,geo:{attributes,setDrawRange(a,b){calls.push('drawRange:'+a+':'+b);}},
      dryMesh:{visible:false},mesh:{visible:false},rt:{id:'atlas'},scene:{id:'scene'},cam:{id:'camera'},
      renderer:{autoClear:true,getRenderTarget(){return null;},
        setRenderTarget(rt){calls.push('target:'+(rt?.id??'null'));},
        render(s,c){calls.push('render:'+s.id+':'+c.id);}
      }};
    realm.exports.PaintSystem.prototype._drawQuads.call(obj);
    return {calls,quads:obj.quads,visible:obj.mesh.visible};
  };
  assert.deepEqual(go(optimized),go(original));
});

test('ink GPU quad atlas buffers are byte-identical for clipped, wall and floor splats', async () => {
  const [native, optimized] = await Promise.all([loadNative(ORIGINAL), loadNative(FIXED)]);
  const names = [['aPos', 2], ['aLocal', 3], ['aSplat', 4], ['aStretch', 3], ['aGrow', 4]];
  const make = () => {
    const owner = { quads: 0, size: 4096, _drawQuads() { throw Error('unexpected quad capacity flush'); } };
    for (const [name, stride] of names) owner[name] = new Float32Array(4096 * 4 * stride);
    return owner;
  };
  const baseline = make(), changed = make();
  const faces = [
    { wall: false, su: 37, sv: 83, atlas: { x: 13, y: 29, pad: 8, ppm: 11 } },
    { wall: true, su: 7.5, sv: 12.25, atlas: { x: 333, y: 888, pad: 4, ppm: 13 } },
    { wall: false, su: 1.25, sv: 2.5, atlas: { x: 1023, y: 700, pad: 2, ppm: 5 } },
  ];
  let rng = 0xdeadbeef;
  const next = () => ((rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 3000; i++) {
    const f = faces[i % faces.length], lu = (next() * 1.5 - .25) * f.su, lv = (next() * 1.5 - .25) * f.sv;
    const r = .001 + next() * 5;
    const u0 = lu - r * (.8 + next()), u1 = lu + r * (.8 + next());
    const v0 = lv - r * (.8 + next()), v1 = lv + r * (.8 + next());
    const args = [f,u0,u1,v0,v1,lu,lv,next() * 2,r,i%2,next(),i%6,next(),next(),next(),next(),next(),i%3?0:1];
    native.exports.PaintSystem.prototype._pushQuad.call(baseline, ...args);
    optimized.exports.PaintSystem.prototype._pushQuad.call(changed, ...args);
  }
  assert.equal(changed.quads, baseline.quads);
  assert.ok(changed.quads > 1000);
  for (const [name] of names) {
    const a = baseline[name], b = changed[name];
    assert.equal(Buffer.compare(Buffer.from(a.buffer), Buffer.from(b.buffer)), 0, name + ' GPU vertex bytes');
  }
  assert.match(FIXED, /const x0 = \(\(a\.x \+ a\.pad \+ u0 \* a\.ppm\) \/ S\) \* 2 - 1/);
  assert.doesNotMatch(FIXED, /const px = a\.x \+ a\.pad \+ cu \* a\.ppm/);
});
test('production six-layer composition includes paint hotpath with fail-closed build-only adapter',()=>{
  const final=adaptBuildSource('src/world/paint.js',ORIGINAL);
  assert.match(final,/PAINT_GPU_ATTRIBUTE_NAMES/);
  assert.match(final,/const faceOnly = Number\.isInteger/);
  assert.match(final,/idx\[at \+ 5\] = v \+ 3/);
  assert.ok(!final.includes('idx.set([i * 4'));
  assert.equal(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/paint-hotpath-adapter.mjs'),true);
  assert.equal(adaptPaintHotpath('src/config.js',ORIGINAL,once),ORIGINAL);
  assert.throws(()=>adaptPaintHotpath('src/world/paint.js',FIXED,once));
  assert.doesNotThrow(()=>new vm.SourceTextModule(final));
});


test('CPU paint inner-disc shortcut retains exact ownership, area and version for randomized overlapping splats', async () => {
  const [native, faster] = await Promise.all([loadNative(ORIGINAL), loadNative(FIXED)]);
  const nu = 120, nv = 120, perFace = nu * nv;
  const faces = [0, 1].map((id) => ({
    cu: 0.25, cv: 0.25, nu, nv, grid: id * perFace, turf: id === 0,
  }));
  function fresh() {
    const dead = new Uint8Array(perFace * 2);
    for (let i = 0; i < dead.length; i++) if (i % 43 === 0) dead[i] = 1;
    return { grid: new Uint8Array(perFace * 2), dead, counts: [0, 0], version: 0 };
  }
  const a = fresh(), b = fresh();
  let seed = 20261012;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const methodA = native.exports.PaintSystem.prototype._cpuSplat;
  const methodB = faster.exports.PaintSystem.prototype._cpuSplat;
  let definitelyInside = 0, changedCells = 0;
  for (let i = 0; i < 6500; i++) {
    const face = faces[i % 2];
    const radius = i % 43 === 0 ? .01 : .12 + rand() * 2.2;
    const x = 2 + rand() * 26, y = 2 + rand() * 26;
    const team = (i + ((i / 13) | 0)) % 2;
    const inkSeed = rand(), angle = rand() * Math.PI * 2;
    const sa = i % 3 === 0 ? rand() * 1.3 : 0;
    const args = [face, x, y, radius, team, inkSeed, Math.cos(angle), Math.sin(angle), sa, i % 8 === 0 ? 6 : i % 4];
    const c0 = methodA.call(a, ...args);
    const c1 = methodB.call(b, ...args);
    assert.equal(c1, c0, 'claimed area splat ' + i);
    assert.equal(b.version, a.version, 'version splat ' + i);
    assert.deepEqual(b.counts, a.counts, 'turf counters splat ' + i);
    if (i % 65 === 0) assert.deepEqual(b.grid, a.grid, 'ownership grid batch ' + i);
    if (c0) changedCells++;
    if (radius > .02 && args[9] !== 6) definitelyInside++;
  }
  assert.ok(definitelyInside > 1000);
  assert.ok(changedCells > 1000);
  assert.deepEqual(b.grid, a.grid);
  assert.deepEqual(b.dead, a.dead);
  assert.deepEqual(b.counts, a.counts);
  assert.equal(b.version, a.version);
});
test('0.68 inner-disc gate has a strict mathematical margin beneath historical 0.97 paint cutoff', async () => {
  const start = ORIGINAL.indexOf('export function blobWobble(');
  const end = ORIGINAL.indexOf('const WOB_MAX', start);
  assert.ok(start >= 0 && end > start, 'native deterministic wobble function');
  const source = ORIGINAL.slice(start, end).replace('export function', 'function');
  const wob = new Function(source + '\nreturn blobWobble;')();
  // Derived bound: 1 - (0.12+0.08+0.05+0.03+0.018) = 0.702,
  // while both cos^even terms are nonnegative.
  assert.ok(0.68 / 0.702 < 0.97);
  let seed = 98531;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 50000; i++) {
    const v = wob(rand() * 20 - 10, rand());
    assert.ok(v > 0.701999, 'no angle/seed violates conservative body bound');
    assert.ok(0.68 / v < 0.97, 'inner circle always kept by native scorer');
  }
  assert.match(FIXED, /if \(d >= r \* 0\.68 && d \/ \(r \* blobWobble/);
  // In production the source WidthHalf cap is applied before the unchanged
  // mathematically safe inner-disc shortcut. Test the whole composed path.
  assert.match(adaptBuildSource('src/world/paint.js', ORIGINAL),
    /if \(d >= r \* 0\.68 && d \/ \(r \* Math\.min\(1, blobWobble\(Math\.atan2\(py, px\), seed\)\)\) > 1\)/);
});
