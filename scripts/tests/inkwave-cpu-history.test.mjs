import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {replaceOnce} from '../../patches/local-quality/adapter.mjs';
const url=new URL('../benchmark-aplus-verification.mjs',import.meta.url);
const source=fs.readFileSync(url,'utf8');
// Execute the actual admission prefix, before the expensive historical loops.
const prefix=source.slice(source.indexOf('function benchmarkComposedProductionBuildParity()'),source.indexOf('  // Reconstruct exact pre-migration'));
assert.ok(prefix.includes('combinedBodySha')&&prefix.includes('Immutable historical BodyBalance'));
const run=(changeCurrent=x=>x,changeFixture=x=>x,changeLodFixture=x=>x,changeCurrentLod=x=>x)=>new Function('fs','createHash','replaceOnce','assert',prefix.replaceAll('import.meta.url',JSON.stringify(url.href))+'return true;} return benchmarkComposedProductionBuildParity();')({readFileSync(path,...args){
 const value=fs.readFileSync(path,...args);
 return path.pathname.endsWith('/inkwave-public/src/game/motion/body-balance.js')?changeCurrent(value)
   :path.pathname.endsWith('/body-balance-26a4db41.js.txt')?changeFixture(value)
   :path.pathname.endsWith('/inkwave-cpu-lod-1861.js.txt')?changeLodFixture(value)
   :path.pathname.endsWith('/inkwave-public/src/game/character-lod.js')?changeCurrentLod(value):value;
}},createHash,replaceOnce,assert);
test('actual historical gate admits the exact independently verified cache/closure integration',()=>assert.equal(run(),true));
test('arbitrary current runtime drift cannot inherit the historical identity claim',()=>{
 for(const change of [s=>s+'\n',s=>s.replace('vertical:.38','vertical:.4'),s=>s.replace('for(const i of this.rotationWorldIndices){','for(let i=0;i<this.bank.bones.length;i++){')])
  assert.throws(()=>run(change),/exact reviewed closure or its fixed #1815 cache integration/);
});
test('the immutable historical reference is checked independently of the current source',()=>{
 assert.throws(()=>run(x=>x,s=>s+'\n'),/Immutable historical BodyBalance migration input/);
});

test('the pinned LOD oracle is independent of the newer optimized runtime',()=>{
 assert.throws(()=>run(x=>x,x=>x,b=>Buffer.concat([Buffer.from(b),Buffer.from('\n')])) ,/immutable reviewed pre-queue Lod source/);
});

// Execute the actual normalization prefix through both original queue inversions,
// stopping immediately before the new owner bridge or any benchmark loops.
const lodPrefix=prefix.slice(0,prefix.indexOf('  lodAfterSrc=restoreReviewedLodMemoOwner(lodAfterSrc);'));
assert.ok(lodPrefix.includes('historical Lod final index allocation'));
const lodGate=(mutate=x=>x)=>new Function('fs','createHash','replaceOnce','assert',mutate(lodPrefix).replaceAll('import.meta.url',JSON.stringify(url.href))+
 'return {closure:lodAfterSrc,edits:lodMemoOwnerEdits,restore:restoreReviewedLodMemoOwner,blob:lodBlob};}return benchmarkComposedProductionBuildParity();')(fs,createHash,replaceOnce,assert);
const sha=value=>createHash('sha256').update(value).digest('hex');

test('new Lod owner authenticates complete current and predecessor raw sources and normalized closures independently',()=>{
 const gate=lodGate(),current=fs.readFileSync(new URL('../../inkwave-public/src/game/character-lod.js',import.meta.url),'utf8');
 assert.equal(gate.edits.length,5);
 assert.equal(sha(JSON.stringify(gate.edits)),'cd0388cd9468fb6d43b64422c65f6d58e19e155bad5756f29e5409d1f7f4bd83');
 assert.equal(gate.blob(current),'7fcf28f91da1d9813b12cf33908ce62fc4856c8a');
 assert.equal(sha(current),'3e7565e0fc6fb0ea86f60ef91833e3f75c997b8f3036249b55c13b18f051ed0e');
 let prior=current;
 for(const {before,after,label} of [...gate.edits].reverse())prior=replaceOnce(prior,after,before,label);
 assert.equal(gate.blob(prior),'1ecceff38aa579aa2b25f00416a9cacd4f3ff4a8');
 assert.equal(sha(prior),'91ddb72879f10b0d819403901f9185cbbe9b3ea72e47f4ef3df086cc3e89b2c2');
 let replay=prior;for(const {before,after,label}of gate.edits)replay=replaceOnce(replay,before,after,label);
 assert.equal(replay,current,'only the five exact owner changes separate both whole files');
 assert.equal(gate.blob(gate.closure),'54344ec75dbfff00176a83d0d557bad7bac5ec69');
 const restored=gate.restore(gate.closure);
 assert.equal(gate.blob(restored),'4df1943b2d598d012eaa7fa09fe96af4900821bd');
 assert.equal(gate.restore(restored),restored,'exact independently reviewed predecessor remains admitted');
 assert.equal(run(x=>x,x=>x,x=>x,()=>prior),true,'actual historical gate retains the predecessor raw epoch');
});

test('every Lod memo hunk rejects missing, duplicated and semantically tampered current-owner inputs',()=>{
 const gate=lodGate(),changes=[
  ['new Int32Array(n)','new Int32Array(n + 1)'],
  ['tris.length > 2*n','tris.length > 3*n'],
  ['remembered - 1','remembered - 2'],
  ['cluster + 1','cluster + 2'],
  ['index + 1','index + 2'],
 ];
 for(const [i,{before,after,label}]of gate.edits.entries()){
  assert.equal(gate.closure.split(after).length,2,label+' current hunk is unique');
  const [from,to]=changes[i];assert.equal(after.split(from).length,2,label+' tamper witness');
  for(const replacement of [before,after+after,after.replace(from,to)])
   assert.throws(()=>gate.restore(gate.closure.replace(after,replacement)),/queue Lod memo owner/,'reject drift in '+label);
 }
});

test('unrelated current Lod source drift cannot pass either full raw identity or normalized closure identity',()=>{
 const gate=lodGate();
 for(const changed of [gate.closure+'\n',gate.closure.replace("const _farCache = new WeakMap();","const _farCache = new Map();")])
  assert.throws(()=>gate.restore(changed),/exact reviewed current Lod memo closure/);
 for(const change of [s=>s+'\n',s=>s.replace("const _farCache = new WeakMap();","const _farCache = new Map();")])
  assert.throws(()=>run(x=>x,x=>x,x=>x,change),/exact reviewed predecessor or current Lod raw source/);
});

test('the reviewed Lod owner descriptor seal rejects a modified bridge independently of admitted source bytes',()=>{
 const from='"label": "signature-free vertex fast path"',to='"label": "unreviewed signature owner"';
 assert.equal(lodPrefix.split(from).length,2);
 const gate=lodGate(s=>s.replace(from,to));
 assert.throws(()=>gate.restore(gate.closure),/exact reviewed Lod memo owner descriptors/);
});
