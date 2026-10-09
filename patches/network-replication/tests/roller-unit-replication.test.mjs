import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
async function pair({vertical=true,speed=4,yaw=0,depleted=false}={}){
 const local=await fixture(),remote=await fixture();
 const sender=local.makeNetMatch(local.makeSession('p2','p2')),receiver=remote.makeNetMatch(remote.makeSession());
 const actor=local.makeActor({nid:7,owner:'p2',remote:false,vertical}),ghost=remote.makeActor({nid:7,owner:'p2',remote:true,vertical:!vertical});
 if(depleted)actor.weapon={...actor.weapon,s3Depletion:true,s3DepletionDrops:3,flickDrops:3,verticalDrops:3};
 actor.yaw=yaw;actor.vel.set(Math.sin(yaw)*speed,0,Math.cos(yaw)*speed);actor.aimPitch=.05;local.bind(sender,[actor]);remote.bind(receiver,[ghost]);local.G.time=1;
 local.projectiles.fireFlick(actor,actor.weapon);
 const births=[...local.projectiles.list],packets=plain(sender.out.filter(e=>e[1]==='p'));
 // Receive-time actor motion/mode/weapon must not select a birth's collider.
 ghost.vel.set(99,0,-99);ghost.weapon=remote.WEAPONS.shooter;
 return {local,remote,sender,receiver,actor,ghost,births,packets};
}
function replay(f,packets=f.packets){f.receiver.onMessage('p2',{k:'t',ts:1000,u:60,r:packets[0]?.length>=32?2:undefined,e:plain(packets)});const peer=f.receiver.peers.get('p2');for(const e of peer.events)f.receiver._play('p2',e);return f.remote.projectiles.list;}
function packetLayout(event,{inkMeta,kit}){
 const packet=[...event],marker=[31,32,33,34,35].find(index=>packet[index]===true);
 if(marker!==undefined)packet.splice(marker,1);
 if(!kit)packet.splice(28,2);
 if(!inkMeta)packet.splice(27,1);
 return packet;
}
function withDepletionMarker(packet){const marked=[...packet];marked.splice(marked.length-2,0,true);return marked;}
test('new birth unit preserves all Roller collider records across forward/backward motion and later owner changes',async()=>{
 for(const vertical of [false,true])for(const speed of [-6,0,4,6])for(const yaw of [0,.7]){
  const f=await pair({vertical,speed,yaw}),ghosts=replay(f);assert.equal(ghosts.length,f.births.length);
  for(let i=0;i<ghosts.length;i++){
   const p=f.births[i],q=ghosts[i],e=f.packets[i];assert.equal(e.length,36);assert.equal(e[30],vertical?1:0);assert.equal(e[31],p.seed);assert.equal(e[32],p._netId);assert.equal(e[33],p.fidelityRollerUnitIndex);assert.equal(e[34],60);assert.equal(e[35],i+1);
   assert.equal(q._netBornTick,60);assert.equal(q.fidelityRollerUnitIndex,p.fidelityRollerUnitIndex);assert.deepEqual(plain(q.fidelityPlayerCollision),plain(p.fidelityPlayerCollision));assert.deepEqual(plain(q.fidelityFieldCollision),plain(p.fidelityFieldCollision));
  }
 }
});
test('#305 depleted Roller births preserve owner collision radii on the remote presentation ghost',async()=>{
 for(const vertical of [false,true]){
  const f=await pair({vertical,depleted:true}),ghosts=replay(f);
  assert.equal(ghosts.length,vertical?3:4,'depletion count includes the horizontal nearest glob');
  for(let i=0;i<ghosts.length;i++){
   const p=f.births[i],q=ghosts[i],e=f.packets[i];
   const source=p.fidelityRollerUnit.UnitParam.CollisionParam,rate=source.DepletionRate;
   assert.equal(p.s3DepletionRound,true,'owner marks the actual depleted round');
   assert.equal(e[34],true,'wire carries an explicit depleted birth marker before tick and sequence');
   assert.equal(e.length,37);assert.equal(e[35],60);assert.equal(e[36],i+1);
   assert.equal(q.s3DepletionRound,true,'receiver restores the owner attack mode before initialization');
   assert.equal(q.ghost,true,'receiver copy remains presentation-only');
   assert.equal(q.fidelityRollerUnitIndex,p.fidelityRollerUnitIndex,'nearest/main source unit survives replay');
   assert.equal(q.fidelityPlayerCollision.initRadius,source.InitRadiusForPlayer*rate);
   assert.equal(q.fidelityPlayerCollision.endRadius,source.EndRadiusForPlayer*rate);
   assert.equal(q.fidelityFieldCollision.initRadius,source.InitRadiusForField*rate);
   assert.equal(q.fidelityFieldCollision.endRadius,source.EndRadiusForField*rate);
   assert.deepEqual(plain(q.fidelityPlayerCollision),plain(p.fidelityPlayerCollision));
   assert.deepEqual(plain(q.fidelityFieldCollision),plain(p.fidelityFieldCollision));
   let applied=0;
   f.remote.applyFidelityProjectileHit(f.remote.projectiles,q,{team:1,damage:n=>{applied+=n;}},999,new f.remote.THREE.Vector3());
   assert.equal(applied,0,'remote ghost never gains hit authority');
  }
 }
});
test('#305 normalizes depleted Roller flags across every base/inkMeta/kit birth shape before replay',async()=>{
 const layouts=[
  {name:'base',inkMeta:false,kit:false,length:33},
  {name:'inkMeta',inkMeta:true,kit:false,length:34},
  {name:'kit',inkMeta:false,kit:true,length:35},
  {name:'inkMeta+kit',inkMeta:true,kit:true,length:36},
 ];
 for(const depleted of [false,true])for(let index=0;index<layouts.length;index++){
  const layout=layouts[index],vertical=index%2===1,f=await pair({vertical,depleted}),owner=f.births[0];
  const base=packetLayout(f.packets[0],layout),event=depleted?withDepletionMarker(base):base;
  assert.equal(base.length,layout.length,`${layout.name} base length`);
  assert.equal(event.length,layout.length+(depleted?1:0),`${layout.name} wire length`);
  assert.equal(event.at(-2),f.packets[0].at(-2),'owner tick survives normalization');
  assert.equal(event.at(-1),f.packets[0].at(-1),'owner sequence survives normalization');
  const ghosts=replay(f,[event]),ghost=ghosts[0];
  assert.equal(ghosts.length,1,`${layout.name} birth is accepted once`);
  assert.equal(ghost._netBornTick,60,`${layout.name} tick survives native ghost parsing`);
  assert.equal(ghost._netId,owner._netId,`${layout.name} birth identity survives native ghost parsing`);
  assert.equal(ghost.seed,owner.seed,`${layout.name} appearance seed survives native ghost parsing`);
  assert.equal(ghost.fidelityMode,owner.fidelityMode,`${layout.name} attack mode survives native ghost parsing`);
  assert.equal(ghost.fidelityRollerUnitIndex,owner.fidelityRollerUnitIndex,`${layout.name} unit survives native ghost parsing`);
  assert.equal(ghost.s3DepletionRound,depleted,`${layout.name} depletion state is exact`);
  assert.deepEqual(plain(ghost.fidelityPlayerCollision),plain(owner.fidelityPlayerCollision),`${layout.name} player collision matches owner`);
  assert.deepEqual(plain(ghost.fidelityFieldCollision),plain(owner.fidelityFieldCollision),`${layout.name} field collision matches owner`);
  assert.equal(ghost.ghost,true,'remote replay remains presentation-only');
  const peer=f.receiver.peers.get('p2');
  f.receiver._play('p2',peer.events[0]);
  assert.equal(ghosts.length,1,`${layout.name} duplicate identity is still rejected`);

  if(depleted){
   // Measure the real target-capsule boundary. It must match for owner and
   // ghost, and an unscaled control must reach farther than the depleted one.
   const rate=owner.fidelityRollerUnit.UnitParam.CollisionParam.DepletionRate;
   const localTarget=f.local.makeActor({nid:90,owner:'target',remote:true,team:1,roller:false});
   const remoteTarget=f.remote.makeActor({nid:90,owner:'target',remote:true,team:1,roller:false});
   localTarget.pos.set(0,0,0);remoteTarget.pos.set(0,0,0);
   f.local.G.actors=[localTarget];f.remote.G.actors=[remoteTarget];
   const boundary=(world,p,target)=>{
    p.age=.01;p.fidelityPrevAge=.01;
    let low=0,high=1.5;
    for(let step=0;step<32;step++){
     const z=(low+high)/2;p.prev.set(-1,.725,z);p.pos.set(1,.725,z);
     if(world.fidelityProjectileTargets(world.projectiles,p).includes(target))low=z;else high=z;
    }
    return(low+high)/2;
   };
   const ownerBoundary=boundary(f.local,owner,localTarget),ghostBoundary=boundary(f.remote,ghost,remoteTarget);
   assert.ok(Math.abs(ownerBoundary-ghostBoundary)<1e-6,`${layout.name} real target-collision boundary matches (${ownerBoundary} vs ${ghostBoundary})`);
   const depletedCollision=owner.fidelityPlayerCollision;
   owner.fidelityPlayerCollision={...depletedCollision,initRadius:depletedCollision.initRadius/rate,endRadius:depletedCollision.endRadius/rate};
   const fullBoundary=boundary(f.local,owner,localTarget);
   owner.fidelityPlayerCollision=depletedCollision;
   assert.ok(fullBoundary>ownerBoundary+1e-3,'real collision query distinguishes the depleted envelope from a full-radius control');
  }
 }
});
test('moving vertical lower unit keeps its actual OBB first-contact envelope on the receiver',async()=>{
 const f=await pair(),q=replay(f)[3],p=f.births[3];assert.equal(p.fidelityRollerUnitIndex,2);assert.equal(q.fidelityRollerUnitIndex,2);
 const distances=[];for(const [world,particle] of [[f.local,p],[f.remote,q]]){
  const V=world.THREE.Vector3,b={id:0,solid:true,center:new V(0,-.1,0),half:new V(10,.1,10),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
  world.G.physics=new world.Physics({blocks:[b],faces:[],queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;}});world.G.actors=[];
  particle.prev.set(0,2,0);particle.pos.set(0,-1,0);particle.age=.1;particle.fidelityPrevAge=.1;world.fidelityProjectileTargets(world.projectiles,particle);const hit=world.fidelityWorldHit(world.projectiles,particle);assert.equal(hit.hit,true);distances.push(hit.dist);
 }
 assert.ok(Math.abs(distances[0]-1.45)<1e-9);assert.equal(distances[0],distances[1]);
});
test('legacy27/30/32 packets retain the historical inference fallback',async()=>{
 for(const length of [27,30,32]){
  const f=await pair(),legacy=f.packets.map(e=>{const p=[...e];p.splice(27,3);p.splice(30,1);return p.slice(0,length);});
  const ghosts=replay(f,legacy);assert.equal(ghosts.length,5);assert.equal(ghosts[3].fidelityRollerUnitIndex,1,'legacy inference is retained, not falsely claimed fixed');
  if(length>=30){
   for(let i=0;i<ghosts.length;i++){assert.equal(ghosts[i]._netId,f.births[i]._netId);assert.equal(ghosts[i].seed,f.births[i].seed);assert.equal(ghosts[i].s3Vertical,true);}
   for(const event of f.receiver.peers.get('p2').events)f.receiver._play('p2',event);
   assert.equal(ghosts.length,5,'historical identity rejects duplicate births');
  }
 }
});
test('new invalid unit types, ranges, mode and packet length are rejected before allocation or identity advance',async()=>{
 for(const value of [-1,-2,3,.5,'2',null,NaN,Infinity]){
  const f=await pair(),bad=[...f.packets[3]];bad[33]=value;f.receiver.peers.set('p2',{tr:1000});
  assert.equal(f.remote.projectiles.ghostProjectile(f.ghost,bad),null);assert.equal(f.remote.projectiles.list.length,0);
  f.receiver._play('p2',bad);assert.equal(f.remote.projectiles.list.length,0);assert.equal(f.receiver.peers.get('p2')._lastProjectileId,undefined);
  f.receiver._play('p2',f.packets[3]);assert.equal(f.remote.projectiles.list.length,1);
 }
 for(const change of [e=>e[30]=2,e=>e.push(1),e=>{e[30]=0;e[33]=2;}]){const f=await pair(),e=[...f.packets[3]];change(e);assert.equal(f.remote.projectiles.ghostProjectile(f.ghost,e),null);assert.equal(f.remote.projectiles.list.length,0);}
});
test('non-Roller uses sentinel and pooled Roller unit cannot leak into another family',async()=>{
 const f=await pair(),p=f.births[3];f.local.projectiles.list.splice(f.local.projectiles.list.indexOf(p),1);f.local.projectiles.pool.push(p);const reused=f.local.projectiles._new();assert.equal(reused,p);assert.equal(reused.fidelityRollerUnitIndex,null);
 f.actor.weapon=f.local.WEAPONS.shooter;f.actor.character.getMuzzle=o=>o.copy(f.actor.pos);f.sender.out.length=0;f.local.projectiles.fireShooter(f.actor,f.actor.weapon,0);const e=f.sender.out.find(e=>e[1]==='p');assert.equal(e.length,36);assert.equal(e[33],-1);
 assert.notEqual(f.remote.projectiles.ghostProjectile(f.ghost,e),null);const bad=[...e];bad[33]=0;assert.equal(f.remote.projectiles.ghostProjectile(f.ghost,bad),null);
 const forged=[...e];forged.splice(34,0,true);assert.equal(f.remote.validFidelityRollerUnitPacket(forged),false,'a non-Roller cannot request depleted Roller radii');
 f.remote.projectiles.list.length=0;f.receiver.peers.set('p2',{tr:1000});f.receiver._play('p2',forged);
 assert.equal(f.remote.projectiles.list.length,0,'the actual receiver denies a depletion marker on a non-Roller');
 assert.equal(f.receiver.peers.get('p2')._lastProjectileId,undefined,'denial happens before birth identity advances');
});

test('#305 rejects a depletion marker inserted before the Roller unit',async()=>{
 const f=await pair({depleted:true}),valid=[...f.packets[0]],marker=valid.findIndex((v,index)=>index>=31&&index<=35&&v===true);
 assert.ok(marker>=0);
 valid.splice(marker,1);valid.splice(marker-1,0,true);
 assert.equal(f.remote.validFidelityRollerUnitPacket(valid),false,'the marker must follow the Roller unit');
 f.receiver.peers.set('p2',{tr:1000});f.receiver._play('p2',valid);
 assert.equal(f.remote.projectiles.list.length,0,'malformed placement never allocates a ghost');
 assert.equal(f.receiver.peers.get('p2')._lastProjectileId,undefined,'malformed placement cannot consume an identity');
});

test('ordinary powered kit packet layouts remain valid and cannot claim Roller depletion',async()=>{
 const f=await pair();f.remote.SPECIALS.trizooka={projectileDescriptor:()=>f.remote.WEAPONS.shooter};
 const metaKit=packetLayout(f.packets[0],{inkMeta:true,kit:true});
 const poweredMeta=[...metaKit];poweredMeta[4]='trizooka';poweredMeta[33]=-1;poweredMeta.splice(poweredMeta.length-2,0,{s3SpecialPowerAP:18});
 const poweredBase=[...poweredMeta];poweredBase.splice(27,1);poweredBase[32]=-1;
 assert.equal(poweredMeta.length,37);assert.equal(f.remote.validFidelityRollerUnitPacket(poweredMeta),true,'inkMeta plus powered kit remains supported');
 assert.equal(poweredBase.length,36);assert.equal(f.remote.validFidelityRollerUnitPacket(poweredBase),true,'base plus powered kit remains supported');
 for(const packet of [poweredMeta,poweredBase]){
  const forged=[...packet];forged.splice(forged.length-2,0,true);
  assert.equal(f.remote.validFidelityRollerUnitPacket(forged),false,'powered non-Roller packets cannot use the depletion marker');
 }
});

test('unsupported packet lengths never allocate a ghost',async()=>{
 const f=await pair();f.receiver.peers.set('p2',{tr:1000});
 for(const length of [0,1,26,28,29,31,34]){
  const e=f.packets[3].slice(0,length);while(e.length<length)e.push(0);
  assert.equal(f.remote.validFidelityRollerUnitPacket(e),false);assert.equal(f.remote.projectiles.ghostProjectile(f.ghost,e),null);f.receiver._play('p2',e);assert.equal(f.remote.projectiles.list.length,0);
 }
 for(const id of ['missing','__proto__','constructor']){const e=[...f.packets[3]];e[4]=id;e[33]=-1;assert.equal(f.remote.projectiles.ghostProjectile(f.ghost,e),null);}
 assert.equal(f.receiver.peers.get('p2')._lastProjectileId,undefined);
});

test('pre-Kit33-slot birth retains its explicit immutable unit through the actual receiver',async()=>{
 for(const vertical of [false,true]){
  const f=await pair({vertical}),legacy=f.packets.map(e=>{const p=[...e];p.splice(27,3);return p;});
  assert.ok(legacy.every(e=>e.length===33));const ghosts=replay(f,legacy);
  assert.equal(ghosts.length,f.births.length);
  for(let i=0;i<ghosts.length;i++){
   assert.equal(legacy[i][30],f.births[i].fidelityRollerUnitIndex);
   assert.equal(ghosts[i].fidelityRollerUnitIndex,f.births[i].fidelityRollerUnitIndex);
   assert.equal(ghosts[i]._netId,f.births[i]._netId);assert.equal(ghosts[i].seed,f.births[i].seed);assert.equal(ghosts[i].s3Vertical,vertical);
   assert.deepEqual(plain(ghosts[i].fidelityPlayerCollision),plain(f.births[i].fidelityPlayerCollision));
  }
  for(const event of f.receiver.peers.get('p2').events)f.receiver._play('p2',event);assert.equal(ghosts.length,f.births.length);
  f.local.G.time=1000.1;f.sender.out.length=0;f.sender._rec(['pe',f.actor.nid,f.births[0]._netId,0]);
  f.receiver.onMessage('p2',{k:'t',ts:1000.1,u:60006,r:2,e:plain(f.sender.out)});
  const terminal=f.receiver.peers.get('p2').events.find(e=>e[1]==='pe');assert.ok(terminal);f.receiver._play('p2',terminal);
  assert.equal(ghosts[0]._netEnded,true,'terminal event binds the original legacy birth identity');assert.equal(ghosts[1]._netEnded,false);
 }
});
