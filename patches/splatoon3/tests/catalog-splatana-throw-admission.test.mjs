import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
const DT=1/60,EPS=1e-9,STAGE={id:'splatana-throw-admission',clams:{spawns:[],goals:[[0,0,80],[0,0,-80]]}};
const input=()=>({keys:new Set(),pressed:new Set(),padPressed:new Set(),mouse:{dx:0,dy:0,left:false,right:false},down(k){return this.keys.has(k);},wasPressed(k){return this.pressed.has(k);},padButton:()=>false,padValue:()=>0});
for(const weapon of ['s3-saber-normal','s3-saber-lite','s3-saber-heavy'])test(`${weapon}: actual wave recovery rejects Clam edges and Sub taps, preserves a held Sub until natural expiry`,async t=>{
 const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {Transport} from './src/net/transport.js'; export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`}),rows=[];f.G.netm=null;f.G.settings.aimAssist=0;
 let active=null;
 const push=f.G.projectiles._push;f.G.projectiles._push=function(p){if(p.owner===active?.a&&p.catalog)active.waves.push({frame:active.frame,pos:p.pos.toArray(),vel:p.vel.toArray()});return push.call(this,p);};
 const nativeThrow=f.G.projectiles.throwBomb;f.G.projectiles.throwBomb=function(a,...args){const count=this.bombs.length,result=nativeThrow.call(this,a,...args);if(a===active?.a)for(const b of this.bombs.slice(count))active.subs.push({frame:active.frame,id:a.weapon.sub,pos:b.pos.toArray(),vel:b.vel.toArray(),owner:'native-bomb'});return result;};
 f.on('all:sub',e=>{if(e.actor===active?.a&&e.phase==='spawn')active.subs.push({frame:active.frame,id:e.subId,pos:[e.x,e.y,e.z],vel:[e.vx,e.vy,e.vz]});});
 for(const charged of [false,true])for(const action of ['clam-held','sub-tap','sub-held']){
  const a=await f.make();a.nid=1;a.setWeapon(weapon);a.character.onEvent=null;
  const m=Object.assign(Object.create(f.Match.prototype),{mode:'clams',state:'playing',ranked:new f.RankedEngine('clams',STAGE),actors:[a],local:a,rankedGains:[0,0],rankedBarrierHits:[],rankedEffects:{event(){},update(){}},playing:()=>true,canRespawn:()=>false});
  const world=m.rankedWorld=new f.RankedWorld(f,m,STAGE),raw=input(),rig={yaw:0,pitch:0,mode:'follow',target:a},controller=new f.PlayerController(a,rig,raw);controller.computeAim=()=>{};f.G.match=m;f.G.rig=rig;
  active={a,waves:[],subs:[],frame:0};const tick=()=>{active.frame++;f.G.time+=DT;controller.update(DT);a.update(DT);m.advanceRanked(DT);raw.pressed.clear();};
  for(let i=0;i<40;i++)tick();active.frame=0;m.ranked.rule.state.inventories['1']={team:0,small:3,power:false};
  raw.mouse.left=true;for(let i=0;i<(charged?120:1);i++)tick();raw.mouse.left=false;
  while(!active.waves.length&&active.frame<180)tick();assert.equal(active.waves.length,1,'real installed main emitted a wave');
  const s=a.weaponRunner.catalogState,atWave=s.stop;assert(atWave>DT,'wave leaves a measurable existing recovery');
  const waveFrame=active.waves[0].frame,blocked=[];let firstReady=null;
  if(action==='clam-held'){raw.keys.add('KeyC');raw.pressed.add('KeyC');}else raw.mouse.right=true;
  for(let i=0;i<100;i++){
   const pre=s.stop;if(action==='sub-tap'&&i===1)raw.mouse.right=false;tick();
   if(pre>EPS){assert.equal(s.stop,Math.max(0,pre-DT),'one existing clock decrement, no hard cancel');assert.equal(a.weaponRunner.aimingSub,false);assert.equal(a.weaponRunner.s3SubReady??null,null);assert.equal(active.subs.length,0);assert.equal(m.ranked.rule.state.inventories['1'].small,3);assert.equal(m.ranked.rule.state.clams.filter(c=>c.thrower==='1').length,0);assert.equal(a._rankedInput.throw,false);assert.equal(!!a._rankedThrowPending,false);blocked.push({frame:active.frame,pre,after:s.stop});}
   if(a.weaponRunner.aimingSub){firstReady=active.frame;assert(pre<=EPS,'hold starts preparation only after the existing EPS recovery boundary');break;}
   if(pre<=EPS&&action!=='sub-held'&&i>40)break;
  }
  if(action==='clam-held'){
   assert.equal(firstReady,null);assert.equal(m.ranked.rule.state.inventories['1'].small,3,'blocked held edge is not invented later');raw.keys.delete('KeyC');tick();raw.keys.add('KeyC');raw.pressed.add('KeyC');tick();assert.equal(m.ranked.rule.state.inventories['1'].small,2,'fresh unlocked edge throws once');assert.equal(m.ranked.rule.state.clams.filter(c=>c.thrower==='1').length,1);
  }else{
   if(action==='sub-tap'){assert.equal(firstReady,null);assert.equal(active.subs.length,0,'rejected tap cannot become a delayed release');raw.mouse.right=true;tick();assert.equal(a.weaponRunner.aimingSub,true);firstReady=active.frame;}
   assert.notEqual(firstReady,null);for(let i=0;i<12;i++)tick();raw.mouse.right=false;for(let i=0;i<12;i++)tick();
   assert.equal(active.subs.length,1,'actual equipped Sub object emitted after admitted hold/release');assert.equal(active.subs[0].id,a.weapon.sub);assert(active.subs[0].pos.every(Number.isFinite)&&active.subs[0].vel.every(Number.isFinite));
  }
  rows.push({weapon,charged,action,waveFrame,stopAtWave:atWave,blockedTicks:blocked,firstReady,subSpawns:active.subs,remainingClams:m.ranked.rule.state.inventories['1'].small});world.dispose();f.reset();
 }
 f.G.projectiles._push=push;f.G.projectiles.throwBomb=nativeThrow;t.diagnostic(JSON.stringify(rows));
});

test('follower real wave rejects the blocked edge before the native actor packet, then sends one fresh unlocked throw',async t=>{
 const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {Transport} from './src/net/transport.js'; export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`});
 const a=await f.make();Object.assign(a,{nid:1,owner:'guest',slot:0});a.setWeapon('s3-saber-lite');a.character.onEvent=null;
 const m=Object.assign(Object.create(f.Match.prototype),{mode:'clams',state:'playing',follower:true,ranked:new f.RankedEngine('clams',STAGE),actors:[a],local:a,rankedGains:[0,0],rankedBarrierHits:[],rankedEffects:{event(){},update(){}},playing:()=>true,canRespawn:()=>false});
 const world=m.rankedWorld=new f.RankedWorld(f,m,STAGE),raw=input(),rig={yaw:0,pitch:0,mode:'follow',target:a},controller=new f.PlayerController(a,rig,raw);
 controller.computeAim=()=>{};f.G.match=m;f.G.rig=rig;f.G.settings.aimAssist=0;
 const packets=[],tr=new f.Transport();tr.ws={readyState:1,bufferedAmount:0,send(wire){if(wire.startsWith('b|'))packets.push(JSON.parse(wire.slice(2)));}};
 const session={myId:'guest',hostId:'host',isHost:false,_members:new Set(['host','guest']),tr};
 const nm=new f.NetMatch(session,{id:'splatana-admission',mode:'clams',map:'tidewater'});nm.bind(m);f.G.netm=nm;
 let waves=0;const push=f.G.projectiles._push;f.G.projectiles._push=function(p){if(p.owner===a&&p.catalog)waves++;return push.call(this,p);};
 const tick=()=>{f.G.time+=DT;controller.update(DT);a.update(DT);m.advanceRanked(DT);raw.pressed.clear();};
 for(let i=0;i<40;i++)tick();m.ranked.rule.state.inventories['1']={team:0,small:3,power:false};
 raw.mouse.left=true;tick();raw.mouse.left=false;for(let i=0;!waves&&i<60;i++)tick();assert.equal(waves,1);assert(a.weaponRunner.catalogState.stop>DT);
 raw.keys.add('KeyC');raw.pressed.add('KeyC');tick();nm._sendTick();const blocked=packets.filter(p=>p.k==='t').at(-1);
 assert.equal(blocked.rki.throw,false);assert.equal(!!a._rankedThrowPending,false);
 while(a.weaponRunner.catalogState.stop>EPS)tick();tick();nm._sendTick();assert.equal(packets.filter(p=>p.k==='t').at(-1).rki.throw,false,'held rejected edge never reappears on wire');
 raw.keys.delete('KeyC');tick();raw.keys.add('KeyC');raw.pressed.add('KeyC');tick();assert.equal(a._rankedThrowPending,true);nm._sendTick();const accepted=packets.filter(p=>p.k==='t').at(-1);assert.equal(accepted.rki.throw,true);assert.equal(a._rankedThrowPending,false);
 nm._sendTick();assert.equal(packets.filter(p=>p.k==='t').at(-1).rki.throw,false,'ordinary native packet consumes admitted edge once');
 assert.equal(m.ranked.rule.state.inventories['1'].small,3,'follower cannot score or spend inventory locally');
 t.diagnostic(JSON.stringify({blocked:blocked.rki,accepted:accepted.rki,packets:packets.filter(p=>p.k==='t').length}));
 f.G.projectiles._push=push;f.G.netm=null;world.dispose();f.reset();
});

// Nintendo's note establishes the after-swing interval, not a new windup lock.
// Preserve the old pending-wave cancel/throw admission, including its last tick.
test('pre-wave and wave-due inputs retain existing Sub cancellation and Clam admission for all three Splatana sources',async t=>{
 const f=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {Transport} from './src/net/transport.js'; export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';`}),rows=[];
 f.G.netm=null;f.G.settings.aimAssist=0;let active=null;
 const push=f.G.projectiles._push;f.G.projectiles._push=function(p){if(p.owner===active?.a&&p.catalog)active.waves.push({frame:active.frame,pos:p.pos.toArray(),vel:p.vel.toArray()});return push.call(this,p);};
 for(const weapon of ['s3-saber-normal','s3-saber-lite','s3-saber-heavy'])for(const charged of [false,true])for(const phase of ['early','wave-due'])for(const action of ['sub','clam']){
  const a=await f.make();a.nid=1;a.setWeapon(weapon);a.character.onEvent=null;
  const m=Object.assign(Object.create(f.Match.prototype),{mode:'clams',state:'playing',ranked:new f.RankedEngine('clams',STAGE),actors:[a],local:a,rankedGains:[0,0],rankedBarrierHits:[],rankedEffects:{event(){},update(){}},playing:()=>true,canRespawn:()=>false});
  const world=m.rankedWorld=new f.RankedWorld(f,m,STAGE),raw=input(),rig={yaw:0,pitch:0,mode:'follow',target:a},controller=new f.PlayerController(a,rig,raw);
  controller.computeAim=()=>{};f.G.match=m;f.G.rig=rig;active={a,frame:0,waves:[]};
  const tick=()=>{active.frame++;f.G.time+=DT;controller.update(DT);a.update(DT);m.advanceRanked(DT);raw.pressed.clear();};
  for(let i=0;i<40;i++)tick();active.frame=0;m.ranked.rule.state.inventories['1']={team:0,small:3,power:false};
  raw.mouse.left=true;for(let i=0;i<(charged?120:1);i++)tick();raw.mouse.left=false;tick();
  const s=a.weaponRunner.catalogState;assert(s.pending&&s.stop>EPS);assert.equal(active.waves.length,0);
  if(phase==='wave-due'){while(s.pending.remaining>DT+EPS)tick();assert(s.pending.remaining<=DT+EPS);}
  const before={frame:active.frame,pending:s.pending.remaining,stop:s.stop};
  if(action==='sub')raw.mouse.right=true;else{raw.keys.add('KeyC');raw.pressed.add('KeyC');}
  tick();
  if(action==='sub'){
   assert.equal(s.pending,null);assert.equal(s.stop,0);assert.equal(active.waves.length,0,'pre-wave Sub keeps the old cancellation');assert.equal(a.weaponRunner.aimingSub,true);
   for(let i=0;i<30;i++)tick();assert.equal(active.waves.length,0,'cancelled wave never emerges later');assert.equal(m.ranked.rule.state.inventories['1'].small,3);
  }else{
   assert.equal(a._rankedInput.throw,true);assert.equal(m.ranked.rule.state.inventories['1'].small,2,'pre-wave edge stays admitted');assert.equal(m.ranked.rule.state.clams.filter(c=>c.thrower==='1').length,1);
   if(phase==='wave-due')assert.equal(active.waves.length,1,'Clam retains prior same-tick main-wave behavior');
   for(let i=0;!active.waves.length&&i<60;i++)tick();assert.equal(active.waves.length,1);assert.equal(a.weaponRunner.aimingSub,false);
  }
  rows.push({weapon,charged,phase,action,before,mainWaves:active.waves.length,remainingClams:m.ranked.rule.state.inventories['1'].small});world.dispose();f.reset();
 }
 f.G.projectiles._push=push;t.diagnostic(JSON.stringify(rows));
});
