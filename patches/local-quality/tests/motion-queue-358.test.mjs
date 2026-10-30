import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {replaceOnce} from '../adapter.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

// Frozen production composition at the integrated batch305 base, not raw upstream.
const old=name=>fs.readFileSync(new URL('./fixtures/'+name+'-7c94a8b-before-358.mjs.txt',import.meta.url),'utf8').trimEnd();
const read=rel=>adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
const leaf=(code,names,G={},math=Math)=>new Function('THREE','G','Math',code.replace(/^import .*;$/gm,'').replaceAll('export ','')+'\nreturn {'+names+'};')(THREE,G,math);
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
function geometry(g){return {attributes:Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,{size:a.itemSize,normalized:a.normalized,bytes:bytes(a.array)}])),index:bytes(g.index.array),sphere:g.boundingSphere&&[g.boundingSphere.center.toArray(),g.boundingSphere.radius]};}
function geometryHashes(g){const hash=a=>createHash('sha256').update(bytes(a)).digest('hex');return{attributes:Object.fromEntries(Object.entries(g.attributes).map(([n,a])=>[n,[a.itemSize,a.normalized,hash(a.array)]])),index:g.index&&hash(g.index.array),sphere:g.boundingSphere&&[Array.from(g.boundingSphere.center.toArray()),g.boundingSphere.radius]};}
const rng=()=>{let seed=358;return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);};
const countedMath=()=>{const math=Object.create(Math),calls={sin:0,cos:0};for(const n of ['sin','cos'])math[n]=x=>{calls[n]++;return Math[n](x);};return{math,calls};};

test('head center reuse preserves signed-zero/nonfinite surface outputs and all twelve face builds',()=>{
 const G={settings:{quality:'high'}},kernels=[old('character-face'),read('src/game/character-face.js')].map(code=>leaf(code,'headSurfFace,buildFaceSkin',G));
 const random=rng();let comparisons=0;
 const check=(az,el,off,normal)=>{const out=kernels.map(()=>new THREE.Vector3()),n=kernels.map(()=>normal?new THREE.Vector3():null);kernels.forEach((k,i)=>k.headSurfFace(az,el,off,out[i],n[i]));assert.deepEqual(out[1].toArray(),out[0].toArray());if(normal)assert.deepEqual(n[1].toArray(),n[0].toArray());comparisons++;};
 for(let i=0;i<100000;i++)check((random()-.5)*32,(random()-.5)*4,(random()-.5)*.1,!!(i%2));
 for(const az of [0,-0,Math.PI,-Math.PI,NaN,Infinity,-Infinity])for(const el of [0,-0,1.55,-1.55,1.555,-1.555,1.55500000001,-1.55500000001,Math.PI/2,-Math.PI/2,NaN,Infinity,-Infinity])for(const off of [0,-0,.02,-.02])check(az,el,off,true);
 let vertices=0;for(const quality of ['low','medium','high','ultra'])for(const lod of ['hero','game','far']){G.settings.quality=quality;const faces=kernels.map(k=>k.buildFaceSkin(lod));assert.deepEqual(geometry(faces[1].geo),geometry(faces[0].geo),quality+'/'+lod);assert.deepEqual(bytes(faces[1].ao),bytes(faces[0].ao));vertices+=faces[1].geo.attributes.position.count;faces.forEach(f=>f.geo.dispose());}
 const counts=[0,0];[old('character-face'),read('src/game/character-face.js')].forEach((code,i)=>{const k=leaf(code.replace('export function headShape(dx, dy, dz, out) {','export function headShape(dx, dy, dz, out) { G.count();'),'headSurfFace',{count(){counts[i]++;}});counts[i]=0;k.headSurfFace(.2,-0,0,new THREE.Vector3());});assert.deepEqual(counts,[4,3]);
 console.log(JSON.stringify({scope:'actual composed head/face, no rendered-device claim',comparisons,faceVariants:12,vertices,centerShapeCalls:counts}));
});

test('tube bases and suction angle tables preserve callbacks, custom methods and exact buffers',()=>{
 const source=[old('character-hair'),read('src/game/character-hair.js')],kernels=source.map(code=>leaf(code,'TentacleSurface,tentacleTube,suctionCups,hairDetail'));let tubes=0,cups=0;
 for(const quality of ['low','medium','high','ultra'])for(const lod of ['hero','game','far'])for(const callback of [false,true]){
  const traces=[[],[]],detail=kernels[0].hairDetail(lod,quality),surfaces=kernels.map((k,i)=>new k.TentacleSurface([[0,0,0],[.05,.2,.03],[.1,.5,-.02],[-.03,.8,.07]],{samples:32,radius:t=>.09*(1-t*.8),flat:t=>.6+t*.2,twist:t=>t*.7,section:callback?(c,s,t)=>{traces[i].push([c,s,t]);return[c*(1+t*.1),s*.8];}:undefined}));
  const outputs=kernels.map((k,i)=>k.tentacleTube(surfaces[i],{rings:Math.max(4,Math.round(detail.ringsPerM*.8)),radial:detail.radial,tipSteps:detail.tipSteps,t0:-.01,t1:1.01,capStart:callback}));
  assert.deepEqual(geometry(outputs[1].geo),geometry(outputs[0].geo));for(const n of ['t','cs','sn','thick','rings'])assert.deepEqual(outputs[1][n],outputs[0][n]);assert.deepEqual(traces[1],traces[0]);outputs.forEach(o=>o.geo.dispose());tubes++;
  for(const skipMode of ['none','all','mixed'])for(const prof of ['hi','lo']){
   const calls=[[],[]],out=kernels.map((k,i)=>k.suctionCups(surfaces[i],{radial:detail.cups?.radial??6,prof,rows:[{th:0,phase:0},{th:.6,phase:.5}],from:.2,to:.42,size:t=>.016*(1-t*.4),skip:(p,t,R)=>{calls[i].push([p.toArray(),t,R]);return skipMode==='all'||skipMode==='mixed'&&t>.3;}}));
   assert.deepEqual(geometry(out[1].geo),geometry(out[0].geo));for(const n of ['t','ring','list'])assert.deepEqual(out[1][n],out[0][n]);assert.deepEqual(calls[1],calls[0]);out.forEach(o=>o.geo.dispose());cups++;
  }
  for(const t of [0,-0,-.1,1,1.1])for(const a of [0,-0,.2,Math.PI,NaN,Infinity])assert.deepEqual(surfaces[1].offset(t,a),surfaces[0].offset(t,a));
 }
 // A customized section method or offsetInto still owns its original arithmetic.
 for(const custom of ['section','offsetInto']){const surfaces=kernels.map(k=>new k.TentacleSurface([[0,0,0],[0,.3,0],[.1,.6,0]],{samples:24,radius:()=>.04}));surfaces.forEach(s=>{const original=s[custom];s[custom]=function(...args){if(custom==='offsetInto')assert.equal(args.length,5,'custom override keeps original argument count');const out=original.apply(this,args);if(custom==='section')out.tw=.5;else out[0]+=.001;return out;};});const out=kernels.map((k,i)=>k.tentacleTube(surfaces[i],{radial:7,rings:8}));assert.deepEqual(geometry(out[1].geo),geometry(out[0].geo));out.forEach(o=>o.geo.dispose());}
 for(const radial of [0,1,6,7.5,16])for(const metric of [0,1e-9,1e-6,.1]){const out=kernels.map(k=>k.suctionCups({len:1,frame(t,P,T,O,B){P.set(t*metric,0,0);T.set(1,0,0);O.set(0,1,0);B.set(0,0,1);return P;},point(t,a,p){return p.set(t*metric,a*metric,0);},normal(_t,_a,n){return n.set(0,0,1);}},{radial,rows:[{th:-0}],from:0,to:.03,size:()=>.016}));assert.deepEqual(geometry(out[1].geo),geometry(out[0].geo));for(const n of ['t','ring','list'])assert.deepEqual(out[1][n],out[0][n]);out.forEach(o=>o.geo.dispose());cups++;}
 const trig=source.map(code=>{const counted=countedMath(),k=leaf(code,'TentacleSurface,tentacleTube,suctionCups',{},counted.math),s=new k.TentacleSurface([[0,0,0],[.03,.3,0],[.05,.7,.01]],{samples:24,radius:()=>.05,twist:t=>t*.2});counted.calls.sin=counted.calls.cos=0;const tube=k.tentacleTube(s,{radial:16,rings:32});const tubeCalls=counted.calls.sin+counted.calls.cos;tube.geo.dispose();const surface={len:1,frame(t,P,T,O,B){P.set(t,0,0);T.set(1,0,0);O.set(0,1,0);B.set(0,0,1);return P;},point(t,a,out){return out.set(t,a,0);},normal(_t,_a,out){return out.set(0,0,1);}};counted.calls.sin=counted.calls.cos=0;const cup=k.suctionCups(surface,{radial:9,rows:[{th:0}],from:0,to:.15,size:()=>.016});const cupCalls=counted.calls.sin+counted.calls.cos;cup.geo.dispose();counted.calls.sin=counted.calls.cos=0;k.suctionCups(surface,{radial:9,rows:[{th:0}],from:0,to:.15,size:()=>.016,skip:()=>true}).geo.dispose();assert.equal(counted.calls.sin+counted.calls.cos,0);return{tubeCalls,cupCalls};});assert.ok(trig[1].tubeCalls<trig[0].tubeCalls);assert.ok(trig[1].cupCalls<trig[0].cupCalls);
 console.log(JSON.stringify({scope:'actual composed geometry and callback order',tubes,cups,trig}));
});

function fitSource(code){
 const i=code.indexOf('  function fit('),end=code.indexOf('\n  function riderPose(',i);
 assert.ok(i>=0&&end>i,'isolate the held-item fit without removing the independent rider pose owner');
 return code.slice(i,end);
}
test('special held fit exits only after both constraints perform no projection',()=>{
 const code=fs.readFileSync(new URL('../../splatoon3/runtime/special-motion.mjs',import.meta.url),'utf8'),fits=[old('special-fit'),fitSource(code)].map(s=>new Function(s+'\nreturn fit;')()),random=rng();let before=0,after=0,nonconverged=0;
 // Mirror the real held-prop hierarchy before fit measures refreshed world matrices.
 // Count full subtree passes, not localToWorld's parent-only ancestor refreshes.
 function run(fit,position,left,right,radius,rotation){
  let lengths=0,updates=0;const mk=side=>({a:radius,b:radius,up:{position:new THREE.Vector3(side*.18,0,0),parent:{position:new THREE.Vector3(0,1,0),quaternion:new THREE.Quaternion()}}}),m={shoulders:[new THREE.Vector3(),new THREE.Vector3()],handQ:new THREE.Quaternion(),a:new THREE.Vector3(),b:new THREE.Vector3(),p:new THREE.Vector3(),pole:new THREE.Vector3()},g=new THREE.Group(),kid=new THREE.Group();g.position.fromArray(position);g.quaternion.fromArray(rotation);g.userData={handL:new THREE.Vector3(...left),handR:new THREE.Vector3(...right),handQL:new THREE.Quaternion(),handQR:new THREE.Quaternion(),gripL:new THREE.Vector3(...left),gripR:new THREE.Vector3(...right),holeL:new THREE.Vector3(),holeR:new THREE.Vector3()};const trace=[],ch={limbs:{armL:mk(1),armR:mk(-1)},bones:{handL:new THREE.Bone(),handR:new THREE.Bone()},kid,_kidXform(p,out,q){out.copy(p.position);q.copy(p.quaternion);},_solveLimb(_limb,p,pole,q,w,side){trace.push([p.toArray(),pole.toArray(),q.toArray(),w,side]);}};kid.add(g,ch.bones.handL,ch.bones.handR);const update=kid.updateWorldMatrix;kid.updateWorldMatrix=function(updateParents,updateChildren){if(updateChildren)updates++;return update.call(this,updateParents,updateChildren);};const length=m.b.length;m.b.length=function(){lengths++;return length.call(this);};fit(ch,m,g);return{position:g.position.toArray(),trace,error:m.error,a:m.a.toArray(),b:m.b.toArray(),lengths,updates};
 }
 for(let i=0;i<12000;i++){const p=i<8?[[0,1,0],[-0,1,-0],[1e-12,1,-1e-12],[20,20,20],[NaN,1,0],[Infinity,0,0],[-Infinity,0,0],[0,0,0]][i]:[(random()-.5)*8,random()*5,(random()-.5)*8],left=[(random()-.5)*2,random()-.5,random()-.5],right=[(random()-.5)*2,random()-.5,random()-.5],r=.05+random(),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(random()*3,random()*6,random()*3)).toArray();const rows=fits.map(f=>run(f,p,left,right,r,q));before+=rows[0].lengths;after+=rows[1].lengths;if(rows[1].lengths===40)nonconverged++;assert.equal(rows[0].lengths,40);const withoutCount=r=>({...r,lengths:0});assert.deepEqual(withoutCount(rows[1]),withoutCount(rows[0]),'fit case '+i);}
 const stable=fits.map(f=>run(f,[0,1,0],[0,0,0],[0,0,0],1,[0,0,0,1]));assert.deepEqual(stable.map(r=>r.lengths),[40,2]);assert.ok(nonconverged>0&&after<before);
 console.log(JSON.stringify({scope:'actual Three.js fit arithmetic, no rendered-device claim',cases:12000,before,after,nonconverged,stableChecks:stable.map(r=>r.lengths)}));
});

function baselineModule(rel,code){
 if(rel==='src/game/character-face.js')return old('character-face');
 if(rel==='src/game/character-hair.js')return old('character-hair');
 if(rel==='src/game/motion/retarget.js'){if(!code.includes(' applyAccessories('))code=read(rel);const start=code.indexOf(' applyAccessories('),end=code.indexOf('\n /** Correct terrain',start);return code.slice(0,start)+old('retarget')+code.slice(end);}
 if(rel==='patches/splatoon3/runtime/special-motion.mjs'){if(!code.includes('  function fit('))code=fs.readFileSync(new URL('../../splatoon3/runtime/special-motion.mjs',import.meta.url),'utf8');return replaceOnce(code,fitSource(code),old('special-fit'),'batch358 original special fit');}
 return code;
}
function snapshot(a,api){const ch=a.character,m=ch.sourceMotion;ch.root.updateMatrixWorld(true);ch.skeleton.update();return structuredClone({bones:ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),skeleton:Array.from(ch.skeleton.boneMatrices),hair:m.retarget.accessories.map(e=>({hair:e.hair,ready:e.hairReady,q:e.hairQ.toArray()})),muzzle:ch.getMuzzle(new api.THREE.Vector3()).toArray(),special:api.specialPresentationSnapshot(ch),contacts:m.retarget.contacts.map(f=>[f.locked,f.anchor.toArray(),f.lastClearance])});}
test('real source-loaded Characters preserve hair/manual/held-special poses and geometry at 30/60/120Hz',async()=>{
 const rngCalls=[0,0],apis=await Promise.all([sourceLoadedActorFixture({sourceOnly:!process.env.INKWAVE_BUILT_SITE,random:()=>{rngCalls[0]++;return .4;},moduleTransform:baselineModule}),sourceLoadedActorFixture({sourceOnly:!process.env.INKWAVE_BUILT_SITE,random:()=>{rngCalls[1]++;return .4;}})]);let comparisons=0;const counters=[0,0];
 try{for(const hz of [30,60,120]){const actors=await Promise.all(apis.map(a=>a.make())),chars=actors.map(a=>a.character);chars.forEach((ch,k)=>{ch.onEvent=null;const proto=Object.getPrototypeOf(ch.sourceMotion.retarget.q),original=proto.multiply;proto.multiply=function(...args){counters[k]++;return original.apply(this,args);};});
  for(const tier of ['hero','game','far']){chars.forEach(ch=>ch.setLod(tier));const meshes=chars.map(ch=>{const out=[];ch.root.traverse(o=>{if(o.geometry?.attributes.position)out.push(geometryHashes(o.geometry));});return out;});assert.deepEqual(meshes[1],meshes[0],tier+' full Character buffers');}
  chars.forEach(ch=>ch.setLod('hero'));
  for(const variant of ['Player00','Player01']){await Promise.all(chars.map(ch=>ch.sourceMotion.setVariant(variant)));
   // Registered accessories must never write the head or its ancestor.
   chars.forEach(ch=>{const ancestors=new Set();for(let b=ch.bones.head;b;b=b.parent)ancestors.add(b);for(const e of ch.sourceMotion.retarget.accessories)assert.ok(!ancestors.has(e.bone));});
   for(const phase of ['idle','walk','turn','manual','trizooka','inkVac','squid','return'])for(let frame=0;frame<Math.ceil(hz*.1);frame++){
    actors.forEach((a,k)=>{const api=apis[k],ch=a.character,dt=frame===2?0:frame===3?.1:1/hz;api.G.time+=dt;
     if(!frame){if(phase==='manual')ch.sourceMotion.playClip('WalkHold_Nrml',{frame:3});else ch.sourceMotion.stopClip();a.specialActive=phase==='trizooka'||phase==='inkVac'?{id:phase,start:api.G.time,age:0}:null;}
     const speed=phase==='walk'?2:0;ch.root.position.z+=speed*dt;if(phase==='turn')ch.root.rotation.y+=dt*.8;
     ch.update(dt,{form:phase==='squid'?'squid':'kid',grounded:true,speed,localMove:{x:0,z:speed?1:0},ink:1,hp:1,aimPitch:.1});
     if(phase==='trizooka'||phase==='inkVac')assert.equal(api.specialPresentationSnapshot(ch)?.kind,phase,'actual held-special owner');
    });assert.deepEqual(snapshot(actors[1],apis[1]),snapshot(actors[0],apis[0]),variant+'/'+hz+'/'+phase+'/'+frame);comparisons++;
   }
  }apis.forEach(a=>a.reset());
 }}finally{apis.forEach(a=>a.reset());}
 assert.ok(counters[1]<counters[0]);assert.equal(rngCalls[1],rngCalls[0]);console.log(JSON.stringify({scope:'real Character transforms and geometry; no screenshot/device claim',emitted:!!process.env.INKWAVE_BUILT_SITE,comparisons,quaternionMultiplyCalls:counters,rngCalls}));
});
