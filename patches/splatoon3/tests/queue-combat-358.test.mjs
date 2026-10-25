import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {catalogFlickSourceDamage} from '../runtime/catalog-flick-damage.mjs';
import {catalogBubbleLimitGroundNormalSpeed} from '../runtime/projectile-presentation.mjs';
import {fixture} from './source-fixture.mjs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
const before=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-combat-358-before.json',import.meta.url)));
const read=name=>fs.readFileSync(new URL('../runtime/'+name,import.meta.url),'utf8');
const pure=(code,name,globals={})=>vm.runInNewContext(code.replace(/export /g,'')+';'+name,{Math,...globals});

test('actual flick damage preserves all finite bands, eager getter order and source rates',()=>{
 const old=pure(before.flick,'catalogFlickSourceDamage'),edge=[undefined,NaN,-Infinity,Infinity,-0,0,-3,.7,10,80];let seed=1;
 const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<15000;i++){
  const table={},names=['DamageMaxDistance','DamageMaxValue','DamageHighDistance','DamageHighValue','DamageLowDistance','DamageLowValue','DamageMinDistance','DamageMinValue'];
  for(const n of names)table[n]=rand()<.4?edge[Math.floor(rand()*edge.length)]:rand()*200-30;
  table.DepletionDamageRate=rand();const damage={Inside:table,DamageRejectStartFrame:3,DamageRejectEndFrame:15,DamageRejectRate:.4},unit={UnitDamageRate:rand()*2},point={x:rand()*30,y:rand()*3,z:rand()*10},start={x:0,y:0,z:0},frames=rand()*20;
  assert.ok(Object.is(catalogFlickSourceDamage(damage,unit,'vertical',frames,point,start,0,true),old(damage,unit,'vertical',frames,point,start,0,true)));
 }
 const names=['DamageMaxDistance','DamageMaxValue','DamageHighDistance','DamageHighValue','DamageLowDistance','DamageLowValue','DamageMinDistance','DamageMinValue'],logs=[];
 for(const fn of [old,catalogFlickSourceDamage]){const log=[],table={};for(const n of names)Object.defineProperty(table,n,{get(){log.push(n);return n.endsWith('Value')?100:0;}});fn({Inside:table},{},'vertical',0,{x:0,y:0,z:0},{x:0,y:0,z:0});logs.push(log);}
 assert.deepEqual(logs[1],logs[0]);assert.deepEqual(logs[1],names);
});

test('Bloblobber normal clamp preserves exact velocity and avoids its second square root',()=>{
 const old=pure(before.bubble,'catalogBubbleLimitGroundNormalSpeed');
 for(let i=0;i<4000;i++){const n=new THREE.Vector3(Math.sin(i),Math.cos(i*.7),Math.sin(i*.3)),v=new THREE.Vector3(i%30-10,i%40-15,i%13-5),a=v.clone(),b=v.clone();old(a,n,.03);catalogBubbleLimitGroundNormalSpeed(b,n,.03);assert.deepEqual(b.toArray(),a.toArray());}
 let calls=0;const math=Object.create(Math);math.sqrt=x=>{calls++;return Math.sqrt(x);};
 const source=read('projectile-presentation.mjs'),start=source.indexOf('export function catalogBubbleLimitGroundNormalSpeed('),end=source.indexOf('// Source-owned, fixed-60Hz falling paint drops',start);
 const fn=pure(source.slice(start,end),'catalogBubbleLimitGroundNormalSpeed',{Math:math});fn(new THREE.Vector3(0,100,0),new THREE.Vector3(0,2,0),.01);assert.equal(calls,1);
 const order=[];math.sqrt=x=>{order.push('sqrt');return Math.sqrt(x);};const v=new THREE.Vector3(0,100,0),dot=v.dot;v.dot=function(n){order.push('dot');return dot.call(this,n);};fn(v,new THREE.Vector3(0,2,0),.01);assert.deepEqual(order,['dot','sqrt']);
});

function beamKernel(code){let allocations=0;class CountSet extends Set{constructor(...a){super(...a);allocations++;}}
 const fn=pure(code,'hitBeam',{WeakMap,Set:CountSet,clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),colorOf:()=>0});return {fn,allocations:()=>allocations};}
function beamRun(kernel,nest=false,throws=false){
 const rows=[],actor={team:0,remote:true},v1={team:1,alive:true,pos:new THREE.Vector3(0,0,3)},v2={team:1,alive:true,pos:new THREE.Vector3(0,0,8)},rt={system:null};for(let i=0;i<16;i++)rt['v'+i]=new THREE.Vector3();let nested=false;
 rt.api={G:{actors:[v1,v1,v2],projectiles:{applyHit(_a,v){rows.push(v===v1?1:2);if(throws)throw Error('hit');if(nest&&!nested){nested=true;kernel.fn(rt,actor,{},new THREE.Vector3(0,0,2),new THREE.Vector3(0,0,1),4,3);nested=false;}}},fx:{ring(){}}}};
 const call=()=>kernel.fn(rt,actor,{},new THREE.Vector3(),new THREE.Vector3(0,0,1),10,3);
 if(throws){assert.throws(call,/hit/);throws=false;}call();call();return rows;
}
test('actual Wail hitBeam keeps duplicate and nested hit order while recycling cleared pulse Sets',()=>{
 const source=read('all-specials.mjs'),start=source.indexOf('const hitBeamPools='),end=source.indexOf('function beamTouchesObject',start),after=source.slice(start,end);
 for(const nest of [false,true])for(const throws of [false,true]){const a=beamKernel(before.beam),b=beamKernel(after);assert.deepEqual(beamRun(b,nest,throws),beamRun(a,nest,throws));assert.ok(b.allocations()<a.allocations());}
});

test('active Bubbler beam probe leases preserve exclusion serials and survive query reentry and exceptions',()=>{
 const source=read('kit-big-bubbler.mjs'),start=source.indexOf('const beamDamageFrames='),end=source.indexOf('// ------------------------------------------------------------------- query',start),after=source.slice(start,end);
 const run=code=>{const seen=[],probes=new Set(),actor={team:0,alive:true},api={},domes=[{},{}],remoteDomes=[];let nested=false,fail=false,fn;
  const query=(probe,_a,_b,excluded)=>{probes.add(probe);if(fail)throw Error('query');const id=excluded.has('a')?'b':'a';if(excluded.has(id))return null;seen.push([id,probe.team,probe.damage,[...excluded]]);return {domeId:id,serial:7,onHit(){if(!nested){nested=true;fn(actor,new THREE.Vector3(),new THREE.Vector3(0,0,2),9);nested=false;}return probe.damage;}};};
  fn=pure(code,'damageBigBubblerFromBeam',{api,domes,remoteDomes,kitBarrierCandidate:query});
  const result=fn(actor,new THREE.Vector3(),new THREE.Vector3(0,0,2),3);fail=true;assert.throws(()=>fn(actor,new THREE.Vector3(),new THREE.Vector3(0,0,2),5),/query/);fail=false;
  const again=fn(actor,new THREE.Vector3(),new THREE.Vector3(0,0,2),3);return{seen,result,again,probeCount:probes.size};};
 const a=run(before.bubbler),b=run(after);assert.deepEqual(b.seen,a.seen);assert.equal(b.result,a.result);assert.equal(b.again,a.again);assert.equal(b.probeCount,2);assert.ok(a.probeCount>b.probeCount);
});

test('real composed Charger helpers return their outputs and births retain independent job/event vectors',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true}),{G,THREE}=f,system=G.projectiles,a=f.make('charger');a.form='kid';a.aimDir.set(0,0,1);a.aimPoint.set(0,2,60);
 const originals=[system._muzzle,system._aimFrom],outs=[];
 system._muzzle=function(actor,out){const value=originals[0].call(this,actor,out);assert.equal(value,out);outs.push(out);return value;};
 system._aimFrom=function(actor,from,out){const value=originals[1].call(this,actor,from,out);assert.equal(value,out);outs.push(out);return value;};
 system.fireCharger(a,a.weapon,1);const job=system._fidelityChargerFlights.at(-1),initial=job.origin.toArray();assert.notEqual(job.origin,outs[0]);assert.notEqual(job.dir,outs[1]);
 outs[0].set(999,999,999);outs[1].set(-999,-999,-999);assert.deepEqual(job.origin.toArray(),initial);assert.ok(job.dir.z>0);assert.notEqual(job.pos,job.prev);assert.notEqual(job.pos,job.origin);
 const sharedMuzzle=new THREE.Vector3(1,2,3),sharedAim=new THREE.Vector3(0,0,1);system._muzzle=()=>sharedMuzzle;system._aimFrom=()=>sharedAim;
 system.fireCharger(a,a.weapon,.5);const custom=system._fidelityChargerFlights.at(-1);sharedMuzzle.set(99,99,99);sharedAim.set(99,99,99);assert.deepEqual(Array.from(custom.origin.toArray()),[1,2,3]);assert.deepEqual(Array.from(custom.dir.toArray()),[0,0,1]);
 let retained;system._muzzle=(_a,out)=>{retained=out;return out.set(1,2,3);};system._aimFrom=(_a,_from,out)=>{retained.set(99,99,99);return out.set(0,0,1);};system.fireCharger(a,a.weapon,.5);assert.deepEqual(Array.from(system._fidelityChargerFlights.at(-1).origin.toArray()),[1,2,3],'custom callbacks may retain supplied outputs; keep their prior copy boundary');
});

test('actual Charger scan reuses range-clipped duration and preserves each moving target endpoint',()=>{
 const source=read('weapons-charger-flight.mjs'),steps=[];
 const visit=node=>{
  if(!node||typeof node!=='object')return;
  if(node.type==='FunctionDeclaration'&&node.id?.name==='step')steps.push(node);
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
 };
 visit(parse(source,{ecmaVersion:'latest',sourceType:'module'}));assert.equal(steps.length,1,'one complete Charger step declaration');
 // Keep the real lease try/finally intact; an interior statement is not a function boundary.
 const after=source.slice(steps[0].start,steps[0].end);
 const run=(code,ghost,speed)=>{const ends=[],G={actors:Array.from({length:8},(_,i)=>({alive:true,team:1,pos:new THREE.Vector3(i,.2,i*.1)})),physics:{}},job={speed,range:.5,travel:0,pos:new THREE.Vector3(),prev:new THREE.Vector3(),dir:new THREE.Vector3(0,0,1),owner:{team:0,addTurf(){}},team:0,seen:new Set(),base:new THREE.Vector3(),moved:new THREE.Vector3(),ghost,paint:{width:1,terminalRate:1}};let mins=0;const math=Object.create(Math);math.min=(...a)=>{mins++;return Math.min(...a);};
  const fn=pure(code,'step',{Math:math,G,EPS:1e-9,SIM_DT:1/60,PLAYER:{},collision:{InitRadiusForField:.1,EndRadiusForField:.1,InitRadiusForPlayer:.1,EndRadiusForPlayer:.1},sweptWorldHit:()=>({hit:false}),coherentMotionStart:()=>({x0:0,y0:0,z0:0}),hurtboxRadius:()=>.3,hurtboxHeight:()=>1.7,capsuleEntry(_a,end){ends.push(end.toArray());return null;},chargerActorBeforeStop:()=>false,paintTravel(){},splatTravelPoint:()=>0,chargerPaintWorldRadius:width=>width,emit(){}});fn({},job,1/60);return{ends,mins};};
 for(const ghost of [false,true])for(const speed of [0,60,120]){const a=run(before.chargerScan+'return actors;}',ghost,speed),b=run(after,ghost,speed);assert.deepEqual(b.ends,a.ends);assert.equal(b.mins,ghost?1:2);assert.equal(a.mins,ghost?1:9);}
});

import {ClamsRule} from '../runtime/ranked/clams.mjs';
test('actual clam projectile broadphase preserves grazing pickups, invalid-vector fallback and full state/events',()=>{
 const vec=v=>Array.isArray(v)&&v.length>=3&&v.slice(0,3).every(Number.isFinite)?[v[0],v[1],v[2]]:[0,0,0];
 const old=new Function('vec','add','scale','GRAVITY','EPS','return ({'+before.clamsAdvance+'})._advanceProjectiles;')(vec,(a,b)=>a.map((v,i)=>v+b[i]),(a,n)=>a.map(v=>v*n),9.8,1e-8);
 let saved=0;
 for(const z of [-1000,-.721,-.72000001,-.72,-.71999999,0,.71999999,.72,.72000001,.721,1000,NaN])for(const x of [-1,.1,.3,.5,100]){
  const outputs=[];
  for(const baseline of [true,false]){
   const events=[],engine={event:(kind,data)=>events.push({kind,...data})},rule=new ClamsRule(engine,{}, {seedInitial:false});
   rule.state.clams=[{id:'c',kind:'small',team:null,ownerTeam:0,thrower:'thrower',pos:[0,1,0],velocity:[12,0,0],grounded:false,age:0,bounces:0}];
   const frame={actors:[{id:'target',team:0,alive:true,pos:[x,.08911111111111114,z]}],floorAt:()=>0};
   let queries=0;const closest=rule._segmentClosestPoint;rule._segmentClosestPoint=function(...args){queries++;return closest.apply(this,args);};
   (baseline?old:rule._advanceProjectiles).call(rule,1/30,frame);outputs.push({state:JSON.stringify(rule.state),events:JSON.stringify(events),queries});
  }
  assert.equal(outputs[1].state,outputs[0].state);assert.equal(outputs[1].events,outputs[0].events);saved+=outputs[0].queries-outputs[1].queries;
 }
 assert.ok(saved>20);
});

test('actual catalogue radius skips only exact numeric zero and retains every source read and invalid input result',()=>{
 const source=read('main-weapon-catalog.mjs'),start=source.indexOf('  function collisionRadius('),end=source.indexOf('  function lobes(',start),current=source.slice(start,end);
 let calls=0;const globals={finite:(v,f)=>Number.isFinite(v)?v:f,lerp:(a,b,t)=>a+(b-a)*t,clamp:n=>Math.max(0,Math.min(1,n)),catalogBubbleRadiusScale:n=>{calls++;return Math.pow(.75,Math.max(0,Math.floor(n||0)));}};
 const old=pure(before.collision,'collisionRadius',globals),now=pure(current,'collisionRadius',globals),values=[0,-0,1,-1,Infinity,NaN,undefined,.23,3.3];let seed=9;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<5000;i++){
  const c={};for(const key of ['InitRadiusForField','AfterOffsetInitRadiusForField','EndRadiusForField','AfterOffsetEndRadiusForField','ChangeFrameForField'])c[key]=values[Math.floor(rand()*values.length)];
  const frames=values[Math.floor(rand()*values.length)],index=Math.floor(rand()*4),bounce=[0,-0,1,2,NaN,null,'0',false][i%8];assert.ok(Object.is(now(c,'Field',frames,index,bounce),old(c,'Field',frames,index,bounce)));
 }
 calls=0;now({},'Field',0,0,0);assert.equal(calls,0);now({},'Field',0,0,false);assert.equal(calls,1);
});
