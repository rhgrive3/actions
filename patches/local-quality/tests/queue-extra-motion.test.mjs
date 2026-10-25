import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueExtraMotion} from '../queue-extra-motion-adapter.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
const adapterText=fs.readFileSync(new URL('../queue-extra-motion-adapter.mjs',import.meta.url),'utf8');
const changes=new Map();let rel;
for(const line of adapterText.split('\n')){
 const match=line.match(/^  if\(rel===(".*")\)\{$/);if(match){rel=JSON.parse(match[1]);changes.set(rel,{patches:[],append:''});}
 const patch=line.match(/^    patch\((.*)\);$/);if(patch)changes.get(rel).patches.push(JSON.parse('['+patch[1]+']'));
 const append=line.match(/^    code\+=(".*");$/);if(append)changes.get(rel).append+=JSON.parse(append[1]);
}
function restore(rel,code){
 const change=changes.get(rel);if(!change)return code;
 if(!code.includes(change.patches[0][1]))return code;
 if(change.append){assert.ok(code.endsWith(change.append));code=code.slice(0,-change.append.length);}
 for(const [before,after]of [...change.patches].reverse()){assert.equal(code.split(after).length,2,'unique reverse anchor '+rel);code=code.replace(after,before);}
 return code;
}
const OUTFIT_REL='src/game/character-outfit.js';
const oldOutfit=fs.readFileSync(new URL('./fixtures/queue-extra-outfit-before.mjs.txt',import.meta.url),'utf8');
function baseline(rel,raw){return rel===OUTFIT_REL?oldOutfit:restore(rel,adaptBuildSource(rel,raw));}
function candidate(rel,raw){if(rel===OUTFIT_REL)return adaptBuildSource(rel,raw);const old=baseline(rel,raw);return changes.has(rel)?adaptQueueExtraMotion(rel,old):old;}
const raw=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const pair=rel=>{const old=baseline(rel,raw(rel));return[old,candidate(rel,raw(rel))];};
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const geometry=g=>Object.fromEntries([...Object.entries(g.attributes).map(([k,a])=>[k,bytes(a.array)]),['index',g.index?bytes(g.index.array):null]]);
function leaf(code,names,G={},K={}){return new Function('THREE','G','K','CS','MC','PART',code.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn {'+names+'};')(THREE,G,K,{}, {}, {});}
const sha=s=>createHash('sha256').update(s).digest('hex');
const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-extra-motion-before-sha.json',import.meta.url)));
test('new transforms restore exact pinned PR #1870 inputs and reject unknown or duplicate application',()=>{
 for(const rel of changes.keys()){
  const [old,next]=pair(rel);assert.equal(sha(old),expected[rel],rel+' pinned prior composition');assert.equal(restore(rel,next),old);
  assert.throws(()=>adaptQueueExtraMotion(rel,next),/conflict/);assert.throws(()=>adaptQueueExtraMotion(rel,''),/conflict/);
 }
 assert.equal(adaptQueueExtraMotion('unrelated','same'),'same');
 assert.equal(sha(oldOutfit),expected[OUTFIT_REL]);const outfit=raw(OUTFIT_REL);assert.equal(adaptBuildSource(OUTFIT_REL,outfit),outfit,'migrated outfit remains directly owned');
});
test('actual Three.js surfaces, tube attributes and suction geometry preserve exact bytes with half as many arc mappings',()=>{
 const kernels=pair('src/game/character-hair.js').map(s=>leaf(s,'TentacleSurface,tentacleTube,suctionCups'));
 const points=[[[0,0,0],[0,.3,0],[0,.7,0],[0,1,0]],[[0,0,0],[.05,.2,.03],[.1,.5,-.02],[-.03,.8,.07]],[[0,0,0],[0,0,0],[0,0,0],[0,0,0]]];
 let cases=0;
 for(const pts of points)for(const N of [1,3,48,240])for(const section of [false,true]){
  const count=[0,0],surfaces=kernels.map((k,i)=>{const native=THREE.CatmullRomCurve3.prototype.getUtoTmapping;THREE.CatmullRomCurve3.prototype.getUtoTmapping=function(...a){count[i]++;return native.apply(this,a);};try{return new k.TentacleSurface(pts,{samples:N,radius:t=>.09*(1-t*.8),flat:t=>.6+t*.2,twist:t=>t*.7,section:section?(c,s,t)=>[c*(1+t*.1),s*.8]:undefined});}finally{THREE.CatmullRomCurve3.prototype.getUtoTmapping=native;}});
  assert.deepEqual(count,[2*(N+1),N+1]);
  for(const key of ['P','T','O','B'])assert.deepEqual(surfaces[1][key],surfaces[0][key]);
  for(const radial of [6,11])for(const capStart of [false,true]){
   const tubes=kernels.map((k,i)=>k.tentacleTube(surfaces[i],{radial,rings:12,capStart,tipSteps:3}));assert.deepEqual(geometry(tubes[1].geo),geometry(tubes[0].geo));for(const key of ['t','cs','sn','thick'])assert.deepEqual(tubes[1][key],tubes[0][key]);tubes.forEach(t=>t.geo.dispose());
  }
  if(pts!==points[2]){const cups=kernels.map((k,i)=>k.suctionCups(surfaces[i],{radial:6,prof:'lo',rows:[{th:.3,phase:0}],from:.2,to:.7,size:()=>.016}));assert.deepEqual(geometry(cups[1].geo),geometry(cups[0].geo));cups.forEach(c=>c.geo.dispose());}cases++;
 }
 console.log(JSON.stringify({scope:'real Three.js construction; no GPU/device speed claim',surfaceVariants:cases}));
});
test('all 12 actual face LOD/quality variants and both eyeballs remain byte exact',()=>{
 const G={settings:{quality:'high'}},kernels=pair('src/game/character-face.js').map(s=>leaf(s,'buildFaceSkin,addEyeballs',G));let verts=0;
 for(const quality of ['low','medium','high','ultra'])for(const lod of ['hero','game','far']){
  G.settings.quality=quality;const faces=kernels.map(k=>k.buildFaceSkin(lod));assert.deepEqual(geometry(faces[1].geo),geometry(faces[0].geo));assert.deepEqual(bytes(faces[1].ao),bytes(faces[0].ao));
  for(const key of ['w','sub','hd','part','uv','lid','mw'])assert.deepEqual(faces[1].acc[key],faces[0].acc[key],key);
  const eyes=kernels.map(k=>{const out=[];k.addEyeballs({add(g,o){out.push({geometry:geometry(g),ex:o.ex,sphere:Array.from({length:g.attributes.position.count},(_,i)=>o.v3(null,i))});g.dispose();}},lod);return out;});assert.deepEqual(eyes[1],eyes[0]);verts+=faces[0].geo.attributes.position.count;faces.forEach(f=>f.geo.dispose());
 }
 console.log(JSON.stringify({scope:'real face/eye geometry and AO',variants:12,faceVertices:verts}));
});
test('limb centreline cache invalidates coordinates, owns only four tables and never aliases caller outputs',()=>{
 const K={REST:{}},kernels=pair('src/game/character-outfit.js').map(s=>leaf(s,'limbPath,plateMask,distToPoly,strapPaths,teeFold'+(s.includes('extraLimbPaths')?',extraLimbPaths':''),{},K));
 const pts=[new THREE.Vector3(0,.1,0),new THREE.Vector3(.1,.3,.1),new THREE.Vector3(.12,.6,.08),new THREE.Vector3(.15,.9,.02)],hint=new THREE.Vector3(1,0,0);
 const a=kernels[0].limbPath(pts,hint),b=kernels[1].limbPath(pts,hint);assert.equal(kernels[1].limbPath(pts.map(p=>p.clone()),hint.clone()),b);
 for(const s of [-.1,0,.03,.21,.5,1,2]){const snap=x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,v.toArray()]));assert.deepEqual(snap(b.at(s)),snap(a.at(s)));const out=b.at(s);out.C.set(999,999,999);assert.deepEqual(snap(b.at(s)),snap(a.at(s)));}
 pts[1].y+=.01;assert.notEqual(kernels[1].limbPath(pts,hint),b);for(let i=0;i<8;i++){pts[1].y+=.01;kernels[1].limbPath(pts,hint);}assert.equal(kernels[1].extraLimbPaths.length,4);
 K.TANK={center:new THREE.Vector3(0,.8,-.1),tilt:.2};for(const tilt of [.2,.2,0,-0,.7,NaN,Infinity])for(const p of [new THREE.Vector3(.04,.8,-.1),new THREE.Vector3(.1,.9,-.07)]){K.TANK.tilt=tilt;assert.equal(kernels[1].plateMask(p),kernels[0].plateMask(p));}
 // distToPoly is private and its only caller ignores exact distances above .03.
 for(const poly of [Array.from({length:121},(_,i)=>new THREE.Vector3(Math.sin(i*.07)*.2,.6+i*.001,Math.cos(i*.05)*.1)),[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3(.1,0,0)]])for(let i=0;i<2000;i++){
  const p=new THREE.Vector3(Math.sin(i*1.23)*.4,Math.cos(i*.91)*.8,Math.sin(i*.43)*.2),old=kernels[0].distToPoly(p,poly),next=kernels[1].distToPoly(p,poly);assert.equal(next<=.03,old<=.03);if(old<=.03)assert.equal(next,old);
 }
});
test('live action clip maps preserve all priorities and changes without stale caches',()=>{
 const methods=pair('src/game/motion/source-controller.js').map(s=>{const a=s.indexOf(' actionClip('),b=s.indexOf('\n sampleManual',a);return new Function('return ({'+s.slice(a,b)+'});')().actionClip;});
 const names=['Attack_BBll','Attack_Rllr','Shoot_Nrml','Shoot_Rllr','ThrowBomb_Rllr','ThrowBomb_Nrml','Damage','ToHumanRespawn'];let checked=0;
 for(let mask=0;mask<256;mask++){const receiver={bank:{clips:new Map(names.filter((_,i)=>mask&(1<<i)).map(n=>[n,{}]))}};for(const family of ['Nrml','BBll','Rllr','Chrg','Glng','Sprd',undefined])for(const event of ['shoot','slosh','flick','charge_release','throw','hit','spawn','unknown',null,undefined]){assert.equal(methods[1].call(receiver,family,event),methods[0].call(receiver,family,event));checked++;}}
 assert.equal(checked,17920);
});
test('real source-loaded actor poses, all mesh attributes and RNG match at 30/60/120 Hz',async()=>{
 const calls=[0,0],apis=await Promise.all([baseline,candidate].map((transform,i)=>sourceLoadedActorFixture({sourceOnly:true,transform,random:()=>{calls[i]++;return .4;}})));
 const snapshot=ch=>{ch.root.updateMatrixWorld(true);ch.skeleton.update();return structuredClone({bones:ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),spring:Array.from(ch.sp),hair:Array.from(ch.sourceMotion.rootHair.state),phase:ch.phase,stance:Array.from(ch.stance),skeleton:Array.from(ch.skeleton.boneMatrices),muzzle:ch.getMuzzle(new THREE.Vector3()).toArray()});};
 let checks=0;try{for(const hz of [30,60,120]){const actors=await Promise.all(apis.map(a=>a.make())),chars=actors.map(a=>a.character);chars.forEach(ch=>{ch.onEvent=null;ch.setLod('hero');});for(const weapon of ['shooter','roller','slosher','charger'])for(let frame=0;frame<24;frame++){
  const dt=frame===3?0:frame===9?.1:1/hz;chars.forEach((ch,i)=>{if(frame===0)ch.setWeapon(weapon);apis[i].G.time+=dt;ch.root.position.x+=dt*(frame%3);ch.root.position.z+=dt*3;ch.root.rotation.y+=dt*.4;if(frame===5)ch.trigger('jump');if(frame===15)ch.trigger('land');ch.update(dt,{form:'kid',grounded:frame<5||frame>=15,speed:3,localMove:{x:.2,z:1},ink:1,hp:1,firing:frame%4===0,aimPitch:.15,aimDist:10,vy:frame<10?2:-2});});assert.deepEqual(snapshot(chars[1]),snapshot(chars[0]),`${hz}/${weapon}/${frame}`);checks++;
 }for(const tier of ['hero','game','far']){chars.forEach(ch=>ch.setLod(tier));const sets=chars.map(ch=>ch.lodSets.map(set=>set?.list.map(m=>({name:m.name,geometry:geometry(m.geometry)}))));assert.deepEqual(structuredClone(sets[1]),structuredClone(sets[0]));}apis.forEach(a=>a.reset());}assert.equal(calls[1],calls[0]);console.log(JSON.stringify({scope:'source-loaded actual Character; no browser/GPU/retail claim',poseComparisons:checks,randomCalls:calls}));}finally{apis.forEach(a=>a.reset());}
});
test('exact response slots preserve nonfinite and signed-zero values while sharing work across actors',()=>{
 const [,code]=pair('src/game/motion/source-controller.js'),helper=code.slice(code.indexOf('// Each immutable response'));
 const counts={exp:0,expm1:0},math=Object.create(Math);for(const k of ['exp','expm1'])math[k]=x=>{counts[k]++;return Math[k](x);};
 const names=['extraResponse24Exp','extraResponse12Exp','extraResponse10Expm1','extraResponse12Expm1','extraResponse7Exp','extraResponse8Expm1'],rates=[24,12,10,12,7,8];
 const funcs=new Function('Math',helper+'\nreturn ['+names+'];')(math);
 for(const dt of [undefined,0,-0,1/30,1/60,1/120,0.1,Number.MIN_VALUE,NaN,Infinity,-Infinity])for(let i=0;i<funcs.length;i++)assert.equal(funcs[i](dt),i===2||i===3||i===5?-Math.expm1(-rates[i]*dt):1-Math.exp(-rates[i]*dt));
 funcs.forEach(f=>f(1/60));counts.exp=counts.expm1=0;for(let frame=0;frame<120;frame++)for(let actor=0;actor<8;actor++)funcs.forEach(f=>f(1/60));assert.deepEqual(counts,{exp:0,expm1:0});
 funcs.forEach(f=>f(1/30));assert.deepEqual(counts,{exp:3,expm1:3});
});
test('dance lookup scans fallbacks only if both exact ordered preferred clips are absent',()=>{
 const kernels=pair('src/game/motion/source-controller.js').map(s=>{const body=s.split('\n').find(l=>l.includes('if(name===undefined){')&&l.includes('dances.set'));return new Function('prefix','family','let name;const dances=new Map(),danceKey=prefix+":"+family;'+body+';return name;');});
 for(const prefix of ['Win','Lose'])for(const family of ['Nrml','Rllr','BBll'])for(const entries of [[`${prefix}_${family}`,`${prefix}_Nrml`,`${prefix}_Other`],[`${prefix}_Nrml`,`${prefix}_Other`],[`${prefix}_Other`],['None']]){
  let scans=0;const clips=new Map(entries.map(n=>[n,{}])),keys=clips.keys;clips.keys=function(){scans++;return keys.call(this);};
  const receiver={bank:{clips},choose(candidates){for(const name of candidates)if(clips.has(name))return name;throw Error('No source clip in '+candidates.join(', '));}};
  let a,b;try{a=kernels[0].call(receiver,prefix,family);}catch(e){a=e.message;}scans=0;try{b=kernels[1].call(receiver,prefix,family);}catch(e){b=e.message;}assert.equal(b,a);assert.equal(scans,clips.has(`${prefix}_${family}`)||clips.has(`${prefix}_Nrml`)?0:1);
 }
});
