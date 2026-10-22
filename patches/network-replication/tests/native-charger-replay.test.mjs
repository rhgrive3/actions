import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`
 export {NetSession} from './inkwave-public/src/net/session.js';
 export {prepareNativeChargerInputs,commitNativeChargerInputs} from './patches/splatoon3/runtime/native-charger-input.mjs';
 export {createNativeChargerReplay,advanceNativeChargerReplay,nativeChargerReplayState,retireNativeChargerReplay,peekNativeChargerReplayLaunch,commitNativeChargerReplayLaunch} from './patches/splatoon3/runtime/native-charger-replay.mjs';
`});
f.context.crypto=webcrypto;
const V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
function setup({height=0,ink=100,gear=false}={}){
 f.G.projectiles.clear();f.G.time=0;f.G.actors=[];
 const floor={id:0,solid:true,grate:false,center:V(0,-.1,0),half:V(50,.1,50),axes:[V(1),V(0,1),V(0,0,1)],faces:[-1,-1,0,-1,-1,-1],aabbMin:V(-50,-.2,-50),aabbMax:V(50,0,50)};
 const level=f.G.level={blocks:[floor],faces:[{origin:V(),u:V(1),v:V(0,0,1)}],spawnPads:[V(0,0,-30),V(0,0,30)],spawnBarrier:2,groundHeight:()=>0,queryBlocks(_a,_b,_c,_d,out){out.length=0;out.push(0);return out;}};
 f.G.physics=new f.Physics(level);let paints=0;f.G.paint={sample:()=>1,splat:()=>{paints++;return 0;}};
 const a=Object.assign(f.make('charger'),{nid:77,owner:'A',netLife:0});a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;a.spawnAt(V(0,height,0),0);a.ink=ink;
 if(gear){a.s3.loadout=[{main:'inkSaverMain',subs:['inkSaverMain','inkSaverMain','inkSaverMain']},{main:'inkRecovery',subs:['inkRecovery','inkRecovery','inkRecovery']},{main:'runSpeed',subs:['inkSaverSub','inkSaverSub','inkSaverSub']}];a.s3RefreshGear();}
 const s=new f.NetSession();Object.assign(s,{myId:'A',hostId:'A',state:'match',tr:{broadcast:()=>true,sendTo:()=>true}});s._members.set('A',{});s._members.set('B',{});
 const n=new f.NetMatch(s,{id:'source-replay-test',map:'reef'}),m={state:'playing',time:180,actors:[a],playing:()=>true,canRespawn:()=>false};n.bind(m);s.match=n;f.G.netm=n;f.G.match=m;
 const token=f.createNativeChargerReplay(a,{position:V(0,height,0),yaw:0,time:0});assert.ok(token);
 const original={netm:f.G.netm,projectiles:f.G.projectiles,actors:f.G.actors};
 const step=(input={},dt=1/60,mutate=null)=>{
  Object.assign(a.intent,{fire:false,squid:false,sub:false,jump:false,special:false},input);a.intent.move.set(input.mx||0,0,input.mz||0);f.G.time+=dt;a.update(dt);
  const receipt=f.prepareNativeChargerInputs(n,f.G),rows=receipt.payload[1][3],copy=rows.map(r=>Array.from(r));if(mutate)mutate(copy);
  const paintsBefore=paints,outBefore=n.out.length,flightsBefore=f.G.projectiles._fidelityChargerFlights?.length||0,bombsBefore=f.G.projectiles.bombs.length;
  const accepted=f.advanceNativeChargerReplay(token,copy);assert.ok(f.commitNativeChargerInputs(n,receipt,f.G));
  assert.equal(paints,paintsBefore,'private replay must not paint');assert.equal(n.out.length,outBefore,'private replay must not enqueue events');assert.equal(f.G.projectiles._fidelityChargerFlights?.length||0,flightsBefore);assert.equal(f.G.projectiles.bombs.length,bombsBefore);
  for(const [k,v] of Object.entries(original))assert.equal(f.G[k],v,`restore ${k}`);
  assert.equal(f.G.time,rows.at(-1)[2]);return {accepted,state:f.nativeChargerReplayState(token),row:copy[0]};
 };
 const equal=state=>{assert.equal(state.error,null);assert.ok(Math.abs(state.ink-a.ink)<1e-10,`ink ${state.ink} vs ${a.ink}`);assert.equal(state.lastFire,a.lastFire);assert.equal(state.kidT,a.kidT);assert.equal(state.charge,a.weaponRunner.charge);assert.equal(state.chargeT,a.weaponRunner.chargeT);assert.equal(state.charging,a.weaponRunner.charging);assert.equal(state.form,a.form);assert.deepEqual(Array.from(state.position),Array.from(a.pos.toArray()));};
 return {a,n,s,token,step,equal,close(){f.retireNativeChargerReplay(token);n.dispose();f.G.projectiles.clear();}};
}
for(const hz of [30,60,120])test(`private actual ${hz}Hz owner reproduces full/partial charge and exact native ink`,()=>{
 const w=setup();try{
  for(const ticks of [Math.ceil(hz*.24),Math.ceil(hz*1.1)]){
   for(let i=0;i<ticks;i++){const x=w.step({fire:true},1/hz);assert.ok(x.accepted,x.state.error);w.equal(x.state);}
   for(let i=0;i<Math.ceil(hz*.4);i++){const x=w.step({},1/hz);assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  }
  const r=f.nativeChargerReplayState(w.token);assert.equal(r.shots.length,2);assert.equal(r.shots[0].full,false);assert.equal(r.shots[1].full,true);assert.equal(r.shots[1].damage,160);
 }finally{w.close();}
});
test('normal14F/32F/63F R-cancel resource trace has identical native source budget every frame',()=>{
 const w=setup();try{
  for(const ticks of [14,32,63]){
   for(let i=0;i<ticks;i++){const x=w.step({fire:true});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
   for(let i=0;i<5;i++){const x=w.step({sub:true});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
   for(let i=0;i<6;i++){const x=w.step();assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  }
  assert.equal(f.nativeChargerReplayState(w.token).shots.length,0);
 }finally{w.close();}
});
test('receiver-installed equipped gear uses the same native main/sub debit and recovery laws',()=>{
 const w=setup({gear:true});try{
  for(let i=0;i<65;i++){const x=w.step({fire:true,mx:.2});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  for(let i=0;i<20;i++){const x=w.step({sub:i<16});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  for(let i=0;i<50;i++){const x=w.step();assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  assert.equal(f.nativeChargerReplayState(w.token).subs,1);
 }finally{w.close();}
});
test('progressive low-ink funding and held recovery remain identical after five paid full shots',()=>{
 const w=setup();try{
  for(let cycle=0;cycle<6;cycle++){
   for(let i=0;i<65;i++){const x=w.step({fire:true});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
   for(let i=0;i<8;i++){const x=w.step();assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  }
  for(let i=0;i<360;i++){const x=w.step({fire:true});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  for(let i=0;i<3;i++){const x=w.step();assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  assert.ok(f.nativeChargerReplayState(w.token).shots.length>=6);
 }finally{w.close();}
});
test('full native keep/dive/resurface31F uses actual source gates and exact ink',()=>{
 const w=setup();try{
  for(let i=0;i<64;i++){const x=w.step({fire:true});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  for(let i=0;i<9;i++){const x=w.step({fire:true,squid:true});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  assert.ok(f.nativeChargerReplayState(w.token).kept);
  for(let i=0;i<34;i++){const x=w.step({fire:true});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  for(let i=0;i<3;i++){const x=w.step();assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  assert.equal(f.nativeChargerReplayState(w.token).shots.length,1);
 }finally{w.close();}
});
test('stored keep avoids the fresh-charge5F classification but native sub ownership still consumes it',()=>{
 const w=setup();try{
  for(let i=0;i<64;i++)assert.ok(w.step({fire:true}).accepted);for(let i=0;i<9;i++)assert.ok(w.step({fire:true,squid:true}).accepted);
  assert.ok(f.nativeChargerReplayState(w.token).kept);
  const x=w.step({fire:true,sub:true});assert.ok(x.accepted,x.state.error);w.equal(x.state);assert.equal(x.state.kept,false);assert.equal(w.a.weaponRunner.s3ChargerCancelSubRemaining,0);assert.equal(x.state.shots.length,0);
 }finally{w.close();}
});
test('actual source air/landing/jump/movement produces body witnesses without pose injection',()=>{
 const w=setup({height:3});try{
  for(let i=0;i<180;i++){const x=w.step({fire:i<170,mx:.3,mz:.2,jump:i===70});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  assert.equal(f.nativeChargerReplayState(w.token).shots.length,1);
 }finally{w.close();}
});
test('native R preparation and actual bomb debit reproduce without a replay world bomb',()=>{
 const w=setup();try{
  for(let i=0;i<16;i++){const x=w.step({sub:i<12});assert.ok(x.accepted,x.state.error);w.equal(x.state);}
  assert.equal(f.nativeChargerReplayState(w.token).subs,1);assert.equal(f.G.projectiles.bombs.length,1);
 }finally{w.close();}
});
for(const forged of ['body','effective','form','serial','time'])test(`co-forged ${forged} source witness cannot override native replay admission`,()=>{
 const w=setup();try{
  const x=w.step({fire:true},1/60,rows=>{const r=rows[0];if(forged==='body')r[6]=.1;if(forged==='effective')r[4]=0;if(forged==='form')r[9]=1;if(forged==='serial')r[0]=2;if(forged==='time')r[2]+=1;});assert.equal(x.accepted,false);assert.match(x.state.error,/witness|gap|clock/);assert.equal(x.state.shots.length,0);
 }finally{w.close();}
});
test('only a private actual source fire produces a single-use launch receipt',()=>{
 const w=setup();try{
  assert.equal(f.peekNativeChargerReplayLaunch(w.token,{tick:1,charge:1,full:true}),null);
  for(let i=0;i<64;i++)assert.ok(w.step({fire:true}).accepted);for(let i=0;i<2;i++)assert.ok(w.step().accepted);
  const shot=f.nativeChargerReplayState(w.token).shots[0],request={tick:Math.round(shot.time*60),charge:1,full:true};
  const receipt=f.peekNativeChargerReplayLaunch(w.token,request);assert.ok(receipt);assert.equal(receipt.damage,160);
  assert.equal(f.commitNativeChargerReplayLaunch(w.token,{...receipt}),false);assert.equal(f.commitNativeChargerReplayLaunch(w.token,receipt),true);assert.equal(f.commitNativeChargerReplayLaunch(w.token,receipt),false);assert.equal(f.peekNativeChargerReplayLaunch(w.token,request),null);
 }finally{w.close();}
});
for(const change of ['life','weapon','world-clear','retire'])test(`a native launch receipt cannot cross ${change}`,()=>{
 const w=setup();try{
  for(let i=0;i<64;i++)assert.ok(w.step({fire:true}).accepted);for(let i=0;i<2;i++)assert.ok(w.step().accepted);
  const shot=f.nativeChargerReplayState(w.token).shots[0],receipt=f.peekNativeChargerReplayLaunch(w.token,{tick:Math.round(shot.time*60),charge:1,full:true});assert.ok(receipt);
  if(change==='life')w.a.netLife++;if(change==='weapon')w.a.setWeapon('shooter');if(change==='world-clear')f.G.projectiles.clear();if(change==='retire')f.retireNativeChargerReplay(w.token);
  assert.equal(f.commitNativeChargerReplayLaunch(w.token,receipt),false);
 }finally{w.close();}
});
