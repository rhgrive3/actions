// #1669: host-ranked Special restrictions must not be cleared by a fresh
// owner-authenticated rki.special=null packet while host knows the action runs.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from '../../network-replication/tests/robustness-fixture.mjs';
import { canCollectClam, canThrowClam, canCollectRainmaker } from '../runtime/ranked/clams.mjs';

const f=await fixture({productionComposition:true,includeMatch:true,rankedNetwork:true});

test('#1669 fresh guest null command cannot override host active Special for objective eligibility', () => {
 f.clock.set(100);f.G.time=100;
 const nm=f.makeNetMatch(f.makeSession('host','host'),{id:'special-1669'});
 const a=f.makeActor({nid:0,owner:'guest',remote:true,roller:false});
 a.pos.set(0,0,0);a.grounded=true;
 const m=f.bind(nm,[a]);f.G.match=m;m.mode='clams';
 m.ranked=new f.RankedEngine('clams',{id:'fixture',clams:{spawns:[],goals:[[0,0,30],[0,0,-30]]}});
 m.rankedWorld={zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false};
 m.rankedBarrierHits=[];m.rankedGains=[0,0];
 const row=f.packActor(a,{x:0,y:0,z:0});
 nm.onMessage('guest',f.parseWire(JSON.stringify({
  k:'t',ts:100,r:2,u:6000,l:{0:0},a:[row],
  rki:{match:nm.cfg.id,id:'0',seq:1,fire:false,throw:false,aim:[0,0,1],
   special:null,specialDeployed:false,clamDrop:0},
 })));
 try {
  assert.equal(nm.rankedInputs.get('0').special,null,'host admitted an owner-authenticated null command');
  assert.ok(nm.rankedPose?.get('0'),'snapshot was admitted, not merely the command');
  const remoteActor=()=>f.buildFrame(m,f).actors[0];
  a.specialActive={id:'krakenRoyale'};
  assert.equal(remoteActor().special,'krakenRoyale');
  assert.equal(canCollectClam(remoteActor()),false);
  assert.equal(canThrowClam(remoteActor()),false);
  a.specialActive={id:'zipcaster'};
  assert.equal(canCollectClam(remoteActor()),false);
  assert.equal(canCollectRainmaker(remoteActor()),false);
  a.specialActive={id:'inkjet'};
  assert.equal(canCollectRainmaker(remoteActor()),false);
  assert.equal(canThrowClam(remoteActor()),false);
  f.G.time+=1;
  assert.equal(remoteActor().special,'inkjet','the admitted host action remains even when rki expires');
  a.specialActive=null;
  assert.equal(remoteActor().special,null,'genuine host action termination releases restrictions');
  assert.equal(canCollectClam(remoteActor()),true);
  assert.equal(canThrowClam(remoteActor()),true);
  assert.equal(canCollectRainmaker(remoteActor()),true);
 } finally {
  nm.dispose();
 }
});
