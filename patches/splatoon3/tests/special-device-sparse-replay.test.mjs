import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// Actual public Actor -> catalogue -> NetMatch JSON -> remote object consumer.
// Missing/rewritten delivery arrays are deliberate resilience probes, not a
// claim that the ordered live transport currently delivers this permutation.
const IDS=['waveBreaker','splattercolorScreen'];
const json=x=>JSON.parse(JSON.stringify(x));
const near=(a,b,tolerance=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=tolerance,`${a} != ${b}`);
const snapshot=o=>({kind:o.kind,phase:o.phase,duration:o.dur,radius:o.maxRadius,ap:o.specialPowerAP,
 hp:o.hp,width:o.width,height:o.height,waveFrame:o.maxWaveFrame,pos:Array.from(o.pos.toArray()),
 velocity:o.vel?Array.from(o.vel.toArray()):null,gravity:o.gravity,drag:o.airResist,speed:o.moveSpeed,
 normal:Array.from(o.normal.toArray()),direction:Array.from(o.direction.toArray()),age:o.age,landedAt:o.landedAt??null,dead:o.dead});
async function setup(id,ap=57){
 let clock=100;const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  vmPerformance:{now:()=>clock*1000},vmMathRandom:()=>.314159});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};f.G.level.groundHeight=()=>0;
 const owner=f.make(),proxy=f.make();
 for(const a of [owner,proxy]){
  Object.assign(a,{nid:77,owner:'A',netLife:3});a.weapon={...a.weapon,special:id,specialCost:100};
  a.special=100;a._resolve=()=>{};a.aimYaw=.3;a.aimDir.set(Math.sin(.3),0,Math.cos(.3));
 }
 owner.s3.loadout=f.emptyLoadout();if(ap===57)for(const slot of owner.s3.loadout){slot.main='specialPower';slot.subs.fill('specialPower');}owner.s3RefreshGear();owner.weapon={...owner.weapon,special:id,specialCost:100};
 proxy.aimYaw=-1.2;proxy.remote=true;
 const match={id:'sparse-device-replay',state:'playing',time:180,actors:[owner],playing:()=>true,canRespawn:()=>false};
 const sent=[],session=myId=>({myId,hostId:'A',isHost:myId==='A',_members:new Map([['A',{}],['B',{}]]),
  tr:{broadcast:p=>sent.push(json(p)),sendTo(){}}});
 const sender=new f.NetMatch(session('A'),{id:match.id,map:'reef'}),receiver=new f.NetMatch(session('B'),{id:match.id,map:'reef'});
 sender.bind(match);receiver.bind({...match,actors:[proxy]});receiver.byNid.set(77,proxy);
 const select=nm=>{f.G.netm=nm;f.G.match=nm.match;};
 const receive=p=>{select(receiver);receiver.onMessage('A',p);const peer=receiver.peers.get('A');if(peer){peer.tr=p.ts;receiver._playEvents();}};
 select(sender);sender._sendTick();receive(sent.at(-1));clock+=.1;f.G.time=.1;
 const deploy=()=>{select(sender);owner.special=100;owner._startSpecial();assert.ok(owner.specialActive,'real special input must activate');owner.intent.sub=true;owner._updateSpecial(1/60);
  owner.intent.sub=false;owner._updateSpecial(1/60);for(let i=0;i<16&&owner.specialActive;i++)owner._updateSpecial(1/60);
  const rows=json(sender.out.filter(e=>e[1]==='ac'&&['deploy','device','screen'].includes(e[5].action)));
  assert.equal(rows.length,2,'one canonical and one companion birth');return rows;};
 const rows=deploy(),objects=()=>f.G.projectiles._s3AllSpecialObjects||[],ghost=()=>objects().find(o=>o.owner===proxy);
 const play=(row,from='A')=>{select(receiver);receiver._play(from,json(row));};
 const tick=(frames,hz=60)=>{select(sender);for(let i=0;i<frames;i++){clock+=1/hz;f.G.time+=1/hz;f.G.projectiles.update(1/hz);}};
 return{f,id,owner,proxy,sender,receiver,rows,objects,ghost,play,tick,deploy,receive,sent,select,
  close(){receiver.dispose();sender.dispose();f.G.projectiles.clear();}};
}

for(const id of IDS)for(const ap of [0,57])test(`${id} AP${ap}: both birth envelopes independently preserve canonical object state`,async()=>{
 let canonical;
 for(const route of ['normal','reverse','companion-only']){
  const w=await setup(id,ap);try{
   const [birth,companion]=w.rows.map(e=>e[5]);
   for(const key of ['kind','hp','radius','duration','specialPowerAP','width','height','waveFrame','phase','age','landedAt','vx','vy','vz','gravity','airResist'])
    assert.equal(companion[key],birth[key],`${id} ${key}: companion must be self-contained`);
   assert.equal(companion.tick,birth.tick+1);assert.ok(JSON.stringify(companion).length<4096);
   let fxCalls=0;w.f.G.fx={burst(){fxCalls++;},ring(){fxCalls++;}};
   const rows=route==='normal'?w.rows:route==='reverse'?w.rows.slice().reverse():[w.rows[1]];for(const row of rows)w.play(row);
   const o=w.ghost();assert.ok(o);assert.equal(w.objects().filter(x=>x.owner===w.proxy).length,1);
   assert.equal(o.phase,'flight');assert.equal(o.specialPowerAP,ap);assert.ok(Number.isFinite(o.maxRadius));
   near(o.dur,id==='waveBreaker'?6.5:11.333);near(o.maxRadius,id==='waveBreaker'?(ap===57?27:20):15);
   if(id==='waveBreaker')near(o.maxWaveFrame,(ap===57?216:160)/60);
   const state=snapshot(o);if(!canonical)canonical=state;else assert.deepEqual(state,canonical);
   assert.ok(fxCalls>0,'first accepted birth reaches the effect emitter');const initialFx=fxCalls;
   for(let i=0;i<4;i++)for(const row of rows)w.play(row);
   assert.equal(fxCalls,initialFx,'duplicate delivery must not replay birth VFX');
   assert.deepEqual(snapshot(w.ghost()),state,'duplicate delivery must not restart or duplicate object');
  }finally{w.close();}
 }
});

for(const id of IDS)test(`${id}: real tick receiver orders rows and survives a deliberately missing deploy through expiry`,async()=>{
 for(const hz of [30,60,120]){let canonical;
 for(const route of ['normal','reversed-array','companion-only']){
  const w=await setup(id);try{
   w.select(w.sender);w.sender._sendTick();const packet=w.sent.at(-1);
   if(route==='reversed-array')packet.e.reverse();if(route==='companion-only')packet.e=packet.e.filter(e=>e[1]!=='ac'||e[5].action!=='deploy');
   w.receive(packet);const o=w.ghost();assert.ok(o);const frames=[snapshot(o)];
   let ghostPaint=0,ghostHit=0;const splat=w.f.G.paint.splat,hit=w.f.G.projectiles.applyHit;
   w.f.G.paint.splat=function(p,r,t,options){if(options?.claimOwner===w.proxy)ghostPaint++;return splat.call(this,p,r,t,options);};
   w.f.G.projectiles.applyHit=function(owner,...rest){if(owner===w.proxy)ghostHit++;return hit.call(this,owner,...rest);};
   const waveFronts=new Set();
   for(let i=0;i<12*hz;i++){w.tick(1,hz);for(const front of w.objects().filter(x=>x.owner===w.proxy&&x.kind==='waveFront')){waveFronts.add(front);assert.ok(Number.isFinite(front.last));near(front.maxRadius,27);near(front.dur,216/60);}
    if([.5,1,3,7,12].some(seconds=>i+1===seconds*hz))frames.push(snapshot(o));}
   if(id==='waveBreaker'){assert.equal(o.pulse,3);assert.equal(waveFronts.size,3);assert.ok([...waveFronts].every(x=>x.dead));}
   near(o.age-o.landedAt,o.dur,1/60+1e-8);
   assert.equal(o.dead,true);assert.equal(w.ghost(),undefined);assert.equal(o.mesh?.parent||null,null);
   assert.equal(ghostPaint,0);assert.equal(ghostHit,0);
   if(!canonical)canonical=frames;else assert.deepEqual(frames,canonical,'same world trajectory/lifetime from complete companion');
   w.receive(packet);assert.equal(w.ghost(),undefined,'duplicate packet after retirement cannot resurrect the ghost');
  }finally{w.close();}
 }}
});

for(const id of IDS)test(`${id}: owner/life rejection, activation isolation, and explicit world cleanup remain intact`,async()=>{
 const w=await setup(id);try{
  const old=json(w.rows);w.play(old[1],'foreign');assert.equal(w.ghost(),undefined);
  const wrongLife=json(old[1]);wrongLife[4]--;w.play(wrongLife);assert.equal(w.ghost(),undefined);
  w.play(old[1]);const first=w.ghost();assert.ok(first);w.play(old[0]);
  w.tick(720);assert.equal(first.dead,true);assert.equal(w.ghost(),undefined);
  const retired=w.sender.out.filter(e=>e[1]==='ac'&&['expire','destroy'].includes(e[5].action));assert.ok(retired.length);
  for(const row of retired)w.play(row);for(const row of old)w.play(row);assert.equal(w.ghost(),undefined);
  w.sender.out.length=0;w.owner.netLife=4;w.proxy.netLife=4;const newer=w.deploy();assert.notEqual(newer[0][5].activation,old[0][5].activation);
  w.play(newer[1]);w.play(newer[0]);const next=w.ghost();assert.ok(next);for(const row of retired)w.play(row);assert.equal(w.ghost(),next);
  w.f.G.projectiles.clear();assert.equal(next.dead,true);assert.equal(next.mesh?.parent||null,null);assert.equal(w.objects().length,0);
  for(const row of newer)w.play(row);assert.equal(w.ghost(),undefined,'seen birth pair stays retired after clear');
 }finally{w.close();}
});

for(const id of IDS)test(`${id}: delayed sibling cannot rewind phase and legacy sparse sender waits for full deploy`,async()=>{
 for(const frames of [2,30,90]){
  const w=await setup(id);try{
   w.select(w.sender);w.sender._sendTick();const whole=w.sent.at(-1),first=json(whole);
   first.e=first.e.filter(e=>e[1]!=='ac'||e[5].action!=='deploy');w.receive(first);w.tick(frames);
   const before=snapshot(w.ghost()),delayed=json(whole);delayed.ts+=frames/60;
   delayed.e=delayed.e.filter(e=>e[1]==='ac'&&e[5].action==='deploy');w.receive(delayed);
   assert.deepEqual(snapshot(w.ghost()),before,'late birth must preserve progressed state');
   assert.equal(w.objects().filter(o=>o.owner===w.proxy&&o.kind===before.kind).length,1);
  }finally{w.close();}
 }
 const w=await setup(id);try{
  const sparse=json(w.rows[1]),full=sparse[5];sparse[5]={id:full.id,activation:full.activation,action:full.action,pos:full.pos,seed:full.seed,object:full.object};
  if(full.target)sparse[5].target=full.target;
  w.play(sparse);assert.equal(w.ghost(),undefined,'old sparse companion waits without an invalid ghost');
  w.play(w.rows[0]);const o=w.ghost();assert.ok(o);assert.equal(o.phase,'flight');near(o.maxRadius,id==='waveBreaker'?27:15);
  assert.equal(o.specialPowerAP,57);near(o.dur,id==='waveBreaker'?6.5:11.333);
  const state=snapshot(o);w.play(sparse);assert.deepEqual(snapshot(w.ghost()),state);
 }finally{w.close();}
});

for(const id of IDS)test(`${id}: unseen late birth is retired by expiry, clear or terminal row; new life and land updates still work`,async()=>{
 for(const retire of ['expiry','clear','terminal-before-birth']){
  const w=await setup(id);try{
   if(retire!=='terminal-before-birth')w.play(w.rows[1]);
   if(retire==='clear')w.f.G.projectiles.clear();else w.tick(720);
   const terminal=w.sender.out.find(e=>e[1]==='ac'&&e[5].object===w.rows[0][5].object&&e[5].action==='expire');
   if(retire==='terminal-before-birth'){assert.ok(terminal);w.play(terminal);}
   w.play(w.rows[0]);assert.equal(w.ghost(),undefined,`${retire}: previously unseen sibling cannot resurrect a retired device`);
   // Same action/object/activation/seed with a new accepted actor life is not
   // the old device. The envelope's life guard remains the authority boundary.
   w.proxy.netLife=4;const renewed=json(w.rows[1]);renewed[4]=4;renewed[7]+=100;
   w.play(renewed);const o=w.ghost();assert.ok(o,'new life may create its own device');assert.equal(o.replayLife,4);
   const badLife=json(renewed);badLife[4]=3;badLife[7]++;w.play(badLife);assert.equal(w.ghost(),o);
   const land=json(renewed);land[7]+=1;Object.assign(land[5],{action:'land',tick:10,age:2,landedAt:2,phase:'active',pos:[3,.08,4]});
   w.play(land);assert.equal(o.phase,'active');assert.equal(o.age,2);assert.equal(o.landedAt,2);assert.equal(o.vel,null);assert.deepEqual(Array.from(o.pos.toArray()),[3,.08,4]);
   const active=json(land);active[7]++;Object.assign(active[5],{action:'active',tick:11,age:2.25});w.play(active);assert.equal(o.age,2.25);
   const state=snapshot(o);w.play(land);assert.deepEqual(snapshot(o),state,'duplicate land cannot rewind authoritative active state');
  }finally{w.close();}
 }
});
