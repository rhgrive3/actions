import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {ALL_SUB_SPECS} from '../runtime/all-subs.mjs';
import {fidelityThrowVelocity,SUB_SPECIAL_FIDELITY} from '../runtime/sub-special-fidelity.mjs';
import {gearCurve} from '../runtime/gear.mjs';
import {spawnFizzySplashes,stepTorpedoSplashes,clearTorpedoSplashes,beginTorpedoVisualBatch,endTorpedoVisualBatch} from '../runtime/torpedo-splashes.mjs';
import {fixture} from './source-fixture.mjs';
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-subs-before-20261026.json',import.meta.url),'utf8'));
const source=fs.readFileSync(new URL('../runtime/all-subs.mjs',import.meta.url),'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
function current(name){const n=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return source.slice(n.start,n.end);}
function evaluate(code,env={}){return vm.runInNewContext('('+code+')',env);}
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite3=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
function random(seed){let n=seed;return()=>((n=Math.imul(n,1664525)+1013904223>>>0)/4294967296);}

test('sub defense materializes only the final nearest candidate with identical geometry and one-shot ownership',()=>{
  const rnd=random(81);
  const oldRadius="radius=object.subId==='torpedo'?.3:object.subId==='inkMine'?.38:.42";
  assert.equal(baseline.customObjectCandidate.split(oldRadius).length,2,'one historical radius anchor');
  const alignedBaseline=baseline.customObjectCandidate.replace(oldRadius,"radius=object.subId==='torpedo'?.3:object.subId==='inkMine'?.38:object.subId==='beakon'?.5:.42");
  for(let trial=0;trial<750;trial++){
    const rows=Array.from({length:trial%13},(_,i)=>({subId:i%3===0?'splashWall':i%3===1?'beakon':'torpedo',phase:i%3===2?'chase':'deployed',team:i%5?1:0,owner:{remote:i%4===0},ghost:i%7===0,hp:35,seq:i,pos:new THREE.Vector3(rnd()*6-3,rnd()*3-1,rnd()*10-3),yaw:rnd()*6}));
    const start=new THREE.Vector3(rnd()-.5,rnd()*2,rnd()-.5),end=new THREE.Vector3(rnd()*2-1,rnd()*2,8),p={team:0,owner:{remote:false},size:.2,damage:40,ghost:trial%11===0};
    const run=(code,legacy=false)=>{
      let vectors=0;class Vector3 extends THREE.Vector3{constructor(...a){super(...a);vectors++;}}
      const records=rows.map(o=>({...o,pos:o.pos.clone(),owner:{...o.owner}})),effects=[];
      // The current Beakon sphere is intentionally centered above its foot;
      // align the historical sphere to compare all other geometry and effects.
      if(legacy)for(const object of records)if(object.subId==='beakon')object.pos.y+=.48;
      const env={finite3,clamp,ALL_SUB_SPECS,syncObjectAttachment(){},targetableTorpedo:o=>o.subId==='torpedo'&&o.phase==='chase',objectDamageScale:()=>1,localOwner:o=>!!o&&!o.remote,emitObjectHit:(_api,o,_p,pt)=>effects.push(['proposal',o.seq,...pt.toArray()]),removeObject:(_api,_projectiles,o)=>{o.dead=true;effects.push(['remove',o.seq]);},blast:(_api,_p,pt)=>effects.push(['blast',...pt.toArray()])};
      const api={THREE:{Vector3},_allSubBeakonCenter:new THREE.Vector3(),_allSubBeakonOffset:new THREE.Vector3(0,.48,0)};
      const result=evaluate(code,env)(api, {_s3SubObjects:records},p,start,end);
      if(!result)return{result:null,vectors};
      const value={id:result.object.seq,t:result.t,distance:result.distance,point:result.point.toArray(),normal:result.normal.toArray(),visualOnly:result.visualOnly};
      value.first=result.onHit();value.second=result.onHit();value.hp=result.object.hp;value.settled=result.settled;value.effects=effects;
      return{result:value,vectors};
    };
    const before=run(alignedBaseline,true),after=run(current('customObjectCandidate'));
    assert.deepEqual(after.result,before.result);assert.ok(after.vectors<=2);assert.ok(after.vectors<=before.vectors);
  }
});

test('sub tick snapshot retains reverse visit order, next-step births, nested leases and finally reference release',()=>{
  const run=(code,throwing=false)=>{
    const log=[],a={id:'a',phase:'deployed'},b={id:'b',phase:'deployed'},c={id:'c',phase:'deployed'},system={_s3SubObjects:[a,b,c]};let nested=false,once=false,depth=0,fn;
    const env={entityList:p=>p._s3SubObjects,beginTorpedoVisualBatch(){depth++;},endTorpedoVisualBatch(){depth--;},stepTorpedoSplashes(){log.push('children');},burstTorpedoSplash(){},syncObjectAttachment(_a,o){log.push('attach:'+o.id);},activateSplashWall(){},updateAngleLine(){},updateFlight(){},removeObject(){},poseVisual(_a,o){log.push('pose:'+o.id);},updateStatuses(){log.push('statuses');},updateDeployed(api,p,o){
      log.push('step:'+o.id);if(throwing)throw Error('fixture callback');
      if(o===c&&!once){once=true;a.dead=true;p._s3SubObjects.splice(0,1);p._s3SubObjects.push({id:'born',phase:'deployed'});}
      if(o===b&&!nested){nested=true;fn(api,p,1/60);}
    }};
    fn=evaluate(code,env);try{fn({},system,1/60);}catch(e){assert.match(e.message,/fixture callback/);}
    assert.equal(depth,0);if(system._s3SubSnapshots){assert.equal(system._s3SubSnapshots.depth,0);for(const row of system._s3SubSnapshots.frames)assert.equal(row.length,0);}
    return log;
  };
  assert.deepEqual(run(current('tickObjects')),run(baseline.tickObjects));
  assert.deepEqual(run(current('tickObjects'),true),run(baseline.tickObjects,true));
});

test('angle tail caches immutable bounds and reuses scratch without changing capsule queries or marks',()=>{
  const run=code=>{
    const log=[],targets=Array.from({length:5},(_,i)=>({id:i,pos:new THREE.Vector3(i-2,0,2),netLife:0,form:i%2?'squid':'kid'}));
    const o={age:0,ghost:false,owner:{},spec:{collisionRadius:.1},seenMarks:new WeakMap(),lineEndsAtAge:3,lineSegments:[[new THREE.Vector3(-2,0,0),new THREE.Vector3(2,0,4)]]};
    let vectors=0;class Vector3 extends THREE.Vector3{constructor(...a){super(...a);vectors++;}}
    const api={THREE:{Vector3},PLAYER:{radius:.3,height:1.6,squidHeight:.6},Physics:{segmentCapsuleDist(start,end,base,r,h,result){log.push(['capsule',...base.toArray(),h]);result.t=.5;result.dist=Math.abs(base.x);}}};
    const fn=evaluate(code,{hostileActors:()=>targets,releaseHostileActors(){},ownerLife:x=>x.netLife,markAngleTarget(_a,object,t){object.seenMarks.set(t,t.netLife);log.push(['mark',t.id]);},removeObject(){log.push(['retire']);}});
    for(let i=0;i<20;i++){targets[2].netLife=i%4;fn(api,{},o,1/60);}
    return{log,vectors,age:o.age};
  };
  const before=run(baseline.updateAngleLine),after=run(current('updateAngleLine'));assert.deepEqual(after.log,before.log);assert.equal(after.age,before.age);assert.equal(after.vectors,1);assert.equal(before.vectors,20);
});

test('mine zero-owner index tracks birth and idempotent retirement and scans unknown array replacements',()=>{
  const helpers=['entityList','noteMineBirth','ownerMayHaveMine','removeObject'].map(current).join('\n');
  const api=vm.runInNewContext('(()=>{const mineOwners=new WeakMap();'+helpers+';return{entityList,noteMineBirth,ownerMayHaveMine,removeObject};})()',{
    retireReceiverTorpedoObservation(){},emitEvent(){},disposeVisual(){},sceneFor:()=>null,
  });
  const projectiles={},owner={},other={},list=api.entityList(projectiles);assert.equal(api.ownerMayHaveMine(projectiles,owner),false);
  const a={subId:'inkMine',owner,phase:'flight'},b={subId:'inkMine',owner,phase:'flight'};
  for(const mine of [a,b]){list.push(mine);api.noteMineBirth(projectiles,mine);}
  assert.equal(api.ownerMayHaveMine(projectiles,owner),true);assert.equal(api.ownerMayHaveMine(projectiles,other),false);
  a.phase=b.phase='deployed';api.removeObject({G:{}},projectiles,a,true);api.removeObject({G:{}},projectiles,a,true);assert.equal(api.ownerMayHaveMine(projectiles,owner),true);
  api.removeObject({G:{}},projectiles,b,true);assert.equal(api.ownerMayHaveMine(projectiles,owner),false);
  projectiles._s3SubObjects=[{subId:'inkMine',owner,phase:'deployed'}];assert.equal(api.ownerMayHaveMine(projectiles,owner),true,'external list replacement is unknown and retains the original scan');
});

function arcFunction(){let found;
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='AssignmentExpression'&&n.left?.property?.name==='updateArc'&&n.right.type==='FunctionExpression')found=source.slice(n.right.start,n.right.end);for(const v of Object.values(n)){if(Array.isArray(v)){for(const x of v)walk(x);}else if(v&&typeof v==='object')walk(v);}}walk(ast);return found;}
test('Burst preview scratch produces identical trajectory, ring, colors and arc cache across repeated renders',()=>{
  const run=(code,launch)=>{
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(96*3),3));geo.setAttribute('lineDistance',new THREE.Float32BufferAttribute(new Float32Array(96),1));
    class Hit{constructor(){this.hit=false;this.dist=0;this.point=new THREE.Vector3();this.normal=new THREE.Vector3();this.block=this.face=-1;this.u=this.v=0;}}
    const G={physics:{segment(a,b,out){out.hit=b.y<=0;if(out.hit){const t=a.y/(a.y-b.y);out.point.copy(a).lerp(b,t);out.normal.set(0,1,0);out.dist=a.distanceTo(out.point);}return out;}}};
    const api={THREE,Hit};const env={ALL_SUB_SPECS,G,api,STEP:1/60,SUB_SPECIAL_FIDELITY,fidelityThrowVelocity,gearCurve,subLaunchPosition:(_a,out)=>out,contactActor:()=>null,applyFlightPositionAirResist(o,dt){o.vel.multiplyScalar(dt===1/60?1-o.spec.flyPositionAirResist:Math.pow(1-o.spec.flyPositionAirResist,dt*60));},nativeArc(){this.nativeCalls=(this.nativeCalls||0)+1;}};
    env.launchVelocity=evaluate(launch,env);const fn=evaluate(code,env),system={arcGeo:geo,arcN:96,arcLine:{material:{color:new THREE.Color()}},arcRing:{position:new THREE.Vector3(),quaternion:new THREE.Quaternion(),material:{color:new THREE.Color()}}},out=[];
    for(let i=0;i<40;i++){
      const a={alive:true,weapon:{sub:'burst'},pos:new THREE.Vector3(i%4,0,i%3),vel:new THREE.Vector3(i%2,0,-i%3),aimYaw:i*.12,aimPitch:(i%6-2)*.15,s3:{abilityPoints:{subPower:i%58}},ink:i%2?100:0,color:new THREE.Color(.8,.3,.1)};
      fn.call(system,a,true);const n=geo.drawRange.count;
      out.push({points:Array.from(geo.attributes.position.array.slice(0,n*3)),distance:Array.from(geo.attributes.lineDistance.array.slice(0,n)),ring:system.arcRing.position.toArray(),q:system.arcRing.quaternion.toArray(),color:system.arcLine.material.color.toArray(),visible:system.arcRing.visible,cache:{...system._arcCache,physics:null}});
    }
    fn.call(system,{alive:true,weapon:{sub:'bomb'}},true);assert.equal(system.nativeCalls,1);
    if(system._s3BurstArcScratch){assert.equal(system._s3BurstArcScratch.depth,0);assert.equal(system._s3BurstArcScratch.frames[0].contact.owner,null);}
    return out;
  };
  assert.deepEqual(run(arcFunction(),current('launchVelocity')),run(baseline.updateArc,baseline.launchVelocity));
});

test('Torpedo/Fizzy visual batches flush once, retain idle mesh, and clear resources after reuse or scene change',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const scene=new THREE.Scene(),projectiles={},G={scene,physics:{segment:()=>({hit:false})}};const api={THREE,G,Hit:class{}};
  const source={spec:ALL_SUB_SPECS.fizzy,seed:5,owner:{remote:false,color:new THREE.Color('red')},team:0,subId:'fizzy',sourceLife:1};
  beginTorpedoVisualBatch(projectiles);spawnFizzySplashes(api,projectiles,source,new THREE.Vector3(0,2,0),0);
  const pool=projectiles._s3TorpedoVisuals.get(scene);let writes=0;const write=pool.mesh.setMatrixAt.bind(pool.mesh);pool.mesh.setMatrixAt=(...a)=>{writes++;return write(...a);};
  spawnFizzySplashes(api,projectiles,source,new THREE.Vector3(1,2,0),1);assert.equal(writes,0);endTorpedoVisualBatch(projectiles);assert.equal(writes,12);assert.equal(pool.mesh.count,12);
  const matrix=new THREE.Matrix4();for(let i=0;i<12;i++){pool.mesh.getMatrixAt(i,matrix);assert.ok(new THREE.Vector3().setFromMatrixPosition(matrix).distanceTo(projectiles._s3TorpedoSplashes[i].pos)<1e-5);}
  let scans=0;projectiles._s3TorpedoSplashes.indexOf=()=>{scans++;throw Error('known retirement index should be used');};
  for(const d of projectiles._s3TorpedoSplashes)d.pos.y=-200;stepTorpedoSplashes(api,projectiles,1/60,()=>{});assert.equal(scans,0);assert.equal(pool.users,0);assert.equal(pool.mesh.visible,false);assert.equal(pool.mesh.count,0);assert.equal(pool.mesh.parent,scene);
  spawnFizzySplashes(api,projectiles,source,new THREE.Vector3(0,2,0),2);assert.equal(projectiles._s3TorpedoVisuals.get(scene),pool);assert.equal(pool.mesh.count,6);assert.equal(pool.mesh.visible,true);
  delete projectiles._s3TorpedoSplashes.indexOf;for(const d of projectiles._s3TorpedoSplashes)d.pos.y=-200;stepTorpedoSplashes(api,projectiles,1/60,()=>{});t.mock.timers.tick(2000);assert.equal(pool.mesh.parent,null);assert.equal(projectiles._s3TorpedoVisuals.size,0);
  spawnFizzySplashes(api,projectiles,source,new THREE.Vector3(0,2,0),0);const next=projectiles._s3TorpedoVisuals.get(scene);for(const d of projectiles._s3TorpedoSplashes)d.pos.y=-200;stepTorpedoSplashes(api,projectiles,1/60,()=>{});
  G.scene=new THREE.Scene();spawnFizzySplashes(api,projectiles,source,new THREE.Vector3(),1);assert.equal(next.mesh.parent,null);clearTorpedoSplashes(projectiles);assert.equal(projectiles._s3TorpedoVisuals.size,0);assert.equal(projectiles._s3TorpedoSplashes.length,0);assert.equal(G.scene.children.length,0);
});

test('instant placement builds one model and remote deployment rebuilds once with final yaw and position',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.G.scene=new f.THREE.Scene();let builds=0;
  const add=f.G.scene.add.bind(f.G.scene);f.G.scene.add=(o)=>{if(o.userData.s3SubId)builds++;return add(o);};
  const actor=f.make('shooter');actor.pos.set(2,0,3);
  for(const sub of ['inkMine','beakon']){actor.weapon={...actor.weapon,sub};const before=builds,o=f.G.projectiles.throwBomb(actor);assert.equal(builds-before,1);assert.equal(o.phase,'deployed');assert.equal(o.s3Model.root.position.y,0);assert.equal(o.seenMarks,null);assert.equal(o.seenToxic,null);}
  const remote=f.make('shooter');remote.remote=true;remote.nid=91;remote.netLife=4;
  const birth={v:1,phase:'spawn',subId:'beakon',seq:80,eventSeq:1,life:4,sourceLife:4,x:0,y:1,z:0,vx:0,vy:0,vz:0,charge:0,seed:8,actor:remote};
  assert.equal(f.installedRuntime.replaySub(birth),true);const before=builds;assert.equal(f.installedRuntime.replaySub({...birth,phase:'deploy',eventSeq:2,x:3,y:2,z:4,yaw:.8,usesLeft:2}),true);assert.equal(builds-before,1);
  const obj=f.G.projectiles._s3SubObjects.find(o=>o.owner===remote);assert.deepEqual(Array.from(obj.mesh.position.toArray()),[3,2,4]);assert.equal(obj.mesh.rotation.y,.8);f.G.projectiles.clear();
});
