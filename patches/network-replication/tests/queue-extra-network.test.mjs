import test from 'node:test';
import assert from 'node:assert/strict';
import {actualModule} from './added-actual-module.mjs';
import {fixture} from './robustness-fixture.mjs';
import {ALL_SUB_SPECS} from '../../splatoon3/runtime/all-subs.mjs';

let seed=0x83275634;
const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const oldBomb=s=>s.replace(/  const vx = e\[7\][\s\S]*?  const b = stageBounds;/,
 '  if (Math.hypot(e[7], e[8], e[9]) > 1024) return false;\n  const b = stageBounds;')
 .replace(/  \/\/ Snapshot all four values[\s\S]*?finite\(maxZ\)/,
 '  if (b && [b.minX,b.maxX,b.minZ,b.maxZ].every(finite)');

test('current bomb guard matches original for 500k mixed births and exact norm/arena boundaries',async()=>{
 const before=await actualModule('patches/network-replication/snapshot-guard.mjs',{transform:oldBomb});
 const after=await actualModule('patches/network-replication/snapshot-guard.mjs');
 assert.notEqual(before.api.validNetworkBombBirth.toString(),after.api.validNetworkBombBirth.toString());
 const edge=[0,-0,Number.MIN_VALUE,1024,1024+2**-42,1024-2**-43,4096,-4096,NaN,Infinity,undefined,null,'1'];
 for(let i=0;i<500000;i++){
  const theta=random()*Math.PI*2,phi=random()*Math.PI,scale=i%3===0?1024+(random()-.5)*1e-6:i%3===1?random()*100:random()*7000;
  const e=[0,'b',1,i%2?'storm':'bomb',random()*9000-4500,0,random()*9000-4500,
   scale*Math.cos(theta)*Math.sin(phi),scale*Math.sin(theta)*Math.sin(phi),scale*Math.cos(phi)];
  if(i%17===0)e[7+i%3]=edge[i%edge.length];
  const b=i%7===0?null:{minX:-100,maxX:100,minZ:-200,maxZ:200};
  if(b&&i%11===0)b.maxX=edge[i%edge.length];
  assert.equal(after.api.validNetworkBombBirth(e,b),before.api.validNetworkBombBirth(e,b));
 }
 const run=f=>{
  const calls=[],b={};
  for(const [k,v]of Object.entries({minX:NaN,maxX:100,minZ:-100,maxZ:100}))Object.defineProperty(b,k,{get(){calls.push(k);return v;}});
  assert.equal(f.api.validNetworkBombBirth([0,'b',1,'bomb',0,0,0,0,0,0],b),true);
  return calls;
 };
 assert.deepEqual(run(after),run(before),'finite rejection still reads all four boundary getters');
});

test('untagged base radius skips roster only within existing Float32 cap; fallback handles live owner changes',async()=>{
 const f=await actualModule('patches/network-replication/kit-paint-admission.mjs');
 const old=await actualModule('patches/network-replication/kit-paint-admission.mjs',{transform:s=>s.replace(/ const rounded=Math\.fround\(e\[5\]\);[\s\S]*?return rounded<=Math\.fround\(Math\.max\(cap,catalogPaintRadiusLimit\(nm,from\)\)\);/,
  ' return Math.fround(e[5])<=Math.fround(Math.max(cap,catalogPaintRadiusLimit(nm,from)));')});
 const nm={byNid:new Map([[1,{owner:'a',weapon:{catalogRecord:{parameters:{PaintRadius:7}}}}]])};
 for(const cap of [3.744,0,-0,-2,NaN,Infinity,-Infinity])for(const radius of [3.744,3.744+1e-7,7,7+1e-6,0,-1,NaN,Infinity,-Infinity]){
  const e=[0,'s',0,0,0,radius];assert.equal(f.api.kitPaintRadiusAllowed(nm,'a',e,cap),old.api.kitPaintRadiusAllowed(nm,'a',e,cap));
 }
 let scans=0;const values=nm.byNid.values.bind(nm.byNid);nm.byNid.values=function(){scans++;return values();};
 assert.equal(f.api.kitPaintRadiusAllowed(nm,'a',[0,'s',0,0,0,1],3.744),true);assert.equal(scans,0);
 assert.equal(f.api.kitPaintRadiusAllowed(nm,'a',[0,'s',0,0,0,6],3.744),true);assert.equal(scans,1);
 nm.byNid.get(1).owner='b';assert.equal(f.api.kitPaintRadiusAllowed(nm,'a',[0,'s',0,0,0,6],3.744),false);
});

test('production-composed reverse bracket lookup preserves all sampled scalars at 30/60/120Hz and teleport/endpoints',async()=>{
 const f=await fixture({productionComposition:true});
 const candidate=f.NetMatch.prototype._pathAt;
 assert.match(candidate.toString(),/buf.length - 2/);
 // Obtain old method through the complete source loader so its private Hermite/copy helpers remain genuine.
 const old=await fixture({productionComposition:true,transformSource:(rel,s)=>rel==='src/net/netmatch.js'?s.replace(/    \/\/ Admission keeps[\s\S]*?    if \(s1 && s0.tp/,
  '    for (let i = 0; i < buf.length - 1; i++) { if (buf[i].t <= t && buf[i + 1].t > t) { s0 = buf[i]; s1 = buf[i + 1]; break; } }\n    if (s1 && s0.tp'):s});
 assert.notEqual(old.NetMatch.prototype._pathAt.toString(),candidate.toString());
 for(const hz of [30,60,120])for(let count=1;count<=40;count++){
  const buf=[];
  for(let i=0;i<count;i++)buf.push({t:100+i*.05,tp:Math.floor(i/4),x:random(),y:random(),z:random(),vx:random(),vy:random(),vz:random(),f:i%2,yaw:random(),aimYaw:random(),aimPitch:random(),hp:100,ink:100,sp:0,ch:0,turf:0,lock:0});
  for(const t of [99,100,buf.at(-1).t,buf.at(-1).t+.3,...Array.from({length:80},(_,i)=>100+i/hz)]){
   const a={},b={};assert.equal(candidate.call({},buf,t,a),old.NetMatch.prototype._pathAt.call({},buf,t,b));assert.deepEqual(a,b);
  }
 }
});

test('Torpedo inverse convergence early exit preserves actual classification including quantized boundaries',async()=>{
 const before=await actualModule('patches/network-replication/torpedo-launch-set.mjs',{transform:s=>s.replace('if(m===a||m===b)break;','')});
 const after=await actualModule('patches/network-replication/torpedo-launch-set.mjs');
 const spec=ALL_SUB_SPECS.torpedo;
 for(let i=0;i<30000;i++){
  const speed=spec.throwSpeedTiers.low+(spec.throwSpeedTiers.high-spec.throwSpeedTiers.low)*random();
  const v={x:random()*80-40,y:random()*80-40,z:random()*80-40},limit=random()*15;
  assert.equal(after.api.classifyAnyAim(v,spec,speed,limit),before.api.classifyAnyAim(v,spec,speed,limit));
 }
});

test('actual Torpedo registry sweep preserves capacity, retirement and contact deadlines without empty filters',async()=>{
 const path='patches/network-replication/torpedo-contact-commit.mjs';
 const options={extra:'export {registries};',globals:{performance:{now:()=>1000}},overrides:{
  '../splatoon3/runtime/torpedo-receiver-trajectory.mjs':{beginReceiverTorpedoObservation:()=>true},
  './torpedo-birth-envelope.mjs':{eligibleLimitedTorpedoBirth:()=>true},
  '../splatoon3/runtime/gear.mjs':{gearCurve:(_ap,low)=>low}
 }};
 const a=await actualModule(path,{...options,transform:s=>s.replace('for(const old of set)','for(const old of [...set])')
  .replace('if(old.contacts.length)old.contacts=','old.contacts=')});
 const b=await actualModule(path,options);
 function scenario(f,count,trial){
  const match={},world={_s3SubObjects:[],clear(){}},G={projectiles:world,level:{},physics:{},match};
  const owner={nid:1,owner:'peer',remote:true,netLife:0,alive:true,net:{},s3:{abilityPoints:{subPower:0},modifiers:{subPower:1}}};
  const peer={},nm={match,cfg:{id:'epoch'},byNid:new Map([[1,owner]]),peers:new Map([['peer',peer]]),s:{_members:new Map([['peer',{}]])}};
  const set=new Set();f.api.registries.set(nm,set);
  for(let i=0;i<count;i++){
   const contacts=(i+trial)%3===0?[]:[{at:.05},{at:.05-1e-12},{at:1.1}];
   const r={id:i,nm,G,world,level:G.level,physics:G.physics,match,epoch:'epoch',owner,ownerNet:owner.net,from:'peer',peer,life:0,
    parent:{dead:i%5===0},contacts,dropCount:i%7===0?1:0,retired:i%11===0};
   set.add(r);
  }
  const parent={ghost:true,subId:'torpedo',owner,spec:ALL_SUB_SPECS.torpedo};world._s3SubObjects.push(parent);
  const accepted=f.api.registerLimitedTorpedo(nm,parent,{nid:1,from:'peer',life:0},[0,0,0,0,0,{subPowerAP:0}],G,()=>{});
  return {accepted,rows:[...set].map(r=>({id:r.id,retired:r.retired,at:r.contacts.map(c=>c.at)}))};
 }
 for(const count of [0,1,2,159,160,161])for(let trial=0;trial<7;trial++)assert.equal(JSON.stringify(scenario(b,count,trial)),JSON.stringify(scenario(a,count,trial)));
});
