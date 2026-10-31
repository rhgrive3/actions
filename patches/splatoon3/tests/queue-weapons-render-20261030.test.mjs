import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const prior=name=>fs.readFileSync(new URL(`./fixtures/queue-weapons-render-20261030/${name}.txt`,import.meta.url),'utf8');
const json=value=>JSON.parse(JSON.stringify(value));

function idleBombCandidate(source){
 return source.replace('pose.set(value?.basePose || ch.P)','pose.set(value?.basePoseCurrent ? value.basePose : ch.P)')
  .replace('value.basePose ||= new Float32Array(this.P.length); value.basePose.set(this.P);',
   'value.basePoseCurrent=!!(value.throwing||this.bombHeld||owner?.weaponRunner?.aimingSub); if(value.basePoseCurrent){value.basePose ||= new Float32Array(this.P.length);value.basePose.set(this.P);}');
}
async function bombRig(candidate,baseline=false){
 const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.37,
  extraExports:"export {bombPreviewPosition,bombReleasePosition,bombMotionSnapshot,queueBombRefreshes} from './patches/splatoon3/runtime/bomb-motion.mjs';",
  adaptRuntime:(rel,source)=>{if(!rel.endsWith('/bomb-motion.mjs'))return source;
   let code=candidate?idleBombCandidate(source):baseline?prior('bomb-motion.mjs'):source;
   code=code.replace('else ch.root.updateMatrixWorld(true);','else { fullRefreshes++;ch.root.updateMatrixWorld(true); }');
   if(baseline)code=code.replace('    ch.root.updateMatrixWorld(true);','    fullRefreshes++;ch.root.updateMatrixWorld(true);');
   return 'let fullRefreshes=0;export const queueBombRefreshes=()=>fullRefreshes;\n'+code;}});
 f.G.scene=new f.THREE.Scene();f.G.level={blocks:[],groundHeight:()=>0,queryBlocks(_a,_b,_c,_d,out){out.length=0;return out;}};f.G.physics=new f.Physics(f.G.level);
 const a=new f.Actor({team:0,name:'bomb-copy',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 a.isLocal=true;a.grounded=true;a.ground.hit=true;const ch=a.character;ch.actor=a;ch.onEvent=null;f.G.actors=[a];f.G.scene.add(ch.root);
 const state=()=>f.Character.prototype[Symbol.for('inkwave.s3.bomb-motion.install.v1')].states.get(ch);
 let copies=0,observed;
 function step(dt,input={}){f.G.time+=dt;a.intent.sub=!!input.sub;a.weaponRunner.update(dt,input);a._finishFrame(dt);ch.root.updateMatrixWorld(true);
  const value=state();if(value?.basePose&&observed!==value.basePose){observed=value.basePose;const set=observed.set;observed.set=function(...args){copies++;return set.apply(this,args);};}}
 function snapshot(){const nodes=[];ch.root.traverse(n=>nodes.push([n.name,[...n.matrixWorld.elements],n.visible,n.bindMatrixInverse?[...n.bindMatrixInverse.elements]:null]));
  return json({P:[...ch.P],nodes,motion:f.bombMotionSnapshot(ch),preview:f.bombPreviewPosition(a,new f.THREE.Vector3(5,6,7)).toArray()});}
 return{f,a,ch,state,step,snapshot,copies:()=>copies,close(){f.G.projectiles.clear();ch.dispose();}};
}

test('reject idle bomb snapshot gate: real later pose overlays change first between-update preview',async()=>{
 for(const hz of [30,60,120]){const a=await bombRig(false),b=await bombRig(true);try{
  for(let frame=0;frame<8;frame++){a.step(1/hz);b.step(1/hz);assert.deepEqual(b.snapshot(),a.snapshot());}
  assert(a.copies()>5);assert.equal(b.copies(),0);
  for(const r of [a,b])r.a.weaponRunner.aimingSub=true;
  const before=a.snapshot(),after=b.snapshot();
  assert.deepEqual(after.P,before.P);assert.deepEqual(after.nodes,before.nodes);
  const delta=Math.hypot(...after.preview.map((v,i)=>v-before.preview[i]));
  assert(delta>1e-6,`copy elision changes the actual first release socket at ${hz} Hz: ${delta}`);
  // Production deliberately retains the snapshot. ch.P already includes
  // downstream installed pose overlays and is not the saved bomb base pose.
  assert.match(fs.readFileSync(new URL('../runtime/bomb-motion.mjs',import.meta.url),'utf8'),/value\.basePose\.set\(this\.P\)/);
 }finally{a.close();b.close();}}
});

test('bomb preview socket ancestry matches full traversal and restores the complete live rig',async()=>{
 const a=await bombRig(false,true),b=await bombRig(false);try{
  for(const dt of [1/30,1/60,1/120,0])for(let frame=0;frame<6;frame++){
   for(const r of [a,b]){r.a.yaw=frame*.31;r.a.pos.set(frame*.2,frame*.03,2);r.step(dt,{sub:true});}
   assert.deepEqual(b.snapshot(),a.snapshot(),'pose, full node matrices, preview and motion snapshot');
  }
  assert.equal(b.f.queueBombRefreshes(),0,'native rig uses the selective path');assert(a.f.queueBombRefreshes()>0);
  const timings={baseline:[],candidate:[]};
  for(let round=0;round<7;round++)for(const [key,r]of round%2?[['candidate',b],['baseline',a]]:[['baseline',a],['candidate',b]]){
   const out=new r.f.THREE.Vector3(),start=performance.now();for(let i=0;i<300;i++)r.f.bombPreviewPosition(r.a,out);timings[key].push(performance.now()-start);
  }
  const median=xs=>[...xs].sort((x,y)=>x-y)[xs.length>>1];
  fs.writeFileSync(new URL('../../../reports/queue-weapons-render-20261030/bomb-socket-timing.json',import.meta.url),JSON.stringify({scope:'Node actual production-composed rig, not device frame time',callsPerRun:300,timings,medianMs:{baseline:median(timings.baseline),candidate:median(timings.candidate)},fullRefreshes:{baseline:a.f.queueBombRefreshes(),candidate:b.f.queueBombRefreshes()}},null,2)+'\n');
  // A custom descendant update is observable even though it is unrelated to
  // the socket. Both versions must execute it through the full fallback.
  const calls=[];
  for(const r of [a,b]){const node=new r.f.THREE.Object3D();let count=0;const update=node.updateMatrixWorld;
   node.updateMatrixWorld=function(...args){count++;return update.apply(this,args);};r.ch.root.add(node);
   r.f.bombPreviewPosition(r.a,new r.f.THREE.Vector3());calls.push(count);r.ch.root.remove(node);}
  assert.deepEqual(calls,[1,1]);assert.deepEqual(b.snapshot(),a.snapshot());
 }finally{a.close();b.close();}
});

function dropsModule(source){
 const events=[],retired=[],timers=new Map();let starts=0,cancels=0;
 const api=new Function('registerLimitedDrop','retireLimitedDrop','coolerSegmentContact','setTimeout','clearTimeout',
  source.replace(/^import[^\n]*\n/gm,'').replace(/export /g,'')+'\nreturn {spawnTorpedoSplashes,clearTorpedoSplashes,beginTorpedoVisualBatch,endTorpedoVisualBatch};')
  (()=>{},d=>retired.push(d.index),()=>null,fn=>{const id={unref(){}};starts++;timers.set(id,fn);return id;},id=>{cancels++;timers.delete(id);});
 return{api,events,retired,timers,counts:()=>({starts,cancels})};
}
function fullClear(source,count){
 const m=dropsModule(source),system={},scene=new THREE.Scene(),listeners=new Map(),canvas={addEventListener:(key,fn)=>listeners.set(fn,key),removeEventListener:(_key,fn)=>listeners.delete(fn)};
 const owner={color:0x123456},parent={owner,team:0,seed:27,sourceLife:0,ghost:false,chasedTarget:{},spec:{gravity:24,splashDamage:12,splashAround:{count,pitchDegrees:65,velocityMin:25,velocityMax:29,paintRadius:2}}};
 m.api.spawnTorpedoSplashes({THREE,G:{scene,renderer:{domElement:canvas}}},system,parent,new THREE.Vector3(1,5,2));
 const old=system._s3TorpedoSplashes,drops=[...old],pools=[...system._s3TorpedoVisuals?.values()||[]];let splices=0;
 old.splice=function(...args){splices++;return Array.prototype.splice.apply(this,args);};
 const disposed=[];
 for(const p of pools)for(const [kind,o]of [['mesh',p.mesh],['geometry',p.mesh.geometry],['material',p.mesh.material]])o.addEventListener('dispose',()=>disposed.push([kind,old.length,system._s3TorpedoSplashes.length,p.users,p.mesh.count,p.mesh.visible]));
 m.api.beginTorpedoVisualBatch(system);system._s3TorpedoVisualPending=true;m.api.clearTorpedoSplashes(system);m.api.endTorpedoVisualBatch(system);
 return{retired:m.retired,disposed,splices,timers:m.counts(),state:{oldLength:old.length,newLength:system._s3TorpedoSplashes.length,children:scene.children.length,listeners:listeners.size,pools:system._s3TorpedoVisuals?.size||0,pending:system._s3TorpedoVisualPending,visuals:drops.map(d=>d.visual),users:pools.map(p=>p.users)}};
}
test('Torpedo/Fizzy full clear retires in order with exact disposal boundaries and no quadratic splice or throwaway timer',()=>{
 const current=fs.readFileSync(new URL('../runtime/torpedo-splashes.mjs',import.meta.url),'utf8');
 for(const count of [0,1,8,64,256,768]){const a=fullClear(prior('torpedo-splashes.mjs'),count),b=fullClear(current,count);
  assert.deepEqual(b.retired,a.retired);assert.deepEqual(b.disposed,a.disposed);assert.deepEqual(b.state,a.state);
  assert.equal(a.splices,count);assert.equal(b.splices,0);assert.equal(b.timers.starts,0);assert.equal(b.timers.cancels,0);
  if(count){assert.equal(a.timers.starts,1);assert.equal(a.timers.cancels,1);}
 }
});
