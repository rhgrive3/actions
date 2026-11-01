import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Two independent runtime/module/actor realms, with the actual NetMatch._rec
// wire rows replayed through the receiving peer's real NetMatch._play owner.
function throwAndLandCooler(f,a){a.aimDir.set(0,-1,0);a.intent.sub=true;a._updateSpecial(1/60);a.intent.sub=false;a._updateSpecial(1/60);
 for(let i=0;i<14&&a.specialActive;i++)a._updateSpecial(1/60);
 for(let i=0;i<10&&!(f.G.projectiles._s3SupportCoolers||[]).length;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}}
async function peer(id, remoteOwner) {
  const f=await fixture({fullRuntime:true,realProjectiles:true});
  f.G.scene ||= new f.THREE.Scene();
  f.G.camera ||= new f.THREE.PerspectiveCamera();
  const match={state:'playing',mode:'turf',playing:()=>true,actors:[]};
  f.G.match=match;
  f.G.physics={
    los:()=>true,raycast(_a,_b,_c,h){h.hit=false;return h;},
    segment(_a,b,h){h.hit=b.z>=1.3;
      if(h.hit){h.point.copy(b).setZ(1.3);h.normal.set(0,0,-1);}return h;},
  };
  const owner=f.make('support');owner.nid=7;owner.owner='A';owner.team=0;owner.remote=remoteOwner;
  owner.pos.set(0,0,0);owner.aimYaw=0;owner.aimDir.set(0,0,1);owner.form='kid';
  const victim=f.make('shooter');victim.nid=8;victim.owner='B';victim.team=1;
  victim.remote=!remoteOwner;victim.form='kid';
  const ally=f.make('shooter');ally.nid=9;ally.owner='B';ally.team=0;
  ally.remote=!remoteOwner;ally.form='kid';ally.pos.set(0,0,1);
  f.G.actors=[owner,victim,ally];match.actors=f.G.actors;
  const net=Object.create(f.NetMatch.prototype);
  net.match=match;net.byNid=new Map(f.G.actors.map(a=>[a.nid,a]));net.out=[];
  f.G.netm=net;
  return{f,owner,victim,ally,net};
}
test('#710/#835 bare cross-peer replay cannot forge a paid Point Sensor or Tacticooler birth',async()=>{
  const A=await peer('A',false),B=await peer('B',true);
  const replay=()=>{const events=A.net.out.splice(0);for(const row of events)B.net._play('A',row);return events;};
  A.f.G.projectiles.throwBomb(A.owner);
  let rows=replay();
  assert.equal(rows.length,1,'actual owner emits native sensor birth');
  assert.equal(rows[0][1],'ks');assert.equal(rows[0][2],'p');
  assert.equal(B.f.G.projectiles._s3SupportSensors?.length||0,0,
    'a second realm must not trust a naked _play without authenticated network tick');
  B.net._play('A',[1,'ks','m',7,1,8,0,480,0,'l']);
  assert.ok(!(B.victim.s3?.revealedUntil?.[0]>B.f.G.time));
  A.owner.special=A.owner.specialCost();A.owner._startSpecial();
  throwAndLandCooler(A.f,A.owner);rows=replay();
  assert.ok(rows.some(row=>row[1]==='ks'&&(row[2]==='t'||row[2]==='c')),
    'native owner emits actual charged special activation');
  assert.equal(B.f.G.projectiles._s3SupportCoolers?.length||0,0,
    'a second realm needs verified special-use evidence before granting a drink');
  assert.notEqual(B.ally.s3?.drink,true);
});