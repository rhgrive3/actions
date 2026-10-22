import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
const f=await fixture({productionComposition:true,includeBoss:true});
const {G,THREE}=f;
const round=(n,p=1000)=>Math.round(n*p)/p;
function setup({x=0,z=8,wall=false,wallZ=4,wallHalf=.1,air=false,height=air?3:0,realOwner=false}={}){
 f.projectiles.clear();G.boss=null;G.time=0;f.clock.set(1000);
 const blocks=wall?[{id:0,solid:true,grate:false,center:new THREE.Vector3(0,1.5,wallZ),half:new THREE.Vector3(10,3,wallHalf),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]}]:[];
 blocks.push({id:blocks.length,solid:true,grate:false,center:new THREE.Vector3(0,-.1,0),half:new THREE.Vector3(50,.1,50),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:[-1,-1,0,-1,-1,-1]});
 for(const b of blocks){b.aabbMin=b.center.clone().sub(b.half);b.aabbMax=b.center.clone().add(b.half);}
 G.level={blocks,faces:[{origin:new THREE.Vector3(),u:new THREE.Vector3(1,0,0),v:new THREE.Vector3(0,0,1)}],spawnPads:[{y:0},{y:0}],groundHeight:()=>0,queryBlocks(_a,_b,_c,_d,out){out.length=0;for(let i=0;i<blocks.length;i++)out.push(i);return out;}};
 G.physics=new f.Physics(G.level);G.paint={splat:()=>0,sample:()=>2};
 const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
 class Display {constructor(){this.root=new THREE.Group();}trigger(){}setWeapon(){}setHurt(){}setVisible(v){this.root.visible=v;}update(){} _owner(){return null;}}
 const owner=realOwner?Object.assign(new f.Actor({team:1,weapon:'charger',CharacterClass:Display}),{nid:17,owner:'peer',remote:true}):f.makeActor({nid:17,owner:'peer',remote:true,team:1,roller:false});owner.weapon=f.WEAPONS.charger;owner.pos.set(0,height,0);owner.weaponRunner=new f.WeaponRunner(owner);
 const victim=f.makeActor({nid:7,owner:'me',remote:false,team:0,roller:false});victim.pos.set(x,height,z);victim.netLife=0;
 G.actors=[owner,victim];G.match=f.bind(nm,G.actors);
 const calls=[];const apply=f.projectiles.applyHit;f.projectiles.applyHit=(...args)=>{calls.push(args);return'accepted';};
 let packed;const producer=f.makeNetMatch(f.makeSession('peer','me',[['me','Me'],['peer','Peer']]));producer.byNid.set(17,owner);producer.s.tr.broadcast=msg=>{packed=msg.a.find(row=>row[0]===17);};G.netm=nm;
 const packet=(elapsed,charging,e=[],progress=elapsed,{squid=false,held=charging,grounded=!air,tick=Math.round(elapsed*60),sub=false}={})=>{
  const ts=round(1000+elapsed);f.clock.set(ts);G.time=tick/60;
  owner.remote=false;owner.form=squid?'squid':'kid';owner.grounded=grounded;owner.intent.fire=held;owner.intent.squid=squid;owner.intent.sub=sub;owner.weaponRunner.charging=charging;owner.weaponRunner.charge=charging?Math.min(1,progress):0;
  producer._sendTick();owner.remote=true;const row=packed;assert.equal(row.length,27);assert.equal(row[26][1]&1,held?1:0);assert.equal(row[26][2],round(owner.pos.y));
  nm.onMessage('peer',{k:'t',ts,u:tick,a:[row],l:{17:0},...(e.length?{e}:{}),r:2});
  return nm.peers.get('peer');
 };
 const event=(charge=1,start=0,seq=1)=>[round(1000+start+Math.max(.15,charge)),'ev','weapon:fire',{actor:{n:17},weapon:'charger',muzzle:[0,owner.pos.y+1.05,0],dir:[0,0,1],charge,full:charge===1,len:f.projectiles.chargerReach(charge)},Math.round((start+Math.max(.15,charge))*60),seq];
 const prepare=(charge=1,override={},start=0,seq=1)=>{
  const duration=Math.max(.15,charge);for(let t=0;t<duration-.0001;t+=.05)packet(round(start+t),true,[],t);
  const e=event(charge,start,seq);Object.assign(e[3],override);const p=packet(round(start+duration),false,[e]);p.tr=1000+start+duration;p.sim=Math.round((start+duration)*60);
  nm._playEvents();return p;
 };
 const hit=(damage=160,extra={})=>nm.onMessage('peer',{k:'hit',m:nm.cfg.id,a:17,v:7,l:0,h:1,seq:1,d:damage,w:'charger',...extra});
 const advance=(peer,n=8)=>{for(let i=0;i<n;i++){f.clock.advance(1/60);G.time+=1/60;peer.sim++;peer.tr=Math.min(peer.lastTs+.15,peer.tr+1/60);f.projectiles.update(1/60);}};
 return {nm,owner,victim,calls,packet,event,prepare,hit,advance,dispose(){nm.dispose();producer.dispose();f.projectiles.applyHit=apply;f.projectiles.clear();}};
}
test('native Charger event plus hit alone cannot mint contact or consume hit identity',()=>{
 const x=setup();try{x.packet(0,false);const e=x.event();e[0]=1000;e[e.length-2]=0;x.packet(.05,false,[e]);x.nm.peers.get('peer').tr=1000.05;x.nm._playEvents();x.hit();assert.equal(x.calls.length,0);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.nm.peers.get('peer').lastHit,undefined);}finally{x.dispose();}
});
test('source finite flight actual capsule contact grants one delayed hit; replay grants nothing',()=>{
 const x=setup();try{const p=x.prepare();assert.equal(f.projectiles._fidelityChargerFlights.length,1);x.hit();assert.equal(x.calls.length,0);x.advance(p);assert.equal(x.calls.length,1);assert.equal(x.calls[0][2],160);x.hit();x.hit(160,{h:2,seq:2});assert.equal(x.calls.length,1);}finally{x.dispose();}
});
test('real OBB cover stops the native flight; forged hit geometry cannot substitute for contact',()=>{
 const x=setup({wall:true});try{const p=x.prepare();x.hit(160,{bg:[0,1.05,0,0,1.05,8,0]});x.advance(p);assert.equal(x.calls.length,0);assert.equal(x.nm.peers.get('peer').lastHit,undefined);}finally{x.dispose();}
});
test('a near-axis miss inside the former 5.5-unit plausibility cone grants no damage',()=>{
 const x=setup({x:4});try{const p=x.prepare();x.hit();x.advance(p);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('minimum legal charge source damage survives wire quantization and receiver contact',()=>{
 const x=setup({z:4});try{const p=x.prepare(.133);x.hit(40);x.advance(p);assert.equal(x.calls.length,1);assert.equal(x.calls[0][2],40);}finally{x.dispose();}
});
test('full flag cannot turn a legal half-charge request into full damage or range',()=>{
 const x=setup();try{const p=x.prepare(.5,{full:true});x.hit();x.advance(p);assert.equal(x.calls.length,0);assert.equal(f.projectiles._fidelityChargerFlights.length,0);}finally{x.dispose();}
});
test('a near-full partial rounded to charge=1 retains source partial damage and range',()=>{
 const x=setup();try{const p=x.prepare(1,{full:false,len:f.projectiles.chargerReach(.9996)});assert.equal(f.projectiles._fidelityChargerFlights.at(-1)?.full,false);x.hit(160);x.advance(p);assert.equal(x.calls.length,0);x.hit(79.98);assert.equal(x.calls.length,1);assert.equal(x.calls[0][2],79.98);}finally{x.dispose();}
});
test('world clear invalidates already minted contact capabilities',()=>{
 const x=setup();try{const p=x.prepare();x.advance(p);f.projectiles.clear();x.hit();assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('replacement victim life cannot consume an older collision capability',()=>{
 const x=setup();try{const p=x.prepare();x.advance(p);x.victim.netLife=1;x.hit(160,{l:1});assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('source native flight follows the actual moving receiver target',()=>{
 const x=setup({x:4});try{const p=x.prepare();x.victim.pos.x=0;x.hit();x.advance(p);assert.equal(x.calls.length,1);}finally{x.dispose();}
 const y=setup();try{const p=y.prepare();y.victim.pos.x=4;y.hit();y.advance(p);assert.equal(y.calls.length,0);}finally{y.dispose();}
});
test('owner departure revokes an already recorded collision',()=>{
 const x=setup();try{const p=x.prepare();x.advance(p);x.nm.onLeave('peer',false);x.hit();assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('actual native partial damage uses normalized chargeT and receiver accepts its quantized claim',()=>{
 const x=setup();try{
  const a=x.owner;a.remote=false;a.weaponRunner.chargeT=.5;
  a.character.getMuzzle=out=>out.set(0,1.05,0);a.aimPoint.set(0,1.05,100);a.aimDir.set(0,0,1);
  f.projectiles.fireCharger(a,a.weapon,.5);
  const job=f.projectiles._fidelityChargerFlights.at(-1);
  assert.equal(job.chargeT,.5);assert.ok(Math.abs(job.damage-56.92307692307692)<1e-8);
  const damage=round(job.damage,100);f.projectiles.clear();a.remote=true;
  const p=x.prepare(.5);x.hit(damage);x.advance(p);assert.equal(x.calls.length,1);assert.equal(x.calls[0][2],damage);
 }finally{x.dispose();}
});
function installBoss(x,{weak=true,stunned=true,crab=false,wall=false}={}){
 const shape={pos:new THREE.Vector3(0,1.05,8),r:1,active:true,weak};
 const c={id:3,x:0,y:.7,z:8,hp:1000,dead:false};
 const boss=Object.assign(Object.create(f.Boss.prototype),{sim:true,dead:false,invuln:false,visible:true,stunned,pos:new THREE.Vector3(0,1.05,8),hp:10000,model:{hitShapes:crab?[]:[shape]},crabs:new Map(crab?[[3,c]]:[])});
 const calls=[];boss.remoteHit=d=>calls.push({...d});x.nm.match.boss=boss;G.boss=boss;x.victim.pos.x=10;
 const hit=extra=>x.nm.onMessage('peer',{k:'bhit',m:x.nm.cfg.id,a:17,d:crab?160:weak?stunned?500:400:stunned?200:160,w:crab?'crab':'charger',c:crab?3:-1,l:0,q:1,weak:crab?0:weak?1:0,...extra});
 return {boss,calls,hit};
}
test('real Boss weak and stunned source sphere contact grants exactly its native multiplier',()=>{
 const x=setup();try{const b=installBoss(x);const p=x.prepare();b.hit();assert.equal(b.calls.length,0);x.advance(p);assert.equal(b.calls.length,1);assert.equal(b.calls[0].d,500);b.hit({q:2});assert.equal(b.calls.length,1);}finally{x.dispose();}
});
test('Boss transport failures do not consume an actual contact capability',()=>{
 const x=setup();try{const b=installBoss(x);const p=x.prepare();x.advance(p);b.hit({l:1});b.hit({c:-2});b.hit({weak:2});assert.equal(b.calls.length,0);b.hit();assert.equal(b.calls.length,1);}finally{x.dispose();}
});
test('real crablet collision remains damageable while shell is invisible and invulnerable',()=>{
 const x=setup();try{const b=installBoss(x,{crab:true});b.boss.invuln=true;b.boss.visible=false;const p=x.prepare();b.hit();x.advance(p);assert.equal(b.calls.length,1);assert.equal(b.calls[0].c,3);}finally{x.dispose();}
});
test('actual OBB cover blocks Boss source sphere contact too',()=>{
 const x=setup({wall:true});try{const b=installBoss(x);const p=x.prepare();b.hit();x.advance(p);assert.equal(b.calls.length,0);}finally{x.dispose();}
});
test('receiver private ink budget rejects a sixth full shot despite every owner row claiming a full tank',()=>{
 const x=setup();try{for(let i=0;i<5;i++)x.prepare(1,{},i*1.1,i+1);assert.equal(f.projectiles._fidelityChargerFlights.length,5);x.prepare(1,{},5.5,6);assert.equal(f.projectiles._fidelityChargerFlights.length,5);}finally{x.dispose();}
});
test('one receiver charge cycle cannot fund a second source shot with a new owner event ID',()=>{
 const x=setup();try{const p=x.prepare();const e=x.event(1,.05,2);x.packet(1.05,false,[e]);p.tr=1001.05;p.sim=63;x.nm._playEvents();assert.equal(f.projectiles._fidelityChargerFlights.length,1);}finally{x.dispose();}
});
test('a forged muzzle across thin nearby cover cannot bypass the native source muzzle line of sight',()=>{
 const x=setup({wall:true,wallZ:1});try{const p=x.prepare(1,{muzzle:[0,1.05,1.4]});x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('the presentation LOS final 5cm slack cannot authorize a muzzle behind a 2cm wall',()=>{
 const x=setup({wall:true,wallZ:1,wallHalf:.01});try{
  assert.equal(G.physics.los(new THREE.Vector3(0,1.05,0),new THREE.Vector3(0,1.05,1.035)),true,'counterfactual: presentation LOS omits this cover');
  const p=x.prepare(1,{muzzle:[0,1.05,1.035]});x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);
 }finally{x.dispose();}
});
test('actual unsupported airborne pose cannot obtain a full charge after one ground-rate second',()=>{
 const x=setup({air:true});try{const p=x.prepare();x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('advertising grounded cannot accelerate charge without actual receiver support',()=>{
 const x=setup({air:true});try{for(let t=0;t<1;t+=.05)x.packet(round(t),true,[],t,{grounded:true});const p=x.packet(1,false,[x.event()],0,{grounded:true});p.tr=1001;p.sim=60;x.nm._playEvents();x.hit();x.advance(p);assert.equal(x.calls.length,0);assert.equal(f.projectiles._fidelityChargerFlights.length,0);}finally{x.dispose();}
});
test('normal unsupported airborne charging remains legal after its source minimum-plus-one-third clock',()=>{
 const x=setup({air:true});try{for(let t=0;t<2.8-.0001;t+=.05)x.packet(round(t),true,[],Math.min(1,8/60+Math.max(0,t-8/60)/3));const p=x.packet(2.8,false,[x.event(1,1.8)]);p.tr=1002.8;p.sim=168;x.nm._playEvents();assert.equal(f.projectiles._fidelityChargerFlights.length,1);x.hit();x.advance(p);assert.equal(x.calls.length,1);}finally{x.dispose();}
});
function fullKeep(x){for(let t=0;t<=1.0001;t+=.05)x.packet(round(t),true,[],t);x.packet(1.05,false,[],0,{squid:true,held:true});}
function keepRelease(x,time,tick=Math.round(time*60)){const e=x.event(1,round(time-1));e[e.length-2]=tick;const p=x.packet(time,false,[e],0,{tick});p.tr=1000+time;p.sim=tick;x.nm._playEvents();return p;}
test('native shared keep readiness rejects an immediate resurfacing shot',()=>{
 const x=setup();try{fullKeep(x);const p=x.packet(1.1,false,[x.event(1,.1)],0,{held:true});p.tr=1001.1;p.sim=66;x.nm._playEvents();x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('native shared keep readiness admits a normal paid shot after the sourced 31F resurfacing wait',()=>{
 const x=setup();try{fullKeep(x);for(let t=1.1;t<1.65-.0001;t+=.05)x.packet(round(t),false,[],0,{held:true});const p=keepRelease(x,1.65);assert.equal(f.projectiles._fidelityChargerFlights.length,1);x.hit();x.advance(p);assert.equal(x.calls.length,1);}finally{x.dispose();}
});
test('native shared keep hidden lifetime expires instead of granting an unlimited underwater bank',()=>{
 const x=setup();try{fullKeep(x);for(let t=1.1;t<2.6;t+=.05)x.packet(round(t),false,[],0,{squid:true,held:true});for(let t=2.6;t<3.2;t+=.05)x.packet(round(t),false,[],0,{held:true});const p=keepRelease(x,3.2);x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('raw ZR release before keep readiness cancels its already paid charge',()=>{
 const x=setup();try{fullKeep(x);x.packet(1.1,false,[],0,{held:true});x.packet(1.15,false);for(let t=1.2;t<1.8;t+=.05)x.packet(round(t),false,[],0,{held:true});const p=keepRelease(x,1.8);x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('source landing contact excludes floating poses .1 through .34 metres above a real floor',()=>{
 for(const height of [.1,.2,.3,.34]){const x=setup({height});try{const p=x.prepare();x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0,`unsupported pose y=${height}`);assert.equal(x.calls.length,0);}finally{x.dispose();}}
});
test('withholding all hidden snapshots cannot erase the elapsed native keep lifetime at resurfacing',()=>{
 const x=setup();try{fullKeep(x);x.packet(4,false,[],0,{held:true});for(let t=4.05;t<4.6-.0001;t+=.05)x.packet(round(t),false,[],0,{held:true});const p=keepRelease(x,4.6);x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('a legitimate frozen simulation tick preserves hidden keep across wall-clock pause and resumes normally',()=>{
 const x=setup();try{fullKeep(x);x.packet(4,false,[],0,{held:true,squid:true,tick:63});assert.equal(x.owner.net.buf.at(-1).t,1004,'native clock accepts a zero-simulation pause');x.packet(4.05,false,[],0,{held:true,tick:66});for(let t=4.1;t<4.65-.0001;t+=.05)x.packet(round(t),false,[],0,{held:true,tick:66+Math.round((t-4.05)*60)});const p=keepRelease(x,4.65,102);assert.equal(f.projectiles._fidelityChargerFlights.length,1);x.hit();x.advance(p);assert.equal(x.calls.length,1);}finally{x.dispose();}
});
test('wall time without simulation ticks cannot finish an active charge',()=>{
 const x=setup();try{x.packet(0,true);x.packet(3,true,[],1,{tick:0});const e=x.event(1,2.05);e[e.length-2]=3;const p=x.packet(3.05,false,[e],0,{tick:3});p.tr=1003.05;p.sim=3;x.nm._playEvents();x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('raw R cancels a fresh paid charge and cannot become a main shot after R is released',()=>{
 const x=setup();try{for(let t=0;t<=1.0001;t+=.05)x.packet(round(t),true,[],t);x.packet(1.05,false,[],0,{sub:true});const e=x.event(1,.1);const p=x.packet(1.1,false,[e]);p.tr=1001.1;p.sim=66;x.nm._playEvents();x.hit();x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('holding R cannot open another receiver charge cycle by forging its charging pose',()=>{
 const x=setup();try{for(let t=0;t<=1.0001;t+=.05)x.packet(round(t),true,[],t);x.packet(1.05,false,[],0,{sub:true});for(let t=1.15;t<1.3-.0001;t+=.05)x.packet(round(t),true,[],.133,{sub:true,held:false});const e=x.event(.133,1.15);const p=x.packet(1.3,false,[e]);p.tr=1001.3;p.sim=78;x.nm._playEvents();x.hit(40);x.advance(p);assert.equal(f.projectiles._fidelityChargerFlights.length,0);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('repeated held-charge R cancels cannot hide progressive ink spend with ch=0 and ink=100',()=>{
 const x=setup();try{
  for(let cycle=0;cycle<5;cycle++){const start=cycle*1.2;for(let t=0;t<=1.0001;t+=.05)x.packet(round(start+t),true,[],0);x.packet(round(start+1.05),false,[],0,{sub:true});}
  x.prepare(1,{},6);assert.equal(f.projectiles._fidelityChargerFlights.length,0,'private source clock paid for the five cancelled full holds');
  const p=x.prepare(1,{},9,2);assert.equal(f.projectiles._fidelityChargerFlights.length,1,'positive: actual idle recovery funds a normal later full shot');x.hit();x.advance(p);assert.equal(x.calls.length,1);
 }finally{x.dispose();}
});
test('normal source low-ink recovery can fund another full held charge without requiring cancellation',()=>{
 const x=setup();try{
  for(let i=0;i<5;i++)x.prepare(1,{},i*1.1,i+1);
  const start=5.5;for(let t=0;t<5-.0001;t+=.05)x.packet(round(start+t),true,[],Math.min(1,t/3));
  const e=x.event(1,9.5,6),p=x.packet(10.5,false,[e]);p.tr=1010.5;p.sim=630;x.nm._playEvents();assert.equal(f.projectiles._fidelityChargerFlights.length,6,'native low-ink clause permits charging recovery');
 }finally{x.dispose();}
});
test('a legal shot released before a later R capture remains eligible for delayed FIFO playback',()=>{
 const x=setup();try{for(let t=0;t<1-.0001;t+=.05)x.packet(round(t),true,[],t);const e=x.event();const p=x.packet(1.05,false,[e],0,{sub:true});p.tr=1001.05;p.sim=63;x.nm._playEvents();assert.equal(f.projectiles._fidelityChargerFlights.length,1);x.hit();x.advance(p);assert.equal(x.calls.length,1);}finally{x.dispose();}
});
test('native inner sub ownership cancels a stored keep without a fresh-charge5F classification',()=>{
 const x=setup();try{fullKeep(x);x.packet(1.1,false,[],0,{held:true,sub:true});for(let t=1.15;t<1.7-.0001;t+=.05)x.packet(round(t),false,[],0,{held:true});const p=keepRelease(x,1.7);assert.equal(f.projectiles._fidelityChargerFlights.length,0);x.hit();x.advance(p);assert.equal(x.calls.length,0);}finally{x.dispose();}
});
test('a stored release already ready and emitted before later R remains eligible for delayed FIFO playback',()=>{
 const x=setup();try{
  fullKeep(x);for(let t=1.1;t<=1.65001;t+=.05)x.packet(round(t),false,[],0,{held:true});
  const e=x.event(1,.66),p=x.packet(1.7,false,[e],0,{held:true,sub:true});p.tr=1001.7;p.sim=102;x.nm._playEvents();assert.equal(f.projectiles._fidelityChargerFlights.length,1);x.hit();x.advance(p);assert.equal(x.calls.length,1);
 }finally{x.dispose();}
});
test('real Actor step smoothing preserves one-second source charge and canonical remote capsule height',()=>{
 const x=setup({realOwner:true});try{
  const b={id:G.level.blocks.length,solid:true,grate:false,center:new THREE.Vector3(0,.1,0),half:new THREE.Vector3(2,.1,2),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:[-1,-1,0,-1,-1,-1]};b.aabbMin=b.center.clone().sub(b.half);b.aabbMax=b.center.clone().add(b.half);G.level.blocks.push(b);
  const a=x.owner;a.grounded=true;a._resolve(false,0,true);assert.equal(a.grounded,true);assert.equal(a.pos.y,.2);assert.equal(a.smoothY,-.2);
  a.kidT=1;a.intent.fire=true;
  for(let frame=0;frame<63;frame++){a.remote=false;G.time=frame/60;a.weaponRunner.update(1/60,{fire:true});a.remote=true;if(frame%3===0)x.packet(frame/60,a.weaponRunner.charging,[],a.weaponRunner.charge,{held:true});}
  assert.equal(a.weaponRunner.charge,1,'installed native source runner reaches full after step');
  assert.equal(a.net.buf.at(-1).physicalY,.2);assert.equal(a.net.buf.at(-1).y,.2,'receiver path/capsule use physical foot');assert.equal(a.net.buf.at(-1).visualOffset,-.2,'display retains source step smoothing separately');
  const e=x.event(1,.1);const p=x.packet(1.1,false,[e]);p.tr=1001.1;p.sim=66;x.nm._playEvents();assert.equal(f.projectiles._fidelityChargerFlights.length,1);x.hit();x.advance(p);assert.equal(x.calls.length,1);
  a.net.cur={...a.net.buf.at(-1)};a.net.ready=true;a.net.err.set(0,.03,0);a.character.update=()=>{};x.nm.applyRemote(a,1/60);
  assert.equal(a.pos.y,.2,'remote physical body stays on the canonical source floor');assert.equal(a.smoothY,0,'cosmetic offset cannot move a source hitBase');assert.ok(Math.abs(a.character.root.position.y-.03)<1e-9,'only the display carries smoothing and net correction');
  const result={t:0,dist:0};f.Physics.segmentCapsuleDist(new THREE.Vector3(-1,.25,0),new THREE.Vector3(1,.25,0),a.pos,f.PLAYER.radius,f.PLAYER.height,result);assert.ok(result.dist<=f.PLAYER.radius,'actual native capsule contact uses the canonical body');
 }finally{x.dispose();}
});
