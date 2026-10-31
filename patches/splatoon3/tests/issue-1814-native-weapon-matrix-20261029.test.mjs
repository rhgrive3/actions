import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {readySpecialEvidence,useSpecialEvidence} from './special-control-evidence.mjs';
import {MAIN_WEAPON_CATALOG} from '../runtime/main-weapon-catalog-data.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

// Production Actor, WeaponRunner, projectile step and deployed object owner;
// source-fixture stubs Character pose and movement integration, not contact.
// This tests current software behavior, not undetermined retail unit semantics.
const DT=1/60;
const referenceBytes=fs.readFileSync(new URL('./fixtures/catalogue-object-rates-1130.json',import.meta.url));
const referenceHash='ad5c941f8795a43174dd1d152993061871bdf758340639bce9d78b72d8ec9efb';
function readReference(bytes){assert.equal(createHash('sha256').update(bytes).digest('hex'),referenceHash,'sealed object-rate fixture bytes');return JSON.parse(bytes);}
const reference=readReference(referenceBytes);
assert.equal(reference.sha256,'eb536e1c2cf4bb280c2898fdd9882fe3eb6c8f7a47c5302f0ff7fe755b6ef64a');
assert.equal(reference.columns[0],'Wsb_Shield');
const rows=['RollerSplash_Compact','RollerSplash_Heavy','RollerSplash_Hunter','RollerSplash_Wide',
 'BrushSplash','BrushSplash','BrushSplash_Heavy','Slosher','Slosher','Slosher_Washtub','Slosher'];
const columns={splashWall:0,sprinkler:1,beakon:2,torpedo:3,waveBreaker:4,superChump:5};
const shredderRate=reference.rows.ObjectEffect_Up[0];
const names=['Carbon Roller','Dynamo Roller','Flingza Roller','Big Swig Roller',
 'Inkbrush','Octobrush','Painbrush','Tri-Slosher','Sloshing Machine','Explosher','Dread Wringer'];
const source=name=>{const r=MAIN_WEAPON_CATALOG.records.find(x=>x.names.en===name);assert.ok(r,name);return r;};
function fireAndContact(f,{name,hz=60,pitch=0,ink=100,gear=false,unit=0,vertical=false,targetKind='splashWall',ghost=false,miss=false,ally=false,targetHp=10000,edge=null}){
 const {G,THREE}=f,system=G.projectiles;system.clear();G.actors.length=0;G.time=0;f.setRandom(()=>.5);
 G.level=new f.Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-40,0,-40],[40,0,40]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-50,-1,-50],max:[50,0,50]}]});G.physics=new f.Physics(G.level);
 const r=source(name),owner=f.make(r.id),clock=new f.FixedClock();
 const defender=f.make('shooter');defender.team=ally?0:1;let specialTarget=null;
 if(targetKind==='waveBreaker'||targetKind==='superChump'){
  defender.weapon={...defender.weapon,special:targetKind,specialCost:100};defender.special=100;defender.alive=true;
  readySpecialEvidence(defender,{placeAtFixtureOrigin:true});useSpecialEvidence(f,defender);
  specialTarget=system._s3AllSpecialObjects.find(o=>o.owner===defender&&o.kind===(targetKind==='waveBreaker'?'wave':'decoy'));
  assert.ok(specialTarget,`${targetKind}: actual native special object`);
  // Keep every actual activation object owned by the production cleanup; only
  // move other decoys away from this single-target contact probe.
  for(const other of system._s3AllSpecialObjects)if(other!==specialTarget)other.pos.set(1000,1000,1000);
  system.list.length=0;G.time=0;
 }
 owner.team=0;owner.pos.set(0,10,0);owner.character.root.position.copy(owner.pos);owner.form='kid';owner.kidT=1;
 owner.ink=ink;owner.grounded=!vertical;owner.ground.hit=owner.grounded;
 if(vertical)owner.character.trigger('jump');
 owner.aimYaw=owner.yaw=0;owner.aimPitch=pitch;owner.aimPoint.set(0,11.05,80);owner.intent.fire=true;
 owner.s3.loadout[2].main=gear?'objectShredder':'runSpeed';
 let ticks=0,p=null;
 try{
  for(let frame=0;frame<hz*3&&!p;frame++)clock.advance(1/hz,dt=>{
   if(p)return;
   if(owner.weaponRunner.catalogState?.pending?.remaining<=DT+1e-9)owner.aimYaw=.37;
   G.time+=dt;owner.update(dt);owner.intent.fire=false;ticks++;
   p=system.list.find(x=>x.catalog?.descriptor?.unit===unit && x.delay===0) || null;
  });
  if(!p){
   assert.ok(ink===1||ink===0,`${name}: full-ink shot cannot silently fail admission`);
   assert.equal(system.list.filter(x=>x.owner===owner&&x.catalog).length,0,`${name}: rejected low-ink press emitted no catalogue rounds`);
   return {noBirth:true,ink:owner.ink,ticks};
  }
  assert.equal(p.owner,owner);assert.equal(p.catalog.r.id,r.id);
  assert.ok(p.pos.toArray().every(Number.isFinite)&&p.vel.toArray().every(Number.isFinite));
  const originalPacket=Array.from(p.inkMeta.s3Catalog);
  if(ghost){
   owner.nid=7;let wire;
   f.NetMatch.prototype.recProj.call({_rec:row=>{wire=[0,...structuredClone(row),0,1];return wire;},cfg:{id:'matrix-object-ghost'}},p);
   assert.ok(wire,'native serializer recorded a projectile');
   const remote=f.make(r.id);remote.remote=true;remote.team=owner.team;remote.nid=owner.nid;
   remote.owner='matrix-sender';
   const session={myId:'matrix-receiver',hostId:'matrix-sender',isHost:false,tr:{broadcast(){},sendTo(){}},_members:new Map([['matrix-sender',{}],['matrix-receiver',{}]])};
   const match={actors:[remote],state:'playing',playing:()=>true,time:180};
   const nm=new f.NetMatch(session,{id:'matrix-object-ghost'});nm.bind(match);nm._peer('matrix-sender');
   wire._netSeq=1;wire._netTick=1;nm._play('matrix-sender',wire);const replay=system.list.at(-1);nm.dispose();
   assert.ok(replay?.ghost&&replay.catalog,'actual network ghost replay');
   assert.equal(replay.catalog.descriptor.unit,p.catalog.descriptor.unit);
   assert.equal(replay.catalog.descriptor.key,p.catalog.descriptor.key);assert.equal(replay.catalog.index,p.catalog.index);
   assert.ok(replay.start.distanceTo(p.start)<.02,'serialized position quantization');
   p=replay;
  }
  const birth={ticks,aimYaw:owner.aimYaw,start:Array.from(p.start.toArray()),pos:Array.from(p.pos.toArray()),vel:Array.from(p.vel.toArray()),ink:owner.ink,unit:p.catalog.descriptor.unit,key:p.catalog.descriptor.key,packet:Array.from(p.inkMeta?.s3Catalog||originalPacket)};
  if(targetKind==='terrain'){
   const z=p.pos.z+2;G.level=new f.Level({bounds:{minX:-50,maxX:50,minZ:-50,maxZ:50},spawnPads:[[-40,0,-40],[40,0,40]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-40,-10,z],max:[40,40,z+.1]}]});
   G.physics=new f.Physics(G.level);const paint=G.paint.splat;let paints=0,ended=false;
   G.paint.splat=function(...args){paints++;return paint.apply(this,args);};
   try{for(let tick=0;tick<60&&!ended;tick++){G.time+=DT;ended=system._step(p,DT);}}
   finally{G.paint.splat=paint;}
   const hit=p.catalog.lobes?.[0]?.hit;
   assert.equal(ended,true,`${name}: real terrain stops projectile`);
   assert.ok(hit?.hit,`${name}: source collision has a real face`);
   assert.ok(G.level.faces[hit.face],`${name}: face belongs to actual Level`);
   assert.ok(paints>0,`${name}: real terrain impact reaches paint sink`);
   return {birth,position:Array.from(p.pos.toArray()),point:Array.from(hit.point.toArray()),paints};
  }
  if(!specialTarget){defender.weapon={...defender.weapon,sub:targetKind};defender.weaponRunner.reset();}
  const returned=specialTarget?null:system.throwBomb(defender), target=specialTarget||(targetKind==='sprinkler'?system.bombs.at(-1):returned);
  assert.ok(target,`actual deployed ${targetKind} object`);
  if(targetKind==='sprinkler'){target.s3Mode='sprinkling';target.s3DeviceHP=targetHp;}
  else if(specialTarget){target.hp=targetHp;}
  else{target.phase=targetKind==='torpedo'?'chase':'deployed';target.chasedTarget=targetKind==='torpedo';target.hp=targetHp;}
  target.vel?.set(0,0,0);
  const at=p.pos.clone().addScaledVector(p.vel,DT/2);
  const dir=p.vel.clone();dir.y=0;assert.ok(dir.lengthSq()>0);
  target.yaw=Math.atan2(dir.x,dir.z);target.pos.copy(at);target.pos.y-=targetKind==='splashWall'?1:targetKind==='beakon'?.48:0;
  if(miss)target.pos.x+=20;
  if(edge!==null)target.pos.addScaledVector(new THREE.Vector3(dir.z,0,-dir.x).normalize(),(targetKind==='beakon'?.5:.42)+(p.size||0)+edge);
  target.prev?.copy(target.pos);
  assert.equal(!!p.ghost,ghost);
  const hp=()=>targetKind==='sprinkler'?target.s3DeviceHP:target.hp;
  const before=hp(),sourceRow=rows[names.indexOf(name)],column=columns[targetKind],rate=reference.rows[sourceRow]?.[column]*(gear?reference.rows.ObjectEffect_Up[column]:1);let candidates=0;
  const find=system.kitDefenseCandidate;
  system.kitDefenseCandidate=function(...args){const c=find.apply(this,args);if(c?.object===target||targetKind==='sprinkler'&&c?.kind==='native-sprinkler'||targetKind==='waveBreaker'&&c?.kind==='wave-breaker'||targetKind==='superChump'&&c?.kind==='super-chump')candidates++;return c;};
  let ended;
  try {G.time+=DT;ended=system._step(p,DT);} finally {system.kitDefenseCandidate=find;}
  const sourceUnit={paintOnly:p.catalog.descriptor.packet.PaintOnly??null,unitDamageRate:p.catalog.descriptor.packet.UnitDamageRate??null};
  const geometricHit=unit!==0&&targetKind==='splashWall'?find.call(system,p)?.object===target:null;
  const result={birth,sourceUnit,geometricHit,loss:before-hp(),rate,damage:p.damage,candidates,ended,position:Array.from(p.pos.toArray()),targetHp:hp(),dead:!!(target.dead||target.s3Destroyed)};
  if(!ghost&&!miss&&Object.hasOwn(columns,targetKind)&&unit===0&&!ally&&(edge===null||edge<0)){
   assert.ok(Number.isFinite(rate)&&rate>0,`${name}: pinned source row ${sourceRow}`);
   assert.ok(candidates>0,`${name}: real defense candidate`);assert.equal(ended,true,`${name}: round stops on wall`);
   assert.ok(Number.isFinite(result.damage)&&result.damage>0,`${name}: actual direct damage`);
   assert.ok(Math.abs(result.loss-result.damage*rate)<1e-8,`${name}: real contact applies source row and gear exactly once`);
  }
  return result;
 } finally {owner.weaponRunner.reset();system.clear();G.actors.length=0;f.restoreRandom();}
}

test('eleven admitted main owners hit a deployed wall across aim, ink, cadence and real Object Shredder',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});let scenarios=0,lowInk=0,rejected=0;const acceptedByName={},rejectedByName={};
 for(const name of names)for(const pitch of [-Math.PI/4,0,Math.PI/4])for(const ink of [1,100]){
  let reference;
  for(const hz of [30,60,120]){
   const bare=fireAndContact(f,{name,hz,pitch,ink}),wear=fireAndContact(f,{name,hz,pitch,ink,gear:true});
   if(bare.noBirth||wear.noBirth){
    assert.equal(ink,1);assert.deepEqual(wear,bare,`${name}: gear cannot change rejected low-ink admission`);
    if(reference)assert.deepEqual(bare,reference,`${name}: same rejected admission at ${hz} Hz`);else reference=bare;
    rejected++;rejectedByName[name]=(rejectedByName[name]||0)+2;scenarios+=2;continue;
   }
   assert.deepEqual(wear.birth,bare.birth,`${name}: gear must not alter the admitted launch or ink`);
   assert.equal(wear.damage,bare.damage,`${name}: gear must not alter projectile base damage`);
   assert.ok(Math.abs(wear.loss-bare.loss*shredderRate)<1e-8,`${name}: gear target factor exactly once`);
   assert.equal(bare.birth.aimYaw,.37,`${name}: moving aim observed on release`);
   const state={birth:bare.birth,loss:bare.loss,damage:bare.damage,rate:bare.rate,position:bare.position};
   if(reference)assert.deepEqual(state,reference,`${name}: same fixed-tick contact at ${hz} Hz`);else reference=state;
   if(ink===1&&bare.birth.ink<1)lowInk++;
   acceptedByName[name]=(acceptedByName[name]||0)+2;scenarios+=2;
  }
 }
 assert.equal(scenarios,396);assert.ok(lowInk>0,'low-ink payment actually observed');assert.ok(rejected>0,'low-ink rejection actually observed');for(const name of names)assert.ok(acceptedByName[name]>0,name+' admitted contact');
 console.log(JSON.stringify({attempted:scenarios,acceptedByName,rejectedByName,sourceShieldFactor:shredderRate}));
});

test('real paint-only and current zero-rate units pass the wall without object HP damage',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 for(const row of [{name:'Flingza Roller',vertical:true,unit:3},{name:'Flingza Roller',vertical:true,unit:4},{name:'Dynamo Roller',unit:1}])for(const gear of [false,true]){
  const x=fireAndContact(f,{...row,gear});assert.equal(x.geometricHit,true,'actual trajectory intersects wall');if(row.name==='Flingza Roller')assert.equal(x.sourceUnit.paintOnly,true);else assert.equal(x.sourceUnit.unitDamageRate,0);assert.equal(x.loss,0);assert.equal(x.candidates,0);assert.equal(x.ended,false);
 }
});

test('actual ghosts, misses, allies and inert Ink Mine do not spend wall/device HP',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 for(const name of names)for(const hz of [30,60,120])for(const pitch of [-Math.PI/4,Math.PI/4]){const ghost=fireAndContact(f,{name,hz,pitch,gear:true,ghost:true});assert.ok(ghost.candidates>0,`${name}: actual ghost reaches wall`);assert.equal(ghost.loss,0);}
 const miss=fireAndContact(f,{name:'Carbon Roller',gear:true,miss:true});assert.equal(miss.candidates,0);assert.equal(miss.loss,0);assert.equal(miss.ended,false);
 const ally=fireAndContact(f,{name:'Carbon Roller',gear:true,ally:true});assert.equal(ally.candidates,0);assert.equal(ally.loss,0);assert.equal(ally.ended,false);
 const inert=fireAndContact(f,{name:'Carbon Roller',gear:true,targetKind:'inkMine'});assert.equal(inert.candidates,0);assert.equal(inert.loss,0);assert.equal(inert.ended,false);
});


test('real admitted hit retires an exhausted wall',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 for(const gear of [false,true]){
  const result=fireAndContact(f,{name:'Carbon Roller',gear,targetHp:1});
  assert.ok(result.candidates>0);assert.ok(result.targetHp<=0);assert.equal(result.dead,true);
 }
});

test('all eleven admitted main owners use the pinned rows against real deployed devices',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});let contacts=0;
 for(const targetKind of ['sprinkler','beakon','torpedo','waveBreaker','superChump'])for(const name of names){
  const bare=fireAndContact(f,{name,targetKind}),wear=fireAndContact(f,{name,targetKind,gear:true});
  assert.deepEqual(wear.birth,bare.birth,`${name} ${targetKind}: gear preserves birth`);
  assert.ok(Math.abs(wear.loss-bare.loss*reference.rows.ObjectEffect_Up[columns[targetKind]])<1e-8,`${name} ${targetKind}: target-specific gear once`);
  contacts+=2;
 }
 assert.equal(contacts,110);
});


test('all eleven actual main rounds reach and paint native terrain at both elevations and render rates',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});let n=0;
 for(const name of names)for(const pitch of [-Math.PI/4,Math.PI/4]){
  let reference;
  for(const hz of [30,60,120]){
   const row=fireAndContact(f,{name,pitch,hz,targetKind:'terrain'});
   if(reference)assert.deepEqual(row,reference,`${name}: fixed-tick terrain result at ${hz} Hz`);else reference=row;
   n++;
  }
 }
 assert.equal(n,66);
});


test('all eleven actual rounds discriminate near-object hit and miss around native Beakon radius',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});let checks=0;
 for(const name of names)for(const pitch of [-Math.PI/4,Math.PI/4])for(const hz of [30,60,120]){
  const hit=fireAndContact(f,{name,pitch,hz,targetKind:'beakon',edge:-.02});
  const miss=fireAndContact(f,{name,pitch,hz,targetKind:'beakon',edge:.02});
  assert.ok(hit.candidates>0&&hit.loss>0,`${name}: inner native contact`);
  assert.equal(miss.candidates,0,`${name}: outer native miss`);assert.equal(miss.loss,0);assert.equal(miss.ended,false);checks+=2;
 }
 assert.equal(checks,132);
});


test('pinned object-rate evidence rejects a changed weapon row',()=>{
 const before='"RollerSplash_Compact": [\n      2.64,',after='"RollerSplash_Compact": [\n      2.65,';
 const raw=referenceBytes.toString('utf8');assert.equal(raw.split(before).length,2,'one targeted source row');
 const altered=Buffer.from(raw.replace(before,after));
 assert.throws(()=>readReference(altered),/sealed object-rate fixture bytes/);
});
