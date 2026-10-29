import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {loadNative} from './prop-retention-fixture.mjs';
import {adaptWorldNative20261029} from '../queue-world-native-20261029-adapter.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
const {THREE,G,SRC}=await loadNative(true);
const K=await import(pathToFileURL(SRC+'src/game/character-geo.js'));
const {CS,MC,PART}=await import(pathToFileURL(SRC+'src/game/character-mats.js'));
const original=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-world-native-before-20261029.json',import.meta.url)));
const composed=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-world-native-composed-before-20261029.json',import.meta.url)));
const raw=rel=>fs.readFileSync(SRC+rel,'utf8');
const strip=s=>s.replace(/^import .*;$/gm,'').replaceAll('export ','');
const geo=adaptBuildSource('src/game/character-geo.js',raw('src/game/character-geo.js'));
const begin=geo.indexOf('class BuilderAttribute {'),end=geo.indexOf('\n}\n\n',geo.indexOf('class Builder {'));
const Builder=new Function('THREE','V3','BONE_INDEX','const _c=new THREE.Color();\n'+geo.slice(begin,end+2)+'\nreturn Builder;')(THREE,THREE.Vector3,K.BONE_INDEX);
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const snapshot=g=>Object.fromEntries([...Object.entries(g.attributes).map(([k,a])=>[k,bytes(a.array)]),['index',g.index?bytes(g.index.array):null]]);
const outfit=s=>new Function('THREE','CS','MC','PART','K','G',strip(s)+'\nreturn {addOutfit,addBodyLimbs,onTeeWeights,webbing};')(THREE,CS,MC,PART,K,G);

test('all five real body and outfit levels preserve every position, normal, UV, index and skin weight byte',()=>{
 const pair=[outfit(original['src/game/character-outfit.js']),outfit(raw('src/game/character-outfit.js'))];
 let vertices=0;
 for(let lv=0;lv<5;lv++)for(const method of ['addBodyLimbs','addOutfit']){
  const geometries=pair.map(k=>{const b=new Builder();k[method](b,lv);return b.build('aCloth','aClothPart');});
  assert.deepEqual(snapshot(geometries[1]),snapshot(geometries[0]),method+' level '+lv);
  vertices+=geometries[0].attributes.position.count;geometries.forEach(g=>g.dispose());
 }
 console.log(JSON.stringify({scope:'real Three.js body/outfit geometry',levels:5,vertices}));
});

test('tee weights retain values and order at hem, arm and clavicle boundaries',()=>{
 const pair=[outfit(original['src/game/character-outfit.js']),outfit(raw('src/game/character-outfit.js'))];
 for(const x of [-.158,-.11,-.055,-0,0,.055,.11,.158,NaN])for(const y of [.702,.715,.76,.8,.866,.9,.955])for(const z of [-.07,-.02,0,.02,.07]){
  const p=new THREE.Vector3(x,y,z);assert.deepEqual(pair[1].onTeeWeights(p),pair[0].onTeeWeights(p));
 }
});

test('indexed weapon corner memo preserves actual Three.js topology and custom attribute fallback',()=>{
 const compile=s=>new Function('THREE',strip(s)+'\nreturn clusterDecimate;')(THREE);
 const pair=[compile(original['src/game/character-lod.js']),compile(raw('src/game/character-lod.js'))];
 for(const normalized of [false,true])for(const custom of [false,true])for(const size of [3,8,20]){
  const g=new THREE.PlaneGeometry(2,2,size,size),n=g.attributes.position.count;
  const color=new THREE.Float32BufferAttribute(Array.from({length:n*3},(_,i)=>((i*13)%19)/19),3,normalized);
  const mat=new THREE.Float32BufferAttribute(Array.from({length:n},(_,i)=>i%3),1,normalized);
  if(custom){const component=color.getComponent;color.getComponent=function(...args){return component.apply(this,args);};}
  g.setAttribute('color',color);g.setAttribute('aMat',mat);
  const result=pair.map(f=>f(g,.25));assert.deepEqual(snapshot(result[1]),snapshot(result[0]));result.forEach(x=>x.dispose());g.dispose();
 }
});

test('real face and eyeball construction remains byte exact after monotone cursor',()=>{
 const before=composed['src/game/character-face.js'],after=adaptWorldNative20261029('src/game/character-face.js',before);
 const compile=s=>new Function('THREE','G',strip(s)+'\nreturn {buildFaceSkin,addEyeballs};')(THREE,G);
 const pair=[compile(before),compile(after)];let vertices=0;
 for(const quality of ['low','medium','high','ultra'])for(const lod of ['far','game','hero']){
  G.settings={quality};const results=pair.map(k=>k.buildFaceSkin(lod));
  assert.deepEqual(snapshot(results[1].geo),snapshot(results[0].geo));assert.deepEqual(bytes(results[1].ao),bytes(results[0].ao));
  for(const key of ['w','sub','hd','part','uv','lid','mw'])assert.deepEqual(results[1].acc[key],results[0].acc[key]);
  const eyes=pair.map(k=>{const out=[];k.addEyeballs({add(g,o){out.push({g:snapshot(g),ex:o.ex});g.dispose();}},lod);return out;});assert.deepEqual(eyes[1],eyes[0]);
  vertices+=results[0].geo.attributes.position.count;results.forEach(x=>x.geo.dispose());
 }
 console.log(JSON.stringify({scope:'real Three.js face/eyes',variants:12,vertices}));
});

test('source motion direction keeps signed zero, nonfinite inputs and left-associated sum',()=>{
 const before=raw('src/game/motion/source-controller.js'),after=composed['src/game/motion/source-controller.js'];
 const kernel=s=>{const a=s.indexOf('  this.directionTarget.set('),b=s.indexOf('  const mix=1-Math.exp',a);return new Function(s.slice(a,b)+'\nreturn {target:Array.from(this.directionTarget),sum};');};
 const a=kernel(before),start=after.indexOf('  if(this.pivoting){this.directionTarget'),end=after.indexOf('  const mix=',start);
 const b=new Function(after.slice(start,end)+'\nreturn {target:Array.from(this.directionTarget),sum};');
 for(const x of [-Infinity,-1,-0,0,1e-20,1,Infinity,NaN])for(const z of [-Infinity,-1,-0,0,1e-20,1,Infinity,NaN])for(const turn of [-1,-0,0,1,NaN])for(const pivot of [false,true]){
  const make=()=>({localX:x,localZ:z,turnRate:turn,pivoting:pivot,directionTarget:new Float64Array(4)});
  assert.deepEqual(b.call(make()),a.call(make()));
 }
});

test('sea shader guards both variants and computes gradients before marina discard',()=>{
 const result=adaptWorldNative20261029('src/world/environment.js',composed['src/world/environment.js']);
 assert.equal((result.match(/textureGrad\(uWaveTex, fineUV, fineDx, fineDy\)/g)||[]).length,2);
 assert.equal((result.match(/if \(nearF > 0.0\)/g)||[]).length,2);
 assert.equal((result.match(/if \(inField > 0.0\) dObj = textureLod/g)||[]).length,2);
 assert(result.indexOf('dFdx(fineUV)')<result.indexOf('if (gw.x < -0.03) discard'));
 assert.throws(()=>adaptWorldNative20261029('src/world/environment.js',result),/count|anchor/);
});

test('native texture caps preserve all quality, memory, map-count and hardware boundaries',()=>{
 const compile=s=>new Function(s.replaceAll('export ','')+'\nreturn {nativeStageTextureLimit,nativeStageTextureCaps};')();
 const path='patches/native-stages/runtime/native-texture-budget.mjs';
 const pair=[compile(original[path]),compile(fs.readFileSync(new URL('../../../'+path,import.meta.url),'utf8'))];
 for(const count of [0,1,29,30,64,79,80,159,160])for(const quality of ['low','medium','high','unknown'])for(const mobile of [false,true])for(const memory of [null,0,1,2,4,8,16,NaN,Infinity])for(const maxTextureSize of [256,512,4096,0,NaN]){
  const materials=Object.fromEntries(Array.from({length:count},(_,i)=>['m'+i,{albedo:'a'+i,maps:{opacity:'a'+i,normal:'n'+i,roughness:'r'+i,emissive:'e'+i}}]));
  const manifest={materials,geometry:{vertices:count%2?150000:149999}},options={mobile,deviceMemoryGB:memory,maxTextureSize};
  assert.deepEqual(pair[1].nativeStageTextureCaps(manifest,quality,options),pair[0].nativeStageTextureCaps(manifest,quality,options));
 }
});

test('native material index retains active filtering, all roles, duplicate aliases and encounter order',()=>{
 const path='patches/native-stages/runtime/native-load.mjs';
 const compile=s=>{const a=s.indexOf(' const active=Array.isArray(data.manifest.objects)'),b=s.indexOf(' // Only the authenticated browser source inventory',a);return new Function('data','quality','limit','roleCaps','const jobs=new Map();\n'+s.slice(a,b)+'\nfor(const job of jobs.values())delete job._materialOrdinal;return [...jobs];');};
 const pair=[compile(original[path]),compile(fs.readFileSync(new URL('../../../'+path,import.meta.url),'utf8'))];
 for(const quality of ['low','medium','high'])for(const mode of ['browser-direct','prebuilt'])for(const objects of [undefined,[],[{active:true,material:'a'}],[{active:true,material:'a'},{active:true,material:'b'},{active:false,material:'c'},null]]){
  const shared={albedo:'x',maps:{normal:'x',opacity:'x',roughness:'r',emissive:'e'}},materials={a:shared,b:shared,c:{albedo:'c',maps:{opacity:'r'}}};
  const data={manifest:{materials,objects,sourceMode:mode}};
  assert.deepEqual(pair[1](data,quality,1024,{normal:512}),pair[0](data,quality,1024,{normal:512}));
 }
});

test('AO Laplacian static valence preserves Float32 update order, seam duplicates, masks and empty meshes',()=>{
 const compile=s=>new Function('THREE','CS','MC','PART','K','G',strip(s)+'\nreturn smoothOnMesh;')(THREE,CS,MC,PART,K,G),pair=[original['src/game/character-outfit.js'],raw('src/game/character-outfit.js')].map(compile);
 for(const n of [0,1,3,60])for(const iterations of [0,1,2,8])for(const masked of [false,true]){
  const index=n?Uint32Array.from({length:90},(_,i)=>(i*7+i%3)%n):new Uint32Array(),values=Float32Array.from({length:n},(_,i)=>Math.sin(i*.3)),mask=masked?Uint8Array.from({length:n},(_,i)=>i%3):null;
  const out=pair.map(f=>{const v=values.slice();f({index:{array:index}},v,iterations,mask);return bytes(v)});assert.deepEqual(out[1],out[0]);
 }
});
