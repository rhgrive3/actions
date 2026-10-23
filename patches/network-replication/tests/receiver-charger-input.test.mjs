import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
let wall=1000;
const exports=`export {NetSession} from './inkwave-public/src/net/session.js';export {receiverChargerInputStatus,peekReceiverChargerBirth,commitReceiverChargerBirth} from './patches/network-replication/receiver-charger-input.mjs';`;
const sender=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>wall*1000},extraExports:exports});
const receiver=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>wall*1000},extraExports:exports});
sender.context.crypto=receiver.context.crypto=webcrypto;
function actor(f,myId){
 const V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);f.G.projectiles.clear();f.G.actors=[];
 const floor={id:0,solid:true,grate:false,center:V(0,-.1,0),half:V(50,.1,50),axes:[V(1),V(0,1),V(0,0,1)],faces:[-1,-1,0,-1,-1,-1],aabbMin:V(-50,-.2,-50),aabbMax:V(50,0,50)};
 const level=f.G.level={blocks:[floor],faces:[{origin:V(),u:V(1),v:V(0,0,1)}],spawnPads:[V(0,0,-30),V(0,0,30)],spawnBarrier:2,groundHeight:()=>0,queryBlocks(_a,_b,_c,_d,out){out.length=0;out.push(0);return out;}};
 f.G.physics=new f.Physics(level);f.G.paint={sample:()=>1,splat:()=>0};
 const a=Object.assign(f.make('charger'),{nid:77,owner:'A',netLife:0});a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;a.spawnAt(V(),0);a.aimPoint.set(0,1.05,100);
 const s=new f.NetSession();Object.assign(s,{myId,hostId:'A',state:'match'});s._members.set('A',{});s._members.set('B',{});
 const n=new f.NetMatch(s,{id:'causal-input-test',map:'reef'}),m={id:'causal-input-test',state:'playing',time:180,actors:[a],playing:()=>true,canRespawn:()=>false};f.G.match=m;s.match=n;return {f,a,s,n,m};
}
function setup({initialTurf=false,hz=60}={}){
 wall=1000;sender.G.time=173.25;receiver.G.time=21.75;
 const source=actor(sender,'A'),target=actor(receiver,'B'),wire=[],births=[];
 let filter=p=>p;
 source.s.tr={sendTo(_id,d){target.n.onMessage('A',structuredClone(d));return true;},broadcast(d){if(d.k==='t'){const p=filter(JSON.parse(JSON.stringify(d)));wire.push(p);if(p)target.n.onMessage('A',p);}return true;},close(){}};
 target.s.tr={sendTo(_id,d){source.n.onMessage('B',structuredClone(d));return true;},broadcast:()=>true,close(){}};
 if(initialTurf)for(const w of [source,target]){
  w.m.mode='turf';w.m.opts={};w.a.remote=w.s.myId!=='A';
  assert.equal(w.f.beginInitialSquidSpawn(w.a),true);
 }
 source.n.bind(source.m);target.n.bind(target.m);
 const playback=()=>{const p=target.n.peers.get('A');if(p){for(const e of p.events)if(e[1]==='ev'&&e[2]==='weapon:fire'&&!births.includes(e))births.push(e);p.tr=p.lastTs;p.sim=p.physicsPoints?.at(-1);target.n._playEvents();}};
 let tick=0;
 const step=(input={},send=true)=>{
  wall+=1/hz;sender.G.time+=1/hz;receiver.G.time+=1/hz;Object.assign(source.a.intent,{fire:false,sub:false,squid:false,jump:false,special:false},input);source.a.intent.move.set(input.mx||0,0,input.mz||0);source.a.update(1/hz);tick++;
  if(send&&tick%3===0){source.n._sendTick();playback();}
 };
 return {source,target,wire,births,step,playback,setFilter(fn){filter=fn},status:()=>receiver.receiverChargerInputStatus(target.n),close(){source.n.dispose();target.n.dispose();sender.G.projectiles.clear();receiver.G.projectiles.clear();}};
}
test('actual dual-peer source input binds trusted spawn, arbitrary sim origin and FIFO native launch',()=>{
 const w=setup();try{
  for(let i=0;i<64;i++)w.step({fire:true});for(let i=0;i<5;i++)w.step();
  const s=w.status(),c=s.actors[0];assert.equal(c.reason,null);assert.equal(c.nextReceived,70);assert.equal(c.nextExecuted,70);assert.ok(c.verified>=69);assert.equal(c.replay.shots.length,1);assert.equal(c.matched,1);assert.equal(s.frames,0);assert.equal(w.births.length,1);
  const receipt=receiver.peekReceiverChargerBirth(w.target.n,w.births[0]);assert.ok(receipt);assert.equal(receipt.damage,160);assert.equal(receiver.commitReceiverChargerBirth(w.target.n,w.births[0]),true);assert.equal(receiver.commitReceiverChargerBirth(w.target.n,w.births[0]),false);
 }finally{w.close();}
});

for(const hz of [30,120])test(`initial Turf source wait/steering/landing and one native shot at ${hz}Hz`,()=>{
 const w=setup({initialTurf:true,hz});try{
  for(let i=0;i<hz*3.5;i++)w.step({fire:i>=hz*2.2&&i<hz*3.3,mx:i>=hz*1.1&&i<hz*1.5?.15:0});
  const c=w.status().actors[0];assert.equal(c.reason,null);assert.equal(c.replay.shots.length,1);assert.equal(c.matched,1);
  assert.ok(Math.abs(c.replay.ink-w.source.a.ink)<1e-9);assert.equal(w.source.a.s3.squidSpawn,undefined);
 }finally{w.close();}
});
for(const forged of ['resource','effective','body','missing-aim-request'])test(`initial Turf ${forged} witness cannot grant a launch`,()=>{
 const w=setup({initialTurf:true});try{
  w.setFilter(p=>{const r=p.ci?.[1]?.[3]?.[0];if(r){if(forged==='resource')r[14]=1;if(forged==='effective')r[4]=1;if(forged==='body')r[5]+=.1;if(forged==='missing-aim-request')r.splice(17);}return p;});
  for(let i=0;i<3;i++)w.step();const c=w.status().actors[0];assert.match(c.reason,/witness|another action owner/);assert.equal(c.matched,0);assert.equal(c.replay,null);
 }finally{w.close();}
});
test('opening intro and playing phases replay when the trusted Match phase is current',()=>{
 const w=setup({initialTurf:true});try{
  w.source.m.state=w.target.m.state='intro';
  for(let i=0;i<90;i++)w.step();
  assert.equal(w.status().actors[0].reason,null);assert.equal(w.status().actors[0].replay.shots.length,0);
  w.source.m.state=w.target.m.state='playing';
  for(let i=0;i<210;i++)w.step({fire:i>=135&&i<200});
  const c=w.status().actors[0];assert.equal(c.reason,null);assert.equal(c.matched,1);assert.equal(c.replay.shots.length,1);
 }finally{w.close();}
});
test('an intro prefix received after the Match phase changed retires proof instead of inventing a checkpoint',()=>{
 const w=setup({initialTurf:true});try{
  w.source.m.state=w.target.m.state='intro';
  for(let i=0;i<90;i++)w.step({},false);
  w.target.m.state='playing';w.source.n._sendTick();w.playback();
  const c=w.status().actors[0];assert.match(c.reason,/witness/);assert.equal(c.matched,0);assert.equal(c.replay,null);
  assert.ok(w.target.a.net.buf.length>0,'ordinary snapshot admission continues');
 }finally{w.close();}
});
test('an accepted packet cannot replay future resources faster than fixed receiver elapsed budget',()=>{
 const w=setup();try{
  for(let i=0;i<64;i++)w.step({fire:true},false);for(let i=0;i<2;i++)w.step({},false);
  w.setFilter(p=>{for(const e of p.e||[])e[0]=p.ts;return p;});
  wall=1000;w.source.n._sendTick();w.playback();let c=w.status().actors[0];assert.equal(c.nextExecuted,1);assert.equal(c.wait,'receiver-elapsed');assert.equal(c.replay,null);
  wall=1000.5;w.playback();c=w.status().actors[0];assert.ok(c.nextExecuted<=31);assert.ok(c.elapsed<=.5+1e-9);assert.equal(c.replay.shots.length,0);
  wall=1001.2;w.playback();c=w.status().actors[0];assert.equal(c.reason,null);assert.equal(c.nextExecuted,67);assert.equal(c.matched,1);
 }finally{w.close();}
});
test('same accepted retry prefix is deduplicated without losing a short R tap',()=>{
 const w=setup();try{
  const saved=[];w.setFilter(p=>{saved.push(structuredClone(p));return p;});
  w.step({sub:true});w.step();w.step();const before=w.status().actors[0];assert.equal(before.nextExecuted,4);
  const packet=saved[0];wall+=.05;packet.ts+=.05;w.target.n.onMessage('A',packet);w.playback();const after=w.status().actors[0];assert.equal(after.reason,null);assert.equal(after.nextExecuted,4);assert.equal(after.nextReceived,4);assert.equal(after.replay.subs,before.replay.subs);
 }finally{w.close();}
});
test('a gap never bootstraps a new private life or funds a source shot from later pose fields',()=>{
 const w=setup();try{
  w.setFilter(p=>{if(p.ci){const row=p.ci[1][3][0];row[0]++;p.ci[1][3].splice(1);p.ci[1][4][0]=Math.max(p.ci[1][4][0],row[0]);}return p;});for(let i=0;i<3;i++)w.step({fire:true});
  const c=w.status().actors[0];assert.equal(c.reason,'input-gap-clock-or-order');assert.equal(c.nextReceived,1);assert.equal(c.nextExecuted,1);assert.equal(c.replay,null);
 }finally{w.close();}
});
test('uncontracted external displacement cannot assign a body to the source driver or break normal playback',()=>{
 const w=setup();try{
  for(let i=0;i<3;i++)w.step();w.source.a.pos.x+=.3;for(let i=0;i<3;i++)w.step();
  const c=w.status().actors[0];assert.match(c.reason,/witness|canonical-body/);assert.equal(c.replay,null);assert.ok(w.target.a.net.buf.length>=2,'the existing normal actor path remains active');
 }finally{w.close();}
});
test('a FIFO birth received before its input prefix waits for the later actual source log',()=>{
 const w=setup();try{
  let held=null;w.setFilter(p=>{if(p.e?.some(e=>e[1]==='ev'&&e[2]==='weapon:fire')){held=p.ci;delete p.ci;}return p;});
  for(let i=0;i<64;i++)w.step({fire:true});for(let i=0;i<2;i++)w.step();assert.ok(held);assert.equal(w.births.length,1);assert.equal(receiver.peekReceiverChargerBirth(w.target.n,w.births[0]),null);assert.equal(w.status().births,1);
  w.setFilter(p=>({...p,ci:held}));wall+=.05;receiver.G.time+=.05;w.source.n._sendTick();w.playback();const c=w.status().actors[0];assert.equal(c.reason,null);assert.equal(c.matched,1);assert.ok(receiver.peekReceiverChargerBirth(w.target.n,w.births[0]));
 }finally{w.close();}
});
test('co-forged full fire cannot turn an actual minimum-charge native launch into a full receipt',()=>{
 const w=setup();try{
  w.setFilter(p=>{for(const e of p.e||[])if(e[1]==='ev'&&e[2]==='weapon:fire'){e[3].charge=1;e[3].full=true;e[3].len=sender.G.projectiles.chargerReach(1);}return p;});
  for(let i=0;i<9;i++)w.step({fire:true});for(let i=0;i<6;i++)w.step();assert.equal(w.births.length,1);assert.equal(receiver.peekReceiverChargerBirth(w.target.n,w.births[0]),null);assert.equal(w.status().actors[0].matched,0);
 }finally{w.close();}
});
test('pressing unready Special remains a legal native no-op input during a normal full charge',()=>{
 const w=setup();try{
  for(let i=0;i<64;i++)w.step({fire:true,special:i===11});for(let i=0;i<5;i++)w.step();const c=w.status().actors[0];assert.equal(c.reason,null);assert.equal(c.matched,1);assert.equal(w.source.a.specialActive,null);
 }finally{w.close();}
});
test('same-tick native feet paint plays before the next source swim/resource frame',()=>{
 const w=setup();try{
  let sourcePaint=false,receiverPaint=false,sourceStamps=0,receiverStamps=0;
  sender.G.paint.sample=()=>sourcePaint?1:0;receiver.G.paint.sample=()=>receiverPaint?1:0;
  sender.G.paint.splat=(position,radius,team,opts={})=>{sourcePaint=true;sourceStamps++;w.source.n.recSplat(position,radius,team,opts);return 0;};
  receiver.G.paint.splat=()=>{receiverPaint=true;receiverStamps++;return 0;};
  // Keep advancing through the native post-shot swim gate; the source itself
  // remains humanoid for the first part of this held squid input.
  for(let i=0;i<64;i++)w.step({fire:true});for(let i=0;i<2;i++)w.step();for(let i=0;i<24;i++)w.step({squid:true,mx:.3});
  const c=w.status().actors[0];assert.ok(sourceStamps>0);assert.ok(receiverStamps>0);assert.equal(c.reason,null);assert.equal(w.source.a.form,'squid');assert.equal(c.replay.form,w.source.a.form);assert.equal(c.verified,90);assert.equal(c.matched,1);assert.equal(receiverPaint,sourcePaint);
 }finally{w.close();}
});
test('a birth with a missing source prefix expires while the source input queue is idle',()=>{
 const w=setup();try{
  w.setFilter(p=>{if(p.e?.some(e=>e[1]==='ev'&&e[2]==='weapon:fire'))delete p.ci;return p;});
  for(let i=0;i<64;i++)w.step({fire:true});for(let i=0;i<2;i++)w.step();
  assert.equal(w.status().births,1);assert.equal(w.status().frames,0);
  wall+=1.5;w.playback();assert.equal(w.status().births,0);assert.equal(receiver.peekReceiverChargerBirth(w.target.n,w.births[0]),null);
 }finally{w.close();}
});
for(const change of ['life','owner','clear','leave','host-change'])test(`an actual receiver launch receipt retires on ${change} without owner snapshot reenrollment`,()=>{
 const w=setup();try{
  for(let i=0;i<64;i++)w.step({fire:true});for(let i=0;i<5;i++)w.step();const e=w.births[0];assert.ok(receiver.peekReceiverChargerBirth(w.target.n,e));
  if(change==='life')w.target.a.net.lastLife++;if(change==='owner')w.target.a.owner='C';if(change==='clear')receiver.G.projectiles.clear();if(change==='leave')w.target.n.onLeave('A',false);if(change==='host-change')w.target.n.onLeave('A',true);
  assert.equal(receiver.peekReceiverChargerBirth(w.target.n,e),null);assert.equal(receiver.commitReceiverChargerBirth(w.target.n,e),false);
 }finally{w.close();}
});

test('actual Turf opening wait, flight, landing and first paid charge replay from the trusted initial spawn',()=>{
 const w=setup({initialTurf:true});try{
  assert.equal(w.source.a.s3.squidSpawn.initial,true);
  for(let i=0;i<3;i++)w.step();
  const rows=w.wire.at(-1).ci[1][3];assert.equal(rows.length,3);
  for(const row of rows){assert.equal(row[14],0);assert.equal(row[4],null);}
  const c=w.status().actors[0];assert.equal(c.life,w.wire.at(-1).ci[1][1],'real initial state and input share the bind-time life');assert.equal(c.nextReceived,4,'all three source frames were accepted');assert.equal(c.reason,null);assert.equal(c.nextExecuted,4);assert.equal(c.replay.ink,100);assert.equal(c.matched,0);
  assert.equal(w.source.a.s3.squidSpawn.phase,'aim');assert.ok(w.target.a.net.buf.length>0,'legacy normal snapshots remain accepted');
  for(let i=0;i<210;i++)w.step({fire:i>=135&&i<200,mx:i>=65&&i<90?.2:0});
  const end=w.status().actors[0];assert.equal(end.reason,null);assert.equal(end.nextExecuted,214);
  assert.equal(end.replay.shots.length,1);assert.equal(end.replay.shots[0].full,true);
  assert.ok(Math.abs(end.replay.ink-w.source.a.ink)<1e-9,'native paid ink after landing');
  assert.equal(w.source.a.s3.squidSpawn,undefined);assert.equal(end.matched,1);
  const receipt=receiver.peekReceiverChargerBirth(w.target.n,w.births[0]);assert.ok(receipt);
  assert.equal(receiver.commitReceiverChargerBirth(w.target.n,w.births[0]),true);
  assert.equal(receiver.commitReceiverChargerBirth(w.target.n,w.births[0]),false);
 }finally{w.close();}
});
