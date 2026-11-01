import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {nativeSprinklerSource} from '../../network-replication/tests/native-sprinkler-source-fixture.mjs';
const extraExports="export {Transport} from './inkwave-public/src/net/transport.js'; export {kitBombContact} from './patches/splatoon3/runtime/kit-subs.mjs';";
async function setup(){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};return f;}
function deploy(f,a){a.weapon={...a.weapon,sub:'sprinkler'};a.weaponRunner.reset();f.G.projectiles.throwBomb(a);const b=f.G.projectiles.bombs.at(-1);assert.ok(b);f.kitBombContact(f.SUB,b,{hit:true,point:new f.THREE.Vector3(0,0,0),normal:new f.THREE.Vector3(0,1,0)});return b;}
function round(f,a,b,damage=10,ghost=false){return {owner:a,team:a.team,damage,ghost,size:.01,prev:b.pos.clone().add(new f.THREE.Vector3(0,0,-1)),pos:b.pos.clone().add(new f.THREE.Vector3(0,0,1))};}
for(const wear of [false,true])test(`native Sprinkler is damaged once and retires without explosion, gear ${wear}`,async()=>{
 const f=await setup(),owner=f.make(),a=f.make();a.team=1;a.s3.loadout[2].main=wear?'objectShredder':'runSpeed';f.G.actors=[owner,a];const b=deploy(f,owner);assert.equal(b.s3Mode,'sprinkling');
 const p=round(f,a,b),c=f.G.projectiles.kitBarrierCandidate(p,p.prev,p.pos);assert.equal(c.kind,'native-sprinkler');c.onHit();assert.equal(b.s3DeviceHP,wear?20:110);c.onHit();assert.equal(b.s3DeviceHP,wear?20:110);
 const ghost=round(f,a,b,120,true),gc=f.G.projectiles.kitBarrierCandidate(ghost,ghost.prev,ghost.pos);gc.onHit();assert.equal(b.s3DeviceHP,wear?20:110);
 const end=round(f,a,b,120),ec=f.G.projectiles.kitBarrierCandidate(end,end.prev,end.pos);ec.onHit();assert.equal(b.s3DeviceHP,0);assert.equal(b.s3Destroyed,true);
 let explosions=0;const explode=f.G.projectiles._explodeBomb;f.G.projectiles._explodeBomb=function(...args){explosions++;return explode.apply(this,args);};f.G.projectiles.update(1/60);assert.equal(f.G.projectiles.bombs.includes(b),false);assert.equal(explosions,0);
});

test('native bomb AoE uses the source object-rate row and applies Object Shredder once',async()=>{
 const f=await setup(),owner=f.make(),a=f.make();owner.team=1;a.team=0;f.G.actors=[owner,a];const b=deploy(f,owner),center=b.pos.clone();
 const blast=(cause,amount=1)=>f.G.projectiles.s3DamageSubObjects(a,center,2,()=>amount,cause);
 assert.equal(blast('Bomb'),true);assert.equal(b.s3DeviceHP,118,'Bomb row is 2x against Sprinkler');
 b.s3DeviceHP=120;a.s3.loadout[2].main='objectShredder';
 assert.equal(blast('Bomb'),true);assert.equal(b.s3DeviceHP,100,'Bomb row 2x and Object Shredder 10x are each applied once');
 b.s3DeviceHP=120;a.s3.loadout[2].main='runSpeed';
 assert.equal(blast('Default'),true);assert.equal(b.s3DeviceHP,119,'generic row remains 1x');
});

test('native Sprinkler AoE keeps Vac frame damage and Wail pierces LOS with its source row',async()=>{
 const f=await setup(),owner=f.make(),a=f.make();owner.team=1;a.team=0;f.G.actors=[owner,a];const b=deploy(f,owner),center=b.pos.clone();
 b.s3DeviceHP=120;
 f.G.physics.los=()=>false;
 f.G.projectiles.s3DamageSubObjects(a,center,2,()=>2,'BlowerInhale');assert.equal(b.s3DeviceHP,120,'blocked Vac LOS does not reach the device');
 f.G.projectiles.s3DamageSubObjects(a,center,2,(_d,object)=>{assert.equal(object.subId,'sprinkler');return 2;},'BlowerInhale',{pierceLOS:true});
 assert.equal(b.s3DeviceHP,118,'Vac applies its raw 2 HP per frame once');
 b.s3DeviceHP=120;
 f.G.projectiles.s3DamageSubObjects(a,center,2,()=>3.5,'MicroLaser',{pierceLOS:true});
 assert.equal(b.s3DeviceHP,116.5,'Wail reaches through blocked LOS and its source row is nonzero');
});

function bind(f,myId,{ownerId=301,attackerId=302,ownerName='defender',attackerName='attacker',ownerLife=3,attackerLife=7,match='native-devices'}={}){const owner=f.make(),a=f.make();Object.assign(owner,{nid:ownerId,owner:ownerName,netLife:ownerLife});Object.assign(a,{nid:attackerId,owner:attackerName,netLife:attackerLife,team:1});owner.weapon={...owner.weapon,sub:'sprinkler'};owner.weaponRunner.reset();a.s3.loadout[2].main='objectShredder';const packets=[],tr=new f.Transport();tr.ws={readyState:1,bufferedAmount:0,send(text){if(text.startsWith('b|'))packets.push(JSON.parse(text.slice(2)));}};const nm=new f.NetMatch({myId,hostId:ownerName,isHost:myId===ownerName,tr},{id:match});nm.bind({actors:[owner,a],state:'playing',time:180});f.G.netm=nm;f.G.match=nm.match;return {owner,a,nm,packets};}
const nativeHit=e=>e?.[1]==='ac'&&e[5]?.phase==='nativeObjectHit';
test('native Sprinkler birth and damage survive real JSON transport; only target owner destroys and retires the ghost',async t=>{
 const x=await nativeSprinklerSource(t,{shredder:true}),{target}=x;
 assert.ok(target.s3DeviceBirth);assert.equal(target.s3DeviceBirth.life,x.owner.netLife);
 const tx=await setup(),s=bind(tx,'peer',{ownerId:x.owner.nid,attackerId:x.attacker.nid,ownerName:'me',attackerName:'peer',ownerLife:0,attackerLife:0,match:x.nm.cfg.id});
 t.after(()=>s.nm.dispose());
 s.nm._play('me',JSON.parse(JSON.stringify(x.targetBirth)));const ghost=tx.G.projectiles.bombs.find(b=>b.owner===s.owner);
 assert.ok(ghost?.ghost);assert.deepEqual(JSON.parse(JSON.stringify(ghost.s3DeviceBirth)),JSON.parse(JSON.stringify(target.s3DeviceBirth)));
 tx.kitBombContact(tx.SUB,ghost,{hit:true,point:new tx.THREE.Vector3(target.pos.x,target.pos.y,target.pos.z),normal:new tx.THREE.Vector3(0,1,0)});
 assert.equal(target.s3DeviceHP,120,'the actual firing peer did not own remote HP');assert.equal(ghost.s3DeviceHP,120);
 const wire=structuredClone(x.claims[0]);assert.ok(wire);assert.ok(wire[5].damage>0);assert.equal(wire[5].objectShredder,true);
 assert.equal(wire[5].damage,x.sourceContacts[0].damage,'JSON retains native source damage');
 x.nm._play('foreign',structuredClone(wire));assert.equal(target.s3DeviceHP,120);
 for(const packet of x.packets)x.deliver(packet);
 assert.equal(target.s3DeviceHP,0);assert.equal(target.s3Destroyed,true);
 const states=x.nm.out.filter(e=>e[1]==='ac'&&e[5].phase==='nativeObjectState');assert.equal(states.length,1);
 x.nm._play('peer',structuredClone(wire));assert.equal(x.nm.out.filter(e=>e[1]==='ac'&&e[5].phase==='nativeObjectState').length,1);
 s.nm._play('me',JSON.parse(JSON.stringify(states[0])));assert.equal(ghost.s3Destroyed,true);assert.equal(ghost.s3DeviceHP,0);
 tx.G.projectiles.update(1/60);x.f.projectiles.update(1/60);assert.equal(tx.G.projectiles.bombs.includes(ghost),false);assert.equal(x.f.projectiles.bombs.includes(target),false);
});

test('remote native Sprinkler AoE proposal carries raw damage and source row for owner-side scaling',async t=>{
 const x=await nativeSprinklerSource(t,{kind:'sub',id:'bomb',frames:240,shredder:true});
 assert.equal(x.target.s3DeviceHP,120,'the attacking peer does not write native HP');
 const event=structuredClone(x.claims[0][5]);assert.ok(event.damage>0);assert.equal(event.damage,x.sourceContacts[0].damage);
 assert.equal(event.cause,'Bomb');assert.equal(event.objectShredder,true);assert.equal(event.rate,undefined);
 for(const packet of x.packets)x.deliver(packet);
 assert.equal(x.target.s3DeviceHP,0,'owner applies the real native Bomb source row and admitted Object Shredder once');assert.equal(x.target.s3Destroyed,true);
});

test('native device proposals reject stale birth/life, wrong match, distant hit, numeric gear and forged owner state',async t=>{
 const f=await setup(),r=bind(f,'defender'),b=deploy(f,r.owner),proof=b.s3DeviceBirth;
 const base={v:1,phase:'nativeObjectHit',subId:'sprinkler',actor:r.a,life:7,eventSeq:1,match:proof.match,targetOwnerId:301,targetLife:3,targetSeq:proof.seq,damage:10,objectShredder:true,x:b.pos.x,y:b.pos.y,z:b.pos.z};
 for(const delta of [{life:6},{match:'other'},{targetSeq:proof.seq+1},{targetLife:4},{targetOwnerId:999},{x:100},{damage:Infinity},{damage:0},{damage:2201},{eventSeq:0}]){
  assert.equal(f.installedRuntime.replaySub({...base,...delta}),false);assert.equal(b.s3DeviceHP,120);
 }
 assert.equal(f.installedRuntime.replaySub({...base,objectShredder:10}),false);assert.equal(b.s3DeviceHP,120,'an unauthenticated numeric-gear payload is not a native source');
 assert.equal(f.installedRuntime.replaySub({...base,objectShredder:true}),false,'a bare payload cannot become powered');assert.equal(b.s3DeviceHP,120);
 assert.equal(f.installedRuntime.replaySub({...base,eventSeq:2,phase:'nativeObjectState',hp:0,destroyed:true}),false,'the attacker cannot impersonate object owner');assert.equal(b.s3Destroyed,undefined);
 const x=await nativeSprinklerSource(t);
 for(const packet of x.packets)x.deliver(packet,rows=>rows.map(e=>{if(nativeHit(e))e[5].objectShredder=10;return e;}));
 assert.equal(x.target.s3DeviceHP,120-x.claims[0][5].damage,'a proved native hit is accepted, and the numeric multiplier is ignored');
 const hp=x.target.s3DeviceHP,replay=structuredClone(x.claims[0]);replay[5].objectShredder=true;
 x.nm._play('peer',replay);assert.equal(x.target.s3DeviceHP,hp,'the same native hit cannot be reinterpreted as powered');
});

test('native device birth wrapper restores recorder after exception and creates no second object authority',async()=>{
 const f=await setup(),r=bind(f,'defender'),b=deploy(f,r.owner);assert.equal((f.G.projectiles._s3SubObjects||[]).filter(o=>o.subId==='sprinkler').length,0);
 const rec=()=>{throw Error('recorder failure');};r.nm._rec=rec;assert.throws(()=>r.nm.recBomb(b),/recorder failure/);assert.equal(r.nm._rec,rec);
});

test('old native hit cannot replay in a fresh envelope after more than 1024 accepted proposals',async t=>{
 const spacing=6,x=await nativeSprinklerSource(t,{mainShots:1026,mainShotSpacing:spacing,frames:1026*spacing+30}),{target}=x,packets=x.packets.slice();
 assert.equal(spacing/60,x.attacker.weapon.fireInterval,'native Main emitters respect the sourced firing interval');
 assert.equal(x.claims.length,1026,'every proposal has a distinct real native projectile source');
 const birth=target.s3DeviceBirth,position=target.pos.clone();let hp=target.s3DeviceHP,accepted=0;
 Object.defineProperty(target,'s3DeviceHP',{configurable:true,get:()=>hp,set(value){if(value<hp)accepted++;hp=value;}});
 for(const packet of packets){
  // Canonical Main damage cannot fit 1026 times into a 120-HP device. Restore
  // only fixture HP between packets, keeping birth, pose and all native source
  // receipts unchanged. The native emitter respects fireInterval; the restored
  // target HP is an explicit ledger-capacity fixture, not gameplay healing.
  if(packet.e?.some(nativeHit))target.s3DeviceHP=120;
  x.deliver(packet,null,{freshSequences:false});
  // Replay the receiver's ordinary fixed steps too: leaving every visual ghost
  // alive would measure ghost-allocation pressure, not the application ledger.
  const peer=x.nm.peers.get('peer');
  for(let step=2;step>=0;step--){peer.sim=packet.u-step;x.f.G.time=peer.sim/60;x.f.clock.set(packet.ts-step/60);x.f.projectiles.update(1/60);}
  assert.notEqual(target.s3Destroyed,true);assert.equal(target.s3DeviceBirth,birth);assert.ok(target.pos.equals(position));
  // Owner-state output is a bounded live queue, so drain it just as the source
  // writer drained its actual projectile/hit events throughout generation.
  if(x.nm.out.length)assert.equal(x.nm._sendTick(),true);
 }
 assert.equal(accepted,1026,'all 1026 native proposals were accepted before replay');
 const before=target.s3DeviceHP;assert.ok(before>0&&before<120);
 const first=structuredClone(x.claims[0]);first[first.length-1]+=10000;first[first.length-2]+=10000;first[0]+=10;
 x.nm._play('peer',first);assert.equal(target.s3DeviceHP,before,'application id remains spent even after old transport envelopes are evicted');
 const replacement=new x.f.Actor({team:1,name:'peer',weapon:'shooter',CharacterClass:x.attacker.character.constructor});replacement.character.actor=replacement;
 Object.assign(replacement,{nid:x.attacker.nid,owner:'peer',netLife:x.attacker.netLife,team:1,remote:true});x.nm.byNid.set(replacement.nid,replacement);
 first[first.length-1]+=10000;first[first.length-2]+=10000;first[0]+=10;x.nm._play('peer',first);
 assert.equal(target.s3DeviceHP,before,'same owner/nid/life cannot reset the application ledger by rebinding Actor');assert.equal(accepted,1026);
});

test('real tick ingress sorts reordered native proposals before the monotone application gate',async t=>{
 const x=await nativeSprinklerSource(t,{mainShots:3}),out=[];assert.equal(x.claims.length,3);
 for(const packet of x.packets)out.push(...x.deliver(packet,rows=>[...rows].reverse(),{freshSequences:false}));
 const rows=out.filter(row=>nativeHit(row.event));
 assert.deepEqual(rows.map(row=>row.event[5].eventSeq),x.claims.map(e=>e[5].eventSeq));
 assert.equal(rows.filter(row=>row.after<row.before).length,3,'all three actual native projectiles survive reordered tick playback');
 assert.equal(x.target.s3DeviceHP,120-x.claims.reduce((total,e)=>total+e[5].damage,0),'all three canonical source amounts reach owner HP');
});

test('native records are fresh after retirement and old-life proposals never damage the replacement Sprinkler',async()=>{
 const f=await setup(),r=bind(f,'defender'),first=deploy(f,r.owner),old=JSON.parse(JSON.stringify(first.s3DeviceBirth));
 first.s3DeviceHP=0;first.s3Destroyed=true;f.G.projectiles.update(1/60);r.owner.reset();r.owner.netLife=4;r.owner.alive=true;
 const second=deploy(f,r.owner);assert.notEqual(second,first);assert.equal(second.s3Destroyed,undefined);assert.equal(second.s3DeviceHP,120);assert.equal(second.s3DeviceBirth.life,4);assert.notEqual(second.s3DeviceBirth.seq,old.seq);
 const proposal={v:1,phase:'nativeObjectHit',subId:'sprinkler',actor:r.a,life:7,eventSeq:1,match:old.match,targetOwnerId:301,targetLife:old.life,targetSeq:old.seq,damage:120,objectShredder:true,x:second.pos.x,y:second.pos.y,z:second.pos.z};
 assert.equal(f.installedRuntime.replaySub(proposal),false);assert.equal(second.s3DeviceHP,120);
});

test('empty native device collection adds no per-projectile vector allocation',async()=>{
 const f=await setup(),a=f.make(),start=new f.THREE.Vector3(),end=new f.THREE.Vector3(0,0,1),p={owner:a,team:a.team,size:.01,damage:10};
 assert.equal(f.G.projectiles.bombs.length,0);
 const clone=f.THREE.Vector3.prototype.clone;let clones=0;
 f.THREE.Vector3.prototype.clone=function(){clones++;return clone.call(this);};
 try{for(let i=0;i<1000;i++)assert.equal(f.G.projectiles.kitBarrierCandidate(p,start,end),null);}
 finally{f.THREE.Vector3.prototype.clone=clone;}
 assert.equal(clones,0,'no candidate geometry is allocated when no native device exists');
});

test('nonempty bombs without an eligible deployed enemy Sprinkler allocate no candidate geometry',async()=>{
 const f=await setup(),owner=f.make(),attacker=f.make();attacker.team=1;
 const b=deploy(f,owner),P=f.G.projectiles,start=b.pos.clone().add(new f.THREE.Vector3(0,0,-1)),end=b.pos.clone().add(new f.THREE.Vector3(0,0,1));
 const p={owner:attacker,team:attacker.team,size:.01,damage:10};
 for(const state of ['ordinary','flight','destroyed','friendly','same-owner']){
  b.s3Resolved={...b.s3Resolved,spec:{...b.s3Resolved.spec,id:state==='ordinary'?'bomb':'sprinkler'}};b.s3Mode=state==='flight'?'flight':'sprinkling';b.s3Destroyed=state==='destroyed';b.team=state==='friendly'?attacker.team:owner.team;b.owner=state==='same-owner'?attacker:owner;
  const clone=f.THREE.Vector3.prototype.clone;let clones=0;f.THREE.Vector3.prototype.clone=function(){clones++;return clone.call(this);};
  try{for(let i=0;i<100;i++)assert.equal(P.nativeSprinklerCandidate(p,start,end),null);}
  finally{f.THREE.Vector3.prototype.clone=clone;}
  assert.equal(clones,0,state+' cannot need a segment or contact vector');
 }
 b.s3Resolved={...b.s3Resolved,spec:{...b.s3Resolved.spec,id:'sprinkler'}};b.s3Mode='sprinkling';b.s3Destroyed=false;b.team=owner.team;b.owner=owner;
 const hit=P.nativeSprinklerCandidate(p,start,end);assert.ok(hit,'the same real deployed object remains hittable');hit.onHit();assert.equal(b.s3DeviceHP,110);hit.onHit();assert.equal(b.s3DeviceHP,110);
 f.G.projectiles.clear();
});
