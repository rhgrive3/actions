import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
async function pair({vertical=true,speed=4,yaw=0}={}){
 const local=await fixture(),remote=await fixture();
 const sender=local.makeNetMatch(local.makeSession('p2','p2')),receiver=remote.makeNetMatch(remote.makeSession());
 const actor=local.makeActor({nid:7,owner:'p2',remote:false,vertical}),ghost=remote.makeActor({nid:7,owner:'p2',remote:true,vertical:!vertical});
 actor.yaw=yaw;actor.vel.set(Math.sin(yaw)*speed,0,Math.cos(yaw)*speed);actor.aimPitch=.05;local.bind(sender,[actor]);remote.bind(receiver,[ghost]);local.G.time=1;
 local.projectiles.fireFlick(actor,actor.weapon);
 const births=[...local.projectiles.list],packets=plain(sender.out.filter(e=>e[1]==='p'));
 // Receive-time actor motion/mode/weapon must not select a birth's collider.
 ghost.vel.set(99,0,-99);ghost.weapon=remote.WEAPONS.shooter;
 return {local,remote,sender,receiver,actor,ghost,births,packets};
}
function replay(f,packets=f.packets){f.receiver.onMessage('p2',{k:'t',ts:1000,u:60,r:packets[0]?.length>=32?2:undefined,e:plain(packets)});const peer=f.receiver.peers.get('p2');for(const e of peer.events)f.receiver._play('p2',e);return f.remote.projectiles.list;}
test('new birth unit preserves all Roller collider records across forward/backward motion and later owner changes',async()=>{
 for(const vertical of [false,true])for(const speed of [-6,0,4,6])for(const yaw of [0,.7]){
  const f=await pair({vertical,speed,yaw}),ghosts=replay(f);assert.equal(ghosts.length,f.births.length);
  for(let i=0;i<ghosts.length;i++){
   const p=f.births[i],q=ghosts[i],e=f.packets[i];assert.equal(e.length,36);assert.equal(e[30],vertical?1:0);assert.equal(e[31],p.seed);assert.equal(e[32],p._netId);assert.equal(e[33],p.fidelityRollerUnitIndex);assert.equal(e[34],60);assert.equal(e[35],i+1);
   assert.equal(q._netBornTick,60);assert.equal(q.fidelityRollerUnitIndex,p.fidelityRollerUnitIndex);assert.deepEqual(plain(q.fidelityPlayerCollision),plain(p.fidelityPlayerCollision));assert.deepEqual(plain(q.fidelityFieldCollision),plain(p.fidelityFieldCollision));
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
