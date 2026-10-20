import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// #1606: Wave Breaker / Splattercolor Screen send a complete `deploy` packet and a companion
// `device` / `screen` packet for the same object. Either may be the first one a peer admits.
// Whichever is first must build a correctly configured ghost (source: Ver.11.3.0 WaveParam /
// WallParam, 160/192/216F wave lifetime and 20/24/27 radius by AP; Screen 680F). Logic-only,
// socket-free replay; no live two-client match was run.
const EXTRA="export {replaySpecial} from './patches/splatoon3/runtime/all-specials.mjs';";
async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const events=[];f.on('all:special',e=>events.push(e));
 const objects=()=>f.G.projectiles._s3AllSpecialObjects||[];
 const tick=(n=1,dt=1/60)=>{for(let i=0;i<n;i++){f.G.time+=dt;f.G.projectiles.update(dt);}};
 // The owner throws the device; returns the owner's object and the two birth packets it emitted.
 function deploy(id,ap){
  const a=f.make();a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a.s3={...(a.s3||{}),abilityPoints:{specialPower:ap}};
  a.pos.set(0,100,0);a.aimPitch=0;a.aimYaw=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,101,30);a._resolve=()=>{};a.invuln=0;a._startSpecial();
  a.intent.sub=true;for(let i=0;i<2&&a.specialActive;i++)a._updateSpecial(1/60);a.intent.sub=false;
  for(let i=0;i<60&&a.specialActive;i++)a._updateSpecial(1/60);
  const object=objects().find(o=>o.owner===a);assert.ok(object,'owner deployed '+id);
  const mine=events.filter(e=>e.actor===a&&e.id===id);
  const birth=mine.find(e=>e.action==='deploy'),companion=mine.find(e=>e.action===(id==='waveBreaker'?'device':'screen'));
  assert.ok(birth&&companion,'both birth packets were emitted');
  // Packets cross the wire as JSON.
  const wire=e=>{const {actor,...rest}=e;return JSON.parse(JSON.stringify(rest));};
  return {a,object,birth:wire(birth),companion:wire(companion)};
 }
 const ghost=()=>{const g=f.make();g.remote=true;g.team=1;return g;};
 const replay=(g,packet)=>f.replaySpecial(f,{...packet,actor:g});
 const ghostObjects=g=>objects().filter(o=>o.owner===g);
 return {f,deploy,ghost,replay,ghostObjects,objects,tick,events};
}
const finiteNumber=(v,label)=>assert.ok(typeof v==='number'&&Number.isFinite(v),`${label} must be a finite number, got ${v}`);
// Every field that shapes lifetime, reach and damage must equal the owner's (packets quantize to 1 ms).
function assertSameDevice(copy,owner,label){
 for(const key of ['dur','maxRadius','maxWaveFrame','hp','maxHp','specialPowerAP','width','height'])
  if(owner[key]!==undefined){finiteNumber(copy[key],label+' '+key);assert.ok(Math.abs(copy[key]-owner[key])<2e-3,`${label}: ${key} ${copy[key]} != owner ${owner[key]}`);}
 assert.equal(copy.kind,owner.kind);assert.equal(copy.activation,owner.activation);assert.equal(copy.serial,owner.serial);
}
const CASES=[['waveBreaker',0,20,160/60],['waveBreaker',57,27,216/60],['splattercolorScreen',0,15,null],['splattercolorScreen',57,15,null]];

for(const [id,ap,radius,waveSeconds] of CASES){
 const label=`${id} AP${ap}`;
 test(`${label}: the companion packet is a complete, canonical birth (same lifecycle data as deploy)`,async()=>{
  const w=await world(),{object,birth,companion}=w.deploy(id,ap);
  for(const packet of [birth,companion]){
   assert.equal(packet.kind,id==='waveBreaker'?'wave':'screen');
   finiteNumber(packet.duration,'duration');finiteNumber(packet.radius,'radius');finiteNumber(packet.specialPowerAP,'AP');
   assert.equal(packet.specialPowerAP,ap);assert.equal(packet.object,object.serial);assert.equal(packet.radius,radius);
   assert.ok(Math.abs(packet.duration-(id==='waveBreaker'?390:680)/60)<2e-3,'source lifetime: '+packet.duration);
   if(waveSeconds)assert.ok(Math.abs(packet.waveFrame-waveSeconds)<1e-6);
  }
 });

 for(const [order,pick] of [['normal order',p=>[p.birth,p.companion]],['reverse order',p=>[p.companion,p.birth]],
   ['duplicated and interleaved',p=>[p.companion,p.birth,p.companion,p.birth,p.companion]],
   ['companion only (deploy lost)',p=>[p.companion]],['deploy only (companion lost)',p=>[p.birth]]]){
  test(`${label}: ${order} yields exactly one fully configured ghost`,async()=>{
   const w=await world(),sent=w.deploy(id,ap),g=w.ghost();
   const results=pick(sent).map(packet=>w.replay(g,packet));
   assert.equal(results[0],true,'the first admitted packet builds the device');
   const copies=w.ghostObjects(g);assert.equal(copies.length,1,'exactly one ghost per identity');
   assertSameDevice(copies[0],sent.object,label+' '+order);
   if(waveSeconds)assert.ok(Math.abs(copies[0].maxWaveFrame-waveSeconds)<1e-6,'per-wave lifetime from the source frames');
   assert.equal(copies[0].damage,0,'a ghost never carries damage authority');
   for(const key of ['pos','normal','tangent'])for(const c of ['x','y','z'])finiteNumber(copies[0][key][c],`${key}.${c}`);
  });
 }

 test(`${label}: a late birth packet cannot rewind a ghost that has already advanced`,async()=>{
  const w=await world(),sent=w.deploy(id,ap),g=w.ghost();
  assert.equal(w.replay(g,sent.birth),true);
  const copy=w.ghostObjects(g)[0];w.tick(30);const age=copy.age;assert.ok(age>0.4);
  w.replay(g,sent.companion);
  assert.equal(copy.age,age,'the delayed sibling is not an update');
  assert.equal(w.ghostObjects(g).length,1);
 });

 test(`${label}: a legacy sparse companion never builds a device; the complete deploy that follows does`,async()=>{
  const w=await world(),sent=w.deploy(id,ap),g=w.ghost();
  const sparse={id:sent.companion.id,activation:sent.companion.activation,action:sent.companion.action,pos:sent.companion.pos,seed:sent.companion.seed,object:sent.companion.object};
  if(sent.companion.target)sparse.target=sent.companion.target;
  assert.equal(w.replay(g,sparse),false,'no radius/duration/AP: wait for the complete packet');
  assert.equal(w.ghostObjects(g).length,0,'no invalid one-second / NaN-radius ghost is left behind');
  assert.equal(w.replay(g,sent.birth),true);
  assertSameDevice(w.ghostObjects(g)[0],sent.object,label+' after sparse');
  assert.equal(w.ghostObjects(g).length,1);
 });

 test(`${label}: a retired device is not resurrected by a delayed birth packet`,async()=>{
  const w=await world(),sent=w.deploy(id,ap),g=w.ghost();
  assert.equal(w.replay(g,sent.birth),true);
  const copy=w.ghostObjects(g)[0];
  for(let i=0;i<60*40&&w.ghostObjects(g).length;i++)w.tick();   // the device and its wave rings run out
  assert.equal(copy.dead,true,'the ghost expired locally');assert.equal(w.ghostObjects(g).length,0);
  assert.equal(w.replay(g,sent.companion),false);
  assert.equal(w.replay(g,{...sent.birth,tick:99}),false,'not even a differently numbered birth');
  assert.equal(w.ghostObjects(g).length,0);
 });
}

for(const id of ['waveBreaker','splattercolorScreen'])test(`${id}: one device announces itself once, in either order, and a rejected sparse packet announces nothing`,async()=>{
 for(const order of ['normal','reverse']){
  const w=await world(),sent=w.deploy(id,57);let bursts=0;
  w.f.G.fx={burst(){bursts++;},ring(){}};
  const g=w.ghost(),packets=order==='normal'?[sent.birth,sent.companion]:[sent.companion,sent.birth];
  for(const packet of packets)w.replay(g,packet);
  assert.equal(bursts,1,`${order}: exactly one deployment burst`);
 }
 const w=await world(),sent=w.deploy(id,57);let bursts=0;w.f.G.fx={burst(){bursts++;},ring(){}};
 const g=w.ghost();
 w.replay(g,{id:sent.companion.id,activation:sent.companion.activation,action:sent.companion.action,pos:sent.companion.pos,seed:sent.companion.seed,object:sent.companion.object});
 assert.equal(bursts,0,'no device was built, so nothing is announced');
});

test('Wave Breaker radius can never be the unresolved AP table (array) or NaN, for any admitted birth',async()=>{
 const w=await world(),sent=w.deploy('waveBreaker',57),g=w.ghost();
 for(const bad of [{radius:undefined},{radius:Number.NaN},{radius:'27'},{radius:null},{duration:undefined},{specialPowerAP:undefined}]){
  const g2=w.ghost();
  const packet=JSON.parse(JSON.stringify({...sent.companion,...bad}));for(const k of Object.keys(bad))if(bad[k]===undefined)delete packet[k];
  w.replay(g2,packet);
  for(const o of w.ghostObjects(g2)){finiteNumber(o.maxRadius,'maxRadius');finiteNumber(o.dur,'dur');assert.equal(Array.isArray(o.maxRadius),false);}
 }
 void g;
});
