import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-world-geometry-before-20261029.json',import.meta.url)));
const extraExports="export {getHairStyle,getKidShared,HAIR_STYLE_NAMES,HAT_KINDS} from './src/game/character-geo.js'; export {TentacleSurface} from './src/game/character-hair.js';";
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const snap=g=>Object.fromEntries([...Object.entries(g.attributes).map(([k,a])=>[k,bytes(a.array)]),['index',g.index?bytes(g.index.array):null]]);
test('complete hair, hats, accessories and squid meshes retain all independent baseline buffers',async()=>{
 const apis=await Promise.all([true,false].map(before=>sourceLoadedActorFixture({sourceOnly:true,extraExports,transform:(rel,raw)=>before&&frozen[rel]||adaptBuildSource(rel,raw)})));
 let cases=0,vertices=0;
 try{
 for(const quality of ['low','high','ultra'])for(const lod of ['far','game','hero']){
  apis.forEach(a=>a.G.settings.quality=quality);
  // Each style is covered; bucket/cap geometry and clearance use all three tiers.
  for(let hair=0;hair<apis[0].HAIR_STYLE_NAMES.length;hair++){
   const hat=hair%apis[0].HAT_KINDS.length,st={hair,hat,brows:hair%3};
   const models=apis.map(a=>a.getHairStyle(st,lod));
   assert.deepEqual(snap(models[1].geo),snap(models[0].geo),`${quality}/${lod}/${hair}/${hat}`);
   assert.deepEqual(structuredClone(models[1].rest),structuredClone(models[0].rest));
   vertices+=models[0].geo.attributes.position.count;cases++;
  }
  const squid=apis.map(a=>a.getKidShared(lod).squid);
  for(const key of ['body','dark','eyes'])assert.deepEqual(snap(squid[1][key]),snap(squid[0][key]),`${quality}/${lod}/squid/${key}`);
 }
 console.log(JSON.stringify({cases,vertices,scope:'real Three.js complete hair/accessories/hat and squid geometry, no device speed claim'}));
 }finally{apis.forEach(a=>a.reset());}
});
test('tentacle point scratch preserves callback count, independent returned vectors and custom offset override',async()=>{
 const apis=await Promise.all([true,false].map(before=>sourceLoadedActorFixture({sourceOnly:true,extraExports,transform:(rel,raw)=>before&&frozen[rel]||adaptBuildSource(rel,raw)})));
 try{for(const custom of [false,true]){
  const calls=[0,0],surfaces=apis.map((a,i)=>new a.TentacleSurface([[0,0,0],[.2,.4,.1],[.1,.8,.2]],{radius:t=>{calls[i]++;return .08*(1-t*.5)},flat:()=>.7,twist:t=>t*.3}));
  if(custom)surfaces.forEach(s=>{const original=s.offset;s.offset=function(...args){return original.apply(this,args).map((v,i)=>v*(i+1))}});
  for(const t of [-.1,0,.1,.9,1,1.1])for(const th of [-0,0,.1,2,5]){
   const out=surfaces.map((s,i)=>s.point(t,th,new apis[i].THREE.Vector3()));assert.deepEqual(Array.from(out[1].toArray()),Array.from(out[0].toArray()));
  }
  assert.equal(calls[1],calls[0]);
 }}finally{apis.forEach(a=>a.reset());}
});
