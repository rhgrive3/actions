import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {adaptRootHairSpring} from '../root-hair-spring-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';
import {BUILD_ONLY_PATCH_MODULES} from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {baseline,REL,rootHairFixture,makeHair,hairSnapshot} from './root-hair-fixture.mjs';
import {baseline as bankBaseline,REL as bankRel} from './pose-rotation-fixture.mjs';
import {adaptMotionFkHotpath} from '../motion-fk-hotpath-adapter.mjs';

test('frozen pre-optimization spring and strict build-only connections',()=>{
 assert.equal(createHash('sha256').update(baseline).digest('hex'),'a06dbce59bd1897ed7a9d266378b9a179ffb9cb1b8acfefa7327ae6b21ffb05b');
 assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/root-hair-spring-adapter.mjs'));
 const next=adaptRootHairSpring(REL,baseline,replaceOnce);
 assert.throws(()=>adaptRootHairSpring(REL,next,replaceOnce),/conflict/);
 assert.throws(()=>adaptRootHairSpring(REL,'',replaceOnce),/conflict/);
 assert.equal(adaptRootHairSpring('src/main.js','unchanged',replaceOnce),'unchanged');
});

test('exact spring state and bone transforms through rates, saturation, reset and coefficient changes',async()=>{
 const apis=await Promise.all([rootHairFixture(true),rootHairFixture()]);
 const pair=apis.map(api=>makeHair(api));let compared=0;
 for(const hz of [30,60,120])for(let i=0;i<240;i++){
  const dt=i%61===0?-0:i%31===0?0:i%19===0?.041:i%23===0?1/144:1/hz;
  for(const f of pair){
   f.root.rotation.set(Math.sin(i*.11)*.2,i*.031,Math.cos(i*.08)*.1);
   if(i===87){f.hair.chains[0].K*=1.07;f.hair.chains[1].D*=.97;}
   if(i===129)f.hair.reset();
   f.hair.update(dt,Math.sin(i*.077)*(i%53===0?500:7));
  }
  assert.deepEqual(hairSnapshot(pair[1]),hairSnapshot(pair[0]),`${hz}Hz/${i}`);compared++;
 }
 for(const [dt,rate]of [[-1,1],[NaN,1],[.02,NaN],[.02,Infinity]]){
  pair.forEach(f=>f.hair.update(dt,rate));assert.deepEqual(hairSnapshot(pair[1]),hairSnapshot(pair[0]));
 }
 const records=pair[1].hair.chains.map(e=>e._iwSpring);
 for(let i=0;i<90;i++)pair[1].hair.update([0,1/120,1/60,1/30][i%4],i*.01);
 assert.ok(records.every((r,i)=>r===pair[1].hair.chains[i]._iwSpring),'one record per segment even with irregular dt');
 assert.equal(new Set(records).size,records.length,'segments own distinct bounded records');
 console.log(JSON.stringify({scope:'actual Three.js bones; exact Float64 state',compared,cacheRecords:records.length}));
});

test('fixed tick exp/cos/sin work falls to zero after first tick; changing dt reuses axes',async()=>{
 const counts=[];
 for(const old of [true,false]){
  const api=await rootHairFixture(old),f=makeHair(api),math=api.VM_MATH,count={sqrt:0,exp:0,cos:0,sin:0},restore=[];
  for(const key of Object.keys(count)){const native=math[key];math[key]=(...args)=>{count[key]++;return native(...args);};restore.push(()=>math[key]=native);}
  try{
   f.hair.update(1/60,1);Object.keys(count).forEach(k=>count[k]=0);
   for(let i=0;i<120;i++)f.hair.update(1/60,Math.sin(i*.1));
   counts.push({...count});
   if(!old){assert.deepEqual(count,{sqrt:0,exp:0,cos:0,sin:0});f.hair.update(1/30,2);assert.deepEqual(count,{sqrt:24,exp:24,cos:24,sin:24});}
  }finally{restore.forEach(f=>f());}
 }
 assert.equal(counts[0].exp,8640);console.log(JSON.stringify({scope:'6 strands x4 segments x3 axes, 120 warmed fixed ticks',before:counts[0],after:counts[1]}));
});

test('loaded production Character preserves turns, gait, feet, skeleton and muzzle at 30/60/120Hz',async()=>{
 const before=(rel,raw)=>rel===REL?baseline:rel===bankRel?bankBaseline:adaptBuildSource(rel,raw);
 let emittedTransform=null;
 if(process.env.INKWAVE_BUILT_SITE){
  const {transform}=await import('esbuild'),oldModules=new Map();
  for(const [rel,raw]of [[REL,baseline],[bankRel,adaptMotionFkHotpath(bankRel,bankBaseline,replaceOnce)]])oldModules.set(rel,(await transform(raw,{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline'})).code);
  emittedTransform=(rel,raw)=>oldModules.get(rel)||raw;
 }
 const apis=await Promise.all([sourceLoadedActorFixture({transform:before,sourceOnly:!emittedTransform,emittedTransform,random:()=>.4}),sourceLoadedActorFixture({random:()=>.4})]);
 let frames=0,active=0;
 try{for(const hz of [30,60,120]){
  const actors=await Promise.all(apis.map(a=>a.make()));
  for(let i=0;i<150;i++){
   const dt=i%41===0?0:i%29===0?.019:1/hz;
   for(let k=0;k<2;k++){
    const a=actors[k],ch=a.character,ang=i*.041,speed=i<25?0:4;
    ch.root.position.set(Math.sin(ang)*2,0,Math.cos(ang)*2);ch.root.rotation.y=ang;
    apis[k].G.time+=dt;ch.update(dt,{form:'kid',grounded:true,speed,localMove:{x:Math.sin(ang),z:Math.cos(ang)},firing:i>80,charge:0,ink:1,hp:1,vy:0,aimPitch:.12});
    ch.root.updateMatrixWorld(true);ch.skeleton.update();
   }
   const snapshot=a=>{const ch=a.character;return {hair:Array.from(ch.sourceMotion.rootHair.state),bones:ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),skeleton:Array.from(ch.skeleton.boneMatrices),muzzle:ch.getMuzzle(new apis[0].THREE.Vector3()).toArray(),contact:ch.sourceMotion.contact};};
   assert.deepEqual(structuredClone(snapshot(actors[1])),structuredClone(snapshot(actors[0])),`${hz}Hz frame${i}`);
   if(actors[1].character.sourceMotion.rootHair.state.some(x=>x!==0))active++;frames++;
  }
  apis.forEach(a=>a.reset());
 }}finally{apis.forEach(a=>a.reset());}
 assert.ok(active>100,'live root turn inertia actually integrated');
 console.log(JSON.stringify({scope:'loaded production source motion',frames,nonzeroInertiaFrames:active}));
});
