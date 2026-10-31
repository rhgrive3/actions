import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adoptReviewedHairDetail} from './reviewed-hair-detail.mjs';
import {adoptReviewedCharacterShape,restoreReviewedCharacterShape} from './reviewed-character-shape.mjs';
const hash=source=>createHash('sha256').update(source).digest('hex');
const frozenBytes=fs.readFileSync(new URL('./fixtures/queue-world-geometry-before-20261029.json',import.meta.url));
assert.equal(hash(frozenBytes),'b0a9d75d934d5e56d90f4e3d81252fbb64c2980dbf5e49bb35d245ca1f33b061','immutable complete pre-world-geometry fixture');
const frozen=JSON.parse(frozenBytes);
// Retain the older numerical kernels while giving both sides the separately
// reviewed fdb74165 shapes and detail policy. No expected buffers are regenerated
// from the candidate, and every old fixture byte remains independently sealed.
const baseline={...frozen,
 'src/game/character-geo.js':adoptReviewedCharacterShape(frozen['src/game/character-geo.js']),
 'src/game/character-hair.js':adoptReviewedHairDetail(frozen['src/game/character-hair.js']),
};
const extraExports="export {getHairStyle,getKidShared,HAIR_STYLE_NAMES,HAT_KINDS} from './src/game/character-geo.js'; export {TentacleSurface} from './src/game/character-hair.js';";
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const snap=g=>Object.fromEntries([...Object.entries(g.attributes).map(([k,a])=>[k,bytes(a.array)]),['index',g.index?bytes(g.index.array):null]]);

function assertGeometryBuffersEqual(actual,expected,label){
 // This is the same complete decision used by assert/strict.deepEqual. Only
 // failure presentation is bounded: formatting huge Buffer diffs can exhaust
 // memory before the test runner reports the underlying geometry regression.
 if(isDeepStrictEqual(actual,expected))return;
 const keys=[...new Set([...Object.keys(actual),...Object.keys(expected)])];
 let difference;
 for(const key of keys){
  const a=actual[key],b=expected[key];
  if(isDeepStrictEqual(a,b))continue;
  if(Buffer.isBuffer(a)&&Buffer.isBuffer(b)){
   let offset=0;while(offset<Math.min(a.length,b.length)&&a[offset]===b[offset])offset++;
   difference={attribute:key,actualBytes:a.length,expectedBytes:b.length,firstByteOffset:offset,actualByte:a[offset]??null,expectedByte:b[offset]??null};
  }else difference={attribute:key,actualPresent:Object.hasOwn(actual,key),expectedPresent:Object.hasOwn(expected,key)};
  break;
 }
 const describe=value=>({attributes:Object.fromEntries(Object.keys(value).slice(0,24).map(key=>[key,value[key]===null?null:{bytes:value[key].length,sha256:hash(value[key])}])),omittedAttributes:Math.max(0,Object.keys(value).length-24)});
 throw new assert.AssertionError({message:label+'; full geometry comparison failed: '+JSON.stringify(difference),
  actual:describe(actual),expected:describe(expected),operator:'deepStrictEqual',stackStartFn:assertGeometryBuffersEqual});
}

test('fdb74165 shape successor is reversible against complete raw and historical fixture identities',()=>{
 const raw=fs.readFileSync(new URL('../../../inkwave-public/src/game/character-geo.js',import.meta.url),'utf8');
 const prior=restoreReviewedCharacterShape(raw,'raw');
 const blob=source=>createHash('sha1').update('blob '+Buffer.byteLength(source)+'\0').update(source).digest('hex');
 assert.equal(blob(prior),'f1d8fd875b29dc7868f820853e38eb99ac6fcfe5');
 assert.equal(blob(raw),'712768ac32f2459ee369e12a540d25edb9fc1b56');
 assert.equal(adoptReviewedCharacterShape(prior,'raw'),raw);
 assert.equal(restoreReviewedCharacterShape(baseline['src/game/character-geo.js']),frozen['src/game/character-geo.js']);
 const descriptorBytes=fs.readFileSync(new URL('./fixtures/reviewed-character-shape-fdb74165.json',import.meta.url));
 const descriptor=JSON.parse(descriptorBytes);
 for(const hunk of descriptor.hunks){
  for(const replacement of ['',hunk.before+hunk.before])
   assert.throws(()=>adoptReviewedCharacterShape(prior.replace(hunk.before,replacement),'raw'),/complete raw character shape input epoch/);
  for(const replacement of ['',hunk.after+hunk.after])
   assert.throws(()=>restoreReviewedCharacterShape(raw.replace(hunk.after,replacement),'raw'),/complete raw character shape input epoch/);
 }
 assert.throws(()=>adoptReviewedCharacterShape(prior,'raw',Buffer.from(descriptorBytes.toString().replace('0.0075','0.0076'))),/sealed fdb74165 character shape successor/);
});

test('geometry diagnostics retain full-buffer decisions while bounding failure output',()=>{
 const expected={position:Buffer.alloc(1024*1024),index:Buffer.from([0,1,2])};
 const actual={position:Buffer.from(expected.position),index:Buffer.from(expected.index)};
 assertGeometryBuffersEqual(actual,expected,'identical');
 actual.position[actual.position.length-1]=1;
 assert.throws(()=>assertGeometryBuffersEqual(actual,expected,'last byte'),error=>{
  assert.equal(error.code,'ERR_ASSERTION');assert.equal(error.operator,'deepStrictEqual');
  assert.match(error.message,/"firstByteOffset":1048575/);
  assert.ok(JSON.stringify({actual:error.actual,expected:error.expected}).length<2048,'failure only stores bounded sizes and digests');
  return true;
 });
 actual.position[actual.position.length-1]=0;
 assert.throws(()=>assertGeometryBuffersEqual({...actual,index:Buffer.from([0,1])},expected,'index length'),/full geometry comparison failed/);
 assert.throws(()=>assertGeometryBuffersEqual({position:actual.position},expected,'missing index'),/full geometry comparison failed/);
});

test('complete hair, hats, accessories and squid meshes retain all independent baseline buffers',async()=>{
 const apis=await Promise.all([true,false].map(before=>sourceLoadedActorFixture({sourceOnly:true,extraExports,transform:(rel,raw)=>before&&baseline[rel]||adaptBuildSource(rel,raw)})));
 let cases=0,vertices=0;
 try{
 for(const quality of ['low','high','ultra'])for(const lod of ['far','game','hero']){
  apis.forEach(a=>a.G.settings.quality=quality);
  // Each style is covered; bucket/cap geometry and clearance use all three tiers.
  for(let hair=0;hair<apis[0].HAIR_STYLE_NAMES.length;hair++){
   const hat=hair%apis[0].HAT_KINDS.length,st={hair,hat,brows:hair%3};
   const models=apis.map(a=>a.getHairStyle(st,lod));
   assertGeometryBuffersEqual(snap(models[1].geo),snap(models[0].geo),`${quality}/${lod}/${hair}/${hat}`);
   assert.deepEqual(structuredClone(models[1].rest),structuredClone(models[0].rest));
   vertices+=models[0].geo.attributes.position.count;cases++;
  }
  const squid=apis.map(a=>a.getKidShared(lod).squid);
  for(const key of ['body','dark','eyes'])assertGeometryBuffersEqual(snap(squid[1][key]),snap(squid[0][key]),`${quality}/${lod}/squid/${key}`);
 }
 console.log(JSON.stringify({cases,vertices,scope:'real Three.js complete hair/accessories/hat and squid geometry, no device speed claim'}));
 }finally{apis.forEach(a=>a.reset());}
});
test('tentacle point scratch preserves callback count, independent returned vectors and custom offset override',async()=>{
 const apis=await Promise.all([true,false].map(before=>sourceLoadedActorFixture({sourceOnly:true,extraExports,transform:(rel,raw)=>before&&baseline[rel]||adaptBuildSource(rel,raw)})));
 try{for(const custom of [false,true]){
  const calls=[0,0],surfaces=apis.map((a,i)=>new a.TentacleSurface([[0,0,0],[.2,.4,.1],[.1,.8,.2]],{radius:t=>{calls[i]++;return .08*(1-t*.5)},flat:()=>.7,twist:t=>t*.3}));
  if(custom)surfaces.forEach(s=>{const original=s.offset;s.offset=function(...args){return original.apply(this,args).map((v,i)=>v*(i+1))}});
  for(const t of [-.1,0,.1,.9,1,1.1])for(const th of [-0,0,.1,2,5]){
   const out=surfaces.map((s,i)=>s.point(t,th,new apis[i].THREE.Vector3()));assert.deepEqual(Array.from(out[1].toArray()),Array.from(out[0].toArray()));
  }
  assert.equal(calls[1],calls[0]);
 }}finally{apis.forEach(a=>a.reset());}
});
