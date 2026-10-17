import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

// S3 11.3.0, ordinary versus, GP0. Wiki community observation: uses are
// consumed at landing, and teammates who select concurrently can all jump.
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/ジャンプビーコン#x08ca573
// Real composed Actor/WeaponRunner/Physics updates; no retail capture implied.
const STEP=1/60;
async function world(){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const {paint}=makePaintWorld(f);
  f.G.match={state:'playing',playing:()=>true,canRespawn:()=>false};
  const owner=f.make();Object.assign(owner,{nid:1,netLife:0,team:0});
  owner.pos.set(20,0,30);owner.weapon={...owner.weapon,sub:'beakon'};owner.weaponRunner.reset();
  owner.ink=100;
  for(let i=0;i<8;i++)owner.weaponRunner.update(STEP,{sub:true});
  owner.weaponRunner.update(STEP,{sub:false,subReleased:true});
  owner.weaponRunner.update(STEP,{sub:false});
  const beacon=f.G.projectiles._s3SubObjects.find(o=>o.subId==='beakon');
  assert.ok(beacon,'native admitted input creates one Beakon');
  assert.equal(owner.ink,25);
  assert.equal(beacon.phase,'deployed','native grounded release places Beakon at the owner’s feet');
  assert.deepEqual(beacon.pos.toArray(),owner.pos.toArray());assert.equal(beacon.vel.lengthSq(),0);
  const jumpers=Array.from({length:3},(_,i)=>{
    const a=f.make();Object.assign(a,{nid:i+2,netLife:0,team:0,isLocal:true,invuln:0});
    a.pos.set(-20-i*5,0,30);a.weapon={...a.weapon,sub:'burst'};a.weaponRunner.reset();return a;
  });
  function step(){f.G.time+=STEP;for(const a of jumpers)a.update(STEP);f.G.projectiles.update(STEP);paint.advanceSimulation(STEP);}
  return {f,owner,beacon,jumpers,step};
}

for(const firstCarriesBeacon of [false,true])test(`concurrent real Beakon jumps outlive the device; first carries Beakon=${firstCarriesBeacon}`,async()=>{
  const {f,beacon,jumpers,step}=await world();
  if(firstCarriesBeacon)jumpers[0].weapon={...jumpers[0].weapon,sub:'beakon'};
  const target=f.G.bigBubblerJumpTargets(0).find(t=>t.beakon);
  assert.ok(target);
  for(let i=0;i<jumpers.length;i++){
    assert.equal(jumpers[i].superJumpToBubbler(target),true,'each real map destination selection is admitted');
    for(let n=0;n<5;n++)step();
  }
  assert.equal(beacon.usesLeft,2,'selecting and charging do not pre-spend uses');
  assert.equal(beacon.reservations.size,3,'uses do not cap the number of already selected jumpers');
  let sawRemovedWhileLaterInFlight=false;
  const landed=new Set();f.on('superjump:land',e=>{if(jumpers.includes(e.actor))landed.add(e.actor);});
  for(let n=0;n<400&&landed.size<3;n++){
    step();
    if(beacon.dead&&jumpers.at(-1).superJumpState?.phase==='flight'){
      sawRemovedWhileLaterInFlight=true;
      const outsider=f.make();Object.assign(outsider,{nid:9,netLife:0,team:0,isLocal:true});outsider.pos.set(-10,0,30);
      assert.equal(outsider.superJumpToBubbler(target),false,'a new selection cannot use an exhausted/dead device');
      assert.equal(f.installedRuntime.useSubBeakon(outsider,beacon,'reserve'),false);
    }
  }
  assert.equal(sawRemovedWhileLaterInFlight,true);
  assert.equal(landed.size,3,'all already launched jumps finish through the actual Actor update');
  assert.equal(beacon.dead,true);
  for(const a of jumpers){
    assert.equal(a.superJumpState,null);assert.equal(a.grounded,true);
    assert.ok(Math.hypot(a.pos.x-target.pos.x,a.pos.z-target.pos.z)<.01);
    assert.equal(a.s3SubBeaconUse,undefined,'retired device leaves no pending use record');
  }
});

test('Beakon owner accepts concurrent remote identities without duplicate reservations or early consumption',async()=>{
  const {f,owner,beacon,jumpers}=await world();
  owner.owner='owner';
  for(const a of jumpers){a.remote=true;a.owner='jumpers';}
  f.G.netm={byNid:new Map([owner,...jumpers].map(a=>[a.nid,a]))};
  let eventSeq=1;
  const event=(a,reservationId,stage)=>({v:1,phase:'beakonUseProposal',subId:'beakon',seq:beacon.seq,
    eventSeq:eventSeq++,life:a.netLife,sourceLife:beacon.sourceLife,targetOwnerId:owner.nid,
    targetLife:beacon.sourceLife,targetOwnerLife:owner.netLife,targetSeq:beacon.seq,
    reservationId,stage,actor:a});
  for(const a of jumpers)assert.equal(f.installedRuntime.replaySub(event(a,1,'reserve')),true);
  assert.equal(beacon.reservations.size,3);assert.equal(beacon.usesLeft,2);
  assert.equal(f.installedRuntime.replaySub(event(jumpers[0],1,'reserve')),true);
  assert.equal(f.installedRuntime.replaySub(event(jumpers[0],2,'reserve')),false,'one actor life cannot flood reservation identities');
  assert.equal(beacon.reservations.size,3);
  assert.equal(f.installedRuntime.replaySub(event(jumpers[0],1,'cancel')),true);
  assert.equal(beacon.usesLeft,2);assert.equal(beacon.reservations.size,2);
  assert.equal(f.installedRuntime.replaySub(event(jumpers[1],1,'land')),true);
  assert.equal(beacon.usesLeft,1);
  assert.equal(f.installedRuntime.replaySub(event(jumpers[1],1,'land')),true);
  assert.equal(beacon.usesLeft,1,'duplicate landing cannot consume again');
});

test('offline owners without nids keep distinct map destinations, reservations and landing consumption at the same seq/life',async()=>{
  const {f,owner,beacon,jumpers,step}=await world();
  delete owner.nid;owner.slot=0;
  for(let i=0;i<jumpers.length;i++){delete jumpers[i].nid;jumpers[i].slot=i+1;}
  const other=f.make();other.team=0;other.slot=4;delete other.nid;other.netLife=owner.netLife;
  other.pos.set(-20,0,30);other.weapon={...other.weapon,sub:'beakon'};other.weaponRunner.reset();other.ink=100;
  for(let i=0;i<8;i++)other.weaponRunner.update(STEP,{sub:true});
  other.weaponRunner.update(STEP,{sub:false,subReleased:true});other.weaponRunner.update(STEP,{sub:false});
  const second=f.G.projectiles._s3SubObjects.find(o=>o.subId==='beakon'&&o.owner===other);assert.ok(second);
  assert.deepEqual(second.pos.toArray(),other.pos.toArray());assert.equal(second.vel.lengthSq(),0);step();
  assert.equal(second.phase,'deployed');assert.equal(second.seq,beacon.seq);assert.equal(second.sourceLife,beacon.sourceLife);
  const targets=f.G.bigBubblerJumpTargets(0).filter(t=>t.beakon),target1=targets.find(t=>t.pos===beacon.pos),target2=targets.find(t=>t.pos===second.pos);
  assert.ok(target1&&target2);assert.notEqual(target1.id,target2.id,'offline destination identity cannot collapse to the same local label');
  assert.equal(jumpers[0].superJumpToBubbler(target1),true);assert.equal(jumpers[1].superJumpToBubbler(target2),true);
  assert.ok(jumpers[0].superJumpState.beakonObject===beacon);assert.ok(jumpers[1].superJumpState.beakonObject===second,'actual map selection reaches its own owner');
  assert.equal(f.installedRuntime.useSubBeakon(jumpers[2],second,'reserve'),true,'another unnumbered actor is a distinct reservation');
  assert.equal(second.reservations.size,2);
  assert.equal(f.installedRuntime.useSubBeakon(jumpers[0],beacon,'land'),true);assert.equal(beacon.usesLeft,1);assert.equal(second.usesLeft,2);
  assert.equal(f.installedRuntime.useSubBeakon(jumpers[2],second,'land'),true);assert.equal(second.usesLeft,1);
  assert.equal(f.installedRuntime.useSubBeakon(jumpers[0],beacon,'reserve'),true);
  assert.equal(f.installedRuntime.useSubBeakon(jumpers[0],beacon,'land'),true);assert.equal(beacon.dead,true);
  assert.ok(jumpers[1].s3SubBeaconUse,'retiring one owner cannot erase another offline owner’s pending jump');
  assert.equal(second.reservations.size,1);assert.equal(second.dead,false);
  for(let n=0;n<400&&jumpers[1].superJumpState;n++)step();
  assert.equal(jumpers[1].superJumpState,null,'the offline second destination completes through the real actor controller');
  assert.equal(second.dead,true,'native landing spends its own remaining use');
  assert.equal(jumpers[1].s3SubBeaconUse,undefined,'native landing consumes its own offline reservation');
  f.G.projectiles.clear();assert.equal(jumpers[1].s3SubBeaconUse,undefined,'match cleanup removes the remaining offline use');
});
