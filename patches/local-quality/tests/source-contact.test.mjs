import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptMotionFkHotpath as adaptSourceContact} from '../motion-fk-hotpath-adapter.mjs';
import {replaceOnce} from '../adapter.mjs';
import {BUILD_ONLY_PATCH_MODULES} from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {baselineSourceContact,indexedSoleGeometry,contactPoseSnapshot} from './source-contact-fixture.mjs';
const read=rel=>fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');

test('source-contact edits fail closed and stay out of the browser payload',()=>{
 assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/motion-fk-hotpath-adapter.mjs'));
 for(const rel of ['src/game/motion/contact-transition.js']){
  const raw=read(rel),next=adaptSourceContact(rel,raw,replaceOnce);assert.notEqual(next,raw);
  assert.throws(()=>adaptSourceContact(rel,next,replaceOnce),/conflict/);
  assert.throws(()=>adaptSourceContact(rel,'',replaceOnce),/conflict/);
 }
 assert.equal(adaptSourceContact('src/game/actor.js','same',replaceOnce),'same');
 const retarget=read('src/game/motion/retarget.js');assert.equal(adaptSourceContact('src/game/motion/retarget.js',retarget,replaceOnce),retarget,'rejected sole experiment never enters production');
});
async function transitionClass(candidate,counters){
 const context=vm.createContext({counters});
 const three=new vm.SyntheticModule(['Vector3'],function(){this.setExport('Vector3',THREE.Vector3);},{context});
 const bank=new vm.SyntheticModule(['clamp'],function(){this.setExport('clamp',(v,a,b)=>{counters.clamp++;return Math.max(a,Math.min(b,v));});},{context});
 const rel='src/game/motion/contact-transition.js',raw=read(rel),source=(candidate?adaptSourceContact(rel,raw,replaceOnce):raw).replace('u2=u*u','u2=(counters.polynomial++,u*u)'),m=new vm.SourceTextModule(source,{context});
 await m.link(s=>s==='three'?three:bank);await m.evaluate();return m.namespace.ContactTransition;
}
test('settled contact bypass preserves transitions, signed zero, nonfinite offsets and paused ticks exactly',async()=>{
 const counts=[{clamp:0,polynomial:0},{clamp:0,polynomial:0}],Classes=await Promise.all(counts.map((n,k)=>transitionClass(k,n)));
 const snapshot=f=>[...f.position.toArray(),...f.velocity.toArray(),...f.offset.toArray(),...f.offsetVelocity.toArray(),f.age,f.duration,f.ready];
 let checked=0;
 for(const duration of [.0001,.13,.36,Infinity,NaN])for(const x of [0,-0,.4,-1,Infinity,-Infinity,NaN]){
  const states=Classes.map(C=>new C()),goal=new THREE.Vector3(x,-x,.3),velocity=new THREE.Vector3(-x,x,-0);
  for(const f of states){f.advance(goal,velocity,0);f.transition(new THREE.Vector3(.1,0,-.3),new THREE.Vector3(0,-0,2),duration);}
  for(const dt of [0,-.1,duration*.1,duration*.899999,duration*.000001,0,duration,1/30,1/120]){
   states.forEach(f=>f.advance(goal,velocity,dt));assert.deepEqual(snapshot(states[1]),snapshot(states[0]));checked++;
  }
  states.forEach(f=>{f.transition(goal,velocity,duration);f.advance(goal,velocity,duration*.2);});assert.deepEqual(snapshot(states[1]),snapshot(states[0]));checked++;
 }
 assert.equal(counts[1].clamp,counts[0].clamp);assert.ok(counts[1].polynomial<counts[0].polynomial);console.log(JSON.stringify({scope:'actual Three.Vector3 and ContactTransition source, no renderer',checked,counts}));
});
test('actual loaded actors preserve full poses, source contacts and indexed soles across movement and frame intervals',async()=>{
 const apis=await Promise.all([sourceLoadedActorFixture({sourceOnly:true,transform:baselineSourceContact,random:()=>.4}),sourceLoadedActorFixture({sourceOnly:true,random:()=>.4})]);
 const rows=[],states=new Set();let compared=0,settledContacts=0;
 try{for(const variant of ['Player00','Player01'])for(const hz of [30,60,120]){
  const slope=hz===30?.08:hz===120?-.08:0;
  const actors=await Promise.all(apis.map(a=>a.make()));
  const probes=[{ground:0,ik:0},{ground:0,ik:0}];
  for(let k=0;k<2;k++){
   const c=actors[k].character,ground=c._ground,solve=c._solveLimb;
   if(variant==='Player01')await c.sourceMotion.setVariant(variant);
   c.onEvent=null;
   c._ground=function(x,z,n){probes[k].ground++;if(!slope)return ground.call(this,x,z,n);n?.set(-slope,1,-slope*.4).normalize();return slope*x+slope*.4*z;};
   c._solveLimb=function(...args){probes[k].ik++;return solve.apply(this,args);};
  }
  const stages=[[0,0,0,false],[0,.15,0,false],[0,1,0,false],[1,0,0,true],[0,-1,0,false],[0,0,1,false],[0,0,0,false]];
  for(let stage=0;stage<stages.length;stage++)for(let frame=0;frame<Math.ceil(hz*(stage===0?.8:stage===6?.6:.25));frame++){
   const [x,z,jump,firing]=stages[stage],dt=frame===3?0:frame===5?.1:frame===7?1/144:1/hz;
   for(let k=0;k<2;k++){
    const a=actors[k],api=apis[k];a.intent.move.set(x,0,z);a.intent.fire=firing;a.intent.jump=!!jump&&frame===0;
    api.tick(a,dt);
   }
   assert.deepEqual(contactPoseSnapshot(actors[1].character),contactPoseSnapshot(actors[0].character),variant+' '+hz+'Hz stage '+stage+' frame '+frame);compared++;
   const motion=actors[1].character.sourceMotion;states.add(motion.state);settledContacts+=motion.retarget.contacts.filter(f=>f.filter.ready&&f.filter.age>=f.filter.duration).length;
  }
  assert.deepEqual(probes[1],probes[0],'no additional terrain query or IK pass');
  const chars=actors.map(a=>a.character),feet=chars.map(c=>c.sourceMotion.retarget.contacts);
  const geometry=chars.map((c,k)=>indexedSoleGeometry(c,apis[k].THREE,(x,z)=>slope*x+slope*.4*z));
  for(const g of geometry.flat())assert.ok(g.vertices>20&&Number.isFinite(g.minimum),'actual indexed shoe geometry denominator');
  assert.deepEqual(geometry[1],geometry[0],'no new mesh penetration or hover');
  rows.push({variant,slope,hz,probes,clearance:feet.map(p=>p.map(f=>f.lastClearance)),geometry});apis.forEach(a=>a.reset());
 }}finally{apis.forEach(a=>a.reset());}
 for(const s of ['idle','move','air'])assert.ok(states.has(s),'actual '+s+' owner covered');assert.ok(settledContacts>20,'actual settled contact denominator');
 console.log(JSON.stringify({scope:'production source-loaded Actor/Runner/Physics, full native/source poses and indexed/skinned shoes; slope ground probes analytic planes; CPU, not GPU/device',compared,states:[...states],settledContacts,rows}));
});
