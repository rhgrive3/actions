import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {installCombatPlacementQA,advanceUntilNativeShotProof,advanceUntilNativePlacement} from '../lib/inkwave-combat-ceiling-placement.mjs';

// These are bounded helper contracts plus the real Actor barrier method,
// not a substitute for the browser's actual Physics/Actor settle gate.
const actorSource=fs.readFileSync(new URL('../../inkwave-public/src/game/actor.js',import.meta.url),'utf8');
const mapsSource=fs.readFileSync(new URL('../../inkwave-public/src/world/maps.js',import.meta.url),'utf8');
const method=actorSource.match(/  _spawnBarrier\(\) \{[\s\S]*?\n  \}/g);
assert.equal(method?.length,1,'unique native barrier method');
const pads=JSON.parse(mapsSource.match(/export const TIDEWATER = \{[\s\S]*?spawnPads: (\[[^\n]+\]),/)[1]);
const radius=Number(mapsSource.match(/export const TIDEWATER = \{[\s\S]*?spawnBarrier: ([\d.]+)/)[1]);
const level={bounds:{minX:-25,maxX:25,minZ:-44,maxZ:44},spawnPads:pads.map(([x,y,z])=>({x,y,z})),spawnBarrier:radius};
class V {
 constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
 set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}
 copy(v){return this.set(v.x,v.y,v.z);}
 add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}
 sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}
 normalize(){const n=Math.hypot(this.x,this.y,this.z)||1;this.x/=n;this.y/=n;this.z/=n;return this;}
 toArray(){return [this.x,this.y,this.z];}
}
function fixture(fn) {
 const savedG=globalThis.__G,savedQA=globalThis.__ceilingPlacement;
 const calls={ground:0,los:0};
 const G={level,camera:{position:new V()},netm:{byNid:new Map()},physics:{
  groundProbe(x,y,z,up,down,foot,h,skip){calls.ground++;assert.equal(skip,false);Object.assign(h,{hit:true,center:true,grate:false,y:0});h.normal.set(0,1,0);},
  los(){calls.los++;return true;}
 },projectiles:{_muzzle(a,out){return out.copy(a.pos).add(new V(0,1.1,.3));}}};
 const barrier=new Function('G','return new (class {'+method[0]+'})()._spawnBarrier;')(G);
 globalThis.__G=G;installCombatPlacementQA();
 const add=(id,p,enemyTeam=0)=>{const a={pos:new V(...p),vel:new V(),enemyTeam,alive:true,grounded:true,form:'kid',smoothY:0,aimPoint:new V(),aimDir:new V()};G.netm.byNid.set(id,a);return a;};
 try{return fn({G,q:globalThis.__ceilingPlacement,barrier,add,calls});}
 finally{if(savedG===undefined)delete globalThis.__G;else globalThis.__G=savedG;if(savedQA===undefined)delete globalThis.__ceilingPlacement;else globalThis.__ceilingPlacement=savedQA;}
}
test('old enemy spawn placement is moved by the actual native barrier',()=>fixture(({barrier,add,q})=>{
 const attacker=add('a',pads[1],0),victim=add('v',[pads[1][0],pads[1][1],pads[1][2]+2],1);
 barrier.call(attacker);barrier.call(victim);
 assert.equal(victim.pos.z,pads[1][2]+radius);
 assert(Math.abs(victim.pos.z-attacker.pos.z-2)>2);
 assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/spawn barrier|separation/);
}));
test('neutral selected pair stays outside both native barriers and uses stage probes',()=>fixture(({barrier,add,q,calls})=>{
 const points=q.select();assert(calls.ground>=2&&calls.los>=3);
 for(let team=0;team<2;team++)for(const p of points){const a=add('trial',p,team);barrier.call(a);assert.deepEqual(a.pos.toArray(),p);}
 add('a',points[0],0);add('v',points[1],1);
 assert.equal(q.inspect({attacker:'a',victim:'v',requested:points}).separation,2);
}));
test('settled position drift and wrong separation are rejected, not teleported back',()=>fixture(({q,add})=>{
 const points=q.select(),a=add('a',points[0]),v=add('v',points[1]);v.pos.x+=.2;a.pos.x+=.2;
 const moved=v.pos.toArray();assert.throws(()=>q.inspect({attacker:'a',victim:'v',requested:points}),/settle moved/);assert.deepEqual(v.pos.toArray(),moved);
 v.pos.z+=.2;assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/separation/);
}));
test('both spawn barriers and nonfinite settled coordinates are rejected',()=>fixture(({q,add})=>{
 for(const pad of pads){add('a',pad);add('v',[pad[0]+2,pad[1],pad[2]]);assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/spawn barrier/);}
 add('a',[NaN,0,0]);add('v',[2,0,0]);assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/nonfinite/);
}));
test('blocked or absent native ground cannot produce a placement',()=>fixture(({q,G})=>{
 G.physics.los=()=>false;assert.throws(()=>q.select(),/no neutral playable pair/);
 G.physics.groundProbe=(_x,_y,_z,_u,_d,_f,h)=>{h.hit=false;};assert.throws(()=>q.select(),/no neutral playable pair/);
}));
test('aim rereads actual settled target and real muzzle and rejects a blocked shot',()=>fixture(({q,G,add})=>{
 const points=q.select(),a=add('a',points[0]),v=add('v',points[1]);v.smoothY=.02;
 const result=q.aim({attacker:'a',victim:'v',requested:points});
 assert.deepEqual(result.target,[v.pos.x,v.pos.y+1.07,v.pos.z]);
 assert.deepEqual(result.muzzle,[a.pos.x,a.pos.y+1.1,a.pos.z+.3]);
 assert.deepEqual(a.aimPoint.toArray(),result.target);
 const expected=new V(...result.target).sub(new V(...result.muzzle)).normalize();
 assert.deepEqual(a.aimDir.toArray(),expected.toArray());
 G.physics.los=()=>false;assert.throws(()=>q.aim({attacker:'a',victim:'v',requested:points}),/muzzle path blocked/);
}));
test('airborne or dead targets fail rather than weakening native contact requirements',()=>fixture(({q,add})=>{
 const points=q.select();add('a',points[0]);const v=add('v',points[1]);v.grounded=false;
 assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/alive grounded/);
 v.grounded=true;v.alive=false;assert.throws(()=>q.inspect({attacker:'a',victim:'v'}),/alive grounded/);
}));

test('failure stdout limits shot diagnostics to fixed labels and finite numbers',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-combat-ceiling-browser.mjs',import.meta.url),'utf8');
 const body=source.slice(source.lastIndexOf('const failure ='),source.lastIndexOf('console.log('));
 assert(body.startsWith('const failure ='));
 const summarize=new Function('report','errors',body+'return failure;');
 assert.equal(summarize({status:'passed'},[]),undefined);
 for(const message of ['missing level bounds','no neutral playable pair with a clear stage path','Actors must be alive grounded kids','native settle moved selected placement','settled separation is not 2m'])assert.equal(summarize({status:'failed',error:'page.evaluate: Combat placement: '+message+'\\nprivate stack'},[]).error,'Combat placement: '+message);
 const report={status:'failed',error:'secret packet data',shot:{steps:Infinity,initial:{afterInk:'secret',pos:[0,NaN,0]},removal:{reason:'private wire data',age:Infinity}}};
 assert.deepEqual(summarize(report,[]).shot,{reason:null,steps:null,initialInk:null,initialHeight:null,removalAge:null,originDistance:null,velocityAngle:null});
 const good={status:'failed',error:'Native projectile never authored a 36 hit packet',shot:{steps:3,initial:{afterInk:99,pos:[0,1.1,0]},removal:{reason:'world-impact',age:.05}}};
 assert.deepEqual(summarize(good,[]).shot,{reason:'world-impact',steps:3,initialInk:99,initialHeight:1.1,removalAge:.05,originDistance:null,velocityAngle:null});
});

test('pitch-dependent muzzle changes are exposed by the actual emitted-origin diagnostic',()=>fixture(({q,G,add})=>{
 const points=q.select(),a=add('a',points[0]);add('v',points[1]);
 G.projectiles._muzzle=(actor,out)=>out.copy(actor.pos).add(new V(0,1.1+.5*actor.aimPitch,.3));
 const pre=q.aim({attacker:'a',victim:'v',requested:points});
 // fireShooter recomputes _muzzle after aimPitch changed. Do not change the
 // native Actor update order or pretend that the earlier LOS was this origin.
 const actual=G.projectiles._muzzle(a,new V()).toArray();
 const delta=q.compareShot(pre,actual,a.aimDir.toArray());
 assert(delta.originDistance>.001,'pitch-independent stub must not mask the changed launch origin');
 assert.deepEqual(delta.originOffset,actual.map((v,i)=>v-pre.muzzle[i]));
 assert.equal(q.compareShot(pre,pre.muzzle,pre.aim).originDistance,0);
 assert.throws(()=>q.compareShot(pre,[0,NaN,0],pre.aim),/nonfinite shot comparison/);
}));

test('normal update flushes the actual native shot queue after same-tick contact',async()=>{
 const source=fs.readFileSync(new URL('../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8');
 const methods=['_rec','update','_sendTick'].map(name=>{
  const matches=source.match(new RegExp('  '+name+'\\([^\\n]*\\) \\{[\\s\\S]*?\\n  \\}','g'));
  // _rec is a one-line native method.
  const one=name==='_rec'?source.match(/^  _rec\(e\) \{[^\n]+\}$/gm):matches;
  assert.equal(one?.length,1,'unique native '+name);return one[0];
 });
 let clock=10;
 const Native=new Function('TICK','now','r3','return class {'+methods.join('\n')+'}')(1/20,()=>clock,x=>Math.round(x*1000)/1000);
 const n=new Native(),sent=[];Object.assign(n,{match:{},peers:new Map(),byNid:new Map(),tickT:1/20,out:[],stats:{out:0},s:{tr:{broadcast:p=>sent.push(p)}},
  _sampleBoss(){},_playEvents(){},_voices(){}});
 // Real order: net.update first, then native Actor authors the birth/fire
 // and contact. Passive receiver waiting alone leaves these events queued.
 n.update(1/60);n._rec(['p','actor','ink','shooter']);n._rec(['ev','weapon:fire',{actor:{n:'actor'}}]);
 const queued=structuredClone(n.out);assert.equal(sent.length,0);assert.equal(queued.length,2);
 const result=await advanceUntilNativeShotProof({remainingSteps:59,hasProof:()=>sent.some(p=>p.e?.length),
  step:async()=>{clock+=1/60;n.update(1/60);}});
 assert(result.ready);assert(result.steps>0&&result.steps<=3);
 assert.deepEqual(sent.flatMap(p=>p.e||[]),queued,'same native event timestamps and payloads');
 assert.equal(n.out.length,0);
});
test('proof advance remains bounded and does not invent an unavailable receipt',async()=>{
 let steps=0;
 const result=await advanceUntilNativeShotProof({remainingSteps:2,hasProof:()=>false,step:async()=>{steps++;}});
 assert.deepEqual(result,{steps:2,ready:false});assert.equal(steps,2);
 const ready=await advanceUntilNativeShotProof({remainingSteps:60,hasProof:()=>true,step:async()=>{throw Error('extra step');}});
 assert.deepEqual(ready,{steps:0,ready:true});
 for(const remainingSteps of [-1,61,NaN,.5])await assert.rejects(advanceUntilNativeShotProof({remainingSteps,hasProof:()=>false,step:async()=>{}}),/step budget/);
});


test('opening readiness waits for both real lifecycle phases without editing either actor',()=>fixture(({q,G,add})=>{
 const points=q.select(),a=add('a',points[0]),v=add('v',points[1]);
 G.match={state:'playing',actors:[a,v]};
 a.s3={squidSpawn:{phase:'aim',initial:true}};
 v.remote=true;v.net={ready:true};v.s3={squidSpawn:{phase:'aim',ownerReplicated:true}};
 const before=JSON.stringify([a,v]);
 assert.equal(q.spawnReady(),false);assert.equal(q.placementReady({attacker:'a',victim:'v',requested:points}),false);
 assert.equal(JSON.stringify([a,v]),before,'readiness must not clear spawn ownership');
 delete a.s3.squidSpawn;assert.equal(q.spawnReady(),false,'owner landing alone is insufficient');
 delete v.s3.squidSpawn;v.net.ready=false;assert.equal(q.spawnReady(),false);
 v.net.ready=true;assert.equal(q.spawnReady(),true);
 v.pos.set(.91,6.7,-38.58);assert.equal(q.placementReady({attacker:'a',victim:'v',requested:points}),false);
 v.pos.set(...points[1]);assert.equal(q.placementReady({attacker:'a',victim:'v',requested:points}),true);
}));

test('native teleport timeline holds stale spawn sample until the real owner relocation timestamp',()=>{
 const source=fs.readFileSync(new URL('../../inkwave-public/src/net/netmatch.js',import.meta.url),'utf8');
 const methods=source.match(/  _pathAt\([^\n]*\) \{[\s\S]*?\n  \}/g);
 assert.equal(methods?.length,1);
 const Native=new Function('copySample','hermite','PLAYER','return class {'+methods[0]+'}')(
  (from,to)=>Object.assign(to,from),()=>{throw Error('teleports must not interpolate');},{gravity:20});
 const old={t:10,tp:1,x:.91,y:6.7,z:-38.58,vx:0,vy:0,vz:0,f:1};
 const placed={...old,t:10.2,tp:2,x:12.5,y:0,z:0};
 const sample={};new Native()._pathAt([old,placed],10.1,sample);
 assert.equal(sample.x,old.x);assert.equal(sample.z,old.z,'actual native timeline reproduces stale spawner position');
 new Native()._pathAt([old,placed],10.2,sample);
 assert.equal(sample.x,placed.x);assert.equal(sample.z,placed.z);
});

test('placement handshake waits for delayed actual peer readiness and is bounded',async()=>{
 let ticks=0;
 const result=await advanceUntilNativePlacement({step:async()=>{ticks++;},hasPlacement:()=>ticks>=17});
 assert.deepEqual(result,{steps:17,ready:true});
 ticks=0;
 assert.deepEqual(await advanceUntilNativePlacement({maxSteps:3,step:async()=>{ticks++;},hasPlacement:()=>false}),{steps:3,ready:false});
 assert.equal(ticks,3);
 for(const maxSteps of [0,-1,181,NaN,.5])await assert.rejects(advanceUntilNativePlacement({maxSteps,step:async()=>{},hasPlacement:()=>false}),/step budget/);
});

test('browser keeps native RAF through opening, relocates owners only and preserves remote native state',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-combat-ceiling-browser.mjs',import.meta.url),'utf8');
 assert(source.indexOf("report.phase='native-opening-spawn'")<source.indexOf('__inkwave.debug.freeze()'));
 const drawHold=source.indexOf('__ceilingPlacement.holdOpeningDraw()'),start=source.indexOf('assert.equal(await host.evaluate(()=>__G.net.start())');
 assert(drawHold>=0&&drawHold<start,'both original RAF loops suppress draw before START can publish the first snapshot');
 assert(source.indexOf('__ceilingPlacement.releaseOpeningDraw()')>source.indexOf('report.spawnReady='));
 const opening=source.slice(source.indexOf("report.phase='native-opening-spawn'"),source.indexOf("report.phase='native-actor-placement'"));
 assert(opening.includes('__ceilingPlacement.spawnReady()')&&opening.includes('__G.time-start>10'));
 assert(!/debug\.(step|freeze)|_frame\(|\.update\(|\.ready\s*=|delete .*squidSpawn|net\.cur\s*=|buf\./.test(opening));
 const placement=source.slice(source.indexOf('const placement=await host.evaluate'),source.indexOf('const step=async'));
 assert(placement.includes('if(a.remote)continue;'));
 assert(!placement.includes('buf.length=0'));
 assert(!/\.ready\s*=|delete .*squidSpawn|net\.cur\s*=/.test(placement));
 assert(source.indexOf('assert(report.placementAdvance.ready')<source.indexOf('report.settled='));
 assert(source.includes('setTimeout(resolve,1000/60)'));
 const step=source.slice(source.indexOf('const step=async'),source.indexOf('report.placementAdvance='));
 const order=['G.net.update(dt)','G.time+=dt','window.__ceilingBeginActorMotionTick(G.actors)',
  'for(const a of G.match.actors)','G.projectiles.update(dt)'].map(anchor=>step.indexOf(anchor));
 assert(order.every((index,i)=>index>=0&&(i===0||index>order[i-1])), 'all native tick owners must exist in order');
});

test('scenario wire evidence is copied before socket teardown and cleanup has its own trace',()=>{
 const source=fs.readFileSync(new URL('../check-inkwave-combat-ceiling-browser.mjs',import.meta.url),'utf8');
 const snapshot=source.indexOf('report.wire=wire.slice()'),close=source.indexOf('await c.close()');
 assert(snapshot>=0&&snapshot<close);assert(source.indexOf('report.cleanupWire=wire.slice(report.wire.length)')>close);
});

test('intro draw hold preserves native RAF/frame and actor state and restores the original flag',()=>{
 const previous=globalThis.__inkwave,previousQA=globalThis.__ceilingPlacement;
 try{
  const frame=()=>{},game={_frame:frame,frozen:false,actors:[{alive:true,spawnPhase:'aim'}]};
  globalThis.__inkwave=game;installCombatPlacementQA();const q=globalThis.__ceilingPlacement;
  const actors=JSON.stringify(game.actors);
  q.holdOpeningDraw();assert.equal(game._skipRender,true);assert.equal(game._frame,frame);assert.equal(game.frozen,false);
  assert.equal(JSON.stringify(game.actors),actors);assert.throws(()=>q.holdOpeningDraw(),/already held/);
  q.releaseOpeningDraw();assert.equal(game._skipRender,undefined);q.releaseOpeningDraw();
  game._skipRender=false;q.holdOpeningDraw();q.releaseOpeningDraw();assert.equal(game._skipRender,false);
  const nativeMain=fs.readFileSync(new URL('../../inkwave-public/src/main.js',import.meta.url),'utf8');
  const frameSource=nativeMain.slice(nativeMain.indexOf('  _frame(dt) {'),nativeMain.indexOf('  _updateAmbience(dt) {'));
  assert(!/_skipRender\s*=/.test(frameSource),'the unchanged native frame does not reset the audit draw hold');
 }finally{
  if(previous===undefined)delete globalThis.__inkwave;else globalThis.__inkwave=previous;
  if(previousQA===undefined)delete globalThis.__ceilingPlacement;else globalThis.__ceilingPlacement=previousQA;
 }
});
