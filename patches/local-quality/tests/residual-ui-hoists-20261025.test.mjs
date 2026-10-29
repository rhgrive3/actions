import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/residual-ui-before.json',import.meta.url)));
function source(file,name){const s=fs.readFileSync(new URL('../../../'+file,import.meta.url),'utf8'),ast=parse(s,{sourceType:'module',ecmaVersion:'latest'}),n=ast.body.map(x=>x.declaration||x).find(x=>x.type==='FunctionDeclaration'&&x.id.name===name);assert(n,name);return s.slice(n.start,n.end);}
const currentMove=source('patches/splatoon3/runtime/all-specials.mjs','moveActor'),currentDamp=source('patches/splatoon3/runtime/all-specials.mjs','dampForSpecial'),currentHit=source('patches/splatoon3/runtime/all-subs.mjs','applyRemoteObjectHit');
// Preserve the frozen Vector3 implementation while applying the separately
// reviewed anti-poison reservation policy before comparing the scalar path.
function currentReservationPolicy(body) {
  const early='  const key=objectHitKey(event);if(objectHitSeen.has(key))return false;objectHitSeen.add(key);\n  while(objectHitSeen.size>MAX_REPLAY_EVENTS)objectHitSeen.delete(objectHitSeen.values().next().value);';
  const late='  target.hp-=clamp(event.damage,0,2200)*withObjectHitGear';
  const replaceOnce=(text,from,to)=>{assert.equal(text.split(from).length,2,'unique replay policy anchor');return text.replace(from,to);};
  body=replaceOnce(body,early,'  const key=objectHitKey(event);if(objectHitSeen.has(key))return false;');
  return replaceOnce(body,late,'  objectHitSeen.add(key);\n  while(objectHitSeen.size>MAX_REPLAY_EVENTS)objectHitSeen.delete(objectHitSeen.values().next().value);\n'+late);
}
const policyBridgedHit=currentReservationPolicy(before.applyRemoteObjectHit);
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const equal=(a,b)=>assert.deepEqual(structuredClone(a),structuredClone(b));

test('actual special movement keeps state/callback order while sharing only same-invocation horizontal response',()=>{
  function run(body,hz,options) {
    let exp=0;const math=Object.create(Math);math.exp=v=>{exp++;return Math.exp(v);};
    const log=[],move=vm.runInNewContext(`(${body}\n)`,{Math:math,moveCombatSquid:(...args)=>{log.push('squid');return 'squid';},crabTankAttackTargetVelocity:(m,y)=>({x:(m?.x||0)*2,z:(m?.z||0)*2})});
    const actor={intent:{move:{x:0,z:0},squid:false,jump:false},pos:new THREE.Vector3(),vel:new THREE.Vector3(.3,0,-.7),grounded:true,groundTeam:0,yaw:.3,climbing:false,character:{trigger:n=>log.push(['trigger',n])},_horizontal:(...a)=>log.push(['horizontal',...a]),_setClimb:(...a)=>log.push(['climb',...a]),_integrate(dt,s,j){log.push(['integrate',dt,s,j]);this.pos.addScaledVector(this.vel,dt);},_resolve:(...a)=>log.push(['resolve',...a])};
    const rt={api:{PLAYER:{swimJumpVel:7,jumpVel:6},emit:(...a)=>log.push(['emit',a[0],a[1].surface,a[1].swim])}},state={};
    for(let i=0;i<hz*5;i++){
      const mode=i%120;actor.intent.move.x=mode<40?0:mode<80?.6:-.8;actor.intent.move.z=mode<40?0:.4;
      actor.intent.jump=i%70===0;actor.grounded=i%30===0;actor.climbing=i%50===0;
      move(rt,actor,1/hz,state,options);
    }
    return {state,log,exp,pos:actor.pos.toArray(),vel:actor.vel.toArray(),form:actor.form,grounded:actor.grounded};
  }
  for(const hz of [30,60,120])for(const speed of [null,0,.01,2,'crab'])for(const flight of [false,true]){
    const a=run(before.moveActor,hz,{speed,flight}),b=run(currentMove,hz,{speed,flight});
    const ae=a.exp,be=b.exp;delete a.exp;delete b.exp;equal(b,a);
    assert(speed===null||speed==='crab'?be===ae:be*2===ae);
  }
});

test('actual special damp preserves invalid dt, signed zero, gravity and resolver arguments',()=>{
  const make=body=>{
    let exp=0;const math=Object.create(Math);math.exp=v=>{exp++;return Math.exp(v);};
    return {damp:vm.runInNewContext(`(${body}\n)`,{Math:math}),count:()=>exp};
  };
  for(const dt of [1/30,1/60,1/120,0,-0,-.01,NaN,Infinity,-Infinity])for(const grounded of [false,true])for(const vx of [0,-0,1,-1,NaN,Infinity]){
    const traces=[[],[]],owners=traces.map((log)=>({grounded,pos:new THREE.Vector3(1,2,3),vel:new THREE.Vector3(vx,.7,-vx),_resolve:(...a)=>log.push(a)})),a=make(before.dampForSpecial),b=make(currentDamp);
    a.damp(owners[0],dt);b.damp(owners[1],dt);
    equal(owners[1].pos.toArray(),owners[0].pos.toArray());equal(owners[1].vel.toArray(),owners[0].vel.toArray());equal(traces[1],traces[0]);assert.equal(a.count(),2);assert.equal(b.count(),1);
  }
});

function hitFixture(body,{subId='beakon',position=[0,0,0],ghost=false,damage=20,coordinates=[0,0,0],getterSecondUndefined=false,onGear=()=>{}}={}) {
  const log=[],seen=new Set();let constructed=0;
  const owner={nid:1,remote:false,team:0,netLife:7},shooter={nid:2,remote:true,team:1,netLife:8};
  const pos=new THREE.Vector3(...position),target={owner,seq:10,sourceLife:7,subId,phase:'deployed',ghost,hp:100,pos};
  const vector=class extends THREE.Vector3{constructor(...a){super(...a);constructed++;}};
  const api={THREE:{Vector3:vector},G:{netm:{byNid:new Map([[1,owner],[2,shooter]])},projectiles:[target]}};
  const event={actor:shooter,targetOwnerId:1,targetSeq:10,targetLife:7,targetSubId:subId,life:8,eventSeq:1,damage,x:coordinates[0],y:coordinates[1],z:coordinates[2]};
  if(getterSecondUndefined)for(const axis of ['x','y','z']){let n=0;Object.defineProperty(event,axis,{get(){log.push(axis);return ++n===1?1:undefined;}});}
  const hit=vm.runInNewContext(`(${body}\n)`,{ownerLife:a=>a.netLife,finite3:p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z),objectHitKey:e=>String(e.eventSeq),objectHitSeen:seen,MAX_REPLAY_EVENTS:4,entityList:x=>x,targetableTorpedo:o=>o.subId==='torpedo',ALL_SUB_SPECS:{splashWall:{wallWidth:5.3}},clamp,withObjectHitGear:(s,g,fn)=>{log.push('gear');onGear();return fn();},objectDamageScale:()=>1,removeObject:(a,p,t)=>{log.push('remove');t.dead=true;}});
  return {run:()=>hit(api,event),event,target,log,seen,count:()=>constructed};
}

test('actual remote object-hit admission preserves exact Vector3 distance boundaries, replay and resource effects',()=>{
  for(const subId of ['splashWall','torpedo','beakon']) {
    const reach=subId==='splashWall'?3.65:subId==='torpedo'?1:1.5;
    for(const x of [0,-0,1e-300,reach-1e-12,reach,reach+1e-12,1e150,NaN,Infinity,-Infinity])for(const y of [0,.5,NaN])for(const ghost of [false,true])for(const damage of [-1,0,1,50,101,2200,2201,NaN]){
      const options={subId,position:[0,0,0],coordinates:[x,y,0],ghost,damage},a=hitFixture(policyBridgedHit,options),b=hitFixture(currentHit,options);
      assert.equal(b.run(),a.run());assert.equal(b.target.hp,a.target.hp);assert.equal(b.target.dead,a.target.dead);equal(b.log,a.log);equal([...b.seen],[...a.seen]);
      const firstAllocations=a.count();assert(firstAllocations<=1);assert.equal(b.count(),0);
      assert.equal(b.run(),a.run());assert.equal(b.target.hp,a.target.hp);equal(b.log,a.log);equal([...b.seen],[...a.seen]);
      assert(a.count()-firstAllocations<=1,'each retry makes at most one Vector3');assert.equal(b.count(),0);
    }
  }
});

test('rejected object hits cannot poison a corrected retry; accepted hits reserve before callbacks',()=>{
  for(const scenario of ['miss','ghost','absent']){
    for(const body of [policyBridgedHit,currentHit]){
      const f=hitFixture(body,{coordinates:scenario==='miss'?[9,0,0]:[0,0,0],ghost:scenario==='ghost'});
      if(scenario==='absent')f.target.phase='pending';
      assert.equal(f.run(),false,scenario);assert.equal(f.target.hp,100);assert.equal(f.seen.size,0,scenario);
      f.event.x=0;f.target.ghost=false;f.target.phase='deployed';
      assert.equal(f.run(),true,scenario+' corrected');assert.equal(f.target.hp,80);equal([...f.seen],['1']);
      assert.equal(f.run(),false,scenario+' replay');assert.equal(f.target.hp,80);
    }
    const old=hitFixture(before.applyRemoteObjectHit,{coordinates:scenario==='miss'?[9,0,0]:[0,0,0],ghost:scenario==='ghost'});
    if(scenario==='absent')old.target.phase='pending';
    assert.equal(old.run(),false);equal([...old.seen],['1']);
    old.event.x=0;old.target.ghost=false;old.target.phase='deployed';
    assert.equal(old.run(),false,'frozen policy demonstrates poisoned retry');assert.equal(old.target.hp,100);
  }
  for(const body of [policyBridgedHit,currentHit]){
    let nested;let f;f=hitFixture(body,{onGear:()=>{nested=f.run();}});
    assert.equal(f.run(),true);assert.equal(nested,false,'reservation precedes synchronous gear callback');
    assert.equal(f.target.hp,80);equal([...f.seen],['1']);
  }
});

test('remote object-hit scalar path retains event coordinate read order and undefined constructor defaults',()=>{
  const a=hitFixture(policyBridgedHit,{getterSecondUndefined:true}),b=hitFixture(currentHit,{getterSecondUndefined:true});
  assert.equal(b.run(),a.run());assert.equal(b.target.hp,a.target.hp);equal(b.log,a.log);assert.equal(a.count(),1);assert.equal(b.count(),0);
});

test('actual InkMine loop preserves first match, LOS mutation/reentry order and captured candidate length',()=>{
  const s=fs.readFileSync(new URL('../../../patches/splatoon3/runtime/all-subs.mjs',import.meta.url),'utf8');
  const a=s.indexOf("      // Retain find's captured length"),z=s.indexOf('\n    } finally { releaseHostileActors(api); }',a);assert(a>=0&&z>a);const after=s.slice(a,z);
  const run=(body,n,scenario)=>{
    const log=[],object={pos:{x:0,y:0,z:0}},hostiles=Array.from({length:n},(_,i)=>({i,pos:{x:i*.3,y:-.7,z:0}}));
    let radius=scenario===0?0:scenario===1?1:3;
    const spec={get sensorRadius(){log.push(['radius',radius]);return radius;}};
    const G={physics:{los(p,q){const i=hostiles.findIndex(a=>a.pos===q);log.push(['los',i]);if(scenario===2){radius=.1;hostiles.push({i:99,pos:{x:0,y:-.7,z:0}});return false;}if(scenario===4){hostiles.length=1;return false;}if(scenario===5){delete hostiles[1];return false;}if(scenario===6&&i===0){hostiles.reverse();return false;}return i%3===1;}}};
    const fn=vm.runInNewContext(`(function(){let found;${body}\nreturn found?.i;})`,{object,hostiles,spec,G});
    let result,error;try{result=fn();}catch(e){error=e.name;}return {result,error,log};
  };
  for(let n=0;n<15;n++)for(let scenario=0;scenario<7;scenario++)equal(run(after,n,scenario),run(before.mineLoop,n,scenario));
});
