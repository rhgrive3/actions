import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Two independent runtime/module/actor realms, with the actual NetMatch._rec
// wire rows replayed through the receiving peer's real NetMatch._play owner.
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
test('#710/#835 Point Sensor mark and Tacticooler drink cross separate owner/network realms',async()=>{
  const A=await peer('A',false),B=await peer('B',true);
  const replay=()=>{const list=A.net.out.splice(0);for(const row of list)B.net._play('A',row);return list;};
  A.f.G.projectiles.throwBomb(A.owner);
  let records=replay();
  assert.equal(records.length,1,'native owner emits one sensor birth row');
  assert.equal(records[0][1],'ks');assert.equal(records[0][2],'p');
  assert.equal(B.f.G.projectiles._s3SupportSensors.length,1);
  let mark=null;
  for(let t=0;t<120&&!mark;t++){
    A.f.G.time+=1/60;B.f.G.time+=1/60;
    A.f.G.projectiles.update(1/60);B.f.G.projectiles.update(1/60);
    const sensor=A.f.G.projectiles._s3SupportSensors[0];
    if(sensor?.activeAt!==null && sensor){
      A.victim.pos.copy(sensor.pos).add(new A.f.THREE.Vector3(0,-.7,0));
      B.victim.pos.set(A.victim.pos.x,A.victim.pos.y,A.victim.pos.z);
    }
    records=replay();mark=records.find(e=>e[1]==='ks'&&e[2]==='m')||null;
  }
  assert.ok(mark,'actual owner collision emits a tagged victim mark');
  assert.ok(B.victim.s3.revealedUntil[0]>B.f.G.time,'receiving peer sees its own enemy mark');
  const until=B.victim.s3.revealedUntil[0];
  B.net._play('A',mark);B.net._play('forged-other-peer',mark);
  assert.equal(B.victim.s3.revealedUntil[0],until,'duplicate/spoof cannot renew a mark');
  A.owner.special=A.owner.specialCost();
  A.owner._startSpecial();
  records=replay();
  const stand=records.find(e=>e[1]==='ks'&&e[2]==='c');
  assert.ok(stand,'real special action emits stand birth');
  B.net._play('A',stand);
  assert.equal(B.f.G.projectiles._s3SupportCoolers.length,1);
  B.f.G.time+=1/60;B.f.G.projectiles.update(1/60);
  assert.equal(B.ally.s3.drink,true,'receiving teammate owns an effective drink');
  assert.equal(B.victim.s3?.drink===true,false,'opponent never gets allied drink');
});
