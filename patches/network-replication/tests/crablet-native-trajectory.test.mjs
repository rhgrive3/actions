import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
const runtime=process.env.INKWAVE_BUILT_SITE
  ?pathToFileURL(path.resolve(process.env.INKWAVE_BUILT_SITE,'patches/network-replication')+path.sep)
  :new URL('../',import.meta.url);
const {combatAdmission}=await import(new URL('combat-provenance.mjs',runtime));
const {COMBAT_HIT_CEILINGS}=await import(new URL('combat-hit-ceilings-data.mjs',runtime));
const {crabletProofKey,recordCrabletBirth,sampleCrabletHistory}=await import(new URL('crablet-trajectory.mjs',runtime));

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export { Boss } from './inkwave-public/src/boss/boss.js';",
  vmPerformance:{now:()=>100000}});

function fire(id='shooter'){
  const {G,THREE}=f;G.projectiles.clear();G.actors.length=0;G.boss=null;
  G.level={blocks:[],faces:[],groundHeight:()=>0,queryBlocks:()=>[]};
  G.physics=new f.Physics(G.level);
  const a=f.make(id);a.nid=17;a.owner='guest';a.isLocal=true;
  const rec=new f.NetMatch({myId:'guest',hostId:'host',isHost:false}, {id:'m',map:'tidewater'});
  const out=rec.out;G.netm=rec;
  a.aimPoint.set(0,1.05,60);a.aimDir.set(0,0,1);
  if(a.weapon.catalogRecord&&!a.weapon.catalogRecord.legacy){
    for(let i=0;i<240&&!out.some(e=>e[1]==='p');i++){
      const held=i<180;a.intent.fire=held;G.time+=1/60;
      a.weaponRunner.update(1/60,{fire:held,firePressed:i===0});
    }
  }else if(a.weapon.kind==='splatling'){
    a.weaponRunner.charge=.8;a.weaponRunner.fidelitySplatlingCharge=.8;
    G.projectiles.fireSplatling(a,a.weapon,0);
  }else if(a.weapon.kind==='dualies')G.projectiles.fireDualies(a,a.weapon,0);
  else G.projectiles.fireShooter(a,a.weapon,0);
  const event=out.find(e=>e[1]==='p');assert.ok(event,'actual recProj birth');
  a.remote=true;
  const ghost=G.projectiles.ghostProjectile(a,event);assert.ok(ghost,'actual native ghost decoder');
  return {G,THREE,a,event,ghost,system:G.projectiles};
}
function receiver(x){
  const {G,THREE,a,event,system}=x,crab={id:3,x:0,y:.7,z:10,hp:40,dead:false};
  const boss={sim:true,dead:false,visible:true,pos:new THREE.Vector3(0,0,10),crabs:new Map([[3,crab]])};
  const nm={isHost:true,cfg:{id:'m'},byNid:new Map([[a.nid,a]]),match:{state:'playing',boss},
    _combatProvenancePhysics:G.physics,_combatProvenanceTHREE:THREE,_combatCrabletSystem:system,
    _combatHitCeilings:COMBAT_HIT_CEILINGS,
    _combatProvenance:{proofs:new Map(),pending:new Map(),contacts:new Map()}};
  const direction=event.slice(8,11),length=Math.hypot(...direction),origin=event.slice(5,8),cause=a.weapon.catalogRecord?.id||a.weapon.id;
  const proof={actor:a.nid,at:100,ts:100,origin,unit:direction.map(v=>v/length),reach:50,
    cause,kind:'main',src:'p',uses:0,maxUses:1,firePose:a.pos.toArray(),
    key:crabletProofKey(a.nid,100,'p',cause,origin,system.crabletCombatBirthId(event))};
  nm._combatProvenance.proofs.set('guest',[proof]);
  recordCrabletBirth(nm,'guest',event,100);
  return {...x,nm,boss,crab,proof,claim(t=100){return combatAdmission(nm,'guest',
    {m:'m',a:a.nid,d:20,w:'crab',c:3,q:1,weak:0},'boss',t);}};
}

const catalogueIds=['shooter','dualies','splatling','charger'].map(family=>
  Object.values(f.WEAPONS).find(w=>w.catalogRecord?.family===family&&!w.catalogRecord.legacy)?.id);
assert.ok(catalogueIds.every(Boolean));
for(const id of ['shooter','dualies','splatling',...catalogueIds])test(id+' receiver probe follows the actual native flight without cosmetic/RNG/Actor writes',()=>{
  const x=fire(id),{G,a,event,ghost,system}=x;
  const before={list:system.list.slice(),pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,frame:G.time};
  let draws=0;f.setRandom(()=>{draws++;return .5;});
  const probe=system.makeCrabletCombatProbe(a,event);assert.ok(probe);
  assert.equal(draws,0,'decoding cannot draw RNG');
  const count=Math.min(45,Math.floor(probe.life*60));
  for(let i=0;i<count;i++){
    const radii=system.stepCrabletCombatProbe(probe);
    system._step(ghost,1/60);
    for(const k of ['x','y','z']){close(probe.pos[k],ghost.pos[k]);close(probe.vel[k],ghost.vel[k]);}
    assert.ok([radii.field0,radii.field1,radii.pad].every(v=>Number.isFinite(v)&&v>=0));
  }
  assert.deepEqual(system.list,before.list);
  assert.deepEqual(a.pos.toArray(),before.pos);assert.deepEqual(a.vel.toArray(),before.vel);
  assert.equal(a.ink,before.ink);assert.equal(G.time,before.frame);
  f.restoreRandom();
});

test('live native birth trace preserves clear edge contact and rejects a blocking wall before spending proof',()=>{
  for(const blocked of [false,true]){
    const x=receiver(fire()),{G,THREE,event,nm,crab,proof,system}=x;
    // Reuse the real native packet and integrator; place the sphere on its
    // actual sampled path so gravity/aim compensation is not guessed.
    const sample=system.makeCrabletCombatProbe(x.a,event);
    for(let i=0;i<5;i++)system.stepCrabletCombatProbe(sample);
    crab.x=sample.pos.x+.45;crab.y=sample.pos.y-.35;crab.z=sample.pos.z;
    const wallZ=event[7]+(crab.z-event[7])*.8,wallX=blocked?0:.36;
    const block={id:0,solid:true,grate:false,center:new THREE.Vector3(wallX,sample.pos.y,wallZ),
      half:new THREE.Vector3(.025,3,.1),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:Array(6).fill(-1)};
    G.level={blocks:[block],faces:[],queryBlocks:()=>[0]};G.physics=new f.Physics(G.level);nm._combatProvenancePhysics=G.physics;
    assert.equal(G.physics.los(new THREE.Vector3(...event.slice(5,8)),new THREE.Vector3(crab.x,crab.y+.35,crab.z)),blocked,
      'centre LOS gives the opposite answer to the actual trajectory');
    assert.equal(x.claim(),!blocked);
    assert.equal(proof.uses,blocked?0:1);assert.equal(proof.bossTargets?.size??0,blocked?0:1);
  }
});

test('receiver history preserves a moving crab hit and expires old or recycled targets',()=>{
  const x=receiver(fire()),sample=x.system.makeCrabletCombatProbe(x.a,x.event);
  for(let i=0;i<5;i++)x.system.stepCrabletCombatProbe(sample);
  x.crab.x=sample.pos.x;x.crab.y=sample.pos.y-.35;x.crab.z=sample.pos.z;
  sampleCrabletHistory(x.nm,100);
  x.crab.x+=8;sampleCrabletHistory(x.nm,100.15);
  assert.equal(x.claim(100.15),true,'the receiver remembers the actual earlier sphere');
  x.proof.uses=0;x.proof.bossTargets=new Set();
  assert.equal(x.claim(101.21),false,'expired positions cannot authorize another hit');
  x.nm.match.boss.crabs.set(3,{...x.crab});
  assert.equal(x.claim(100.2),false,'a recycled ID cannot borrow the previous crab object history');
});

test('a live receiver cannot substitute an unrecorded, malformed or different-life birth',()=>{
  const x=receiver(fire());x.nm._crabletTrajectories.births.clear();
  assert.equal(x.claim(),false);assert.equal(x.proof.uses,0);
  recordCrabletBirth(x.nm,'guest',[...x.event.slice(0,8),NaN,...x.event.slice(9)],100);
  assert.equal(x.claim(),false);assert.equal(x.proof.uses,0);
  recordCrabletBirth(x.nm,'guest',x.event,100);x.a.netLife=1;
  assert.equal(x.claim(),false);assert.equal(x.proof.uses,0);
  x.a.netLife=0;x.a.net={lastLife:1};
  assert.equal(x.claim(),false,'a newly accepted remote life retires the old birth before playback');
  assert.equal(x.proof.uses,0);
});

test('native damage tracing does not depend on space for cosmetic ghosts',()=>{
  const x=receiver(fire()),before=x.system.ghostProjectile;
  x.nm._crabletTrajectories.births.clear();
  const length=x.system.list.length;
  x.system.ghostProjectile=()=>{throw Error('cosmetic allocation is forbidden');};
  try{recordCrabletBirth(x.nm,'guest',x.event,100);assert.equal(x.claim(),true);}
  finally{x.system.ghostProjectile=before;}
  assert.equal(x.system.list.length,length);
});

test('actual NetMatch packet receipt binds native IDs before damage and accepts two distinct same-time births',()=>{
  const {G,THREE,a,event,system}=fire(),writer=G.netm;
  a.remote=false;system.fireShooter(a,a.weapon,0);a.remote=true;
  const births=writer.out.filter(e=>e[1]==='p');assert.equal(births.length,2);
  assert.equal(births[0][0],births[1][0]);assert.notEqual(system.crabletCombatBirthId(births[0]),system.crabletCombatBirthId(births[1]));
  const crab={id:3,x:0,y:.7,z:10,hp:400,dead:false};
  const boss=Object.assign(Object.create(f.Boss.prototype),{sim:true,dead:false,visible:true,
    hp:1000,pos:new THREE.Vector3(0,0,10),crabs:new Map([[3,crab]]),log:{recv:0,recvDmg:0}});
  const nm=new f.NetMatch({myId:'host',hostId:'host',isHost:true,_members:new Map([['host','Host'],['guest','Guest']]),
    tr:{sendTo(){return true;},broadcast(){}}},{id:'m',map:'tidewater'});
  const match={actors:[a],state:'playing',time:180,mode:'boss',boss,playing:()=>true,opts:{},removeActor(){}};G.match=match;
  boss.match=match;
  nm.bind(match);
  G.netm=nm;
  const row=[a.nid,...a.pos.toArray(),0,0,0,0,0,0,1,100,100,0,0,0,0,0,0,1,0];
  nm.onMessage('guest',{k:'t',m:'m',ts:100.05,a:[row],l:{17:0},e:births});
  const proofs=nm._combatProvenance.proofs.get('guest');assert.equal(proofs.length,2);
  assert.equal(nm._crabletTrajectories.births.get('guest').size,2);
  const claim=q=>({k:'bhit',m:'m',a:17,d:20,w:'crab',c:3,q,l:0,weak:0});
  nm.onMessage('guest',claim(1));nm.onMessage('guest',claim(2));nm.onMessage('guest',claim(3));
  assert.equal(boss.log.recv,2,'a nonce is not a third shot');
  assert.equal(crab.hp,360,'actual Boss.remoteHit/_hitCrab applies each admitted 20 HP once');
  assert.ok(proofs.every(p=>p.uses===1));
  nm.dispose();assert.equal(nm._crabletTrajectories,null);
});

for(const charge of [8/60,.5,1])test(`legacy Charger ${charge} receiver segments follow the actual finite flight and admit a crab once`,()=>{
  const x=receiver(fire()),{G,system,THREE,nm,crab,proof}=x;
  system.clear();G.actors.length=0;
  const a=f.make('charger');a.nid=17;a.owner='guest';a.isLocal=true;
  a.aimPoint.set(0,1.05,60);a.aimDir.set(0,0,1);
  let event;const off=f.on('weapon:fire',e=>{event=e;});
  try{system.fireCharger(a,a.weapon,charge);}finally{off();}
  assert.ok(event,'real native fire event');
  const job=system._fidelityChargerFlights[0];assert.ok(job);
  a.remote=true;nm.byNid.set(17,a);
  Object.assign(proof,{src:'ev',cause:'charger',origin:event.muzzle.toArray(),unit:event.dir.toArray(),
    beamCharge:event.charge,beamLength:event.len,reach:Number(a.weapon.range||30)+12,firePose:a.pos.toArray(),maxUses:24});
  const path=system.makeCrabletChargerPath(proof);
  assert.ok(path.length>1);
  for(const row of path){
    system.update(1/60);
    for(let k=0;k<3;k++)close(job.pos.getComponent(k),row[3+k]);
  }
  const at=new THREE.Vector3(...proof.origin).addScaledVector(new THREE.Vector3(...proof.unit),event.len*.65);
  crab.x=at.x;crab.y=at.y-.35;crab.z=at.z;
  assert.equal(x.claim(),true);assert.equal(proof.uses,1);
  assert.equal(x.claim(),false,'a penetrating beam still cannot hit the same crab twice');
});

test('an accepted native ID cannot replace its original spread trajectory on replay',()=>{
  const x=receiver(fire()),rows=x.nm._crabletTrajectories.births.get('guest'),birth=rows.get(x.proof.key);
  const replay=x.event.slice();replay[8]=20;
  recordCrabletBirth(x.nm,'guest',replay,100.1);
  assert.equal(rows.size,1);assert.equal(rows.get(x.proof.key),birth);
  assert.equal(birth.probe.vel.x,x.event[8]);
  assert.equal(x.claim(),true);
});

test('off-path claims skip terrain and native terrain errors or malformed distances do not spend a proof',()=>{
  const original=f.G.projectiles.worldCrabletCombatProbe;
  try{
    const x=receiver(fire());let sweeps=0;
    x.system.worldCrabletCombatProbe=()=>{sweeps++;return {hit:false};};
    x.crab.x=20;assert.equal(x.claim(),false);assert.equal(sweeps,0);
    x.crab.x=0;
    for(const result of [null,{hit:1},{hit:true,dist:NaN},{hit:true,dist:1e6}]){
      x.system.worldCrabletCombatProbe=()=>result;
      assert.equal(x.claim(),false);assert.equal(x.proof.uses,0);
    }
    x.system.worldCrabletCombatProbe=()=>{throw Error('world unavailable');};
    assert.equal(x.claim(),false);assert.equal(x.proof.uses,0);
    x.system.worldCrabletCombatProbe=original;
    assert.equal(x.claim(),true,'fresh terrain queries preserve a clear retry');
  }finally{f.G.projectiles.worldCrabletCombatProbe=original;}
});
