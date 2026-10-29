import test from 'node:test';
import assert from 'node:assert/strict';
import {MessageChannel} from 'node:worker_threads';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

// Actual production-adapted Actor/Physics/WeaponRunner/Projectiles. The only
// display seam is a fixed source muzzle and no-op Character animation. Paint
// storage is dry/zero-credit; no claim about rendered/bank muzzle or Turf ink
// rollback is made. Native actor integration and final damage stay installed.
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`
 export * from './patches/network-replication/trusted-native-replay.mjs';
 export * from './patches/network-replication/trusted-native-replay-worker.mjs';
 export * from './patches/network-replication/native-command-wire.mjs';
 export {Boss} from './inkwave-public/src/boss/boss.js';
 export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
`});
const host=x=>JSON.parse(JSON.stringify(x));
const V=(x=0,y=0,z=0)=>new f.THREE.Vector3(x,y,z);
class Display {
  constructor(){this.root=new f.THREE.Group();this.color=new f.THREE.Color(0xffffff);}
  _owner(){return this.actor;}_runner(){return this.actor?.weaponRunner;}
  trigger(){}setVisible(){}setHurt(){}setWeapon(){}update(){}dispose(){Display.disposals=(Display.disposals||0)+1;}
  getMuzzle(out){return out.copy(this.root.position).add(V(0,1.05,.3));}
}
const spawn=(nid,team,z,weapon='shooter',x=0)=>({nid,owner:team?'B':'A',life:1,team,slot:0,weapon,position:[x,0,z],yaw:team?Math.PI:0});
function setup({wall=false,roster=[spawn(1,0,0),spawn(2,1,7)],boss=null,afterActors=null,initializeActor=null,warmup=180,dispose=null,worldCamera='default'}={}){
  const raw={bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]};
  if(wall)raw.single.push({kind:'box',min:[-4,0,3],max:[4,6,4]});
  const level=new f.Level(raw),physics=new f.Physics(level),paint={sample:()=>0,splat:()=>0};
  const world={level,physics,paint,match:{playing:()=>true,canRespawn:()=>false},afterActors,createBoss:boss,initializeActor,dispose};
  if(worldCamera!=='default')world.camera=worldCamera;
  const token=f.createTrustedNativeReplay(f,{isolatedRealm:true,epoch:'match',seed:83921,time:0,world,roster,CharacterClass:Display});
  const authorization={epoch:'match',owners:new Map(roster.map(r=>[r.nid,r.owner]))};
  const state=()=>host(f.inspectTrustedNativeReplay(token));
  const step=(inputs={},dt=1/60)=>host(f.advanceTrustedNativeReplay(token,{tick:state().tick+1,dt,commands:roster.map(r=>({nid:r.nid,owner:r.owner,life:r.life,input:{fire:false,squid:false,sub:false,jump:false,special:false,move:[0,0],...inputs[r.nid]},aim:[r.yaw,0],aimPoint:[r.position[0],1,40]}))},authorization));
  // Expire native spawn invulnerability through real updates, not assignments.
  try { for(let i=0;i<warmup;i++)assert.deepEqual(step(),{ok:true,tick:i+1,contacts:0}); } catch(e) { f.disposeTrustedNativeReplay(token); throw e; }
  return {token,state,step,authorization,close:()=>f.disposeTrustedNativeReplay(token)};
}
function claim(e){return Object.fromEntries(['epoch','tick','serial','kind','attacker','attackerLife','victim','victimLife','source','damage'].map(k=>[k,e[k]]));}
function shoot(w,frames=40){for(let i=0;i<frames;i++)assert.equal(w.step({1:{fire:i===0}}).ok,true,w.state().error);}

test('fresh owner-authored fire+hit cannot create a native contact or change resources',()=>{
  const w=setup();try{
    const before=w.state(),forged={epoch:'match',tick:181,kind:'pvp',attacker:1,attackerLife:1,victim:2,victimLife:1,source:'shooter',damage:36};
    assert.equal(f.peekTrustedNativeContact(w.token,forged),null);
    assert.equal(f.commitTrustedNativeContact(w.token,{...forged}),null);
    assert.deepEqual(w.state(),before);
    // Even an input request with forged result fields is rejected atomically.
    const bad={tick:181,dt:1/60,commands:[{nid:1,owner:'A',life:1,input:{fire:true,squid:false,sub:false,jump:false,special:false,move:[0,0]},aim:[0,0],ink:100},{nid:2,owner:'B',life:1,input:{fire:false,squid:false,sub:false,jump:false,special:false,move:[0,0]},aim:[Math.PI,0]}]};
    assert.deepEqual(host(f.advanceTrustedNativeReplay(w.token,bad,w.authorization)),{ok:false,reason:'invalid-native-command'});
    assert.deepEqual(w.state(),before);
  }finally{w.close();}
});
for(const hz of [30,60,120])test(`actual ${hz}Hz input executes native debit/flight/contact and one-use branded receipt`,()=>{
  const w=setup();try{
    let minInk=100;for(let i=0;i<hz;i++){assert.equal(w.step({1:{fire:i===0}},1/hz).ok,true,w.state().error);minInk=Math.min(minInk,w.state().actors[0].ink);}
    const state=w.state();assert.ok(state.launches.length>0);assert.ok(state.effects.length>0);
    assert.ok(minInk<100);assert.ok(state.actors[1].hp<100);
    const effect=state.effects[0],c=claim(effect),receipt=f.peekTrustedNativeContact(w.token,c);assert.ok(receipt);
    assert.equal(f.commitTrustedNativeContact(w.token,{...receipt}),null,'copied capability cannot commit');
    assert.equal(f.peekTrustedNativeContact(w.token,{...c,victim:99}),null);
    assert.equal(f.peekTrustedNativeContact(w.token,{...c,damage:160}),null);
    assert.deepEqual(host(f.commitTrustedNativeContact(w.token,receipt)),effect);
    assert.equal(f.commitTrustedNativeContact(w.token,receipt),null);assert.equal(f.peekTrustedNativeContact(w.token,c),null);
  }finally{w.close();}
});
for(const condition of ['wall','miss','wrong-team'])test(`native ${condition} rejects contact despite legitimate paid fire`,()=>{
  const roster=[spawn(1,0,0),spawn(2,condition==='wrong-team'?0:1,7,'shooter',condition==='miss'?15:0)];
  const w=setup({roster,wall:condition==='wall'});try{shoot(w);const s=w.state();assert.ok(s.launches.length);assert.equal(s.effects.length,0);assert.equal(s.actors[1].hp,100);}finally{w.close();}
});
test('multi-target native Blaster blast retains separate legitimate contacts and final rounding',()=>{
  const w=setup({roster:[spawn(1,0,0,'blaster'),spawn(2,1,8,'shooter',2),spawn(3,1,8,'shooter',-2)]});
  try{
    shoot(w,50);const s=w.state(),effects=s.effects.filter(e=>e.source==='blaster');
    assert.equal(effects.length,2);assert.deepEqual(effects.map(e=>e.victim).sort(),[2,3]);
    for(const e of effects){assert.ok(e.damage>50&&e.damage<60);assert.equal(e.hpAfter,46.3);assert.ok(f.commitTrustedNativeContact(w.token,f.peekTrustedNativeContact(w.token,claim(e))));}
  }finally{w.close();}
});
test('source resource/cooldown owners reject held-fire inflation without debit overrides',()=>{
  const w=setup();try{
    for(let i=0;i<60;i++)assert.equal(w.step({1:{fire:true}}).ok,true,w.state().error);
    const s=w.state();assert.ok(s.launches.length<60,'one requested fire per frame is not one allowed shot');assert.ok(s.actors[0].ink<100);
    assert.equal(f.peekTrustedNativeContact(w.token,{epoch:'match',tick:181,kind:'pvp',attacker:1,attackerLife:1,victim:2,victimLife:1,source:'shooter',damage:999}),null);
  }finally{w.close();}
});
test('malformed/missing/foreign/life/tick inputs cannot partly apply or advance authority',()=>{
  const w=setup();try{
    const input={fire:true,squid:false,sub:false,jump:false,special:false,move:[0,0]},good=[{nid:1,owner:'A',life:1,input,aim:[0,0]},{nid:2,owner:'B',life:1,input:{...input,fire:false},aim:[Math.PI,0]}];
    for(const commands of [good.slice(0,1),[good[0],good[0]],[good[0],{...good[1],owner:'A'}],[good[0],{...good[1],life:2}],[good[0],{...good[1],aim:[NaN,0]}]]){
      const before=w.state();assert.equal(f.advanceTrustedNativeReplay(w.token,{tick:181,dt:1/60,commands},w.authorization).ok,false);assert.deepEqual(w.state(),before);
    }
    assert.equal(f.advanceTrustedNativeReplay(w.token,{tick:182,dt:1/60,commands:good},w.authorization).ok,false);
    assert.equal(w.step({1:{fire:true}}).ok,true);
  }finally{w.close();}
});
test('a runtime fault retires all outstanding contacts and restores realm context/RNG',()=>{
  let fail=false;const w=setup({afterActors(){if(fail)throw Error('trusted phase failed');}});
  try{shoot(w);const e=w.state().effects[0],r=f.peekTrustedNativeContact(w.token,claim(e)),saved={...f.G},random=f.VM_MATH.random;assert.ok(r);fail=true;
    assert.deepEqual(w.step(),{ok:false,reason:'trusted phase failed'});assert.equal(f.commitTrustedNativeContact(w.token,r),null);
    for(const [k,v] of Object.entries(saved))assert.equal(f.G[k],v,k);assert.equal(f.VM_MATH.random,random);assert.equal(w.step().ok,false);
  }finally{w.close();}
});
test('disposing and replacing a realm cannot spend a previous session contact',()=>{
  const w=setup();shoot(w);const e=w.state().effects[0],r=f.peekTrustedNativeContact(w.token,claim(e));w.close();
  const newer=setup();try{assert.equal(f.commitTrustedNativeContact(w.token,r),null);assert.equal(f.commitTrustedNativeContact(newer.token,r),null);}finally{newer.close();}
});
test('roster cannot bootstrap owner-provided ink/charge/HP',()=>{
  assert.throws(()=>setup({roster:[{...spawn(1,0,0),ink:1000}]}),/Owner result/);
});
for(const target of ['boss','crablet'])test(`native flight reaches actual ${target} collision and HP owner only once`,()=>{
  const w=setup({roster:[spawn(1,0,0)],boss(G){
    // Real Boss.segHit/hit/applyDamage/_hitCrab, fixed native combat state.
    // Boss AI, animation and world hazards are outside this flat-world test.
    const b=Object.assign(Object.create(f.Boss.prototype),{match:{state:'playing'},sim:true,dead:false,visible:true,invuln:false,stunned:false,pos:V(0,0,7),hp:1000,maxHp:1000,flashN:0,weakN:0,
      crabs:new Map(target==='crablet'?[[3,{id:3,x:0,y:.5,z:7,hp:100,dead:false}]]:[]),unsubs:[],hz:{dispose(){}},
      model:{flash(){},dispose(){},hitShapes:target==='boss'?[{active:true,weak:false,pos:V(0,1,7),r:1}]:[]}});
    return b;
  }});
  try{shoot(w);const s=w.state();assert.equal(s.effects.length,1);const e=s.effects[0];assert.equal(e.kind,target);assert.ok(e.hpAfter<e.hpBefore);
    const receipt=f.peekTrustedNativeContact(w.token,claim(e));assert.ok(receipt);assert.ok(f.commitTrustedNativeContact(w.token,receipt));assert.equal(f.commitTrustedNativeContact(w.token,receipt),null);
  }finally{w.close();}
});
test('owner body/RNG metadata cannot be used to fund or reseed a trusted spawn',()=>{
  for(const result of ['ink','hp','charge','grounded','special','velocity','seed'])assert.throws(()=>setup({roster:[{...spawn(1,0,0),[result]:999}]}),/Owner result/);
  assert.throws(()=>setup({roster:[{...spawn(1,0,0),life:2}]}),/actual native spawn history/);
});
test('raw owner assertion without independently supplied authenticated principal rejects',()=>{
  const w=setup();try{
    const commands=[1,2].map(nid=>({nid,owner:nid===1?'A':'B',life:1,input:{fire:false,squid:false,sub:false,jump:false,special:false,move:[0,0]},aim:[0,0]})),frame={tick:181,dt:1/60,commands};
    assert.equal(f.advanceTrustedNativeReplay(w.token,frame,{epoch:'match'}).reason,'authenticated-command-owners-required');
    assert.equal(f.advanceTrustedNativeReplay(w.token,frame,{epoch:'old-match',owners:w.authorization.owners}).reason,'authenticated-command-epoch-required');
    assert.equal(f.advanceTrustedNativeReplay(w.token,frame,{epoch:'match',owners:new Map([[1,'A'],[2,'A']])}).ok,false);
    assert.equal(w.state().tick,180);
  }finally{w.close();}
});
test('native empty-ink fire request is legal input but cannot mint owner-reported HP damage',()=>{
  const w=setup({initializeActor(a,r){a.spawnAt(V(...r.position),r.yaw);a.ink=0;}});
  try{
    // Native waiting recovers ink; deplete it with native paid fire until the
    // actual runner cannot fund the requested cadence. Never copy wire ink.
    for(let i=0;i<900;i++)assert.equal(w.step({1:{fire:true}}).ok,true,w.state().error);
    const state=w.state();assert.ok(state.actors[0].ink<2);assert.ok(state.launches.length<150);
    assert.equal(f.peekTrustedNativeContact(w.token,{epoch:'match',tick:state.tick,kind:'pvp',attacker:1,attackerLife:1,victim:2,victimLife:1,source:'shooter',damage:999}),null);
  }finally{w.close();}
});
test('all 65 catalog/native mains retain native hold/release emission under canonical requests',async t=>{
  assert.equal(f.MAIN_WEAPON_CATALOG.records.length,65);
  for(const record of f.MAIN_WEAPON_CATALOG.records)await t.test(record.id,()=>{
    const w=setup({roster:[spawn(1,0,0,record.id)]});
    try{for(let i=0;i<210;i++)assert.equal(w.step({1:{fire:i<130}}).ok,true,w.state().error);assert.ok(w.state().launches.length>0,'native emission event required; no p/list/birth-count assumption');}
    finally{w.close();}
  });
});
test('worker port returns committed native effects and refuses forged/cross-owner/cross-epoch/repeated claims',async()=>{
 const w=setup(),{port1,port2}=new MessageChannel();let principal='A',epoch='match',serial=0;
 const endpoint=f.attachTrustedNativeReplayWorker(port1,w.token,{authorize:()=>({epoch,from:principal,owners:w.authorization.owners})});
 const call=payload=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker receipt timeout')),2000);port2.once('message',r=>{clearTimeout(timer);resolve(r);});port2.postMessage({id:++serial,...payload});});
 try{
  const forged={epoch:'match',tick:181,kind:'pvp',attacker:1,attackerLife:1,victim:2,victimLife:1,source:'shooter',damage:36};
  assert.equal((await call({operation:'claim',claim:forged})).reason,'no-native-contact');
  const frame={tick:181,dt:1/60,commands:w.state().actors.map(a=>({nid:a.nid,owner:a.owner,life:a.life,input:{fire:a.nid===1,squid:false,sub:false,jump:false,special:false,move:[0,0]},aim:[a.nid===1?0:Math.PI,0]}))};
  assert.equal((await call({operation:'advance',frame})).ok,true);
  shoot(w);const effect=w.state().effects[0],c=claim(effect);principal='B';assert.equal((await call({operation:'claim',claim:c})).reason,'worker-claim-owner');
  principal='A';epoch='old-match';assert.equal((await call({operation:'claim',claim:c})).reason,'worker-epoch-mismatch');
  epoch='match';assert.deepEqual((await call({operation:'claim',claim:c})).effect,effect);assert.equal((await call({operation:'claim',claim:c})).reason,'no-native-contact');
  assert.equal((await call({operation:'inspect'})).ok,false);assert.equal((await call({operation:'init',frame:{ink:1000}})).ok,false);
 }finally{endpoint.close();port1.close();port2.close();w.close();}
});
test('interpreting a full-charge fire commit as an immediate raw press changes native timing',()=>{
 let original;
 const source=setup({roster:[spawn(1,0,0,'charger')]});
 try{for(let i=0;i<110;i++)assert.equal(source.step({1:{fire:i<80}}).ok,true);original=source.state().launches[0];assert.equal(original.charge,1);}finally{source.close();}
 const commitOnly=setup({roster:[spawn(1,0,0,'charger')]});
 try{
  while(commitOnly.state().tick<original.tick-1)assert.equal(commitOnly.step().ok,true);
  assert.equal(commitOnly.step({1:{fire:true}}).ok,true);
  assert.equal(commitOnly.state().launches.length,0,'native press cannot retroactively acquire 80 charge frames');
  // This disproves only the instantaneous mapping. A different server design
  // may own an explicit hold schedule/world history; no universal impossibility.
 }finally{commitOnly.close();}
});
test('version2 encoded full commands drive native resources/flight/contact without result witnesses',()=>{
 const roster=[spawn(1,0,0),{...spawn(2,1,7),owner:'A'}],w=setup({roster,warmup:0});
 const p=f.createNativeCommandRoomPolicy({epoch:'match',build:'03523329',seed:83921,roster:roster.map(({nid,owner,life})=>({nid,owner,life}))});
 const peer=f.admitNativeCommandPeer(p,{from:'A',capability:f.nativeCommandCapability(p),at:10}).peer;
 try{
  for(let i=0;i<240;i++){
   const commands=roster.map(r=>({nid:r.nid,owner:r.owner,life:1,input:{fire:r.nid===1&&i>=180&&i<200,squid:false,sub:false,jump:false,special:false,booyah:false,move:[0,0]},aim:[r.yaw,0],aimPoint:[0,1,40]}));
   const packet=f.attachNativeCommandEnvelope({k:'t',a:[],e:[]},p,{from:'A',sequence:i+1,frames:[{tick:i+1,dt:1/60,sourceTime:(i+1)/60,commands}]});
   const prepared=f.prepareNativeCommandEnvelope(peer,packet,{from:'A',at:10+(i+1)/60+1e-8});assert.equal(prepared.ok,true,prepared.reason);
   const frame=prepared.frames[0];assert.equal(f.advanceTrustedNativeReplay(w.token,{tick:frame.tick,dt:frame.dt,commands:frame.commands},w.authorization).ok,true,w.state().error);
   assert.equal(f.commitNativeCommandEnvelope(peer,prepared.token),true);
  }
  assert.ok(w.state().effects.length>0);assert.ok(w.state().actors[1].hp<100);
 }finally{f.retireNativeCommandPeer(peer);w.close();}
});
test('native cancelHold does not turn focus cancellation into an ordinary release shot',()=>{
 const w=setup({roster:[spawn(1,0,0,'charger')]});
 try{
  for(let i=0;i<80;i++)assert.equal(w.step({1:{fire:true}}).ok,true);
  const frame={tick:w.state().tick+1,dt:1/60,commands:[{nid:1,owner:'A',life:1,input:{fire:false,squid:false,sub:false,jump:false,special:false,move:[0,0]},aim:[0,0],cancel:{fire:true,sub:false}}]};
  assert.equal(f.advanceTrustedNativeReplay(w.token,frame,w.authorization).ok,true,w.state().error);
  for(let i=0;i<20;i++)assert.equal(w.step().ok,true);assert.equal(w.state().launches.length,0);
 }finally{w.close();}
});
test('worker/session cleanup releases every owned resource and lease despite a disposer fault',()=>{
 const released=[],before=Display.disposals||0;
 const w=setup({warmup:0,boss:()=>({hp:100,crabs:new Map(),hit(){},applyDamage(){},_hitCrab(){},dispose(){released.push('boss');throw Error('dispose fault');}}),dispose(){released.push('world');}});
 assert.throws(w.close,/cleanup failed/);assert.equal(Display.disposals-before,2);assert.deepEqual(released,['boss','world']);w.close();
 const replacement=setup({warmup:0});replacement.close();
});
test('native Crab Tank armor absorption is a one-use effect even with zero player HP delta',()=>{
 const weapon=Object.values(f.WEAPONS).find(w=>w.special==='crabTank').id;
 const w=setup({roster:[spawn(1,0,0),spawn(2,1,7,weapon)],initializeActor(a,r){a.spawnAt(V(...r.position),r.yaw);if(r.nid===2)a.addTurf(a.specialCost());}});
 try{
  assert.equal(w.step({2:{special:true}}).ok,true);
  for(let i=0;i<40;i++)assert.equal(w.step().ok,true);
  shoot(w);const effect=w.state().effects.find(e=>e.kind==='pvp'&&e.victim===2&&e.armor.some(a=>a.kind==='crabTank'));
  assert.ok(effect,'actual native special activation and armor absorption required');assert.equal(effect.outcome,'armor');assert.equal(effect.hpDelta,0);assert.equal(effect.hpAfter,100);assert.ok(effect.armor[0].absorbed>0);
  const r=f.peekTrustedNativeContact(w.token,claim(effect));assert.ok(r);assert.equal(f.commitTrustedNativeContact(w.token,r).hpDelta,0);assert.equal(f.commitTrustedNativeContact(w.token,r),null);
  for(let i=0;i<400;i++)assert.equal(w.step({1:{fire:true}}).ok,true,w.state().error);
  assert.ok(w.state().effects.some(e=>e.armor.some(a=>a.kind==='crabTank'&&a.broken)),'actual native armor break must remain an effect');
 }finally{w.close();}
});
test('native full-charge piercing preserves both victims and records requested damage separately from overkill',()=>{
 const w=setup({roster:[spawn(1,0,0,'charger'),spawn(2,1,4),spawn(3,1,7)]});
 try{
  for(let i=0;i<110;i++)assert.equal(w.step({1:{fire:i<80}}).ok,true,w.state().error);
  const effects=w.state().effects.filter(e=>e.source==='charger');assert.equal(effects.length,2);
  for(const e of effects){assert.equal(e.requestedDamage,160);assert.equal(e.damage,160);assert.equal(e.rawHpDelta,160);assert.equal(e.hpDelta,100);assert.equal(e.hpAfterClamped,0);assert.equal(e.lethal,true);assert.ok(f.commitTrustedNativeContact(w.token,f.peekTrustedNativeContact(w.token,claim(e))));}
 }finally{w.close();}
});
test('native invulnerability rejects HP/armor effects without blocking the next genuinely admitted shot',()=>{
 const w=setup({warmup:0});
 try{
  shoot(w);assert.equal(w.state().effects.length,0);assert.ok(w.state().launches.length>0);
  while(w.state().tick<180)assert.equal(w.step().ok,true);
  for(let i=0;i<40;i++)assert.equal(w.step({1:{fire:i<20}}).ok,true);assert.ok(w.state().effects.length>0,JSON.stringify(w.state()));assert.ok(w.state().effects.every(e=>e.hpDelta>0));
 }finally{w.close();}
});
test('native fractional rounding credit remains an effect before the first HP tenth',()=>{
 let amount=0,repeats=1;
 const w=setup({afterActors(actors,_dt,api){if(amount)for(let i=0;i<repeats;i++)api.G.projectiles.applyHit(actors[0],actors[1],amount,'shooter',77);}});
 try{
  amount=.04;repeats=2;assert.equal(w.step().ok,true);let e=w.state().effects[0];assert.equal(e.hpDelta,0);assert.equal(e.roundingCredit,.04);assert.equal(e.outcome,'rounding-credit');
  const selected=claim(e);assert.ok(f.commitTrustedNativeContact(w.token,f.peekTrustedNativeContact(w.token,selected)));
  assert.equal(f.peekTrustedNativeContact(w.token,selected),null,'replaying a claim must not consume a different identical native effect');assert.equal(w.state().contacts,1);
  amount=.07;repeats=1;assert.equal(w.step().ok,true);e=w.state().effects.at(-1);assert.ok(e.hpDelta>.099&&e.hpDelta<.101);assert.equal(w.state().actors[1].hp,99.9);
  // A trusted native applyHit unit exercises the rounding owner here. It is
  // separate from the preceding actual projectile/capsule/armor tests.
 }finally{w.close();}
});
test('trusted roster name/controller and native camera context are preserved without accepting owner result state',()=>{
 let observed=false;
 const w=setup({warmup:0,roster:[{...spawn(1,0,0),name:'Canonical Owner',isLocal:true,isBot:false}],worldCamera:null,afterActors(actors,_dt,api){assert.equal(api.G.camera,null);assert.equal(api.G.local,actors[0]);observed=true;}});
 try{assert.equal(w.step().ok,true);const a=w.state().actors[0];assert.equal(a.name,'Canonical Owner');assert.equal(a.isLocal,true);assert.equal(a.isBot,false);assert.equal(observed,true);}finally{w.close();}
});
